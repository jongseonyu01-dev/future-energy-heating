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
  notifySessionStop,
  requestLocationPermissions,
  subscribeDebug,
  type LocationDebugState,
} from "@/lib/location-tracking";

const INTERVAL_MS = 10_000; // 10초
const TRACKING_SESSION_KEY = "location_tracking_session_v1";

type PersistedTrackingSession = {
  token: string;
  requestId: number;
  trackingUrl: string | null;
};

function parsePersistedSession(raw: string | null): PersistedTrackingSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedTrackingSession>;
    if (
      typeof value.token !== "string" || !value.token ||
      !Number.isInteger(value.requestId) || (value.requestId ?? 0) <= 0 ||
      (value.trackingUrl !== null && value.trackingUrl !== undefined && typeof value.trackingUrl !== "string")
    ) {
      return null;
    }
    return {
      token: value.token,
      requestId: value.requestId!,
      trackingUrl: value.trackingUrl ?? null,
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
  trackingUrl: string | null;
  debugState: LocationDebugState | null;
  permStatus: { fg: string; bg: string };
  startTracking: (params: StartTrackingParams) => Promise<StartTrackingResult>;
  stopTracking: (reason: "도착완료" | "업무취소") => Promise<void>;
  checkPermissions: () => Promise<void>;
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
  trackingUrl: null,
  debugState: null,
  permStatus: { fg: "확인 중...", bg: "확인 중..." },
  startTracking: async () => ({ ok: false }),
  stopTracking: async () => {},
  checkPermissions: async () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────
export function LocationTrackingProvider({ children }: { children: React.ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<LocationDebugState | null>(null);
  const [permStatus, setPermStatus] = useState<{ fg: string; bg: string }>({
    fg: "확인 중...",
    bg: "확인 중...",
  });

  const fgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);

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

  // 포그라운드 인터벌 시작 (앱 켜진 상태 백업 — Foreground Service 보완)
  const startFgInterval = useCallback((token: string) => {
    tokenRef.current = token;
    if (fgIntervalRef.current) clearInterval(fgIntervalRef.current);
    fgIntervalRef.current = setInterval(async () => {
      const t = tokenRef.current;
      if (!t) return;
      const active = await isTrackingActive();
      if (!active) return;
      const loc = await getCurrentLocationFull();
      if (loc) {
        await sendLocationToServer(t, loc.lat, loc.lng, loc.speed, loc.heading, loc.accuracy);
      }
    }, INTERVAL_MS);
  }, []);

  const stopFgInterval = useCallback(() => {
    if (fgIntervalRef.current) {
      clearInterval(fgIntervalRef.current);
      fgIntervalRef.current = null;
    }
    tokenRef.current = null;
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
        if (!cancelled && active && token) {
          setIsTracking(true);
          setTrackingToken(token);
          if (persisted?.token === token) {
            setTrackingRequestId(persisted.requestId);
            setTrackingUrl(persisted.trackingUrl);
          }
          startFgInterval(token);
          await checkPermissions();
        }
      } catch (e) {
        console.warn("[LocationTrackingContext] 세션 복구 실패:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [startFgInterval, checkPermissions]);

  // 추적 시작
  const startTracking = useCallback(
    async ({ token, requestId, trackingUrl: url }: StartTrackingParams): Promise<StartTrackingResult> => {
      try {
        // Foreground Service 시작 (백그라운드 위치 전송)
        try {
          await startLocationTracking(token);
        } catch (e) {
          console.warn("[LocationTrackingContext] Foreground Service 시작 실패 (포그라운드 폴백):", e);
        }

        try {
          const session: PersistedTrackingSession = {
            token,
            requestId,
            trackingUrl: url ?? null,
          };
          await AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify(session));
        } catch (e) {
          console.warn("[LocationTrackingContext] 위치 세션 저장 실패:", e);
        }

        // 포그라운드 인터벌 시작 (화면 켜진 상태 백업)
        startFgInterval(token);

        // 즉시 현재 위치 전송
        const loc = await getCurrentLocationFull();
        if (loc) {
          await sendLocationToServer(token, loc.lat, loc.lng, loc.speed, loc.heading, loc.accuracy);
        }

        setIsTracking(true);
        setTrackingToken(token);
        setTrackingRequestId(requestId);
        setTrackingUrl(url ?? null);
        await checkPermissions();

        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || "위치 추적 시작 실패" };
      }
    },
    [startFgInterval, checkPermissions]
  );

  // 추적 중단
  const stopTracking = useCallback(
    async (reason: "도착완료" | "업무취소") => {
      const t = tokenRef.current ?? trackingToken;
      if (t) {
        try {
          await notifySessionStop(t, reason);
        } catch {}
        try {
          await stopLocationTracking();
        } catch {}
      }
      try {
        await AsyncStorage.removeItem(TRACKING_SESSION_KEY);
      } catch {}
      stopFgInterval();
      setIsTracking(false);
      setTrackingToken(null);
      setTrackingRequestId(null);
      setTrackingUrl(null);
    },
    [trackingToken, stopFgInterval]
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
