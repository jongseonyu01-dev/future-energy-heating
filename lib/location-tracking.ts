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
import { getSessionToken } from "@/lib/_core/auth";
import { API_BASE_URL } from "@/constants/oauth";

const TRACKING_TOKEN_KEY = "location_tracking_token";
const TRACKING_ACTIVE_KEY = "location_tracking_active";
const TRACKING_SESSION_KEY = "location_tracking_session_v1";
const BACKGROUND_TASK_NAME = "FUTURE_ENERGY_LOCATION_TASK";
const TERMINAL_SESSION_HTTP_STATUSES = new Set([404, 409, 410]);

export interface PersistedLocationTrackingSession {
  token: string;
  requestId: number | null;
  trackingUrl: string | null;
  backgroundEnabled: boolean;
  ownerUserId: number | null;
  ownerTechnicianId: number | null;
}

export type TrackingSessionValidation =
  | { state: "active"; status: "이동중" }
  | { state: "terminal"; status: string | null; httpStatus: number }
  | { state: "unavailable"; httpStatus: number | null };

export type ResumeTrackingResult =
  | { state: "restored"; session: PersistedLocationTrackingSession }
  | { state: "none" | "terminal" | "stale" | "owner-mismatch" }
  | { state: "unavailable"; httpStatus: number | null };

export type SessionStopResult =
  | { ok: true; alreadyTerminal: boolean; httpStatus: number }
  | { ok: false; httpStatus: number | null; error: string };

export interface LocationSendOptions {
  /** TaskManager cold/headless callback에서 SecureStore로 직접 읽은 인증 token. */
  authorizationToken?: string;
  /** React AuthProvider가 없는 headless 실행에서만 in-memory gate 우회를 허용한다. */
  allowHeadless?: boolean;
}

export interface LocationTrackingAuthSnapshot {
  generation: number;
  sessionToken: string;
  userId: number | null;
  technicianId: number | null;
}

type TrackingResponseBody = {
  error?: unknown;
  status?: unknown;
  ended?: unknown;
};

let _lifecycleQueue: Promise<void> = Promise.resolve();
let _lifecycleEpoch = 0;
let _desiredTrackingToken: string | null = null;
let _trackingAuthGeneration = 0;
let _trackingAuthEnabled = false;
let _trackingAuthSessionToken: string | null = null;
let _trackingAuthUserId: number | null = null;
let _trackingAuthTechnicianId: number | null = null;

function enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const run = _lifecycleQueue.then(operation, operation);
  _lifecycleQueue = run.then(() => undefined, () => undefined);
  return run;
}

function beginStartIntent(token: string): number {
  _lifecycleEpoch += 1;
  _desiredTrackingToken = token;
  return _lifecycleEpoch;
}

function beginStopIntent(): number {
  _lifecycleEpoch += 1;
  _desiredTrackingToken = null;
  return _lifecycleEpoch;
}

function isCurrentStartIntent(epoch: number, token: string): boolean {
  return _lifecycleEpoch === epoch && _desiredTrackingToken === token;
}

/** 인증 삭제가 시작되는 즉시 호출해 늦은 출발/복구가 GPS를 되살리지 못하게 한다. */
export function invalidateLocationTrackingAuth(): number {
  _trackingAuthGeneration += 1;
  _trackingAuthEnabled = false;
  _trackingAuthSessionToken = null;
  _trackingAuthUserId = null;
  _trackingAuthTechnicianId = null;
  beginStopIntent();
  return _trackingAuthGeneration;
}

/** 유효한 인증 token 저장이 모두 끝난 뒤에만 위치 시작 gate를 연다. */
export function enableLocationTrackingAuth(
  sessionToken: string,
  userId?: number | null,
  technicianId?: number | null,
): LocationTrackingAuthSnapshot {
  if (!sessionToken) throw new Error("위치 추적 인증 token이 없습니다.");
  _trackingAuthGeneration += 1;
  _trackingAuthEnabled = true;
  _trackingAuthSessionToken = sessionToken;
  _trackingAuthUserId = typeof userId === "number" && Number.isSafeInteger(userId)
    ? userId
    : null;
  _trackingAuthTechnicianId = typeof technicianId === "number" && Number.isSafeInteger(technicianId)
    ? technicianId
    : null;
  return {
    generation: _trackingAuthGeneration,
    sessionToken,
    userId: _trackingAuthUserId,
    technicianId: _trackingAuthTechnicianId,
  };
}

