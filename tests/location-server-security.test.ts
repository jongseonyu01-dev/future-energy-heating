import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("location server authorization", () => {
  const routerSource = read("server/routers.ts");
  const webRoutesSource = read("server/web-routes.ts");
  const dbSource = read("server/db.ts");

  it("keeps only the customer token capability endpoint public in REST location APIs", () => {
    expect(webRoutesSource).toContain('app.get("/api/location/session/:token"');
    const customerBlock = webRoutesSource.slice(
      webRoutesSource.indexOf('app.get("/api/location/session/:token"'),
      webRoutesSource.indexOf('app.post("/api/location/update"'),
    );
    expect(customerBlock).toContain("getCustomerLocationSessionByToken(req.params.token)");
    expect(customerBlock).toContain('typeof req.headers.authorization === "string"');
    expect(customerBlock).toContain("requireTechnicianRequest(req)");
    expect(customerBlock).toContain("session.technicianId !== authenticatedTechnician.id");
    expect(customerBlock).toContain("authenticatedOwner: true");

    const updateBlock = webRoutesSource.slice(
      webRoutesSource.indexOf('app.post("/api/location/update"'),
      webRoutesSource.indexOf('app.post("/api/location/stop"'),
    );
    expect(updateBlock).toContain("requireTechnicianRequest(req)");
    expect(updateBlock).toContain("updateLocationSessionPositionAuthorized");

    const stopBlock = webRoutesSource.slice(
      webRoutesSource.indexOf('app.post("/api/location/stop"'),
      webRoutesSource.indexOf('app.post("/api/location/start-by-admin"'),
    );
    expect(stopBlock).toContain("requireTechnicianRequest(req)");
    expect(stopBlock).toContain("stopLocationSessionAuthorized");
    expect(stopBlock).toContain("markLocationSessionArrivedAuthorized");
    expect(stopBlock).toContain("arrival.firstArrival");
    expect(stopBlock).toContain("deliverWorkflowNotificationClaim(arrival.notificationClaim)");
    expect(webRoutesSource).toContain("!role.passwordHash");
    expect(webRoutesSource).toContain('.createHmac("sha256", role.passwordHash)');
    expect(webRoutesSource).not.toContain('passwordHash || "seed"');
  });

  it("guards every admin REST route and enforces branch scope", () => {
    for (const marker of [
      'app.post("/api/location/start-by-admin"',
      'app.post("/api/location/stop-by-admin"',
      'app.get("/api/location/active"',
      'app.get("/api/location/active/branch/:branchId"',
    ]) {
      const start = webRoutesSource.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      expect(webRoutesSource.slice(start, start + 4500)).toContain("requireManagerRequest(req)");
    }
    expect(webRoutesSource).toContain("assertManagerBranchAccess(manager, repair.branchId)");
    expect(webRoutesSource).toContain("assertManagerBranchAccess(manager, branchId)");
  });

  it("uses canonical repair and technician data for admin-created sessions", () => {
    const block = webRoutesSource.slice(
      webRoutesSource.indexOf('app.post("/api/location/start-by-admin"'),
      webRoutesSource.indexOf('app.post("/api/location/stop-by-admin"'),
    );
    expect(block).toContain("getRepairRequestById(requestId)");
    expect(block).toContain("getTechnicianById(technicianId)");
    expect(block).toContain("getOrCreateActiveLocationSession");
    expect(block).toContain("managerUserId: manager.userId");
    expect(block).toContain("technicianName: technician.name");
    expect(block).toContain("customerPhone: repair.phoneNumber");
    expect(block).not.toContain("customerPhone: req.body");
    expect(block).toContain("claimLocationSessionSms(claim)");
    expect(block).toContain("clearLocationSessionSmsClaim(claim)");
    expect(block).toContain("buildPublicTrackingUrl(effectiveToken)");
    expect(webRoutesSource).toContain('const OFFICIAL_TRACKING_ORIGIN = "https://퓨처에너지테크.kr"');
    expect(webRoutesSource).toContain("/track/${encodeURIComponent(token)}");
    expect(block).not.toContain("process.env.SITE_URL");

    const stopBlock = webRoutesSource.slice(
      webRoutesSource.indexOf('app.post("/api/location/stop-by-admin"'),
      webRoutesSource.indexOf('app.get("/api/location/active"'),
    );
    expect(stopBlock).toContain("stopLocationSessionByManagerAuthorized");
    expect(stopBlock).toContain("managerUserId: manager.userId");
  });

  it("locks both request and technician and permits one active session per technician", () => {
    const block = dbSource.slice(
      dbSource.indexOf("export async function getOrCreateActiveLocationSession"),
      dbSource.indexOf("export async function getLocationSessionByToken"),
    );
    expect(block).toContain('.from(repairRequests)');
    expect(block).toContain('.from(technicians)');
    expect(block).toContain('.for("update")');
    expect(block).toContain("eq(locationSessions.requestId, data.requestId)");
    expect(block).toContain("eq(locationSessions.technicianId, data.technicianId)");
    expect(block).toContain('eq(locationSessions.status, "이동중")');
    expect(block).toContain("branchId: repairRequests.branchId");
    expect(block).toContain("branchId: technicians.branchId");
    expect(block).toContain("request.branchId !== managedBranch.id");
    expect(block).toContain("technician.branchId !== managedBranch.id");
  });

  it("guards all sensitive tRPC location procedures", () => {
    for (const procedure of [
      "getConsent",
      "saveConsent",
      "startTracking",
      "startTrackingByAdmin",
      "stopTracking",
      "markArrived",
      "markWorkCompleted",
      "resendTrackingSms",
      "getSessionByRequest",
      "getActiveSessions",
      "getActiveSessionsByBranch",
    ]) {
      expect(routerSource).toContain(`${procedure}: protectedProcedure`);
    }
    expect(routerSource).toContain("requireLocationSessionMutationAccess(ctx, input.token)");
    expect(routerSource).toContain("requireLocationSessionReadAccess(ctx, input.requestId)");
  });

  it("ignores the client phone in the legacy technician schedule endpoint", () => {
    const block = routerSource.slice(
      routerSource.indexOf("listByTechnicianUserId: publicProcedure"),
      routerSource.indexOf("listMySchedule: protectedProcedure"),
    );
    expect(block).toContain("targetUserId = callerRole === \"technician\" ? ctx.user.id : input.userId");
    expect(block).toContain("resolveActiveTechnicianForUser");
    expect(block).toContain("getManagedActiveBranchByUserId(ctx.user.id)");
    expect(block).not.toContain("getTechniciansByPhone(input.phoneNumber)");
    expect(block).not.toContain("updateTechnicianUserId");
    expect(block).not.toContain("getAppRolesByPhoneNormalized(input.phoneNumber)");
  });

  it("returns a minimal customer session DTO after phone ownership verification", () => {
    const helper = routerSource.slice(
      routerSource.indexOf("async function requireLocationSessionReadAccess"),
      routerSource.indexOf("async function requireLocationSessionMutationAccess"),
    );
    expect(helper).toContain('caller.appRole === "customer"');
    expect(helper).toContain("normalizePhone(role.phoneNumber) !== normalizePhone(request.phoneNumber)");

    const block = routerSource.slice(
      routerSource.indexOf("getSessionByRequest: protectedProcedure"),
      routerSource.indexOf("getActiveSessions: protectedProcedure"),
    );
    expect(block).toContain("status: reconciled.status");
    expect(block).toContain("getCustomerLocationSessionByToken(session.trackingToken)");
    expect(block).toContain("trackingUrl:");
    expect(block).not.toContain("trackingToken:");
    expect(block).not.toContain("...session");
  });
});

