export const MAX_WORK_REPORT_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_WORK_REPORT_PHOTO_WIDTH = 1600;
export const FALLBACK_WORK_REPORT_PHOTO_WIDTH = 1024;

export type PhotoResizeAction = { resize: { width: number } | { height: number } };

export function resizeActionForDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
  maxDimension: number,
): PhotoResizeAction | null {
  if (!width || !height || width <= 0 || height <= 0 || maxDimension <= 0) return null;
  if (Math.max(width, height) <= maxDimension) return null;
  return width >= height
    ? { resize: { width: maxDimension } }
    : { resize: { height: maxDimension } };
}

export function estimateBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function trpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    data?: { code?: unknown };
    shape?: { data?: { code?: unknown } };
  };
  const code = value.data?.code ?? value.shape?.data?.code;
  return typeof code === "string" ? code : null;
}

export function photoUploadAlert(error: unknown): { title: string; message: string } {
  const code = trpcErrorCode(error);
  if (code === "UNAUTHORIZED") {
    return { title: "로그인 만료", message: "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 사진을 올려주세요." };
  }
  if (code === "FORBIDDEN") {
    return { title: "업로드 권한 없음", message: "본인에게 배정된 접수의 사진만 올릴 수 있습니다." };
  }
  if (code === "PAYLOAD_TOO_LARGE" || code === "BAD_REQUEST") {
    return { title: "사진 확인 필요", message: "사진을 처리할 수 없습니다. 다른 사진을 선택하거나 다시 촬영해 주세요." };
  }
  if (code === "PRECONDITION_FAILED") {
    return { title: "저장소 준비 중", message: "사진 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (code === "CONFLICT") {
    return { title: "접수 정보 변경", message: "담당 기사 또는 접수 상태가 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요." };
  }
  return { title: "업로드 실패", message: "사진 업로드 중 오류가 발생했습니다. 네트워크를 확인하고 다시 시도해 주세요." };
}
