/**
 * 위치 REST endpoint는 tracking token과 별도로 현재 로그인된 기사 Bearer token을 요구한다.
 * 이 helper는 전경 timer, background TaskManager, 세션 종료 요청이 동일한 header를 사용하게 한다.
 */
export function buildLocationRequestHeaders(technicianToken: string | null): Record<string, string> | null {
  if (!technicianToken || technicianToken.trim().length === 0) return null;

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${technicianToken}`,
  };
}

export function formatLocationRequestFailure(status: number, error: unknown): string {
  const reason = typeof error === "string" && error.trim().length > 0 ? error : "응답 본문 없음";
  return `HTTP ${status}: ${reason}`;
}
