import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("tracking page privacy", () => {
  const html = read("public/web/track.html");
  const routes = read("server/web-routes.ts");
  const routers = read("server/routers.ts");
  const geocode = read("server/kakao-geocode.ts");

  it("keeps the Kakao REST key server-side behind a bounded same-origin proxy", () => {
    expect(html).toContain("fetch('/api/kakao/local/address'");
    expect(html).not.toContain("KAKAO_REST_API_KEY");
    expect(html).not.toContain("KakaoAK");
    expect(html).not.toContain("dapi.kakao.com/v2/local");

    const proxy = routes.slice(
      routes.indexOf('app.post("/api/kakao/local/address"'),
      routes.indexOf('// 위치 세션 정보 조회'),
    );
    expect(proxy).toContain("claimKakaoGeocodeRate(req)");
    expect(proxy).toContain("normalizeKakaoAddress(req.body?.address)");
    expect(proxy).toContain("geocodeKoreanAddress(address)");
    expect(proxy).not.toContain("process.env.KAKAO_REST_API_KEY");
    expect(geocode).toContain("process.env.KAKAO_REST_API_KEY");
    expect(geocode).toContain("kakaoGeocodeCache.get(address)");
    expect(geocode).toContain("KAKAO_GEOCODE_CACHE_MAX = 500");
    expect(geocode).toContain("new AbortController()");
    expect(geocode).toContain("signal: controller.signal");
    expect(geocode).toContain("address.length >= 2 && address.length <= 200");
    expect(geocode).toContain("kakaoGeocodeInFlight.get(address)");
    expect(proxy).not.toContain("console.log");
    expect(geocode).not.toContain("console.");

    // 공개 Kakao Local REST 경로가 추가되면 이 검사가 실패하여 동일한
    // rate-limit/cache/timeout 계약을 적용하도록 강제한다.
    const publicLocalRoutes = [...routes.matchAll(
      /app\.(?:get|post|put|patch|delete)\("(\/api\/kakao\/local\/[^"?]+)"/g,
    )].map((match) => match[1]);
    expect(publicLocalRoutes).toEqual(["/api/kakao/local/address"]);

    const start = routers.slice(
      routers.indexOf("startTracking: protectedProcedure"),
      routers.indexOf("updateTracking: protectedProcedure"),
    );
    expect(start).toContain("geocodeKoreanAddress(customerAddress)");
    expect(start).not.toContain("process.env.KAKAO_REST_API_KEY");
    expect(start).not.toContain("dapi.kakao.com");
    expect(start).not.toContain("doc.y");
    expect(start).not.toContain("doc.x");
  });

  it("marks both token HTML and session JSON as no-store", () => {
    const track = routes.slice(
      routes.indexOf('app.get("/track/:token"'),
      routes.indexOf('app.post("/api/kakao/local/address"'),
    );
    const session = routes.slice(
      routes.indexOf('app.get("/api/location/session/:token"'),
      routes.indexOf('app.post("/api/location/update"'),
    );
    expect(track).toContain("setNoStore(res)");
    expect(session).toContain("setNoStore(res)");
    expect(routes).toContain('"Cache-Control", "no-store, max-age=0"');
  });

  it("does not write exact live/destination coordinates or addresses to console", () => {
    const start = routers.slice(
      routers.indexOf("startTracking: protectedProcedure"),
      routers.indexOf("getSessionByRequest: protectedProcedure"),
    );
    const locationRoutes = routes.slice(
      routes.indexOf("// ─── 위치 추적 API"),
      routes.indexOf("// ─── 유량계"),
    );
    const consoleCalls = [html, start, locationRoutes]
      .flatMap((source) => source.match(/console\.(?:log|info|warn|error|debug)\([\s\S]*?\);?/g) ?? [])
      .join("\n");
    for (const sensitive of [
      "techLat, techLng",
      "destLat, destLng",
      "result.lat, result.lng",
      "args.customerAddress",
      "data.currentLat",
      "data.currentLng",
      "canonicalAddress",
      "customerAddress",
      "customerPhone",
      "technicianPhone",
      "trackingToken",
      "resolvedCustomerLat",
      "resolvedCustomerLng",
      "doc.y",
      "doc.x",
    ]) {
      expect(consoleCalls).not.toContain(sensitive);
    }
  });

  it("escapes stored session fields before inserting tracking-card HTML", () => {
    const render = html.slice(
      html.indexOf("function render(data)"),
      html.indexOf("// ═══════════════════════════════════════════════════════════════════════════\n// 세션 데이터 로드"),
    );
    expect(html).toContain("function escapeHtml(value)");
    expect(html).not.toContain("퍼치에너지테크");
    expect(render).toContain("escapeHtml(data.technicianName || '기사')");
    expect(render).toContain("escapeHtml(data.customerAddress)");
    expect(render).toContain("var safeTechName = escapeHtml(techName)");
    expect(render).not.toContain("' + data.customerAddress + '");
    expect(render).not.toContain("' + techName + '");
    expect(html).toContain("escapeHtml(err.error || '위치 정보를 불러올 수 없습니다.')");
    const xssFixture = '<img src=x onerror="globalThis.__trackingXss=1">';
    const escapedFixture = xssFixture.replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]!);
    expect(escapedFixture).not.toContain("<img");
    expect(escapedFixture).toContain("&lt;img");
  });
});

