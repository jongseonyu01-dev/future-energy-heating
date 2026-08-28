export interface LocalTrackingStartupResult {
  ok: boolean;
  error?: string;
}

interface LocalTrackingStartupDependencies<TLocation> {
  persistSession: () => Promise<void>;
  startNativeTracking: () => Promise<void>;
  getCurrentLocation: () => Promise<TLocation | null>;
  sendCurrentLocation: (location: TLocation) => Promise<boolean>;
  requireCurrentLocation?: boolean;
  requireSuccessfulSend?: boolean;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * A server departure is already committed before this runs, so every local
 * startup failure must be returned explicitly instead of being mistaken for a
 * successful departure.
 */
export async function startNativeTrackingAndSendInitialLocation<TLocation>(
  dependencies: LocalTrackingStartupDependencies<TLocation>,
): Promise<LocalTrackingStartupResult> {
  try {
    await dependencies.persistSession();
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "위치 세션을 저장하지 못했습니다."),
    };
  }

  try {
    await dependencies.startNativeTracking();
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "기기 위치 추적을 시작하지 못했습니다."),
    };
  }

  let location: TLocation | null;
  try {
    location = await dependencies.getCurrentLocation();
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "기기의 현재 위치를 확인하지 못했습니다."),
    };
  }
  if (!location) {
    return dependencies.requireCurrentLocation === false
      ? { ok: true }
      : { ok: false, error: "기기의 현재 위치를 확인하지 못했습니다." };
  }

  try {
    const sent = await dependencies.sendCurrentLocation(location);
    return sent || dependencies.requireSuccessfulSend === false
      ? { ok: true }
      : { ok: false, error: "첫 위치를 서버에 전송하지 못했습니다." };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "첫 위치를 서버에 전송하지 못했습니다."),
    };
  }
}

export interface TrackingRecoveryLock {
  clear: () => void;
  getRequestId: () => number | null;
  getRecoveryRequestId: () => number | null;
  isLocked: () => boolean;
  isRecoveryLocked: () => boolean;
  lock: (requestId: number) => boolean;
  release: (requestId: number) => boolean;
  tryBegin: (requestId: number) => boolean;
}

export function createTrackingRecoveryLock(): TrackingRecoveryLock {
  let requestId: number | null = null;
  let recovery = false;
  return {
    clear: () => {
      requestId = null;
      recovery = false;
    },
    getRequestId: () => requestId,
    getRecoveryRequestId: () => recovery ? requestId : null,
    isLocked: () => requestId !== null,
    isRecoveryLocked: () => requestId !== null && recovery,
    lock: (nextRequestId) => {
      if (requestId !== null && requestId !== nextRequestId) return false;
      requestId = nextRequestId;
      recovery = true;
      return true;
    },
    release: (completedRequestId) => {
      if (requestId !== completedRequestId || recovery) return false;
      requestId = null;
      return true;
    },
    tryBegin: (nextRequestId) => {
      if (requestId !== null) return false;
      requestId = nextRequestId;
      recovery = false;
      return true;
    },
  };
}

export function resolveTrackingStopToken(
  refToken: string | null,
  stateToken: string | null,
  storedToken: string | null,
  persistedSessionToken: string | null,
): string | null {
  return refToken ?? stateToken ?? storedToken ?? persistedSessionToken;
}

export interface SingleRetryLoop<THandle> {
  isRunning: () => boolean;
  start: (callback: () => void, intervalMs: number) => boolean;
  stop: () => void;
}

export function createSingleRetryLoop<THandle>(
  schedule: (callback: () => void, intervalMs: number) => THandle,
  cancel: (handle: THandle) => void,
): SingleRetryLoop<THandle> {
  let handle: THandle | null = null;
  return {
    isRunning: () => handle !== null,
    start: (callback, intervalMs) => {
      if (handle !== null) return false;
      handle = schedule(callback, intervalMs);
      return true;
    },
    stop: () => {
      if (handle === null) return;
      cancel(handle);
      handle = null;
    },
  };
}

export async function startNativeTrackingWithRetry(
  startRetryLoop: () => void,
  startNativeTracking: () => Promise<void>,
): Promise<void> {
  startRetryLoop();
  await startNativeTracking();
}

export interface LocationUpdateResponse {
  ok: boolean;
  status: number;
}

type LocationUpdateFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<LocationUpdateResponse>;

export interface LocationUpdateRequestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function requestLocationUpdate(
  fetchUpdate: LocationUpdateFetch,
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
): Promise<LocationUpdateRequestResult> {
  try {
    const response = await fetchUpdate(url, init);
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "네트워크 오류"),
    };
  }
}