export function getLocationTrackingAuthSnapshot(): LocationTrackingAuthSnapshot | null {
  if (!_trackingAuthEnabled || !_trackingAuthSessionToken) return null;
  return {
    generation: _trackingAuthGeneration,
    sessionToken: _trackingAuthSessionToken,
    userId: _trackingAuthUserId,
    technicianId: _trackingAuthTechnicianId,
  };
}

export function isLocationTrackingAuthSnapshotCurrent(
  snapshot: LocationTrackingAuthSnapshot,
): boolean {
  return _trackingAuthEnabled
    && snapshot.generation === _trackingAuthGeneration
    && snapshot.sessionToken === _trackingAuthSessionToken
    && snapshot.userId === _trackingAuthUserId
    && snapshot.technicianId === _trackingAuthTechnicianId;
}

async function readTrackingResponseBody(response: Response): Promise<TrackingResponseBody | null> {
  try {
    const body = await response.json();
    return body && typeof body === "object" ? body as TrackingResponseBody : null;
  } catch {
    return null;
  }
}

function getTrackingStatus(body: TrackingResponseBody | null): string | null {
  return typeof body?.status === "string" ? body.status : null;
}

function isTerminalTrackingResponse(
  httpStatus: number,
  body: TrackingResponseBody | null,
): boolean {
  const status = getTrackingStatus(body);
  return TERMINAL_SESSION_HTTP_STATUSES.has(httpStatus)
    || body?.ended === true
    || (status !== null && status !== "이동중");
}

function isAlreadyTerminalStopResponse(
  httpStatus: number,
  body: TrackingResponseBody | null,
): boolean {
  // 인증 실패는 세션의 종료 여부를 증명하지 않는다. 인증 복구/재시도가
  // 가능하도록 로컬 token을 반드시 보존한다.
  if (httpStatus === 401 || httpStatus === 403) return false;
  const status = getTrackingStatus(body);
  return httpStatus === 404
    || httpStatus === 410
    || body?.ended === true
    || (status !== null && status !== "이동중");
}

function getTrackingResponseError(
  body: TrackingResponseBody | null,
  fallback: string,
): string {
  return typeof body?.error === "string" && body.error.trim()
    ? body.error
    : fallback;
}

function isPersistedBackgroundDeliveryEnabled(rawSession: string | null): boolean {
  if (!rawSession) return false;
  try {
    const session = JSON.parse(rawSession) as Partial<PersistedLocationTrackingSession>;
    return session.backgroundEnabled === true;
  } catch {
    return false;
  }
}

function isTrackingSessionOwnedByAuth(
  session: PersistedLocationTrackingSession,
  authSnapshot: LocationTrackingAuthSnapshot,
): boolean {
  return session.ownerUserId !== null
    && session.ownerTechnicianId !== null
    && session.ownerUserId === authSnapshot.userId
    && session.ownerTechnicianId === authSnapshot.technicianId;
}

export async function getPersistedTrackingSession(): Promise<PersistedLocationTrackingSession | null> {
  try {
    const values = await AsyncStorage.multiGet([
      TRACKING_ACTIVE_KEY,
      TRACKING_TOKEN_KEY,
      TRACKING_SESSION_KEY,
    ]);
    const valueMap = new Map(values);
    if (valueMap.get(TRACKING_ACTIVE_KEY) !== "true") return null;

    const rawSession = valueMap.get(TRACKING_SESSION_KEY);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession) as Partial<PersistedLocationTrackingSession>;
        const requestId = Number(parsed.requestId);
        const ownerUserId = Number(parsed.ownerUserId);
        const ownerTechnicianId = Number(parsed.ownerTechnicianId);
        if (typeof parsed.token === "string" && parsed.token.length > 0) {
          return {
            token: parsed.token,
            requestId: Number.isInteger(requestId) && requestId > 0 ? requestId : null,
            trackingUrl: typeof parsed.trackingUrl === "string" && parsed.trackingUrl.length > 0
              ? parsed.trackingUrl
              : null,
            backgroundEnabled: parsed.backgroundEnabled === true,
            ownerUserId: Number.isSafeInteger(ownerUserId) && ownerUserId > 0
              ? ownerUserId
              : null,
            ownerTechnicianId: Number.isSafeInteger(ownerTechnicianId) && ownerTechnicianId > 0
              ? ownerTechnicianId
              : null,
          };
        }
      } catch {
        // v1.1.17 이하 세션은 기존 token 키로 복구한다.
      }
    }

    const legacyToken = valueMap.get(TRACKING_TOKEN_KEY);
    return legacyToken
      ? {
          token: legacyToken,
          requestId: null,
          trackingUrl: null,
          backgroundEnabled: false,
          ownerUserId: null,
          ownerTechnicianId: null,
        }
      : null;
  } catch {
    return null;
  }
}

