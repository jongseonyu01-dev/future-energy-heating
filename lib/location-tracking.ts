/**
 * 기사 위치공유의 단일 네이티브 수집 경로.
 *
 * - 출발 후 Android foreground-service Location Task만 좌표를 수집·업로드한다.
 * - 화면 JS interval/AppState 재전송은 의도적으로 사용하지 않는다.
 * - 강제 종료(force stop) 뒤 Android가 위치 작업을 재개한다고 주장하지 않는다.
 * - start/restore/stop/logout은 하나의 직렬 lifecycle과 세대(generation)로 보호한다.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { buildLocationRequestHeaders, formatLocationRequestFailure } from "@/lib/location-request-auth";
import {
  classifyLocationUpdateResponse,
  LatestOnlyUploadQueue,
  selectNewestFreshLocation,
  type LocationUpdateResponseBody,
} from "@/lib/location-upload-scheduler";
import {
  matchesTrackingStopAction,
  TrackingLifecycleCoordinator,
  sameTrackingLifecycleState,
  type TrackingStopReason,
} from "@/lib/location-tracking-lifecycle";
import { runGuardedLocationUpload } from "@/lib/location-upload-guard";
import { adoptHeadlessTrackingWithCredential } from "@/lib/location-tracking-runtime";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const TRACKING_STATE_KEY = "location_tracking_state_v2";
const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";
const NOTIFICATION_CATEGORY = "FUTURE_ENERGY_LOCATION_TRACKING";
export const STOP_TRACKING_NOTIFICATION_ACTION = "FUTURE_ENERGY_LOCATION_STOP";
const MAX_MEASUREMENT_AGE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const STOP_REQUEST_ATTEMPTS = 2;
const UPDATE_REQUEST_ATTEMPTS = 3;
const UPDATE_RETRY_DELAY_MS = 1_000;

export interface PersistedTrackingState {
  token: string;
  requestId: number;
  technicianUserId: number;
  technicianId: number;
  startedAt: number;
  trackingUrl: string | null;
}

/** Auth data captured before logout clears SecureStore; it is never persisted. */
export interface LocationStopAuthSnapshot {
  technicianUserId: number;
  bearerToken: string;
}

export function createLocationStopAuthSnapshot(value: {
  userId?: unknown;
  token?: unknown;
} | null | undefined): LocationStopAuthSnapshot | null {
  const technicianUserId = Number(value?.userId);
  const bearerToken = typeof value?.token === "string" ? value.token.trim() : "";
  if (!Number.isSafeInteger(technicianUserId) || technicianUserId <= 0 || !bearerToken) return null;
  return { technicianUserId, bearerToken };
}

export interface LocationDebugState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  lastAttemptAt: number | null;
  lastResponseAt: number | null;
  lastStoredAt: number | null;
  serverStatus: "idle" | "uploading" | "stored" | "ignored" | "error";
  serverError: string | null;
  attemptCount: number;
  storedCount: number;
  ignoredCount: number;
  source: "foreground-service-task" | "";
}

type LocationSample = {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  measuredAt: number;
};

type TimeoutHandle = {
  signal: AbortSignal;
  dispose: () => void;
};

let debugState: LocationDebugState = {
  lat: null, lng: null, accuracy: null, speed: null, heading: null,
  lastAttemptAt: null, lastResponseAt: null, lastStoredAt: null,
  serverStatus: "idle", serverError: null, attemptCount: 0, storedCount: 0, ignoredCount: 0, source: "",
};
const debugListeners: ((state: LocationDebugState) => void)[] = [];
const trackingStateListeners: ((state: PersistedTrackingState | null) => void)[] = [];
let lastUploadMeasurement = { key: "", measuredAt: 0 };
let trackingNotificationId: string | null = null;
const uploadQueue = new LatestOnlyUploadQueue<LocationSample>();

function stateKey(state: PersistedTrackingState): string {
  return `${state.token}:${state.requestId}:${state.technicianUserId}:${state.startedAt}`;
}

function emitTrackingState(state: PersistedTrackingState | null): void {
  for (const listener of trackingStateListeners) listener(state ? { ...state } : null);
}

