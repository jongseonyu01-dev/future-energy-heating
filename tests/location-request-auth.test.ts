import { describe, expect, it } from "vitest";
import { buildLocationRequestHeaders, formatLocationRequestFailure } from "../lib/location-request-auth";

describe("location REST technician authentication", () => {
  it("includes the current technician Bearer token without altering it", () => {
    const token = "17:1730000000000:signature-value";
    expect(buildLocationRequestHeaders(token)).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    });
  });

  it("does not send an unauthenticated request when the technician token is absent", () => {
    expect(buildLocationRequestHeaders(null)).toBeNull();
    expect(buildLocationRequestHeaders("   ")).toBeNull();
  });

  it("keeps the actual server status and safe response reason in the failed-send state", () => {
    expect(formatLocationRequestFailure(401, "로그인이 필요합니다.")).toBe("HTTP 401: 로그인이 필요합니다.");
    expect(formatLocationRequestFailure(500, null)).toBe("HTTP 500: 응답 본문 없음");
  });
});
