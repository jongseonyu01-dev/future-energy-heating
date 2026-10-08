import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authContext = await readFile(new URL("../lib/auth-context.tsx", import.meta.url), "utf8");
const login = await readFile(new URL("../app/login.tsx", import.meta.url), "utf8");
const trpc = await readFile(new URL("../lib/trpc.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const weeklyHome = await readFile(new URL("../components/technician-weekly-home.tsx", import.meta.url), "utf8");
const schedule = await readFile(new URL("../app/(tabs)/tech-schedule.tsx", import.meta.url), "utf8");
const locationProvider = await readFile(new URL("../lib/location-tracking-context.tsx", import.meta.url), "utf8");

assert.match(authContext, /synchronizeAppSessionToken\(saved\.token, Auth\.setSessionToken\)/, "restored mobile session must synchronize the tRPC bearer storage");
assert.match(authContext, /if \(!storageResult\.value\) \{\s*await clearAndRecordVersion\(\);/s, "SecureStore restoration failure must clear the visible session");
assert.match(authContext, /new AuthSessionTransition\(\)/, "auth transitions must have a generation guard");
assert.match(authContext, /await queryClient\.cancelQueries\(\);\s*queryClient\.clear\(\);/s, "account transitions must cancel and clear old schedule cache");
assert.match(authContext, /synchronizeAppSessionToken\(authUser\.token, Auth\.setSessionToken\)/, "new mobile login must persist the bearer before exposing the user");
assert.match(authContext, /SESSION_TOKEN_STORAGE_FAILED/, "new login must reject SecureStore failures");
assert.match(authContext, /if \(!raw\) \{[\s\S]*await clearAndRecordVersion\(\);/s, "rememberMe=false cold starts must clear the native bearer");
assert.doesNotMatch(login, /try \{ await Auth\.setSessionToken\(data\.token\); \} catch \{\}/, "login screen must not suppress token storage errors before AuthProvider handles them");
assert.match(trpc, /const API_URL = getApiBaseUrl\(\);/, "tRPC must use the single canonical API URL resolver");
assert.match(trpc, /getTRPCOperationHeaders\(/, "native protected tRPC calls must use the executable header guard delegate");
assert.match(trpc, /path: op\.path/, "tRPC session guard must receive the operation path");
assert.match(home, /disabled=\{isAuthLoading\}/, "home login must be disabled while a restore is pending");
assert.match(weeklyHome, /enabled: canRefreshSchedule/, "weekly schedule must wait for auth restoration");
assert.match(schedule, /enabled: canRefreshSchedule/, "schedule list must wait for auth restoration");
assert.match(weeklyHome, /refreshAuthenticatedSchedule\(\{ ready: canRefreshSchedule, refetch \}\)/, "weekly imperative refresh must wait for auth restoration");
assert.match(schedule, /refreshAuthenticatedSchedule\(\{ ready: canRefreshSchedule, refetch \}\)/, "schedule focus, retry, and pull refresh must wait for auth restoration");
assert.match(authContext, /setIsLoading\(true\);\s*setVisibleUser\(generation, null\);[\s\S]*finally \{\s*finishLoadingIfCurrent\(generation\);/s, "logout must pause auth-bound effects before publishing no user and always release loading");
assert.match(locationProvider, /reconcileLocationTrackingOwner\(/, "provider orphan cleanup must use a generation-aware owner reconciliation");
assert.match(locationProvider, /stopExactStoredTrackingAndNotify\(state, "업무취소"\)/, "provider orphan cleanup must stop only the exact persisted state");

console.log("MOBILE_AUTH_SESSION_CONTRACT_PASS");