/** 이전 버전 세션에 마지막 저장 로그인 소유자를 한 번만 기록한다. */
export function bindPersistedTrackingOwnerIfMissing(
  userId: number,
  technicianId: number | null | undefined,
): Promise<boolean> {
  return enqueueLifecycle(async () => {
    if (!Number.isSafeInteger(userId) || userId <= 0) return false;
    const normalizedTechnicianId = typeof technicianId === "number"
      && Number.isSafeInteger(technicianId)
      && technicianId > 0
      ? technicianId
      : null;
    const persisted = await getPersistedTrackingSession();
    if (!persisted) return true;
    if (persisted.ownerUserId !== null && persisted.ownerUserId !== userId) return false;
    if (
      persisted.ownerTechnicianId !== null
      && persisted.ownerTechnicianId !== normalizedTechnicianId
    ) return false;
    await AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify({
      ...persisted,
      ownerUserId: persisted.ownerUserId ?? userId,
      ownerTechnicianId: persisted.ownerTechnicianId ?? normalizedTechnicianId,
    }));
    return true;
  });
}

/** 공유 단말에서 다른 계정이 보존된 기사 방문을 탈취·덮어쓰지 못하게 한다. */
export async function isPersistedTrackingOwnedBy(
  userId: number,
  technicianId: number | null | undefined,
): Promise<boolean> {
  const persisted = await getPersistedTrackingSession();
  if (!persisted) return true;
  const normalizedTechnicianId = typeof technicianId === "number"
    && Number.isSafeInteger(technicianId)
    && technicianId > 0
    ? technicianId
    : null;
  return persisted.ownerUserId === userId
    && persisted.ownerTechnicianId === normalizedTechnicianId;
}

async function authorizedJsonHeaders(
  overrideSessionToken?: string,
): Promise<Record<string, string>> {
  const sessionToken = overrideSessionToken || await getSessionToken();
  return {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };
}

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

const _debugListeners: ((state: LocationDebugState) => void)[] = [];
const _trackingStoppedListeners: (() => void)[] = [];

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

export function subscribeTrackingStopped(cb: () => void) {
  _trackingStoppedListeners.push(cb);
  return () => {
    const idx = _trackingStoppedListeners.indexOf(cb);
    if (idx !== -1) _trackingStoppedListeners.splice(idx, 1);
  };
}

function emitTrackingStopped() {
  for (const cb of _trackingStoppedListeners) cb();
}

// ─── 전역 포그라운드 인터벌 ────────────────────────────────────────────────
let _globalFgInterval: ReturnType<typeof setInterval> | null = null;

