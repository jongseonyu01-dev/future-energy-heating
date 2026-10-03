// 운영 APK와 동일한 정적 기본 주소. review build만 EXPO_PUBLIC_API_BASE_URL로 재정의한다.
const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://www.xn--h50b270bp0ceuddugnobx2m.kr";

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } };
  error?: { json?: { message?: string } };
};

export type TechnicianSignupFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export class TechnicianSignupApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TechnicianSignupApiError";
    this.status = status;
  }
}

type ApiOptions = {
  baseUrl?: string;
  fetcher?: TechnicianSignupFetch;
};

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const envelope = data as TrpcEnvelope;
  const message = envelope.error?.json?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

async function callPublicMutation<T>(
  procedure: string,
  payload: Record<string, unknown>,
  options: ApiOptions = {},
): Promise<T> {
  const baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const fetcher = options.fetcher ?? (fetch as unknown as TechnicianSignupFetch);
  let response: Awaited<ReturnType<TechnicianSignupFetch>>;

  try {
    response = await fetcher(`${baseUrl}/api/trpc/${procedure}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: payload }),
    });
  } catch {
    throw new TechnicianSignupApiError("서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.", 0);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new TechnicianSignupApiError("서버 응답을 확인할 수 없습니다.", response.status);
  }

  const serverMessage = getErrorMessage(data);
  if (!response.ok || serverMessage) {
    throw new TechnicianSignupApiError(serverMessage ?? "가입 요청을 처리할 수 없습니다.", response.status);
  }

  const envelope = data as TrpcEnvelope;
  const result = envelope.result?.data?.json;
  if (!result || typeof result !== "object") {
    throw new TechnicianSignupApiError("가입 요청 응답이 올바르지 않습니다.", response.status);
  }
  return result as T;
}

export async function sendTechnicianVerification(
  phoneNumber: string,
  options?: ApiOptions,
): Promise<{ success: boolean; error?: string }> {
  return callPublicMutation("auth.sendVerifyCode", {
    phoneNumber,
    purpose: "signup",
  }, options);
}

export async function verifyTechnicianPhoneCode(
  phoneNumber: string,
  code: string,
  options?: ApiOptions,
): Promise<{ success: boolean; error?: string; signupGrant?: string }> {
  return callPublicMutation("auth.checkVerifyCode", {
    phoneNumber,
    code,
    purpose: "signup",
  }, options);
}

export async function submitTechnicianSignup(
  input: {
    name: string;
    phoneNumber: string;
    password: string;
    signupGrant: string;
  },
  options?: ApiOptions,
): Promise<{ success: boolean; error?: string; pendingApproval?: boolean; loginId?: string }> {
  return callPublicMutation("auth.registerTechnician", {
    ...input,
    signupChannel: "technician_app_v1",
  }, options);
}
