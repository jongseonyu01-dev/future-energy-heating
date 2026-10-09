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
  const code = typeof error === "string" ? error.trim() : "";
  if (status === 400) return "위치 측정값 또는 위치공유 세션을 다시 확인해 주세요.";
  if (status === 401) return "기사 로그인 인증이 만료되었거나 유효하지 않습니다.";
  if (status === 403) return "이 위치공유 세션의 기사 배정 또는 권한이 변경되었습니다.";
  if (status === 404) return "위치공유 세션을 찾을 수 없습니다.";
  if (status === 409) return "위치공유 상태가 변경되었습니다. 목록을 새로고침해 주세요.";
  if (status >= 500) return "서버가 일시적으로 위치 저장을 처리하지 못했습니다.";
  return code ? `위치 전송이 거절되었습니다. (HTTP ${status})` : `위치 전송 응답을 확인하지 못했습니다. (HTTP ${status})`;
}
