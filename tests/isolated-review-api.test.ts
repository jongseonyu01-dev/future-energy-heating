import { beforeEach, describe, expect, it } from "vitest";
import handler, { resetReviewReportsForTest } from "../review-server/api/trpc/[procedure].js";

const REVIEW_TOKEN = "review-tech-token-v1";
const SECOND_REVIEW_TOKEN = "review-tech-token-v2";

function call({ method, procedure, input, token, batch = false }: { method: "GET" | "POST"; procedure: string; input?: unknown; token?: string; batch?: boolean }) {
  let statusCode = 0; let payload: any;
  const res = { setHeader: () => undefined, status: (status: number) => { statusCode = status; return res; }, json: (value: unknown) => { payload = value; return value; } };
  const encoded = batch ? { "0": { json: input ?? null } } : { json: input ?? null };
  handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: { procedure, ...(batch ? { batch: "1" } : {}), ...(method === "GET" ? { input: JSON.stringify(encoded) } : {}) }, body: method === "POST" ? encoded : undefined }, res);
  return { statusCode, payload };
}

describe("Vercel isolated review API", () => {
  beforeEach(() => resetReviewReportsForTest());

  it("requires the synthetic technician login before serving the static price snapshot", () => {
    expect(call({ method: "GET", procedure: "prices.listActive" }).statusCode).toBe(401);
    expect(call({ method: "POST", procedure: "auth.login", input: { loginId: "review-tech", password: "review-only", source: "app" } }).payload.result.data.json).toMatchObject({ success: true, appRole: "technician", technicianId: 910001 });
    const response = call({ method: "GET", procedure: "prices.listActive", token: REVIEW_TOKEN });
    expect(response.statusCode).toBe(200);
    expect(response.payload.result.data.json.find((item: any) => item.name === "유량밸브 15A / 부분수리").discPrice).toBe(58000);
  });

  it("stores only a synthetic review report and marks SMS substitution", () => {
    const input = { requestId: 810001, customerName: "검수용 합성 고객 A", phoneNumber: "010-0000-0001", amount: 220000, autoEstimateItems: JSON.stringify([{ name: "와이파이형 제어기", qty: 1, unitPrice: 220000, subtotal: 220000 }]) };
    expect(call({ method: "POST", procedure: "estimates.techRequest", input }).statusCode).toBe(401);
    expect(call({ method: "POST", procedure: "estimates.techRequest", input, token: REVIEW_TOKEN }).payload.result.data.json).toMatchObject({ estimateNumber: "REVIEW-0001", smsSubstituted: true });
    expect(call({ method: "GET", procedure: "estimates.reviewMyAssignedRequests", token: REVIEW_TOKEN }).payload.result.data.json).toMatchObject([{ id: 810001, technicianId: 910001 }]);
    expect(call({ method: "GET", procedure: "estimates.listMyTechRequests", token: REVIEW_TOKEN }).payload.result.data.json).toMatchObject([{ customerPhone: "010-0000-0001", techRequestStatus: "pending", smsSubstituted: true }]);
  });

  it("rejects another technician's synthetic request and never reveals the first technician's report", () => {
    const firstInput = { requestId: 810001, customerName: "검수용 합성 고객 A", phoneNumber: "010-0000-0001", amount: 220000, autoEstimateItems: JSON.stringify([{ name: "와이파이형 제어기", qty: 1, unitPrice: 220000, subtotal: 220000 }]) };
    expect(call({ method: "POST", procedure: "estimates.techRequest", input: firstInput, token: REVIEW_TOKEN }).statusCode).toBe(200);
    expect(call({ method: "POST", procedure: "estimates.techRequest", input: firstInput, token: SECOND_REVIEW_TOKEN }).statusCode).toBe(403);
    expect(call({ method: "GET", procedure: "estimates.listMyTechRequests", token: SECOND_REVIEW_TOKEN }).payload.result.data.json).toEqual([]);
  });

  it("rejects fractional-won totals and line prices before storing a synthetic report", () => {
    const fractional = { requestId: 810001, customerName: "검수용 합성 고객 A", phoneNumber: "010-0000-0001", amount: 32000.5, autoEstimateItems: JSON.stringify([{ name: "소수 단가", qty: 1, unitPrice: 32000.5, subtotal: 32000.5 }]) };
    const result = call({ method: "POST", procedure: "estimates.techRequest", input: fractional, token: REVIEW_TOKEN });
    expect(result.statusCode).toBe(400);
    expect(result.payload.error.json.message).toContain("정수 원화");
    expect(call({ method: "GET", procedure: "estimates.listMyTechRequests", token: REVIEW_TOKEN }).payload.result.data.json).toEqual([]);
  });

  it("returns complete own synthetic work data and supports consent, departure and checklist lookups", () => {
    const schedule = call({ method: "GET", procedure: "repair.listMySchedule", token: REVIEW_TOKEN });
    expect(schedule.statusCode).toBe(200);
    const ownWork = schedule.payload.result.data.json[0];
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const yesterdayKst = new Date(nowKst.getTime() - 24 * 60 * 60 * 1000);
    const expectedOverdueDate = `${yesterdayKst.getUTCFullYear()}-${String(yesterdayKst.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayKst.getUTCDate()).padStart(2, "0")}`;
    expect(ownWork).toMatchObject({
      id: 810001,
      apartmentName: "합성 검수 아파트",
      symptom: "방 일부 난방 점검",
      requestType: "난방점검",
      scheduledDate: expectedOverdueDate,
    });
    expect(call({ method: "GET", procedure: "repair.getById", input: { id: 810001 }, token: REVIEW_TOKEN }).payload.result.data.json.id).toBe(810001);
    expect(call({ method: "GET", procedure: "workReport.getByRequest", input: { requestId: 810001 }, token: REVIEW_TOKEN }).payload.result.data.json).toBeNull();
    expect(call({ method: "GET", procedure: "location.getConsent", input: { technicianId: 910001 }, token: REVIEW_TOKEN }).payload.result.data.json.hasConsented).toBe(false);
    expect(call({ method: "POST", procedure: "location.saveConsent", input: { technicianId: 910001 }, token: REVIEW_TOKEN }).payload.result.data.json).toEqual({ success: true });
    expect(call({ method: "GET", procedure: "location.getConsent", input: { technicianId: 910001 }, token: REVIEW_TOKEN }).payload.result.data.json).toMatchObject({ hasConsented: true });
    expect(call({ method: "POST", procedure: "location.startTracking", input: { requestId: 810001 }, token: REVIEW_TOKEN }).payload.result.data.json).toMatchObject({ success: true, requestId: 810001, synthetic: true });
  });

  it("rejects a different synthetic technician's checklist and consent requests with standard tRPC error metadata", () => {
    const rejected = call({ method: "GET", procedure: "repair.getById", input: { id: 810001 }, token: SECOND_REVIEW_TOKEN, batch: true });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.payload[0].error.json.data).toMatchObject({ code: "FORBIDDEN", httpStatus: 403, path: "repair.getById" });
    const anonymous = call({ method: "GET", procedure: "location.getConsent", input: { technicianId: 910001 }, batch: true });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.payload[0].error.json.data).toMatchObject({ code: "UNAUTHORIZED", httpStatus: 401, path: "location.getConsent" });
  });
});
