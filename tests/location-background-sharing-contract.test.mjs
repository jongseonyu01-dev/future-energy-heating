import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

const [tracking, lifecycle, uploadGuard, scheduler, context, schedule, workReport, auth, config] = await Promise.all([
  read("lib/location-tracking.ts"),
  read("lib/location-tracking-lifecycle.ts"),
  read("lib/location-upload-guard.ts"),
  read("lib/location-upload-scheduler.ts"),
  read("lib/location-tracking-context.tsx"),
  read("app/(tabs)/tech-schedule.tsx"),
  read("app/work-report.tsx"),
  read("lib/auth-context.tsx"),
  read("app.config.ts"),
]);

assert.match(tracking, /TaskManager\.defineTask\(BACKGROUND_TASK_NAME/, "native background task must be globally registered");
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
assert.match(tracking, /UPDATE_REQUEST_ATTEMPTS/, "temporary upload failure must have a bounded retry policy");
assert.match(tracking, /serverStatus: "error", serverError: "Android 위치 작업 오류가 발생했습니다/, "TaskManager errors must become observable technician state");
assert.match(tracking, /현재 기사 로그인 인증 또는 위치공유 세션을 확인하지 못했습니다/, "missing headless credential/session must become observable technician state");
assert.match(scheduler, /payload\.accepted === true/, "HTTP 2xx must not alone count as a new location save");
assert.match(scheduler, /accepted === false/, "duplicate or older measurements must be classified separately");
assert.match(tracking, /createLocationStopAuthSnapshot/, "logout must capture the prior credential before auth removal");
assert.match(lifecycle, /this\.generation \+= 1/, "stop must invalidate an active generation synchronously");
assert.match(lifecycle, /await this\.adapter\.stopNativeCollection\(\)/, "local native stop must occur before optional server notification");
assert.match(lifecycle, /stopIfCurrent/, "late terminal response must stop only its own current state");
assert.match(lifecycle, /restoreForUser/, "restore must fence its initial asynchronous storage read");
assert.match(uploadGuard, /getCredential\(\)/, "guard checks delayed credential acquisition");
assert.match(uploadGuard, /request\(credential\)/, "guard checks the upload response boundary");
assert.match(context, /stopStoredTrackingAndNotify\(reason, createLocationStopAuthSnapshot\(user\)\)/, "context must capture stop credentials before local shutdown");
assert.match(context, /subscribeTrackingState/, "terminal server cleanup must clear context UI state");
assert.match(context, /getBackgroundPermissionsAsync/, "background location permission must be observed separately from notification permission");
assert.match(context, /foregroundLocation/, "foreground location permission must have its own UI field");
assert.match(context, /notification/, "notification permission must have its own UI field");
assert.match(schedule, /isTracking && trackingRequestId !== work\.id/, "departure must block different active customer");
assert.match(schedule, /technicianUserId: userId/, "tracking persistence binds the authenticated technician");
assert.match(schedule, /notifySessionStop\(result\.token, "업무취소", userId, createLocationStopAuthSnapshot\(user\)\)/, "failed native start must end only the active technician session");
assert.match(schedule, /lastStoredAt/, "technician UI must show the last actual location save rather than HTTP-only success");
assert.match(schedule, /attemptCount/, "technician UI must label total send attempts");
assert.match(schedule, /storedCount/, "technician UI must label actual new-location saves");
assert.match(schedule, /ignoredCount/, "technician UI must label older or duplicate responses");
assert.match(workReport, /trackingRequestId === requestId && !needsRevisit/, "successful completion must stop matching sharing only");
assert.match(auth, /stopStoredTrackingAndNotify\("업무취소", stopSnapshot\)/, "logout must use the captured A credential without reading a later B login");
assert.match(auth, /if \(res\.status >= 500\) return true;/, "temporary auth verification 5xx must not clear a live technician session");
assert.match(config, /ACCESS_BACKGROUND_LOCATION/, "Android background permission must be declared for other-app and screen-off tracking");
assert.match(config, /isAndroidBackgroundLocationEnabled:\s*true/, "Expo location plugin must enable Android background location support");
assert.match(tracking, /requestBackgroundPermissionsAsync\(\)/, "departure must request Always Allow before native collection starts");
assert.match(schedule, /항상 위치 허용 필요/, "departure UI must block and explain missing Always Allow permission");
assert.match(config, /FOREGROUND_SERVICE_LOCATION/, "Android foreground-service location permission is declared");
assert.match(config, /expo-notifications/, "actionable persistent notification module is included");

console.log("LOCATION_BACKGROUND_SHARING_CONTRACT_PASS");
