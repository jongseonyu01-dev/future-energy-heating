import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("../lib/location-tracking.ts", import.meta.url), "utf8");
const scheduler = await readFile(new URL("../lib/location-upload-scheduler.ts", import.meta.url), "utf8");

assert.match(source, /import \* as Auth from "@\/lib\/_core\/auth";/, "native session token helper must be imported");
assert.match(source, /await Auth\.getSessionToken\(\)/, "upload and headless paths must obtain the current native session token when no captured credential exists");
assert.match(source, /buildLocationRequestHeaders\(technicianToken\)/, "REST update must build the Bearer header required by production route");
assert.match(source, /await sendLocationToServer\(adopted\.state,/s, "background task must use the same authenticated sender");
assert.doesNotMatch(source, /fetch\(`\$\{getApiBaseUrl\(\)\}\/api\/location\/update`[\s\S]{0,400}headers: \{ "Content-Type": "application\/json" \}/, "unauthenticated update fetch must not remain");
assert.match(source, /notifySessionStop[\s\S]*buildLocationRequestHeaders\(technicianToken\)/s, "REST stop must use the same technician Bearer header");
assert.match(source, /classifyLocationUpdateResponse\(response\.status, payload\)/, "HTTP response must be classified with the explicit accepted contract");
assert.match(scheduler, /payload\.accepted === true/, "new location storage must require accepted:true");
assert.match(source, /lastStoredAt: recordedAt/, "only accepted storage may update the server-confirmed stored timestamp");
assert.match(source, /serverRecordedAt\(payload\?\.updatedAt\)/, "server updatedAt must be preferred over client response time");
assert.doesNotMatch(source, /lastSuccessAt/, "obsolete HTTP-only success marker must not remain");

console.log("location tracking authenticated sender contract: PASS");
