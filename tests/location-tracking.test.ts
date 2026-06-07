import { describe, it, expect } from "vitest";

/**
 * 위치 공유 세션 노출 정책 단위 테스트
 * - 고객에게는 "이동중" 상태에서만 위치(현재 좌표/예상 도착)를 노출
 * - 도착완료/업무취소/만료 상태는 좌표를 비노출하고 종료 안내만 반환
 * - 과거 이동 경로(트레일)는 어떤 경우에도 노출하지 않음
 *
 * web-routes.ts 의 세션 조회 응답 정책을 순수 함수로 추출하여 검증한다.
 */

type SessionStatus = "이동중" | "도착완료" | "업무취소" | "만료";

interface RawSession {
  status: SessionStatus;
  technicianName: string | null;
  technicianPhone: string | null;
  customerAddress: string | null;
  customerLat: string | null;
  customerLng: string | null;
  currentLat: string | null;
  currentLng: string | null;
  currentUpdatedAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  expiresAt: string | null;
  // 내부 전용 - 절대 응답에 포함되면 안 됨
  trail?: Array<{ lat: string; lng: string; at: string }>;
}

interface CustomerResponse {
  httpStatus: number;
  body: Record<string, unknown>;
}

/** web-routes.ts 의 GET /api/location/session/:token 응답 정책 */
export function buildCustomerSessionResponse(
  session: RawSession | null,
  now: Date,
): CustomerResponse {
  if (!session) {
    return { httpStatus: 404, body: { error: "세션을 찾을 수 없거나 만료되었습니다." } };
  }
  const isActive = session.status === "이동중";
  const isExpiredByTime = session.expiresAt != null && new Date(session.expiresAt) < now;
  if (!isActive || isExpiredByTime) {
    return {
      httpStatus: 410,
      body: {
        status: isExpiredByTime && isActive ? "만료" : session.status,
        ended: true,
        technicianName: session.technicianName,
        arrivedAt: session.arrivedAt,
        error: "종료된 위치 공유입니다.",
      },
    };
  }
  return {
    httpStatus: 200,
    body: {
      status: session.status,
      technicianName: session.technicianName,
      technicianPhone: session.technicianPhone,
      customerAddress: session.customerAddress,
      customerLat: session.customerLat,
      customerLng: session.customerLng,
      currentLat: session.currentLat,
      currentLng: session.currentLng,
      currentUpdatedAt: session.currentUpdatedAt,
      departedAt: session.departedAt,
      arrivedAt: session.arrivedAt,
      expiresAt: session.expiresAt,
    },
  };
}

const NOW = new Date("2026-06-07T18:00:00.000Z");

function baseSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    status: "이동중",
    technicianName: "김기사",
    technicianPhone: "01099998888",
    customerAddress: "안산시 단원구 테스트로 123",
    customerLat: "37.32",
    customerLng: "126.83",
    currentLat: "37.30",
    currentLng: "126.80",
    currentUpdatedAt: "2026-06-07T17:59:00.000Z",
    departedAt: "2026-06-07T17:40:00.000Z",
    arrivedAt: null,
    expiresAt: "2026-06-07T21:40:00.000Z",
    trail: [
      { lat: "37.28", lng: "126.78", at: "2026-06-07T17:41:00.000Z" },
      { lat: "37.29", lng: "126.79", at: "2026-06-07T17:50:00.000Z" },
    ],
    ...overrides,
  };
}

describe("고객용 위치 세션 노출 정책", () => {
  it("이동중 세션은 현재 위치와 예상 도착 정보를 200으로 노출한다", () => {
    const res = buildCustomerSessionResponse(baseSession(), NOW);
    expect(res.httpStatus).toBe(200);
    expect(res.body.status).toBe("이동중");
    expect(res.body.currentLat).toBe("37.30");
    expect(res.body.currentLng).toBe("126.80");
    expect(res.body.customerLat).toBe("37.32");
  });

  it("과거 이동 경로(trail)는 응답에 절대 포함되지 않는다", () => {
    const res = buildCustomerSessionResponse(baseSession(), NOW);
    expect(res.body).not.toHaveProperty("trail");
  });

  it("도착완료 세션은 410과 종료 안내만 반환하고 좌표를 비노출한다", () => {
    const res = buildCustomerSessionResponse(
      baseSession({ status: "도착완료", arrivedAt: "2026-06-07T17:58:00.000Z" }),
      NOW,
    );
    expect(res.httpStatus).toBe(410);
    expect(res.body.ended).toBe(true);
    expect(res.body.status).toBe("도착완료");
    expect(res.body).not.toHaveProperty("currentLat");
    expect(res.body).not.toHaveProperty("currentLng");
    expect(res.body).not.toHaveProperty("customerLat");
  });

  it("업무취소 세션은 410과 취소 상태를 반환한다", () => {
    const res = buildCustomerSessionResponse(baseSession({ status: "업무취소" }), NOW);
    expect(res.httpStatus).toBe(410);
    expect(res.body.status).toBe("업무취소");
    expect(res.body.ended).toBe(true);
    expect(res.body).not.toHaveProperty("currentLat");
  });

  it("만료 시간이 지난 이동중 세션은 410 만료로 처리한다", () => {
    const res = buildCustomerSessionResponse(
      baseSession({ expiresAt: "2026-06-07T17:00:00.000Z" }),
      NOW,
    );
    expect(res.httpStatus).toBe(410);
    expect(res.body.status).toBe("만료");
    expect(res.body.ended).toBe(true);
    expect(res.body).not.toHaveProperty("currentLat");
  });

  it("존재하지 않는 토큰은 404를 반환한다", () => {
    const res = buildCustomerSessionResponse(null, NOW);
    expect(res.httpStatus).toBe(404);
  });
});