export function subscribeTrackingState(listener: (state: PersistedTrackingState | null) => void) {
  trackingStateListeners.push(listener);
  listener(trackingLifecycle.currentIntent() ? { ...trackingLifecycle.currentIntent()! } : null);
  return () => {
    const index = trackingStateListeners.indexOf(listener);
    if (index >= 0) trackingStateListeners.splice(index, 1);
  };
}

export function subscribeDebug(listener: (state: LocationDebugState) => void) {
  debugListeners.push(listener);
  listener({ ...debugState });
  return () => {
    const index = debugListeners.indexOf(listener);
    if (index >= 0) debugListeners.splice(index, 1);
  };
}

function emitDebug(patch: Partial<LocationDebugState>) {
  debugState = { ...debugState, ...patch };
  for (const listener of debugListeners) listener({ ...debugState });
}

function validState(value: unknown): value is PersistedTrackingState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedTrackingState>;
  return typeof candidate.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(candidate.token)
    && Number.isSafeInteger(candidate.requestId) && (candidate.requestId as number) > 0
    && Number.isSafeInteger(candidate.technicianUserId) && (candidate.technicianUserId as number) > 0
    && Number.isSafeInteger(candidate.technicianId) && (candidate.technicianId as number) > 0
    && Number.isSafeInteger(candidate.startedAt) && (candidate.startedAt as number) > 0;
}

export async function getPersistedTrackingState(): Promise<PersistedTrackingState | null> {
  try {
    const raw = await AsyncStorage.getItem(TRACKING_STATE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return validState(value) ? value : null;
  } catch {
    return null;
  }
}

async function saveTrackingState(state: PersistedTrackingState): Promise<void> {
  await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify(state));
}

async function clearTrackingStateIfSame(state: PersistedTrackingState): Promise<void> {
  try {
    const current = await getPersistedTrackingState();
    if (sameTrackingLifecycleState(current, state)) await AsyncStorage.removeItem(TRACKING_STATE_KEY);
  } catch {
    // Local invalidation is already recorded in the lifecycle; storage cleanup is best effort.
  }
}

async function getLocationModule() {
  return Location;
}

async function stopNativeLocationTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Location = await getLocationModule();
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
  } catch (error) {
    console.warn("[LocationTracking] foreground service stop failed", error);
  }
}

async function dismissPresentedTrackingNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(presented
      .filter((notification) => notification.request.content.data?.trackingControl === "stop")
      .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)));
  } catch {
    // Some Android variants cannot enumerate presented notifications; the known ID is handled below.
  }
}

async function ensureControlNotification(state: PersistedTrackingState): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY, [
    {
      identifier: STOP_TRACKING_NOTIFICATION_ACTION,
      buttonTitle: "위치 공유 중지",
      options: { isDestructive: true, opensAppToForeground: true },
    },
  ]);
  await clearControlNotification(null);
  trackingNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "고객에게 이동 위치 공유 중",
      body: "출발한 고객의 위치 공유가 진행 중입니다. 중지하려면 ‘위치 공유 중지’를 누르세요.",
      data: { trackingControl: "stop", requestId: state.requestId, startedAt: state.startedAt },
      categoryIdentifier: NOTIFICATION_CATEGORY,
      sticky: true,
      autoDismiss: false,
      priority: "high",
      color: "#FF6B35",
    },
    trigger: null,
  });
}

async function clearControlNotification(_state: PersistedTrackingState | null): Promise<void> {
  if (trackingNotificationId) {
    try { await Notifications.cancelScheduledNotificationAsync(trackingNotificationId); } catch { /* best effort */ }
    try { await Notifications.dismissNotificationAsync(trackingNotificationId); } catch { /* best effort */ }
    trackingNotificationId = null;
  }
  await dismissPresentedTrackingNotifications();
}

async function startNativeLocationTask(): Promise<void> {
  if (Platform.OS === "web") return;
  const Location = await getLocationModule();
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  }
  await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 5,
    foregroundService: {
      notificationTitle: "고객에게 이동 위치 공유 중",
      notificationBody: "기사 위치를 고객 지도에 안전하게 업데이트하고 있습니다.",
      notificationColor: "#FF6B35",
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
  });
}

