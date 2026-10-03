export type LocationConsentSaveResponse = {
  success?: boolean;
};

export type LocationConsentReadResponse = {
  hasConsented?: boolean;
} | null | undefined;

export type ConsentConfirmationResult =
  | { ok: true }
  | { ok: false; reason: "SAVE_FAILED" | "READBACK_FAILED" | "NOT_CONSENTED" };

/**
 * 기존 운영 `location.saveConsent`는 `{ success: true }`만 반환한다.
 * 저장 응답의 선택 필드에 의존하지 않고, 인증된 getConsent readback이
 * `hasConsented: true`일 때에만 출발을 허용한다.
 */
export async function saveAndConfirmLocationConsent({
  saveConsent,
  getConsent,
}: {
  saveConsent: () => Promise<LocationConsentSaveResponse | null | undefined>;
  getConsent: () => Promise<LocationConsentReadResponse>;
}): Promise<ConsentConfirmationResult> {
  let saved: LocationConsentSaveResponse | null | undefined;
  try {
    saved = await saveConsent();
  } catch {
    return { ok: false, reason: "SAVE_FAILED" };
  }

  if (saved?.success !== true) {
    return { ok: false, reason: "SAVE_FAILED" };
  }

  let confirmed: LocationConsentReadResponse;
  try {
    confirmed = await getConsent();
  } catch {
    return { ok: false, reason: "READBACK_FAILED" };
  }

  if (confirmed?.hasConsented !== true) {
    return { ok: false, reason: "NOT_CONSENTED" };
  }

  return { ok: true };
}
