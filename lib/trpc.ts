import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import superjson from "superjson";
import { Platform } from "react-native";
import type { AppRouter } from "@/server/routers";
import * as Auth from "@/lib/_core/auth";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  getTRPCOperationHeaders,
  temporaryAuthTokenFromOperationContext,
} from "@/lib/trpc-operation-headers";

// 운영 build는 리다이렉트 없는 canonical 공식 API 주소를, review build는
// 명시적으로 지정된 격리 API 주소만 사용한다. 호출부는 이 상수를 직접 바꾸지 않는다.
const API_URL = getApiBaseUrl();

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
        async headers({ op }) {
          // Browser requests retain cookie authentication. Native protected
          // procedures are explicitly blocked before fetch if SecureStore is
          // unavailable or the session is absent.
          return getTRPCOperationHeaders({
            path: op.path,
            platform: Platform.OS,
            readToken: Auth.getSessionToken,
            temporaryAuthToken: temporaryAuthTokenFromOperationContext(op.context),
          });
        },
      }),
    ],
  });
}
