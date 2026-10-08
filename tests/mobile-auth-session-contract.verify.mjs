import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authContext = await readFile(new URL("../lib/auth-context.tsx", import.meta.url), "utf8");
const login = await readFile(new URL("../app/login.tsx", import.meta.url), "utf8");
const trpc = await readFile(new URL("../lib/trpc.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const weeklyHome = await readFile(new URL("../components/technician-weekly-home.tsx", import.meta.url), "utf8");
const schedule = await readFile(new URL("../app/(tabs)/tech-schedule.tsx", import.meta.url), "utf8");

assert.match(authContext, /synchronizeAppSessionToken\(saved\.token, Auth\.setSessionToken\)/, "restored mobile session must synchronize the tRPC bearer storage");
assert.match(authContext, /if \(!storageResult\.value\) \{\s*await clearAndRecordVersion\(\);/s, "SecureStore restoration failure must clear the visible session");
assert.match(authContext, /new AuthSessionTransition\(\)/, "auth transitions must have a generation guard");
assert.match(authContext, /await queryClient\.cancelQueries\(\);\s*queryClient\.clear\(\);/s, "account transitions must cancel and clear old schedule cache");
assert.match(authContext, /synchronizeAppSessionToken\(authUser\.token, Auth\.setSessionToken\)/, "new mobile login must persist the bearer before exposing the user");
assert.match(authContext, /SESSION_TOKEN_STORAGE_FAILED/, "new login must reject SecureStore failures");
assert.match(authContext, /if \(!raw\) \{[\s\S]*await clearAndRecordVersion\(\);/s, "rememberMe=false cold starts must clear the native bearer");
assert.doesNotMatch(login, /try \{ await Auth\.setSessionToken\(data\.token\); \} catch \{\}/, "login screen must not suppress token storage errors before AuthProvider handles them");
assert.match(trpc, /const API_URL = getApiBaseUrl\(\);/, "tRPC must use the single canonical API URL resolver");
assert.match(trpc, /getNativeSessionHeaders\(/, "native protected tRPC calls must use the session guard");
assert.match(trpc, /path: op\.path/, "tRPC session guard must receive the operation path");
assert.match(home, /disabled=\{isAuthLoading\}/, "home login must be disabled while a restore is pending");
assert.match(weeklyHome, /enabled: !!userId && !isAuthLoading/, "weekly schedule must wait for auth restoration");
assert.match(schedule, /enabled: !!userId && !isAuthLoading/, "schedule list must wait for auth restoration");

console.log("MOBILE_AUTH_SESSION_CONTRACT_PASS");
