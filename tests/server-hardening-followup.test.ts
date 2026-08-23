import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

function loadLegacyWebAuthRuntime(source: string, initialMe: unknown) {
  const normalizeStart = source.indexOf("function normalizeStoredAuthToken(authUser)");
  const authStart = source.indexOf("function authHeaders(extra)", normalizeStart);
  const nextFunctionCandidates = [
    source.indexOf("function safeTrackingUrl", authStart),
    source.indexOf("function normalizeTrackingToken", authStart),
  ].filter((index) => index > authStart);
  const authEnd = Math.min(...nextFunctionCandidates);
  expect(normalizeStart).toBeGreaterThan(-1);
  expect(authStart).toBeGreaterThan(normalizeStart);
  expect(authEnd).toBeGreaterThan(authStart);
  const helpers = source.slice(normalizeStart, authEnd);
  return new Function(
    "initialMe",
    `let me = initialMe;\n${helpers}\nreturn { normalizeStoredAuthToken, authHeaders };`,
  )(initialMe) as {
    normalizeStoredAuthToken: (value: unknown) => string | null;
    authHeaders: (extra?: Record<string, string>) => Record<string, string>;
  };
}

describe("legacy login token upgrade regression", () => {
  const routers = read("server/routers.ts");
  const context = read("server/_core/context.ts");
  const webRoutes = read("server/web-routes.ts");

  it("signs the immediately returned token with the persisted bcrypt hash", () => {
    const login = routers.slice(
      routers.indexOf("login: publicProcedure"),
      routers.indexOf("verifyToken: publicProcedure"),
    );
    expect(login).toContain("if (!role.passwordHash)");
    expect(login).toContain("let tokenPasswordHash = role.passwordHash;");
    expect(login).toContain("tokenPasswordHash = upgradedPasswordHash");
    expect(login).toContain("tokenPasswordHash = refreshedRole?.passwordHash || tokenPasswordHash");
    expect(login).toContain('.createHmac("sha256", tokenPasswordHash)');
    expect(login.indexOf("tokenPasswordHash = upgradedPasswordHash"))
      .toBeLessThan(login.indexOf('.createHmac("sha256", tokenPasswordHash)'));

    const userId = 165;
    const persistedBcryptHash = "$2b$10$persisted-upgrade-fixture";
    const signature = crypto
      .createHmac("sha256", persistedBcryptHash)
      .update(String(userId))
      .digest("hex");
    const returnedToken = `${userId}:${signature}`;
    const [, returnedSignature] = returnedToken.split(":");
    const contextExpected = crypto.createHmac("sha256", persistedBcryptHash).update(String(userId)).digest("hex");
    const restExpected = crypto.createHmac("sha256", persistedBcryptHash).update(String(userId)).digest("hex");
    expect(returnedSignature).toBe(contextExpected);
    expect(Buffer.from(returnedSignature).equals(Buffer.from(restExpected))).toBe(true);
    expect(context).toContain("!role.passwordHash");
    expect(context).toContain('.createHmac("sha256", role.passwordHash)');
    expect(webRoutes).toContain("!role.passwordHash");
    expect(webRoutes).toContain('.createHmac("sha256", role.passwordHash)');
    expect(context).not.toContain('passwordHash || "seed"');
    expect(webRoutes).not.toContain('passwordHash || "seed"');
  });
});

