import type { AuthUser } from "@/lib/auth-context";

/**
 * 기사별 견적 조회·초안 상태의 분리 key다. 인증 토큰 원문은 cache key에 넣지 않는다.
 * userId와 technicianId가 달라지면 A 기사의 query cache와 비동기 응답을 B 기사에 재사용하지 않는다.
 */
export function createTechEstimateActorScope(user: AuthUser | null | undefined): string | null {
  if (!user || user.appRole !== "technician" || !user.technicianId) return null;
  return `tech:${user.userId}:${user.technicianId}`;
}

/** 진행 중이던 A 기사 요청의 결과가 B 기사 화면을 변경하지 않도록 한다. */
export function isCurrentTechEstimateActorScope(startedScope: string | null, currentScope: string | null): boolean {
  return startedScope != null && startedScope === currentScope;
}

/**
 * 한 기사가 서로 다른 접수를 연속해서 여는 경우까지 포함한 화면 작업 범위다.
 * 늦게 끝난 저장·삭제·보고 완료가 현재 접수의 화면 상태를 덮어쓰지 않게 한다.
 */
export function createTechEstimateRequestScope(actorScope: string | null, requestId: string | null): string | null {
  const normalizedRequestId = String(requestId ?? "").trim();
  if (!actorScope || !normalizedRequestId) return null;
  return `${actorScope}:request:${normalizedRequestId}`;
}

export function isCurrentTechEstimateRequestScope(startedScope: string | null, currentScope: string | null): boolean {
  return startedScope != null && startedScope === currentScope;
}

/**
 * 동일 기사·동일 접수로 다시 돌아온 경우에도 예전 비동기 작업을 현재 작성 세션으로
 * 오인하지 않기 위한 단조 증가 작업 세대다.
 */
export function isCurrentTechEstimateWorkGeneration(
  startedScope: string | null,
  currentScope: string | null,
  startedGeneration: number,
  currentGeneration: number,
): boolean {
  return isCurrentTechEstimateRequestScope(startedScope, currentScope)
    && startedGeneration === currentGeneration;
}
