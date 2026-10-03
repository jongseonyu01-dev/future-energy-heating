import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync(resolve(process.cwd(), "app/login.tsx"), "utf8");

describe("기사 회원가입 화면 contract", () => {
  it("초기 로그인에 기사 회원가입 진입을 표시하고 가입 신청 화면을 제공한다", () => {
    expect(loginSource).toContain("기사 회원가입");
    expect(loginSource).toContain('go("techSignup")');
    expect(loginSource).toContain('view === "techSignup"');
    expect(loginSource).toContain("가입 신청하기");
  });

  it("휴대폰 인증 grant 없이 신청하지 않고, 본사 승인 대기 안내를 표시한다", () => {
    expect(loginSource).toContain("!techSignupGrant");
    expect(loginSource).toContain("본사 승인 전에는 로그인할 수 없습니다.");
    expect(loginSource).toContain("본사 승인 후 휴대전화 번호와 비밀번호로 로그인할 수 있습니다.");
    expect(loginSource).toContain("submitTechnicianSignup");
  });
});