function createRequestTimeout(timeoutMs = REQUEST_TIMEOUT_MS): TimeoutHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

function isTerminalLocationResponse(status: number, payload: { status?: unknown; code?: unknown } | null): boolean {
  if (status === 401 || status === 403 || status === 404 || status === 409) return true;
  if (status !== 400) return false;
  const sessionStatus = typeof payload?.status === "string" ? payload.status : "";
  const code = typeof payload?.code === "string" ? payload.code : "";
  return ["도착완료", "업무취소", "만료"].includes(sessionStatus)
    || ["LOCATION_SESSION_TERMINATED", "LOCATION_SESSION_EXPIRED", "LOCATION_ASSIGNMENT_CHANGED"].includes(code);
}

function timeoutMessage(error: unknown): string {
  return error instanceof Error && error.name === "AbortError"
    ? "전송 시간 초과"
    : "네트워크 연결을 기다리는 중";
}

function serverRecordedAt(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
  notificationGranted: boolean;
  message?: string;
}> {
  if (Platform.OS === "web") return { granted: true, backgroundGranted: true, notificationGranted: false };
  try {
    const Location = await getLocationModule();
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      return {
        granted: false,
        backgroundGranted: false,
        notificationGranted: false,
        message: "위치 공유를 위해 위치 권한을 허용해 주세요.",
      };
    }
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== "granted") {
      return {
        granted: false,
        backgroundGranted: false,
        notificationGranted: false,
        message: "다른 앱·잠금 화면에서도 위치를 공유하려면 위치 권한을 ‘항상 허용’으로 변경해 주세요.",
      };
    }
    const notification = await Notifications.requestPermissionsAsync();
    const notificationGranted = notification.granted || notification.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!notificationGranted) {
      return {
        granted: true,
        backgroundGranted: true,
        notificationGranted: false,
        message: "위치 공유 상태와 중지 버튼을 표시하려면 알림 권한을 허용해 주세요.",
      };
    }
    return { granted: true, backgroundGranted: true, notificationGranted: true };
  } catch (error) {
    console.warn("[LocationTracking] permission request failed", error);
    return {
      granted: false,
      backgroundGranted: false,
      notificationGranted: false,
      message: "위치·항상 위치 또는 알림 권한을 확인하지 못했습니다.",
    };
  }
}

export async function startLocationTracking(state: PersistedTrackingState): Promise<void> {
  if (Platform.OS === "web") throw new Error("기사 위치공유는 Android 앱에서만 시작할 수 있습니다.");
  const started = await trackingLifecycle.start(state);
  if (!started) throw new Error("위치 공유 시작이 취소되었거나 다른 공유로 교체되었습니다.");
  lastUploadMeasurement = { key: stateKey(state), measuredAt: 0 };
  emitDebug({
    lastAttemptAt: null, lastResponseAt: null, lastStoredAt: null,
    serverStatus: "idle", serverError: null, attemptCount: 0, storedCount: 0, ignoredCount: 0, source: "",
  });
}

/** Stops only native/local state. A separate token-scoped server stop is best effort. */
export async function stopLocationTracking(): Promise<void> {
  await trackingLifecycle.stopCurrent();
  lastUploadMeasurement = { key: "", measuredAt: 0 };
}

export async function restoreLocationTrackingForUser(userId: number): Promise<PersistedTrackingState | null> {
  if (Platform.OS === "web") return null;
  try {
    return await trackingLifecycle.restoreForUser(userId);
  } catch (error) {
    emitDebug({ serverStatus: "error", serverError: "위치공유 서비스를 다시 시작하지 못했습니다." });
    console.warn("[LocationTracking] restore failed", error);
    return null;
  }
}

export async function getCurrentLocationFull(): Promise<{
  lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null; measuredAt: number;
} | null> {
  if (Platform.OS === "web") return null;
  try {
    const Location = await getLocationModule();
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
      accuracy: location.coords.accuracy ?? null,
      measuredAt: location.timestamp,
    };
  } catch {
    return null;
  }
}

