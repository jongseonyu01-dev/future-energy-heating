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
import Constants from "expo-constants";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { buildLocationRequestHeaders, formatLocationRequestFailure } from "@/lib/location-request-auth";
import {
  readExistingLocationTrackingPermissionEligibility,
  requestBackgroundLocationPermissionFlow,
  type LocationPermissionFlowDependencies,
} from "@/lib/location-permission-flow";
import {
  classifyLocationUpdateResponse,
  LatestOnlyUploadQueue,
  selectNewestFreshLocation,
  type LocationUpdateResponseBody,
} from "@/lib/location-upload-scheduler";
import {
  LocationRuntimeDiagnosticsStore,
  type LocationRuntimeDiagnostics,
  type LocationAppStateMarker,
  type LocationCallbackStage,
  type UnboundLocationTaskEvent,
} from "@/lib/location-runtime-diagnostics";
import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from "@/lib/location-runtime-status";
import { parseJsonWithin } from "@/lib/location-upload-response";
import { activateLocationStatusOverlayOwner, getLocationStatusOverlayOwner, invalidateActiveLocationStatusOverlayOwner, invalidateLocationStatusOverlayOwner, synchronizeLocationStatusOverlayOwner, updateVisibleLocationStatusOverlay, type LocationStatusOverlayPresentation } from "@/lib/location-status-overlay";
import {
  matchesTrackingStopAction,
  TrackingLifecycleCoordinator,
  sameTrackingLifecycleState,
  type TrackingStopReason,
} from "@/lib/location-tracking-lifecycle";
import { runGuardedLocationUpload } from "@/lib/location-upload-guard";
import {
  adoptHeadlessTrackingWithCredential,
  adoptHeadlessTrackingWithCredentialResult,
} from "@/lib/location-tracking-runtime";
import {
  createTaskDeadline,
  TaskCallbackDeadlineFence,
  type TaskDeadlineResult,
} from "@/lib/location-task-budget";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const TRACKING_STATE_KEY = "location_tracking_state_v2";
const INACTIVE_TRACKING_PREFIX = "location_tracking_inactive_v1";
const PERMISSION_PENDING_TRACKING_PREFIX = "location_tracking_permission_pending_v1";
const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";
const NOTIFICATION_CATEGORY = "FUTURE_ENERGY_LOCATION_TRACKING";
export const STOP_TRACKING_NOTIFICATION_ACTION = "FUTURE_ENERGY_LOCATION_STOP";
const MAX_MEASUREMENT_AGE_MS = 5 * 60 * 1000;
// Expo TaskService schedules jobFinished(false) after 15 seconds. This is not a
// claim that JS is forcibly stopped at that exact instant, but each callback is
// deliberately limited well below it: one 8s request plus a 2s body parse.
const TASK_CALLBACK_NETWORK_BUDGET_MS = 8_000;
const RESPONSE_BODY_TIMEOUT_MS = 2_000;
const TASK_CALLBACK_TOTAL_BUDGET_MS = TASK_CALLBACK_NETWORK_BUDGET_MS + RESPONSE_BODY_TIMEOUT_MS;
const STOP_REQUEST_ATTEMPTS = 2;

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
  nativeRegistration: "unknown" | "registered" | "not_registered" | "restart_failed";
  lastNativeCheckAt: number | null;
  lastCallbackAt: number | null;
  lastMeasuredAt: number | null;
  lastResponseHeadersAt: number | null;
  lastResponseBodyAt: number | null;
  lastAcceptedAt: number | null;
  lastCallbackDeadlineAt: number | null;
  lastCallbackStage: LocationCallbackStage | null;
  lastCallbackStageAt: number | null;
  lastCallbackStageElapsedMs: number | null;
  lastAttemptStage: LocationCallbackStage | null;
  lastAttemptStageAt: number | null;
  lastAttemptStageElapsedMs: number | null;
  lastAppState: LocationAppStateMarker | null;
  lastAppStateAt: number | null;
  buildLabel: string | null;
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
  nativeRegistration: "unknown", lastNativeCheckAt: null, lastCallbackAt: null, lastMeasuredAt: null,
  lastResponseHeadersAt: null, lastResponseBodyAt: null, lastAcceptedAt: null, lastCallbackDeadlineAt: null,
  lastCallbackStage: null, lastCallbackStageAt: null, lastCallbackStageElapsedMs: null,
  lastAttemptStage: null, lastAttemptStageAt: null, lastAttemptStageElapsedMs: null,
  lastAppState: null, lastAppStateAt: null, buildLabel: null,
};
const debugListeners: ((state: LocationDebugState) => void)[] = [];
const trackingStateListeners: ((state: PersistedTrackingState | null) => void)[] = [];
let lastUploadMeasurement = { key: "", measuredAt: 0 };
let trackingNotificationId: string | null = null;
const uploadQueue = new LatestOnlyUploadQueue<LocationSample>();
const runtimeDiagnostics = new LocationRuntimeDiagnosticsStore(AsyncStorage);
type DebugUploadOwner = {
  key: string;
  generation: number;
  attemptId: number;
};
type DebugCallbackOwner = {
  key: string;
  generation: number;
  callbackId: number;
  /** A callback can publish progress only until its response has a final result. */
  result: "pending" | "accepted" | "ignored" | "error" | "terminal";
};
// A persisted diagnostic describes an earlier event. It must never turn an
// already-started current request back into "stored", and a late A callback
// must never publish over a replacement B session's debug view.
let activeDebugUploadOwner: DebugUploadOwner | null = null;
let nextDebugUploadAttemptId = 0;
let activeDebugCallbackOwner: DebugCallbackOwner | null = null;
let nextDebugCallbackId = 0;
// The durable marker protects a fresh JS runtime; this in-memory fence closes
// the window before a delayed AsyncStorage.setItem settles in the current
// TaskManager runtime.
const inactiveTrackingStateKeys = new Set<string>();
// Permission denial pauses local collection but is intentionally not terminal:
// the exact saved session remains resumable only after a later foreground
// approval check. This in-memory fence is diagnostic/visibility only; lifecycle
// generation invalidation remains the upload authority boundary.
const permissionPendingTrackingStateKeys = new Set<string>();

function stateKey(state: PersistedTrackingState): string {
  return `${state.token}:${state.requestId}:${state.technicianUserId}:${state.startedAt}`;
}

function isCurrentDebugOwner(state: PersistedTrackingState, generation: number): boolean {
  return trackingLifecycle.isGenerationCurrent(generation)
    && sameTrackingLifecycleState(trackingLifecycle.currentIntent(), state);
}

function beginDebugCallback(state: PersistedTrackingState, generation: number): DebugCallbackOwner | null {
  if (!isCurrentDebugOwner(state, generation)) return null;
  const owner = { key: stateKey(state), generation, callbackId: ++nextDebugCallbackId, result: "pending" as const };
  activeDebugCallbackOwner = owner;
  return owner;
}

function ownsCurrentDebugCallback(state: PersistedTrackingState, owner: DebugCallbackOwner | undefined): boolean {
  return Boolean(owner
    && activeDebugCallbackOwner?.key === owner.key
    && activeDebugCallbackOwner.generation === owner.generation
    && activeDebugCallbackOwner.callbackId === owner.callbackId
    && isCurrentDebugOwner(state, owner.generation));
}

function canPublishCallbackProgress(state: PersistedTrackingState, owner: DebugCallbackOwner | undefined): boolean {
  return ownsCurrentDebugCallback(state, owner) && owner?.result === "pending";
}

/**
 * The final HTTP classification wins for this exact callback. A detached
 * diagnostics snapshot can still persist safe evidence afterwards, but it
 * cannot reclassify a newer error/ignored/accepted result in the live view.
 */
function completeDebugCallback(
  state: PersistedTrackingState,
  owner: DebugCallbackOwner | undefined,
  result: DebugCallbackOwner["result"],
): boolean {
  if (!ownsCurrentDebugCallback(state, owner) || !owner || owner.result !== "pending") return false;
  owner.result = result;
  return true;
}

function beginDebugUpload(state: PersistedTrackingState, generation: number): number | null {
  if (!isCurrentDebugOwner(state, generation)) return null;
  const attemptId = ++nextDebugUploadAttemptId;
  activeDebugUploadOwner = { key: stateKey(state), generation, attemptId };
  return attemptId;
}

function ownsDebugUpload(state: PersistedTrackingState, generation: number, attemptId: number): boolean {
  const active = activeDebugUploadOwner;
  return active?.key === stateKey(state)
    && active.generation === generation
    && active.attemptId === attemptId
    && isCurrentDebugOwner(state, generation);
}

