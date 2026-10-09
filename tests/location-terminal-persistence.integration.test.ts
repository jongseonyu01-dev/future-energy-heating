import assert from "node:assert/strict";

import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";
import { adoptHeadlessTrackingWithCredential } from "../lib/location-tracking-runtime";
import { runGuardedLocationUpload } from "../lib/location-upload-guard";

type State = TrackingLifecycleState;

const stateA: State = {
  token: "a".repeat(43), requestId: 401, technicianUserId: 51, technicianId: 19, startedAt: 401_000, trackingUrl: null,
};
const stateB: State = {
  token: "b".repeat(43), requestId: 402, technicianUserId: 51, technicianId: 19, startedAt: 402_000, trackingUrl: null,
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function same(left: State | null, right: State): boolean {
  return Boolean(left && left.token === right.token && left.requestId === right.requestId && left.startedAt === right.startedAt);
}

async function main() {
  // P1: terminal authority changes immediately; a stalled durable marker does
  // not let the current TaskManager runtime re-adopt A or send a follow-up HTTP.
  {
    let stored: State | null = null;
    const inactive = new Set<string>();
    const persistMarker = deferred<void>();
    const key = (state: State) => `${state.requestId}:${state.startedAt}:${state.token}`;
    const adapter: TrackingLifecycleAdapter<State> = {
      read: async () => stored,
      save: async (state) => { stored = { ...state }; },
      clearIfSame: async () => {},
      markInactive: async (state) => {
        inactive.add(key(state));
        await persistMarker.promise;
      },
      isInactive: async (state) => inactive.has(key(state)),
      showControlNotification: async () => {},
      clearControlNotification: async () => {},
      startNativeCollection: async () => {},
      stopNativeCollection: async () => {},
      onStateChanged: () => {},
    };
    const lifecycle = new TrackingLifecycleCoordinator(adapter);
    assert.equal(await lifecycle.start(stateA), true);
    assert.equal(await lifecycle.stopForTerminalResponse(stateA), stateA);
    await tick();

    const adopted = await adoptHeadlessTrackingWithCredential({
      lifecycle,
      getBearerToken: async () => "technician-bearer",
    });
    assert.equal(adopted, null, "terminal A must not be re-adopted while durable marker I/O is pending");

    let requests = 0;
    const upload = await runGuardedLocationUpload({
      isCurrent: () => lifecycle.isCurrent(stateA),
      getCredential: async () => "technician-bearer",
      request: async () => { requests += 1; return { ok: true, status: 200 }; },
    });
    assert.deepEqual(upload, { kind: "STALE" });
    assert.equal(requests, 0);
    persistMarker.resolve();
  }

  // P1: a detached A cleanup that obtained the old shared pointer must check
  // its guard immediately before removal and cannot erase B's persisted state.
  {
    let stored: State | null = { ...stateA };
    const staleRead = deferred<State | null>();
    let authorized = true;
    const guardedClear = async (state: State, guard: () => boolean) => {
      const snapshot = await staleRead.promise;
      if (!guard()) return;
      if (same(snapshot, state) && same(stored, state)) stored = null;
    };
    const pendingA = guardedClear(stateA, () => authorized);
    stored = { ...stateB };
    authorized = false;
    staleRead.resolve({ ...stateA });
    await pendingA;
    assert.equal(stored?.requestId, stateB.requestId, "late A cleanup must preserve B pointer");
  }

  console.log("LOCATION_TERMINAL_PERSISTENCE_INTEGRATION_PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
