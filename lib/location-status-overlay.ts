import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export interface LocationStatusOverlayState {
  available: boolean;
  permission: boolean;
  visible: boolean;
  settingsOpened?: boolean;
}

/** Non-sensitive, local-only identity. It deliberately excludes the session token. */
export type LocationStatusOverlayOwnerState = {
  requestId: number;
  technicianUserId: number;
  startedAt: number;
};

export type LocationStatusOverlayOwner = {
  ownerId: string;
  generation: number;
};

export type LocationStatusOverlayPresentation = {
  /** No customer, address, coordinate, token, or authentication information. */
  statusText: string;
  /** Server-accepted timestamp in epoch milliseconds; native code renders its age from its own clock. */
  lastStoredAt: number | null;
};

type NativeStatusOverlay = {
  getStatus: () => Promise<LocationStatusOverlayState>;
  openPermissionSettings: () => Promise<LocationStatusOverlayState>;
  activateOwner: (ownerId: string, generation: number) => Promise<LocationStatusOverlayState>;
  invalidateOwner: (ownerId: string, generation: number) => Promise<LocationStatusOverlayState>;
  show: (ownerId: string, generation: number, statusText: string, lastStoredAt: number | null) => Promise<LocationStatusOverlayState>;
  updateIfVisible: (ownerId: string, generation: number, statusText: string, lastStoredAt: number | null) => Promise<LocationStatusOverlayState>;
  hide: (ownerId: string, generation: number) => Promise<LocationStatusOverlayState>;
};

function nativeOverlay(): NativeStatusOverlay | null {
  if (Platform.OS !== "android") return null;
  return requireOptionalNativeModule<NativeStatusOverlay>("FutureEnergyStatusOverlay");
}

const unavailable: LocationStatusOverlayState = { available: false, permission: false, visible: false };
let nextOwnerGeneration = 0;
let activeOwner: LocationStatusOverlayOwner | null = null;

function ownerIdFor(state: LocationStatusOverlayOwnerState): string {
  return `${state.requestId}:${state.technicianUserId}:${state.startedAt}`;
}

function sameOwner(left: LocationStatusOverlayOwner | null, right: LocationStatusOverlayOwner | null): boolean {
  return Boolean(left && right && left.ownerId === right.ownerId && left.generation === right.generation);
}

/**
 * Claims the optional visual surface for exactly one active share. This has no
 * collection or upload side effect. A late native call with a lower generation
 * is ignored by the Kotlin module.
 */
export function activateLocationStatusOverlayOwner(
  state: LocationStatusOverlayOwnerState,
  forceNewGeneration = false,
): LocationStatusOverlayOwner {
  const ownerId = ownerIdFor(state);
  if (activeOwner?.ownerId === ownerId && !forceNewGeneration) return activeOwner;
  const next = { ownerId, generation: ++nextOwnerGeneration };
  activeOwner = next;
  return next;
}

/** Applies an already-claimed owner to native before a show/update operation. */
export async function synchronizeLocationStatusOverlayOwner(owner: LocationStatusOverlayOwner): Promise<boolean> {
  const overlay = nativeOverlay();
  if (!overlay || !isCurrentLocationStatusOverlayOwner(owner)) return false;
  await overlay.activateOwner(owner.ownerId, owner.generation);
  return isCurrentLocationStatusOverlayOwner(owner);
}

export function getLocationStatusOverlayOwner(state: LocationStatusOverlayOwnerState | null | undefined): LocationStatusOverlayOwner | null {
  if (!state || activeOwner?.ownerId !== ownerIdFor(state)) return null;
  return activeOwner;
}

export function isCurrentLocationStatusOverlayOwner(owner: LocationStatusOverlayOwner | null | undefined): boolean {
  return sameOwner(activeOwner, owner ?? null);
}

/**
 * Synchronously revokes this share's visual authority before local native stop
 * cleanup starts. It cannot hide a replacement B because Kotlin checks both
 * owner ID and monotonic generation.
 */
export function invalidateLocationStatusOverlayOwner(state: LocationStatusOverlayOwnerState): void {
  if (activeOwner?.ownerId !== ownerIdFor(state)) return;
  const previous = activeOwner;
  activeOwner = null;
  const invalidationGeneration = ++nextOwnerGeneration;
  void nativeOverlay()?.invalidateOwner(previous.ownerId, invalidationGeneration).catch(() => undefined);
}

/** Used only before a cold stop has resolved its stored state. A later B claim has a newer generation. */
export function invalidateActiveLocationStatusOverlayOwner(): void {
  const previous = activeOwner;
  if (!previous) return;
  activeOwner = null;
  const invalidationGeneration = ++nextOwnerGeneration;
  void nativeOverlay()?.invalidateOwner(previous.ownerId, invalidationGeneration).catch(() => undefined);
}

export async function getLocationStatusOverlayState(): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  return overlay ? overlay.getStatus() : unavailable;
}

/** Opens Android Special app access only after the technician explicitly chooses the optional status window. */
export async function requestLocationStatusOverlayPermission(): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  return overlay ? overlay.openPermissionSettings() : unavailable;
}

/**
 * Shows an explicitly requested, non-sensitive status window only if its exact
 * owner/generation is still live after every await boundary.
 */
export async function showLocationStatusOverlay(
  owner: LocationStatusOverlayOwner,
  presentation: LocationStatusOverlayPresentation,
): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  if (!overlay || !isCurrentLocationStatusOverlayOwner(owner)) return unavailable;
  const result = await overlay.show(owner.ownerId, owner.generation, presentation.statusText, presentation.lastStoredAt);
  return isCurrentLocationStatusOverlayOwner(owner) ? result : unavailable;
}

/** Updates only a window the technician explicitly opened; it never reopens one. */
export async function updateVisibleLocationStatusOverlay(
  owner: LocationStatusOverlayOwner,
  presentation: LocationStatusOverlayPresentation,
): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  if (!overlay || !isCurrentLocationStatusOverlayOwner(owner)) return unavailable;
  const result = await overlay.updateIfVisible(owner.ownerId, owner.generation, presentation.statusText, presentation.lastStoredAt);
  return isCurrentLocationStatusOverlayOwner(owner) ? result : unavailable;
}

/** Hides only the optional window for its exact owner; it never stops the FGS/session. */
export async function hideLocationStatusOverlay(owner: LocationStatusOverlayOwner): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  if (!overlay) return unavailable;
  return overlay.hide(owner.ownerId, owner.generation);
}
