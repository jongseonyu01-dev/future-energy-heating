import { getNativeSessionHeaders } from "./native-session-request-auth";

/**
 * Exact header delegate used by the tRPC httpLink. Browser requests retain
 * cookie authentication; native paths keep their bearer unless an explicitly
 * pre-login flow is selected by `getNativeSessionHeaders`.
 */
export async function getTRPCOperationHeaders(params: {
  path: string;
  platform: string;
  readToken: () => Promise<string | null>;
  temporaryAuthToken?: unknown;
}): Promise<Record<string, string>> {
  if (params.platform === "web") return {};
  return getNativeSessionHeaders({
    path: params.path,
    readToken: params.readToken,
    temporaryAuthToken: params.temporaryAuthToken,
  });
}

/** Reads only the request-scoped value carried by tRPC operation context. */
export function temporaryAuthTokenFromOperationContext(context: Record<string, unknown>): unknown {
  return context.temporaryAuthToken;
}
