import * as Linking from "expo-linking";
import * as ReactNative from "react-native";
import { API_BASE_URL } from "./api-origin";

export { API_BASE_URL } from "./api-origin";

// ⚠️ API 서버 주소 — 공식 루트 도메인의 퓨니코드 주소로 고정 (정적 상수)
// www 주소는 루트 도메인으로 308 이동되며, 네이티브 fetch가 다른 origin으로
// 이동할 때 Authorization 헤더가 제거될 수 있으므로 API에는 사용하지 않는다.
// 런타임 변환(domainToASCII, punycode 등) 절대 사용 금지

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL || "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL || "",
  appId: process.env.EXPO_PUBLIC_APP_ID || "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID || "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME || "",
  deepLinkScheme: "manusfutureenergyheating",
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;

/**
 * API base URL 반환 — 항상 정적 상수 반환
 * React Native에서 런타임 URL 변환은 "undefined is not a function" 오류의 원인
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${API_BASE_URL}/api/oauth/callback`;
  } else {
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
