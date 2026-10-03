#!/usr/bin/env node
/**
 * Repackage a verified production APK with JavaScript-only changes.
 *
 * The signing credential directory must be an ephemeral, owner-only path
 * obtained from the existing EAS credential store. This script never writes
 * or prints passwords, aliases, keystore contents, or credential JSON.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const officialApiBase = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const sourceApk = process.argv[2];
const outputApk = process.argv[3];
const credentialDir = process.env.FET_REPACK_CREDENTIAL_DIR;

if (!sourceApk || !outputApk || !credentialDir) {
  console.error("usage: FET_REPACK_CREDENTIAL_DIR=/secure/tmp node scripts/repack-operating-code43.mjs <source.apk> <output.apk>");
  process.exit(2);
}

const resolvedCredentialDir = path.resolve(credentialDir);
const credentialJsonPath = path.join(resolvedCredentialDir, "credentials.json");
if (!fs.existsSync(sourceApk) || !fs.existsSync(credentialJsonPath)) {
  console.error("source APK or existing EAS credential manifest is unavailable");
  process.exit(2);
}

const credential = JSON.parse(fs.readFileSync(credentialJsonPath, "utf8"));
const android = credential?.android?.keystore;
if (
  !android ||
  typeof android.keystorePath !== "string" ||
  typeof android.keystorePassword !== "string" ||
  typeof android.keyAlias !== "string" ||
  typeof android.keyPassword !== "string"
) {
  console.error("existing Android signing credential has an invalid shape");
  process.exit(2);
}

const keystorePath = path.resolve(resolvedCredentialDir, android.keystorePath);
if (!keystorePath.startsWith(`${resolvedCredentialDir}${path.sep}`) || !fs.existsSync(keystorePath)) {
  console.error("existing Android keystore path is unavailable");
  process.exit(2);
}

const buildToolsDir = "/usr/lib/android-sdk/build-tools/debian";
if (!fs.existsSync(path.join(buildToolsDir, "zipalign")) || !fs.existsSync(path.join(buildToolsDir, "apksigner"))) {
  console.error("required Android build-tools are unavailable");
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(outputApk)), { recursive: true });
const workDir = path.join(path.dirname(path.resolve(outputApk)), ".repack-work");
fs.rmSync(workDir, { recursive: true, force: true });

const args = [
  "--yes",
  "@expo/repack-app@latest",
  "--platform", "android",
  "--source-app", path.resolve(sourceApk),
  "--output", path.resolve(outputApk),
  "--working-directory", workDir,
  "--android-build-tools-dir", buildToolsDir,
  "--ks", keystorePath,
  "--ks-pass", `pass:${android.keystorePassword}`,
  "--ks-key-alias", android.keyAlias,
  "--ks-key-pass", `pass:${android.keyPassword}`,
  "--embed-bundle-assets",
];

const repackEnvironment = {
  ...process.env,
  EXPO_PUBLIC_API_BASE_URL: officialApiBase,
};
delete repackEnvironment.EXPO_PUBLIC_REVIEW_MODE;

try {
  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    env: repackEnvironment,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error("Expo Repack failed; no signing credential values were recorded.");
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
