import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  getKstDayKey,
  parsePaymentAmount,
  restorePaymentDraft,
  summarizeTechnicianCollections,
} from "../lib/revenue-summary";

describe("기사 매출·결제수단 복구", () => {
  it("한국시간 월말·월초를 정확히 분리하고 카드·현금·계좌이체를 각각 합산한다", () => {
    const summary = summarizeTechnicianCollections([
      { reportId: 1, completedAt: "2026-09-30T14:59:59.000Z", paymentMethod: "카드", paymentAmount: "100000" },
      { reportId: 2, completedAt: "2026-09-30T14:00:00.000Z", paymentMethod: "현금", paymentAmount: "200000" },
      { reportId: 3, completedAt: "2026-09-29T14:00:00.000Z", paymentMethod: "계좌이체", paymentAmount: "300000" },
      { reportId: 4, completedAt: "2026-09-30T15:00:00.000Z", paymentMethod: "계좌이체", paymentAmount: "400000" },
    ], new Date("2026-09-30T14:59:59.000Z"));

    expect(getKstDayKey("2026-09-30T14:59:59.000Z")).toBe("2026-09-30");
    expect(getKstDayKey("2026-09-30T15:00:00.000Z")).toBe("2026-10-01");
    expect(summary.monthAmount).toBe(600000);
    expect(summary.monthCount).toBe(3);
    expect(summary.todayAmount).toBe(300000);
    expect(summary.byMethod).toEqual({ 카드: 100000, 현금: 200000, 계좌이체: 300000 });
  });

  it("재시도·새로고침으로 같은 작업보고가 중복돼도 한 번만 합산한다", () => {
    const summary = summarizeTechnicianCollections([
      { reportId: 17, completedAt: "2026-09-15T01:00:00.000Z", paymentMethod: "계좌이체", paymentAmount: 135000 },
      { reportId: 17, completedAt: "2026-09-15T01:00:00.000Z", paymentMethod: "계좌이체", paymentAmount: 135000 },
    ], new Date("2026-09-15T02:00:00.000Z"));

    expect(summary.monthAmount).toBe(135000);
    expect(summary.monthCount).toBe(1);
    expect(summary.todayCount).toBe(1);
  });

  it("실제 수금액은 빈값을 null로 보존하고 잘못된 수치는 저장하지 않는다", () => {
    expect(parsePaymentAmount(" ")).toEqual({ ok: true, value: null });
    expect(parsePaymentAmount("135000")).toEqual({ ok: true, value: 135000 });
    expect(parsePaymentAmount("-1")).toEqual({ ok: false, value: null });
    expect(parsePaymentAmount("not-money")).toEqual({ ok: false, value: null });
  });

  it("저장된 완료보고의 결제수단·실제 수금액은 앱 재진입 시 원문 그대로 복원한다", () => {
    expect(restorePaymentDraft({ paymentMethod: "계좌이체", paymentAmount: "135000" })).toEqual({
      paymentMethod: "계좌이체",
      paymentAmount: "135000",
    });
    expect(restorePaymentDraft({ paymentMethod: null, paymentAmount: null })).toEqual({
      paymentMethod: "",
      paymentAmount: "",
    });
  });

  it("화면이 기존 결제 재조회·저장 payload·기사 본인 월별 API를 모두 사용한다", () => {
    const root = path.resolve(__dirname, "..");
    const report = readFileSync(path.join(root, "app/work-report.tsx"), "utf8");
    const works = readFileSync(path.join(root, "app/(tabs)/tech-works.tsx"), "utf8");

    expect(report).toContain("const PAYMENT_METHODS");
    expect(report).toContain("restorePaymentDraft(existingReport as any)");
    expect(report).toContain("paymentMethod: paymentMethod || null");
    expect(report).toContain("paymentAmount: amount");
    expect(works).toContain("monthlySummary.useQuery");
    expect(works).toContain("summarizeTechnicianCollections");
    expect(works).toContain("오늘 매출");
  });
});
