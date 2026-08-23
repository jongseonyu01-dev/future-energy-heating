import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("technician departure UI", () => {
  const scheduleSource = read("app/(tabs)/tech-schedule.tsx");
  const worksSource = read("app/(tabs)/tech-works.tsx");
  const visitTrackingSource = read("components/technician-visit-tracking.ts");
  const consentModalSource = read("components/location-consent-modal.tsx");

  it("keeps the schedule and searchable work-list routes independent", () => {
    expect(scheduleSource).toContain("export function TechScheduleScreen");
    expect(scheduleSource).toContain('defaultTab = "today"');
    expect(worksSource).toContain("작업 목록");
    expect(worksSource).toContain("TextInput");
    expect(worksSource).toContain("FILTER_TABS");
    expect(worksSource).toContain("✏️ 견적 작성");
    expect(worksSource).not.toContain("<TechScheduleScreen");
  });

  it("shows departure/reconnect controls on both routes without reopening after arrival", () => {
    expect(scheduleSource).toContain('"출발": "#FF6B35"');
    expect(scheduleSource).toContain('"도착": "#16A34A"');
    const departableBlock = visitTrackingSource.slice(
      visitTrackingSource.indexOf("DEPARTABLE_VISIT_STATUSES"),
      visitTrackingSource.indexOf("export interface TechnicianVisitWork"),
    );
    expect(departableBlock).toContain('"출발"');
    expect(departableBlock).not.toContain('"도착"');
    for (const source of [scheduleSource, worksSource]) {
      expect(source).toContain("useTechnicianVisitTracking");
      expect(source).toContain('work.status === "도착"');
      expect(source).toContain("✅ 도착 완료");
      expect(source).toContain("🚗 위치 공유 다시 연결");
      expect(source).toContain("🚗 고객 집으로 출발");
      expect(source).toContain("📍 다른 방문 위치 공유 중");
    }
  });

  it("marks arrival on the server before clearing local tracking", () => {
    const markArrivedIndex = visitTrackingSource.indexOf(
      "await markArrivedMutation.mutateAsync",
    );
    const localStopIndex = visitTrackingSource.indexOf(
      'await stopTracking("도착완료", { serverAlreadyStopped: true })',
    );
    const arrivalCacheIndex = visitTrackingSource.indexOf(
      "utils.repair.listMySchedule.setData",
    );
    expect(markArrivedIndex).toBeGreaterThan(-1);
    expect(arrivalCacheIndex).toBeGreaterThan(markArrivedIndex);
    expect(localStopIndex).toBeGreaterThan(arrivalCacheIndex);
  });

  it("keeps completed history in all and completed filters", () => {
    expect(worksSource).toContain(
      'const COMPLETED_STATUSES = new Set(["작업완료", "공사완료"])',
    );
    expect(worksSource).toContain('if (activeFilter === "전체") return true');
    expect(worksSource).toContain(
      'if (activeFilter === "작업완료") return COMPLETED_STATUSES.has(status)',
    );
  });

  it("blocks switching to another visit while location sharing is active", () => {
    expect(visitTrackingSource).toContain(
      "trackingToken && trackingRequestId !== work.id",
    );
    expect(visitTrackingSource).toContain(
      "현재 이동 중인 방문 건을 먼저 도착 또는 위치 공유 종료 처리해 주세요.",
    );
    expect(visitTrackingSource).toContain(
      "let departureLockRequestId: number | null = null",
    );
    expect(visitTrackingSource).toContain(
      "if (!acquireDepartureLock(work.id))",
    );
    expect(visitTrackingSource).toContain("releaseDepartureLock(work.id)");
  });

  it("rolls back the server session and never shows success when native tracking fails", () => {
    const failureStart = visitTrackingSource.indexOf("if (!trackResult.ok)");
    const failureEnd = visitTrackingSource.indexOf(
      'if (Platform.OS !== "web")',
      failureStart,
    );
    const failureBlock = visitTrackingSource.slice(failureStart, failureEnd);
    expect(failureBlock).toContain("await stopTrackingMutation.mutateAsync");
    expect(failureBlock).toContain("await notifySessionStop(");
    expect(failureBlock).toContain("authorizationToken: departureAuthToken");
    expect(failureBlock).toContain("if (rollbackConfirmed)");
    expect(failureBlock).toContain("serverAlreadyStopped: true");
    expect(failureBlock).toContain("관리자에게 위치 공유 종료를 요청해 주세요");
    expect(failureBlock).not.toContain("출발 완료 ✅");
    expect(visitTrackingSource.indexOf("출발 완료 ✅")).toBeGreaterThan(
      failureEnd,
    );
  });

  it("captures auth before departure and serializes arrival/manual stop across both hooks", () => {
    expect(visitTrackingSource).toContain("const departureAuthToken =");
    expect(visitTrackingSource.indexOf("const departureAuthToken =")).toBeLessThan(
      visitTrackingSource.indexOf("await startTrackingMutation.mutateAsync"),
    );
    expect(visitTrackingSource).toContain("let terminalOperationLock:");
    expect(visitTrackingSource).toContain("acquireTerminalOperation(");
    expect(visitTrackingSource).toContain("releaseTerminalOperation(");
    expect(visitTrackingSource).toContain("setStoppingRequestId(work.id)");
    expect(visitTrackingSource).toContain(
      "arrivingRequestId === requestId || stoppingRequestId === requestId",
    );
  });

  it("adopts token-only legacy sessions or exposes a safe global recovery stop", () => {
    expect(visitTrackingSource).toContain(
      "getSessionByRequestRef.current.fetch",
    );
    expect(visitTrackingSource).toContain("trackingUrlMatchesToken");
    expect(visitTrackingSource).toContain("await adoptTrackingRequest(");
    expect(visitTrackingSource).toContain("handleStopLegacyTracking");
    expect(visitTrackingSource).toContain("hasUnmatchedLegacyTracking:");
    expect(visitTrackingSource).toContain("LEGACY_TERMINAL_REQUEST_ID");
    expect(visitTrackingSource).toContain("workListReady = true");
    for (const source of [scheduleSource, worksSource]) {
      expect(source).toContain("이전 위치 공유 확인 필요");
      expect(source).toContain("이전 공유 종료");
      expect(source).toContain("hasUnmatchedLegacyTracking");
      expect(source).toContain("isLegacyStopPending");
      expect(source).toContain("workListReady: !isLoading");
    }
  });

  it("uses delivery-neutral SMS wording for new and reused sessions", () => {
    expect(visitTrackingSource).toContain("result.reused");
    expect(visitTrackingSource).toContain(
      "고객 안내 문자 발송 요청이 접수되었습니다.",
    );
    expect(visitTrackingSource).toContain(
      "실제 발송 상태는 관리자 화면에서 확인해 주세요.",
    );
    expect(visitTrackingSource).not.toContain("발송 완료 상태");
    expect(visitTrackingSource).not.toContain("문자가 발송되었습니다");
  });

  it("waits for consent lookup and refuses departure when consent persistence fails", () => {
    expect(visitTrackingSource).toContain("const isConsentLoading =");
    expect(visitTrackingSource).toContain('"위치 동의 확인 중"');
    expect(visitTrackingSource).toContain(
      "await saveConsentMutation.mutateAsync",
    );
    expect(visitTrackingSource).toContain('"동의 저장 실패"');
    const consentBlock = visitTrackingSource.slice(
      visitTrackingSource.indexOf("const handleConsent"),
      visitTrackingSource.indexOf("const handleDeclineConsent"),
    );
    expect(consentBlock.indexOf("return;")).toBeLessThan(
      consentBlock.indexOf("if (work) await doDepart(work)"),
    );
  });

  it("groups construction work with in-progress history", () => {
    expect(worksSource).toContain(
      'const IN_PROGRESS_STATUSES = new Set(["작업진행중", "공사중"])',
    );
    expect(worksSource).toContain(
      'if (activeFilter === "작업진행중") return IN_PROGRESS_STATUSES.has(status)',
    );
  });

  it("labels manual stop accurately and disables it while arrival is pending", () => {
    expect(visitTrackingSource).toContain("handleStopSharing");
    expect(visitTrackingSource).toContain('"위치 공유 종료 실패"');
    expect(visitTrackingSource).not.toContain(
      '"이 방문 건을 취소하시겠습니까?',
    );
    for (const source of [scheduleSource, worksSource]) {
      expect(source).toContain("⏹ 위치 공유 종료");
      expect(source).toContain("handleStopSharing(work)");
      expect(source).toContain("disabled={isArriving || isResending}");
    }
    expect(consentModalSource).toContain("“도착” 또는 “위치 공유 종료” 버튼");
    expect(consentModalSource).not.toContain('"도착" 또는 "업무 취소" 버튼');
  });
});

