import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_BASE_URL, SESSION_TOKEN_KEY } from "@/constants/oauth";
import {
  bindPersistedTrackingOwnerIfMissing,
  enableLocationTrackingAuth,
  getPersistedTrackingSession,
  invalidateLocationTrackingAuth,
  isPersistedTrackingOwnedBy,
  stopLocationTrackingIfToken,
  suspendTrackingForAuthUnavailable,
  stopTrackingForAuthInvalidation,
} from "@/lib/location-tracking";

export type AppRole = "customer" | "technician" | "branch_manager" | "hq_admin";

export interface AuthUser {
  userId: number;
  appRole: AppRole;
  loginId: string;
  name?: string | null;
  technicianId?: number | null;
  branchId?: number | null;
  branchName?: string | null;
  phoneNumber?: string | null;
  mustChangePassword?: boolean;
  /** 자동 로그인 토큰 (서버 검증용) */
  token?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /** rememberMe=true면 기기에 세션을 저장(자동 로그인), false면 앱 재시작 시 로그아웃 */
  login: (user: AuthUser, loginId: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

const STORAGE_KEY = "fe_auth_user";
const SECURE_STORE_KEY = "fe_session_token";
// 앱 버전 키 - 버전 변경 시 기존 세션 무효화
const SESSION_VERSION_KEY = "fe_session_version";
const CURRENT_SESSION_VERSION = "v7"; // v7: 전화번호 계정 전환 및 서버 검증 기반 세션 복원
const AUTH_VERIFY_RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

type VerifiedSession = Pick<
  AuthUser,
  "userId" | "appRole" | "name" | "technicianId" | "branchId" | "branchName" | "phoneNumber" | "mustChangePassword"
>;

type TokenVerificationResult =
  | { state: "valid"; session: VerifiedSession }
  | { state: "invalid" }
  | { state: "unavailable" };

interface ClearAuthStorageOptions {
  notifyServerTracking?: boolean;
  preserveSavedSession?: boolean;
  preserveTrackingSession?: boolean;
}

function isAppRole(value: unknown): value is AppRole {
  return value === "customer" || value === "technician" || value === "branch_manager" || value === "hq_admin";
}

/** 인증/위치 로컬 상태 정리. 일시 장애에서는 자동 로그인 원본을 선택적으로 보존한다. */
async function clearAllAuthStorage(options: ClearAuthStorageOptions = {}) {
  // async 정리가 시작되기 전에 동기 gate부터 닫아 늦은 출발 mutation이나
  // 복구 응답이 위치 task/저장 token을 다시 만들지 못하게 한다.
  invalidateLocationTrackingAuth();
  const notifyServerTracking = options.notifyServerTracking !== false;
  const preserveSavedSession = options.preserveSavedSession === true;
  const preserveTrackingSession = options.preserveTrackingSession === true;
  // 명시적 로그아웃/인증 무효일 때만 서버 업무취소를 알린다.
  // 일시적 통신 장애에서는 전송 자원만 정리하고 방문 세션은 다음 재인증까지 보존한다.
  try {
    if (preserveTrackingSession) {
      await suspendTrackingForAuthUnavailable();
    } else {
      await stopTrackingForAuthInvalidation({ notifyServer: notifyServerTracking });
    }
  } catch {}
  if (!preserveSavedSession) {
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
    try { await AsyncStorage.removeItem("fe_remember_me"); } catch {}
  }
  try { await AsyncStorage.removeItem("authUser"); } catch {}
  try { await AsyncStorage.removeItem("manus-runtime-user-info"); } catch {}
  // 과거 서버주소 저장 키 마이그레이션 (futureenergytech.co.kr 등 잘못된 주소 제거)
  const legacyUrlKeys = ["serverUrl", "apiUrl", "apiBaseUrl", "baseUrl", "customServer", "endpoint"];
  for (const key of legacyUrlKeys) {
    try { await AsyncStorage.removeItem(key); } catch {}
  }
  if (Platform.OS !== "web") {
    try { await SecureStore.deleteItemAsync(SECURE_STORE_KEY); } catch {}
    try { await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY); } catch {}
    try { await SecureStore.deleteItemAsync("manus-session-token"); } catch {}
    try { await SecureStore.deleteItemAsync("fe_token"); } catch {}
    // SecureStore 과거 서버주소 키도 삭제
    for (const key of legacyUrlKeys) {
      try { await SecureStore.deleteItemAsync(key); } catch {}
    }
  }
}

export async function assertTrackingSessionOwnedForLogin(authUser: AuthUser): Promise<void> {
  // 이전 자동 로그인 정보로 legacy 세션 소유자를 먼저 고정한다. 다른 계정의 새
  // 로그인 값으로 소유자 없는 세션을 임의 귀속하지 않는다.
  let saved: AuthUser | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    saved = raw ? JSON.parse(raw) as AuthUser : null;
  } catch {}
  if (saved?.userId && saved.appRole === "technician") {
    await bindPersistedTrackingOwnerIfMissing(saved.userId, saved.technicianId);
  }
  if (saved?.userId === authUser.userId && authUser.appRole === "technician") {
    await bindPersistedTrackingOwnerIfMissing(authUser.userId, authUser.technicianId);
  }
  const persisted = await getPersistedTrackingSession();
  if (
    persisted
    && persisted.ownerUserId === null
    && persisted.ownerTechnicianId === null
    && authUser.appRole === "technician"
    && authUser.token
    && authUser.technicianId
  ) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/location/session/${encodeURIComponent(persisted.token)}`,
        { headers: { Authorization: `Bearer ${authUser.token}` } },
      );
      if (response.ok) {
        const body = await response.json().catch(() => null);
        // 구 서버의 공개 200 응답을 소유권 증명으로 오인하지 않도록 서버가 인증
        // 소유자 검증을 마쳤다는 marker가 있을 때만 1회 귀속한다.
        if (body?.authenticatedOwner === true) {
          await bindPersistedTrackingOwnerIfMissing(authUser.userId, authUser.technicianId);
        }
      } else if (response.status === 404 || response.status === 410) {
        await stopLocationTrackingIfToken(persisted.token);
      }
    } catch {
      // 소유권을 증명할 수 없는 통신 장애에서는 세션을 보존하고 로그인을 차단한다.
    }
  }
  if (!await isPersistedTrackingOwnedBy(authUser.userId, authUser.technicianId)) {
    throw new Error(
      "다른 기사 계정의 이동 중 방문이 남아 있습니다. 기존 기사 계정으로 로그인해 도착 또는 위치 공유 종료를 먼저 처리해 주세요.",
    );
  }
}

/** 서버에서 토큰과 최신 역할·기사 연결 상태를 검증한다. */
async function verifyTokenWithServer(
  userId: number,
  token: string,
): Promise<TokenVerificationResult> {
  try {
    // 정적 상수 직접 사용 (process.env가 undefined로 치환되는 경우 방지)
    const API_BASE = Platform.OS === "web"
      ? "/api/trpc"
      : `${API_BASE_URL}/api/trpc`;
    const res = await fetch(`${API_BASE}/auth.verifyToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { userId, token } }),
    });
    if (!res.ok) {
      return res.status === 401 || res.status === 403
        ? { state: "invalid" }
        : { state: "unavailable" };
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      return { state: "unavailable" };
    }
    const verified = data?.result?.data?.json;
    if (verified?.success !== true || verified.userId !== userId || !isAppRole(verified.appRole)) {
      return { state: "invalid" };
    }

    const technicianId = typeof verified.technicianId === "number" && Number.isSafeInteger(verified.technicianId)
      ? verified.technicianId
      : null;
    // 기사 세션은 서버가 현재 활성 기사 연결을 돌려준 경우에만 복원한다.
    if (verified.appRole === "technician" && (!technicianId || technicianId <= 0)) {
      return { state: "invalid" };
    }

    return {
      state: "valid",
      session: {
        userId: verified.userId,
        appRole: verified.appRole,
        name: typeof verified.name === "string" ? verified.name : null,
        technicianId,
        branchId: typeof verified.branchId === "number" && Number.isSafeInteger(verified.branchId) ? verified.branchId : null,
        branchName: typeof verified.branchName === "string" ? verified.branchName : null,
        phoneNumber: typeof verified.phoneNumber === "string" ? verified.phoneNumber : null,
        mustChangePassword: verified.mustChangePassword === true,
      },
    };
  } catch {
    // 통신 실패도 로그인은 복원하지 않는 fail-closed 상태로 분류한다.
    return { state: "unavailable" };
  }
}

function waitForAuthVerificationRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** 짧은 네트워크/5xx 장애는 같은 앱 실행 안에서 제한적으로 재검증한다. */
async function verifyTokenWithRetry(
  userId: number,
  token: string,
): Promise<TokenVerificationResult> {
  let verification = await verifyTokenWithServer(userId, token);
  for (const delayMs of AUTH_VERIFY_RETRY_DELAYS_MS) {
    if (verification.state !== "unavailable") return verification;
    await waitForAuthVerificationRetry(delayMs);
    verification = await verifyTokenWithServer(userId, token);
  }
  return verification;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      // 서버 검증이 끝나기 전에는 과거 인증 gate로 위치 추적을 복구하지 않는다.
      invalidateLocationTrackingAuth();
      try {
        // 1. 세션 버전 확인 - 버전이 다르면 기존 세션 무효화
        const savedVersion = await AsyncStorage.getItem(SESSION_VERSION_KEY);
        if (savedVersion !== CURRENT_SESSION_VERSION) {
          // 버전 불일치: 기존 세션 모두 삭제 후 새 버전 기록
          await clearAllAuthStorage();
          await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
          setIsLoading(false);
          return;
        }

        // 2. 저장된 세션 읽기
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // 자동 로그인 세션이 없으면 남은 Bearer 토큰과 위치 공유도 함께 종료한다.
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
        }

        let saved: AuthUser;
        try {
          saved = JSON.parse(raw);
        } catch {
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
        }

        // 3. 필수 필드 검증
        if (!saved.userId || !saved.appRole || !saved.loginId) {
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
        }

        // 4. 자동 로그인은 서버 토큰 검증을 통과한 경우에만 허용한다.
        if (!saved.token) {
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
        }
        if (saved.appRole === "technician") {
          await bindPersistedTrackingOwnerIfMissing(saved.userId, saved.technicianId);
        }
        const verification = await verifyTokenWithRetry(saved.userId, saved.token);
        if (verification.state === "invalid") {
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
        }
        if (verification.state === "unavailable") {
          // 로그인은 복원하지 않되 정상 이동 중인 고객 링크를 서버에서 취소하지 않는다.
          // 저장된 자동 로그인 정보는 다음 실행의 재검증을 위해 보존한다.
          await clearAllAuthStorage({
            notifyServerTracking: false,
            preserveSavedSession: true,
            preserveTrackingSession: true,
          });
          setIsLoading(false);
          return;
        }
        const verified = verification.session;
        if (verified.appRole === "technician") {
          await bindPersistedTrackingOwnerIfMissing(saved.userId, verified.technicianId);
        }

        const restoredUser: AuthUser = {
          ...saved,
          ...verified,
          loginId: saved.loginId,
          token: saved.token,
        };
        // 서버가 보정한 최신 technicianId/소속 정보를 다음 재실행에도 사용한다.
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
        // AsyncStorage 세션은 남아 있지만 SecureStore가 비어 있는 복원 상황에서도
        // tRPC Authorization 헤더가 빠지지 않도록 서버 검증을 통과한 토큰을 복구한다.
        if (Platform.OS !== "web") {
          await SecureStore.setItemAsync(SESSION_TOKEN_KEY, saved.token);
        }

        // 5. 인증 저장이 모두 끝난 뒤에만 위치 추적 gate와 React 세션을 연다.
        enableLocationTrackingAuth(saved.token, restoredUser.userId, restoredUser.technicianId);
        setUser(restoredUser);
      } catch {
        // 원인을 확정할 수 없는 로컬/통신 오류도 로그인은 fail-closed 처리하되
        // 서버의 정상 방문 세션을 업무취소로 바꾸지는 않는다.
        await clearAllAuthStorage({
          notifyServerTracking: false,
          preserveSavedSession: true,
          preserveTrackingSession: true,
        });
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const login = useCallback(async (authUser: AuthUser, loginId: string, rememberMe: boolean = false) => {
    await assertTrackingSessionOwnedForLogin(authUser);
    invalidateLocationTrackingAuth();
    if (!authUser.token) {
      throw new Error("로그인 인증 token이 없습니다.");
    }
    const userWithLoginId = { ...authUser, loginId };
    // tRPC Authorization 헤더용 token을 SecureStore에 저장 (trpc.ts의 Auth.getSessionToken()이 읽음)
    // 자동로그인 여부와 무관하게 앱 사용 중에는 항상 SecureStore에 토큰 유지
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, authUser.token);
    }
    if (rememberMe) {
      // 자동 로그인 선택 시: AsyncStorage에 세션 저장 (앱 재시작 시도 로그인 유지)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userWithLoginId));
      await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
    } else {
      // 자동 로그인 미선택 시: AsyncStorage 세션만 삭제 (앱 재시작 시 로그인 필요)
      // 주의: SecureStore의 SESSION_TOKEN_KEY는 삭제하지 않음 → 앱 사용 중 tRPC 인증 토큰 유지
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
      try { await AsyncStorage.removeItem("fe_remember_me"); } catch {}
      await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
    }
    enableLocationTrackingAuth(authUser.token, authUser.userId, authUser.technicianId);
    setUser(userWithLoginId);
  }, []);

  const logout = useCallback(async () => {
    // 저장소 정리 함수가 현재 인증 토큰을 지우기 전에 위치 세션 종료를 먼저 알린다.
    await clearAllAuthStorage();
    setUser(null);
    // 세션 버전은 유지 (재설치 감지용)
    await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "customer": return "고객";
    case "technician": return "현장 기사";
    case "branch_manager": return "지사장";
    case "hq_admin": return "본사 관리자";
  }
}
