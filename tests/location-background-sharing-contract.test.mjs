import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

const [tracking, taskEntry, packageJson, lifecycle, uploadGuard, scheduler, diagnostics, responseParser, taskBudget, runtimeStatus, context, schedule, workReport, auth, config, overlay] = await Promise.all([
  read("lib/location-tracking.ts"),
  read("lib/location-task-entry.ts"),
  read("package.json"),
  read("lib/location-tracking-lifecycle.ts"),
  read("lib/location-upload-guard.ts"),
  read("lib/location-upload-scheduler.ts"),
  read("lib/location-runtime-diagnostics.ts"),
  read("lib/location-upload-response.ts"),
  read("lib/location-task-budget.ts"),
  read("lib/location-runtime-status.ts"),
  read("lib/location-tracking-context.tsx"),
  read("app/(tabs)/tech-schedule.tsx"),
  read("app/work-report.tsx"),
  read("lib/auth-context.tsx"),
  read("app.config.ts"),
  read("lib/location-status-overlay.ts"),
]);

assert.match(packageJson, /"main": "\.\/index\.ts"/, "custom package main must run before Expo Router entry");
assert.match(taskEntry, /registerLocationTrackingTask\(\)/, "custom package entry must globally register the native background task");
assert.match(tracking, /TaskManager\.defineTask\(BACKGROUND_TASK_NAME/, "native background task definition remains outside React UI");
assert.match(tracking, /Location\.startLocationUpdatesAsync\(BACKGROUND_TASK_NAME/, "only native location task starts collection");
assert.doesNotMatch(tracking, /setInterval\(/, "JS interval must not be used as a background location collector");
assert.match(tracking, /foregroundService:\s*\{[\s\S]*killServiceOnDestroy:\s*false/, "foreground service must remain after activity destruction");
assert.match(tracking, /dismissNotificationAsync/, "shown control notifications must be dismissed, not only unscheduled");
assert.match(tracking, /getPresentedNotificationsAsync/, "restart-safe notification cleanup must identify shown controls");
assert.match(tracking, /addNotificationResponseReceivedListener/, "Android notification stop action must be handled when the app opens");
assert.match(tracking, /getLastNotificationResponseAsync/, "cold-start notification stop action must be handled");
assert.match(tracking, /matchesTrackingStopAction/, "stale notification actions must be rejected by request and start generation");
assert.match(tracking, /createRequestTimeout/, "timeout uses AbortController plus timer compatibility rather than AbortSignal.timeout");
assert.doesNotMatch(tracking, /AbortSignal\.timeout/, "React Native runtime must not require AbortSignal.timeout");
assert.match(tracking, /runGuardedLocationUpload/, "credential/request/response boundaries must be generation guarded");
assert.match(tracking, /adoptHeadlessTrackingWithCredential/, "fresh TaskManager runtimes must adopt persisted state without a mounted screen");
assert.match(tracking, /selectNewestFreshLocation/, "unordered TaskManager batches must select the newest fresh measurement");
assert.match(tracking, /LatestOnlyUploadQueue/, "overlapping native callbacks must serialize uploads with one latest pending sample");
assert.match(tracking, /TASK_CALLBACK_NETWORK_BUDGET_MS = 8_000/, "TaskManager 15초 job budget 안에서 fetch must remain bounded");
assert.match(tracking, /RESPONSE_BODY_TIMEOUT_MS = 2_000/, "response body parsing must have its own bounded budget");
assert.match(tracking, /createTaskDeadline\(TASK_CALLBACK_TOTAL_BUDGET_MS\)/, "callback must reserve one finite end-to-end deadline before adoption/upload");
assert.match(tracking, /TaskCallbackDeadlineFence/, "callback must own a deadline fence that returns even when an await hangs");
assert.match(tracking, /taskFence\.remainingMs\(\)/, "fetch and response parsing must consume the remaining callback budget");
assert.match(tracking, /withinDiagnosticsDeadline/, "deadline expiry must release best-effort diagnostics from the callback path");
assert.match(tracking, /parseJsonWithin\(response, responseBodyBudgetMs\)/, "response.json must not hold the latest-only queue indefinitely");
assert.match(tracking, /recordAcceptedOutcome\(state/, "verified accepted responses must bypass delayed session diagnostics");
assert.match(tracking, /lastCallbackDeadlineAt: now/, "callback deadline must have its own timestamp field");
assert.doesNotMatch(tracking, /lastResponseAt: now/, "callback deadline must not fabricate an HTTP response timestamp");
assert.doesNotMatch(tracking, /UPDATE_RETRY_DELAY_MS/, "headless callback must not combine delayed retry loops with the job deadline");
assert.match(responseParser, /Promise\.race\(\[parsed, timeout\]\)/, "response parser must release on body timeout");
assert.match(taskBudget, /Promise\.race\(\[work, timeout\]\)/, "task deadline must release a blocked storage/auth await");
assert.match(diagnostics, /sameDiagnosticScope/, "runtime diagnostics must reject a replacement session");
assert.match(diagnostics, /releaseExpiredWork/, "expired best-effort diagnostics must not block a later native callback");
assert.match(diagnostics, /LocationCallbackStage/, "diagnostics must classify fixed non-sensitive callback stages");
assert.match(diagnostics, /LocationAppStateMarker/, "diagnostics must keep AppState evidence separately from uploads");
assert.match(runtimeStatus, /오래된 위치 전송 시도는 완료로 표시하지 않습니다/, "UI must not restore stale uploading as an active transfer");
assert.match(tracking, /recordUnboundTaskCallback/, "TaskManager preparation failures must be classified before callback return");
assert.match(diagnostics, /recordUnboundTaskEvent/, "session-unknown TaskManager failures must be kept outside A/B session diagnostics");
assert.match(context, /getLatestUnboundLocationTaskEvent/, "unbound TaskManager evidence must be observable after the app returns");
assert.match(schedule, /현재 세션과 연결하지 않음/, "technician UI must distinguish unbound callback evidence from the current session");
assert.match(scheduler, /payload\.accepted === true/, "HTTP 2xx must not alone count as a new location save");
assert.match(scheduler, /accepted === false/, "duplicate or older measurements must be classified separately");
assert.match(tracking, /createLocationStopAuthSnapshot/, "logout must capture the prior credential before auth removal");
assert.match(lifecycle, /this\.generation \+= 1/, "stop must invalidate an active generation synchronously");
assert.match(lifecycle, /await this\.adapter\.stopNativeCollection\(\)/, "local native stop must occur before optional server notification");
assert.match(lifecycle, /stopIfCurrent/, "late terminal response must stop only its own current state");
assert.match(lifecycle, /restoreForUser/, "restore must fence its initial asynchronous storage read");
assert.match(lifecycle, /reconcileNativeCollection/, "foreground return must recheck exact-session native registration");
assert.match(uploadGuard, /getCredential\(\)/, "guard checks delayed credential acquisition");
assert.match(uploadGuard, /request\(credential\)/, "guard checks the upload response boundary");
assert.match(context, /stopStoredTrackingAndNotify\(reason, createLocationStopAuthSnapshot\(user\)\)/, "context must capture stop credentials before local shutdown");
assert.match(context, /subscribeTrackingState/, "terminal server cleanup must clear context UI state");
assert.match(context, /AppState\.addEventListener/, "foreground return must re-run exact-session registration reconciliation");
assert.match(context, /recordLocationTrackingAppState\(nextState\)/, "AppState transition must be recorded without starting an upload");
assert.match(context, /getBackgroundPermissionsAsync/, "background location permission must be observed separately from notification permission");
assert.match(context, /foregroundLocation/, "foreground location permission must have its own UI field");
assert.match(context, /notification/, "notification permission must have its own UI field");
assert.match(context, /항상 허용 필요/, "missing background location permission must remain visible to the technician");
assert.match(context, /isPermissionPending/, "a permission-paused existing session must remain visible in the provider");
assert.match(context, /resumeTrackingAfterPermissionCheck/, "provider must expose explicit local resume without a new departure flow");
assert.match(context, /permissionResumeGeneration/, "late permission results must be cancelled when the visible work changes");
assert.match(context, /captureAuthTransition\(\)/, "permission resume must capture the synchronous auth boundary before awaiting Android");
assert.match(context, /isAuthTransitionCurrent\(authTransition\)/, "logout or account replacement must cancel a pending permission resume before it restarts collection");
assert.match(tracking, /expectedState\?: PersistedTrackingState/, "permission resume must bind to the exact saved work");
assert.match(tracking, /isStillAuthorized: \(\) => boolean/, "tracking restore must accept an external auth/work cancellation guard");
assert.match(lifecycle, /isStillAuthorized\?: \(\) => boolean/, "queued lifecycle native starts must recheck external recovery authority");
assert.match(tracking, /suspendCurrentTrackingForPermissionRevocation\(state\)/, "current permission denial must invalidate upload authority before waiting for another callback");
assert.match(schedule, /isTracking && trackingRequestId !== work\.id/, "departure must block different active customer");
assert.match(schedule, /권한 확인·공유 재개/, "permission-pending work must expose a dedicated resume control");
assert.match(schedule, /도착·업무 취소를 계속 사용할 수 있습니다/, "permission-pending work must preserve terminal controls");
assert.match(schedule, /technicianUserId: userId/, "tracking persistence binds the authenticated technician");
assert.match(schedule, /notifySessionStop\(result\.token, "업무취소", userId, createLocationStopAuthSnapshot\(user\)\)/, "failed native start must end only the active technician session");
assert.match(schedule, /lastStoredAt/, "technician UI must show the last actual location save rather than HTTP-only success");
assert.match(schedule, /attemptCount/, "technician UI must label total send attempts");
assert.match(schedule, /storedCount/, "technician UI must label actual new-location saves");
assert.match(schedule, /ignoredCount/, "technician UI must label older or duplicate responses");
assert.match(workReport, /trackingRequestId === requestId && !needsRevisit/, "successful completion must stop matching sharing only");
assert.match(auth, /stopStoredTrackingAndNotify\("업무취소", stopSnapshot\)/, "logout must use the captured A credential without reading a later B login");
assert.match(auth, /if \(res\.status >= 500\) return true;/, "temporary auth verification 5xx must not clear a live technician session");
assert.match(config, /isAndroidBackgroundLocationEnabled:\s*true/, "Expo config must declare background permission for restored Android location tasks");
assert.match(config, /isAndroidForegroundServiceEnabled:\s*true/, "Expo config must keep the explicit foreground-service declaration");
assert.match(tracking, /requestBackgroundPermissionsAsync\(\)/, "departure permission gate must request background location after foreground grant");
assert.match(schedule, /항상 위치 권한 필요/, "Android 11+ Settings transition must have a pre-request explanation");
assert.match(schedule, /canStartLocationTrackingSession/, "server session creation must remain behind the complete permission gate");
assert.doesNotMatch(schedule, /앱을 닫지 않은 상태에서는/, "departure UI must not instruct technicians to keep the app open as a workaround");
assert.match(tracking, /앱 화면이 열린 상태에서 시작해야 합니다/, "foreground-service start rejection must guide a foreground retry");
assert.match(config, /FOREGROUND_SERVICE_LOCATION/, "Android foreground-service location permission is declared");
assert.match(config, /expo-notifications/, "actionable persistent notification module is included");
assert.match(config, /SYSTEM_ALERT_WINDOW/, "optional status window special-access declaration is explicit");
assert.match(overlay, /requireOptionalNativeModule/, "optional status window must degrade safely on unsupported installs");
assert.match(overlay, /updateIfVisible/, "headless diagnostics may update only an already-opened status window");

console.log("LOCATION_BACKGROUND_SHARING_CONTRACT_PASS");
