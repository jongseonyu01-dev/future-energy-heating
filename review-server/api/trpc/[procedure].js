// Vercel preview 전용: 운영 DB, 고객 접수, SMS/알림 provider를 사용하지 않는다.
// 모든 값은 preview process memory에만 존재하는 합성 검수 fixture다.
const reviewTechnicians = [
  {
    userId: 910001,
    technicianId: 910001,
    loginId: "review-tech",
    password: "review-only",
    token: "review-tech-token-v1",
    request: {
      id: 810001,
      name: "검수용 합성 고객 A",
      phone: "010-0000-0001",
      apartmentName: "합성 검수 아파트",
      dong: "101동",
      ho: "1001호",
      symptom: "방 일부 난방 점검",
      detailContent: "합성 검수용 접수입니다. 운영 고객 데이터와 연결되지 않습니다.",
    },
  },
  {
    userId: 910002,
    technicianId: 910002,
    loginId: "review-tech-2",
    password: "review-only-2",
    token: "review-tech-token-v2",
    request: {
      id: 810002,
      name: "검수용 합성 고객 B",
      phone: "010-0000-0002",
      apartmentName: "합성 검수 아파트",
      dong: "102동",
      ho: "1202호",
      symptom: "온도조절기 점검",
      detailContent: "두 번째 합성 기사 권한 분리 검수용 접수입니다.",
    },
  },
];

let sequence = 1;
const reports = [];
const consentedTechnicians = new Set();
const trackingSessions = new Map();

function kstDate(offsetDays = 0) {
  const kst = new Date(Date.now() + (9 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000));
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const ports = [
  [1, 2, 581000, 515000], [2, 3, 612000, 565000], [3, 4, 645000, 597000],
  [4, 5, 678000, 629000], [5, 6, 710000, 662000], [6, 7, 790000, 742000],
  [7, 8, 823000, 774000], [8, 9, 855000, 806000], [9, 10, 906000, 838000],
];

export const reviewPrices = [
  ...ports.map(([id, port, stdPrice, discPrice]) => ({ id, category: "분배기교체", name: `분배기 교체 (${port}구)`, unit: "식", stdPrice, discPrice, isActive: true })),
  { id: 30001, category: "밸브/배관", name: "스트레이너 25A", unit: "개", stdPrice: 81000, discPrice: 64000, isActive: true },
  { id: 60001, category: "밸브/배관", name: "유량밸브 15A", unit: "개", stdPrice: 29000, discPrice: 29000, isActive: true },
  { id: 60002, category: "제어/조절", name: "디지털 온도조절기", unit: "개", stdPrice: 106000, discPrice: 91000, isActive: true },
  { id: 60003, category: "제어/조절", name: "아날로그 조절기", unit: "개", stdPrice: 39000, discPrice: 30000, isActive: true },
  { id: 60004, category: "제어/조절", name: "제어기", unit: "개", stdPrice: 141000, discPrice: 141000, isActive: true },
  { id: 60005, category: "제어/조절", name: "와이파이형 제어기", unit: "개", stdPrice: 220000, discPrice: 220000, isActive: true },
  { id: 60006, category: "제어/조절", name: "조절기 V타입", unit: "개", stdPrice: 110000, discPrice: 110000, isActive: true },
  // 운영 공용 단가 DB를 read-only로 대조한 합성 검수 snapshot이며, 운영 DB에 쓰지 않는다.
  { id: 60009, category: "제어/조절", name: "단자함", unit: "개", stdPrice: 38000, discPrice: 30000, isActive: true },
  { id: 60010, category: "밸브/배관", name: "라인보수 20A", unit: "개", stdPrice: 166000, discPrice: 143000, isActive: true },
  { id: 60011, category: "밸브/배관", name: "라인보수 25A", unit: "개", stdPrice: 203000, discPrice: 194000, isActive: true },
  { id: 60007, category: "제어/조절", name: "구동기 파라핀", unit: "개", stdPrice: 39000, discPrice: 30000, isActive: true },
  { id: 60008, category: "제어/조절", name: "구동기 모터타입", unit: "개", stdPrice: 74000, discPrice: 50000, isActive: true },
  { id: -1001, category: "밸브/배관", name: "유량밸브 15A / 부분수리", unit: "개", stdPrice: 74000, discPrice: 58000, isActive: true },
  { id: -1002, category: "밸브/배관", name: "유량밸브 20A / 부분수리", unit: "개", stdPrice: 82000, discPrice: 65000, isActive: true },
  { id: -1003, category: "밸브/배관", name: "유량밸브 25A / 부분수리", unit: "개", stdPrice: 114000, discPrice: 94000, isActive: true },
];

const JSON_RPC_CODES = { BAD_REQUEST: -32600, UNAUTHORIZED: -32001, FORBIDDEN: -32003, NOT_FOUND: -32004, PRECONDITION_FAILED: -32012, INTERNAL_SERVER_ERROR: -32603 };

function normalizePhone(value) { return String(value || "").replace(/[^0-9]/g, ""); }
function isBatch(req) { return String(req.query?.batch || "") === "1"; }
function resultEnvelope(value) { return { result: { data: { json: value } } }; }
function respond(res, req, value) { return res.status(200).json(isBatch(req) ? [resultEnvelope(value)] : resultEnvelope(value)); }
function trpcError(res, req, { message, code = "BAD_REQUEST", status = 400, path }) {
  const body = { error: { json: { message, code: JSON_RPC_CODES[code] ?? -32603, data: { code, httpStatus: status, path } } } };
  return res.status(status).json(isBatch(req) ? [body] : body);
}
function requestFor(actor) {
  return {
    id: actor.request.id,
    requestNumber: `REVIEW-${actor.request.id}`,
    customerName: actor.request.name,
    phoneNumber: actor.request.phone,
    technicianId: actor.technicianId,
    technicianName: `검수 기사 ${actor.technicianId}`,
    apartmentName: actor.request.apartmentName,
    dong: actor.request.dong,
    ho: actor.request.ho,
    address: "서울특별시 검수구 합성로 36",
    addressFull: `서울특별시 검수구 합성로 36 ${actor.request.apartmentName} ${actor.request.dong} ${actor.request.ho}`,
    symptom: actor.request.symptom,
    requestType: "난방점검",
    detailContent: actor.request.detailContent,
    preferredDate: kstDate(-1),
    preferredTime: "10:00",
    // 현재 KST 기준 전날로 계산해 어느 검수일에도 미작업·이월 탭에 노출한다.
    scheduledDate: kstDate(-1),
    scheduledTime: "10:00",
    branchId: 9100,
    branchName: "합성 검수 지사",
    customerLat: null,
    customerLng: null,
    isDeleted: false,
    status: "방문예정",
  };
}
function readInput(req) {
  const raw = req.method === "GET" ? req.query?.input : req.body;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  const node = isBatch(req) ? parsed?.["0"] : parsed;
  return node?.json ?? {};
}
function reviewActor(req, res, procedure) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  const actor = reviewTechnicians.find((candidate) => candidate.token === token);
  if (!actor) {
    trpcError(res, req, { message: "검수 기사 인증이 필요합니다.", code: "UNAUTHORIZED", status: 401, path: procedure });
    return null;
  }
  return actor;
}
function requireOwnRequest(res, req, actor, requestId, procedure) {
  if (Number(requestId) !== actor.request.id) {
    trpcError(res, req, { message: "본인에게 배정된 합성 검수 접수만 조회·처리할 수 있습니다.", code: "FORBIDDEN", status: 403, path: procedure });
    return false;
  }
  return true;
}

