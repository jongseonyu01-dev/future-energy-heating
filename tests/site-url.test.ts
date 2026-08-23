import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * 고객 track 링크는 preview 환경변수와 무관하게 공식 한글 도메인으로 생성한다.
 */
describe("SITE_URL 트래킹 링크 도메인", () => {
  const root = process.cwd();
  const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
  const webRoutesSource = fs.readFileSync(path.join(root, "server/web-routes.ts"), "utf8");
  const officialOrigin = "https://퓨처에너지테크.kr";

  it("tRPC와 REST가 동일한 공식 origin 및 인코딩 helper를 사용한다", () => {
    for (const source of [routerSource, webRoutesSource]) {
      expect(source).toContain(`const OFFICIAL_TRACKING_ORIGIN = "${officialOrigin}"`);
      expect(source).toContain("/track/${encodeURIComponent(token)}");
    }
  });

  it("위치 라우트는 SITE_URL 또는 preview 도메인으로 고객 링크를 만들지 않는다", () => {
    const locationRouter = routerSource.slice(
      routerSource.indexOf("location: router"),
      routerSource.indexOf("branchApplication: router"),
    );
    const locationRest = webRoutesSource.slice(
      webRoutesSource.indexOf('app.get("/api/location/session/:token"'),
      webRoutesSource.indexOf('// 루트 /'),
    );
    for (const source of [locationRouter, locationRest]) {
      expect(source).not.toContain("process.env.SITE_URL");
      expect(source).not.toContain("manus.space");
      expect(source).not.toContain("/track/${token}");
    }
  });
});
