import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("../lib/location-tracking.ts", import.meta.url), "utf8");

assert.match(source, /import \* as Auth from "@\/lib\/_core\/auth";/, "native session token helper must be imported");
assert.match(source, /const technicianToken = await Auth\.getSessionToken\(\);/, "both paths must obtain the current native session token");
assert.match(source, /buildLocationRequestHeaders\(technicianToken\)/, "REST update must build the Bearer header required by production route");
assert.match(source, /await sendLocationToServer\(\s*token,\s*latitude,\s*longitude,/s, "background task must use the same authenticated sender");
assert.doesNotMatch(source, /fetch\(`\$\{getApiBaseUrl\(\)\}\/api\/location\/update`[\s\S]{0,400}headers: \{ "Content-Type": "application\/json" \}/, "unauthenticated update fetch must not remain");
assert.match(source, /notifySessionStop[\s\S]*buildLocationRequestHeaders\(technicianToken\)/s, "REST stop must use the same technician Bearer header");
assert.match(source, /formatLocationRequestFailure\(resp\.status, errorPayload\?\.error\)/, "HTTP failure must retain response status and reason");
assert.match(source, /lastSuccessAt: now/, "only successful HTTP response may update last successful send time");

console.log("location tracking authenticated sender contract: PASS");
