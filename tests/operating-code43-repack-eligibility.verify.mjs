import { execFileSync } from "node:child_process";
import fs from "node:fs";

const baseline = "7c0ee02d";
const changed = execFileSync("git", ["diff", "--name-only", baseline, "--"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).split("\n").filter(Boolean);

const forbiddenNativeChanges = changed.filter((file) =>
  file === "package.json" ||
  file === "pnpm-lock.yaml" ||
  file.startsWith("android/") ||
  file.startsWith("ios/") ||
  file === "app.json" ||
  file === "app.config.ts" && !fs.readFileSync(file, "utf8").includes('version: "1.1.43"'),
);

if (forbiddenNativeChanges.length > 0) {
  throw new Error(`repack blocked by native configuration changes: ${forbiddenNativeChanges.join(", ")}`);
}

const tracking = fs.readFileSync("lib/location-tracking.ts", "utf8");
if (!tracking.includes("buildLocationRequestHeaders") || !tracking.includes("Auth.getSessionToken")) {
  throw new Error("location sender is not using the current-token request helper");
}

console.log(JSON.stringify({
  baseline,
  changedFileCount: changed.length,
  nativeConfigurationChanges: 0,
  result: "eligible_for_js_and_metadata_repack",
}, null, 2));