describe("tracking SMS resend authorization and cost guard", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const visitTracking = read("components/technician-visit-tracking.ts");
  const schedule = read("app/(tabs)/tech-schedule.tsx");
  const works = read("app/(tabs)/tech-works.tsx");

  it("allows only current technician/branch/HQ access and rechecks it in the claim transaction", () => {
    const access = routers.slice(
      routers.indexOf("async function requireLocationSessionMutationAccess"),
      routers.indexOf("async function requireManagerCaller"),
    );
    expect(access).toContain('caller.appRole === "technician"');
    expect(access).toContain('caller.appRole === "hq_admin"');
    expect(access).toContain('caller.appRole === "branch_manager"');
    expect(access).not.toContain('caller.appRole === "customer"');

    const claim = db.slice(
      db.indexOf("export async function claimLocationSessionResendSms"),
      db.indexOf("export async function clearLocationSessionSmsClaim"),
    );
    expect(claim).toContain("db.transaction");
    expect(claim).toContain('.from(repairRequests)');
    expect(claim).toContain('.from(technicians)');
    expect(claim).toContain('.from(appRoles)');
    expect(claim).toContain("eq(branches.managerUserId, caller.userId)");
    expect(claim).toContain("request.technicianId !== snapshot.technicianId");
    expect(claim).toContain("technician.userId !== caller.userId");
    expect(claim).toContain('.for("update")');
  });

  it("uses a durable lease and five-minute accepted-send cooldown", () => {
    const claim = db.slice(
      db.indexOf("const LOCATION_RESEND_MESSAGE_TYPE"),
      db.indexOf("export async function clearLocationSessionSmsClaim"),
    );
    expect(claim).toContain("LOCATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000");
    expect(claim).toContain("WORKFLOW_NOTIFICATION_LEASE_MS");
    expect(claim).toContain('eq(notificationLogs.messageType, "기사출발")');
    expect(claim).toContain("eq(notificationLogs.messageType, LOCATION_RESEND_MESSAGE_TYPE)");
    expect(claim).toContain('latest?.result === "SUCCESS" || latest?.result === "REQUESTED"');
    expect(claim).toContain('reason: "cooldown"');
    expect(claim).toContain('reason: "pending"');
    expect(claim).toContain("responsePayload: `LOCATION_RESEND_CLAIM:");
    expect(claim).toContain("locationTrackingLogPattern(session.trackingToken)");
    expect(claim).toContain("gte(notificationLogs.createdAt, session.createdAt)");
    expect(claim).toContain("`LOCATION_RESEND_CLAIM:${session.trackingToken}`");
  });

  it("routes resend through claim and common durable delivery, never direct sendSms", () => {
    const route = routers.slice(
      routers.indexOf("resendTrackingSms: protectedProcedure"),
      routers.indexOf("getSessionByRequest: protectedProcedure"),
    );
    expect(route).toContain("requireLocationSessionMutationAccess(ctx, input.token)");
    expect(route).toContain("db.claimLocationSessionResendSms");
    expect(route).toContain("deliverWorkflowNotificationClaim(claim)");
    expect(route).not.toMatch(/\bawait\s+sendSms\s*\(/);
    expect(route).not.toContain("markLocationSessionSmsSent");
  });

  it("keeps an in-app recovery action visible while a visit is sharing location", () => {
    expect(visitTracking).toContain("resendTrackingSms.useMutation()");
    expect(visitTracking).toContain("handleResendTrackingSms");
    expect(visitTracking).toContain("result.smsPending");
    expect(schedule).toContain("고객 위치링크 재발송");
    expect(works).toContain("고객 위치링크 재발송");
  });
});
