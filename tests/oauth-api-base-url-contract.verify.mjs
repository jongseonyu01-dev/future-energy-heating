import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../constants/oauth.ts", import.meta.url), "utf8");
const apiBaseUrlSource = await readFile(new URL("../lib/api-base-url.ts", import.meta.url), "utf8");

assert.match(source, /EXPO_PUBLIC_API_BASE_URL:\s*process\.env\.EXPO_PUBLIC_API_BASE_URL/, "API URL must use Expo-recognized direct dot access");
assert.match(source, /EXPO_PUBLIC_TECH_REVENUE_REVIEW_MODE:\s*process\.env\.EXPO_PUBLIC_TECH_REVENUE_REVIEW_MODE/, "revenue review flag must use direct dot access");
assert.match(source, /EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE:\s*process\.env\.EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE/, "estimate review flag must use direct dot access");
assert.doesNotMatch(source, /resolveApiBaseUrl\(process\.env\)/, "the complete process.env object must not bypass Metro static substitution");
assert.match(apiBaseUrlSource, /OFFICIAL_API_BASE_URL\s*=\s*"https:\/\/xn--h50b270bp0ceuddugnobx2m\.kr"/, "production API must use the canonical root host and not rely on a www redirect");
assert.doesNotMatch(apiBaseUrlSource, /https:\/\/www\.xn--h50b270bp0ceuddugnobx2m\.kr/, "production API must not rely on a cross-host redirect");

console.log("OAUTH_API_BASE_URL_METRO_CONTRACT_PASS");