function finishDebugUpload(state: PersistedTrackingState, generation: number, attemptId: number): boolean {
  if (!ownsDebugUpload(state, generation, attemptId)) return false;
  if (activeDebugUploadOwner?.attemptId === attemptId) {
    activeDebugUploadOwner = null;
  }
  return true;
}

function clearActiveDebugUploadForState(state: PersistedTrackingState): void {
  if (activeDebugUploadOwner?.key === stateKey(state)) {
    activeDebugUploadOwner = null;
  }
}

function clearDebugUploadForState(state: PersistedTrackingState): void {
  clearActiveDebugUploadForState(state);
  if (activeDebugCallbackOwner?.key === stateKey(state)) {
    activeDebugCallbackOwner = null;
  }
}

function hasCurrentDebugUpload(): boolean {
  const active = activeDebugUploadOwner;
  if (!active) return false;
  const state = trackingLifecycle.currentIntent();
  if (!state
    || active.key !== stateKey(state)
    || !trackingLifecycle.isGenerationCurrent(active.generation)) {
    activeDebugUploadOwner = null;
    return false;
  }
  return true;
}

function inactiveTrackingKey(state: PersistedTrackingState): string {
  return `${INACTIVE_TRACKING_PREFIX}:${state.requestId}:${state.technicianUserId}:${state.startedAt}:${state.token}`;
}

function permissionPendingTrackingKey(state: PersistedTrackingState): string {
  return `${PERMISSION_PENDING_TRACKING_PREFIX}:${state.requestId}:${state.technicianUserId}:${state.startedAt}:${state.token}`;
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
  // This only changes an overlay already opened by the technician. It cannot
  // reopen a closed overlay or start/stop collection, and carries no PII. The
  // native surface derives accepted-storage age from its own clock so a silent
  // callback period cannot leave a frozen "0초 전" label.
  const current = trackingLifecycle.currentIntent();
  const owner = current ? getLocationStatusOverlayOwner(current) : null;
  if (owner) {
    void updateVisibleLocationStatusOverlay(owner, statusOverlayPresentation(debugState)).catch(() => undefined);
  }
}

function statusOverlayPresentation(state: LocationDebugState): LocationStatusOverlayPresentation {
  return {
    statusText: state.serverStatus === "error"
      ? "위치 공유 중 · 서버 저장 확인 필요"
      : state.serverStatus === "uploading"
        ? "위치 공유 중 · 서버 저장 확인 중"
        : state.lastStoredAt
          ? "위치 공유 중"
          : "위치 공유 중 · 서버 저장 대기",
    lastStoredAt: state.lastStoredAt,
  };
}

function diagnosticBuildLabel(): string | null {
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version;
  const build = Constants.nativeBuildVersion
    ?? (typeof Constants.expoConfig?.android?.versionCode === "number" ? String(Constants.expoConfig.android.versionCode) : null);
  if (!version && !build) return null;
  return version && build ? `${version} (${build})` : version ?? build ?? null;
}

function emitPersistedDiagnostics(
  diagnostics: LocationRuntimeDiagnostics | null,
  canPublish: () => boolean = () => true,
) {
  if (!diagnostics || !canPublish()) return;
  // A delayed pre-response diagnostic operation can finish after a verified
  // accepted response was already rendered. It contains no accepted evidence,
  // so restoring it would regress "stored" to idle/error in the same exact
  // session. A later journal record that includes the same/newer accepted time
  // is still allowed through.
  if (debugState.lastAcceptedAt && (!diagnostics.lastAcceptedAt || diagnostics.lastAcceptedAt < debugState.lastAcceptedAt)) return;
  // The same accepted timestamp may be historical evidence from callback A
  // while callback B has already reached ignored/error. In that case A's late
  // summary must not replace B's terminal display state.
  if (debugState.lastCallbackAt && (!diagnostics.lastCallbackAt || diagnostics.lastCallbackAt < debugState.lastCallbackAt)) return;
  const restoredStatus = locationRuntimeStatusFromDiagnostics(
    diagnostics,
    Date.now(),
    TASK_CALLBACK_TOTAL_BUDGET_MS,
  );
  emitDebug({
    nativeRegistration: diagnostics.nativeRegistration,
    lastNativeCheckAt: diagnostics.lastNativeCheckAt,
    lastCallbackAt: diagnostics.lastCallbackAt,
    lastMeasuredAt: diagnostics.lastMeasuredAt,
    lastResponseHeadersAt: diagnostics.lastResponseHeadersAt,
    lastResponseBodyAt: diagnostics.lastResponseBodyAt,
    lastAcceptedAt: diagnostics.lastAcceptedAt,
    lastCallbackDeadlineAt: diagnostics.lastCallbackDeadlineAt,
    lastCallbackStage: diagnostics.lastCallbackStage,
    lastCallbackStageAt: diagnostics.lastCallbackStageAt,
    lastCallbackStageElapsedMs: diagnostics.lastCallbackStageElapsedMs,
    lastAttemptStage: diagnostics.lastAttemptStage,
    lastAttemptStageAt: diagnostics.lastAttemptStageAt,
    lastAttemptStageElapsedMs: diagnostics.lastAttemptStageElapsedMs,
    lastAppState: diagnostics.lastAppState,
    lastAppStateAt: diagnostics.lastAppStateAt,
    lastAttemptAt: diagnostics.lastUploadStartedAt,
    lastResponseAt: diagnostics.lastResponseAt,
    lastStoredAt: diagnostics.lastStoredAt,
    attemptCount: diagnostics.attemptCount,
    storedCount: diagnostics.storedCount,
    ignoredCount: diagnostics.ignoredCount,
    buildLabel: diagnostics.buildLabel,
    // A prior accepted write remains useful history while a later request is
    // actually pending, but it is not proof that that later request is stored.
    ...(hasCurrentDebugUpload()
      ? { serverStatus: "uploading" as const, serverError: null }
      : restoredStatus),
  });
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
    if (!validState(value)) return null;
    // A terminal marker is a fail-closed authority boundary. It is independent
    // of best-effort cleanup of the legacy pointer, so a fresh headless runtime
    // cannot re-adopt an A session after a 409/401/403/404 terminal response.
    const inactiveKey = inactiveTrackingKey(value);
    if (inactiveTrackingStateKeys.has(inactiveKey)) return null;
    const inactive = await AsyncStorage.getItem(inactiveKey);
    return inactive ? null : value;
  } catch {
    return null;
  }
}

async function saveTrackingState(state: PersistedTrackingState): Promise<void> {
  await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify(state));
}

