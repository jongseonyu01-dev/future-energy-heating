import { describe, expect, it } from "vitest";

const productionBaseUrl = "https://xn--h50b270bp0ceuddugnobx2m.kr";

describe("기사 회원가입 production SMS 검수", () => {
  it("승인된 검수 번호에 기사 가입용 인증문자를 한 번만 요청한다", async () => {
    const phoneNumber = process.env.TECHNICIAN_SIGNUP_TEST_PHONE?.trim() ?? "";

    expect(phoneNumber).toMatch(/^010\d{7,8}$/);

    const response = await fetch(`${productionBaseUrl}/api/trpc/auth.sendVerifyCode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { phoneNumber, purpose: "signup" } }),
    });
    const body = (await response.json()) as {
      result?: { data?: { json?: { success?: boolean; error?: string } } };
    };

    expect(response.status).toBe(200);
    expect(body.result?.data?.json?.success).toBe(true);
  }, 20_000);
});
