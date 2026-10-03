import crypto from "node:crypto";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { submitTechnicianSignup } from "../lib/technician-signup-api";

const productionBaseUrl = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const grantPath = "/tmp/technician-signup-grant";
const credentialsPath = "/tmp/technician-signup-login-credentials";

describe("기사 회원가입 production 신청", () => {
  it("제한 임시 grant를 그대로 사용해 승인 대기 기사 계정 1건을 생성한다", async () => {
    const phoneNumber = process.env.TECHNICIAN_SIGNUP_TEST_PHONE?.trim() ?? "";
    const signupGrant = (await fs.readFile(grantPath, "utf8")).trim();
    const password = `V${crypto.randomBytes(24).toString("base64url")}a1!`;

    expect(phoneNumber).toMatch(/^010\d{7,8}$/);
    expect(signupGrant).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const result = await submitTechnicianSignup({
      name: "검수기사",
      phoneNumber,
      password,
      signupGrant,
    }, { baseUrl: productionBaseUrl });

    expect(result).toMatchObject({ success: true, pendingApproval: true, loginId: phoneNumber });
    await fs.writeFile(credentialsPath, JSON.stringify({ password }), { mode: 0o600 });
    await fs.chmod(credentialsPath, 0o600);
  }, 20_000);
});
