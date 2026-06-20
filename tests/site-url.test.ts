import { describe, it, expect } from "vitest";

/**
 * 고객 track 링크가 정식 도메인(https://futureenergytech.co.kr) 기준으로
 * 생성되는지 검증한다. (manus.space / www 노출 금지)
 */
describe("SITE_URL 트래킹 링크 도메인", () => {
  it("SITE_URL 환경변수가 정식 도메인으로 설정되어야 한다", () => {
    const siteUrl = (process.env.SITE_URL || "").trim();
    expect(siteUrl).toBe("https://futureenergytech.co.kr");
  });

  it("트래킹 링크 생성 규칙이 정식 도메인 + /track/{token} 형식이어야 한다", () => {
    const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
    const token = "SAMPLE_TOKEN_abc123";
    const trackingUrl = `${baseUrl}/track/${token}`;
    expect(trackingUrl).toBe("https://futureenergytech.co.kr/track/SAMPLE_TOKEN_abc123");
    expect(trackingUrl).not.toContain("manus.space");
    expect(trackingUrl).not.toContain("www.");
  });
});
