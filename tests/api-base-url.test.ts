import { describe, expect, it } from "vitest";
import { OFFICIAL_API_BASE_URL, resolveApiBaseUrl } from "../lib/api-base-url";

describe("API base URL release boundary", () => {
  it("uses the official domain when no build override exists", () => {
    expect(resolveApiBaseUrl({})).toBe(OFFICIAL_API_BASE_URL);
  });

  it("does not let a stale production environment preview URL override the official domain", () => {
    expect(resolveApiBaseUrl({
      EXPO_PUBLIC_API_BASE_URL: "https://futureenergytech-eu3egs12k-futureenergytech.vercel.app",
    })).toBe(OFFICIAL_API_BASE_URL);
  });

  it("allows an explicitly marked internal review profile to use its isolated API", () => {
    expect(resolveApiBaseUrl({
      EXPO_PUBLIC_API_BASE_URL: "https://review.example.invalid",
      EXPO_PUBLIC_TECH_REVENUE_REVIEW_MODE: "1",
    })).toBe("https://review.example.invalid");
    expect(resolveApiBaseUrl({
      EXPO_PUBLIC_API_BASE_URL: "https://review.example.invalid",
      EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE: "1",
    })).toBe("https://review.example.invalid");
  });
});
