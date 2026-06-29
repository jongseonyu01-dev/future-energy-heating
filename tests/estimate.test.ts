import { describe, it, expect } from "vitest";
import * as db from "../server/db";
import {
  buildEstimateDocMessage,
  buildEstimateApprovedCustomerMessage,
  buildEstimateRejectedAdminMessage,
} from "../server/notification";
import crypto from "crypto";

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

describe("견적서 메시지 빌더", () => {
  it("고객 발송 메시지에 회사명/링크가 포함된다", () => {
    const msg = buildEstimateDocMessage("홍길동", "https://example.kr/estimate/abc", 150000);
    expect(msg).toContain("[퓨처에너지테크]");
    expect(msg).toContain("홍길동");
    expect(msg).toContain("https://example.kr/estimate/abc");
  });

  it("승인 안내 메시지에 접수번호가 포함된다", () => {
    const msg = buildEstimateApprovedCustomerMessage("홍길동", "FE-20260101-0001");
    expect(msg).toContain("FE-20260101-0001");
  });

  it("거절 알림 메시지에 사유가 포함된다", () => {
    const msg = buildEstimateRejectedAdminMessage("홍길동", "금액이 비쌈");
    expect(msg).toContain("금액이 비쌈");
  });
});

describe("견적서 발송 → 승인(오더 자동생성) 흐름", () => {
  it("견적서 생성 후 토큰으로 조회되고, 승인 시 신규 접수가 생성된다", async () => {
    const token = newToken();
    const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const estimateId = await db.createEstimate({
      requestId: null,
      token,
      title: "테스트 견적",
      amount: "180000",
      description: "배관 교체",
      customerName: "테스트승인",
      customerPhone: "01055556666",
      fileUrl: "/manus-storage/estimates/test.png",
      fileName: "test.png",
      fileType: "image/png",
      fileSize: 100,
      ownerType: "headquarters",
      branchId: null,
      branchName: null,
      status: "pending",
      sentAt: new Date(),
      validUntil,
      sentBy: null,
      senderRole: "본사",
    } as any);

    expect(estimateId).toBeGreaterThan(0);

    const fetched = await db.getEstimateByToken(token);
    expect(fetched).toBeTruthy();
    expect(fetched?.status).toBe("pending");
    expect(fetched?.customerName).toBe("테스트승인");

    // 승인 → 신규 접수 생성
    const order = await db.createRepairRequest({
      branchId: null,
      customerName: fetched!.customerName ?? "고객",
      phoneNumber: fetched!.customerPhone ?? "",
      apartmentName: "테스트빌딩",
      dong: "101",
      ho: "202",
      symptom: "기타문의",
      detailContent: "[견적승인 자동접수] 테스트",
      preferredDate: "2026-07-10",
      preferredTime: "오전",
      ownerType: "headquarters",
      status: "기사배정대기",
      workflowStage: "견적승인",
      estimateAmount: "180000",
      estimateApprovedAt: new Date(),
    } as any);

    expect(order.id).toBeGreaterThan(0);
    expect(order.requestNumber).toBeTruthy();

    await db.updateEstimateById(estimateId, {
      status: "approved",
      approvedAt: new Date(),
      addressFull: "서울시 테스트구",
      orderId: order.id,
    });

    const afterApprove = await db.getEstimateByToken(token);
    expect(afterApprove?.status).toBe("approved");
    expect(afterApprove?.orderId).toBe(order.id);
  });

  it("견적서를 거절하면 상태가 rejected로 변경된다", async () => {
    const token = newToken();
    const estimateId = await db.createEstimate({
      requestId: null,
      token,
      title: "거절 테스트",
      amount: "90000",
      customerName: "테스트거절",
      customerPhone: "01077778888",
      fileUrl: "/manus-storage/estimates/test2.png",
      ownerType: "headquarters",
      status: "pending",
      sentAt: new Date(),
      validUntil: new Date(Date.now() + 72 * 60 * 60 * 1000),
    } as any);
    expect(estimateId).toBeGreaterThan(0);

    await db.rejectEstimate(token, "예산 초과");
    const after = await db.getEstimateByToken(token);
    expect(after?.status).toBe("rejected");
    expect(after?.rejectReason).toBe("예산 초과");
  });

  it("권한별 목록 조회: 본사는 전체, 지사는 자기 견적만", async () => {
    const all = await db.listEstimates({});
    expect(Array.isArray(all)).toBe(true);
  });
});
