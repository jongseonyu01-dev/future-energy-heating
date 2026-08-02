import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import * as Auth from "@/lib/_core/auth";

// ⚠️ API 서버 주소 — www 포함 퓨니코드 주소로 고정
// www 없는 주소는 308 리다이렉트가 발생하므로 반드시 www 포함 주소 사용
const API_URL = "https://www.xn--h50b270bp0ceuddugnobx2m.kr";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * - httpLink (not httpBatchLink): React Native에서 배치 링크는 불필요하고 오류 원인이 됨
 * - superjson transformer: 서버와 동일한 직렬화 형식 사용 (Date 타입 포함 응답 파싱 필수)
 * - credentials: "include" 제거: React Native에서 지원되지 않음
 * - globalThis.fetch 사용: React Native 기본 fetch 사용
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpLink({
        url: `${API_URL}/api/trpc`,
        // tRPC v11: transformer는 httpLink 내부에 설정
        transformer: superjson,
        async headers() {
          try {
            const token = await Auth.getSessionToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          } catch {
            return {};
          }
        },
      }),
    ],
  });
}