async function deactivateAfterTerminalResponse(state: PersistedTrackingState): Promise<void> {
  const stopped = await trackingLifecycle.stopIfCurrent(state);
  if (stopped) emitDebug({ serverStatus: "error", serverError: "서버에서 위치공유 세션이 종료되었거나 권한이 변경되었습니다." });
}

export async function sendLocationToServer(
  state: PersistedTrackingState,
  location: LocationSample,
  capturedBearerToken?: string,
): Promise<void> {
  const now = Date.now();
  const key = stateKey(state);
  if (!Number.isFinite(location.measuredAt) || location.measuredAt <= 0 || now - location.measuredAt > MAX_MEASUREMENT_AGE_MS) {
    emitDebug({ serverStatus: "error", serverError: "오래된 위치 측정값은 전송하지 않았습니다.", lastAttemptAt: now, source: "foreground-service-task" });
    return;
  }
  if (lastUploadMeasurement.key === key && location.measuredAt <= lastUploadMeasurement.measuredAt) return;
  if (!(await trackingLifecycle.isCurrent(state))) return;

  await uploadQueue.enqueue(location, async (queuedLocation) => {
    if (!(await trackingLifecycle.isCurrent(state))) return;
    const queuedNow = Date.now();
    if (queuedNow - queuedLocation.measuredAt > MAX_MEASUREMENT_AGE_MS) {
      emitDebug({ serverStatus: "error", serverError: "대기 중 오래된 위치 측정값은 전송하지 않았습니다.", lastAttemptAt: queuedNow, source: "foreground-service-task" });
      return;
    }
    if (lastUploadMeasurement.key === key && queuedLocation.measuredAt <= lastUploadMeasurement.measuredAt) return;

    emitDebug({
      lat: queuedLocation.lat, lng: queuedLocation.lng, speed: queuedLocation.speed, heading: queuedLocation.heading, accuracy: queuedLocation.accuracy,
      lastAttemptAt: queuedNow, serverStatus: "uploading", serverError: null, source: "foreground-service-task",
    });

    for (let attempt = 0; attempt < UPDATE_REQUEST_ATTEMPTS; attempt += 1) {
      emitDebug({ attemptCount: debugState.attemptCount + 1, serverStatus: "uploading" });
      const guarded = await runGuardedLocationUpload({
        isCurrent: () => trackingLifecycle.isCurrent(state),
        getCredential: async () => {
          const technicianToken = capturedBearerToken ?? await Auth.getSessionToken();
          return buildLocationRequestHeaders(technicianToken) ? technicianToken : null;
        },
        request: async (technicianToken) => {
          const headers = buildLocationRequestHeaders(technicianToken);
          if (!headers) throw new Error("LOCATION_CREDENTIAL_UNAVAILABLE");
          const timeout = createRequestTimeout();
          try {
            return await fetch(`${getApiBaseUrl()}/api/location/update`, {
              method: "POST",
              headers,
              signal: timeout.signal,
              body: JSON.stringify({
                token: state.token,
                lat: queuedLocation.lat,
                lng: queuedLocation.lng,
                speed: queuedLocation.speed,
                heading: queuedLocation.heading,
                accuracy: queuedLocation.accuracy,
                measuredAt: queuedLocation.measuredAt,
              }),
            });
          } finally {
            timeout.dispose();
          }
        },
      }).catch((error: unknown) => ({ kind: "REQUEST_ERROR" as const, error }));

      if (guarded.kind === "STALE") return;
      if (guarded.kind === "MISSING_CREDENTIAL") {
        emitDebug({ serverStatus: "error", serverError: "기사 로그인 인증 정보가 없어 위치를 전송하지 못했습니다." });
        return;
      }
      if (guarded.kind === "REQUEST_ERROR") {
        if (!(await trackingLifecycle.isCurrent(state))) return;
        if (attempt + 1 < UPDATE_REQUEST_ATTEMPTS && !uploadQueue.hasNewerPending(queuedLocation.measuredAt)) {
          await new Promise<void>((resolve) => setTimeout(resolve, UPDATE_RETRY_DELAY_MS));
          continue;
        }
        emitDebug({ serverStatus: "error", serverError: timeoutMessage(guarded.error) });
        return;
      }

      const response = guarded.response;
      const payload = await response.json().catch(() => null) as LocationUpdateResponseBody | null;
      if (!(await trackingLifecycle.isCurrent(state))) return;
      const disposition = classifyLocationUpdateResponse(response.status, payload);
      if (disposition === "accepted") {
        lastUploadMeasurement = { key, measuredAt: queuedLocation.measuredAt };
        const recordedAt = serverRecordedAt(payload?.updatedAt);
        emitDebug({
          serverStatus: "stored", serverError: null, lastResponseAt: Date.now(), lastStoredAt: recordedAt,
          storedCount: debugState.storedCount + 1,
        });
        return;
      }
      if (disposition === "ignored") {
        lastUploadMeasurement = { key, measuredAt: queuedLocation.measuredAt };
        emitDebug({
          serverStatus: "ignored", serverError: "이전 또는 중복 위치 측정값으로 새 저장은 발생하지 않았습니다.", lastResponseAt: Date.now(),
          ignoredCount: debugState.ignoredCount + 1,
        });
        return;
      }
      if (disposition === "terminal") {
        emitDebug({ serverStatus: "error", serverError: formatLocationRequestFailure(response.status, payload?.error), lastResponseAt: Date.now() });
        if (isTerminalLocationResponse(response.status, payload)) await deactivateAfterTerminalResponse(state);
        return;
      }
      if (disposition === "retryable" && attempt + 1 < UPDATE_REQUEST_ATTEMPTS && !uploadQueue.hasNewerPending(queuedLocation.measuredAt)) {
        await new Promise<void>((resolve) => setTimeout(resolve, UPDATE_RETRY_DELAY_MS));
        continue;
      }
      emitDebug({ serverStatus: "error", serverError: formatLocationRequestFailure(response.status, payload?.error), lastResponseAt: Date.now() });
      return;
    }
  });
}

