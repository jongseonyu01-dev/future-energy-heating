import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productionBaseUrl = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const credentialsPath = "/tmp/technician-signup-login-credentials";

describe("본사 승인 후 기사앱 production 로그인", () => {
  it("활성화된 검수 기사가 앱 source로 로그인할 수 있다", async () => {
    const phoneNumber = process.env.TECHNICIAN_SIGNUP_TEST_PHONE?.trim() ?? "";
    const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf8")) as { password?: string };

    expect(phoneNumber).toMatch(/^010\d{7,8}$/);
    expect(credentials.password).toMatch(/^V[A-Za-z0-9_-]{32,}a1!$/);

    const response = await fetch(`${productionBaseUrl}/api/trpc/auth.login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { loginId: phoneNumber, password: credentials.password, source: "app" } }),
    });
    const body = (await response.json()) as {
      result?: { data?: { json?: { success?: boolean; appRole?: string; token?: string } } };
    };
    const result = body.result?.data?.json;

    expect(response.status).toBe(200);
    expect(result?.success).toBe(true);
    expect(result?.appRole).toBe("technician");
    expect(result?.token).toMatch(/^\d+:/);
  }, 20_000);
});
