/**
 * 앱 화면과 독립적인 Android foreground-service 위치공유 상태.
 * 실제 좌표 전송은 lib/location-tracking.ts의 TaskManager callback 하나만 수행한다.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { useAppAuth } from "@/lib/auth-context";
import {
  getLatestUnboundLocationTaskEvent,
  createLocationStopAuthSnapshot,
  getPersistedTrackingState,
  isLocationTrackingPermissionPending,
  recordLocationTrackingAppState,
  resumeLocationTrackingAfterPermissionCheck,
  restoreLocationTrackingForUser,
  startLocationTracking,
  stopExactStoredTrackingAndNotify,
  stopStoredTrackingAndNotify,
  subscribeDebug,
  subscribeTrackingState,
  type LocationDebugState,
  type PersistedTrackingState,
} from "@/lib/location-tracking";
import type { UnboundLocationTaskEvent } from "@/lib/location-runtime-diagnostics";
import {
  LocationTrackingOwnerReconciliationGuard,
  reconcileLocationTrackingOwner,
} from "@/lib/location-tracking-owner-reconciliation";
import {
  activateLocationStatusOverlayOwner,
  getLocationStatusOverlayState,
  invalidateLocationStatusOverlayOwner,
  isCurrentLocationStatusOverlayOwner,
  requestLocationStatusOverlayPermission,
  showLocationStatusOverlay,
  synchronizeLocationStatusOverlayOwner,
  type LocationStatusOverlayPresentation,
  type LocationStatusOverlayState,
} from "@/lib/location-status-overlay";
import { sameTrackingLifecycleState } from "@/lib/location-tracking-lifecycle";

export interface LocationTrackingContextValue {
  isTracking: boolean;
  /** A non-terminal existing session is paused while Android location approval is missing. */
  isPermissionPending: boolean;
  /** A foreground-only permission recheck is in progress for the exact visible work. */
  isPermissionResumeChecking: boolean;
  trackingToken: string | null;
  trackingRequestId: number | null;
  trackingUrl: string | null;
  debugState: LocationDebugState | null;
  /** Not associated with a customer/session; shown separately in technician diagnostics only. */
  unboundTaskEvent: UnboundLocationTaskEvent | null;
  statusOverlay: LocationStatusOverlayState;
  openStatusOverlay: () => Promise<"shown" | "permission_required" | "unavailable">;
  closeStatusOverlay: () => Promise<void>;
  permStatus: { foregroundLocation: string; backgroundLocation: string; notification: string };
  startTracking: (params: StartTrackingParams) => Promise<StartTrackingResult>;
  resumeTrackingAfterPermissionCheck: () => Promise<"resumed" | "permission_required" | "unavailable">;
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
  isPermissionPending: false,
  isPermissionResumeChecking: false,
  trackingToken: null,
  trackingRequestId: null,
  trackingUrl: null,
  debugState: null,
  unboundTaskEvent: null,
  statusOverlay: { available: false, permission: false, visible: false },
  openStatusOverlay: async () => "unavailable",
  closeStatusOverlay: async () => {},
  permStatus: { foregroundLocation: "확인 중...", backgroundLocation: "확인 중...", notification: "확인 중..." },
  startTracking: async () => ({ ok: false }),
  resumeTrackingAfterPermissionCheck: async () => "unavailable",
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
  const [isPermissionPending, setIsPermissionPending] = useState(false);
  const [isPermissionResumeChecking, setIsPermissionResumeChecking] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<LocationDebugState | null>(null);
  const [unboundTaskEvent, setUnboundTaskEvent] = useState<UnboundLocationTaskEvent | null>(null);
  const [statusOverlay, setStatusOverlay] = useState<LocationStatusOverlayState>({ available: false, permission: false, visible: false });
  const [permStatus, setPermStatus] = useState({ foregroundLocation: "확인 중...", backgroundLocation: "확인 중...", notification: "확인 중..." });
  const ownerReconciliation = useRef(new LocationTrackingOwnerReconciliationGuard()).current;
  const trackingStateRef = useRef<PersistedTrackingState | null>(null);
  const overlayRequestGeneration = useRef(0);
  const unboundReadGeneration = useRef(0);
  const unboundScope = useRef("");
  const permissionPendingReadGeneration = useRef(0);
  const permissionResumeGeneration = useRef(0);

  const refreshPermissionPending = useCallback((state: PersistedTrackingState | null) => {
    const generation = ++permissionPendingReadGeneration.current;
    if (!state) {
      setIsPermissionPending(false);
      return;
    }
    void isLocationTrackingPermissionPending(state).then((pending) => {
      if (
        generation === permissionPendingReadGeneration.current
        && sameTrackingLifecycleState(trackingStateRef.current, state)
      ) setIsPermissionPending(pending);
    }).catch(() => {
      if (
        generation === permissionPendingReadGeneration.current
        && sameTrackingLifecycleState(trackingStateRef.current, state)
      ) setIsPermissionPending(true);
    });
  }, []);

  const applyState = useCallback((state: PersistedTrackingState | null) => {
    if (!sameTrackingLifecycleState(trackingStateRef.current, state)) {
      overlayRequestGeneration.current += 1;
      // A permission result is valid only for the exact work that requested it.
      // Cancel it before state A is replaced, stopped, logged out, or reconciled
      // to another account/work so it cannot apply a late result to B.
      permissionResumeGeneration.current += 1;
      setIsPermissionResumeChecking(false);
    }
    trackingStateRef.current = state;
    const view = stateToView(state);
    setIsTracking(view.isTracking);
    setTrackingToken(view.trackingToken);
    setTrackingRequestId(view.trackingRequestId);
    setTrackingUrl(view.trackingUrl);
    refreshPermissionPending(state);
  }, [refreshPermissionPending]);

  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermStatus({ foregroundLocation: "Android 앱 필요", backgroundLocation: "Android 앱 필요", notification: "Android 앱 필요" });
      return;
    }
    let foregroundLocation = "확인 실패";
    let backgroundLocation = "확인 실패";
    let notification = "확인 실패";
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      foregroundLocation = foreground.status === "granted" ? "✅ 허용" : `❌ ${foreground.status}`;
    } catch {
      // A location-module failure must not hide the independent notification state.
    }
    try {
      const background = await Location.getBackgroundPermissionsAsync();
      backgroundLocation = background.status === "granted" ? "✅ 항상 허용" : `❌ ${background.status} (항상 허용 필요)`;
    } catch {
      // Keep the separate foreground and notification findings visible if the
      // platform permission lookup itself is unavailable.
    }
    try {
      const notifications = await Notifications.getPermissionsAsync();
      notification = notifications.granted ? "✅ 허용" : "⚠️ 필요";
    } catch {
      // Notification lookup is independently best effort.
    }
    setPermStatus({ foregroundLocation, backgroundLocation, notification });
    const overlay = await getLocationStatusOverlayState().catch(() => null);
    if (overlay) setStatusOverlay(overlay);
  }, []);

  const statusOverlayPresentation = useCallback((): LocationStatusOverlayPresentation => ({
    statusText: debugState?.serverStatus === "error"
      ? "위치 공유 중 · 서버 저장 확인 필요"
      : debugState?.serverStatus === "uploading"
        ? "위치 공유 중 · 서버 저장 확인 중"
        : debugState?.lastStoredAt
          ? "위치 공유 중"
          : "위치 공유 중 · 서버 저장 대기",
    lastStoredAt: debugState?.lastStoredAt ?? null,
  }), [debugState?.lastStoredAt, debugState?.serverStatus]);

  const openStatusOverlay = useCallback(async (): Promise<"shown" | "permission_required" | "unavailable"> => {
    const expectedState = trackingStateRef.current;
    if (!expectedState || !isTracking) return "unavailable";
    const requestGeneration = ++overlayRequestGeneration.current;
    // Explicitly reopening after the native "닫기" action receives a new
    // generation. Passive debug updates retain their old generation and cannot
    // resurrect a window the technician closed.
    const owner = activateLocationStatusOverlayOwner(expectedState, true);
    const isStillCurrentRequest = () => (
      requestGeneration === overlayRequestGeneration.current
      && sameTrackingLifecycleState(trackingStateRef.current, expectedState)
      && isCurrentLocationStatusOverlayOwner(owner)
    );
    const nativeOwnerApplied = await synchronizeLocationStatusOverlayOwner(owner).catch(() => false);
    if (!nativeOwnerApplied || !isStillCurrentRequest()) return "unavailable";
    const current = await getLocationStatusOverlayState().catch(() => null);
    if (!isStillCurrentRequest() || !current?.available) return "unavailable";
    if (!current.permission) {
      const requested = await requestLocationStatusOverlayPermission().catch(() => current);
      if (isStillCurrentRequest()) setStatusOverlay(requested);
      return "permission_required";
    }
    const next = await showLocationStatusOverlay(owner, statusOverlayPresentation()).catch(() => current);
    if (!isStillCurrentRequest()) return "unavailable";
    setStatusOverlay(next);
    return next.visible ? "shown" : "unavailable";
  }, [isTracking, statusOverlayPresentation]);

  const closeStatusOverlay = useCallback(async () => {
    const current = trackingStateRef.current;
    ++overlayRequestGeneration.current;
    if (current) invalidateLocationStatusOverlayOwner(current);
    setStatusOverlay((previous) => ({ ...previous, visible: false }));
  }, []);

  const stopTracking = useCallback(async (reason: "도착완료" | "업무취소") => {
    // Local foreground collection, persisted intent, and control notification are
    // invalidated before the token-scoped server stop is attempted.
    const stopping = stopStoredTrackingAndNotify(reason, createLocationStopAuthSnapshot(user));
    applyState(null);
    await stopping;
  }, [applyState, user]);

  useEffect(() => subscribeDebug((next) => setDebugState({ ...next })), []);

  useEffect(() => subscribeTrackingState((state) => applyState(state)), [applyState]);

  // A cold TaskManager callback can occur before an exact A/B session is safely
  // adopted. Keep that module-level evidence visible to an authenticated
  // technician, but never attribute it to the current customer or session.
  const refreshUnboundTaskEvent = useCallback(() => {
    const scope = !isLoading && user?.appRole === "technician" && user.userId
      ? `technician:${user.userId}`
      : "";
    const generation = ++unboundReadGeneration.current;
    unboundScope.current = scope;
    if (!scope) {
      setUnboundTaskEvent(null);
      return;
    }
    void getLatestUnboundLocationTaskEvent()
      .then((event) => {
        if (generation === unboundReadGeneration.current && unboundScope.current === scope) setUnboundTaskEvent(event);
      })
      .catch(() => {
        if (generation === unboundReadGeneration.current && unboundScope.current === scope) setUnboundTaskEvent(null);
      });
  }, [isLoading, user?.appRole, user?.userId]);

  useEffect(() => {
    refreshUnboundTaskEvent();
    return () => { unboundReadGeneration.current += 1; };
  }, [refreshUnboundTaskEvent]);

  useEffect(() => {
    let cancelled = false;
    const generation = ownerReconciliation.begin();
    void reconcileLocationTrackingOwner({
      generation,
      isCurrent: () => !cancelled && ownerReconciliation.isCurrent(generation),
      isAuthLoading: isLoading,
      technicianUserId: user?.userId,
      isTechnician: user?.appRole === "technician",
      getPersistedState: getPersistedTrackingState,
      stopExactStoredState: async (state) => stopExactStoredTrackingAndNotify(state, "업무취소"),
      restoreForUser: restoreLocationTrackingForUser,
      applyState,
      checkPermissions,
    });
    return () => { cancelled = true; };
  }, [isLoading, user?.appRole, user?.userId, applyState, checkPermissions, ownerReconciliation]);

  // Returning to the app does not itself upload a coordinate. It only compares
  // the exact persisted session with Android's registration marker, then lets
  // the native foreground-service task continue delivering future callbacks.
  // The owner generation rejects a delayed A reconciliation after logout/B.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      // This is a timestamp-only diagnostic event. It does not upload a
      // coordinate on return or claim that Android delivered a background task.
      recordLocationTrackingAppState(nextState);
      if (nextState !== "active" || isLoading || user?.appRole !== "technician" || !user.userId) return;
      refreshUnboundTaskEvent();
      let cancelled = false;
      const generation = ownerReconciliation.begin();
      void reconcileLocationTrackingOwner({
        generation,
        isCurrent: () => !cancelled && ownerReconciliation.isCurrent(generation),
        isAuthLoading: isLoading,
        technicianUserId: user.userId,
        isTechnician: true,
        getPersistedState: getPersistedTrackingState,
        stopExactStoredState: async (state) => stopExactStoredTrackingAndNotify(state, "업무취소"),
        restoreForUser: restoreLocationTrackingForUser,
        applyState,
        checkPermissions,
      }).finally(() => { cancelled = true; });
    });
    return () => subscription.remove();
  }, [isLoading, user?.appRole, user?.userId, applyState, checkPermissions, ownerReconciliation, refreshUnboundTaskEvent]);

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

  const resumeTrackingAfterPermissionCheck = useCallback(async (): Promise<"resumed" | "permission_required" | "unavailable"> => {
    if (!user?.userId || user.appRole !== "technician") return "unavailable";
    const expectedState = trackingStateRef.current;
    if (!expectedState || expectedState.technicianUserId !== user.userId) return "unavailable";
    const expectedScope = `technician:${user.userId}`;
    const requestGeneration = ++permissionResumeGeneration.current;
    setIsPermissionResumeChecking(true);
    const isStillCurrentRequest = () => (
      requestGeneration === permissionResumeGeneration.current
      && sameTrackingLifecycleState(trackingStateRef.current, expectedState)
      && user?.appRole === "technician"
      && `technician:${user.userId}` === expectedScope
    );
    try {
      const result = await resumeLocationTrackingAfterPermissionCheck(user.userId, expectedState);
      if (!isStillCurrentRequest()) return "unavailable";
      // Do not let a late old-A result clear, replace, or start a new work view.
      applyState(result.state);
      await checkPermissions();
      if (!isStillCurrentRequest()) return "unavailable";
      return result.status === "resumed"
        ? "resumed"
        : result.status === "permission_required"
          ? "permission_required"
          : "unavailable";
    } finally {
      if (requestGeneration === permissionResumeGeneration.current) {
        setIsPermissionResumeChecking(false);
      }
    }
  }, [applyState, checkPermissions, user?.appRole, user?.userId]);

  return (
    <LocationTrackingContext.Provider value={{
      isTracking,
      isPermissionPending,
      isPermissionResumeChecking,
      trackingToken,
      trackingRequestId,
      trackingUrl,
      debugState,
      unboundTaskEvent,
      statusOverlay,
      openStatusOverlay,
      closeStatusOverlay,
      permStatus,
      startTracking,
      resumeTrackingAfterPermissionCheck,
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