describe("work report authorization and first-photo persistence", () => {
  const routerSource = read("server/routers.ts");
  const dbSource = read("server/db.ts");

  it("authenticates report reads/saves and ignores client photo URLs and technician identity", () => {
    const block = routerSource.slice(
      routerSource.indexOf("workReport: router"),
      routerSource.indexOf("// ─── 관리자 설정"),
    );
    expect(block).toContain("getByRequest: protectedProcedure");
    expect(block).toContain("save: protectedProcedure");
    expect(block).toContain("uploadPhoto: protectedProcedure");
    expect(block).toContain("requireCurrentTechnicianAssignment(ctx, input.requestId)");
    expect(block).toContain("technicianId: technician.id");
    expect(block).not.toContain("beforePhotoUrl: z.string()");
    expect(block).not.toContain("afterPhotoUrl: z.string()");
    expect(block).toContain('mimeType: z.literal("image/jpeg")');
    expect(block).toContain("MAX_WORK_REPORT_JPEG_BASE64_LENGTH");
    expect(block).toContain("decodeWorkReportJpeg(input.base64)");
    expect(block).toContain("storageDelete(key)");
    expect(block).toContain("storageKeyFromPublicUrl(photoUpdate.previousUrl)");
  });

  it("reconciles stale customer capability sessions against assignment, technician and terminal state", () => {
    const block = dbSource.slice(
      dbSource.indexOf("export async function getCustomerLocationSessionByToken"),
      dbSource.indexOf("export async function getLocationSessionByRequestId"),
    );
    expect(block).toContain('.from(repairRequests)');
    expect(block).toContain('.from(technicians)');
    expect(block).toContain('.from(appRoles)');
    expect(block).toContain('request.technicianId !== session.technicianId');
    expect(block).toContain('linkedRole.appRole !== "technician"');
    expect(block).toContain('endedStatus = "도착완료"');
    expect(block).toContain('endedStatus = "업무취소"');
    expect(block).toContain('eq(locationSessions.status, "이동중")');
  });

  it("creates a locked report row when the first photo arrives before report text", () => {
    const block = dbSource.slice(
      dbSource.indexOf("export async function setWorkReportPhotoUrl"),
      dbSource.indexOf("// ─── 공지사항"),
    );
    expect(block).toContain('.from(repairRequests)');
    expect(block).toContain('.for("update")');
    expect(block).toContain("request.technicianId !== params.technicianId");
    expect(block).toContain('throw new Error("WORK_REPORT_ALREADY_COMPLETED")');
    expect(block).toContain("tx.insert(workReports).values");
    expect(block).toContain("[field]: params.url");
  });
});

