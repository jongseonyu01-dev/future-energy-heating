import { describe, expect, it } from "vitest";

import {
  submitTechnicianSignup,
  verifyTechnicianPhoneCode,
  type TechnicianSignupFetch,
} from "../lib/technician-signup-api";

describe("기사 가입 signupGrant 전달 preflight", () => {
  it("서버가 발급한 base64url grant를 임의 변환 없이 가입 요청에 전달한다", async () => {
    const serverGrant = "8-fTK72EdA3Q1COkwJ8cii6WQv_NwhTIGM8vz9D9DAU";
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher: TechnicianSignupFetch = async (url, init) => {
      const body = JSON.parse(init.body) as { json: Record<string, unknown> };
      requests.push({ url, body: body.json });
      if (url.endsWith("/auth.checkVerifyCode")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: { data: { json: { success: true, signupGrant: serverGrant } } } }),
        };
      }
      if (url.endsWith("/auth.registerTechnician")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: { data: { json: { success: true, pendingApproval: true } } } }),
        };
      }
      throw new Error("Unexpected request");
    };

    const verified = await verifyTechnicianPhoneCode("01012345678", "123456", {
      baseUrl: "https://verification.example",
      fetcher,
    });
    expect(verified.success).toBe(true);
    expect(verified.signupGrant).toBe(serverGrant);

    const submitted = await submitTechnicianSignup({
      name: "검수기사",
      phoneNumber: "01012345678",
      password: "ReviewPass2026!",
      signupGrant: verified.signupGrant!,
    }, { baseUrl: "https://verification.example", fetcher });

    expect(submitted).toMatchObject({ success: true, pendingApproval: true });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toMatchObject({ purpose: "signup" });
    expect(requests[1]?.body).toMatchObject({
      signupGrant: serverGrant,
      signupChannel: "technician_app_v1",
    });
    expect(requests[1]?.body.signupGrant).toBe(serverGrant);
  });
});
