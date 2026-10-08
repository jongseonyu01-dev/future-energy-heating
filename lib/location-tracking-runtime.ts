/**
 * Headless TaskManager adoption boundary shared by the real foreground-service
 * task and deterministic regressions. It never starts a native service; Android
 * owns the already-running service. Server-side update authorization verifies
 * the bearer belongs to the persisted technician/session before accepting data.
 */
import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "@/lib/location-tracking-lifecycle";

export async function adoptHeadlessTrackingWithCredential<T extends TrackingLifecycleState>(params: {
  lifecycle: TrackingLifecycleCoordinator<T>;
  getBearerToken: () => Promise<string | null>;
  isActive?: () => boolean;
}): Promise<{ state: T; bearerToken: string } | null> {
  const isActive = params.isActive ?? (() => true);
  if (!isActive()) return null;
  const state = await params.lifecycle.adoptStoredForHeadlessTask(isActive);
  if (!state) return null;
  const bearerToken = await params.getBearerToken();
  if (!isActive() || !bearerToken || !(await params.lifecycle.isCurrent(state, undefined, isActive))) return null;
  return { state, bearerToken };
}

/** Exporting the adapter type keeps the integration contract explicit without native imports. */
export type HeadlessTrackingLifecycleAdapter<T extends TrackingLifecycleState> = TrackingLifecycleAdapter<T>;
