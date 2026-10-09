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

  it("maps server failures to safe, actionable categories without echoing response bodies", () => {
    expect(formatLocationRequestFailure(401, "sensitive server detail")).toBe("기사 로그인 인증이 만료되었거나 유효하지 않습니다.");
    expect(formatLocationRequestFailure(403, "sensitive server detail")).toBe("이 위치공유 세션의 기사 배정 또는 권한이 변경되었습니다.");
    expect(formatLocationRequestFailure(500, null)).toBe("서버가 일시적으로 위치 저장을 처리하지 못했습니다.");
  });
});
