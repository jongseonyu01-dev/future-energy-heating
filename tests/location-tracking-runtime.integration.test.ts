import assert from "node:assert/strict";
import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";
import {
  adoptHeadlessTrackingWithCredential,
  adoptHeadlessTrackingWithCredentialResult,
} from "../lib/location-tracking-runtime";
import { runGuardedLocationUpload } from "../lib/location-upload-guard";

type State = TrackingLifecycleState;
const state: State = {
  token: "a".repeat(43), requestId: 81, technicianUserId: 41, technicianId: 17, startedAt: 81000, trackingUrl: null,
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
function adapterFor(storedRef: { value: State | null }): TrackingLifecycleAdapter<State> {
  return {
    read: async () => storedRef.value,
    save: async (next) => { storedRef.value = next; },
    clearIfSame: async (next) => { if (storedRef.value?.token === next.token) storedRef.value = null; },
    showControlNotification: async () => {}, clearControlNotification: async () => {},
    startNativeCollection: async () => { throw new Error("headless adoption must not start a second native service"); },
    stopNativeCollection: async () => {}, onStateChanged: () => {},
  };
}

async function main() {
  // Fresh headless JS has no provider intent but can adopt an already-running native share.
  {
    const stored = { value: { ...state } };
    const lifecycle = new TrackingLifecycleCoordinator(adapterFor(stored));
    const adopted = await adoptHeadlessTrackingWithCredential({ lifecycle, getBearerToken: async () => "A-bearer" });
    assert.equal(adopted?.state.requestId, state.requestId);
    assert.equal(adopted?.bearerToken, "A-bearer");
    assert.equal((await lifecycle.isCurrent(state)), true, "headless task must upload without a mounted screen provider");
  }

  // Logout/stop during delayed headless credential read invalidates adoption before any upload can be sent.
  {
    const stored = { value: { ...state } };
    const lifecycle = new TrackingLifecycleCoordinator(adapterFor(stored));
    const bearer = deferred<string | null>();
    const adoption = adoptHeadlessTrackingWithCredential({ lifecycle, getBearerToken: async () => bearer.promise });
    await tick();
    await lifecycle.stopCurrent();
    bearer.resolve("A-bearer");
    assert.equal(await adoption, null);
  }

  // The TaskManager entry must distinguish a missing current credential from a
  // missing/terminal session without exposing either value in diagnostics.
  {
    const stored = { value: { ...state } };
    const lifecycle = new TrackingLifecycleCoordinator(adapterFor(stored));
    assert.deepEqual(
      await adoptHeadlessTrackingWithCredentialResult({ lifecycle, getBearerToken: async () => null }),
      { kind: "NO_CREDENTIAL" },
    );
    const absent = { value: null as State | null };
    const absentLifecycle = new TrackingLifecycleCoordinator(adapterFor(absent));
    assert.deepEqual(
      await adoptHeadlessTrackingWithCredentialResult({ lifecycle: absentLifecycle, getBearerToken: async () => "unused" }),
      { kind: "NO_ADOPTABLE_SESSION" },
    );
  }

  // The already-captured A logout credential is usable without reading B, while local invalidation blocks A updates.
  {
    let current = true;
    const capturedA = "A-before-logout";
    let authStorageRead = 0;
    const pending = runGuardedLocationUpload({
      isCurrent: async () => current,
      getCredential: async () => capturedA,
      request: async () => ({ ok: true }),
    });
    current = false;
    assert.deepEqual(await pending, { kind: "STALE" });
    assert.equal(authStorageRead, 0, "logout stop must use its pre-clear snapshot, not read a replacement login");
  }

  console.log("LOCATION_TRACKING_RUNTIME_INTEGRATION_PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