export function resetReviewReportsForTest() {
  reports.splice(0, reports.length);
  consentedTechnicians.clear();
  trackingSessions.clear();
  sequence = 1;
}

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const procedure = String(req.query?.procedure || "");
  let input;
  try { input = readInput(req); } catch {
    return trpcError(res, req, { message: "검수 요청 형식이 올바르지 않습니다.", path: procedure });
  }

  if (procedure === "auth.login" && req.method === "POST") {
    const actor = reviewTechnicians.find((candidate) => candidate.loginId === input.loginId && candidate.password === input.password);
    const valid = Boolean(actor) && input.source === "app";
    return respond(res, req, valid
      ? { success: true, userId: actor.userId, technicianId: actor.technicianId, appRole: "technician", loginId: actor.loginId, name: `검수 기사 ${actor.technicianId}`, phoneNumber: actor.request.phone, token: actor.token, mustChangePassword: false }
      : { success: false, error: "검수 기사 계정 정보를 확인하세요." });
  }
  if (procedure === "auth.verifyToken" && req.method === "POST") {
    const valid = reviewTechnicians.some((candidate) => candidate.userId === input.userId && candidate.token === input.token);
    return respond(res, req, { success: valid });
  }

  const actor = reviewActor(req, res, procedure);
  if (!actor) return;

  if (procedure === "prices.listActive" && req.method === "GET") return respond(res, req, reviewPrices);
  if ((procedure === "estimates.reviewMyAssignedRequests" || procedure === "repair.listMySchedule") && req.method === "GET") return respond(res, req, [requestFor(actor)]);
  if (procedure === "repair.getById" && req.method === "GET") {
    if (!requireOwnRequest(res, req, actor, input.id, procedure)) return;
    return respond(res, req, requestFor(actor));
  }
  if (procedure === "workReport.getByRequest" && req.method === "GET") {
    if (!requireOwnRequest(res, req, actor, input.requestId, procedure)) return;
    return respond(res, req, null);
  }
  if (procedure === "location.getConsent" && req.method === "GET") {
    if (Number(input.technicianId) !== actor.technicianId) return trpcError(res, req, { message: "본인 위치 동의만 조회할 수 있습니다.", code: "FORBIDDEN", status: 403, path: procedure });
    return respond(res, req, { hasConsented: consentedTechnicians.has(actor.technicianId), technicianId: actor.technicianId });
  }
  if (procedure === "location.saveConsent" && req.method === "POST") {
    if (Number(input.technicianId) !== actor.technicianId) return trpcError(res, req, { message: "본인 위치 동의만 저장할 수 있습니다.", code: "FORBIDDEN", status: 403, path: procedure });
    consentedTechnicians.add(actor.technicianId);
    // 운영 서버 호환: 저장 성공 응답은 { success: true }만 보장하며, 동의 상태는 getConsent로 재조회한다.
    return respond(res, req, { success: true });
  }
  if (procedure === "location.startTracking" && req.method === "POST") {
    if (!requireOwnRequest(res, req, actor, input.requestId, procedure)) return;
    if (!consentedTechnicians.has(actor.technicianId)) return trpcError(res, req, { message: "위치정보 동의 저장이 확인되지 않았습니다.", code: "PRECONDITION_FAILED", status: 412, path: procedure });
    const token = `review-location-${actor.technicianId}-${actor.request.id}`;
    const session = { success: true, token, requestId: actor.request.id, trackingUrl: "https://review.invalid/synthetic-location", smsSent: false, synthetic: true };
    trackingSessions.set(actor.request.id, session);
    return respond(res, req, session);
  }
  if (procedure === "location.getSessionByRequest" && req.method === "GET") {
    if (!requireOwnRequest(res, req, actor, input.requestId, procedure)) return;
    return respond(res, req, trackingSessions.get(actor.request.id) ?? null);
  }
  if (procedure === "estimates.listMyTechRequests" && req.method === "GET") return respond(res, req, reports.filter((report) => report.technicianId === actor.technicianId));
  if (procedure === "estimates.techRequest" && req.method === "POST") {
    if (!requireOwnRequest(res, req, actor, input.requestId, procedure)) return;
    if (input.customerName?.trim() !== actor.request.name || normalizePhone(input.phoneNumber) !== normalizePhone(actor.request.phone)) return trpcError(res, req, { message: "본인에게 배정된 검수용 합성 접수 정보와 일치하지 않습니다.", code: "FORBIDDEN", status: 403, path: procedure });
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return trpcError(res, req, { message: "견적 총액은 정수 원화여야 합니다.", path: procedure });
    let lines;
    try { lines = JSON.parse(input.autoEstimateItems); } catch { return trpcError(res, req, { message: "견적 항목 형식이 올바르지 않습니다.", path: procedure }); }
    if (!Array.isArray(lines) || !lines.length || lines.some((line) => !Number.isInteger(line.qty) || line.qty < 1 || !Number.isSafeInteger(line.unitPrice) || line.unitPrice <= 0 || !Number.isSafeInteger(line.subtotal) || line.subtotal !== line.qty * line.unitPrice) || lines.reduce((sum, line) => sum + line.subtotal, 0) !== input.amount) return trpcError(res, req, { message: "견적 품목 수량·단가·금액은 정수 원화로 일치해야 합니다.", path: procedure });
    const estimateNumber = `REVIEW-${String(sequence++).padStart(4, "0")}`;
    reports.unshift({ id: estimateNumber, estimateNumber, requestId: actor.request.id, technicianId: actor.technicianId, customerName: actor.request.name, customerPhone: actor.request.phone, title: input.title || "합성 검수 견적", amount: input.amount, autoEstimateItems: input.autoEstimateItems, sourceType: "tech_request", techRequestStatus: "pending", smsSubstituted: true, status: "review_test_pending" });
    return respond(res, req, { success: true, estimateId: estimateNumber, estimateNumber, smsSubstituted: true });
  }
  return trpcError(res, req, { message: "검수 endpoint를 찾을 수 없습니다.", code: "NOT_FOUND", status: 404, path: procedure });
}
