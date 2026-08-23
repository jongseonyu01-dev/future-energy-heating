import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLocationDepartureDeliveryPending } from "../server/db";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("legacy technician schedule compatibility", () => {
  const routers = read("server/routers.ts");
  const techHtml = read("public/web/admin/tech.html");

  it("uses the authenticated canonical technician even when the browser saved a legacy ID", () => {
    const route = routers.slice(
      routers.indexOf("listByTechnician: protectedProcedure"),
      routers.indexOf("// 레거시 클라이언트 호환용 userId 조회"),
    );
    expect(route).toContain('caller.appRole === "technician"');
    expect(route).toContain("resolveActiveTechnicianForUser");
    expect(route).toContain("getRepairRequestsByTechnicianIds([tech.id])");
    expect(route).not.toContain("tech.id !== input.technicianId");
    expect(route).toContain('caller.appRole === "branch_manager"');
    expect(route).toContain("target.branchId !== caller.branchId");

    const loadJobs = techHtml.slice(
      techHtml.indexOf("async function loadJobs()"),
      techHtml.indexOf("function renderJobs"),
    );
    expect(loadJobs).toContain("repair.listMySchedule");
    expect(loadJobs).not.toContain("repair.listByTechnician'");
  });
});

describe("legacy status mutation authorization", () => {
  const routers = read("server/routers.ts");
  const db = read("server/db.ts");

  it("protects the route and reserves departure, arrival and completion for dedicated mutations", () => {
    const route = routers.slice(
      routers.indexOf("updateStatus: protectedProcedure"),
      routers.indexOf("// 기사 배정"),
    );
    expect(route).toContain("db.updateRepairStatusAuthorized");
    expect(route).toContain("callerUserId: ctx.user.id");
    expect(route).toContain("resolveActiveTechnicianForUser");
    expect(route).toContain("deliverWorkflowNotificationClaim");
    expect(route).not.toContain("await db.updateRepairStatus(");
    expect(route).not.toContain("await sendSms(");

    const atomic = db.slice(
      db.indexOf("export async function updateRepairStatusAuthorized"),
      db.indexOf("// ─── 기사 배정"),
    );
    expect(atomic).toContain("db.transaction");
    expect(atomic).toContain('.from(repairRequests)');
    expect(atomic).toContain('.from(appRoles)');
    expect(atomic).toContain('.for("update")');
    expect(atomic).toContain('["출발", "도착", "공사완료", "작업완료"]');
    expect(atomic).toContain('caller.appRole === "technician"');
    expect(atomic).toContain("request.technicianId !== technician.id");
    expect(atomic).toContain('caller.appRole === "branch_manager"');
    expect(atomic).toContain("request.branchId !== branchRows[0].id");
    expect(atomic).toContain("claimWorkflowNotificationWithTx");

    expect(routers).toContain("confirmJobSchedule: protectedProcedure");
    expect(routers).toContain("updateWorkflowStatus: protectedProcedure");
    const legacyWorkflow = routers.slice(
      routers.indexOf("updateWorkflowStatus: protectedProcedure"),
      routers.indexOf("// ─── 기사 관리"),
    );
    expect(legacyWorkflow).toContain("requireCurrentTechnicianAssignment(ctx, input.id)");
    expect(legacyWorkflow).toContain('["출발", "도착", "공사완료"].includes(input.status)');
    expect(legacyWorkflow).not.toContain("db.updateRepairStatus(input.id");
    expect(legacyWorkflow).not.toContain("notifyAndLog(");
  });

  it("rejects a mismatched report technician before marking it completed", () => {
    const completion = db.slice(
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
      db.indexOf("export async function setWorkReportPhotoUrl"),
    );
    expect(completion.indexOf("report.technicianId !== params.technicianId"))
      .toBeLessThan(completion.indexOf("isCompleted: true"));
    expect(completion).toContain('throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED")');
  });
});