export function startGlobalFgInterval() {
  if (_globalFgInterval) return;
  _globalFgInterval = setInterval(async () => {
    if (!_trackingAuthEnabled) return;
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

export async function validateTrackingSession(
  token: string,
  authorizationToken?: string,
): Promise<TrackingSessionValidation> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/location/session/${encodeURIComponent(token)}`,
      { method: "GET", headers: await authorizedJsonHeaders(authorizationToken) },
    );
    const body = await readTrackingResponseBody(response);
    const status = getTrackingStatus(body);

    // SecureStore의 일시적인 읽기 실패나 만료된 로그인 인증은 위치 세션 자체가
    // 끝났다는 뜻이 아니다. 401/403에서는 저장 세션을 지우지 않는다.
    if (response.status === 401 || response.status === 403) {
      return { state: "unavailable", httpStatus: response.status };
    }
    if (response.ok && status === "이동중" && body?.ended !== true) {
      return { state: "active", status: "이동중" };
    }
    if (isTerminalTrackingResponse(response.status, body)) {
      return { state: "terminal", status, httpStatus: response.status };
    }
    return { state: "unavailable", httpStatus: response.status };
  } catch {
    return { state: "unavailable", httpStatus: null };
  }
}

/**
 * 앱 재시작 복구 전 서버에서 세션이 실제 이동 중인지 확인한다.
 * 일시적인 통신 장애에서는 저장값을 보존하되, 종료된 세션은 즉시 완전히 정리한다.
 */
export async function resumeTrackingIfActive(
  authSnapshot: LocationTrackingAuthSnapshot,
): Promise<ResumeTrackingResult> {
  if (!isLocationTrackingAuthSnapshotCurrent(authSnapshot)) {
    return { state: "stale" };
  }
  const resumeEpoch = _lifecycleEpoch;
  const persisted = await getPersistedTrackingSession();
  if (!persisted) return { state: "none" };
  if (!isTrackingSessionOwnedByAuth(persisted, authSnapshot)) {
    return { state: "owner-mismatch" };
  }
  if (
    _lifecycleEpoch !== resumeEpoch
    || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
  ) return { state: "stale" };

  const validation = await validateTrackingSession(
    persisted.token,
    authSnapshot.sessionToken,
  );
  if (validation.state === "terminal") {
    await stopLocationTrackingIfToken(persisted.token);
    return { state: "terminal" };
  }
  if (
    _lifecycleEpoch !== resumeEpoch
    || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
  ) return { state: "stale" };
  if (validation.state === "unavailable") {
    return { state: "unavailable", httpStatus: validation.httpStatus };
  }

  const restored = await startLocationTrackingForEpoch(
    persisted,
    resumeEpoch,
    true,
    authSnapshot,
  );
  return restored
    ? { state: "restored", session: persisted }
    : { state: "stale" };
}

// ─── 백그라운드 태스크 정의 (전역 스코프 — 컴포넌트 밖) ───────────────────
// ⚠️ 이 블록은 반드시 모듈 최상위에 있어야 함
// 앱이 백그라운드에서 재시작될 때 태스크를 찾을 수 있도록 전역 등록
if (Platform.OS !== "web") {
  try {
    // 동기 require — 백그라운드 재시작 시 import() 비동기 불가
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager");
    if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
          console.error("[LocationTask] 오류:", error.message);
          return;
        }
        if (!data?.locations?.length) return;
        // cold/headless process는 generation 0이라 SecureStore 경로를 사용한다.
        // 반면 같은 process에서 logout/검증 중 gate가 닫힌 경우에는 즉시 중단한다.
        if (_trackingAuthGeneration > 0 && !_trackingAuthEnabled) return;

        const initialValues = new Map(await AsyncStorage.multiGet([
          TRACKING_ACTIVE_KEY,
          TRACKING_TOKEN_KEY,
          TRACKING_SESSION_KEY,
        ]));
        const token = initialValues.get(TRACKING_TOKEN_KEY);
        const isActive = initialValues.get(TRACKING_ACTIVE_KEY);
        if (
          !token
          || isActive !== "true"
          || !isPersistedBackgroundDeliveryEnabled(
            initialValues.get(TRACKING_SESSION_KEY) ?? null,
          )
        ) return;

        // OS가 headless process로 task만 깨운 경우 AuthProvider가 없어 module gate는
        // 기본 false다. SecureStore 인증을 직접 읽되 실패하면 이 회차만 건너뛴다.
        const headlessAuthorizationToken = await getSessionToken();
        if (!headlessAuthorizationToken) return;

        // 인증을 읽는 동안 logout이 active/token을 제거했을 수 있으므로 전송 직전에
        // 다시 확인한다. task는 어떠한 저장 상태도 재생성하지 않는다.
        const latestValues = new Map(await AsyncStorage.multiGet([
          TRACKING_ACTIVE_KEY,
          TRACKING_TOKEN_KEY,
          TRACKING_SESSION_KEY,
        ]));
        if (
          latestValues.get(TRACKING_ACTIVE_KEY) !== "true"
          || latestValues.get(TRACKING_TOKEN_KEY) !== token
          || !isPersistedBackgroundDeliveryEnabled(
            latestValues.get(TRACKING_SESSION_KEY) ?? null,
          )
        ) return;

        const { latitude, longitude, speed, heading, accuracy } = data.locations[0].coords;
        const now = Date.now();
        emitDebug({
          lat: latitude, lng: longitude,
          speed: speed ?? null, heading: heading ?? null, accuracy: accuracy ?? null,
          lastSentAt: now, source: "background-task",
        });

        await sendLocationToServer(
          token,
          latitude,
          longitude,
          speed ?? null,
          heading ?? null,
          accuracy ?? null,
          {
            authorizationToken: headlessAuthorizationToken,
            allowHeadless: true,
          },
        );
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
async function suspendLocationTrackingDelivery(): Promise<void> {
  stopGlobalFgInterval();

  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require("expo-location");
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  } catch (e) {
    console.error("[LocationTracking] 위치 추적 중단 실패:", e);
  }
}

async function clearLocationTrackingResources(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      TRACKING_ACTIVE_KEY,
      TRACKING_TOKEN_KEY,
      TRACKING_SESSION_KEY,
    ]);
  } catch (error) {
    console.warn("[LocationTracking] 세션 저장값 일괄 삭제 실패, 개별 정리 재시도:", error);
    await Promise.allSettled([
      AsyncStorage.removeItem(TRACKING_ACTIVE_KEY),
      AsyncStorage.removeItem(TRACKING_TOKEN_KEY),
      AsyncStorage.removeItem(TRACKING_SESSION_KEY),
    ]);
  }
  await suspendLocationTrackingDelivery();
  emitTrackingStopped();
}

async function startLocationTrackingForEpoch(
  session: PersistedLocationTrackingSession,
  epoch: number,
  adoptResumeIntent: boolean,
  authSnapshot: LocationTrackingAuthSnapshot,
): Promise<boolean> {
  return enqueueLifecycle(async () => {
    if (
      _lifecycleEpoch !== epoch
      || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
    ) return false;
    if (adoptResumeIntent) {
      if (_desiredTrackingToken && _desiredTrackingToken !== session.token) return false;
      _desiredTrackingToken = session.token;
    }
    if (
      !isCurrentStartIntent(epoch, session.token)
      || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
    ) return false;

    await AsyncStorage.multiSet([
      [TRACKING_TOKEN_KEY, session.token],
      [TRACKING_ACTIVE_KEY, "true"],
      [TRACKING_SESSION_KEY, JSON.stringify(session)],
    ]);
    if (
      !isCurrentStartIntent(epoch, session.token)
      || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
    ) return false;

    emitDebug({ sendCount: 0, serverOk: null, serverError: null });
    startGlobalFgInterval();

    if (Platform.OS === "web") return true;

    if (!session.backgroundEnabled) {
      // 이전 세션의 native task가 남아 있더라도 foreground-only 모드에서는
      // 중단한다. 중단 API가 실패해도 task callback의 persisted mode 검사가
      // 백그라운드 전송을 차단하므로 foreground interval은 계속 사용할 수 있다.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require("expo-location");
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      } catch (error) {
        console.warn("[LocationTracking] foreground-only native task 정리 실패:", error);
      }
      return isCurrentStartIntent(epoch, session.token)
        && isLocationTrackingAuthSnapshotCurrent(authSnapshot);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require("expo-location");
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      if (
        !isCurrentStartIntent(epoch, session.token)
        || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
      ) return false;
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      if (
        !isCurrentStartIntent(epoch, session.token)
        || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
      ) return false;

      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 5,
        foregroundService: {
          notificationTitle: "퓨처에너지테크 기사 앱",
          notificationBody: "고객 방문 중 위치를 공유하고 있습니다.",
          notificationColor: "#FF6B35",
        },
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
      });
      if (
        !isCurrentStartIntent(epoch, session.token)
        || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)
      ) return false;
      console.log("[LocationTracking] Foreground Service 시작 완료");
      return true;
    } catch (error) {
      console.error("[LocationTracking] Foreground Service 시작 실패:", error);
      if (
        isCurrentStartIntent(epoch, session.token)
        && isLocationTrackingAuthSnapshotCurrent(authSnapshot)
      ) {
        // 서버 rollback 실패 시 수동 종료할 수 있도록 token/requestId는 보존한다.
        await suspendLocationTrackingDelivery();
      }
      throw new Error("실시간 위치 공유 서비스를 시작하지 못했습니다.");
    }
  });
}

export function startLocationTracking(
  token: string,
  requestId: number | null,
  trackingUrl?: string | null,
  backgroundEnabled = false,
  authSnapshot?: LocationTrackingAuthSnapshot,
): Promise<boolean> {
  if (!authSnapshot || !isLocationTrackingAuthSnapshotCurrent(authSnapshot)) {
    return Promise.resolve(false);
  }
  const epoch = beginStartIntent(token);
  return startLocationTrackingForEpoch({
    token,
    requestId,
    trackingUrl: trackingUrl ?? null,
    backgroundEnabled,
    ownerUserId: authSnapshot.userId,
    ownerTechnicianId: authSnapshot.technicianId,
  }, epoch, false, authSnapshot);
}

// ─── 위치 추적 중단 ────────────────────────────────────────────────────────
export function stopLocationTracking(): Promise<void> {
  beginStopIntent();
  return enqueueLifecycle(clearLocationTrackingResources);
}

/** 늦게 도착한 과거 세션 응답이 새 세션을 중단하지 않도록 token 일치 시에만 정리한다. */
export function stopLocationTrackingIfToken(token: string): Promise<boolean> {
  return enqueueLifecycle(async () => {
    if (_desiredTrackingToken && _desiredTrackingToken !== token) return false;
    const currentToken = await AsyncStorage.getItem(TRACKING_TOKEN_KEY);
    if (_desiredTrackingToken && _desiredTrackingToken !== token) return false;
    if (currentToken !== token) return false;

    beginStopIntent();
    await clearLocationTrackingResources();
    return true;
  });
}

/** 서버 종료 확인 전 token은 보존하면서 위치 전송 자원만 중단한다. */
export function suspendLocationTrackingIfToken(token: string): Promise<boolean> {
  return enqueueLifecycle(async () => {
    if (_desiredTrackingToken && _desiredTrackingToken !== token) return false;
    const currentToken = await AsyncStorage.getItem(TRACKING_TOKEN_KEY);
    if (_desiredTrackingToken && _desiredTrackingToken !== token) return false;
    if (currentToken !== token) return false;
    await suspendLocationTrackingDelivery();
    return true;
  });
}

/**
 * 로그인 서버가 일시적으로 응답하지 않을 때 위치 전송 자원만 중단한다.
 * 저장된 방문 token/requestId/active 상태는 다음 정상 재인증 뒤 복구할 수 있도록
 * 그대로 두며, 인증 무효화 전에 시작된 늦은 lifecycle 작업보다 뒤에서 실행한다.
 */
export function suspendTrackingForAuthUnavailable(): Promise<void> {
  return enqueueLifecycle(suspendLocationTrackingDelivery);
}

/** v1.1.17 token-only 세션을 현재 기사 접수와 안전하게 다시 연결한다. */
export function adoptPersistedTrackingRequest(
  token: string,
  requestId: number,
  trackingUrl: string | null,
  authSnapshot: LocationTrackingAuthSnapshot,
): Promise<boolean> {
  return enqueueLifecycle(async () => {
    if (!isLocationTrackingAuthSnapshotCurrent(authSnapshot)) return false;
    const persisted = await getPersistedTrackingSession();
    if (!isLocationTrackingAuthSnapshotCurrent(authSnapshot)) return false;
    if (
      !persisted
      || !isTrackingSessionOwnedByAuth(persisted, authSnapshot)
      || persisted.token !== token
      || persisted.requestId !== null
    ) {
      return false;
    }

    await AsyncStorage.setItem(TRACKING_SESSION_KEY, JSON.stringify({
      ...persisted,
      requestId,
      trackingUrl: trackingUrl || persisted.trackingUrl,
    }));
    return isLocationTrackingAuthSnapshotCurrent(authSnapshot);
  });
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  speed?: number | null, heading?: number | null, accuracy?: number | null,
  options?: LocationSendOptions,
): Promise<"sent" | "terminal" | "auth-failed" | "failed"> {
  const explicitHeadlessAuthorization = options?.allowHeadless === true
    ? options.authorizationToken
    : null;
  const authorizationToken = explicitHeadlessAuthorization
    || (_trackingAuthEnabled ? _trackingAuthSessionToken : null);
  if (!authorizationToken) {
    return "auth-failed";
  }
  try {
    const resp = await fetch(`${API_BASE_URL}/api/location/update`, {
      method: "POST",
      // 검증을 마친 in-memory 인증 token을 우선 사용해 SecureStore 일시 읽기
      // 실패가 위치 세션 삭제로 이어지지 않게 한다.
      headers: await authorizedJsonHeaders(authorizationToken),
      body: JSON.stringify({ token, lat, lng, speed: speed ?? null, heading: heading ?? null, accuracy: accuracy ?? null }),
    });
    const body = await readTrackingResponseBody(resp);
    const now = Date.now();
    emitDebug({ serverOk: resp.ok, lastSuccessAt: resp.ok ? now : _debugState.lastSuccessAt, serverError: resp.ok ? null : `HTTP ${resp.status}`, sendCount: _debugState.sendCount + 1 });
    if (resp.status === 401 || resp.status === 403) {
      return "auth-failed";
    }
    if (isTerminalTrackingResponse(resp.status, body)) {
      await stopLocationTrackingIfToken(token);
      return "terminal";
    }
    return resp.ok ? "sent" : "failed";
  } catch (e: any) {
    emitDebug({ serverOk: false, serverError: e?.message || "네트워크 오류" });
    console.error("[LocationTracking] 위치 전송 실패:", e);
    return "failed";
  }
}

// ─── 세션 종료 서버 알림 ───────────────────────────────────────────────────
export async function notifySessionStop(
  token: string,
  reason: "도착완료" | "업무취소",
  options?: { authorizationToken?: string },
): Promise<SessionStopResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/location/stop`, {
      method: "POST",
      headers: await authorizedJsonHeaders(
        options?.authorizationToken || _trackingAuthSessionToken || undefined,
      ),
      body: JSON.stringify({ token, reason }),
      signal: controller.signal,
    });
    const body = await readTrackingResponseBody(response);
    if (response.ok) {
      return { ok: true, alreadyTerminal: false, httpStatus: response.status };
    }
    if (isAlreadyTerminalStopResponse(response.status, body)) {
      return { ok: true, alreadyTerminal: true, httpStatus: response.status };
    }
    const error = getTrackingResponseError(
      body,
      `위치 공유 종료 요청 실패 (HTTP ${response.status})`,
    );
    console.error("[LocationTracking] 세션 종료 알림 실패:", error);
    return { ok: false, httpStatus: response.status, error };
  } catch (error: any) {
    const message = error?.name === "AbortError"
      ? "위치 공유 종료 요청 시간이 초과되었습니다."
      : error?.message || "위치 공유 종료 요청 중 네트워크 오류가 발생했습니다.";
    console.error("[LocationTracking] 세션 종료 알림 실패:", message);
    return { ok: false, httpStatus: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/** 로그아웃·인증 세션 무효화 시 서버 종료를 시도한 뒤 로컬 추적을 반드시 정리한다. */
export async function stopTrackingForAuthInvalidation(options?: {
  notifyServer?: boolean;
}): Promise<void> {
  const persisted = await getPersistedTrackingSession();
  // headless TaskManager가 인증 삭제와 경합해도 전송 직전 재확인에서 즉시
  // 빠지도록 active flag를 서버 요청이나 느린 native 정리보다 먼저 내린다.
  try { await AsyncStorage.setItem(TRACKING_ACTIVE_KEY, "false"); } catch {}
  stopGlobalFgInterval();
  // 인증 토큰이 지워지기 전에 서버 알림을 시작하되, 네트워크 완료를 기다리느라
  // 기기 위치 task와 interval 정리가 늦어지지 않게 병렬로 처리한다.
  const serverStop = persisted && options?.notifyServer !== false
    ? notifySessionStop(persisted.token, "업무취소")
    : Promise.resolve<SessionStopResult | null>(null);
  try {
    await stopLocationTracking();
  } finally {
    // 인증 무효화에서는 결과와 무관하게 로컬 정리를 우선하는 best-effort 호출이다.
    await serverStop;
  }
}
