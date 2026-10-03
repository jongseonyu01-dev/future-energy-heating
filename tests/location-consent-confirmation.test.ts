import { describe, expect, it, vi } from "vitest";
import { saveAndConfirmLocationConsent } from "../lib/location-consent-confirmation";

async function runConsentModalCallback({
  saveConsent,
  getConsent,
  depart,
}: {
  saveConsent: () => Promise<{ success?: boolean } | null | undefined>;
  getConsent: () => Promise<{ hasConsented?: boolean } | null | undefined>;
  depart: () => Promise<void>;
}) {
  const result = await saveAndConfirmLocationConsent({ saveConsent, getConsent });
  if (result.ok) await depart();
  return result;
}

describe("기사 일정 화면 동의 저장 콜백 호환성", () => {
  it("기존 운영 서버의 { success: true } 저장 응답 뒤 인증 readback이 true이면 출발한다", async () => {
    const depart = vi.fn(async () => undefined);
    const result = await runConsentModalCallback({
      saveConsent: async () => ({ success: true }),
      getConsent: async () => ({ hasConsented: true }),
      depart,
    });

    expect(result).toEqual({ ok: true });
    expect(depart).toHaveBeenCalledTimes(1);
  });

  it("합성 review 서버의 추가 필드가 있는 저장 응답도 readback 성공 뒤 출발한다", async () => {
    const depart = vi.fn(async () => undefined);
    const result = await runConsentModalCallback({
      saveConsent: async () => ({ success: true, hasConsented: true }),
      getConsent: async () => ({ hasConsented: true }),
      depart,
    });

    expect(result).toEqual({ ok: true });
    expect(depart).toHaveBeenCalledTimes(1);
  });

  it("저장 실패 응답이면 재조회와 출발을 모두 실행하지 않는다", async () => {
    const getConsent = vi.fn(async () => ({ hasConsented: true }));
    const depart = vi.fn(async () => undefined);
    const result = await runConsentModalCallback({
      saveConsent: async () => ({ success: false }),
      getConsent,
      depart,
    });

    expect(result).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(getConsent).not.toHaveBeenCalled();
    expect(depart).not.toHaveBeenCalled();
  });

  it("인증 readback 요청이 실패하면 출발하지 않는다", async () => {
    const depart = vi.fn(async () => undefined);
    const result = await runConsentModalCallback({
      saveConsent: async () => ({ success: true }),
      getConsent: async () => { throw new Error("401"); },
      depart,
    });

    expect(result).toEqual({ ok: false, reason: "READBACK_FAILED" });
    expect(depart).not.toHaveBeenCalled();
  });

  it("인증 readback이 hasConsented:false이면 출발하지 않는다", async () => {
    const depart = vi.fn(async () => undefined);
    const result = await runConsentModalCallback({
      saveConsent: async () => ({ success: true }),
      getConsent: async () => ({ hasConsented: false }),
      depart,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_CONSENTED" });
    expect(depart).not.toHaveBeenCalled();
  });
});
