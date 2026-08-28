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
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  startLocationTracking,
  stopLocationTracking,
  isTrackingActive,
  getActiveTrackingToken,
  getCurrentLocationFull,
  sendLocationToServer,
  startGlobalFgInterval,
  notifySessionStop,
  requestLocationPermissions,
  subscribeDebug,
  type LocationDebugState,
} from "@/lib/location-tracking";
import {
  createTrackingRecoveryLock,
  resolveTrackingStopToken,
  startNativeTrackingAndSendInitialLocation,
} from "@/lib/location-tracking-startup";

const TRACKING_SESSION_KEY = "location_tracking_session_v1";

type PersistedTrackingSession = {
  token: string;
  requestId: number;
  trackingUrl: string | null;
  requiresRecovery: boolean;
};

function parsePersistedSession(raw: string | null): PersistedTrackingSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedTrackingSession>;
    if (
      typeof value.token !== "string" || !value.token ||
      !Number.isInteger(value.requestId) || (value.requestId ?? 0) <= 0 ||
      (value.trackingUrl !== null && value.trackingUrl !== undefined && typeof value.trackingUrl !== "string") ||
      (value.requiresRecovery !== undefined && typeof value.requiresRecovery !== "boolean")
    ) {
      return null;
    }
    return {
      token: value.token,
      requestId: value.requestId!,
      trackingUrl: value.trackingUrl ?? null,
      requiresRecovery: value.requiresRecovery ?? false,
    };
  } catch {
    return null;
  }
}

// ─── 컨텍스트 타입 ─────────────────────────────────────────────────────────
export interface LocationTrackingContextValue {
  isTracking: boolean;
  trackingToken: string | null;
  trackingRequestId: number | null;
  trackingRecoveryRequestId: number | null;
  departureLockRequestId: number | null;
  isTrackingHydrated: boolean;
  trackingUrl: string | null;
  debugState: LocationDebugState | null;
  permStatus: { fg: string; bg: string };
  startTracking: (params: StartTrackingParams) => Promise<StartTrackingResult>;
  stopTracking: (reason: "도착완료" | "업무취소") => Promise<void>;
  checkPermissions: () => Promise<void>;
  isTrackingRecoveryLocked: () => boolean;
  tryBeginDeparture: (requestId: number) => boolean;
  releaseDeparture: (requestId: number) => void;
}

export interface StartTrackingParams {
  token: string;
  requestId: number;
  trackingUrl?: string | null;
}

export interface StartTrackingResult {
  ok: boolean;
  error?: string;
}

