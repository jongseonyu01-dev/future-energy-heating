import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const schedule = fs.readFileSync(`${root}/app/(tabs)/tech-schedule.tsx`, "utf8");
const works = fs.readFileSync(`${root}/app/(tabs)/tech-works.tsx`, "utf8");
const report = fs.readFileSync(`${root}/app/work-report.tsx`, "utf8");
const tracking = fs.readFileSync(`${root}/lib/location-tracking.ts`, "utf8");
const consentFlow = fs.readFileSync(`${root}/lib/location-consent-confirmation.ts`, "utf8");

const checks = [
  ["동의 저장은 인증 tRPC mutation", /saveConsentMutation\.mutateAsync\(\{ technicianId: effectiveTechId \}\)/.test(schedule)],
  ["운영 saveConsent 응답 뒤 인증 getConsent 재조회", /saveAndConfirmLocationConsent/.test(schedule) && /consentQuery\.refetch\(\{ throwOnError: true \}\)/.test(schedule)],
  ["동의 저장·재조회 실패 시 출발 중단", /동의 저장 실패/.test(schedule) && /if \(!confirmation\.ok\)/.test(schedule) && /return;/.test(schedule.slice(schedule.indexOf("if (!confirmation.ok)"), schedule.indexOf("대기 중인 방문 건 출발 처리")))],
  ["동의 확인 helper는 저장 success와 readback hasConsented를 모두 요구", /saved\?\.success !== true/.test(consentFlow) && /confirmed\?\.hasConsented !== true/.test(consentFlow)],
  ["위치 전송은 review API helper", tracking.includes("getApiBaseUrl()}/api/location/update") && !/const API_BASE_URL\s*=/.test(tracking)],
  ["전체 목록 빈 아파트 검색 방어", /String\(w\.apartmentName \?\? ""\)\.includes\(search\)/.test(works)],
  ["점검표 빈 고객·전화 방어", /request\.customerName \?\? "고객 정보 미확인"/.test(report) && /request\.phoneNumber \?\? ""/.test(report)],
];

for (const [label, passed] of checks) {
  assert.equal(passed, true, label);
  console.log(`PASS: ${label}`);
}
console.log(`SUMMARY: ${checks.length} PASS`);
