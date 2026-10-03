import { describe, it, expect } from "vitest";

/**
 * track 페이지가 서빙될 때 NAVER_MAP_CLIENT_ID 환경변수가
 * window.NAVER_MAP_CLIENT_ID 로 정상 주입되는지 검증한다.
 * (지도 SDK 로딩에 필요한 값)
 */
describe("NAVER_MAP_CLIENT_ID 주입", () => {
  const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

  it("환경변수가 설정되어 있어야 한다", () => {
    expect(process.env.NAVER_MAP_CLIENT_ID, "NAVER_MAP_CLIENT_ID 미설정").toBeTruthy();
  });

  it("Client ID 형식이 도메인/공백이 아닌 순수 식별자여야 한다", () => {
    const id = (process.env.NAVER_MAP_CLIENT_ID || "").trim();
    expect(id.includes("://"), "URL 형식이면 지도 로딩이 생략됨").toBe(false);
    expect(id.includes(" "), "공백 포함 불가").toBe(false);
    expect(id.includes("."), "점 포함(도메인) 불가").toBe(false);
    expect(id.length).toBeGreaterThan(3);
  });

  it("track 페이지 HTML에 window.NAVER_MAP_CLIENT_ID 가 주입되어야 한다", async () => {
    const res = await fetch(`${API_BASE}/track/__test_token__`);
    expect(res.ok).toBe(true);
    const html = await res.text();
    const expected = `window.NAVER_MAP_CLIENT_ID = ${JSON.stringify(
      process.env.NAVER_MAP_CLIENT_ID || "",
    )};`;
    expect(html).toContain(expected);
  });
});