async function markTrackingStateInactive(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<void> {
  if (!isStillAuthorized()) return;
  const key = inactiveTrackingKey(state);
  inactiveTrackingStateKeys.add(key);
  await AsyncStorage.setItem(key, "1");
}

async function markTrackingStatePermissionPending(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<void> {
  if (!isStillAuthorized()) return;
  const key = permissionPendingTrackingKey(state);
  permissionPendingTrackingStateKeys.add(key);
  // Unlike the terminal inactive marker this value never rejects restore or
  // headless adoption by itself. It is evidence that permission must be
  // rechecked before native collection can resume for this exact pointer.
  await AsyncStorage.setItem(key, "1");
}

async function clearTrackingStatePermissionPending(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<void> {
  const key = permissionPendingTrackingKey(state);
  if (!isStillAuthorized()) return;
  permissionPendingTrackingStateKeys.delete(key);
  try {
    if (isStillAuthorized()) await AsyncStorage.removeItem(key);
  } catch {
    // The marker is informational; a stale one must not prevent a newly
    // permission-approved exact session from restoring.
  }
}

async function isTrackingStatePermissionPending(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<boolean> {
  if (!isStillAuthorized()) return true;
  const key = permissionPendingTrackingKey(state);
  if (permissionPendingTrackingStateKeys.has(key)) return true;
  const pending = await AsyncStorage.getItem(key);
  return !isStillAuthorized() || Boolean(pending);
}

async function isTrackingStateInactive(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<boolean> {
  if (!isStillAuthorized()) return true;
  const key = inactiveTrackingKey(state);
  if (inactiveTrackingStateKeys.has(key)) return true;
  const inactive = await AsyncStorage.getItem(key);
  return !isStillAuthorized() || Boolean(inactive);
}

async function clearTrackingStateIfSame(
  state: PersistedTrackingState,
  isStillAuthorized: () => boolean = () => true,
): Promise<void> {
  try {
    if (!isStillAuthorized()) return;
    const firstRaw = await AsyncStorage.getItem(TRACKING_STATE_KEY);
    if (!isStillAuthorized() || !firstRaw) return;
    const first: unknown = JSON.parse(firstRaw);
    if (!validState(first) || !sameTrackingLifecycleState(first, state)) return;
    // A delayed first read may be an A snapshot from before B's save. Re-read
    // immediately before removeItem, then check the generation guard again so
    // old cleanup cannot erase a replacement's shared pointer.
    const currentRaw = await AsyncStorage.getItem(TRACKING_STATE_KEY);
    if (!isStillAuthorized() || !currentRaw) return;
    const current: unknown = JSON.parse(currentRaw);
    if (!validState(current) || !sameTrackingLifecycleState(current, state)) return;
    if (!isStillAuthorized()) return;
    await AsyncStorage.removeItem(TRACKING_STATE_KEY);
  } catch {
    // Local invalidation is already recorded in the lifecycle; storage cleanup is best effort.
  }
}

async function getLocationModule() {
  return Location;
}

/**
 * Reads permission state only. This helper must not trigger Android Settings or
 * a prompt because it is also called from a headless TaskManager callback.
 */
async function readExistingTrackingPermissionEligibility() {
  if (Platform.OS === "web") return { eligible: true, status: "granted" as const };
  const nativeLocation = await getLocationModule();
  return readExistingLocationTrackingPermissionEligibility({
    getForeground: () => nativeLocation.getForegroundPermissionsAsync(),
    getBackground: () => nativeLocation.getBackgroundPermissionsAsync(),
  });
}

/**
 * Expo's hasStarted API confirms persisted task/consumer registration only. It
 * does not prove a foreground service, GPS callback, JS runtime, HTTP request,
 * or server storage is currently alive.
 */
async function isNativeLocationTaskRegistered(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Location = await getLocationModule();
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  } catch {
    return false;
  }
}

async function stopNativeLocationTask(isStillAuthorized: () => boolean = () => true): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!isStillAuthorized()) return;
    const Location = await getLocationModule();
    if (!isStillAuthorized()) return;
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)) {
      if (!isStillAuthorized()) return;
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
  } catch (error) {
    console.warn("[LocationTracking] foreground service stop failed", error);
  }
}

async function dismissPresentedTrackingNotifications(isStillAuthorized: () => boolean = () => true): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!isStillAuthorized()) return;
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (!isStillAuthorized()) return;
    await Promise.all(presented
      .filter((notification) => notification.request.content.data?.trackingControl === "stop")
      .map((notification) => isStillAuthorized()
        ? Notifications.dismissNotificationAsync(notification.request.identifier)
        : Promise.resolve()));
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

async function clearControlNotification(
  _state: PersistedTrackingState | null,
  isStillAuthorized: () => boolean = () => true,
): Promise<void> {
  if (!isStillAuthorized()) return;
  if (trackingNotificationId) {
    try {
      if (isStillAuthorized()) await Notifications.cancelScheduledNotificationAsync(trackingNotificationId);
    } catch { /* best effort */ }
    try {
      if (isStillAuthorized()) await Notifications.dismissNotificationAsync(trackingNotificationId);
    } catch { /* best effort */ }
    if (!isStillAuthorized()) return;
    trackingNotificationId = null;
  }
  if (isStillAuthorized()) await dismissPresentedTrackingNotifications(isStillAuthorized);
}

async function startNativeLocationTask(): Promise<void> {
  if (Platform.OS === "web") return;
  const Location = await getLocationModule();
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  }
  try {
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
  } catch (error) {
    console.warn("[LocationTracking] Android foreground-service start failed", error);
    throw new Error("위치 공유는 앱 화면이 열린 상태에서 시작해야 합니다. 앱을 다시 연 뒤 출발을 다시 눌러 주세요.");
  }
}

function createRequestTimeout(timeoutMs = TASK_CALLBACK_NETWORK_BUDGET_MS): TimeoutHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

function timeoutMessage(error: unknown): string {
  return error instanceof Error && error.name === "AbortError"
    ? "전송 시간 초과"
    : "네트워크 연결을 기다리는 중";
}

/** SecureStore failures must stop this upload without becoming anonymous fetches. */
async function getStoredLocationBearerToken(): Promise<string | null> {
  try {
    return await Auth.getSessionToken();
  } catch {
    return null;
  }
}

