import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

const [tracking, lifecycle, uploadGuard, context, schedule, workReport, auth, config] = await Promise.all([
  read("lib/location-tracking.ts"),
  read("lib/location-tracking-lifecycle.ts"),
  read("lib/location-upload-guard.ts"),
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
assert.match(tracking, /createLocationStopAuthSnapshot/, "logout must capture the prior credential before auth removal");
assert.match(lifecycle, /this\.generation \+= 1/, "stop must invalidate an active generation synchronously");
assert.match(lifecycle, /await this\.adapter\.stopNativeCollection\(\)/, "local native stop must occur before optional server notification");
assert.match(lifecycle, /stopIfCurrent/, "late terminal response must stop only its own current state");
assert.match(lifecycle, /restoreForUser/, "restore must fence its initial asynchronous storage read");
assert.match(uploadGuard, /getCredential\(\)/, "guard checks delayed credential acquisition");
assert.match(uploadGuard, /request\(credential\)/, "guard checks the upload response boundary");
assert.match(context, /stopStoredTrackingAndNotify\(reason, createLocationStopAuthSnapshot\(user\)\)/, "context must capture stop credentials before local shutdown");
assert.match(context, /subscribeTrackingState/, "terminal server cleanup must clear context UI state");
assert.match(schedule, /isTracking && trackingRequestId !== work\.id/, "departure must block different active customer");
assert.match(schedule, /technicianUserId: userId/, "tracking persistence binds the authenticated technician");
assert.match(schedule, /notifySessionStop\(result\.token, "업무취소", userId, createLocationStopAuthSnapshot\(user\)\)/, "failed native start must end only the active technician session");
assert.match(workReport, /trackingRequestId === requestId && !needsRevisit/, "successful completion must stop matching sharing only");
assert.match(auth, /stopStoredTrackingAndNotify\("업무취소", stopSnapshot\)/, "logout must use the captured A credential without reading a later B login");
assert.doesNotMatch(config, /ACCESS_BACKGROUND_LOCATION/, "candidate must not unconditionally request Android background location permission");
assert.match(config, /FOREGROUND_SERVICE_LOCATION/, "Android foreground-service location permission is declared");
assert.match(config, /expo-notifications/, "actionable persistent notification module is included");

console.log("LOCATION_BACKGROUND_SHARING_CONTRACT_PASS");
