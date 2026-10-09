import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { AuthSessionTransition } from "../lib/auth-session-transition";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("authentication transition generation", () => {
  it("does not let a delayed restore A overwrite a newer interactive login B", async () => {
    const transitions = new AuthSessionTransition();
    const restoreA = transitions.begin();
    const verifyA = deferred<boolean>();
    let visibleUser: string | null = null;
    let bearer: string | null = null;
    let persistedUser: string | null = null;

    const restore = (async () => {
      await verifyA.promise;
      const result = await transitions.runStorage(restoreA, async () => {
        bearer = "A";
        persistedUser = "A";
      });
      if (result.applied) visibleUser = "A";
    })();

    const loginB = transitions.begin();
    const committedB = await transitions.runStorage(loginB, async () => {
      bearer = "B";
      persistedUser = "B";
    });
    if (committedB.applied) visibleUser = "B";

    verifyA.resolve(true);
    await restore;

    expect(visibleUser).toBe("B");
    expect(bearer).toBe("B");
    expect(persistedUser).toBe("B");
  });

  it("revokes an externally captured recovery guard as soon as logout or account replacement begins", () => {
    const transitions = new AuthSessionTransition();
    const activeA = transitions.begin();
    const capturedForPermissionResume = transitions.capture();

    expect(capturedForPermissionResume).toBe(activeA);
    expect(transitions.isCurrent(capturedForPermissionResume)).toBe(true);

    // This is synchronous: it must not wait for React user=null, storage
    // cleanup, native stop, or a later effect before old A loses authority.
    transitions.begin();
    expect(transitions.isCurrent(capturedForPermissionResume)).toBe(false);
  });

  it("rolls back a failed B persistence instead of exposing B to the UI or bearer storage", async () => {
    const transitions = new AuthSessionTransition();
    const loginB = transitions.begin();
    let visibleUser: string | null = null;
    let bearer: string | null = null;
    const clear = vi.fn(async () => {
      bearer = null;
      visibleUser = null;
    });

    await expect(
      transitions.runStorage(loginB, async () => {
        bearer = "B";
        throw new Error("AsyncStorage write failed");
      }),
    ).rejects.toThrow("AsyncStorage write failed");

    if (transitions.isCurrent(loginB)) await clear();
    expect(visibleUser).toBeNull();
    expect(bearer).toBeNull();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("cancels and clears an old schedule query before a new session can use its key", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = [["repair", "listMySchedule"], { type: "query" }];
    const oldResponse = deferred<string[]>();

    const oldRequest = queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => new Promise<string[]>((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("cancelled")));
        oldResponse.promise.then(resolve);
      }),
    }).catch(() => undefined);

    await Promise.resolve();
    await queryClient.cancelQueries();
    queryClient.clear();
    queryClient.setQueryData(key, ["B-only schedule"]);

    oldResponse.resolve(["A-only schedule"]);
    await oldRequest;
    await Promise.resolve();

    expect(queryClient.getQueryData(key)).toEqual(["B-only schedule"]);
  });
});
