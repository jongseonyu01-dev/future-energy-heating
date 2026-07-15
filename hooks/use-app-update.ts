/**
 * 앱 버전 체크 훅
 * - 앱 실행 또는 포그라운드 복귀 시 /api/mobile-app/latest를 조회
 * - 새 버전이 있으면 updateAvailable=true
 * - 현재 versionCode < minSupportedVersionCode이면 forceUpdate=true
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus, Platform, Linking } from "react-native";
import Constants from "expo-constants";

// 현재 앱 versionCode (app.config.ts의 android.versionCode)
const CURRENT_VERSION_CODE: number =
  (Constants.expoConfig?.android?.versionCode as number | undefined) ?? 3;

export interface AppUpdateInfo {
  versionName: string;
  versionCode: number;
  minSupportedVersionCode: number;
  apkUrl: string;
  sha256?: string;
  fileSize?: number;
  releaseNotes?: string;
  publishedAt?: string;
}

export interface UseAppUpdateResult {
  updateInfo: AppUpdateInfo | null;
  /** 새 버전이 있음 (선택적 업데이트) */
  updateAvailable: boolean;
  /** 강제 업데이트 필요 (현재 버전이 minSupportedVersionCode 미만) */
  forceUpdate: boolean;
  /** 업데이트 안내 모달을 닫음 (forceUpdate일 때는 닫을 수 없음) */
  dismissUpdate: () => void;
  /** APK 다운로드 페이지 열기 */
  openDownload: () => void;
  /** 수동으로 버전 체크 재실행 */
  checkNow: () => void;
}

// 서버 API 기본 URL
function getApiBase(): string {
  if (Platform.OS === "web") return "";
  // 운영 도메인
  return "https://www.futureenergytech.co.kr";
}

export function useAppUpdate(): UseAppUpdateResult {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckRef = useRef<number>(0);
  const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 재체크

  const checkVersion = useCallback(async () => {
    // 웹에서는 버전 체크 불필요
    if (Platform.OS === "web") return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    try {
      const res = await fetch(`${getApiBase()}/api/mobile-app/latest`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      const data: AppUpdateInfo = await res.json();
      setUpdateInfo(data);
      // 새 버전이 있으면 dismissed 초기화
      if (data.versionCode > CURRENT_VERSION_CODE) {
        setDismissed(false);
      }
    } catch {
      // 네트워크 오류 시 무시
    }
  }, []);

  // 앱 시작 시 체크
  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  // 앱 포그라운드 복귀 시 체크
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        checkVersion();
      }
    });
    return () => subscription.remove();
  }, [checkVersion]);

  const updateAvailable =
    !dismissed &&
    updateInfo !== null &&
    updateInfo.versionCode > CURRENT_VERSION_CODE;

  const forceUpdate =
    updateInfo !== null &&
    CURRENT_VERSION_CODE < updateInfo.minSupportedVersionCode;

  const dismissUpdate = useCallback(() => {
    if (!forceUpdate) setDismissed(true);
  }, [forceUpdate]);

  const openDownload = useCallback(() => {
    const url = updateInfo?.apkUrl ?? `${getApiBase()}/download/driver/latest`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`${getApiBase()}/app/driver-download`);
    });
  }, [updateInfo]);

  return {
    updateInfo,
    updateAvailable,
    forceUpdate,
    dismissUpdate,
    openDownload,
    checkNow: checkVersion,
  };
}