describe("location session persistence", () => {
  const trackingSource = read("lib/location-tracking.ts");
  const contextSource = read("lib/location-tracking-context.tsx");
  const authSource = read("lib/auth-context.tsx");
  const visitTrackingSource = read("components/technician-visit-tracking.ts");

  it("persists and restores the token, request id, and public tracking URL", () => {
    expect(trackingSource).toContain(
      'TRACKING_SESSION_KEY = "location_tracking_session_v1"',
    );
    expect(trackingSource).toContain("requestId,");
    expect(trackingSource).toContain("trackingUrl: trackingUrl ?? null");
    expect(contextSource).toContain("resumeTrackingIfActive(authSnapshot)");
    expect(contextSource).toContain("setTrackingToken(persisted.token)");
    expect(contextSource).toContain(
      "setTrackingRequestId(persisted.requestId)",
    );
    expect(contextSource).toContain("setTrackingUrl(persisted.trackingUrl)");
    expect(contextSource).toContain("await startLocationTracking(");
  });

  it("verifies the saved server session before restarting native tracking", () => {
    const resumeBlock = trackingSource.slice(
      trackingSource.indexOf("export async function resumeTrackingIfActive"),
      trackingSource.indexOf("// ─── 백그라운드 태스크 정의"),
    );
    const validateIndex = resumeBlock.indexOf(
      "await validateTrackingSession(",
    );
    const restartIndex = resumeBlock.indexOf("await startLocationTrackingForEpoch(");
    expect(validateIndex).toBeGreaterThan(-1);
    expect(restartIndex).toBeGreaterThan(validateIndex);
    expect(trackingSource).toContain(
      "/api/location/session/${encodeURIComponent(token)}",
    );
    expect(trackingSource).toContain('status === "이동중"');
    expect(contextSource).toContain(
      "const result = await resumeTrackingIfActive(authSnapshot)",
    );
  });

  it("cleans up only confirmed terminal sessions and preserves auth failures", () => {
    expect(trackingSource).toContain("new Set([404, 409, 410])");
    expect(trackingSource).not.toContain("new Set([401, 403, 404");
    expect(trackingSource).toContain('validation.state === "terminal"');
    expect(trackingSource).toContain("await stopLocationTrackingIfToken(persisted.token)");
    expect(trackingSource).toContain("body?.ended === true");
    expect(trackingSource).toContain('status !== "이동중"');
    const sendBlock = trackingSource.slice(
      trackingSource.indexOf("export async function sendLocationToServer"),
      trackingSource.indexOf("// ─── 세션 종료 서버 알림"),
    );
    expect(sendBlock).toContain(
      "isTerminalTrackingResponse(resp.status, body)",
    );
    expect(sendBlock).toContain(
      "resp.status === 401 || resp.status === 403",
    );
    expect(sendBlock.indexOf('return "auth-failed"')).toBeLessThan(
      sendBlock.indexOf("isTerminalTrackingResponse(resp.status, body)"),
    );
    expect(sendBlock).toContain("await stopLocationTrackingIfToken(token)");
    const validateBlock = trackingSource.slice(
      trackingSource.indexOf("export async function validateTrackingSession"),
      trackingSource.indexOf("export async function resumeTrackingIfActive"),
    );
    expect(validateBlock).toContain(
      "response.status === 401 || response.status === 403",
    );
    expect(validateBlock).toContain('{ state: "unavailable"');
  });

  it("serializes lifecycle mutations and rejects stale restore/start work", () => {
    expect(trackingSource).toContain("let _lifecycleQueue: Promise<void>");
    expect(trackingSource).toContain("function enqueueLifecycle<T>");
    expect(trackingSource).toContain("function beginStartIntent(token: string)");
    expect(trackingSource).toContain("function beginStopIntent()");
    expect(trackingSource).toContain(
      "isCurrentStartIntent(epoch, session.token)",
    );
    expect(contextSource).toContain(
      "restoreGenerationRef.current !== expectedGeneration",
    );
    expect(contextSource).toContain("isAuthorizedSnapshot(authSnapshot)");
    expect(trackingSource).toContain("_trackingAuthGeneration");
    expect(trackingSource).toContain("invalidateLocationTrackingAuth");
    expect(trackingSource).toContain("enableLocationTrackingAuth");
    expect(contextSource).toContain(
      "await stopLocationTrackingIfToken(result.session.token)",
    );
  });

  it("never lets a late terminal response for session A stop a new session B", () => {
    const conditionalStopBlock = trackingSource.slice(
      trackingSource.indexOf("export function stopLocationTrackingIfToken"),
      trackingSource.indexOf("// ─── 추적 상태 확인"),
    );
    expect(conditionalStopBlock).toContain("currentToken !== token");
    expect(conditionalStopBlock).toContain(
      "_desiredTrackingToken !== token",
    );
    expect(trackingSource).toContain(
      "await stopLocationTrackingIfToken(token)",
    );
  });

  it("retries unavailable restore with one bounded backoff timer", () => {
    expect(contextSource).toContain(
      "RESTORE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000]",
    );
    expect(contextSource).toContain("restoreRetryTimerRef.current");
    expect(contextSource).toContain(
      "attempt < RESTORE_RETRY_DELAYS_MS.length",
    );
    expect(contextSource).toContain('result.state === "unavailable"');
    expect((contextSource.match(/setTimeout\(/g) ?? []).length).toBe(1);
  });

  it("fails native start but preserves session identity until server rollback is confirmed", () => {
    const nativeStartBlock = trackingSource.slice(
      trackingSource.indexOf("async function startLocationTrackingForEpoch"),
      trackingSource.indexOf("export function startLocationTracking("),
    );
    expect(nativeStartBlock).toContain("await suspendLocationTrackingDelivery()");
    expect(nativeStartBlock).not.toContain("await clearLocationTrackingResources()");
    expect(nativeStartBlock).toContain(
      'throw new Error("실시간 위치 공유 서비스를 시작하지 못했습니다.")',
    );
    expect(contextSource).toContain(
      "const started = await startLocationTracking",
    );
    expect(contextSource).toContain("if (!started || !isAuthorizedSnapshot(authSnapshot))");
    expect(contextSource).toContain("await getPersistedTrackingSession()");
    expect(contextSource).toContain("setTrackingToken(persisted.token)");
  });

  it("supports foreground-only delivery and suspends auth-failed starts without deleting token", () => {
    const nativeStartBlock = trackingSource.slice(
      trackingSource.indexOf("async function startLocationTrackingForEpoch"),
      trackingSource.indexOf("export function startLocationTracking("),
    );
    expect(nativeStartBlock).toContain("!session.backgroundEnabled");
    expect(nativeStartBlock.indexOf("!session.backgroundEnabled")).toBeLessThan(
      nativeStartBlock.indexOf("Location.startLocationUpdatesAsync"),
    );
    expect(visitTrackingSource).toContain(
      "backgroundEnabled: backgroundGranted",
    );
    const authFailedStart = contextSource.indexOf('if (result === "auth-failed")');
    const authFailedBlock = contextSource.slice(
      authFailedStart,
      contextSource.indexOf("await checkPermissions()", authFailedStart),
    );
    expect(authFailedBlock).toContain("suspendLocationTrackingIfToken(token)");
    expect(authFailedBlock).not.toContain("stopLocationTrackingIfToken(token)");
    expect(trackingSource).toContain("export function suspendLocationTrackingIfToken");
  });

  it("keeps cold/headless background delivery working without reviving logged-out state", () => {
    const taskBlock = trackingSource.slice(
      trackingSource.indexOf("TaskManager.defineTask(BACKGROUND_TASK_NAME"),
      trackingSource.indexOf("// ─── 위치 권한 요청"),
    );
    expect(taskBlock).toContain("const headlessAuthorizationToken = await getSessionToken()");
    expect(taskBlock).toContain("initialValues");
    expect(taskBlock).toContain("latestValues");
    expect(taskBlock).toContain("isPersistedBackgroundDeliveryEnabled");
    expect(taskBlock).toContain("TRACKING_SESSION_KEY");
    expect(taskBlock.indexOf("latestValues")).toBeLessThan(
      taskBlock.indexOf("await sendLocationToServer("),
    );
    expect(taskBlock).toContain("authorizationToken: headlessAuthorizationToken");
    expect(taskBlock).toContain("allowHeadless: true");
    expect(taskBlock).not.toContain("if (!_trackingAuthEnabled) return");
    expect(taskBlock).toContain(
      "_trackingAuthGeneration > 0 && !_trackingAuthEnabled",
    );

    const authStopBlock = trackingSource.slice(
      trackingSource.indexOf("export async function stopTrackingForAuthInvalidation"),
    );
    expect(authStopBlock.indexOf('TRACKING_ACTIVE_KEY, "false"')).toBeLessThan(
      authStopBlock.indexOf("notifySessionStop(persisted.token"),
    );

    const sendBlock = trackingSource.slice(
      trackingSource.indexOf("export async function sendLocationToServer"),
      trackingSource.indexOf("// ─── 세션 종료 서버 알림"),
    );
    expect(sendBlock).toContain("options?.allowHeadless === true");
    expect(sendBlock).toContain("options.authorizationToken");
    expect(sendBlock).toContain("if (!authorizationToken)");
  });

  it("keeps local tracking when manual server stop is unconfirmed", () => {
    const notifyBlock = trackingSource.slice(
      trackingSource.indexOf("export async function notifySessionStop"),
      trackingSource.indexOf("/** 로그아웃·인증 세션 무효화"),
    );
    const contextStopStart = contextSource.indexOf(
      "const stopTracking = useCallback",
    );
    const contextStopBlock = contextSource.slice(
      contextStopStart,
      contextSource.indexOf("return (", contextStopStart),
    );
    expect(notifyBlock).toContain("Promise<SessionStopResult>");
    expect(notifyBlock).toContain("if (response.ok)");
    expect(notifyBlock).toContain("isAlreadyTerminalStopResponse");
    expect(contextStopBlock).toContain("if (!serverStop.ok)");
    expect(contextStopBlock.indexOf("throw new Error(serverStop.error)")).toBeLessThan(
      contextStopBlock.indexOf("await stopLocationTrackingIfToken(t)"),
    );
    expect(contextStopBlock).not.toContain("await stopLocationTracking()");
  });

  it("uses only the module-level foreground location interval", () => {
    expect((trackingSource.match(/setInterval\(/g) ?? []).length).toBe(1);
    expect(contextSource).not.toContain("setInterval(");
    expect(contextSource).not.toContain("fgIntervalRef");
    expect(contextSource).not.toContain("startFgInterval");
  });

  it("stops and removes tracking before auth storage is invalidated or logged out", () => {
    expect(authSource).toContain("stopTrackingForAuthInvalidation");
    const clearBlock = authSource.slice(
      authSource.indexOf("async function clearAllAuthStorage"),
      authSource.indexOf("/** 서버에서 토큰"),
    );
    expect(clearBlock.trimStart()).toMatch(
      /^async function clearAllAuthStorage[\s\S]*?invalidateLocationTrackingAuth\(\)/,
    );
    expect(
      clearBlock.indexOf(
        "await stopTrackingForAuthInvalidation({ notifyServer: notifyServerTracking })",
      ),
    ).toBeLessThan(clearBlock.indexOf("SecureStore.deleteItemAsync"));
    const missingSessionStart = authSource.indexOf("if (!raw)");
    const missingSessionBlock = authSource.slice(
      missingSessionStart,
      authSource.indexOf("let saved: AuthUser", missingSessionStart),
    );
    expect(missingSessionBlock).toContain("await clearAllAuthStorage()");
    const logoutBlock = authSource.slice(
      authSource.indexOf("const logout = useCallback"),
      authSource.indexOf("return ("),
    );
    expect(logoutBlock.indexOf("await clearAllAuthStorage()")).toBeLessThan(
      logoutBlock.indexOf("setUser(null)"),
    );
  });

  it("fails auth closed without cancelling a valid visit on network or 5xx", () => {
    expect(authSource).toContain('state: "valid"');
    expect(authSource).toContain('state: "invalid"');
    expect(authSource).toContain('state: "unavailable"');
    expect(authSource).toContain(
      "res.status === 401 || res.status === 403",
    );
    expect(authSource).toContain("notifyServerTracking: false");
    expect(authSource).toContain("preserveSavedSession: true");
    expect(authSource).toContain("preserveTrackingSession: true");
    expect(authSource).toContain("suspendTrackingForAuthUnavailable");
    expect(authSource).toContain(
      "AUTH_VERIFY_RETRY_DELAYS_MS = [2_000, 5_000, 15_000]",
    );
    expect(authSource).toContain("verifyTokenWithRetry");
    const retryBlock = authSource.slice(
      authSource.indexOf("async function verifyTokenWithRetry"),
      authSource.indexOf("export function AuthProvider"),
    );
    expect(retryBlock).toContain("for (const delayMs of AUTH_VERIFY_RETRY_DELAYS_MS)");
    expect(retryBlock).toContain("waitForAuthVerificationRetry(delayMs)");
    const unavailableBlock = authSource.slice(
      authSource.indexOf('verification.state === "unavailable"'),
      authSource.indexOf("const verified = verification.session"),
    );
    expect(unavailableBlock).toContain("await clearAllAuthStorage({");
    expect(unavailableBlock).not.toContain("setUser(restoredUser)");
    expect(unavailableBlock).toContain("preserveTrackingSession: true");
    const validRestoreBlock = authSource.slice(
      authSource.indexOf("await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser))"),
      authSource.indexOf("setUser(restoredUser)"),
    );
    expect(validRestoreBlock).toContain("SecureStore.setItemAsync");
    expect(validRestoreBlock).toContain(
      "enableLocationTrackingAuth(saved.token, restoredUser.userId, restoredUser.technicianId)",
    );

    const unauthenticatedTrackingBlock = contextSource.slice(
      contextSource.indexOf("if (!authUser)"),
      contextSource.indexOf('if (authUser.appRole !== "technician")'),
    );
    expect(unauthenticatedTrackingBlock).toContain("resetTrackingState()");
    expect(unauthenticatedTrackingBlock).not.toContain("stopLocationTracking()");
  });

  it("binds persisted visits to one user and technician before restore or account switch", () => {
    expect(trackingSource).toContain("ownerUserId: number | null");
    expect(trackingSource).toContain("ownerTechnicianId: number | null");
    expect(trackingSource).toContain("isTrackingSessionOwnedByAuth");
    expect(trackingSource).toContain('return { state: "owner-mismatch" }');
    expect(authSource).toContain("bindPersistedTrackingOwnerIfMissing");
    expect(authSource).toContain("isPersistedTrackingOwnedBy");
    expect(authSource).toContain("다른 기사 계정의 이동 중 방문이 남아 있습니다");
    expect(authSource).toContain("body?.authenticatedOwner === true");
    expect(authSource).toContain("Authorization: `Bearer ${authUser.token}`");
  });

  it("serializes duplicate legacy adoption attempts and only adopts a null request id", () => {
    const adoptBlock = trackingSource.slice(
      trackingSource.indexOf("export function adoptPersistedTrackingRequest"),
      trackingSource.indexOf("// ─── 추적 상태 확인"),
    );
    expect(adoptBlock).toContain("return enqueueLifecycle(async () =>");
    expect(adoptBlock).toContain("persisted.requestId !== null");
    expect(adoptBlock).toContain("persisted.token !== token");
    expect(adoptBlock).toContain("isLocationTrackingAuthSnapshotCurrent");
  });

  it("clears every persisted session field when tracking ends", () => {
    const stopBlock = trackingSource.slice(
      trackingSource.indexOf("async function clearLocationTrackingResources"),
      trackingSource.indexOf("async function startLocationTrackingForEpoch"),
    );
    expect(stopBlock).toContain("TRACKING_ACTIVE_KEY");
    expect(stopBlock).toContain("TRACKING_TOKEN_KEY");
    expect(stopBlock).toContain("TRACKING_SESSION_KEY");
  });
});

describe("location router idempotency and workflow", () => {
  const routerSource = read("server/routers.ts");
  const dbSource = read("server/db.ts");
  const startBlock = routerSource.slice(
    routerSource.indexOf("startTracking: protectedProcedure"),
    routerSource.indexOf("startTrackingByAdmin: protectedProcedure"),
  );
  const arrivalBlock = routerSource.slice(
    routerSource.indexOf("markArrived: protectedProcedure"),
    routerSource.indexOf("markWorkCompleted: protectedProcedure"),
  );
  const sessionLookupBlock = routerSource.slice(
    routerSource.indexOf("getSessionByRequest: protectedProcedure"),
    routerSource.indexOf("getActiveSessions: protectedProcedure"),
  );

  it("serializes request and technician races and atomically claims departure SMS", () => {
    expect(dbSource).toContain("getOrCreateActiveLocationSession");
    expect(dbSource).toContain(
      "eq(locationSessions.technicianId, data.technicianId)",
    );
    expect(dbSource).toContain('.for("update")');
    expect(dbSource).toContain("claimLocationSessionSms");
    expect(dbSource).toContain("clearLocationSessionSmsClaim");
    expect(startBlock).toContain("db.getOrCreateActiveLocationSession");
    expect(startBlock).toContain("token: effectiveToken");
    expect(startBlock).toContain("reused: !created");
    expect(startBlock).toContain("db.claimLocationSessionSms(claim)");
    expect(startBlock).toContain("db.clearLocationSessionSmsClaim(claim)");
    expect(startBlock).toContain(
      'r.result === "SUCCESS" || r.result === "REQUESTED"',
    );
  });

  it("uses authenticated current assignment and canonical DB identity fields", () => {
    expect(startBlock).toContain(
      "requireCurrentTechnicianAssignment(ctx, input.requestId)",
    );
    expect(startBlock).toContain("technicianName: technician.name");
    expect(startBlock).toContain("customerName: request.customerName");
    expect(startBlock).toContain("customerPhone: request.phoneNumber");
    expect(startBlock).not.toContain("technicianName: input.technicianName");
    expect(startBlock).not.toContain("customerPhone: input.customerPhone");
    expect(startBlock).toContain(
      'process.env.NODE_ENV !== "production" && input.demoMode === true',
    );
  });

  it("claims arrival notice durably inside the locked transition", () => {
    expect(dbSource).toContain("markLocationSessionArrivedAuthorized");
    expect(dbSource).toContain(
      "const firstArrival = !statusArrived && !stageArrived",
    );
    expect(arrivalBlock).toContain("db.markLocationSessionArrivedAuthorized");
    expect(dbSource).toContain("claimWorkflowNotificationWithTx(tx");
    expect(arrivalBlock).toContain(
      "deliverWorkflowNotificationClaim(arrival.notificationClaim)",
    );
  });

  it("returns only status and official URL after customer/technician ownership checks", () => {
    expect(sessionLookupBlock).toContain(
      "requireLocationSessionReadAccess(ctx, input.requestId)",
    );
    expect(sessionLookupBlock).toContain(
      "db.getCustomerLocationSessionByToken(session.trackingToken)",
    );
    expect(routerSource).toContain(
      'const OFFICIAL_TRACKING_ORIGIN = "https://퓨처에너지테크.kr"',
    );
    expect(routerSource).toContain("/track/${encodeURIComponent(token)}");
    expect(sessionLookupBlock).toContain(
      "trackingUrl: buildPublicTrackingUrl(reconciled.trackingToken)",
    );
    expect(sessionLookupBlock).not.toContain("trackingToken:");
    expect(sessionLookupBlock).not.toContain("...session");
  });
});