describe("legacy admin HTML authorization headers", () => {
  it("adds the saved HMAC bearer token to every location admin REST call", () => {
    const dashboard = read("public/web/admin/dashboard.html");
    const branch = read("public/web/admin/branch.html");
    for (const source of [dashboard, branch]) {
      expect(source).toContain("function authHeaders(extra)");
      expect(source).toContain("let opts = { headers: authHeaders({ 'Content-Type': 'application/json' }) }");
      expect(source).toContain("/api/location/start-by-admin");
      expect(source).toContain("/api/location/stop-by-admin");
    }
    expect(dashboard).toMatch(/\/api\/location\/active'[\s\S]{0,180}headers:\s*authHeaders\(\)/);
    expect(branch).toMatch(/\/api\/location\/active\/branch\/[\s\S]{0,220}headers:\s*authHeaders\(\)/);
  });

  it("blocks the legacy free-text start form before it can call the canonical-ID endpoint", () => {
    const dashboard = read("public/web/admin/dashboard.html");
    const branch = read("public/web/admin/branch.html");
    const dashboardBlock = dashboard.slice(
      dashboard.indexOf("async function startManualTracking()"),
      dashboard.indexOf("// 세션 강제 종료"),
    );
    const branchBlock = branch.slice(
      branch.indexOf("async function startBranchManualTracking()"),
      branch.indexOf("async function stopBranchTrackingSession"),
    );
    for (const block of [dashboardBlock, branchBlock]) {
      expect(block).toContain("requestId");
      expect(block).toContain("technicianId");
      expect(block).toContain("기사 앱의 배정된 접수에서 출발 버튼을 사용해 주세요.");
      expect(block.indexOf("if (!requestId || !technicianId)"))
        .toBeLessThan(block.indexOf("/api/location/start-by-admin"));
      expect(block).toMatch(/\{\s*requestId,\s*technicianId,\s*customerName/);
    }
  });
});

describe("assignment and schedule notification consistency", () => {
  const routerSource = read("server/routers.ts");
  const dbSource = read("server/db.ts");

  it("guards assignment and sends a schedule confirmation from an atomic canonical snapshot", () => {
    const block = routerSource.slice(
      routerSource.indexOf("assignTechnician: protectedProcedure"),
      routerSource.indexOf("updateSchedule: protectedProcedure"),
    );
    const common = routerSource.slice(
      routerSource.indexOf("async function deliverAssignmentNotification"),
      routerSource.indexOf("// 추측 불가능한 긴 일회용 위치코드"),
    );
    expect(block).toContain("requireManagerCaller(ctx)");
    expect(block).toContain("db.assignTechnicianAuthorized");
    expect(block).toContain("deliverAssignmentNotification");
    expect(block).not.toContain("input.technicianName,");
    expect(common).toContain("assignment.technicianName");
    expect(common).toContain("buildScheduleConfirmedMessage");
    expect(common).toContain("buildTechnicianReassignedMessage");
    expect(common).toContain('messageType = scheduleChanged ? "일정변경" : "기사재배정"');
    expect(common).toContain("assignment.notificationClaim");
    expect(common).toContain("notifyClaimedAndLog");
  });

  it("distinguishes first confirmation from a real change and suppresses duplicate schedule SMS", () => {
    const block = routerSource.slice(
      routerSource.indexOf("updateSchedule: protectedProcedure"),
      routerSource.indexOf("notifyBranchAssigned:"),
    );
    expect(block).toContain("requireManagerCaller(ctx)");
    expect(block).toContain("db.updateScheduleAuthorized");
    expect(block).toContain("getScheduleNoticeKind(");
    expect(block).toContain('noticeKind === "changed"');
    expect(block).toContain("schedule.notificationClaim");
    expect(block).toContain("notifyClaimedAndLog");
  });

  it("locks the request while checking manager scope, canonical technician and prior schedule", () => {
    const assignment = dbSource.slice(
      dbSource.indexOf("export async function assignTechnicianAuthorized"),
      dbSource.indexOf("// ─── 워크플로우 단계만 갱신"),
    );
    const schedule = dbSource.slice(
      dbSource.indexOf("export async function updateScheduleAuthorized"),
      dbSource.indexOf("// ─── 일정 변경 (사유 기록)"),
    );
    for (const block of [assignment, schedule]) {
      expect(block).toContain("db.transaction");
      expect(block).toContain('.from(repairRequests)');
      expect(block).toContain('.from(appRoles)');
      expect(block).toContain('.for("update")');
      expect(block).toContain("previousScheduledDate");
      expect(block).toContain("previousScheduledTime");
    }
    expect(assignment).toContain("technicianName: technician.name");
    expect(assignment).toContain("request.branchId !== managedBranch.id");
    expect(assignment).toContain('.from(workReports)');
    expect(assignment).toContain('throw new RepairScheduleAuthorizationError("terminal")');
    expect(schedule).toContain('throw new RepairScheduleAuthorizationError("terminal")');
    expect(assignment).toContain("claimRepairNotificationWithTx");
    expect(schedule).toContain("claimRepairNotificationWithTx");
  });
});
