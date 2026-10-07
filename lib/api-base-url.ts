export const OFFICIAL_API_BASE_URL = "https://www.xn--h50b270bp0ceuddugnobx2m.kr";

export type ApiBaseUrlEnvironment = {
  EXPO_PUBLIC_API_BASE_URL?: string | undefined;
  EXPO_PUBLIC_TECH_REVENUE_REVIEW_MODE?: string | undefined;
  EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE?: string | undefined;
};

/**
 * Production app packages must not inherit a stale EAS preview API URL. A
 * non-official base URL is allowed only in an explicitly enabled internal
 * review build; the released Android APK always uses the official domain.
 */
export function resolveApiBaseUrl(env: ApiBaseUrlEnvironment): string {
  const internalReview = env.EXPO_PUBLIC_TECH_REVENUE_REVIEW_MODE === "1"
    || env.EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE === "1";
  const configured = env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return internalReview && configured ? configured : OFFICIAL_API_BASE_URL;
}