function serverRecordedAt(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function requestLocationPermissions(options: Pick<LocationPermissionFlowDependencies, "confirmBackgroundAccess"> = {}): Promise<{
  granted: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  notificationGranted: boolean;
  message?: string;
}> {
  if (Platform.OS === "web") {
    return {
      granted: true,
      foregroundGranted: true,
      backgroundGranted: true,
      notificationGranted: false,
    };
  }
  try {
    const Location = await getLocationModule();
    return await requestBackgroundLocationPermissionFlow({
      requestForeground: () => Location.requestForegroundPermissionsAsync(),
      requestBackground: () => Location.requestBackgroundPermissionsAsync(),
      requestNotifications: () => Notifications.requestPermissionsAsync(),
      confirmBackgroundAccess: options.confirmBackgroundAccess,
      isProvisionalNotification: (notification) => (
        (notification.ios as { status?: unknown } | null | undefined)?.status
          === Notifications.IosAuthorizationStatus.PROVISIONAL
      ),
    });
  } catch (error) {
    console.warn("[LocationTracking] permission request failed", error);
    return {
      granted: false,
      foregroundGranted: false,
      backgroundGranted: false,
      notificationGranted: false,
      message: "위치 또는 알림 권한을 확인하지 못했습니다.",
    };
  }
}

export async function startLocationTracking(state: PersistedTrackingState): Promise<void> {
  if (Platform.OS === "web") throw new Error("기사 위치공유는 Android 앱에서만 시작할 수 있습니다.");
  const started = await trackingLifecycle.start(state);
  if (!started) throw new Error("위치 공유 시작이 취소되었거나 다른 공유로 교체되었습니다.");
  // This claims only optional visual ownership. It does not show the overlay,
  // start an upload, or treat native registration as collection success.
  const overlayOwner = activateLocationStatusOverlayOwner(state);
  void synchronizeLocationStatusOverlayOwner(overlayOwner).catch(() => undefined);
  activeDebugUploadOwner = null;
  activeDebugCallbackOwner = null;
  lastUploadMeasurement = { key: stateKey(state), measuredAt: 0 };
  await runtimeDiagnostics.begin(state);
  const diagnostics = await runtimeDiagnostics.patch(state, {
    nativeRegistration: "registered",
    lastNativeCheckAt: Date.now(),
    buildLabel: diagnosticBuildLabel(),
  });
  emitPersistedDiagnostics(diagnostics);
  emitDebug({
    lastAttemptAt: null, lastResponseAt: null, lastStoredAt: null,
    lastResponseHeadersAt: null, lastResponseBodyAt: null, lastAcceptedAt: null, lastCallbackDeadlineAt: null,
    lastCallbackStage: null, lastCallbackStageAt: null, lastCallbackStageElapsedMs: null,
    lastAttemptStage: null, lastAttemptStageAt: null, lastAttemptStageElapsedMs: null,
    lastAppState: null, lastAppStateAt: null,
    serverStatus: "idle", serverError: null, attemptCount: 0, storedCount: 0, ignoredCount: 0, source: "",
  });
}

/** Stops only native/local state. A separate token-scoped server stop is best effort. */
export async function stopLocationTracking(): Promise<void> {
  const current = trackingLifecycle.currentIntent();
  if (current) invalidateLocationStatusOverlayOwner(current);
  else invalidateActiveLocationStatusOverlayOwner();
  const stopped = await trackingLifecycle.stopCurrent();
  if (stopped) {
    clearDebugUploadForState(stopped);
    emitPersistedDiagnostics(await runtimeDiagnostics.finalize(stopped));
  }
  lastUploadMeasurement = { key: "", measuredAt: 0 };
}

async function suspendExactTrackingForPermissionDenial(state: PersistedTrackingState): Promise<boolean> {
  // Do not use a broad cold stop here. A permission read for old A can finish
  // after B begins, so the lifecycle re-reads and matches this exact state
  // before suspending only that local collection. The pointer is deliberately
  // preserved: granted permission may later resume this exact session.
  invalidateLocationStatusOverlayOwner(state);
  const suspended = await trackingLifecycle.suspendStoredExact(state);
  if (!suspended) return false;
  clearDebugUploadForState(suspended);
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  emitDebug({
    serverStatus: "error",
    serverError: "위치 권한이 변경되어 위치 공유를 일시 중지했습니다. 권한을 허용하면 같은 업무의 공유를 다시 시작합니다.",
  });
  void runtimeDiagnostics.patch(suspended, {
    lastErrorCode: "LOCATION_PERMISSION_DENIED",
    lastErrorAt: Date.now(),
  }).then(emitPersistedDiagnostics).catch(() => undefined);
  return true;
}

export async function restoreLocationTrackingForUser(userId: number): Promise<PersistedTrackingState | null> {
  if (Platform.OS === "web") return null;
  try {
    // Permission eligibility adds another asynchronous boundary before the
    // lifecycle restore read. Capture ownership first so a logout/stop/B start
    // during that check cannot let a delayed A restore acquire a fresh
    // generation and re-register native collection.
    const restoreGeneration = trackingLifecycle.captureGeneration();
    // A persisted APK56 session must pass the same non-interactive eligibility
    // check as a new departure before this path can register/restart native
    // collection. This check never opens Settings from restore/headless code.
    const candidate = await getPersistedTrackingState();
    if (!trackingLifecycle.isGenerationCurrent(restoreGeneration)) return null;
    if (candidate?.technicianUserId === userId) {
      const eligibility = await readExistingTrackingPermissionEligibility();
      if (!trackingLifecycle.isGenerationCurrent(restoreGeneration)) return null;
      if (!eligibility.eligible) {
        if (eligibility.status === "denied") {
          await suspendExactTrackingForPermissionDenial(candidate);
          return null;
        }
        emitDebug({
          serverStatus: "error",
          serverError: "위치 권한 상태를 확인하지 못해 기존 위치 공유를 복원하지 않았습니다.",
        });
        return null;
      }
    }
    const restored = await trackingLifecycle.restoreForUser(userId);
    if (!restored) return null;
    // read() folds an independently persisted accepted outcome into the session
    // journal. This preserves verified server acceptance across a JS restart
    // even if the normal diagnostic write was still delayed at callback return.
    emitPersistedDiagnostics(await runtimeDiagnostics.read(restored) ?? await runtimeDiagnostics.ensure(restored));
    const nativeCheckAt = Date.now();
    try {
      const result = await trackingLifecycle.reconcileNativeCollection(restored);
      if (result === "superseded") return null;
      const diagnostics = await runtimeDiagnostics.patch(restored, {
        nativeRegistration: result === "unavailable" ? "unknown" : "registered",
        lastNativeCheckAt: nativeCheckAt,
      });
      emitPersistedDiagnostics(diagnostics);
    } catch (error) {
      const diagnostics = await runtimeDiagnostics.patch(restored, {
        nativeRegistration: "restart_failed",
        lastNativeCheckAt: nativeCheckAt,
        lastErrorCode: "NATIVE_RESTART_FAILED",
      });
      emitPersistedDiagnostics(diagnostics);
      emitDebug({ serverStatus: "error", serverError: "위치 작업 등록을 다시 시작하지 못했습니다." });
      console.warn("[LocationTracking] native registration recovery failed", error);
    }
    return restored;
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

function publishCallbackDeadline(
  state: PersistedTrackingState,
  callbackAt?: number,
  callbackOwner?: DebugCallbackOwner,
): void {
  if (!sameTrackingLifecycleState(trackingLifecycle.currentIntent(), state)) return;
  // A and B may be callbacks for the same active session. Their timestamps are
  // not ownership: a current callback necessarily starts its HTTP attempt after
  // it entered. Only a newer callback lease can make this deadline stale. The
  // timestamp fallback remains for legacy direct callers that have no lease.
  if (callbackOwner) {
    if (!ownsCurrentDebugCallback(state, callbackOwner)) return;
  } else if (callbackAt && (
    (debugState.lastCallbackAt !== null && debugState.lastCallbackAt > callbackAt)
    || (debugState.lastAttemptAt !== null && debugState.lastAttemptAt > callbackAt)
    || (debugState.lastAcceptedAt !== null && debugState.lastAcceptedAt >= callbackAt)
  )) return;
  const canPublishDeadline = () => sameTrackingLifecycleState(trackingLifecycle.currentIntent(), state)
    && (!callbackOwner || ownsCurrentDebugCallback(state, callbackOwner));
  if (callbackOwner && !completeDebugCallback(state, callbackOwner, "error")) return;
  // Keep this callback lease until its bounded error evidence is scheduled. A
  // stop/replacement still clears both leases through clearDebugUploadForState.
  clearActiveDebugUploadForState(state);
  const now = Date.now();
  emitDebug({
    serverStatus: "error",
    serverError: "위치 전송 시간 제한으로 저장 여부를 확인하지 못했습니다.",
    lastCallbackDeadlineAt: now,
    lastCallbackStage: "CALLBACK_DEADLINE",
    lastCallbackStageAt: now,
    lastCallbackStageElapsedMs: callbackAt ? Math.max(0, now - callbackAt) : null,
  });
  void runtimeDiagnostics.patch(state, {
    lastErrorCode: CALLBACK_DEADLINE_ERROR,
    lastErrorAt: now,
    lastCallbackDeadlineAt: now,
    lastCallbackStage: "CALLBACK_DEADLINE",
    lastCallbackStageAt: now,
    lastCallbackStageElapsedMs: callbackAt ? Math.max(0, now - callbackAt) : null,
  }, canPublishDeadline)
    .then((diagnostics) => emitPersistedDiagnostics(diagnostics, canPublishDeadline))
    .catch(() => undefined);
}

function deactivateAfterTerminalResponse(
  state: PersistedTrackingState,
  errorCode = "SERVER_TERMINAL",
  errorMessage = "서버에서 위치공유 세션이 종료되었거나 권한이 변경되었습니다.",
): boolean {
  // This synchronous invalidation must precede diagnostics persistence. A
  // permanently stalled setItem therefore cannot permit the next /update.
  if (!trackingLifecycle.invalidateForTerminalResponse(state)) return false;
  clearDebugUploadForState(state);
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  invalidateLocationStatusOverlayOwner(state);
  emitDebug({ serverStatus: "error", serverError: errorMessage });
  void runtimeDiagnostics.patch(state, {
    lastErrorCode: errorCode,
    lastErrorAt: Date.now(),
  }).then(emitPersistedDiagnostics).catch(() => undefined);
  void runtimeDiagnostics.finalize(state).then(emitPersistedDiagnostics).catch(() => undefined);
  void trackingLifecycle.completeInvalidatedTerminalCleanup(state);
  return true;
}

async function withinTaskDeadline<T>(
  fence: TaskCallbackDeadlineFence | undefined,
  operation: () => Promise<T>,
): Promise<TaskDeadlineResult<T>> {
  if (!fence) return { kind: "VALUE", value: await operation() };
  return fence.run(operation);
}

async function withinDiagnosticsDeadline<T>(
  fence: TaskCallbackDeadlineFence | undefined,
  operation: () => Promise<T>,
): Promise<TaskDeadlineResult<T>> {
  const result = await withinTaskDeadline(fence, operation);
  if (result.kind === "EXPIRED") runtimeDiagnostics.releaseExpiredWork();
  return result;
}

function taskStillActive(fence: TaskCallbackDeadlineFence | undefined): boolean {
  return !fence || fence.isActive();
}

/**
 * Phase writes never sit on the callback's critical path. They are bounded by
 * existing immutable diagnostics and exact owner/fence checks, so they describe
 * a stop point without stealing network/body budget or publishing late A data.
 */
function recordCallbackStage(
  state: PersistedTrackingState,
  stage: LocationCallbackStage,
  callbackAt: number,
  attemptStartedAt: number | null,
  canPublish: () => boolean,
): void {
  const stageAt = Date.now();
  void runtimeDiagnostics.update(state, (current) => ({
    ...current,
    lastCallbackStage: stage,
    lastCallbackStageAt: stageAt,
    lastCallbackStageElapsedMs: Math.max(0, stageAt - callbackAt),
    ...(attemptStartedAt
      ? {
          lastAttemptStage: stage,
          lastAttemptStageAt: stageAt,
          lastAttemptStageElapsedMs: Math.max(0, stageAt - attemptStartedAt),
        }
      : {}),
  }), canPublish).then((diagnostics) => {
    if (diagnostics) emitPersistedDiagnostics(diagnostics, canPublish);
  }).catch(() => undefined);
}

/**
 * Session diagnostics are evidence only. They must never delay native callback
 * adoption, credential use, or the one bounded HTTP request. The operation is
 * still fenced: an expired callback releases the diagnostics queue and a late
 * A write cannot publish into B's visible session.
 */
function scheduleSessionDiagnostics(
  state: PersistedTrackingState,
  fence: TaskCallbackDeadlineFence | undefined,
  operation: () => Promise<LocationRuntimeDiagnostics | null>,
  canPublish: () => boolean,
): void {
  void withinDiagnosticsDeadline(fence, operation).then((result) => {
    if (result.kind === "VALUE" && result.value) emitPersistedDiagnostics(result.value, canPublish);
  }).catch(() => undefined);
}

// This is intentionally much smaller than the complete callback budget. It
// permits a headless callback to leave a privacy-safe breadcrumb when adoption
// cannot establish an exact session, without allowing a stalled diagnostic
// write to consume the HTTP/cleanup budget. The isolated record is never
// rendered as an A/B session error.
const TASK_ENTRY_EVENT_BUDGET_MS = 750;

async function recordUnboundTaskCallback(
  code: string,
  observedAt: number,
  parentFence: TaskCallbackDeadlineFence,
): Promise<void> {
  const entryBudgetMs = Math.min(TASK_ENTRY_EVENT_BUDGET_MS, parentFence.remainingMs());
  if (entryBudgetMs <= 0) return;
  const entryFence = new TaskCallbackDeadlineFence(createTaskDeadline(entryBudgetMs));
  const result = await entryFence.run(() => runtimeDiagnostics.recordUnboundTaskEvent(
    code,
    observedAt,
    () => parentFence.isActive() && entryFence.isActive(),
  ));
  if (result.kind === "EXPIRED") runtimeDiagnostics.releaseExpiredWork();
}

function isConfirmedNativeLocationPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "").trim().toUpperCase();
  // Generic native task errors do not prove a permission revocation. Keep this
  // exact code narrow so an old A error can never terminate a replacement B.
  return code === "E_LOCATION_UNAUTHORIZED";
}

function suspendCurrentTrackingForPermissionRevocation(
  state: PersistedTrackingState | null,
): boolean {
  // A native error does not carry the persisted session identifier. Never
  // adopt whichever state happens to be stored after an await: that could be a
  // replacement B. Only an exact owner already held by this JS runtime is safe
  // to invalidate here; a cold/unbound error remains separate evidence.
  if (!state) return false;
  const generation = trackingLifecycle.captureGeneration();
  if (!trackingLifecycle.suspendKnownExact(state, generation)) return false;
  clearDebugUploadForState(state);
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  invalidateLocationStatusOverlayOwner(state);
  emitDebug({
    serverStatus: "error",
    serverError: "위치 권한이 변경되어 위치 공유를 일시 중지했습니다. 권한을 허용하면 같은 업무의 공유를 다시 시작합니다.",
  });
  // Native collection and upload authority are already invalidated above. A
  // stalled journal must never delay that stop or permit another HTTP update.
  void runtimeDiagnostics.patch(state, {
    lastErrorCode: "LOCATION_PERMISSION_REVOKED",
    lastErrorAt: Date.now(),
  }).then(emitPersistedDiagnostics).catch(() => undefined);
  return true;
}

export async function sendLocationToServer(
  state: PersistedTrackingState,
  location: LocationSample,
  capturedBearerToken?: string,
  taskFence?: TaskCallbackDeadlineFence,
  callbackAt = Date.now(),
  suppliedCallbackOwner?: DebugCallbackOwner,
): Promise<void> {
  const isActive = () => taskStillActive(taskFence);
  const callbackGeneration = suppliedCallbackOwner?.generation ?? trackingLifecycle.captureGeneration();
  const callbackOwner = suppliedCallbackOwner ?? beginDebugCallback(state, callbackGeneration);
  const canPersistCurrentCallback = () => isActive()
    && isCurrentDebugOwner(state, callbackGeneration)
    && ownsCurrentDebugCallback(state, callbackOwner ?? undefined);
  const canPublishCurrentCallback = () => canPersistCurrentCallback()
    && canPublishCallbackProgress(state, callbackOwner ?? undefined);
  const now = Date.now();
  const key = stateKey(state);
  if (!isActive()) return;
  if (!Number.isFinite(location.measuredAt) || location.measuredAt <= 0 || now - location.measuredAt > MAX_MEASUREMENT_AGE_MS) {
    emitDebug({ serverStatus: "error", serverError: "오래된 위치 측정값은 전송하지 않았습니다.", lastAttemptAt: now, source: "foreground-service-task" });
    return;
  }
  if (lastUploadMeasurement.key === key && location.measuredAt <= lastUploadMeasurement.measuredAt) return;
  if (canPublishCurrentCallback()) emitDebug({
    lastCallbackStage: "OWNER_CHECK",
    lastCallbackStageAt: Date.now(),
    lastCallbackStageElapsedMs: Math.max(0, Date.now() - callbackAt),
  });
  const initialOwner = await withinTaskDeadline(taskFence, () => trackingLifecycle.isCurrent(state, callbackGeneration, isActive));
  if (initialOwner.kind !== "VALUE") {
    if (!isActive()) publishCallbackDeadline(state, callbackAt, callbackOwner ?? undefined);
    return;
  }
  if (!initialOwner.value) return;
  if (canPublishCurrentCallback()) emitDebug({
    lastCallbackStage: "QUEUE",
    lastCallbackStageAt: Date.now(),
    lastCallbackStageElapsedMs: Math.max(0, Date.now() - callbackAt),
  });

  const queuedUpload = uploadQueue.enqueue(key, location, async (queuedLocation) => {
    if (!isActive()) return;
    const owner = await withinTaskDeadline(taskFence, () => trackingLifecycle.isCurrent(state, callbackGeneration, isActive));
    if (owner.kind !== "VALUE" || !owner.value) return;
    const queuedNow = Date.now();
    if (queuedNow - queuedLocation.measuredAt > MAX_MEASUREMENT_AGE_MS) {
      emitDebug({ serverStatus: "error", serverError: "대기 중 오래된 위치 측정값은 전송하지 않았습니다.", lastAttemptAt: queuedNow, source: "foreground-service-task" });
      return;
    }
    if (lastUploadMeasurement.key === key && queuedLocation.measuredAt <= lastUploadMeasurement.measuredAt) return;

    const remainingBeforeRequest = taskFence
      ? taskFence.remainingMs()
      : TASK_CALLBACK_NETWORK_BUDGET_MS + RESPONSE_BODY_TIMEOUT_MS;
    const requestBudgetMs = Math.min(
      TASK_CALLBACK_NETWORK_BUDGET_MS,
      Math.max(0, remainingBeforeRequest - RESPONSE_BODY_TIMEOUT_MS),
    );
    if (requestBudgetMs <= 0 || !isActive()) return;

    let requestStartedAt: number | null = null;
    let debugAttemptId: number | null = null;
    let attemptRecorded = false;
    const recordStartedAttempt = (startedAt: number, authorize: () => boolean = isActive) => {
      if (attemptRecorded) return;
      attemptRecorded = true;
      // A network rejection or timeout has no Response value, but it is still
      // one actual fetch attempt. This write is scheduled only *after* fetch
      // has been invoked, never awaited by the callback, and is scoped to the
      // exact session so terminal invalidation cannot reopen upload authority.
      void runtimeDiagnostics.update(state, (current) => ({
        ...current,
        // These are callback facts observed before the started HTTP request.
        // Persist them only after fetch invocation, never as a pre-request
        // await, so a missing/slow summary cannot consume the callback budget.
        lastCallbackAt: Math.max(current.lastCallbackAt ?? 0, callbackAt) || null,
        lastMeasuredAt: Math.max(current.lastMeasuredAt ?? 0, queuedLocation.measuredAt) || null,
        nativeRegistration: "registered",
        lastNativeCheckAt: Math.max(current.lastNativeCheckAt ?? 0, callbackAt) || null,
        lastUploadStartedAt: startedAt,
        attemptCount: current.attemptCount + 1,
      }), authorize).then((attempted) => {
        if (attempted) emitPersistedDiagnostics(attempted, canPublishCurrentCallback);
      }).catch(() => undefined);
    };
    const guardedResult = await withinTaskDeadline(taskFence, async () => runGuardedLocationUpload({
      isCurrent: () => trackingLifecycle.isCurrent(state, undefined, isActive),
      getCredential: async () => {
        if (!isActive()) return null;
        const tokenResult = await withinTaskDeadline(taskFence, async () => (
          capturedBearerToken ?? await getStoredLocationBearerToken()
        ));
        const technicianToken = tokenResult.kind === "VALUE" ? tokenResult.value : null;
        if (canPublishCurrentCallback()) emitDebug({
          lastCallbackStage: "CREDENTIAL",
          lastCallbackStageAt: Date.now(),
          lastCallbackStageElapsedMs: Math.max(0, Date.now() - callbackAt),
        });
        return isActive() && buildLocationRequestHeaders(technicianToken) ? technicianToken : null;
      },
      request: async (technicianToken) => {
        // This is the last asynchronous boundary before HTTP. A callback that
        // expired while storage/auth resolved must never start a late fetch.
        if (!isActive()) throw new Error("CALLBACK_BUDGET_EXPIRED");
        const stillOwner = await trackingLifecycle.isCurrent(state, callbackGeneration, isActive);
        if (!isActive() || !stillOwner) throw new Error("LOCATION_OWNER_STALE");
        const headers = buildLocationRequestHeaders(technicianToken);
        if (!headers) throw new Error("LOCATION_CREDENTIAL_UNAVAILABLE");
        requestStartedAt = Date.now();
        debugAttemptId = beginDebugUpload(state, callbackGeneration);
        if (debugAttemptId === null) throw new Error("LOCATION_OWNER_STALE");
        emitDebug({
          lat: queuedLocation.lat, lng: queuedLocation.lng, speed: queuedLocation.speed, heading: queuedLocation.heading, accuracy: queuedLocation.accuracy,
          lastAttemptAt: requestStartedAt, attemptCount: debugState.attemptCount + 1,
          lastCallbackStage: "HTTP_REQUEST", lastCallbackStageAt: requestStartedAt,
          lastCallbackStageElapsedMs: Math.max(0, requestStartedAt - callbackAt),
          lastAttemptStage: "HTTP_REQUEST", lastAttemptStageAt: requestStartedAt, lastAttemptStageElapsedMs: 0,
          serverStatus: "uploading", serverError: null, source: "foreground-service-task",
        });
        const timeout = createRequestTimeout(Math.min(requestBudgetMs, taskFence ? taskFence.remainingMs() : requestBudgetMs));
        try {
          if (!isActive()) throw new Error("CALLBACK_BUDGET_EXPIRED");
          const pendingFetch = fetch(`${getApiBaseUrl()}/api/location/update`, {
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
          // Fetch is now irrevocably started. A replacement/terminal response
          // may invalidate authority immediately afterwards, but this exact
          // session still records one attempt without affecting the successor.
          recordStartedAttempt(requestStartedAt, () => true);
          return await pendingFetch;
        } finally {
          timeout.dispose();
        }
      },
    }).catch((error: unknown) => ({ kind: "REQUEST_ERROR" as const, error })));

    if (guardedResult.kind !== "VALUE" || !isActive()) return;
    const guarded = guardedResult.value;

    if (guarded.kind === "STALE") return;
    if (guarded.kind === "MISSING_CREDENTIAL") {
      scheduleSessionDiagnostics(state, taskFence, () => runtimeDiagnostics.patch(state, {
        lastErrorCode: "MISSING_CREDENTIAL", lastErrorAt: Date.now(),
      }, isActive), () => false);
      if (completeDebugCallback(state, callbackOwner ?? undefined, "error") && canPersistCurrentCallback()) {
        emitDebug({ serverStatus: "error", serverError: "기사 로그인 인증 정보가 없어 위치를 전송하지 못했습니다." });
      }
      return;
    }
    if (guarded.kind === "REQUEST_ERROR") {
      const ownerAfterError = await withinTaskDeadline(taskFence, () => trackingLifecycle.isCurrent(state, callbackGeneration, isActive));
      if (ownerAfterError.kind !== "VALUE" || !ownerAfterError.value || !isActive()) return;
      const canPublishResult = debugAttemptId === null
        ? canPublishCurrentCallback()
        : finishDebugUpload(state, callbackGeneration, debugAttemptId);
      const errorCode = guarded.error instanceof Error && guarded.error.name === "AbortError" ? "NETWORK_TIMEOUT" : "NETWORK_ERROR";
      scheduleSessionDiagnostics(state, taskFence, () => runtimeDiagnostics.patch(state, {
        lastErrorCode: errorCode, lastErrorAt: Date.now(),
      }, isActive), () => false);
      if (canPublishResult && completeDebugCallback(state, callbackOwner ?? undefined, "error") && canPersistCurrentCallback()) {
        emitDebug({ serverStatus: "error", serverError: timeoutMessage(guarded.error) });
      }
      return;
    }

    const response = guarded.response;
    const responseHeadersAt = Date.now();
    recordCallbackStage(state, "HTTP_HEADERS", callbackAt, requestStartedAt, canPublishCurrentCallback);
    // The HTTP status alone is sufficient for these terminal outcomes. This
    // authority decision must not wait for the best-effort attempt counter;
    // otherwise a stalled setItem would let a later TaskManager callback upload
    // the same terminal session again.
    if ([401, 403, 404, 409].includes(response.status)) {
      if (canPublishCurrentCallback()) {
        emitDebug({ lastResponseAt: responseHeadersAt, lastResponseHeadersAt: responseHeadersAt });
      }
      // Terminal invalidation is safety-critical and must not be skipped if a
      // newer callback owns the view; only its visual publication is owned.
      void completeDebugCallback(state, callbackOwner ?? undefined, "terminal");
      deactivateAfterTerminalResponse(state);
      return;
    }

    const responseBodyBudgetMs = taskFence
      ? Math.min(RESPONSE_BODY_TIMEOUT_MS, taskFence.remainingMs())
      : RESPONSE_BODY_TIMEOUT_MS;
    if (responseBodyBudgetMs <= 0 || !isActive()) return;
    const parsedResult = await withinTaskDeadline(taskFence, () => parseJsonWithin(response, responseBodyBudgetMs));
    if (parsedResult.kind !== "VALUE" || !isActive()) return;
    const ownerAfterBody = await withinTaskDeadline(taskFence, () => trackingLifecycle.isCurrent(state, callbackGeneration, isActive));
    if (ownerAfterBody.kind !== "VALUE" || !ownerAfterBody.value || !isActive()) return;
    const responseBodyAt = Date.now();
    const parsed = parsedResult.value;
    if (parsed.kind === "TIMEOUT") {
      const canPublishResult = debugAttemptId === null
        ? canPublishCurrentCallback()
        : finishDebugUpload(state, callbackGeneration, debugAttemptId);
      scheduleSessionDiagnostics(state, taskFence, () => runtimeDiagnostics.patch(state, {
        lastResponseAt: responseHeadersAt, lastResponseHeadersAt: responseHeadersAt,
        lastErrorCode: "RESPONSE_BODY_TIMEOUT", lastErrorAt: responseBodyAt,
      }, isActive), () => false);
      if (canPublishResult && completeDebugCallback(state, callbackOwner ?? undefined, "error") && canPersistCurrentCallback()) emitDebug({
        serverStatus: "error", serverError: "응답 본문 시간 초과로 위치 저장 여부를 확인하지 못했습니다.",
        lastResponseAt: responseHeadersAt, lastResponseHeadersAt: responseHeadersAt,
      });
      return;
    }
    recordCallbackStage(state, "RESPONSE_BODY", callbackAt, requestStartedAt, canPublishCurrentCallback);
    const payload = (parsed.kind === "JSON" ? parsed.value : null) as LocationUpdateResponseBody | null;
    const disposition = classifyLocationUpdateResponse(response.status, payload);
    if (disposition === "accepted") {
      const canPublishResult = debugAttemptId === null
        ? canPublishCurrentCallback()
        : finishDebugUpload(state, callbackGeneration, debugAttemptId);
      lastUploadMeasurement = { key, measuredAt: queuedLocation.measuredAt };
      const recordedAt = serverRecordedAt(payload?.updatedAt);
      // A Response can only arrive after request() captured the start timestamp.
      // The fallback is defensive for a nonstandard mock and is never a token or
      // coordinate-derived value.
      const acceptedAttemptStartedAt = requestStartedAt ?? responseHeadersAt;
      if (canPublishResult && completeDebugCallback(state, callbackOwner ?? undefined, "accepted") && canPersistCurrentCallback()) {
        emitDebug({
          serverStatus: "stored", serverError: null,
          lastResponseAt: responseBodyAt, lastResponseHeadersAt: responseHeadersAt, lastResponseBodyAt: responseBodyAt,
          lastAcceptedAt: responseBodyAt, lastStoredAt: recordedAt, storedCount: debugState.storedCount + 1,
          lastCallbackStage: "SERVER_ACCEPTED", lastCallbackStageAt: responseBodyAt,
          lastCallbackStageElapsedMs: Math.max(0, responseBodyAt - callbackAt),
          lastAttemptStage: "SERVER_ACCEPTED", lastAttemptStageAt: responseBodyAt,
          lastAttemptStageElapsedMs: Math.max(0, responseBodyAt - acceptedAttemptStartedAt),
        });
      }
      // Confirmed server acceptance must not wait for or be relabelled by the
      // best-effort session diagnostics queue. The direct immutable event is
      // later folded into that journal only while this exact callback still owns
      // the visible session; a late A event remains isolated in A's scope.
      void runtimeDiagnostics.recordAcceptedOutcome(state, {
        callbackAt,
        attemptStartedAt: acceptedAttemptStartedAt,
        responseHeadersAt,
        responseBodyAt,
        acceptedAt: responseBodyAt,
        storedAt: recordedAt,
      }, responseBodyAt).then((outcome) => {
        if (!outcome) return;
        void runtimeDiagnostics.update(state, (current) => ({
          ...current,
          lastResponseAt: responseBodyAt,
          lastResponseHeadersAt: responseHeadersAt,
          lastResponseBodyAt: responseBodyAt,
          lastAcceptedAt: responseBodyAt,
          lastStoredAt: recordedAt,
          lastErrorCode: null,
          lastErrorAt: null,
          lastCallbackStage: "SERVER_ACCEPTED",
          lastCallbackStageAt: responseBodyAt,
          lastCallbackStageElapsedMs: Math.max(0, responseBodyAt - callbackAt),
          lastAttemptStage: "SERVER_ACCEPTED",
          lastAttemptStageAt: responseBodyAt,
          lastAttemptStageElapsedMs: Math.max(0, responseBodyAt - acceptedAttemptStartedAt),
        }), canPersistCurrentCallback).then((diagnostics) => {
          if (diagnostics) emitPersistedDiagnostics(diagnostics, canPublishCurrentCallback);
        }).catch(() => undefined);
      }).catch(() => undefined);
      return;
    }
    if (disposition === "ignored") {
      const canPublishResult = debugAttemptId === null
        ? canPublishCurrentCallback()
        : finishDebugUpload(state, callbackGeneration, debugAttemptId);
      lastUploadMeasurement = { key, measuredAt: queuedLocation.measuredAt };
      scheduleSessionDiagnostics(state, taskFence, () => runtimeDiagnostics.update(state, (current) => ({
        ...current,
        lastResponseAt: responseBodyAt,
        lastResponseHeadersAt: responseHeadersAt,
        lastResponseBodyAt: responseBodyAt,
        lastErrorCode: "IGNORED_OLDER_OR_DUPLICATE",
        lastErrorAt: responseBodyAt,
        ignoredCount: current.ignoredCount + 1,
      }), isActive), () => false);
      if (canPublishResult && completeDebugCallback(state, callbackOwner ?? undefined, "ignored") && canPersistCurrentCallback()) emitDebug({ serverStatus: "ignored", serverError: "이전 또는 중복 위치 측정값으로 새 저장은 발생하지 않았습니다.", lastResponseAt: responseBodyAt, lastResponseHeadersAt: responseHeadersAt, lastResponseBodyAt: responseBodyAt, ignoredCount: debugState.ignoredCount + 1 });
      return;
    }
    if (disposition === "terminal") {
      // A newer callback can own the view while this response terminates the
      // same session. UI ownership must never gate authority invalidation.
      void completeDebugCallback(state, callbackOwner ?? undefined, "terminal");
      if (deactivateAfterTerminalResponse(state)) {
        emitDebug({
          serverStatus: "error",
          serverError: formatLocationRequestFailure(response.status, payload?.error),
          lastResponseAt: responseBodyAt,
          lastResponseHeadersAt: responseHeadersAt,
          lastResponseBodyAt: responseBodyAt,
        });
      }
      return;
    }
    const canPublishResult = debugAttemptId === null
      ? canPublishCurrentCallback()
      : finishDebugUpload(state, callbackGeneration, debugAttemptId);
    scheduleSessionDiagnostics(state, taskFence, () => runtimeDiagnostics.patch(state, {
      lastResponseAt: responseBodyAt,
      lastResponseHeadersAt: responseHeadersAt,
      lastResponseBodyAt: responseBodyAt,
      lastErrorCode: parsed.kind === "INVALID" ? "INVALID_RESPONSE_BODY" : "SERVER_RETRYABLE",
      lastErrorAt: responseBodyAt,
    }, isActive), () => false);
    if (canPublishResult && completeDebugCallback(state, callbackOwner ?? undefined, "error") && canPersistCurrentCallback()) emitDebug({ serverStatus: "error", serverError: formatLocationRequestFailure(response.status, payload?.error), lastResponseAt: responseBodyAt, lastResponseHeadersAt: responseHeadersAt, lastResponseBodyAt: responseBodyAt });
  });

  const queuedResult = await withinTaskDeadline(taskFence, () => queuedUpload);
  if (queuedResult.kind !== "VALUE" || !isActive()) publishCallbackDeadline(state, callbackAt, callbackOwner ?? undefined);
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
    : await getStoredLocationBearerToken();
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
  const current = trackingLifecycle.currentIntent();
  if (current) invalidateLocationStatusOverlayOwner(current);
  else invalidateActiveLocationStatusOverlayOwner();
  const stopped = await trackingLifecycle.stopCurrent();
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  if (stopped) {
    emitPersistedDiagnostics(await runtimeDiagnostics.finalize(stopped));
    const matchingSnapshot = authSnapshot?.technicianUserId === stopped.technicianUserId ? authSnapshot : null;
    void notifySessionStop(stopped.token, reason, stopped.technicianUserId, matchingSnapshot);
  }
}

/**
 * Used only by a delayed owner/orphan reconciliation. The passed state is
 * verified again against the persisted state and lifecycle generation before
 * local shutdown, so an old A reconciliation cannot stop a newer B share.
 */
export async function stopExactStoredTrackingAndNotify(
  state: PersistedTrackingState,
  reason: TrackingStopReason,
): Promise<void> {
  invalidateLocationStatusOverlayOwner(state);
  const stopped = await trackingLifecycle.stopStoredExact(state);
  if (!stopped) return;
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  emitPersistedDiagnostics(await runtimeDiagnostics.finalize(stopped));
  void notifySessionStop(stopped.token, reason, stopped.technicianUserId);
}

const trackingLifecycle = new TrackingLifecycleCoordinator<PersistedTrackingState>({
  read: getPersistedTrackingState,
  save: saveTrackingState,
  clearIfSame: clearTrackingStateIfSame,
  markInactive: markTrackingStateInactive,
  isInactive: isTrackingStateInactive,
  markPermissionPending: markTrackingStatePermissionPending,
  clearPermissionPending: clearTrackingStatePermissionPending,
  isPermissionPending: isTrackingStatePermissionPending,
  showControlNotification: ensureControlNotification,
  clearControlNotification,
  isNativeCollectionRegistered: isNativeLocationTaskRegistered,
  startNativeCollection: startNativeLocationTask,
  stopNativeCollection: stopNativeLocationTask,
  onStateChanged: emitTrackingState,
});

async function handleTrackingNotificationResponse(response: Notifications.NotificationResponse | null): Promise<void> {
  if (!response || response.actionIdentifier !== STOP_TRACKING_NOTIFICATION_ACTION) return;
  const data = response.notification.request.content.data;
  const current = trackingLifecycle.currentIntent();
  if (current && !matchesTrackingStopAction(current, data)) return;
  if (current) invalidateLocationStatusOverlayOwner(current);
  else invalidateActiveLocationStatusOverlayOwner();
  const stopped = current
    ? await trackingLifecycle.stopCurrent()
    : await trackingLifecycle.stopStoredIf((state) => matchesTrackingStopAction(state, data));
  lastUploadMeasurement = { key: "", measuredAt: 0 };
  if (stopped) {
    emitPersistedDiagnostics(await runtimeDiagnostics.finalize(stopped));
    void notifySessionStop(stopped.token, "업무취소", stopped.technicianUserId);
  }
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
      const token = await getStoredLocationBearerToken();
      return buildLocationRequestHeaders(token) ? token : null;
    },
  });
  return adopted?.state ?? null;
}

