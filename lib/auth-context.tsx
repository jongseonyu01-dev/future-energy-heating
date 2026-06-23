import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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
const CURRENT_SESSION_VERSION = "v3"; // 이 값을 올리면 기존 저장된 세션이 모두 무효화됨

/** 모든 저장소에서 인증 데이터 완전 삭제 */
async function clearAllAuthStorage() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
  try { await AsyncStorage.removeItem("fe_remember_me"); } catch {}
  try { await AsyncStorage.removeItem("authUser"); } catch {}
  try { await AsyncStorage.removeItem("manus-runtime-user-info"); } catch {}
  if (Platform.OS !== "web") {
    try { await SecureStore.deleteItemAsync(SECURE_STORE_KEY); } catch {}
    try { await SecureStore.deleteItemAsync("manus-session-token"); } catch {}
    try { await SecureStore.deleteItemAsync("fe_token"); } catch {}
  }
}

/** 서버에서 토큰 유효성 검증 */
async function verifyTokenWithServer(userId: number, token: string): Promise<boolean> {
  try {
    const API_BASE = Platform.OS === "web"
      ? "/api/trpc"
      : `${process.env.EXPO_PUBLIC_API_URL || "https://3000-itmjqbme4lok360i7271o-c465a226.sg1.manus.computer"}/api/trpc`;
    const res = await fetch(`${API_BASE}/auth.verifyToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { userId, token } }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.result?.data?.json?.success === true;
  } catch {
    // 네트워크 오류 시 오프라인으로 간주하고 기존 세션 유지 (서버 다운 시 로그아웃 방지)
    return true;
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

        // 4. 서버 토큰 검증 (token이 있는 경우)
        if (saved.token) {
          const valid = await verifyTokenWithServer(saved.userId, saved.token);
          if (!valid) {
            // 서버에서 유효하지 않다고 판단 → 강제 로그아웃
            await clearAllAuthStorage();
            setIsLoading(false);
            return;
          }
        }

        // 5. 세션 복원 성공
        setUser(saved);
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
    if (rememberMe) {
      // 자동 로그인 선택 시에만 저장
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userWithLoginId));
      await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
    } else {
      // 자동 로그인 미선택 시 저장된 세션 삭제 (앱 재시작 시 로그인 필요)
      await clearAllAuthStorage();
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
