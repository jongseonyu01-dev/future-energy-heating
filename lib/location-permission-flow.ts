export type PermissionStatusLike = {
  status?: unknown;
  granted?: boolean | null;
  ios?: unknown;
};

export type LocationPermissionFlowResult = {
  /** Foreground + background location are both granted. */
  granted: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  notificationGranted: boolean;
  message?: string;
};

export type LocationPermissionFlowDependencies = {
  requestForeground: () => Promise<PermissionStatusLike>;
  requestBackground: () => Promise<PermissionStatusLike>;
  requestNotifications: () => Promise<PermissionStatusLike>;
  /**
   * Called after foreground access succeeds and before Android 11+ may open
   * Settings for the special background-location choice. The caller owns UI.
   */
  confirmBackgroundAccess?: () => Promise<boolean>;
  isProvisionalNotification?: (result: PermissionStatusLike) => boolean;
};

/**
 * A background/headless runtime must never open permission UI. This result
 * distinguishes an actual denial from a platform-query failure so the caller
 * can locally fence the exact saved share and show the normal foreground UI
 * only after the technician opens the app.
 */
export type ExistingLocationTrackingPermissionEligibility = {
  eligible: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  /** `unavailable` means the native permission state could not be verified. */
  status: "granted" | "denied" | "unavailable";
};

export type ExistingLocationTrackingPermissionDependencies = {
  getForeground: () => Promise<PermissionStatusLike>;
  getBackground: () => Promise<PermissionStatusLike>;
};

/** A server location session may be created only after every required gate succeeds. */
export function canStartLocationTrackingSession(result: LocationPermissionFlowResult): boolean {
  return result.granted && result.foregroundGranted && result.backgroundGranted && result.notificationGranted;
}

function isGranted(result: PermissionStatusLike): boolean {
  return result.granted === true || result.status === "granted";
}

/**
 * Reads already-granted location access without presenting Settings or any
 * prompt. It is used before a persisted share restores/re-registers native
 * collection and immediately before a headless callback may upload.
 */
export async function readExistingLocationTrackingPermissionEligibility(
  dependencies: ExistingLocationTrackingPermissionDependencies,
): Promise<ExistingLocationTrackingPermissionEligibility> {
  try {
    const [foreground, background] = await Promise.all([
      dependencies.getForeground(),
      dependencies.getBackground(),
    ]);
    const foregroundGranted = isGranted(foreground);
    const backgroundGranted = isGranted(background);
    return {
      eligible: foregroundGranted && backgroundGranted,
      foregroundGranted,
      backgroundGranted,
      status: foregroundGranted && backgroundGranted ? "granted" : "denied",
    };
  } catch {
    return {
      eligible: false,
      foregroundGranted: false,
      backgroundGranted: false,
      status: "unavailable",
    };
  }
}

/**
 * The Android/Expo background task contract requires both foreground and
 * background location access. This flow deliberately does not start a
 * tracking session or make any network request; callers must finish this
 * gate before creating the server session.
 */
export async function requestBackgroundLocationPermissionFlow(
  dependencies: LocationPermissionFlowDependencies,
): Promise<LocationPermissionFlowResult> {
  const foreground = await dependencies.requestForeground();
  const foregroundGranted = isGranted(foreground);
  if (!foregroundGranted) {
    return {
      granted: false,
      foregroundGranted: false,
      backgroundGranted: false,
      notificationGranted: false,
      message: "위치 공유를 위해 위치 권한을 허용해 주세요.",
    };
  }

  if (dependencies.confirmBackgroundAccess) {
    const confirmed = await dependencies.confirmBackgroundAccess();
    if (!confirmed) {
      return {
        granted: false,
        foregroundGranted: true,
        backgroundGranted: false,
        notificationGranted: false,
        message: "다른 앱·잠금 화면에서도 위치를 공유하려면 ‘항상 허용’이 필요합니다.",
      };
    }
  }

  const background = await dependencies.requestBackground();
  const backgroundGranted = isGranted(background);
  if (!backgroundGranted) {
    return {
      granted: false,
      foregroundGranted: true,
      backgroundGranted: false,
      notificationGranted: false,
      message: "다른 앱·잠금 화면에서도 위치를 공유하려면 Android 설정에서 위치 권한을 ‘항상 허용’으로 바꿔 주세요.",
    };
  }

  const notification = await dependencies.requestNotifications();
  const notificationGranted = isGranted(notification)
    || dependencies.isProvisionalNotification?.(notification) === true;
  if (!notificationGranted) {
    return {
      granted: true,
      foregroundGranted: true,
      backgroundGranted: true,
      notificationGranted: false,
      message: "위치 공유 상태와 중지 버튼을 표시하려면 알림 권한을 허용해 주세요.",
    };
  }

  return {
    granted: true,
    foregroundGranted: true,
    backgroundGranted: true,
    notificationGranted: true,
  };
}