describe("notification ordering and departure claim revalidation", () => {
  const routers = read("server/routers.ts");
  const db = read("server/db.ts");
  const routes = read("server/web-routes.ts");

  it("preserves failed schedule-change content on an unchanged retry", () => {
    const update = routers.slice(
      routers.indexOf("updateSchedule: protectedProcedure"),
      routers.indexOf("notifyBranchAssigned:"),
    );
    expect(update).toContain("claim.retryMessageType ?? messageType");
    expect(update).toContain("claim.retryContent ?? message");
    expect(update).toContain("notifyClaimedAndLog");
  });

  it("blocks a different pending repair target until its two-minute lease expires", () => {
    const claim = db.slice(
      db.indexOf("async function claimRepairNotificationWithTx"),
      db.indexOf("export async function claimRepairNotification("),
    );
    expect(claim).toContain("latestClaim && !existing");
    expect(claim).toContain("leaseAgeMs < 2 * 60 * 1000");
    expect(claim).toContain('RepairScheduleAuthorizationError("delivery_pending")');
    expect(claim).toContain('errorMessage: "DELIVERY_LEASE_EXPIRED"');
    expect(claim).toContain("messageType: params.messageType");
    expect(claim).toContain("content: params.content");
    expect(claim).not.toContain('messageType: "발송선점"');
    expect(claim).not.toContain("content: null");
  });

  it("revalidates token, active session, claim marker and current assignment immediately before every departure send", () => {
    const validate = db.slice(
      db.indexOf("export async function validateLocationSessionSmsClaim"),
      db.indexOf("const LOCATION_RESEND_MESSAGE_TYPE"),
    );
    expect(validate).toContain("db.transaction");
    expect(validate).toContain("request.technicianId === params.technicianId");
    expect(validate).toContain('session.status === "이동중"');
    expect(validate).toContain("session.smsSentAt");
    expect(validate).toContain("technician.isActive && !technician.isDeleted");

    const appStart = routers.slice(
      routers.indexOf("startTracking: protectedProcedure"),
      routers.indexOf("// 관리자/지사장이 직접 위치 공유 시작"),
    );
    const adminStart = routers.slice(
      routers.indexOf("startTrackingByAdmin: protectedProcedure"),
      routers.indexOf("// 관리자/지사장이 위치 세션 강제 종료"),
    );
    const restStart = routes.slice(
      routes.indexOf('app.post("/api/location/start-by-admin"'),
      routes.indexOf('app.post("/api/location/stop-by-admin"'),
    );
    for (const source of [appStart, adminStart]) {
      expect(source).toContain("validateLocationSessionSmsClaim(claim)");
      expect(source.indexOf("validateLocationSessionSmsClaim(claim)"))
        .toBeLessThan(source.indexOf("buildTechnicianDepartedMessage"));
    }
    expect(restStart).toContain("validateLocationSessionSmsClaim(claim)");
    expect(restStart.indexOf("validateLocationSessionSmsClaim(claim)"))
      .toBeLessThan(restStart.indexOf("buildTechnicianDepartedMessage"));
  });

  it("does not cancel an earlier session while its exact departure delivery is pending", () => {
    const create = db.slice(
      db.indexOf("export async function getOrCreateActiveLocationSession"),
      db.indexOf("export async function getLocationSessionByToken"),
    );
    expect(create).toContain("row.smsSentAt");
    expect(create).toContain("locationTrackingLogPattern(row.trackingToken)");
    expect(create).toContain("gte(notificationLogs.createdAt, row.createdAt)");
    expect(create).toContain("claimAgeMs < LOCATION_SMS_CLAIM_LEASE_MS");
    expect(create).toContain('throw new Error("LOCATION_DELIVERY_PENDING")');
    expect(create.indexOf('throw new Error("LOCATION_DELIVERY_PENDING")'))
      .toBeLessThan(create.indexOf('status: isExpired ? "만료" : "업무취소"'));
    expect(routers).toContain('message === "LOCATION_DELIVERY_PENDING"');
    expect(routes).toContain('message === "LOCATION_DELIVERY_PENDING"');
  });

  it("blocks immediate arrival, cancellation and completion until departure delivery settles", () => {
    const guard = db.slice(
      db.indexOf("async function assertLocationDepartureDeliverySettledWithTx"),
      db.indexOf("export async function createLocationSession"),
    );
    expect(guard).toContain("locationTrackingLogPattern(session.trackingToken)");
    expect(guard).toContain("gte(notificationLogs.createdAt, session.createdAt)");
    expect(guard).toContain("isLocationDepartureDeliveryPending");
    expect(guard).toContain('throw new Error("LOCATION_DELIVERY_PENDING")');

    const arrival = db.slice(
      db.indexOf("export async function markLocationSessionArrivedAuthorized"),
      db.indexOf("// 만료된 세션 자동 처리"),
    );
    expect(arrival).toContain("assertLocationDepartureDeliverySettledWithTx(tx, session)");

    const technicianStop = db.slice(
      db.indexOf("export async function stopLocationSessionAuthorized"),
      db.indexOf("export async function stopLocationSessionByManagerAuthorized"),
    );
    const managerStop = db.slice(
      db.indexOf("export async function stopLocationSessionByManagerAuthorized"),
      db.indexOf("export async function markLocationSessionSmsSent"),
    );
    expect(technicianStop).toContain("assertLocationDepartureDeliverySettledWithTx(tx, session)");
    expect(managerStop).toContain("assertLocationDepartureDeliverySettledWithTx(tx, session)");

    const reportSave = db.slice(
      db.indexOf("export async function upsertWorkReport"),
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
    );
    const markCompleted = db.slice(
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
      db.indexOf("export async function setWorkReportPhotoUrl"),
    );
    expect(reportSave).toContain("lockAndAssertLocationDeparturesSettledWithTx");
    expect(markCompleted).toContain("lockAndAssertLocationDeparturesSettledWithTx");
    expect(routers).toContain('message: "앞선 출발 안내를 처리 중입니다. 잠시 후 다시 시도해 주세요."');

    const claimedAt = new Date("2026-08-23T00:00:00.000Z");
    expect(isLocationDepartureDeliveryPending({
      smsSentAt: claimedAt,
      accepted: false,
      nowMs: claimedAt.getTime() + 10_000,
    })).toBe(true); // 출발 직후 도착은 전송 중 conflict
    expect(isLocationDepartureDeliveryPending({
      smsSentAt: claimedAt,
      accepted: true,
      nowMs: claimedAt.getTime() + 10_000,
    })).toBe(false); // exact accepted 로그 뒤에는 도착 허용
    expect(isLocationDepartureDeliveryPending({
      smsSentAt: claimedAt,
      accepted: false,
      nowMs: claimedAt.getTime() + 2 * 60 * 1000,
    })).toBe(false); // crash lease 만료 뒤 회수
  });

  it("binds departure success and smsSent responses to the exact token and session age", () => {
    const claim = db.slice(
      db.indexOf("export async function claimLocationSessionSms"),
      db.indexOf("const LOCATION_RESEND_MESSAGE_TYPE"),
    );
    expect(claim).toContain("locationTrackingLogPattern(params.token)");
    expect(claim).toContain("gte(notificationLogs.createdAt, session.createdAt)");
    expect(claim).toContain("export async function hasAcceptedLocationSessionSms");
    expect(routers).toContain("smsSent = await db.hasAcceptedLocationSessionSms(claim)");
    expect(routes).toContain("smsSent = await hasAcceptedLocationSessionSms(claim)");
    expect(routers).not.toContain('getLatestNotificationLogByTypes(request.id, ["기사출발"])');
    expect(routes).not.toContain('getLatestNotificationLogByTypes(repair.id, ["기사출발"])');
  });
});