/**
 * Returns only the newest privacy-safe callback record that could not be tied
 * to a session. Callers must keep it separate from session A/B diagnostics.
 */
export async function getLatestUnboundLocationTaskEvent(): Promise<UnboundLocationTaskEvent | null> {
  return runtimeDiagnostics.readUnboundTaskEvent();
}

/**
 * UI lifecycle observation only. It never reads a location, starts HTTP, or
 * revives a stored session. The exact owner/generation guard keeps a late A
 * AppState listener from writing into B's diagnostic scope.
 */
export function recordLocationTrackingAppState(nextState: string): void {
  const state = trackingLifecycle.currentIntent();
  if (!state) return;
  const generation = trackingLifecycle.captureGeneration();
  const marker: LocationAppStateMarker = nextState === "active"
    ? "active"
    : nextState === "background"
      ? "background"
      : nextState === "inactive"
        ? "inactive"
        : "unknown";
  const observedAt = Date.now();
  const canPublish = () => isCurrentDebugOwner(state, generation);
  if (!canPublish()) return;
  emitDebug({ lastAppState: marker, lastAppStateAt: observedAt });
  void runtimeDiagnostics.patch(state, {
    lastAppState: marker,
    lastAppStateAt: observedAt,
  }, canPublish).then((diagnostics) => {
    if (diagnostics) emitPersistedDiagnostics(diagnostics, canPublish);
  }).catch(() => undefined);
}

