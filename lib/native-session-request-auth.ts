export const NATIVE_SESSION_REQUIRED_TRPC_PATHS = new Set([
  // The server derives the technician from the authenticated bearer. Never
  // turn a missing native token into an anonymous schedule network request.
  "repair.listMySchedule",
  "auth.updateMyProfile",
]);

export class NativeSessionAuthorizationError extends Error {
  readonly code: "AUTH_SESSION_MISSING" | "AUTH_SESSION_STORAGE_UNAVAILABLE";

  constructor(code: "AUTH_SESSION_MISSING" | "AUTH_SESSION_STORAGE_UNAVAILABLE") {
    super(
      code === "AUTH_SESSION_MISSING"
        ? "로그인 세션이 없습니다. 다시 로그인해 주세요."
        : "로그인 세션 저장소를 읽지 못했습니다. 앱을 다시 열고 로그인해 주세요.",
    );
    this.name = "NativeSessionAuthorizationError";
    this.code = code;
  }
}

export function requiresNativeSession(path: string): boolean {
  return NATIVE_SESSION_REQUIRED_TRPC_PATHS.has(path);
}

export async function getNativeSessionHeaders(params: {
  path: string;
  readToken: () => Promise<string | null>;
}): Promise<Record<string, string>> {
  if (!requiresNativeSession(params.path)) return {};

  let token: string | null;
  try {
    token = await params.readToken();
  } catch {
    throw new NativeSessionAuthorizationError("AUTH_SESSION_STORAGE_UNAVAILABLE");
  }
  if (!token) throw new NativeSessionAuthorizationError("AUTH_SESSION_MISSING");
  return { Authorization: `Bearer ${token}` };
}
