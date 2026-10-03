import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tool = await readFile(resolve(root, "evidence/v1.1.38-windows-log-collector/collect_code38_crash.ps1"), "utf8");
const toolBytes = await readFile(resolve(root, "evidence/v1.1.38-windows-log-collector/collect_code38_crash.ps1"));
const launcher = await readFile(resolve(root, "evidence/v1.1.38-windows-log-collector/run_code38_collector.cmd"), "utf8");
const guide = await readFile(resolve(root, "evidence/v1.1.38-windows-log-collector/README_KO.md"), "utf8");

const requiredToolTerms = [
  "<#",
  "#>",
  "[Console]::OutputEncoding",
  "Find-Adb",
  "platform-tools\\adb.exe",
  "devices -l",
  'State -eq "unauthorized"',
  'State -eq "offline"',
  "USB 디버깅",
  "RSA 키를 허용",
  '"AndroidRuntime:E", "ReactNativeJS:V", "ReactNative:V", "Expo:V", "ExpoModulesCore:V"',
  "DesktopDirectory",
  '"code38-crash.txt"',
  '"captureStatus=$Status"',
  "function Get-AdbDeviceState",
  "adb get-state 예외",
  "adb get-state 비정상 종료",
  "adb get-state 빈 응답",
  "function Finish-FailedCapture",
  "분석을 위해 생성된 파일을 보내 주세요",
  '"수집이 시작되었습니다"',
  '"수집 실패:',
  "get-state",
  "필터에 맞는 로그가 없어 빈 수집으로 판정",
  "-Encoding UTF8",
  "--- LOGCAT ---",
  "--- ADB STDERR ---",
  "Stop-Collector",
];
for (const term of requiredToolTerms) assert.ok(tool.includes(term), `collector must include ${term}`);

assert.match(launcher, /powershell\.exe -NoProfile -ExecutionPolicy Bypass -File/);
assert.match(guide, /developer\.android\.com\/tools\/releases\/platform-tools/);
assert.match(guide, /USB 디버깅/);
assert.match(guide, /code38-crash\.txt/);
assert.match(guide, /성공·실패 상태와 관계없이/);
assert.doesNotMatch(tool, /adb\s+(?:install|uninstall|push|shell\s+pm)/i, "collector must not modify the app");
assert.doesNotMatch(tool, /logcat\s+-c/, "collector must not clear existing device logs");
assert.deepEqual([...toolBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "collector must be UTF-8 with BOM");

console.log(JSON.stringify({
  pass: true,
  checks: [
    "official-platform-tools-path",
    "usb-device-and-rsa-state",
    "filtered-native-and-js-logcat",
    "desktop-code38-crash-output",
    "utf8-explicit-read-and-write",
    "no-logcat-clear",
    "early-exit-disconnect-and-empty-log-failure",
    "no-app-install-or-uninstall-command",
  ],
}, null, 2));
