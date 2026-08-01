import * as Linking from "expo-linking";
import * as ReactNative from "react-native";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "com.app.futureenergyheating";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

// ⚠️ API 서버 주소 — 런타임 변환 없이 정적 상수로 고정
// React Native 번들러는 process.env.EXPO_PUBLIC_* 를 빌드 시 인라인 치환하므로
// 환경변수가 없으면 undefined가 되어 .replace() 호출 시 오류 발생.
// 따라서 반드시 정적 문자열 폴백을 코드에 직접 명시한다.
const STATIC_API_BASE_URL = "https://xn--h50b270bp0ceuddugnobx2m.kr";

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL || "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL || "",
  appId: process.env.EXPO_PUBLIC_APP_ID || "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID || "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME || "",
  // process.env 가 undefined 로 치환될 경우를 대비해 || 로 정적 상수 폴백
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL || STATIC_API_BASE_URL),
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // 정적 상수를 직접 반환 (런타임 변환 없음)
  // API_BASE_URL이 undefined이되는 경우를 대비해 STATIC_API_BASE_URL 사용
  const base = (API_BASE_URL && typeof API_BASE_URL === "string" && API_BASE_URL.length > 0)
    ? API_BASE_URL
    : STATIC_API_BASE_URL;
  if (base) {
    return base.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
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

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
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

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), open the system browser directly so
 * the OAuth callback returns via deep link to the app.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    // 可考虑抛出错误或返回错误状态，让调用方处理
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
    // 可考虑抛出错误让调用方处理
  }

  // The OAuth callback will reopen the app via deep link.
  return null;
}
