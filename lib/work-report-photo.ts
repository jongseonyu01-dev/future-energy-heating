import { API_BASE_URL } from "../constants/api-origin";

export const MAX_WORK_REPORT_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_WORK_REPORT_PHOTO_WIDTH = 1600;
export const FALLBACK_WORK_REPORT_PHOTO_WIDTH = 1024;

export type PhotoResizeAction = { resize: { width: number } | { height: number } };

const STORAGE_PHOTO_PATH = /^\/manus-storage\/[A-Za-z0-9/_.-]+$/;
const SIGNED_PHOTO_PATH = /^\/api\/work-report-photo\/([1-9]\d*)\/(before|after)$/;
const OFFICIAL_UNICODE_ORIGIN = "https://퓨처에너지테크.kr";

function stripOfficialPhotoOrigin(value: string): string | null {
  if (value.startsWith("/")) return value;
  for (const origin of [API_BASE_URL, OFFICIAL_UNICODE_ORIGIN]) {
    if (value.startsWith(`${origin}/`)) return value.slice(origin.length);
  }
  return null;
}

function isValidSignedPhotoQuery(query: string): boolean {
  const pairs = query.split("&");
  if (pairs.length !== 5) return false;
  const params = new Map<string, string>();
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator <= 0 || pair.indexOf("=", separator + 1) !== -1) return false;
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (params.has(key)) return false;
    params.set(key, value);
  }
  if ([...params.keys()].sort().join(",") !== "exp,sig,tid,v,viewer") return false;
  const exp = params.get("exp") ?? "";
  const version = params.get("v") ?? "";
  const technicianId = params.get("tid") ?? "";
  const viewerUserId = params.get("viewer") ?? "";
  const signature = params.get("sig") ?? "";
  if (!/^\d{10}$/.test(exp)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expirySeconds = Number(exp);
  if (expirySeconds < nowSeconds - 30 || expirySeconds > nowSeconds + 16 * 60) return false;
  return /^[A-Za-z0-9_-]{43}$/.test(version)
    && /^[A-Za-z0-9_-]{43}$/.test(signature)
    && /^[1-9]\d*$/.test(technicianId)
    && /^[1-9]\d*$/.test(viewerUserId)
    && Number.isSafeInteger(Number(technicianId))
    && Number.isSafeInteger(Number(viewerUserId));
}

/** 네이티브 Image가 읽을 수 있도록 내부 상대 URL만 공식 API origin에 결합한다. */
export function workReportPhotoDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes("#")) return null;
  const pathAndQuery = stripOfficialPhotoOrigin(trimmed);
  if (!pathAndQuery) return null;
  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = queryIndex === -1 ? null : pathAndQuery.slice(queryIndex + 1);
  if (
    path.includes("..") ||
    path.includes("//") ||
    (query !== null && query.includes("?"))
  ) return null;
  if (STORAGE_PHOTO_PATH.test(path) && query === null) {
    return `${API_BASE_URL}${path}`;
  }
  if (SIGNED_PHOTO_PATH.test(path) && query !== null && isValidSignedPhotoQuery(query)) {
    return `${API_BASE_URL}${path}?${query}`;
  }
  return null;
}

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
