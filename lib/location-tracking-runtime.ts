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

export type HeadlessTrackingAdoption<T extends TrackingLifecycleState> =
  | { kind: "ADOPTED"; state: T; bearerToken: string }
  | { kind: "NO_ADOPTABLE_SESSION" }
  | { kind: "NO_CREDENTIAL" }
  | { kind: "INACTIVE" };

/**
 * Gives the TaskManager entrypoint a privacy-safe reason without exposing a
 * token or assigning a pre-adoption callback to an arbitrary session.
 */
export async function adoptHeadlessTrackingWithCredentialResult<T extends TrackingLifecycleState>(params: {
  lifecycle: TrackingLifecycleCoordinator<T>;
  getBearerToken: () => Promise<string | null>;
  isActive?: () => boolean;
}): Promise<HeadlessTrackingAdoption<T>> {
  const isActive = params.isActive ?? (() => true);
  if (!isActive()) return { kind: "INACTIVE" };
  const state = await params.lifecycle.adoptStoredForHeadlessTask(isActive);
  if (!state) return isActive() ? { kind: "NO_ADOPTABLE_SESSION" } : { kind: "INACTIVE" };
  const bearerToken = await params.getBearerToken();
  if (!isActive()) return { kind: "INACTIVE" };
  if (!bearerToken) return { kind: "NO_CREDENTIAL" };
  if (!(await params.lifecycle.isCurrent(state, undefined, isActive))) return { kind: "INACTIVE" };
  return { kind: "ADOPTED", state, bearerToken };
}

export async function adoptHeadlessTrackingWithCredential<T extends TrackingLifecycleState>(params: {
  lifecycle: TrackingLifecycleCoordinator<T>;
  getBearerToken: () => Promise<string | null>;
  isActive?: () => boolean;
}): Promise<{ state: T; bearerToken: string } | null> {
  const result = await adoptHeadlessTrackingWithCredentialResult(params);
  return result.kind === "ADOPTED"
    ? { state: result.state, bearerToken: result.bearerToken }
    : null;
}

/** Exporting the adapter type keeps the integration contract explicit without native imports. */
export type HeadlessTrackingLifecycleAdapter<T extends TrackingLifecycleState> = TrackingLifecycleAdapter<T>;