// ─── 기본값 ────────────────────────────────────────────────────────────────
const LocationTrackingContext = createContext<LocationTrackingContextValue>({
  isTracking: false,
  trackingToken: null,
  trackingRequestId: null,
  trackingRecoveryRequestId: null,
  departureLockRequestId: null,
  isTrackingHydrated: false,
  trackingUrl: null,
  debugState: null,
  permStatus: { fg: "확인 중...", bg: "확인 중..." },
  startTracking: async () => ({ ok: false }),
  stopTracking: async () => {},
  checkPermissions: async () => {},
  isTrackingRecoveryLocked: () => false,
  tryBeginDeparture: () => false,
  releaseDeparture: () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────
export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingRecoveryRequestId, setTrackingRecoveryRequestId] = useState<number | null>(null);
  const [departureLockRequestId, setDepartureLockRequestId] = useState<number | null>(null);
  const [isTrackingHydrated, setIsTrackingHydrated] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<LocationDebugState | null>(null);
  const [permStatus, setPermStatus] = useState<{ fg: string; bg: string }>({
    fg: "확인 중...",
    bg: "확인 중...",
  });

  const tokenRef = useRef<string | null>(null);
  const sessionRef = useRef<PersistedTrackingSession | null>(null);
  const hydrationRef = useRef(false);
  const recoveryLockRef = useRef(createTrackingRecoveryLock());

  const lockTrackingRecovery = useCallback((requestId: number) => {
    if (!recoveryLockRef.current.lock(requestId)) return;
    setDepartureLockRequestId(requestId);
    setTrackingRecoveryRequestId(requestId);
  }, []);

  const clearTrackingRecovery = useCallback(() => {
    recoveryLockRef.current.clear();
    setDepartureLockRequestId(null);
    setTrackingRecoveryRequestId(null);
  }, []);

  const isTrackingRecoveryLocked = useCallback(
    () => recoveryLockRef.current.isRecoveryLocked(),
    [],
  );

  const tryBeginDeparture = useCallback((requestId: number) => {
    if (!hydrationRef.current) return false;
    const acquired = recoveryLockRef.current.tryBegin(requestId);
    if (acquired) setDepartureLockRequestId(requestId);
    return acquired;
  }, []);

  const releaseDeparture = useCallback((requestId: number) => {
    if (recoveryLockRef.current.release(requestId)) {
      setDepartureLockRequestId(null);
    }
  }, []);

  // 디버그 상태 구독
  useEffect(() => {
    const unsub = subscribeDebug((s) => setDebugState({ ...s }));
    return unsub;
  }, []);

  // 위치 권한 상태 확인
  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermStatus({ fg: "웹 불가", bg: "웹 불가" });
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  // 앱 포그라운드 복귀 시 즉시 위치 전송 (AppState 이벤트)
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "active") {
        const t = tokenRef.current;
        if (!t) return;
        const active = await isTrackingActive();
        if (!active) return;
        const loc = await getCurrentLocationFull();
        if (loc) {
          await sendLocationToServer(t, loc.lat, loc.lng, loc.speed, loc.heading, loc.accuracy);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // 앱 시작 시 이전 세션 복구
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await isTrackingActive();
        const [legacyToken, persistedRaw] = await Promise.all([
          getActiveTrackingToken(),
          AsyncStorage.getItem(TRACKING_SESSION_KEY),
        ]);
        const persisted = parsePersistedSession(persistedRaw);
        const token = legacyToken ?? persisted?.token ?? null;
        if (cancelled) return;
        sessionRef.current = persisted;

        if (persisted?.requiresRecovery && token) {
          tokenRef.current = token;
          lockTrackingRecovery(persisted.requestId);
          const retryResult = await startNativeTrackingAndSendInitialLocation({
            persistSession: async () => {},
            startNativeTracking: () => startLocationTracking(token),
            getCurrentLocation: getCurrentLocationFull,
            sendCurrentLocation: (loc) => sendLocationToServer(
              token,
              loc.lat,
              loc.lng,
              loc.speed,
              loc.heading,
              loc.accuracy,
            ),
            requireCurrentLocation: Platform.OS !== "web",
            requireSuccessfulSend: Platform.OS !== "web",
          });
          if (!cancelled && retryResult.ok) {
            const activeSession = { ...persisted, requiresRecovery: false };
            try {
              await AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify(activeSession));
              sessionRef.current = activeSession;
              setIsTracking(true);
              setTrackingToken(token);
              setTrackingRequestId(activeSession.requestId);
              setTrackingUrl(activeSession.trackingUrl);
              clearTrackingRecovery();
            } catch (e) {
              console.warn("[LocationTrackingContext] 복구 세션 저장 실패:", e);
            }
          }
          await checkPermissions();
          return;
        }

        if (active && token) {
          tokenRef.current = token;
          setIsTracking(true);
          setTrackingToken(token);
          if (persisted?.token === token) {
            setTrackingRequestId(persisted.requestId);
            setTrackingUrl(persisted.trackingUrl);
          }
          clearTrackingRecovery();
          startGlobalFgInterval();
          await checkPermissions();
        }
      } catch (e) {
        console.warn("[LocationTrackingContext] 세션 복구 실패:", e);
      } finally {
        if (!cancelled) {
          hydrationRef.current = true;
          setIsTrackingHydrated(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [checkPermissions, clearTrackingRecovery, lockTrackingRecovery]);

  // 추적 시작
  const startTracking = useCallback(
    async ({ token, requestId, trackingUrl: url }: StartTrackingParams): Promise<StartTrackingResult> => {
      const existingLockRequestId = recoveryLockRef.current.getRequestId();
      if (
        recoveryLockRef.current.isRecoveryLocked() ||
        (existingLockRequestId !== null && existingLockRequestId !== requestId)
      ) {
        return { ok: false, error: "다른 출발 또는 위치 복구 처리가 진행 중입니다." };
      }
      if (existingLockRequestId === null && !tryBeginDeparture(requestId)) {
        return { ok: false, error: "위치 세션 확인 또는 다른 출발 처리가 진행 중입니다." };
      }
      tokenRef.current = token;
      const recoverySession: PersistedTrackingSession = {
        token,
        requestId,
        trackingUrl: url ?? null,
        requiresRecovery: true,
      };
      sessionRef.current = recoverySession;
      try {
        const startupResult = await startNativeTrackingAndSendInitialLocation({
          persistSession: () => AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify(recoverySession)),
          startNativeTracking: () => startLocationTracking(token),
          getCurrentLocation: getCurrentLocationFull,
          sendCurrentLocation: (loc) => sendLocationToServer(
            token,
            loc.lat,
            loc.lng,
            loc.speed,
            loc.heading,
            loc.accuracy,
          ),
          requireCurrentLocation: Platform.OS !== "web",
          requireSuccessfulSend: Platform.OS !== "web",
        });
        if (!startupResult.ok) {
          lockTrackingRecovery(requestId);
          return startupResult;
        }

        const activeSession = { ...recoverySession, requiresRecovery: false };
        try {
          await AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify(activeSession));
          sessionRef.current = activeSession;
        } catch (e: any) {
          lockTrackingRecovery(requestId);
          return { ok: false, error: e?.message || "위치 세션을 저장하지 못했습니다." };
        }

        releaseDeparture(requestId);
        setIsTracking(true);
        setTrackingToken(token);
        setTrackingRequestId(requestId);
        setTrackingUrl(url ?? null);
        await checkPermissions();

        return { ok: true };
      } catch (e: any) {
        lockTrackingRecovery(requestId);
        return { ok: false, error: e?.message || "위치 추적 시작 실패" };
      }
    },
    [checkPermissions, lockTrackingRecovery, releaseDeparture, tryBeginDeparture]
  );

  // 추적 중단
  const stopTracking = useCallback(
    async (reason: "도착완료" | "업무취소") => {
      let persisted: PersistedTrackingSession | null = null;
      let legacyToken: string | null = null;
      try {
        const [persistedRaw, storedToken] = await Promise.all([
          AsyncStorage.getItem(TRACKING_SESSION_KEY),
          getActiveTrackingToken(),
        ]);
        persisted = parsePersistedSession(persistedRaw);
        legacyToken = storedToken;
      } catch {}
      const t = resolveTrackingStopToken(
        tokenRef.current ?? sessionRef.current?.token ?? null,
        trackingToken,
        legacyToken,
        persisted?.token ?? null,
      );
      if (t) {
        try {
          await notifySessionStop(t, reason);
        } catch {}
      }
      try {
        await stopLocationTracking();
      } catch {}
      try {
        await AsyncStorage.removeItem(TRACKING_SESSION_KEY);
      } catch {}
      tokenRef.current = null;
      sessionRef.current = null;
      clearTrackingRecovery();
      setIsTracking(false);
      setTrackingToken(null);
      setTrackingRequestId(null);
      setTrackingUrl(null);
    },
    [trackingToken, clearTrackingRecovery]
  );

  return (
    <LocationTrackingContext.Provider
      value={{
        isTracking,
        trackingToken,
        trackingRequestId,
        trackingRecoveryRequestId,
        departureLockRequestId,
        isTrackingHydrated,
        trackingUrl,
        debugState,
        permStatus,
        startTracking,
        stopTracking,
        checkPermissions,
        isTrackingRecoveryLocked,
        tryBeginDeparture,
        releaseDeparture,
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