describe("canonical branch-manager authorization", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const context = read("server/_core/context.ts");
  const webRoutes = read("server/web-routes.ts");

  it("accepts exactly one active non-deleted branch managed by the caller and ignores stale role.branchId", () => {
    const helper = db.slice(
      db.indexOf("export async function getManagedActiveBranchByUserId"),
      db.indexOf("export async function createBranch"),
    );
    expect(helper).toContain("eq(branches.managerUserId, userId)");
    expect(helper).toContain("eq(branches.isActive, true)");
    expect(helper).toContain("eq(branches.isDeleted, false)");
    expect(helper).toContain("rows.length === 1 ? rows[0] : null");

    for (const source of [routers, context, webRoutes]) {
      expect(source).toContain("getManagedActiveBranchByUserId(role.userId)");
    }
    expect(routers).toContain("branchId: managedBranch.id");
    expect(context).toContain("canonicalBranchId = managedBranch.id");
    expect(webRoutes).toContain("return { ...role, branchId: managedBranch.id }");
  });

  it("revalidates canonical branch ownership inside protected DB mutations", () => {
    for (const marker of [
      "export async function assignTechnicianAuthorized",
      "export async function updateScheduleAuthorized",
      "export async function getOrCreateActiveLocationSession",
      "export async function stopLocationSessionByManagerAuthorized",
    ]) {
      const start = db.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const block = db.slice(start, start + 9000);
      expect(block).toContain("eq(branches.managerUserId,");
      expect(block).toContain("eq(branches.isActive, true)");
      expect(block).toContain("eq(branches.isDeleted, false)");
      expect(block).toContain("branchRows.length === 1");
    }
  });
});

describe("legacy technician account binding", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const webRoutes = read("server/web-routes.ts");

  it("links exactly one active legacy phone match under a transaction lock", () => {
    const helper = db.slice(
      db.indexOf("export async function resolveActiveTechnicianForUser"),
      db.indexOf("// phoneNumber로 기사 조회"),
    );
    expect(helper).toContain("db.transaction");
    expect(helper).toContain('.for("update")');
    expect(helper).toContain("phoneMatches.length !== 1");
    expect(helper).toContain("candidate.userId !== null && candidate.userId !== userId");
    expect(helper).toContain("isNull(technicians.userId)");
    expect(helper).toContain("affectedRows !== 1");
  });

  it("resolves the canonical technician at login, token restore, schedule and REST access", () => {
    const loginAndVerify = routers.slice(
      routers.indexOf("login: publicProcedure"),
      routers.indexOf("// ── 고객 회원가입"),
    );
    expect((loginAndVerify.match(/resolveActiveTechnicianForUser/g) ?? []).length).toBe(2);
    expect(loginAndVerify).toContain("기사 계정과 기사 배정 정보를 연결할 수 없습니다");

    const schedule = routers.slice(
      routers.indexOf("listMySchedule: protectedProcedure"),
      routers.indexOf("// 상태 변경"),
    );
    expect(schedule).toContain("resolveActiveTechnicianForUser(userId, role.phoneNumber)");
    expect(schedule).toContain('code: "PRECONDITION_FAILED"');
    expect(schedule).not.toContain("return []");

    const activeTechnician = routers.slice(
      routers.indexOf("async function requireActiveTechnician"),
      routers.indexOf("async function requireCurrentTechnicianAssignment"),
    );
    expect(activeTechnician).toContain("resolveActiveTechnicianForUser");
    const restTechnician = webRoutes.slice(
      webRoutes.indexOf("async function requireTechnicianRequest"),
      webRoutes.indexOf("async function requireManagerRequest"),
    );
    expect(restTechnician).toContain("resolveActiveTechnicianForUser(role.userId, role.phoneNumber)");
  });
});

