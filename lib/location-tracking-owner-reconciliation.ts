import type { TrackingLifecycleState } from "@/lib/location-tracking-lifecycle";

/**
 * A provider effect may wait on AsyncStorage while authentication changes from
 * A → none → B. This guard identifies the current owner reconciliation so a
 * stale completion cannot apply view state or stop a replacement session.
 */
export class LocationTrackingOwnerReconciliationGuard {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

export async function reconcileLocationTrackingOwner<T extends TrackingLifecycleState>(params: {
  generation: number;
  isCurrent: () => boolean;
  isAuthLoading: boolean;
  technicianUserId: number | null | undefined;
  isTechnician: boolean;
  getPersistedState: () => Promise<T | null>;
  stopExactStoredState: (state: T) => Promise<void>;
  restoreForUser: (userId: number) => Promise<T | null>;
  applyState: (state: T | null) => void;
  checkPermissions: () => Promise<void>;
}): Promise<void> {
  if (params.isAuthLoading) return;

  if (!params.technicianUserId || !params.isTechnician) {
    const orphaned = await params.getPersistedState();
    if (!params.isCurrent()) return;
    if (orphaned) {
      await params.stopExactStoredState(orphaned);
      if (!params.isCurrent()) return;
    }
    params.applyState(null);
    return;
  }

  const restored = await params.restoreForUser(params.technicianUserId);
  if (!params.isCurrent()) return;
  params.applyState(restored);
  await params.checkPermissions();
}
