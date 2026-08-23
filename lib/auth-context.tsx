import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_BASE_URL, SESSION_TOKEN_KEY } from "@/constants/oauth";

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

type VerifiedSession = Pick<
  AuthUser,
  "userId" | "appRole" | "name" | "technicianId" | "branchId" | "branchName" | "phoneNumber" | "mustChangePassword"
>;

function isAppRole(value: unknown): value is AppRole {
  return value === "customer" || value === "technician" || value === "branch_manager" || value === "hq_admin";
}

/** 모든 저장소에서 인증 데이터 완전 삭제 */
async function clearAllAuthStorage() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
  try { await AsyncStorage.removeItem("fe_remember_me"); } catch {}
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

/** 서버에서 토큰과 최신 역할·기사 연결 상태를 검증한다. */
async function verifyTokenWithServer(userId: number, token: string): Promise<VerifiedSession | null> {
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
    if (!res.ok) return null;
    const data = await res.json();
    const verified = data?.result?.data?.json;
    if (verified?.success !== true || verified.userId !== userId || !isAppRole(verified.appRole)) return null;

    const technicianId = typeof verified.technicianId === "number" && Number.isSafeInteger(verified.technicianId)
      ? verified.technicianId
      : null;
    // 기사 세션은 서버가 현재 활성 기사 연결을 돌려준 경우에만 복원한다.
    if (verified.appRole === "technician" && (!technicianId || technicianId <= 0)) return null;

    return {
      userId: verified.userId,
      appRole: verified.appRole,
      name: typeof verified.name === "string" ? verified.name : null,
      technicianId,
      branchId: typeof verified.branchId === "number" && Number.isSafeInteger(verified.branchId) ? verified.branchId : null,
      branchName: typeof verified.branchName === "string" ? verified.branchName : null,
      phoneNumber: typeof verified.phoneNumber === "string" ? verified.phoneNumber : null,
      mustChangePassword: verified.mustChangePassword === true,
    };
  } catch {
    // 삭제·정지 계정이 오프라인 상태에서 복원되지 않도록 통신 실패도 fail-closed 처리한다.
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
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
          // 자동 로그인 세션이 없는데 과거 Bearer 토큰만 남아 guest 요청에 붙지 않도록 제거한다.
          if (Platform.OS !== "web") {
            try { await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY); } catch {}
            try { await SecureStore.deleteItemAsync(SECURE_STORE_KEY); } catch {}
          }
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
        const verified = await verifyTokenWithServer(saved.userId, saved.token);
        if (!verified) {
          await clearAllAuthStorage();
          setIsLoading(false);
          return;
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

        // 5. 서버 최신 정보로 세션 복원 성공
        setUser(restoredUser);
      } catch {
        await clearAllAuthStorage();
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const login = useCallback(async (authUser: AuthUser, loginId: string, rememberMe: boolean = false) => {
    const userWithLoginId = { ...authUser, loginId };
    setUser(userWithLoginId);
    // tRPC Authorization 헤더용 token을 SecureStore에 저장 (trpc.ts의 Auth.getSessionToken()이 읽음)
    // 자동로그인 여부와 무관하게 앱 사용 중에는 항상 SecureStore에 토큰 유지
    if (authUser.token && Platform.OS !== "web") {
      try { await SecureStore.setItemAsync(SESSION_TOKEN_KEY, authUser.token); } catch {}
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
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await clearAllAuthStorage();
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
