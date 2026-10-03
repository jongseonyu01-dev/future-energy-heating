import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/repack-operating-code44-aligned.mjs"), "utf8");
const config = fs.readFileSync(path.join(root, "app.config.ts"), "utf8");

const checks = [
  ["code 44 version", /version:\s*"1\.1\.44"/],
  ["code 44 versionCode", /versionCode:\s*44/],
  ["Build Tools 36 path", /android-build-tools\/36\.0\.0/],
  ["16KB align before sign", /zipalign, \["-f", "-P", "16", "-v", "4", repackOutput, alignedOutput\][\s\S]*?apksigner, \[/],
  ["final 16KB verification", /zipalign, \["-c", "-P", "16", "-v", "4", absoluteOutput\]/],
  ["final signer verification", /apksigner, \["verify", "--verbose", "--print-certs", absoluteOutput\]/],
  ["production API only", /EXPO_PUBLIC_API_BASE_URL: officialApiBase/],
  ["no review mode", /delete repackEnvironment\.EXPO_PUBLIC_REVIEW_MODE/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(label === "code 44 version" || label === "code 44 versionCode" ? config : source)) {
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`PASS: ${label}`);
}