if (Platform.OS !== "web") {
  Notifications.addNotificationResponseReceivedListener((response) => {
    void handleTrackingNotificationResponse(response);
  });
  void Notifications.getLastNotificationResponseAsync().then(handleTrackingNotificationResponse).catch(() => undefined);
}

export function registerLocationTrackingTask(): boolean {
  if (Platform.OS === "web") return false;
  try {
    if (TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) return true;
    {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        const taskFence = new TaskCallbackDeadlineFence(createTaskDeadline(TASK_CALLBACK_TOTAL_BUDGET_MS));
        const callbackEnteredAt = Date.now();
        // This module-level immutable receipt is deliberately not assigned to a
        // session. It distinguishes "Task callback entered" from no observed
        // callback even when headless adoption later fails or local diagnostics
        // stall. It is detached from the collection/upload critical path.
        void recordUnboundTaskCallback("TASK_CALLBACK_ENTERED", callbackEnteredAt, taskFence);
        if (error) {
          const permissionRevoked = isConfirmedNativeLocationPermissionError(error);
          const permissionErrorOwner = permissionRevoked ? trackingLifecycle.currentIntent() : null;
          if (permissionRevoked && taskFence.isActive()) {
            // No journal await may precede this exact-owner fence. A stalled
            // diagnostic write previously left native authority alive long
            // enough for a following callback to issue one more HTTP update.
            suspendCurrentTrackingForPermissionRevocation(permissionErrorOwner);
            void recordUnboundTaskCallback("TASK_NATIVE_PERMISSION_REVOKED", callbackEnteredAt, taskFence);
            return;
          }
          await recordUnboundTaskCallback("TASK_NATIVE_ERROR", callbackEnteredAt, taskFence);
          return;
        }
        const taskLocations = (Array.isArray(data?.locations) ? data.locations : []) as {
          timestamp?: number;
          coords?: { latitude?: number; longitude?: number; speed?: number | null; heading?: number | null; accuracy?: number | null };
        }[];
        const latest = selectNewestFreshLocation(taskLocations, Date.now(), MAX_MEASUREMENT_AGE_MS);
        if (!latest) {
          await recordUnboundTaskCallback("NO_FRESH_MEASUREMENT", callbackEnteredAt, taskFence);
          return;
        }
        // Keep a small, dedicated tail budget for the unbound timeout marker.
        // Otherwise a stalled credential/read could consume all 10 seconds and
        // make "callback entered but adoption timed out" indistinguishable from
        // a callback that was never observed.
        const adoptionBudgetMs = Math.max(0, taskFence.remainingMs() - TASK_ENTRY_EVENT_BUDGET_MS);
        if (adoptionBudgetMs <= 0) {
          await recordUnboundTaskCallback("ADOPTION_TIMEOUT", callbackEnteredAt, taskFence);
          return;
        }
        const adoptionFence = new TaskCallbackDeadlineFence(createTaskDeadline(adoptionBudgetMs));
        let adoptedResult: TaskDeadlineResult<Awaited<ReturnType<typeof adoptHeadlessTrackingWithCredentialResult>>>;
        try {
          adoptedResult = await adoptionFence.run(() => adoptHeadlessTrackingWithCredentialResult({
            lifecycle: trackingLifecycle,
            getBearerToken: async () => {
              if (!taskFence.isActive() || !adoptionFence.isActive()) return null;
              const token = await getStoredLocationBearerToken();
              return taskFence.isActive() && adoptionFence.isActive() && buildLocationRequestHeaders(token) ? token : null;
            },
            isActive: () => taskFence.isActive() && adoptionFence.isActive(),
          }));
        } catch {
          await recordUnboundTaskCallback("ADOPTION_ERROR", callbackEnteredAt, taskFence);
          return;
        }
        if (adoptedResult.kind !== "VALUE" || !taskFence.isActive()) {
          await recordUnboundTaskCallback("ADOPTION_TIMEOUT", callbackEnteredAt, taskFence);
          return;
        }
        const adopted = adoptedResult.value;
        if (adopted.kind !== "ADOPTED") {
          if (adopted.kind !== "INACTIVE") {
            await recordUnboundTaskCallback(
              adopted.kind === "NO_CREDENTIAL" ? "NO_CREDENTIAL" : "NO_ADOPTABLE_SESSION",
              callbackEnteredAt,
              taskFence,
            );
          }
          return;
        }
        const permissionEligibility = await taskFence.run(readExistingTrackingPermissionEligibility);
        if (permissionEligibility.kind !== "VALUE" || !taskFence.isActive()) {
          await recordUnboundTaskCallback("PERMISSION_CHECK_TIMEOUT", callbackEnteredAt, taskFence);
          return;
        }
        if (!permissionEligibility.value.eligible) {
          if (permissionEligibility.value.status === "denied") {
            deactivateAfterTerminalResponse(
              adopted.state,
              "LOCATION_PERMISSION_DENIED",
              "위치 권한이 변경되어 위치 공유를 중지했습니다. 앱을 연 뒤 권한을 확인해 주세요.",
            );
          } else {
            await recordUnboundTaskCallback("PERMISSION_CHECK_UNAVAILABLE", callbackEnteredAt, taskFence);
          }
          return;
        }
        const callbackAt = callbackEnteredAt;
        const callbackGeneration = trackingLifecycle.captureGeneration();
        const callbackOwner = beginDebugCallback(adopted.state, callbackGeneration);
        if (!callbackOwner) return;
        const canPublish = () => taskFence.isActive()
          && trackingLifecycle.isGenerationCurrent(callbackGeneration)
          && sameTrackingLifecycleState(trackingLifecycle.currentIntent(), adopted.state)
          && ownsCurrentDebugCallback(adopted.state, callbackOwner);
        // Initial callback observation is in-memory only. Durable diagnostics
        // begin after the actual fetch is invoked, so a slow AsyncStorage read
        // or write can never consume this callback's HTTP/body budget.
        emitDebug({
          lastCallbackAt: callbackAt,
          lastMeasuredAt: Number(latest.timestamp),
          nativeRegistration: "registered",
          lastNativeCheckAt: callbackAt,
          source: "foreground-service-task",
          lastCallbackStage: "ADOPTED",
          lastCallbackStageAt: callbackAt,
          lastCallbackStageElapsedMs: 0,
        });
        const lat = Number(latest.coords?.latitude);
        const lng = Number(latest.coords?.longitude);
        if (!latest.coords || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          scheduleSessionDiagnostics(adopted.state, taskFence, () => runtimeDiagnostics.patch(adopted.state, {
            lastCallbackAt: callbackAt,
            lastMeasuredAt: Number(latest.timestamp),
            nativeRegistration: "registered",
            lastNativeCheckAt: callbackAt,
            lastErrorCode: "COORDINATE_INVALID",
            lastErrorAt: Date.now(),
          }, canPublish), canPublish);
          if (completeDebugCallback(adopted.state, callbackOwner, "error") && canPublish()) {
            emitDebug({ serverStatus: "error", serverError: "위치 좌표 형식을 확인하지 못했습니다.", source: "foreground-service-task" });
          }
          return;
        }
        await sendLocationToServer(adopted.state, {
          lat,
          lng,
          speed: latest.coords.speed ?? null,
          heading: latest.coords.heading ?? null,
          accuracy: latest.coords.accuracy ?? null,
          measuredAt: Number(latest.timestamp),
        }, adopted.bearerToken, taskFence, callbackAt, callbackOwner);
      });
    }
    return true;
  } catch (error) {
    console.warn("[LocationTracking] task registration failed", error);
    return false;
  }
}
