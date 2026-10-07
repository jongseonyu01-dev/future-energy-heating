/**
 * 앱 화면과 독립적인 Android foreground-service 위치공유 상태.
 * 실제 좌표 전송은 lib/location-tracking.ts의 TaskManager callback 하나만 수행한다.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { useAppAuth } from "@/lib/auth-context";
import {
  createLocationStopAuthSnapshot,
  getPersistedTrackingState,
  restoreLocationTrackingForUser,
  startLocationTracking,
  stopStoredTrackingAndNotify,
  subscribeDebug,
  subscribeTrackingState,
  type LocationDebugState,
  type PersistedTrackingState,
} from "@/lib/location-tracking";

export interface LocationTrackingContextValue {
  isTracking: boolean;
  trackingToken: string | null;
  trackingRequestId: number | null;
  trackingUrl: string | null;
  debugState: LocationDebugState | null;
  permStatus: { foregroundLocation: string; backgroundLocation: string; notification: string };
  startTracking: (params: StartTrackingParams) => Promise<StartTrackingResult>;
  stopTracking: (reason: "도착완료" | "업무취소") => Promise<void>;
  checkPermissions: () => Promise<void>;
}

export interface StartTrackingParams {
  token: string;
  requestId: number;
  technicianId: number;
  technicianUserId: number;
  trackingUrl?: string | null;
}

export interface StartTrackingResult {
  ok: boolean;
  error?: string;
}

const LocationTrackingContext = createContext<LocationTrackingContextValue>({
  isTracking: false,
  trackingToken: null,
  trackingRequestId: null,
  trackingUrl: null,
  debugState: null,
  permStatus: { foregroundLocation: "확인 중...", backgroundLocation: "확인 중...", notification: "확인 중..." },
  startTracking: async () => ({ ok: false }),
  stopTracking: async () => {},
  checkPermissions: async () => {},
});

function stateToView(state: PersistedTrackingState | null) {
  return {
    isTracking: Boolean(state),
    trackingToken: state?.token ?? null,
    trackingRequestId: state?.requestId ?? null,
    trackingUrl: state?.trackingUrl ?? null,
  };
}

export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAppAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<LocationDebugState | null>(null);
  const [permStatus, setPermStatus] = useState({ foregroundLocation: "확인 중...", backgroundLocation: "확인 중...", notification: "확인 중..." });

  const applyState = useCallback((state: PersistedTrackingState | null) => {
    const view = stateToView(state);
    setIsTracking(view.isTracking);
    setTrackingToken(view.trackingToken);
    setTrackingRequestId(view.trackingRequestId);
    setTrackingUrl(view.trackingUrl);
  }, []);

  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermStatus({ foregroundLocation: "Android 앱 필요", backgroundLocation: "Android 앱 필요", notification: "Android 앱 필요" });
      return;
    }
    let foregroundLocation = "확인 실패";
    let backgroundLocation = "FGS 방식 (별도 권한 미요청)";
    let notification = "확인 실패";
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      foregroundLocation = foreground.status === "granted" ? "✅ 허용" : `❌ ${foreground.status}`;
    } catch {
      // A location-module failure must not hide the independent notification state.
    }
    try {
      const background = await Location.getBackgroundPermissionsAsync();
      backgroundLocation = background.status === "granted" ? "✅ 항상 허용" : `ℹ️ ${background.status} (FGS 방식)`;
    } catch {
      // expo-location may throw when ACCESS_BACKGROUND_LOCATION is intentionally absent.
    }
    try {
      const notifications = await Notifications.getPermissionsAsync();
      notification = notifications.granted ? "✅ 허용" : "⚠️ 필요";
    } catch {
      // Notification lookup is independently best effort.
    }
    setPermStatus({ foregroundLocation, backgroundLocation, notification });
  }, []);

  const stopTracking = useCallback(async (reason: "도착완료" | "업무취소") => {
    // Local foreground collection, persisted intent, and control notification are
    // invalidated before the token-scoped server stop is attempted.
    await stopStoredTrackingAndNotify(reason, createLocationStopAuthSnapshot(user));
    applyState(null);
  }, [applyState, user]);

  useEffect(() => subscribeDebug((next) => setDebugState({ ...next })), []);

  useEffect(() => subscribeTrackingState((state) => applyState(state)), [applyState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isLoading) return;
      if (!user?.userId || user.appRole !== "technician") {
        const orphaned = await getPersistedTrackingState();
        if (orphaned) await stopStoredTrackingAndNotify("업무취소");
        if (!cancelled) applyState(null);
        return;
      }
      const restored = await restoreLocationTrackingForUser(user.userId);
      if (!cancelled) {
        applyState(restored);
        await checkPermissions();
      }
    })();
    return () => { cancelled = true; };
  }, [isLoading, user?.appRole, user?.userId, applyState, checkPermissions]);

  const startTracking = useCallback(async (params: StartTrackingParams): Promise<StartTrackingResult> => {
    const existing = await getPersistedTrackingState();
    if (existing && existing.requestId !== params.requestId) {
      return { ok: false, error: "다른 고객의 위치 공유가 아직 진행 중입니다. 해당 공유를 도착 또는 취소로 종료해 주세요." };
    }
    if (existing && existing.requestId === params.requestId && existing.token !== params.token) {
      return { ok: false, error: "같은 방문 건의 위치 공유 식별자가 일치하지 않습니다. 출발 처리를 다시 확인해 주세요." };
    }
    const next: PersistedTrackingState = {
      token: params.token,
      requestId: params.requestId,
      technicianId: params.technicianId,
      technicianUserId: params.technicianUserId,
      startedAt: Date.now(),
      trackingUrl: params.trackingUrl ?? null,
    };
    try {
      await startLocationTracking(next);
      applyState(next);
      await checkPermissions();
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || "위치 공유 서비스를 시작하지 못했습니다." };
    }
  }, [applyState, checkPermissions]);

  return (
    <LocationTrackingContext.Provider value={{
      isTracking,
      trackingToken,
      trackingRequestId,
      trackingUrl,
      debugState,
      permStatus,
      startTracking,
      stopTracking,
      checkPermissions,
    }}>
      {children}
    </LocationTrackingContext.Provider>
  );
}

export function useLocationTracking() {
  return useContext(LocationTrackingContext);
}
