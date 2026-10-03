import { describe, expect, it } from "vitest";

import {
  TechnicianSignupApiError,
  sendTechnicianVerification,
  submitTechnicianSignup,
  verifyTechnicianPhoneCode,
} from "../lib/technician-signup-api";
import type { TechnicianSignupFetch } from "../lib/technician-signup-api";

const baseUrl = "https://example.test";

function successResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: { data: { json: payload } } }),
  };
}

describe("기사 회원가입 운영 API contract", () => {
  it("인증번호 요청은 기존 signup tRPC procedure와 phone만 전송한다", async () => {
    const calls: Array<{ url: string; init: Parameters<TechnicianSignupFetch>[1] }> = [];
    const fetcher: TechnicianSignupFetch = async (url, init) => {
      calls.push({ url, init });
      return successResponse({ success: true, smsSent: true });
    };
    await expect(sendTechnicianVerification("01012345678", { baseUrl, fetcher })).resolves.toMatchObject({ success: true });

    expect(calls).toEqual([{ url: `${baseUrl}/api/trpc/auth.sendVerifyCode`, init: expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ json: { phoneNumber: "01012345678", purpose: "signup" } }),
    }) }]);
  });

  it("인증 확인은 signup grant를 받고 화면 메모리에만 넘길 수 있다", async () => {
    const grant = "g".repeat(43);
    const calls: Array<{ url: string; init: Parameters<TechnicianSignupFetch>[1] }> = [];
    const fetcher: TechnicianSignupFetch = async (url, init) => {
      calls.push({ url, init });
      return successResponse({ success: true, signupGrant: grant });
    };
    await expect(verifyTechnicianPhoneCode("01012345678", "123456", { baseUrl, fetcher }))
      .resolves.toEqual({ success: true, signupGrant: grant });

    expect(JSON.parse(calls[0]!.init.body)).toEqual({
      json: { phoneNumber: "01012345678", code: "123456", purpose: "signup" },
    });
  });

  it("가입 신청은 기존 본사 승인 대기 contract와 고정 채널을 사용하고 자동 승인 정보를 보내지 않는다", async () => {
    const grant = "g".repeat(43);
    const calls: Array<{ url: string; init: Parameters<TechnicianSignupFetch>[1] }> = [];
    const fetcher: TechnicianSignupFetch = async (url, init) => {
      calls.push({ url, init });
      return successResponse({ success: true, pendingApproval: true, loginId: "01012345678" });
    };
    await expect(submitTechnicianSignup({
      name: "홍길동",
      phoneNumber: "01012345678",
      password: "safe-pass",
      signupGrant: grant,
    }, { baseUrl, fetcher })).resolves.toMatchObject({ success: true, pendingApproval: true });

    const request = JSON.parse(calls[0]!.init.body);
    expect(request.json).toMatchObject({
      name: "홍길동",
      phoneNumber: "01012345678",
      password: "safe-pass",
      signupGrant: grant,
      signupChannel: "technician_app_v1",
    });
    expect(request.json).not.toHaveProperty("isActive");
    expect(request.json).not.toHaveProperty("loginId");
  });

  it("tRPC 오류는 사용자에게 표시 가능한 메시지로만 전달한다", async () => {
    const fetcher: TechnicianSignupFetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { json: { message: "인증번호 요청이 너무 많습니다." } } }),
    });
    await expect(sendTechnicianVerification("01012345678", { baseUrl, fetcher }))
      .rejects.toEqual(expect.objectContaining<TechnicianSignupApiError>({
        name: "TechnicianSignupApiError",
        status: 429,
        message: "인증번호 요청이 너무 많습니다.",
      }));
  });
});
