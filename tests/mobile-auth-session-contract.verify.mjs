import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authContext = await readFile(new URL("../lib/auth-context.tsx", import.meta.url), "utf8");
const login = await readFile(new URL("../app/login.tsx", import.meta.url), "utf8");
const trpc = await readFile(new URL("../lib/trpc.ts", import.meta.url), "utf8");

assert.match(authContext, /synchronizeAppSessionToken\(saved\.token, Auth\.setSessionToken\)/, "restored mobile session must synchronize the tRPC bearer storage");
assert.match(authContext, /if \(!synchronized\) \{\s*await clearAllAuthStorage\(\)/s, "SecureStore restoration failure must clear the visible session");
assert.match(authContext, /synchronizeAppSessionToken\(authUser\.token, Auth\.setSessionToken\)/, "new mobile login must persist the bearer before setUser");
assert.match(authContext, /if \(!synchronized\) throw new Error\("SESSION_TOKEN_STORAGE_FAILED"\);/, "new login must not ignore SecureStore failures");
assert.doesNotMatch(login, /try \{ await Auth\.setSessionToken\(data\.token\); \} catch \{\}/, "login screen must not suppress token storage errors before AuthProvider handles them");
assert.match(trpc, /const API_URL = getApiBaseUrl\(\);/, "tRPC must use the single canonical API URL resolver");
assert.match(trpc, /Authorization: `Bearer \$\{token\}`/, "tRPC must send the synchronized bearer token");

console.log("MOBILE_AUTH_SESSION_CONTRACT_PASS");
