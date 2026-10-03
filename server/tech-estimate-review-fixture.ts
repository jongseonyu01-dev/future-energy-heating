/**
 * 기사 견적 검수 전용 fixture.
 *
 * TECH_ESTIMATE_REVIEW_MODE=1 인 임시 검수 서버에서만 사용한다. 운영 DB,
 * 고객 접수, SMS·알림톡 provider를 import하거나 호출하지 않으며, 프로세스
 * 재시작 시 모든 합성 보고 내역은 사라진다.
 */
export type SyntheticReviewActor = {
  userId: number;
  technicianId: number;
  loginId: string;
  token: string;
  request: { id: number; name: string; phone: string };
};

/**
 * 검수 전용 계정과 배정 접수. 운영 계정·고객·접수와 연결하지 않으며,
 * 단일 기사/접수 고정이 아니라 로그인 actor별로 자신의 배정 접수만 사용한다.
 */
const SYNTHETIC_REVIEW_ACTORS: readonly SyntheticReviewActor[] = [
  {
    userId: 910001,
    technicianId: 910001,
    loginId: "review-tech",
    token: "review-tech-token-v1",
    request: { id: 810001, name: "검수용 합성 고객 A", phone: "010-0000-0001" },
  },
  {
    userId: 910002,
    technicianId: 910002,
    loginId: "review-tech-2",
    token: "review-tech-token-v2",
    request: { id: 810002, name: "검수용 합성 고객 B", phone: "010-0000-0002" },
  },
] as const;

export function getSyntheticReviewActorByLoginId(loginId: string): SyntheticReviewActor | null {
  return SYNTHETIC_REVIEW_ACTORS.find((actor) => actor.loginId === loginId) ?? null;
}

type ReviewPrice = {
  id: number;
  category: string;
  name: string;
  unit: string;
  stdPrice: number;
  discPrice: number;
  description?: string;
  isActive: true;
};

const manifoldSnapshot: ReviewPrice[] = [
  [1, 2, 581000, 515000], [2, 3, 612000, 565000], [3, 4, 645000, 597000],
  [4, 5, 678000, 629000], [5, 6, 710000, 662000], [6, 7, 790000, 742000],
  [7, 8, 823000, 774000], [8, 9, 855000, 806000], [9, 10, 906000, 838000],
].map(([id, port, stdPrice, discPrice]) => ({
  id, category: "분배기교체", name: `분배기 교체 (${port}구)`, unit: "식", stdPrice, discPrice, isActive: true,
}));

/** 2026-09-12 운영 홈페이지에서 read-only로 확인한 검수용 가격 snapshot. */
export const SYNTHETIC_REVIEW_PRICES: ReviewPrice[] = [
  ...manifoldSnapshot,
  { id: 30001, category: "밸브/배관", name: "스트레이너 25A", unit: "개", stdPrice: 81000, discPrice: 64000, description: "분배기시공시 할인단가: 36000원", isActive: true },
  { id: 60001, category: "밸브/배관", name: "유량밸브 15A", unit: "개", stdPrice: 29000, discPrice: 29000, description: "분배기시공시 할인단가. 각방 온도조절기 있을 때만 구수만큼 자동추가", isActive: true },
  { id: 60002, category: "제어/조절", name: "디지털 온도조절기", unit: "개", stdPrice: 106000, discPrice: 91000, isActive: true },
  { id: 60003, category: "제어/조절", name: "아날로그 조절기", unit: "개", stdPrice: 39000, discPrice: 30000, isActive: true },
  { id: 60004, category: "제어/조절", name: "제어기", unit: "개", stdPrice: 141000, discPrice: 141000, isActive: true },
  { id: 60005, category: "제어/조절", name: "와이파이형 제어기", unit: "개", stdPrice: 220000, discPrice: 220000, isActive: true },
  { id: 60006, category: "제어/조절", name: "조절기 V타입", unit: "개", stdPrice: 110000, discPrice: 110000, isActive: true },
  { id: 60007, category: "제어/조절", name: "구동기 파라핀", unit: "개", stdPrice: 39000, discPrice: 30000, isActive: true },
  { id: 60008, category: "제어/조절", name: "구동기 모터타입", unit: "개", stdPrice: 74000, discPrice: 50000, isActive: true },
  { id: -1001, category: "밸브/배관", name: "유량밸브 15A / 부분수리", unit: "개", stdPrice: 74000, discPrice: 58000, isActive: true },
  { id: -1002, category: "밸브/배관", name: "유량밸브 20A / 부분수리", unit: "개", stdPrice: 82000, discPrice: 65000, isActive: true },
  { id: -1003, category: "밸브/배관", name: "유량밸브 25A / 부분수리", unit: "개", stdPrice: 114000, discPrice: 94000, isActive: true },
];

