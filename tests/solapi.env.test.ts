import { describe, expect, it } from "vitest";

/**
 * SOLAPI 환경변수 설정 검증 테스트
 * - 실제 API 호출 없이 환경변수 존재 여부만 확인
 */
describe("SOLAPI 환경변수 설정", () => {
  it("SOLAPI_API_KEY 환경변수가 설정되어 있어야 한다", () => {
    const key = process.env.SOLAPI_API_KEY;
    expect(key).toBeDefined();
    expect(key?.length).toBeGreaterThan(0);
  });

  it("SOLAPI_API_SECRET 환경변수가 설정되어 있어야 한다", () => {
    const secret = process.env.SOLAPI_API_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThan(0);
  });

  it("SOLAPI_SENDER 환경변수가 설정되어 있어야 한다", () => {
    const sender = process.env.SOLAPI_SENDER;
    expect(sender).toBeDefined();
    expect(sender?.length).toBeGreaterThan(0);
  });

  it("isSmsConfigured()가 true를 반환해야 한다", async () => {
    // 동적 import로 서버 모듈 로드
    const { isSmsConfigured } = await import("../server/notification");
    expect(isSmsConfigured()).toBe(true);
  });
});
