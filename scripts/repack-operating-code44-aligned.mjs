#!/usr/bin/env node
/**
 * Repackage a verified production APK with JavaScript-only changes.
 *
 * Final Android APK creation is explicitly ordered as:
 *   1. Expo Repack updates the APK contents;
 *   2. Build Tools 36 zipalign aligns 4-byte entries and stored .so files to 16KB;
 *   3. the existing Android signing key signs the aligned APK;
 *   4. Build Tools 36 verifies both alignment and signature on the final file.
 *
 * Signing credentials must be an owner-only, ephemeral directory obtained from
 * the existing EAS credential store. This tool never writes or prints passwords,
 * aliases, keystore contents, or credential JSON.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const officialApiBase = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const sourceApk = process.argv[2];
const outputApk = process.argv[3];
const credentialDir = process.env.FET_REPACK_CREDENTIAL_DIR;
const buildToolsDir = process.env.FET_ANDROID_BUILD_TOOLS_DIR ?? "/opt/android-build-tools/36.0.0";

if (!sourceApk || !outputApk || !credentialDir) {
  console.error("usage: FET_REPACK_CREDENTIAL_DIR=/secure/tmp node scripts/repack-operating-code44-aligned.mjs <source.apk> <output.apk>");
  process.exit(2);
}

const resolvedCredentialDir = path.resolve(credentialDir);
const credentialJsonPath = path.join(resolvedCredentialDir, "credentials.json");
const tools = {
  zipalign: path.join(buildToolsDir, "zipalign"),
  apksigner: path.join(buildToolsDir, "apksigner"),
};

if (!fs.existsSync(sourceApk) || !fs.existsSync(credentialJsonPath)) {
  console.error("source APK or existing EAS credential manifest is unavailable");
  process.exit(2);
}
if (!fs.existsSync(tools.zipalign) || !fs.existsSync(tools.apksigner)) {
  console.error("Android Build Tools 36 zipalign/apksigner are unavailable");
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

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed`);
  }
}

const absoluteOutput = path.resolve(outputApk);
fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
const workDir = path.join(path.dirname(absoluteOutput), ".repack-code44-work");
const repackOutput = path.join(workDir, "repacked.apk");
const alignedOutput = path.join(workDir, "aligned-16k.apk");
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

const repackArgs = [
  "--yes",
  "@expo/repack-app@latest",
  "--platform", "android",
  "--source-app", path.resolve(sourceApk),
  "--output", repackOutput,
  "--working-directory", path.join(workDir, "expo-work"),
  "--android-build-tools-dir", buildToolsDir,
  "--ks", keystorePath,
  "--ks-pass", `pass:${android.keystorePassword}`,
  "--ks-key-alias", android.keyAlias,
  "--ks-key-pass", `pass:${android.keyPassword}`,
  "--embed-bundle-assets",
];

const repackEnvironment = { ...process.env, EXPO_PUBLIC_API_BASE_URL: officialApiBase };
delete repackEnvironment.EXPO_PUBLIC_REVIEW_MODE;

try {
  const repack = spawnSync("npx", repackArgs, { cwd: process.cwd(), env: repackEnvironment, stdio: "inherit" });
  if (repack.error || repack.status !== 0) throw new Error("Expo Repack failed");

  // Alignment invalidates the intermediate APK signature, so it must precede final signing.
  run(tools.zipalign, ["-f", "-P", "16", "-v", "4", repackOutput, alignedOutput]);
  run(tools.apksigner, [
    "sign",
    "--ks", keystorePath,
    "--ks-pass", `pass:${android.keystorePassword}`,
    "--ks-key-alias", android.keyAlias,
    "--key-pass", `pass:${android.keyPassword}`,
    "--out", absoluteOutput,
    alignedOutput,
  ]);
  run(tools.zipalign, ["-c", "-P", "16", "-v", "4", absoluteOutput]);
  run(tools.apksigner, ["verify", "--verbose", "--print-certs", absoluteOutput]);
} catch (error) {
  fs.rmSync(absoluteOutput, { force: true });
  console.error(error instanceof Error ? error.message : "code 44 APK packaging failed");
  process.exitCode = 1;
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
