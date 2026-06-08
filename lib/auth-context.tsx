import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {}
      }
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (authUser: AuthUser, loginId: string, rememberMe: boolean = true) => {
    const userWithLoginId = { ...authUser, loginId };
    setUser(userWithLoginId);
    // 자동 로그인 체크 시에만 기기에 세션 저장. 해제 시 저장된 세션 제거.
    if (rememberMe) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userWithLoginId));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
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
