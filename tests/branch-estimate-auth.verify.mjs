import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/web/admin/branch.html", import.meta.url), "utf8");

assert.match(source, /function branchAuthHeaders\(\)/, "branch list calls must use a shared authenticated header helper");
assert.match(source, /await trpc\('estimates\.list', \{ _query: true, branchId: user\.branchId, status: status \|\| undefined \}\)/, "estimate list must use authenticated tRPC");
assert.match(source, /await trpc\('estimates\.list', \{ _query: true, branchId: user\.branchId, status: 'schedule_requested' \}\)/, "schedule list must use authenticated tRPC");
assert.match(source, /status: 'pending', sourceType: 'tech_request', techRequestStatus: 'pending'/, "initial report badge must use current pending contract");
assert.doesNotMatch(source, /status: 'report_pending'/, "obsolete report_pending condition must not remain");
assert.doesNotMatch(source, /fetch\(API \+ '\/estimates\.list/, "raw unauthenticated estimate list fetch must not remain");

console.log("PASS branch estimate authentication and pending badge contract");
