import { describe, expect, it, beforeEach } from "vitest";
import {
  SYNTHETIC_REVIEW_PRICES,
  getSyntheticReviewActorByLoginId,
  listSyntheticTechEstimateReviews,
  resetSyntheticTechEstimateReviewsForTest,
  submitSyntheticTechEstimateReview,
} from "../server/tech-estimate-review-fixture";

describe("isolated technician-estimate review fixture", () => {
  beforeEach(() => resetSyntheticTechEstimateReviewsForTest());
  const firstActor = getSyntheticReviewActorByLoginId("review-tech")!;
  const secondActor = getSyntheticReviewActorByLoginId("review-tech-2")!;

  it("uses a fixed, non-production price snapshot for the 2–10 port and control contract", () => {
    expect(SYNTHETIC_REVIEW_PRICES).toHaveLength(21);
    expect(SYNTHETIC_REVIEW_PRICES.find((item) => item.name === "분배기 교체 (10구)")?.stdPrice).toBe(906000);
    expect(SYNTHETIC_REVIEW_PRICES.find((item) => item.name === "유량밸브 15A")?.discPrice).toBe(29000);
    expect(SYNTHETIC_REVIEW_PRICES.find((item) => item.name === "유량밸브 15A / 부분수리")?.discPrice).toBe(58000);
  });

  it("uses the logged-in synthetic technician assignment and substitutes SMS without revealing another technician report", () => {
    const line = { name: "와이파이형 제어기", qty: 1, unitPrice: 220000, subtotal: 220000 };
    const result = submitSyntheticTechEstimateReview({
      requestId: firstActor.request.id,
      customerName: firstActor.request.name,
      phoneNumber: firstActor.request.phone,
      amount: 220000,
      autoEstimateItems: JSON.stringify([line]),
    }, firstActor);
    expect(result).toMatchObject({ success: true, estimateNumber: "REVIEW-0001", smsSubstituted: true });
    expect(listSyntheticTechEstimateReviews(firstActor)).toMatchObject([{ customerPhone: firstActor.request.phone, smsSubstituted: true, techRequestStatus: "pending" }]);
    expect(listSyntheticTechEstimateReviews(secondActor)).toHaveLength(0);
  });

  it("rejects non-integer quantity before any synthetic report is retained", () => {
    expect(() => submitSyntheticTechEstimateReview({
      requestId: firstActor.request.id,
      customerName: firstActor.request.name,
      phoneNumber: firstActor.request.phone,
      amount: 330000,
      autoEstimateItems: JSON.stringify([{ name: "와이파이형 제어기", qty: 1.5, unitPrice: 220000, subtotal: 330000 }]),
    }, firstActor)).toThrow("수량·단가·금액");
    expect(listSyntheticTechEstimateReviews(firstActor)).toHaveLength(0);
  });
});
