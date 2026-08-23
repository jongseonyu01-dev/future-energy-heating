/**
 * 전역 위치 추적 컨텍스트
 *
 * 이 컨텍스트는 app/_layout.tsx 루트에 마운트되어
 * 어떤 화면으로 이동해도 위치 전송이 계속 유지됩니다.
 *
 * 사용법:
 *   const { startTracking, stopTracking, isTracking, debugState } = useLocationTracking();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import {
  adoptPersistedTrackingRequest,
  getLocationTrackingAuthSnapshot,
  getPersistedTrackingSession,
  isLocationTrackingAuthSnapshotCurrent,
  startLocationTracking,
  stopLocationTracking,
  stopLocationTrackingIfToken,
  suspendLocationTrackingIfToken,
  isTrackingActive,
  resumeTrackingIfActive,
  getCurrentLocationFull,
  sendLocationToServer,
  notifySessionStop,
  subscribeDebug,
  subscribeTrackingStopped,
  type LocationTrackingAuthSnapshot,
  type LocationDebugState,
} from "@/lib/location-tracking";
import { useAppAuth } from "@/lib/auth-context";

const RESTORE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

// ─── 컨텍스트 타입 ─────────────────────────────────────────────────────────
export interface LocationTrackingContextValue {
  isTracking: boolean;
  trackingToken: string | null;
  trackingRequestId: number | null;
  trackingUrl: string | null;
  debugState: LocationDebugState | null;
  permStatus: { fg: string; bg: string };
  startTracking: (params: StartTrackingParams) => Promise<StartTrackingResult>;
  adoptTrackingRequest: (
    requestId: number,
    trackingUrl?: string | null,
  ) => Promise<boolean>;
  stopTracking: (
    reason: "도착완료" | "업무취소",
    options?: StopTrackingOptions,
  ) => Promise<void>;
  checkPermissions: () => Promise<void>;
}

export interface StartTrackingParams {
  token: string;
  requestId: number;
  trackingUrl?: string | null;
  backgroundEnabled?: boolean;
}

export interface StartTrackingResult {
  ok: boolean;
  error?: string;
}

export interface StopTrackingOptions {
  serverAlreadyStopped?: boolean;
}

// ─── 기본값 ────────────────────────────────────────────────────────────────
const LocationTrackingContext = createContext<LocationTrackingContextValue>({
  isTracking: false,
  trackingToken: null,
  trackingRequestId: null,
  trackingUrl: null,
  debugState: null,
  permStatus: { fg: "확인 중...", bg: "확인 중..." },
  startTracking: async () => ({ ok: false }),
  adoptTrackingRequest: async () => false,
  stopTracking: async () => {},
  checkPermissions: async () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────
export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, isLoading: isAuthLoading } = useAppAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<LocationDebugState | null>(null);
  const [permStatus, setPermStatus] = useState<{ fg: string; bg: string }>({
    fg: "확인 중...",
    bg: "확인 중...",
  });

  const tokenRef = useRef<string | null>(null);
  const authUserRef = useRef(authUser);
  const authLoadingRef = useRef(isAuthLoading);
  const restoreInFlightGenerationRef = useRef<number | null>(null);
  const restorePendingGenerationRef = useRef<number | null>(null);
  const restoreGenerationRef = useRef(0);
  const restoreRetryAttemptRef = useRef(0);
  const restoreRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  authUserRef.current = authUser;
  authLoadingRef.current = isAuthLoading;

  const isAuthorizedSnapshot = useCallback((
    snapshot: LocationTrackingAuthSnapshot,
  ) => {
    const currentUser = authUserRef.current;
    return !authLoadingRef.current
      && currentUser?.appRole === "technician"
      && typeof currentUser.token === "string"
      && currentUser.token === snapshot.sessionToken
      && isLocationTrackingAuthSnapshotCurrent(snapshot);
  }, []);

  const clearRestoreRetry = useCallback(() => {
    if (restoreRetryTimerRef.current) {
      clearTimeout(restoreRetryTimerRef.current);
      restoreRetryTimerRef.current = null;
    }
  }, []);

  const resetTrackingState = useCallback(() => {
    clearRestoreRetry();
    restoreRetryAttemptRef.current = 0;
    tokenRef.current = null;
    setIsTracking(false);
    setTrackingToken(null);
    setTrackingRequestId(null);
    setTrackingUrl(null);
  }, [clearRestoreRetry]);

  // 디버그 상태 구독
  useEffect(() => {
    const unsub = subscribeDebug((s) => setDebugState({ ...s }));
    return unsub;
  }, []);

  // 백그라운드 전송에서 세션 종료를 감지하거나 인증 정리가 실행돼도 UI 상태를 동기화한다.
  useEffect(() => subscribeTrackingStopped(resetTrackingState), [resetTrackingState]);

  // 위치 권한 상태 확인
  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermStatus({ fg: "웹 불가", bg: "웹 불가" });
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require("expo-location");
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      setPermStatus({
        fg: fg.status === "granted" ? "✅ 허용됨" : `❌ ${fg.status}`,
        bg: bg.status === "granted" ? "✅ 항상 허용" : `⚠️ ${bg.status}`,
      });
    } catch {
      setPermStatus({ fg: "확인 실패", bg: "확인 실패" });
    }
  }, []);

  const restorePersistedSession = useCallback(async function attemptRestore(
    expectedGeneration: number,
  ): Promise<boolean> {
    if (restoreGenerationRef.current !== expectedGeneration) {
      return false;
    }
    if (restoreInFlightGenerationRef.current !== null) {
      if (restoreInFlightGenerationRef.current !== expectedGeneration) {
        restorePendingGenerationRef.current = expectedGeneration;
      }
      return false;
    }

    const authSnapshot = getLocationTrackingAuthSnapshot();
    if (!authSnapshot || !isAuthorizedSnapshot(authSnapshot)) return false;

    clearRestoreRetry();
    restoreInFlightGenerationRef.current = expectedGeneration;
    try {
      // resumeTrackingIfActive가 서버의 `이동중` 응답을 확인한 뒤에만
      // 저장값과 네이티브 task/단일 포그라운드 interval을 복구한다.
      const result = await resumeTrackingIfActive(authSnapshot);
      const stale = restoreGenerationRef.current !== expectedGeneration
        || !isAuthorizedSnapshot(authSnapshot);
      if (stale) {
        if (result.state === "restored") {
          await stopLocationTrackingIfToken(result.session.token);
        }
        return false;
      }

      if (result.state === "unavailable") {
        const attempt = restoreRetryAttemptRef.current;
        if (
          attempt < RESTORE_RETRY_DELAYS_MS.length
          && !restoreRetryTimerRef.current
          && isAuthorizedSnapshot(authSnapshot)
        ) {
          const delay = RESTORE_RETRY_DELAYS_MS[attempt];
          restoreRetryAttemptRef.current = attempt + 1;
          restoreRetryTimerRef.current = setTimeout(() => {
            restoreRetryTimerRef.current = null;
            void attemptRestore(expectedGeneration);
          }, delay);
        }
        return false;
      }
      if (result.state !== "restored") {
        restoreRetryAttemptRef.current = 0;
        return false;
      }

      restoreRetryAttemptRef.current = 0;
      const persisted = result.session;
      tokenRef.current = persisted.token;
      setIsTracking(true);
      setTrackingToken(persisted.token);
      setTrackingRequestId(persisted.requestId);
      setTrackingUrl(persisted.trackingUrl);
      await checkPermissions();
      return true;
    } catch (error) {
      console.warn("[LocationTrackingContext] 세션 복구 실패:", error);
      return false;
    } finally {
      if (restoreInFlightGenerationRef.current === expectedGeneration) {
        restoreInFlightGenerationRef.current = null;
      }
      const pendingGeneration = restorePendingGenerationRef.current;
      restorePendingGenerationRef.current = null;
      if (
        pendingGeneration !== null
        && restoreGenerationRef.current === pendingGeneration
      ) {
        void attemptRestore(pendingGeneration);
      }
    }
  }, [checkPermissions, clearRestoreRetry, isAuthorizedSnapshot]);

  // 앱 포그라운드 복귀 시 즉시 위치 전송 (AppState 이벤트)
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "active") {
        const t = tokenRef.current;
        if (!t) {
          await restorePersistedSession(restoreGenerationRef.current);
          return;
        }
        const active = await isTrackingActive();
        if (!active) return;
        const loc = await getCurrentLocationFull();
        if (loc) {
          await sendLocationToServer(t, loc.lat, loc.lng, loc.speed, loc.heading, loc.accuracy);
        }
      }
    });
    return () => sub.remove();
  }, [restorePersistedSession]);

  // 인증 복원이 끝난 기사 계정에서만 이전 위치 세션을 복구한다.
  useEffect(() => {
    const generation = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = generation;
    clearRestoreRetry();
    restoreRetryAttemptRef.current = 0;

    if (isAuthLoading) {
      return () => {
        if (restoreGenerationRef.current === generation) {
          restoreGenerationRef.current += 1;
        }
        clearRestoreRetry();
      };
    }
    if (!authUser) {
      // AuthProvider가 로그아웃/무효 세션은 이미 완전히 정리한다. 반면 서버 일시
      // 장애는 저장된 이동 세션을 보존하므로 여기서 다시 삭제하지 않는다.
      resetTrackingState();
      return () => {
        if (restoreGenerationRef.current === generation) {
          restoreGenerationRef.current += 1;
        }
        clearRestoreRetry();
      };
    }
    if (authUser.appRole !== "technician") {
      resetTrackingState();
      void stopLocationTracking();
      return () => {
        if (restoreGenerationRef.current === generation) {
          restoreGenerationRef.current += 1;
        }
        clearRestoreRetry();
      };
    }

    void restorePersistedSession(generation);
    return () => {
      if (restoreGenerationRef.current === generation) {
        restoreGenerationRef.current += 1;
      }
      clearRestoreRetry();
    };
  }, [
    authUser,
    clearRestoreRetry,
    isAuthLoading,
    resetTrackingState,
    restorePersistedSession,
  ]);

  // 추적 시작
  const startTracking = useCallback(
    async ({
      token,
      requestId,
      trackingUrl: url,
      backgroundEnabled = false,
    }: StartTrackingParams): Promise<StartTrackingResult> => {
      const authSnapshot = getLocationTrackingAuthSnapshot();
      if (!authSnapshot || !isAuthorizedSnapshot(authSnapshot)) {
        return {
          ok: false,
          error: "로그인 상태가 변경되어 위치 공유 시작이 취소되었습니다.",
        };
      }

      try {
        // Foreground Service + 모듈 단일 포그라운드 interval 시작
        const started = await startLocationTracking(
          token,
          requestId,
          url,
          backgroundEnabled,
          authSnapshot,
        );
        if (!started || !isAuthorizedSnapshot(authSnapshot)) {
          await stopLocationTrackingIfToken(token);
          return { ok: false, error: "위치 공유 시작이 취소되었습니다." };
        }
        tokenRef.current = token;
        setIsTracking(true);
        setTrackingToken(token);
        setTrackingRequestId(requestId);
        setTrackingUrl(url ?? null);

        // 즉시 현재 위치 전송
        const loc = await getCurrentLocationFull();
        if (loc) {
          const result = await sendLocationToServer(
            token,
            loc.lat,
            loc.lng,
            loc.speed,
            loc.heading,
            loc.accuracy,
          );
          if (result === "terminal") {
            return { ok: false, error: "종료된 위치 공유 세션입니다." };
          }
          if (result === "auth-failed") {
            // 인증 실패는 서버 세션 종료가 아니다. 전송만 멈추고 token/requestId는
            // rollback 확인 또는 사용자의 수동 종료까지 보존한다.
            await suspendLocationTrackingIfToken(token);
            tokenRef.current = null;
            setIsTracking(false);
            return {
              ok: false,
              error: "로그인 인증을 확인하지 못해 위치 공유를 시작할 수 없습니다.",
            };
          }
        }

        await checkPermissions();

        if (!isAuthorizedSnapshot(authSnapshot)) {
          await stopLocationTrackingIfToken(token);
          return {
            ok: false,
            error: "로그인 상태가 변경되어 위치 공유 시작이 취소되었습니다.",
          };
        }

        return { ok: true };
      } catch (e: any) {
        // 네이티브 task 시작 실패 뒤 서버 rollback도 실패할 수 있다. 인증이 아직
        // 유효하고 저장 token이 동일하면 수동 종료 버튼이 보이도록 식별값을 보존한다.
        if (isAuthorizedSnapshot(authSnapshot)) {
          const persisted = await getPersistedTrackingSession();
          if (persisted?.token === token) {
            tokenRef.current = null;
            setIsTracking(false);
            setTrackingToken(persisted.token);
            setTrackingRequestId(persisted.requestId ?? requestId);
            setTrackingUrl(persisted.trackingUrl ?? url ?? null);
          }
        }
        return { ok: false, error: e?.message || "위치 추적 시작 실패" };
      }
    },
    [checkPermissions, isAuthorizedSnapshot]
  );

  // v1.1.17에는 requestId 없이 token만 저장됐다. 인증된 업무 조회에서 같은
  // public token을 찾은 경우에만 현재 카드에 연결한다.
  const adoptTrackingRequest = useCallback(async (
    requestId: number,
    url?: string | null,
  ) => {
    const token = trackingToken;
    const authSnapshot = getLocationTrackingAuthSnapshot();
    if (
      !token
      || trackingRequestId !== null
      || !authSnapshot
      || !isAuthorizedSnapshot(authSnapshot)
    ) return false;

    const adopted = await adoptPersistedTrackingRequest(
      token,
      requestId,
      url ?? null,
      authSnapshot,
    );
    if (!adopted || !isAuthorizedSnapshot(authSnapshot)) return false;

    setTrackingRequestId(requestId);
    setTrackingUrl(url ?? trackingUrl);
    return true;
  }, [
    isAuthorizedSnapshot,
    trackingRequestId,
    trackingToken,
    trackingUrl,
  ]);

  // 추적 중단
  const stopTracking = useCallback(
    async (
      reason: "도착완료" | "업무취소",
      options?: StopTrackingOptions,
    ) => {
      const persisted = tokenRef.current || trackingToken
        ? null
        : await getPersistedTrackingSession();
      const t = tokenRef.current ?? trackingToken ?? persisted?.token ?? null;
      if (!t) return;

      if (!options?.serverAlreadyStopped) {
        const serverStop = await notifySessionStop(t, reason);
        if (!serverStop.ok) {
          // 고객 링크가 서버에서 살아 있는 상태로 로컬 token을 잃지 않게 호출자에게 전달한다.
          throw new Error(serverStop.error);
        }
      }

      // 응답 대기 중 새 방문 세션이 시작됐다면 과거 token만 조건부로 정리한다.
      await stopLocationTrackingIfToken(t);
    },
    [trackingToken]
  );

  return (
    <LocationTrackingContext.Provider
      value={{
        isTracking,
        trackingToken,
        trackingRequestId,
        trackingUrl,
        debugState,
        permStatus,
        startTracking,
        adoptTrackingRequest,
        stopTracking,
        checkPermissions,
      }}
    >
      {children}
    </LocationTrackingContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useLocationTracking() {
  return useContext(LocationTrackingContext);
}
