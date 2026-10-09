import assert from "node:assert/strict";

import {
  LocationTrackingOwnerReconciliationGuard,
  reconcileLocationTrackingOwner,
} from "../lib/location-tracking-owner-reconciliation";
import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";

type State = TrackingLifecycleState;
const stateA: State = { token: "a".repeat(43), requestId: 1, technicianUserId: 101, technicianId: 11, startedAt: 1000, trackingUrl: null };
const stateB: State = { token: "b".repeat(43), requestId: 2, technicianUserId: 202, technicianId: 22, startedAt: 2000, trackingUrl: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function main() {
  const persisted = { value: { ...stateA } as State | null };
  let nativeStops = 0;
  const lifecycle = new TrackingLifecycleCoordinator<State>({
    read: async () => persisted.value,
    save: async (state) => { persisted.value = state; },
    clearIfSame: async (state) => { if (persisted.value?.token === state.token) persisted.value = null; },
    showControlNotification: async () => {},
    clearControlNotification: async () => {},
    startNativeCollection: async () => {},
    stopNativeCollection: async () => { nativeStops += 1; },
    onStateChanged: () => {},
  } satisfies TrackingLifecycleAdapter<State>);

  const owner = new LocationTrackingOwnerReconciliationGuard();
  const aRead = deferred<State | null>();
  const orphanGeneration = owner.begin();
  const staleOrphanEffect = reconcileLocationTrackingOwner({
    generation: orphanGeneration,
    isCurrent: () => owner.isCurrent(orphanGeneration),
    isAuthLoading: false,
    technicianUserId: null,
    isTechnician: false,
    getPersistedState: async () => aRead.promise,
    stopExactStoredState: async (state) => { await lifecycle.stopStoredExact(state); },
    restoreForUser: async () => null,
    applyState: () => {},
    checkPermissions: async () => {},
  });

  // B authentication and its new FGS share begin while the old A storage read
  // is still pending. Starting B is the real lifecycle coordinator, not a mock.
  owner.begin();
  persisted.value = { ...stateB };
  assert.equal(await lifecycle.start(stateB), true);
  aRead.resolve({ ...stateA });
  await staleOrphanEffect;

  assert.equal(lifecycle.currentIntent()?.token, stateB.token, "late A owner reconciliation must not stop B intent");
  assert.equal(persisted.value?.token, stateB.token, "late A owner reconciliation must not clear B persistence");
  assert.equal(nativeStops, 0, "late A owner reconciliation must not stop B foreground collection");
  console.log("LOCATION_PROVIDER_OWNER_RACE_INTEGRATION_PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
