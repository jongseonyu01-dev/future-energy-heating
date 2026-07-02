/**
 * 기사 위치 추적 모듈
 *
 * ⚠️ 중요 원칙:
 * - 앱 시작 시 위치 추적을 절대 자동 시작하지 않음
 * - "고객 집으로 출발" 버튼을 누를 때만 위치 공유 시작
 * - 10초 간격으로 서버에 위치 전송
 * - "도착" 또는 "업무 취소" 버튼을 누르면 즉시 종료
 * - 위치 권한 거부 시 앱 종료 없이 안내 메시지만 표시
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TRACKING_TOKEN_KEY = "location_tracking_token";
const TRACKING_ACTIVE_KEY = "location_tracking_active";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://futureenergytech.co.kr";

// ─── 백그라운드 태스크 정의 (지연 로드 방식) ──────────────────────────────
// 앱 시작 시 즉시 실행되지 않도록 함수 내부에서만 import
let _locationModule: any = null;
let _taskManagerModule: any = null;
let _taskDefined = false;

const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";

async function getLocationModule() {
  if (_locationModule) return _locationModule;
  try {
    _locationModule = await import("expo-location");
    return _locationModule;
  } catch (e) {
    console.error("[LocationTracking] expo-location 로드 실패:", e);
    return null;
  }
}

async function getTaskManagerModule() {
  if (_taskManagerModule) return _taskManagerModule;
  try {
    _taskManagerModule = await import("expo-task-manager");
    return _taskManagerModule;
  } catch (e) {
    console.error("[LocationTracking] expo-task-manager 로드 실패:", e);
    return null;
  }
}

// 백그라운드 태스크 등록 (출발 버튼 클릭 시에만 호출)
async function ensureTaskDefined() {
  if (_taskDefined || Platform.OS === "web") return;
  const TaskManager = await getTaskManagerModule();
  if (!TaskManager) return;
  try {
    if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
          console.error("[LocationTask] 오류:", error);
          return;
        }
        if (!data?.locations?.length) return;
        const token = await AsyncStorage.getItem(TRACKING_TOKEN_KEY);
        const isActive = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
        if (!token || isActive !== "true") return;
        const { latitude, longitude } = data.locations[0].coords;
        try {
          await fetch(`${API_BASE_URL}/api/location/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, lat: latitude, lng: longitude }),
          });
        } catch (e) {
          console.error("[LocationTask] 위치 전송 실패:", e);
        }
      });
    }
    _taskDefined = true;
  } catch (e) {
    console.error("[LocationTracking] 태스크 등록 실패:", e);
  }
}

// ─── 위치 권한 요청 ────────────────────────────────────────────────────────
export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
  message?: string;
}> {
  if (Platform.OS === "web") {
    return { granted: true, backgroundGranted: false };
  }

  const Location = await getLocationModule();
  if (!Location) {
    return { granted: false, backgroundGranted: false, message: "위치 모듈을 불러올 수 없습니다." };
  }

  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      return {
        granted: false,
        backgroundGranted: false,
        message: "기사 위치 공유를 사용하려면 위치 권한을 허용해 주세요.",
      };
    }

    // 백그라운드 권한 요청 (Android 11+는 설정 앱에서 직접 허용)
    let bgGranted = false;
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      bgGranted = bgStatus === "granted";
    } catch (e) {
      // 백그라운드 권한 요청 실패는 무시 (포그라운드만으로도 동작 가능)
      console.warn("[LocationTracking] 백그라운드 권한 요청 실패 (무시):", e);
    }

    return { granted: true, backgroundGranted: bgGranted };
  } catch (e) {
    console.error("[LocationTracking] 권한 요청 오류:", e);
    return {
      granted: false,
      backgroundGranted: false,
      message: "위치 권한 요청 중 오류가 발생했습니다.",
    };
  }
}

// ─── 위치 추적 시작 (출발 버튼 클릭 시에만 호출) ──────────────────────────
export async function startLocationTracking(token: string): Promise<void> {
  await AsyncStorage.setItem(TRACKING_TOKEN_KEY, token);
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "true");

  if (Platform.OS === "web") return;

  // 태스크 등록 (처음 출발 시에만)
  await ensureTaskDefined();

  const Location = await getLocationModule();
  if (!Location) return;

  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,       // 10초 간격
      distanceInterval: 10,      // 10m 이동 시에도 업데이트
      foregroundService: {
        notificationTitle: "퓨처에너지테크 기사 앱",
        notificationBody: "고객 방문 중 위치를 공유하고 있습니다.",
        notificationColor: "#FF6B35",
      },
      showsBackgroundLocationIndicator: true,
    });
  } catch (e) {
    console.error("[LocationTracking] 백그라운드 위치 시작 실패 (포그라운드 폴백 사용):", e);
    // 백그라운드 실패 시 포그라운드 인터벌로 폴백 (앱 켜진 상태에서는 동작)
  }
}

// ─── 위치 추적 중단 ────────────────────────────────────────────────────────
export async function stopLocationTracking(): Promise<void> {
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "false");
  await AsyncStorage.removeItem(TRACKING_TOKEN_KEY);

  if (Platform.OS !== "web") {
    const Location = await getLocationModule();
    if (!Location) return;
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      }
    } catch (e) {
      console.error("[LocationTracking] 위치 추적 중단 실패:", e);
    }
  }
}

// ─── 추적 상태 확인 ────────────────────────────────────────────────────────
export async function isTrackingActive(): Promise<boolean> {
  try {
    const active = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
    return active === "true";
  } catch {
    return false;
  }
}

export async function getActiveTrackingToken(): Promise<string | null> {
  try {
    return AsyncStorage.getItem(TRACKING_TOKEN_KEY);
  } catch {
    return null;
  }
}

// ─── 현재 위치 1회 조회 ────────────────────────────────────────────────────
export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 10000 }
      );
    });
  }
  try {
    const Location = await getLocationModule();
    if (!Location) return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

// ─── 서버에 위치 전송 (포그라운드 폴백) ───────────────────────────────────
export async function sendLocationToServer(token: string, lat: number, lng: number): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/location/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lat, lng }),
    });
  } catch (e) {
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
