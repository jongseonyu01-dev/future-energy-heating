/**
 * 기사 위치 추적 모듈
 *
 * - "고객 집으로 출발" 버튼을 누를 때만 위치 공유 시작
 * - 30초 간격으로 서버에 위치 전송
 * - "도착" 또는 "업무 취소" 버튼을 누르면 즉시 종료
 * - 화면이 꺼져도 백그라운드에서 계속 전송 (APK 빌드 후)
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";
const TRACKING_TOKEN_KEY = "location_tracking_token";
const TRACKING_ACTIVE_KEY = "location_tracking_active";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://futureheat-htdx5kse.manus.space";

// ─── 백그라운드 태스크 정의 (최상위 스코프) ───────────────────────────────
if (Platform.OS !== "web") {
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

// ─── 위치 권한 요청 ────────────────────────────────────────────────────────
export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
}> {
  if (Platform.OS === "web") {
    return { granted: true, backgroundGranted: false };
  }

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    return { granted: false, backgroundGranted: false };
  }

  // Android 11+ 는 설정 앱에서 직접 허용해야 함
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return {
    granted: true,
    backgroundGranted: bgStatus === "granted",
  };
}

// ─── 위치 추적 시작 ────────────────────────────────────────────────────────
export async function startLocationTracking(token: string): Promise<void> {
  await AsyncStorage.setItem(TRACKING_TOKEN_KEY, token);
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "true");

  if (Platform.OS === "web") {
    // 웹: watchPosition 폴백 (백그라운드 미지원)
    return;
  }

  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,       // 30초 간격
      distanceInterval: 50,      // 50m 이동 시에도 업데이트
      foregroundService: {
        notificationTitle: "퓨처에너지테크 기사 앱",
        notificationBody: "고객 방문 중 위치를 공유하고 있습니다.",
        notificationColor: "#FF6B35",
      },
      showsBackgroundLocationIndicator: true,
    });
  } catch (e) {
    console.error("[LocationTracking] 백그라운드 위치 시작 실패:", e);
    // 백그라운드 실패 시 포그라운드만 사용 (앱 켜진 상태에서는 동작)
  }
}

// ─── 위치 추적 중단 ────────────────────────────────────────────────────────
export async function stopLocationTracking(): Promise<void> {
  await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "false");
  await AsyncStorage.removeItem(TRACKING_TOKEN_KEY);

  if (Platform.OS !== "web") {
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
  const active = await AsyncStorage.getItem(TRACKING_ACTIVE_KEY);
  return active === "true";
}

export async function getActiveTrackingToken(): Promise<string | null> {
  return AsyncStorage.getItem(TRACKING_TOKEN_KEY);
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
