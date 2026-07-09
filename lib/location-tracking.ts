/**
 * 기사 위치 추적 모듈 (네이티브 APK 전용)
 *
 * ⚠️ 핵심 원칙:
 * - TaskManager.defineTask 는 반드시 전역 스코프에서 호용 (컴포넌트 X)
 * - 출발 버튼 클릭 시에만 추적 시작
 * - Android Foreground Service + 10초 간격 위치 전송
 * - 화면 꺼짘 / 내비 사용 중에도 위치 전송 유지
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TRACKING_TOKEN_KEY = "location_tracking_token";
const TRACKING_ACTIVE_KEY = "location_tracking_active";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://xn--2z1bw8k1pjz5ccumkb516e.kr";
const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";

// ─── 디버그 상태 (UI에서 구독 가능) ──────────────────────────────────────────
export interface LocationDebugState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  lastSentAt: number | null;       // 마지막 전송 시도 타임스탬프
  lastSuccessAt: number | null;    // 마지막 성공 타임스탬프
  serverOk: boolean | null;        // 마지막 서버 응답 성공 여부
  serverError: string | null;      // 마지막 서버 오류 메시지
  sendCount: number;               // 총 전송 횟수
  source: string;                  // 'background-task' | 'foreground-interval'
}

let _debugState: LocationDebugState = {
  lat: null, lng: null, accuracy: null, speed: null, heading: null,
  lastSentAt: null, lastSuccessAt: null, serverOk: null, serverError: null,
  sendCount: 0, source: "",
};

const _debugListeners: Array<(state: LocationDebugState) => void> = [];

export function subscribeDebug(cb: (state: LocationDebugState) => void) {
  _debugListeners.push(cb);
  cb({ ..._debugState }); // 즉시 현재 상태 전달
  return () => {
    const idx = _debugListeners.indexOf(cb);
    if (idx !== -1) _debugListeners.splice(idx, 1);
  };
}

function emitDebug(patch: Partial<LocationDebugState>) {
  _debugState = { ..._debugState, ...patch };
  for (const cb of _debugListeners) cb({ ..._debugState });
}

// ─── 전역 포그라운드 인터벌 ────────────────────────────────────────────────
let _globalFgInterval: ReturnType<typeof setInterval> | null = null;

export function startGlobalFgInterval() {
  if (_globalFgInterval) return;
  _globalFgInterval = setInterval(async () => {
    const token = await AsyncStorage.getItem(TRACKING_TOKEN_KEY);
    const isActive = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
    if (!token || isActive !== "true") return;
    const loc = await getCurrentLocationFull();
    if (!loc) return;
    emitDebug({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, speed: loc.speed, heading: loc.heading, source: "foreground-interval", lastSentAt: Date.now() });
    await sendLocationToServer(token, loc.lat, loc.lng, loc.speed, loc.heading, loc.accuracy);
  }, 10000);
}

export function stopGlobalFgInterval() {
  if (_globalFgInterval) {
    clearInterval(_globalFgInterval);
    _globalFgInterval = null;
  }
}

export async function resumeTrackingIfActive() {
  const isActive = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
  if (isActive === "true") {
    startGlobalFgInterval();
  }
}

// ─── 백그라운드 태스크 정의 (전역 스코프 — 컴포넌트 밖) ───────────────────
// ⚠️ 이 블록은 반드시 모듈 최상위에 있어야 함
// 앱이 백그라운드에서 재시작될 때 태스크를 찾을 수 있도록 전역 등록
if (Platform.OS !== "web") {
  try {
    // 동기 require — 백그라운드 재시작 시 import() 비동기 불가
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TaskManager = require("expo-task-manager");
    if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
          console.error("[LocationTask] 오류:", error.message);
          return;
        }
        if (!data?.locations?.length) return;

        const token = await AsyncStorage.getItem(TRACKING_TOKEN_KEY);
        const isActive = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
        if (!token || isActive !== "true") return;

        const { latitude, longitude, speed, heading, accuracy } = data.locations[0].coords;
        const now = Date.now();
        emitDebug({
          lat: latitude, lng: longitude,
          speed: speed ?? null, heading: heading ?? null, accuracy: accuracy ?? null,
          lastSentAt: now, source: "background-task",
        });

        try {
          const resp = await fetch(`${API_BASE_URL}/api/location/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              lat: latitude, lng: longitude,
              speed: speed ?? null, heading: heading ?? null, accuracy: accuracy ?? null,
            }),
          });
          const ok = resp.ok;
          emitDebug({ serverOk: ok, lastSuccessAt: ok ? now : _debugState.lastSuccessAt, serverError: ok ? null : `HTTP ${resp.status}`, sendCount: _debugState.sendCount + 1 });
        } catch (e: any) {
          emitDebug({ serverOk: false, serverError: e?.message || "네트워크 오류" });
        }
      });
    }
  } catch (e) {
    console.warn("[LocationTracking] 백그라운드 태스크 전역 등록 실패:", e);
  }
}

// ─── 위치 권한 요청 ────────────────────────────────────────────────────────
export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
  message?: string;
}> {
  if (Platform.OS === "web") return { granted: true, backgroundGranted: false };

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require("expo-location");
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      return { granted: false, backgroundGranted: false, message: "위치 권한을 허용해 주세요." };
    }
    let bgGranted = false;
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      bgGranted = bgStatus === "granted";
    } catch (e) {
      console.warn("[LocationTracking] 백그라운드 권한 요청 실패:", e);
    }
    return { granted: true, backgroundGranted: bgGranted };
  } catch (e) {
    console.error("[LocationTracking] 권한 요청 오류:", e);
    return { granted: false, backgroundGranted: false, message: "위치 권한 요청 중 오류가 발생했습니다." };
  }
}

// ─── 위치 추적 시작 ────────────────────────────────────────────────────────
export async function startLocationTracking(token: string): Promise<void> {
  await AsyncStorage.setItem(TRACKING_TOKEN_KEY, token);
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "true");
  emitDebug({ sendCount: 0, serverOk: null, serverError: null });

  // 포그라운드 인터벌 시작 (화면 켜진 상태 백업)
  startGlobalFgInterval();

  if (Platform.OS === "web") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require("expo-location");
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,          // 10초 간격
      distanceInterval: 5,          // 5m 이동 시 즉시
      foregroundService: {
        notificationTitle: "퓨처에너지테크 기사 앱",
        notificationBody: "고객 방문 중 위치를 공유하고 있습니다.",
        notificationColor: "#FF6B35",
      },
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });
    console.log("[LocationTracking] Foreground Service 시작 완료");
  } catch (e) {
    console.error("[LocationTracking] Foreground Service 시작 실패 (포그라운드 폴백):", e);
  }
}

// ─── 위치 추적 중단 ────────────────────────────────────────────────────────
export async function stopLocationTracking(): Promise<void> {
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "false");
  await AsyncStorage.removeItem(TRACKING_TOKEN_KEY);
  stopGlobalFgInterval();

  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require("expo-location");
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  } catch (e) {
    console.error("[LocationTracking] 위치 추적 중단 실패:", e);
  }
}

// ─── 추적 상태 확인 ────────────────────────────────────────────────────────
export async function isTrackingActive(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TRACKING_ACTIVE_KEY)) === "true";
  } catch { return false; }
}

export async function getActiveTrackingToken(): Promise<string | null> {
  try { return AsyncStorage.getItem(TRACKING_TOKEN_KEY); }
  catch { return null; }
}

// ─── 현재 위치 1회 조회 ────────────────────────────────────────────────────
export async function getCurrentLocationFull(): Promise<{
  lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null;
} | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed ?? null, heading: pos.coords.heading ?? null, accuracy: pos.coords.accuracy ?? null }),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require("expo-location");
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude, speed: loc.coords.speed ?? null, heading: loc.coords.heading ?? null, accuracy: loc.coords.accuracy ?? null };
  } catch { return null; }
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  const r = await getCurrentLocationFull();
  return r ? { lat: r.lat, lng: r.lng } : null;
}

// ─── 서버에 위치 전송 ──────────────────────────────────────────────────────
export async function sendLocationToServer(
  token: string, lat: number, lng: number,
  speed?: number | null, heading?: number | null, accuracy?: number | null
): Promise<void> {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/location/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lat, lng, speed: speed ?? null, heading: heading ?? null, accuracy: accuracy ?? null }),
    });
    const now = Date.now();
    emitDebug({ serverOk: resp.ok, lastSuccessAt: resp.ok ? now : _debugState.lastSuccessAt, serverError: resp.ok ? null : `HTTP ${resp.status}`, sendCount: _debugState.sendCount + 1 });
  } catch (e: any) {
    emitDebug({ serverOk: false, serverError: e?.message || "네트워크 오류" });
    console.error("[LocationTracking] 위치 전송 실패:", e);
  }
}

// ─── 세션 종료 서버 알림 ───────────────────────────────────────────────────
export async function notifySessionStop(token: string, reason: "도착완료" | "업무취소"): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/location/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reason }),
    });
  } catch (e) {
    console.error("[LocationTracking] 세션 종료 알림 실패:", e);
  }
}
