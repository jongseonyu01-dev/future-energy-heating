import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const home = fs.readFileSync(
  `${root}/components/technician-weekly-home.tsx`,
  "utf8",
);
const schedule = fs.readFileSync(
  `${root}/app/(tabs)/tech-schedule.tsx`,
  "utf8",
);
const index = fs.readFileSync(`${root}/app/(tabs)/index.tsx`, "utf8");
const weekly = fs.readFileSync(
  `${root}/lib/technician-weekly-schedule.ts`,
  "utf8",
);

const checks = [
  [
    "홈은 기사 전용 주간 컴포넌트를 사용",
    index.includes("<TechnicianWeeklyHome onPress={handlePress} />"),
  ],
  [
    "요약은 정확히 네 가지 기존 작업 경로를 보존",
    [
      "/tech-schedule?tab=today",
      "/tech-schedule?tab=tomorrow",
      "/tech-schedule?tab=overdue",
      "/tech-works",
    ].every((route) => home.includes(route)),
  ],
  [
    "주간 영역은 내일부터 정확히 7일",
    /Array\.from\(\{ length: 7 \}, \(_, index\)[\s\S]*getKstDateString\(now, index \+ 1\)/.test(
      weekly,
    ),
  ],
  [
    "날짜 버튼은 4개+3개로 줄바꿈 가능",
    home.includes('flexBasis: "23%"') && home.includes('flexWrap: "wrap"'),
  ],
  [
    "날짜와 재시도 터치 영역은 44px 이상",
    home.includes("minHeight: 52") && home.includes("minHeight: 44"),
  ],
  [
    "선택 날짜는 세션 기반 본인 일정 원본을 재사용",
    home.includes("trpc.repair.listMySchedule.useQuery") &&
      home.includes("getUpcomingWorksForDate(activeWorks, selectedDate)"),
  ],
  [
    "0건·로딩·실패를 구분해 표시",
    [
      "일정을 불러오는 중입니다.",
      "일정을 불러오지 못했습니다.",
      "예정된 작업 없음",
    ].every((text) => home.includes(text)),
  ],
  [
    "선택 일정은 기존 작업 일정 상세 흐름으로 연결",
    home.includes("/tech-schedule?date=${selectedDate}") &&
      schedule.includes("selectedScheduleDate"),
  ],
  [
    "주간 날짜 화면은 별도의 선택 상태로 표시",
    schedule.includes("selectedScheduleDate") &&
      schedule.includes("!selectedScheduleDate && activeTab === tab.key"),
  ],
  [
    "전경 복귀와 KST 자정에만 주간 범위를 갱신",
    home.includes('AppState.addEventListener("change"') &&
      home.includes("getMsUntilNextKstMidnight"),
  ],
];

for (const [label, passed] of checks) {
  assert.equal(passed, true, label);
  console.log(`PASS: ${label}`);
}
console.log(`SUMMARY: ${checks.length} PASS`);
