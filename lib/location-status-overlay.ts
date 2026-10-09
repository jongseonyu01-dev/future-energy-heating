import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export interface LocationStatusOverlayState {
  available: boolean;
  permission: boolean;
  visible: boolean;
  settingsOpened?: boolean;
}

type NativeStatusOverlay = {
  getStatus: () => Promise<LocationStatusOverlayState>;
  openPermissionSettings: () => Promise<LocationStatusOverlayState>;
  show: (statusText: string) => Promise<LocationStatusOverlayState>;
  updateIfVisible: (statusText: string) => Promise<LocationStatusOverlayState>;
  hide: () => Promise<LocationStatusOverlayState>;
};

function nativeOverlay(): NativeStatusOverlay | null {
  if (Platform.OS !== "android") return null;
  return requireOptionalNativeModule<NativeStatusOverlay>("FutureEnergyStatusOverlay");
}

const unavailable: LocationStatusOverlayState = { available: false, permission: false, visible: false };

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
 * Shows a non-sensitive status window. The caller must not include customer,
 * technician, address, token, coordinate, or authentication information.
 */
export async function showLocationStatusOverlay(statusText: string): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  return overlay ? overlay.show(statusText) : unavailable;
}

/** Updates only a window the technician explicitly opened; it never reopens one. */
export async function updateVisibleLocationStatusOverlay(statusText: string): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  return overlay ? overlay.updateIfVisible(statusText) : unavailable;
}

/** Hides only the optional status window; it never stops the FGS/session. */
export async function hideLocationStatusOverlay(): Promise<LocationStatusOverlayState> {
  const overlay = nativeOverlay();
  return overlay ? overlay.hide() : unavailable;
}
