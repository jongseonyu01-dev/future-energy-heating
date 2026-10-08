import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appRoot = "/home/ubuntu/future-energy-heating";
const [taskService, locationModule, tracking] = await Promise.all([
  readFile(`${appRoot}/node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskService.java`, "utf8"),
  readFile(`${appRoot}/node_modules/expo-location/android/src/main/java/expo/modules/location/LocationModule.kt`, "utf8"),
  readFile(new URL("../lib/location-tracking.ts", import.meta.url), "utf8"),
]);

assert.match(taskService, /MAX_TASK_EXECUTION_TIME_MS = 15000/, "locked Expo TaskService must declare the 15s job-finish guard");
assert.match(taskService, /finishJobAfterTimeout\(jobService, params, MAX_TASK_EXECUTION_TIME_MS\)/, "async tasks must schedule the finite job guard");
assert.match(taskService, /jobService\.jobFinished\(params, false\)/, "the finite guard completes the native job without reschedule");
assert.match(locationModule, /hasStartedLocationUpdatesAsync/, "Expo location registration check must be present in locked native source");
assert.match(tracking, /TASK_CALLBACK_NETWORK_BUDGET_MS = 8_000/, "app fetch budget must remain below the native 15s job guard");
assert.match(tracking, /RESPONSE_BODY_TIMEOUT_MS = 2_000/, "app response-body budget must remain finite");
assert.match(tracking, /createTaskDeadline\(TASK_CALLBACK_TOTAL_BUDGET_MS\)/, "the callback must establish one total deadline before asynchronous adoption");
assert.match(tracking, /remainingTaskBudgetMs\(taskDeadlineAt\)/, "each network/body boundary must consume only remaining callback time");
assert.match(tracking, /parseJsonWithin\(response, responseBodyBudgetMs\)/, "body parser must be bounded before queue release");
assert.match(tracking, /hasStarted API confirms persisted task\/consumer registration only/, "registration must not be reported as collection or storage success");
assert.doesNotMatch(tracking, /UPDATE_RETRY_DELAY_MS/, "headless callback must not extend work with delayed retry loops");

console.log("TASKMANAGER_LOCATION_BUDGET_VERIFY_PASS");