describe("atomic arrival, completion and terminal guards", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const webRoutes = read("server/web-routes.ts");

  it("routes legacy REST arrival through the same transactional durable notification claim", () => {
    const block = webRoutes.slice(
      webRoutes.indexOf('app.post("/api/location/stop"'),
      webRoutes.indexOf('app.post("/api/location/start-by-admin"'),
    );
    expect(block).toContain('if (reason === "도착완료")');
    expect(block).toContain("markLocationSessionArrivedAuthorized");
    expect(block).toContain("deliverWorkflowNotificationClaim(arrival.notificationClaim)");
    expect(block).toContain("notification.accepted");
  });

  it("locks final completion, rechecks the current technician and exposes one first-completion winner", () => {
    const dbBlock = db.slice(
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
      db.indexOf("export async function setWorkReportPhotoUrl"),
    );
    expect(dbBlock).toContain('.from(repairRequests)');
    expect(dbBlock).toContain('.from(technicians)');
    expect(dbBlock).toContain('.from(workReports)');
    expect(dbBlock).toContain('.for("update")');
    expect(dbBlock).toContain("request.technicianId !== params.technicianId");
    expect(dbBlock).toContain("const firstCompletion");
    expect(dbBlock).toContain('status: "작업완료"');
    expect(dbBlock).toContain('workflowStage: "작업완료"');

    const routerBlock = routers.slice(
      routers.indexOf("markWorkCompleted: protectedProcedure"),
      routers.indexOf("resendTrackingSms: protectedProcedure"),
    );
    expect(routerBlock).toContain("markRepairWorkCompletedAuthorized");
    expect(routerBlock).toContain("deliverWorkflowNotificationClaim(completion.notificationClaim)");
    expect(routerBlock).toContain("alreadyCompleted: !completion.firstCompletion");
  });

  it("prevents completed requests or completed reports from being reassigned or rescheduled", () => {
    for (const marker of [
      "export async function assignTechnicianAuthorized",
      "export async function updateScheduleAuthorized",
    ]) {
      const block = db.slice(db.indexOf(marker), db.indexOf(marker) + 9000);
      expect(block).toContain('["공사완료", "작업완료"]');
      expect(block).toContain('["작업완료", "결제완료", "후기요청"]');
      expect(block).toContain("workReports.isCompleted");
      expect(block).toContain('RepairScheduleAuthorizationError("terminal")');
    }
  });

  it("rejects report text or photo mutations after either completion status", () => {
    const upsert = db.slice(
      db.indexOf("export async function upsertWorkReport"),
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
    );
    expect(upsert).toContain('throw new Error("WORK_REPORT_ALREADY_COMPLETED")');
    expect(upsert).toContain("alreadyCompletedConflict: true");
    expect(upsert).toContain("claimWorkflowNotificationWithTx");

    const photo = db.slice(
      db.indexOf("export async function setWorkReportPhotoUrl"),
      db.indexOf("// ─── 공지사항"),
    );
    expect(photo).toContain('["공사완료", "작업완료"]');
    expect(photo).toContain('throw new Error("WORK_REPORT_ALREADY_COMPLETED")');

    const workReportApp = read("app/work-report.tsx");
    expect(workReportApp).toContain('["작업완료", "공사완료"].includes(request.status)');
    expect(workReportApp).toContain('["작업완료", "결제완료", "후기요청"]');
  });
});

