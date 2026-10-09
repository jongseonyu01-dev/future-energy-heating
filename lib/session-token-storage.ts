const APP_SESSION_TOKEN_PATTERN = /^[1-9]\d*:[1-9]\d*:[a-f0-9]{64}$/i;

/**
 * 모바일 API Bearer에 사용하는 앱 HMAC 세션 토큰의 형태를 확인한다.
 * 저장소 접근은 이 함수 밖에서만 수행하며 토큰 값은 로그에 남기지 않는다.
 */
export function isValidAppSessionToken(value: unknown): value is string {
  return typeof value === "string" && APP_SESSION_TOKEN_PATTERN.test(value);
}

/**
 * React Native SecureStore와 앱의 로그인 상태를 같은 토큰으로 맞춘다.
 * SecureStore 쓰기가 실패하면 로그인/복원을 계속하지 않아 헤더 없는 API 요청을
 * 인증 완료 상태처럼 표시하지 않는다.
 */
export async function synchronizeAppSessionToken(
  token: unknown,
  persist: (token: string) => Promise<void>,
): Promise<boolean> {
  if (!isValidAppSessionToken(token)) return false;
  try {
    await persist(token);
    return true;
  } catch {
    return false;
  }
}
