import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productionBaseUrl = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const credentialsPath = "/tmp/technician-signup-login-credentials";

describe("검수 기사 비활성화 후 앱 로그인 차단", () => {
  it("기존 기사앱 로그인 경로가 비활성화된 검수 계정을 허용하지 않는다", async () => {
    const phoneNumber = process.env.TECHNICIAN_SIGNUP_TEST_PHONE?.trim() ?? "";
    const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf8")) as { password?: string };

    const response = await fetch(`${productionBaseUrl}/api/trpc/auth.login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { loginId: phoneNumber, password: credentials.password, source: "app" } }),
    });
    const body = (await response.json()) as {
      result?: { data?: { json?: { success?: boolean; error?: string; token?: string } } };
    };
    const result = body.result?.data?.json;

    expect(response.status).toBe(200);
    expect(result?.success).toBe(false);
    expect(result?.error).toMatch(/아이디 또는 비밀번호가 올바르지 않습니다.|비활성화된 계정/);
    expect(result?.token).toBeUndefined();
  }, 20_000);
});
