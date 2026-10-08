import type { LocationRuntimeDiagnostics } from "@/lib/location-runtime-diagnostics";

export type RestoredLocationRuntimeStatus = {
  serverStatus: "idle" | "uploading" | "stored" | "ignored" | "error";
  serverError: string | null;
};

/**
 * Registration is not evidence of a live callback or stored location. This
 * maps only persisted event evidence into a fresh UI runtime and deliberately
 * refuses to leave an old `uploading` attempt displayed forever.
 */
export function locationRuntimeStatusFromDiagnostics(
  diagnostics: LocationRuntimeDiagnostics,
  now = Date.now(),
  callbackBudgetMs = 10_000,
): RestoredLocationRuntimeStatus {
  const uploadStillPending = Boolean(
    diagnostics.lastUploadStartedAt
    && (!diagnostics.lastResponseAt || diagnostics.lastResponseAt < diagnostics.lastUploadStartedAt)
    && now - diagnostics.lastUploadStartedAt > callbackBudgetMs,
  );
  if (diagnostics.lastErrorCode) {
    return { serverStatus: "error", serverError: `최근 위치 전송 오류: ${diagnostics.lastErrorCode}` };
  }
  if (uploadStillPending) {
    return { serverStatus: "error", serverError: "오래된 위치 전송 시도는 완료로 표시하지 않습니다." };
  }
  if (diagnostics.lastStoredAt && now - diagnostics.lastStoredAt <= callbackBudgetMs) {
    return { serverStatus: "stored", serverError: null };
  }
  return { serverStatus: "idle", serverError: null };
}
