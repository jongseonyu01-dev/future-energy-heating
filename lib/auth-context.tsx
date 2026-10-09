import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { createLocationStopAuthSnapshot, stopStoredTrackingAndNotify } from "@/lib/location-tracking";
import { AuthSessionTransition } from "@/lib/auth-session-transition";
import * as Auth from "@/lib/_core/auth";
import { synchronizeAppSessionToken } from "@/lib/session-token-storage";

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
  /** Captures the synchronous auth boundary for external async recovery work. */
  captureAuthTransition: () => number;
  /** True only while the captured account transition still owns this app session. */
  isAuthTransitionCurrent: (generation: number) => boolean;
  /** rememberMe=true면 기기에 세션을 저장(자동 로그인), false면 앱 재시작 시 로그아웃 */
  login: (user: AuthUser, loginId: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  captureAuthTransition: () => 0,
  isAuthTransitionCurrent: () => false,
  login: async () => {},
  logout: async () => {},
});

const STORAGE_KEY = "fe_auth_user";
const SECURE_STORE_KEY = "fe_session_token";
// tRPC Authorization 헤더용 토큰 키 (lib/_core/auth.ts의 SESSION_TOKEN_KEY와 동일)
const APP_SESSION_TOKEN_KEY = "app_session_token";
const SESSION_VERSION_KEY = "fe_session_version";
const CURRENT_SESSION_VERSION = "v6";

/** 모든 저장소에서 인증 데이터 완전 삭제 */
async function clearAllAuthStorage() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
  try { await AsyncStorage.removeItem("fe_remember_me"); } catch {}
  try { await AsyncStorage.removeItem("authUser"); } catch {}
  try { await AsyncStorage.removeItem("manus-runtime-user-info"); } catch {}
  const legacyUrlKeys = ["serverUrl", "apiUrl", "apiBaseUrl", "baseUrl", "customServer", "endpoint"];
  for (const key of legacyUrlKeys) {
    try { await AsyncStorage.removeItem(key); } catch {}
  }
  if (Platform.OS !== "web") {
    try { await SecureStore.deleteItemAsync(SECURE_STORE_KEY); } catch {}
    try { await SecureStore.deleteItemAsync(APP_SESSION_TOKEN_KEY); } catch {}
    try { await SecureStore.deleteItemAsync("manus-session-token"); } catch {}
    try { await SecureStore.deleteItemAsync("fe_token"); } catch {}
    for (const key of legacyUrlKeys) {
      try { await SecureStore.deleteItemAsync(key); } catch {}
    }
  }
}

