import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const report = fs.readFileSync(`${root}/app/work-report.tsx`, "utf8");
const appConfig = fs.readFileSync(`${root}/app.config.ts`, "utf8");
const packageJson = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));

const checks = [
  ["ImagePicker config plugin 유지", /"expo-image-picker"/.test(appConfig)],
  ["점검표 최상위 ImagePicker import 제거", !/import\s+\*\s+as\s+ImagePicker\s+from\s+["']expo-image-picker["']/.test(report)],
  ["사진 동작에서만 ImagePicker 지연 로드", /await import\(["']expo-image-picker["']\)/.test(report) && /const imagePicker = await loadImagePicker\(\)/.test(report)],
  ["native module 누락은 사진 기능 안내로 처리", /사진 기능 준비 오류/.test(report) && /ImagePicker native module unavailable/.test(report)],
  ["카메라·앨범 실행 오류 안내", /ImagePicker camera launch failed/.test(report) && /ImagePicker library launch failed/.test(report)],
  ["SDK 54 ImagePicker 17 호환 dependency", /^\^17\.0\.11$/.test(packageJson.dependencies["expo-image-picker"] ?? "")],
  ["SDK 54 Location 19 호환 dependency", /^\^19\.0\.8$/.test(packageJson.dependencies["expo-location"] ?? "")],
  ["SDK 54 TaskManager 14 호환 dependency", /^\^14\.0\.9$/.test(packageJson.dependencies["expo-task-manager"] ?? "")],
];

for (const [label, passed] of checks) {
  assert.equal(passed, true, label);
  console.log(`PASS: ${label}`);
}
console.log(`SUMMARY: ${checks.length} PASS`);