export async function notifySessionStop(
  token: string,
  reason: TrackingStopReason,
  expectedTechnicianUserId?: number,
  authSnapshot?: LocationStopAuthSnapshot | null,
): Promise<void> {
  const useCapturedSnapshot = Boolean(
    authSnapshot && expectedTechnicianUserId !== undefined
      && authSnapshot.technicianUserId === expectedTechnicianUserId,
  );
  if (expectedTechnicianUserId !== undefined && !useCapturedSnapshot) {
    const currentUser = await Auth.getUserInfo();
    if (!currentUser || currentUser.id !== expectedTechnicianUserId) return;
  }
  const technicianToken = useCapturedSnapshot
    ? authSnapshot!.bearerToken
    : await Auth.getSessionToken();
  const headers = buildLocationRequestHeaders(technicianToken);
  if (!headers) return;
  for (let attempt = 0; attempt < STOP_REQUEST_ATTEMPTS; attempt += 1) {
    if (expectedTechnicianUserId !== undefined && !useCapturedSnapshot) {
      const currentUser = await Auth.getUserInfo();
      if (!currentUser || currentUser.id !== expectedTechnicianUserId) return;
    }
    const timeout = createRequestTimeout();
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/location/stop`, {
        method: "POST",
        headers,
        signal: timeout.signal,
        body: JSON.stringify({ token, reason }),
      });
      if (response.ok || response.status === 400 || response.status === 403 || response.status === 404) return;
    } catch {
      // A failed stop request never leaves the local foreground service running.
    } finally {
      timeout.dispose();
    }
    if (attempt + 1 < STOP_REQUEST_ATTEMPTS) {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }
}

/**
 * Local collection and upload intent are invalidated before scheduling the
 * prior session's best-effort server stop. A logout snapshot prevents the
 * later retry from reading a new login's credentials.
 */
export async function stopStoredTrackingAndNotify(
  reason: TrackingStopReason,
  authSnapshot?: LocationStopAuthSnapshot | null,
): Promise<void> {
  // `stopCurrent()` also fences a cold runtime before it performs its stored read.
  const stopped = await trackingLifecycle.stopCurrent();
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  if (stopped) {
    const matchingSnapshot = authSnapshot?.technicianUserId === stopped.technicianUserId ? authSnapshot : null;
    void notifySessionStop(stopped.token, reason, stopped.technicianUserId, matchingSnapshot);
  }
}

const trackingLifecycle = new TrackingLifecycleCoordinator<PersistedTrackingState>({
  read: getPersistedTrackingState,
  save: saveTrackingState,
  clearIfSame: clearTrackingStateIfSame,
  showControlNotification: ensureControlNotification,
  clearControlNotification,
  startNativeCollection: startNativeLocationTask,
  stopNativeCollection: stopNativeLocationTask,
  onStateChanged: emitTrackingState,
});

async function handleTrackingNotificationResponse(response: Notifications.NotificationResponse | null): Promise<void> {
  if (!response || response.actionIdentifier !== STOP_TRACKING_NOTIFICATION_ACTION) return;
  const data = response.notification.request.content.data;
  const current = trackingLifecycle.currentIntent();
  if (current && !matchesTrackingStopAction(current, data)) return;
  const stopped = current
    ? await trackingLifecycle.stopCurrent()
    : await trackingLifecycle.stopStoredIf((state) => matchesTrackingStopAction(state, data));
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  if (stopped) void notifySessionStop(stopped.token, "업무취소", stopped.technicianUserId);
}

/**
 * A fresh TaskManager runtime has no React provider intent. It adopts only the
 * saved exact session and requires a current bearer before uploading. The
 * production `/api/location/update` route then verifies the bearer is an
 * active technician assigned to that same session; an old or replacement login
 * cannot write a position for this token.
 */
export async function adoptLocationTrackingForHeadlessTask(): Promise<PersistedTrackingState | null> {
  const adopted = await adoptHeadlessTrackingWithCredential({
    lifecycle: trackingLifecycle,
    getBearerToken: async () => {
      const token = await Auth.getSessionToken();
      return buildLocationRequestHeaders(token) ? token : null;
    },
  });
  return adopted?.state ?? null;
}

if (Platform.OS !== "web") {
  Notifications.addNotificationResponseReceivedListener((response) => {
    void handleTrackingNotificationResponse(response);
  });
  void Notifications.getLastNotificationResponseAsync().then(handleTrackingNotificationResponse).catch(() => undefined);
}

if (Platform.OS !== "web") {
  try {
    if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
          emitDebug({ serverStatus: "error", serverError: "Android 위치 작업 오류가 발생했습니다.", source: "foreground-service-task" });
          return;
        }
        const taskLocations = (Array.isArray(data?.locations) ? data.locations : []) as {
          timestamp?: number;
          coords?: { latitude?: number; longitude?: number; speed?: number | null; heading?: number | null; accuracy?: number | null };
        }[];
        const latest = selectNewestFreshLocation(taskLocations, Date.now(), MAX_MEASUREMENT_AGE_MS);
        if (!latest) {
          emitDebug({ serverStatus: "error", serverError: "유효한 최근 위치 측정값이 없어 전송하지 않았습니다.", source: "foreground-service-task" });
          return;
        }
        const adopted = await adoptHeadlessTrackingWithCredential({
          lifecycle: trackingLifecycle,
          getBearerToken: async () => {
            const token = await Auth.getSessionToken();
            return buildLocationRequestHeaders(token) ? token : null;
          },
        });
        if (!adopted) {
          emitDebug({ serverStatus: "error", serverError: "현재 기사 로그인 인증 또는 위치공유 세션을 확인하지 못했습니다.", source: "foreground-service-task" });
          return;
        }
        const lat = Number(latest.coords?.latitude);
        const lng = Number(latest.coords?.longitude);
        if (!latest.coords || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          emitDebug({ serverStatus: "error", serverError: "위치 좌표 형식을 확인하지 못했습니다.", source: "foreground-service-task" });
          return;
        }
        await sendLocationToServer(adopted.state, {
          lat,
          lng,
          speed: latest.coords.speed ?? null,
          heading: latest.coords.heading ?? null,
          accuracy: latest.coords.accuracy ?? null,
          measuredAt: Number(latest.timestamp),
        }, adopted.bearerToken);
      });
    }
  } catch (error) {
    console.warn("[LocationTracking] task registration failed", error);
  }
}