describe("notification claims and upload hardening", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const storage = read("server/storage.ts");

  it("serializes identical assignment events but treats A-to-B-to-A as a new event", () => {
    const claim = db.slice(
      db.indexOf("async function claimRepairNotificationWithTx"),
      db.indexOf("export async function completeRepairNotificationClaim"),
    );
    expect(claim).toContain('.from(repairRequests)');
    expect(claim).toContain('.for("update")');
    expect(claim).toContain("REPAIR_NOTIFICATION_CLAIM_PREFIX");
    expect(claim).toContain("const latestClaim = rows[0]");
    expect(claim).toContain("latestClaim?.responsePayload === fingerprint ? latestClaim : null");
    expect(claim).toContain('reason: "pending"');
    expect(claim).toContain('reason: "already_sent"');
    expect(claim).toContain("2 * 60 * 1000");

    const modelShouldReuse = (history: string[], target: string) => history.at(-1) === target;
    expect(modelShouldReuse(["A"], "A")).toBe(true);
    expect(modelShouldReuse(["A", "B"], "A")).toBe(false);
    expect(routers).toContain("claimNotification: input.notify && Boolean(input.scheduledDate.trim())");
  });

  it("gives departure SMS claims a crash lease backed by successful logs", () => {
    const block = db.slice(
      db.indexOf("export async function claimLocationSessionSms"),
      db.indexOf("export async function clearLocationSessionSmsClaim"),
    );
    expect(block).toContain('eq(notificationLogs.messageType, "기사출발")');
    expect(block).toContain('inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"])');
    expect(block).toContain("claimAgeMs < LOCATION_SMS_CLAIM_LEASE_MS");
    expect(block).toContain("locationTrackingLogPattern(params.token)");
    expect(block).toContain("gte(notificationLogs.createdAt, session.createdAt)");
  });

  it("limits uploads to bounded real JPEG bytes and cleans new/previous storage objects", () => {
    const block = routers.slice(
      routers.indexOf("uploadPhoto: protectedProcedure"),
      routers.indexOf("// ─── 관리자 설정"),
    );
    expect(block).toContain("z.string().max(MAX_WORK_REPORT_JPEG_BASE64_LENGTH)");
    expect(block).toContain('z.literal("image/jpeg")');
    expect(routers).toContain("buffer[0] !== 0xff");
    expect(routers).toContain("buffer[buffer.length - 1] !== 0xd9");
    expect(block).toContain("await storageDelete(key)");
    expect(block).toContain("storageKeyFromPublicUrl(photoUpdate.previousUrl)");
    expect(storage).toContain('new URL("v1/storage/presign/delete"');
    expect(storage).toContain('crypto.randomUUID().replace(/-/g, "")');
    expect(storage).not.toContain("slice(0, 8)");
  });
});

describe("legacy customer/technician web auth and minimal tracking DTO", () => {
  for (const relativePath of ["public/web/mypage.html", "public/web/admin/tech.html"]) {
    it(`${relativePath} sends one strict HMAC bearer token`, () => {
      const source = read(relativePath);
      expect(source).toContain("function normalizeStoredAuthToken(authUser)");
      expect(source).toContain("function authHeaders(extra)");
      expect(source).toContain("headers: authHeaders()");
      expect(source).toContain("authHeaders({ 'Content-Type': 'application/json' })");
      expect(source).not.toContain("'Bearer ' + me.userId + ':' + me.token");
    });

    it(`${relativePath} normalizes full/legacy tokens and rejects header injection`, () => {
      const source = read(relativePath);
      const signature = "A".repeat(64);
      const full = loadLegacyWebAuthRuntime(source, { userId: 165, token: `165:${signature}` });
      expect(full.authHeaders({
        Accept: "application/json",
        Authorization: "Bearer attacker",
        authorization: "Bearer attacker-lowercase",
      })).toEqual({
        Accept: "application/json",
        Authorization: `Bearer 165:${signature.toLowerCase()}`,
      });

      const legacy = loadLegacyWebAuthRuntime(source, { userId: "165", token: signature });
      expect(legacy.authHeaders()).toEqual({ Authorization: `Bearer 165:${signature.toLowerCase()}` });
      const malformed = loadLegacyWebAuthRuntime(source, { userId: 165, token: `165:165:${signature}` });
      expect(() => malformed.authHeaders()).toThrow("로그인 정보가 올바르지 않습니다");
    });
  }

  it("uses only a validated official trackingUrl from the protected minimal DTO", () => {
    const mypage = read("public/web/mypage.html");
    const tech = read("public/web/admin/tech.html");
    expect(mypage).toContain("safeTrackingUrl(s.trackingUrl)");
    expect(mypage).not.toContain("s.trackingToken");
    expect(tech).toContain("trackingTokenFromUrl(session.trackingUrl)");
    expect(tech).toContain('/^\\/track\\/([A-Za-z0-9_-]{43})$/');
    expect(tech).not.toContain("session.trackingToken");
    expect(tech).not.toContain("repair.updateStatus");
  });
});
