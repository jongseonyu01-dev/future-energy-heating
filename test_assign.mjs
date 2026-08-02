// 검증용 테스트 데이터 배정 스크립트
// yjs2 기사(technicianId:540003, name:유종선0)에게 10가지 조건의 작업 배정

const BASE_URL = "https://www.xn--h50b270bp0ceuddugnobx2m.kr";
const ADMIN_TOKEN = "1072094361:fee9f3e44c8ee93f9cc5a49364d06e52ac77f0598007d2928a472e3e00283254";
const YJS2_TECH_ID = 540003;
const YJS2_TECH_NAME = "유종선0";

// KST 날짜 계산
function getKSTDate(offsetDays = 0) {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(kstMs + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const today = getKSTDate(0);
const yesterday = getKSTDate(-1);
const tomorrow = getKSTDate(1);
const dayAfter = getKSTDate(2);

console.log(`날짜: 어제=${yesterday}, 오늘=${today}, 내일=${tomorrow}, 모레=${dayAfter}`);

async function trpcQuery(proc, input) {
  const url = `${BASE_URL}/api/trpc/${proc}`;
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${url}?input=${encoded}`, {
    headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` }
  });
  const data = await res.json();
  return data?.result?.data?.json ?? data;
}

async function trpcMutate(proc, input) {
  const url = `${BASE_URL}/api/trpc/${proc}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ json: input })
  });
  const data = await res.json();
  return data?.result?.data?.json ?? data;
}

// 기존 접수 목록에서 신규접수 상태인 것 찾기
async function getUnassignedRequests() {
  const all = await trpcQuery("repair.listAll", {});
  if (!Array.isArray(all)) {
    console.log("listAll 응답:", JSON.stringify(all).slice(0, 200));
    return [];
  }
  return all.filter(r => r.status === "신규접수" && !r.technicianId && !r.isDeleted);
}

// 기사 배정 함수
async function assignTechnician(requestId, scheduledDate, scheduledTime) {
  const input = {
    id: requestId,
    technicianId: YJS2_TECH_ID,
    technicianName: YJS2_TECH_NAME,
    notify: false, // 테스트 시 문자 발송 안 함
  };
  if (scheduledDate) {
    input.scheduledDate = scheduledDate;
    if (scheduledTime) input.scheduledTime = scheduledTime;
  }
  const result = await trpcMutate("repair.assignTechnician", input);
  return result;
}

// 상태 변경 함수
async function updateStatus(requestId, status) {
  const result = await trpcMutate("repair.updateStatus", {
    id: requestId,
    status,
    actorRole: "hq_admin",
    actorUserId: 1072094361,
  });
  return result;
}

async function main() {
  console.log("\n=== 미배정 접수 목록 조회 ===");
  const unassigned = await getUnassignedRequests();
  console.log(`미배정 신규접수: ${unassigned.length}건`);
  
  if (unassigned.length < 8) {
    console.log("⚠️ 미배정 접수가 부족합니다.");
    return;
  }

  // 검증 조건별 배정 (DB ENUM에 없는 상태는 사용하지 않음)
  // statusValues: 신규접수, 기사배정대기, 방문예정, 기사확인대기, 기사확인완료, 출발, 도착, 공사중, 작업진행중, 견적승인대기, 작업완료, 공사완료, 재방문필요
  const testCases = [
    { label: "어제 미완료", date: yesterday, time: "10:00", status: "방문예정" },
    { label: "어제 작업완료", date: yesterday, time: "11:00", status: "작업완료" },
    { label: "오늘 미완료", date: today, time: "09:00", status: "방문예정" },
    { label: "오늘 작업완료", date: today, time: "14:00", status: "작업완료" },
    { label: "내일 방문", date: tomorrow, time: "10:00", status: null },
    { label: "모레 방문", date: dayAfter, time: "13:00", status: null },
    { label: "방문일 미정", date: null, time: null, status: null },
    { label: "재방문필요(취소 대체)", date: today, time: "15:00", status: "재방문필요" },
  ];

  const results = [];
  for (let i = 0; i < Math.min(testCases.length, unassigned.length); i++) {
    const tc = testCases[i];
    const req = unassigned[i];
    console.log(`\n[${tc.label}] 접수 #${req.id} 배정 중...`);
    
    try {
      const assignResult = await assignTechnician(req.id, tc.date, tc.time);
      const assignOk = assignResult && !assignResult.error;
      console.log(`  배정 결과: ${assignOk ? '✅ 성공' : '❌ ' + JSON.stringify(assignResult).slice(0, 100)}`);
      
      if (tc.status && tc.status !== "방문예정") {
        const statusResult = await updateStatus(req.id, tc.status);
        const statusOk = statusResult?.success === true;
        console.log(`  상태변경(${tc.status}): ${statusOk ? '✅ 성공' : '❌ ' + JSON.stringify(statusResult).slice(0, 100)}`);
      }
      
      results.push({ label: tc.label, requestId: req.id, date: tc.date, status: tc.status ?? "방문예정" });
    } catch (e) {
      console.error(`  오류:`, e.message);
    }
  }

  console.log("\n=== 배정 완료 요약 ===");
  results.forEach(r => console.log(`  ${r.label}: #${r.requestId} (${r.date ?? "미정"}, ${r.status})`));
  
  console.log("\n=== yjs2 기사 일정 조회 (listMySchedule API 테스트) ===");
  // yjs2 토큰으로 listMySchedule 호출
  const YJS2_TOKEN = "1770546140:26f99a20c66a58a2de5d2500ba4"; // 이전 세션 토큰 (만료됐을 수 있음)
  const url = `${BASE_URL}/api/trpc/repair.listMySchedule`;
  const encoded = encodeURIComponent(JSON.stringify({ json: {} }));
  const res = await fetch(`${url}?input=${encoded}`, {
    headers: { "Authorization": `Bearer ${YJS2_TOKEN}` }
  });
  const data = await res.json();
  const items = data?.result?.data?.json;
  if (Array.isArray(items)) {
    console.log(`  yjs2 기사 일정: ${items.length}건`);
    items.slice(0, 5).forEach(r => console.log(`    #${r.id} ${r.scheduledDate ?? '미정'} ${r.status}`));
  } else {
    console.log("  listMySchedule 응답:", JSON.stringify(data).slice(0, 200));
  }
}

main().catch(console.error);