/** 서버에서 토큰 유효성 검증 */
async function verifyTokenWithServer(userId: number, token: string): Promise<boolean> {
  try {
    const apiBase = `${getApiBaseUrl()}/api/trpc`;
    const res = await fetch(`${apiBase}/auth.verifyToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { userId, token } }),
    });
    // A temporary server outage must not erase a valid local technician
    // session and thereby stop an active foreground location service.
    if (res.status >= 500) return true;
    if (!res.ok) return false;
    const data = await res.json();
    return data?.result?.data?.json?.success === true;
  } catch {
    // 네트워크 오류 시 오프라인으로 간주하고 기존 세션 유지 (서버 다운 시 로그아웃 방지)
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<AuthUser | null>(null);
  const transitions = useRef(new AuthSessionTransition()).current;

  const setVisibleUser = useCallback((generation: number, nextUser: AuthUser | null) => {
    if (!transitions.isCurrent(generation)) return false;
    userRef.current = nextUser;
    setUser(nextUser);
    return true;
  }, [transitions]);

  /**
   * `listMySchedule` has no technician id in its tRPC key because the server
   * derives it from the bearer. Therefore an account boundary must cancel and
   * discard all in-flight/cache data before another bearer can render it.
   */
  const clearAccountBoundQueries = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const finishLoadingIfCurrent = useCallback((generation: number) => {
    if (transitions.isCurrent(generation)) setIsLoading(false);
  }, [transitions]);

  // `transitions.begin()` runs synchronously at login/logout initiation. These
  // callbacks deliberately read the ref-backed generation rather than React
  // state, so a permission-resume promise cannot restart A in the small window
  // before Provider effects observe `user=null` or account B.
  const captureAuthTransition = useCallback(() => transitions.capture(), [transitions]);
  const isAuthTransitionCurrent = useCallback((generation: number) => transitions.isCurrent(generation), [transitions]);

  useEffect(() => {
    const generation = transitions.begin();

    async function clearAndRecordVersion() {
      return transitions.runStorage(generation, async () => {
        await clearAllAuthStorage();
        await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
      });
    }

    async function restoreSession() {
      await clearAccountBoundQueries();
      try {
        const savedVersion = await AsyncStorage.getItem(SESSION_VERSION_KEY);
        if (savedVersion !== CURRENT_SESSION_VERSION) {
          await clearAndRecordVersion();
          return;
        }

        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // A rememberMe=false session must not leave an app_session_token that
          // turns a next cold start into a silent authenticated request.
          await clearAndRecordVersion();
          return;
        }

        let saved: AuthUser;
        try {
          saved = JSON.parse(raw);
        } catch {
          await clearAndRecordVersion();
          return;
        }

        if (!saved.userId || !saved.appRole || !saved.loginId || !saved.token) {
          await clearAndRecordVersion();
          return;
        }
        if (!await verifyTokenWithServer(saved.userId, saved.token)) {
          await clearAndRecordVersion();
          return;
        }

        const storageResult = await transitions.runStorage(generation, async () => {
          if (Platform.OS === "web") return true;
          return synchronizeAppSessionToken(saved.token, Auth.setSessionToken);
        });
        if (!storageResult.applied) return;
        if (!storageResult.value) {
          await clearAndRecordVersion();
          return;
        }
        setVisibleUser(generation, saved);
      } catch {
        await clearAndRecordVersion();
      } finally {
        finishLoadingIfCurrent(generation);
      }
    }

    void restoreSession();
  }, [clearAccountBoundQueries, finishLoadingIfCurrent, setVisibleUser, transitions]);

  const login = useCallback(async (authUser: AuthUser, loginId: string, rememberMe: boolean = false) => {
    const generation = transitions.begin();
    const previousUser = userRef.current;
    setVisibleUser(generation, null);
    setIsLoading(true);
    await clearAccountBoundQueries();

    // A visible A session is stopped with A's captured credential before B's
    // credential can be persisted. A late stop request can never read B.
    if (previousUser) {
      await stopStoredTrackingAndNotify("업무취소", createLocationStopAuthSnapshot(previousUser));
    }

    const userWithLoginId = { ...authUser, loginId };
    try {
      const storageResult = await transitions.runStorage(generation, async () => {
        if (Platform.OS !== "web") {
          const synchronized = await synchronizeAppSessionToken(authUser.token, Auth.setSessionToken);
          if (!synchronized) throw new Error("SESSION_TOKEN_STORAGE_FAILED");
        }
        if (rememberMe) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userWithLoginId));
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
          await AsyncStorage.removeItem("fe_remember_me");
        }
        await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
        return true;
      });
      if (!storageResult.applied) throw new Error("AUTH_SESSION_SUPERSEDED");
      if (!setVisibleUser(generation, userWithLoginId)) throw new Error("AUTH_SESSION_SUPERSEDED");
    } catch (error) {
      // A failed persistence may have written the bearer before AsyncStorage
      // failed. Clear both stores before returning an error to the login UI.
      const cleared = await transitions.runStorage(generation, async () => {
        await clearAllAuthStorage();
        await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
      });
      if (cleared.applied) setVisibleUser(generation, null);
      throw error;
    } finally {
      finishLoadingIfCurrent(generation);
    }
  }, [clearAccountBoundQueries, finishLoadingIfCurrent, setVisibleUser, transitions]);

  const logout = useCallback(async () => {
    const generation = transitions.begin();
    const previousUser = userRef.current;
    const stopSnapshot = createLocationStopAuthSnapshot(previousUser);
    // Publishing user=null while this is false lets location owner cleanup
    // race a replacement login. Keep all auth-bound effects paused first.
    setIsLoading(true);
    setVisibleUser(generation, null);
    try {
      await clearAccountBoundQueries();
      await stopStoredTrackingAndNotify("업무취소", stopSnapshot);
      await transitions.runStorage(generation, async () => {
        await clearAllAuthStorage();
        await AsyncStorage.setItem(SESSION_VERSION_KEY, CURRENT_SESSION_VERSION);
      });
    } finally {
      finishLoadingIfCurrent(generation);
    }
  }, [clearAccountBoundQueries, finishLoadingIfCurrent, setVisibleUser, transitions]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      captureAuthTransition,
      isAuthTransitionCurrent,
      login,
      logout,
    }}>
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
