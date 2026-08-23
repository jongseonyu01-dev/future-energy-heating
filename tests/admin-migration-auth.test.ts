import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routers = fs.readFileSync(
  path.join(process.cwd(), "server/routers.ts"),
  "utf8",
);

describe("관리자 마이그레이션 인증", () => {
  it("하드코딩 키 대신 로그인된 본사 관리자 권한을 요구한다", () => {
    const block = routers.slice(
      routers.indexOf("migrate: protectedProcedure"),
      routers.indexOf("// ===== 1단계 업무관리"),
    );
    expect(block).toContain("requireManagerCaller(ctx)");
    expect(block).toContain('manager.appRole !== "hq_admin"');
    expect(block).not.toMatch(/adminKey\s*!==\s*["'][^"']+["']/);
  });
});