type SyntheticLine = { name: string; qty: number; unitPrice: number; subtotal: number };
type SyntheticReport = {
  id: number;
  requestId: number;
  customerName: string;
  customerPhone: string;
  title: string;
  amount: number;
  autoEstimateItems: string;
  estimateNumber: string;
  sourceType: "tech_request";
  techRequesterId: number;
  techRequestStatus: "pending";
  status: "review_test_pending";
  smsSubstituted: true;
  createdAt: Date;
};

let nextReportId = 1;
const reports: SyntheticReport[] = [];

export function isSyntheticTechEstimateReviewMode(): boolean {
  return process.env.TECH_ESTIMATE_REVIEW_MODE === "1";
}

export function resolveSyntheticTechEstimateReviewActor(ctx: any): SyntheticReviewActor | null {
  const rawHeader = ctx?.req?.headers?.authorization ?? ctx?.req?.headers?.Authorization;
  if (typeof rawHeader !== "string" || !rawHeader.startsWith("Bearer ")) return null;
  const token = rawHeader.slice(7).trim();
  return SYNTHETIC_REVIEW_ACTORS.find((actor) => actor.token === token) ?? null;
}

export function listSyntheticTechEstimateReviewRequests(actor: SyntheticReviewActor) {
  return [{
    id: actor.request.id,
    requestNumber: `REVIEW-${actor.request.id}`,
    customerName: actor.request.name,
    phoneNumber: actor.request.phone,
    technicianId: actor.technicianId,
    isDeleted: false,
    status: "방문예정",
  }];
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function validateSyntheticLines(serialized: string, amount: number): SyntheticLine[] {
  let lines: unknown;
  try { lines = JSON.parse(serialized); } catch { throw new Error("견적 항목 형식이 올바르지 않습니다."); }
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("견적 항목이 1개 이상 필요합니다.");
  const checked = lines.map((line: any) => {
    if (!line || typeof line.name !== "string" || !Number.isInteger(line.qty) || line.qty < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0 || !Number.isFinite(line.subtotal) || line.subtotal !== line.qty * line.unitPrice) {
      throw new Error("견적 품목 수량·단가·금액이 일치하지 않습니다.");
    }
    return { name: line.name, qty: line.qty, unitPrice: line.unitPrice, subtotal: line.subtotal };
  });
  if (!Number.isFinite(amount) || amount <= 0 || checked.reduce((sum, line) => sum + line.subtotal, 0) !== amount) {
    throw new Error("견적 총액과 품목 합계가 일치하지 않습니다.");
  }
  return checked;
}

export function submitSyntheticTechEstimateReview(input: {
  requestId: number;
  customerName: string;
  phoneNumber: string;
  title?: string;
  amount: number;
  autoEstimateItems: string;
}, actor: SyntheticReviewActor): { success: true; estimateId: number; estimateNumber: string; smsSubstituted: true } {
  if (input.requestId !== actor.request.id || input.customerName.trim() !== actor.request.name || normalizePhone(input.phoneNumber) !== normalizePhone(actor.request.phone)) {
    throw new Error("검수용 합성 접수 정보와 일치하지 않습니다.");
  }
  validateSyntheticLines(input.autoEstimateItems, input.amount);
  const id = nextReportId++;
  const estimateNumber = `REVIEW-${String(id).padStart(4, "0")}`;
  reports.unshift({
    id,
    requestId: actor.request.id,
    customerName: actor.request.name,
    customerPhone: actor.request.phone,
    title: input.title?.trim() || "검수용 합성 견적",
    amount: input.amount,
    autoEstimateItems: input.autoEstimateItems,
    estimateNumber,
    sourceType: "tech_request",
    techRequesterId: actor.technicianId,
    techRequestStatus: "pending",
    status: "review_test_pending",
    smsSubstituted: true,
    createdAt: new Date(),
  });
  return { success: true, estimateId: id, estimateNumber, smsSubstituted: true };
}

export function listSyntheticTechEstimateReviews(actor: SyntheticReviewActor): SyntheticReport[] {
  return reports.filter((report) => report.techRequesterId === actor.technicianId).map((report) => ({ ...report }));
}

export function resetSyntheticTechEstimateReviewsForTest(): void {
  reports.splice(0, reports.length);
  nextReportId = 1;
}
