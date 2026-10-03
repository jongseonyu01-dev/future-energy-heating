import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";

const productionBaseUrl = "https://xn--h50b270bp0ceuddugnobx2m.kr";

describe("기사 회원가입 production 인증 확인", () => {
  it("승인된 검수 번호와 일회성 인증번호로 가입 전용 signupGrant를 발급한다", async () => {
    const phoneNumber = process.env.TECHNICIAN_SIGNUP_TEST_PHONE?.trim() ?? "";
    const code = process.env.TECHNICIAN_SIGNUP_TEST_CODE?.trim() ?? "";

    expect(phoneNumber).toMatch(/^010\d{7,8}$/);
    expect(code).toMatch(/^\d{4,8}$/);

    const response = await fetch(`${productionBaseUrl}/api/trpc/auth.checkVerifyCode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { phoneNumber, code, purpose: "signup" } }),
    });
    const body = (await response.json()) as {
      result?: { data?: { json?: { success?: boolean; signupGrant?: string } } };
    };

    const signupGrant = body.result?.data?.json?.signupGrant ?? "";
    expect(response.status).toBe(200);
    expect(body.result?.data?.json?.success).toBe(true);
    expect(signupGrant).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    await fs.writeFile("/tmp/technician-signup-grant", signupGrant, { mode: 0o600 });
    await fs.chmod("/tmp/technician-signup-grant", 0o600);
  }, 20_000);
});
