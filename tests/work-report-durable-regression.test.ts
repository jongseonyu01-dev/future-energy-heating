import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("atomic work report and revisit persistence", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const app = read("app/work-report.tsx");

  it("saves revisit state in the same upsertWorkReport transaction", () => {
    const block = db.slice(
      db.indexOf("export async function upsertWorkReport"),
      db.indexOf("export async function markRepairWorkCompletedAuthorized"),
    );
    expect(block).toContain("needsRevisit?: boolean");
    expect(block).toContain("return db.transaction");
    expect(block).toContain("needsRevisit: options.needsRevisit");
    expect(block).toContain("revisitReason: options.needsRevisit");
    expect(block).toContain("WORK_REPORT_REVISIT_COMPLETION_CONFLICT");
    expect(block).toContain("needsRevisit: false");
    expect(block).toContain("revisitReason: null");

    const save = routers.slice(
      routers.indexOf("save: protectedProcedure", routers.indexOf("workReport: router")),
      routers.indexOf("uploadPhoto: protectedProcedure"),
    );
    expect(save).toContain("needsRevisit: z.boolean().optional()");
    expect(save).toContain("revisitReason: z.string().trim().max(2000).optional()");
    expect(save).toContain("db.upsertWorkReport");
    expect(save).toContain("needsRevisit,");
    expect(save).toContain("revisitReason,");
  });

  it("awaits one report save and never shows success from a failed completion", () => {
    const completion = app.slice(
      app.indexOf("const handleComplete"),
      app.indexOf("if (requestLoading)"),
    );
    expect(completion).toContain("await completeMutation.mutateAsync");
    expect(completion.match(/completeMutation\.mutateAsync/g)).toHaveLength(1);
    expect(completion).not.toContain("revisitMutation");
    expect(completion).not.toContain("repair.setRevisit");
    expect(completion).toContain("catch {");
    expect(completion.indexOf("await completeMutation.mutateAsync"))
      .toBeLessThan(completion.lastIndexOf("Alert.alert("));
    expect(app).not.toContain("trpc.repair.setRevisit.useMutation");
  });
});

describe("legacy inspection/revisit authorization", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");

  it("protects both legacy mutations and rechecks the current technician in DB", () => {
    const inspectionRoute = routers.slice(
      routers.indexOf("updateInspectionResult: protectedProcedure"),
      routers.indexOf("updateEstimate: publicProcedure"),
    );
    expect(inspectionRoute).toContain("requireCurrentTechnicianAssignment(ctx, input.id)");
    expect(inspectionRoute).toContain("updateInspectionResultAuthorized");
    expect(inspectionRoute).toContain("inspectionResult: z.string().trim().min(1).max(5000)");

    const revisitRoute = routers.slice(
      routers.indexOf("setRevisit: protectedProcedure"),
      routers.indexOf("reassignBranch: publicProcedure"),
    );
    expect(revisitRoute).toContain("requireCurrentTechnicianAssignment(ctx, input.id)");
    expect(revisitRoute).toContain("setRepairRevisitAuthorized");
    expect(revisitRoute).toContain("revisitReason: z.string().trim().max(2000).optional()");

    for (const marker of [
      "export async function updateInspectionResultAuthorized",
      "export async function setRepairRevisitAuthorized",
    ]) {
      const block = db.slice(db.indexOf(marker), db.indexOf(marker) + 4800);
      expect(block).toContain("db.transaction");
      expect(block).toContain('.from(repairRequests)');
      expect(block).toContain('.from(technicians)');
      expect(block).toContain('.for("update")');
      expect(block).toContain("request.technicianId !== params.technicianId");
    }
  });

  it("stores inspection text without changing completion status", () => {
    const block = db.slice(
      db.indexOf("export async function updateInspectionResultAuthorized"),
      db.indexOf("export async function setRepairRevisitAuthorized"),
    );
    const update = block.slice(block.indexOf("await tx.update(repairRequests).set"));
    expect(update).toContain("inspectionResult: params.inspectionResult");
    expect(update).not.toContain('status: "작업완료"');
    expect(update).not.toContain('workflowStage: "작업완료"');
  });
});

describe("one report per request DB invariant", () => {
  const schema = read("drizzle/schema.ts");
  const migration = read("drizzle/0009_work_report_request_unique.sql");
  const snapshot = read("drizzle/meta/0009_snapshot.json");
  const journal = read("drizzle/meta/_journal.json");
  const db = read("server/db.ts");

  it("declares the unique key and a fail-closed duplicate precheck migration", () => {
    expect(schema).toContain('.unique("work_reports_request_id_unique")');
    expect(migration).toContain("SELECT `requestId`, COUNT(*) AS `duplicateCount`");
    expect(migration).toContain("HAVING COUNT(*) > 1");
    expect(migration).toContain("--> statement-breakpoint");
    expect(migration).toContain("ADD CONSTRAINT `work_reports_request_id_unique` UNIQUE (`requestId`)");
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(journal).toContain('"tag": "0009_work_report_request_unique"');
    expect(snapshot).toContain('"prevId": "dab49ce4-323c-4291-b2a7-4cd7f5e9f90b"');
    expect(snapshot).toContain('"work_reports_request_id_unique"');
  });

  it("recovers duplicate-key inserts by locking, validating and updating the winner", () => {
    expect(db).toContain('candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062');
    for (const [startMarker, endMarker] of [
      ["export async function upsertWorkReport", "export async function markRepairWorkCompletedAuthorized"],
      ["export async function setWorkReportPhotoUrl", "// ─── 공지사항"],
    ]) {
      const block = db.slice(db.indexOf(startMarker), db.indexOf(endMarker));
      expect(block).toContain("isDuplicateKeyError(error)");
      expect(block).toContain('.where(eq(workReports.requestId,');
      expect(block).toContain('.for("update")');
      expect(block).toContain("recoveredRows.length !== 1");
      expect(block).toContain("recoveredRows[0]");
      expect(block).toContain("WORK_REPORT_ASSIGNMENT_CHANGED");
      expect(block).toContain("tx.update(workReports)");
    }
  });
});

describe("durable arrival/completion notification outbox", () => {
  const db = read("server/db.ts");
  const routers = read("server/routers.ts");
  const webRoutes = read("server/web-routes.ts");
  const delivery = read("server/workflow-notification.ts");
  const notification = read("server/notification.ts");

  it("persists payload, verifies accepted logs, and reclaims failed/expired leases", () => {
    const claim = db.slice(
      db.indexOf("const WORKFLOW_NOTIFICATION_CLAIM_PREFIX"),
      db.indexOf("// ─── 누수센서"),
    );
    expect(claim).toContain("WORKFLOW_NOTIFICATION_LEASE_MS = 2 * 60 * 1000");
    expect(claim).toContain('inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"])');
    expect(claim).toContain('reason: "already_sent"');
    expect(claim).toContain('reason: "pending"');
    expect(claim).toContain("leaseAgeMs < WORKFLOW_NOTIFICATION_LEASE_MS");
    expect(claim).toContain("messageType: params.messageType");
    expect(claim).toContain("content: params.content");
    expect(claim).toContain("responsePayload: fingerprint");
    expect(claim).toContain("retried: true");
  });

  it("claims inside every state transaction and uses one delivery implementation", () => {
    for (const [startMarker, endMarker] of [
      ["export async function upsertWorkReport", "export async function markRepairWorkCompletedAuthorized"],
      ["export async function markRepairWorkCompletedAuthorized", "export async function setWorkReportPhotoUrl"],
      ["export async function markLocationSessionArrivedAuthorized", "// 만료된 세션 자동 처리"],
    ]) {
      const block = db.slice(db.indexOf(startMarker), db.indexOf(endMarker));
      expect(block).toContain("return db.transaction");
      expect(block).toContain("claimWorkflowNotificationWithTx(tx");
      expect(block).toContain("notificationClaim");
    }
    expect(routers).toContain("deliverWorkflowNotificationClaim(result.completion.notificationClaim)");
    expect(routers).toContain("deliverWorkflowNotificationClaim(arrival.notificationClaim)");
    expect(routers).toContain("deliverWorkflowNotificationClaim(completion.notificationClaim)");
    expect(webRoutes).toContain("deliverWorkflowNotificationClaim(arrival.notificationClaim)");
    expect(delivery).toContain("await completeRepairNotificationClaim");
    expect(delivery).toContain('result: "FAILED"');
    expect(delivery).toContain("accepted: false");
    expect(delivery).toContain("pending: true");
  });

  it("bounds Solapi requests with an abort timeout", () => {
    expect(notification).toContain("SMS_REQUEST_TIMEOUT_MS = 10_000");
    expect(notification).toContain("new AbortController()");
    expect(notification).toContain("signal: controller.signal");
    expect(notification).toContain("controller.abort()");
    expect(notification).toContain("clearTimeout(timeoutId)");
  });
});

describe("legacy schedule and browser regressions", () => {
  const db = read("server/db.ts");
  const dashboard = read("public/web/admin/dashboard.html");
  const branch = read("public/web/admin/branch.html");
  const webRoutes = read("server/web-routes.ts");

  it("migrates app_roles.id assignments only when no technician PK collides", () => {
    const block = db.slice(
      db.indexOf("async function migrateLegacyTechnicianAssignmentsWithTx"),
      db.indexOf("export async function resolveActiveTechnicianForUser"),
    );
    expect(block).toContain("role.id === technician.id");
    expect(block).toContain("eq(technicians.id, role.id)");
    expect(block).toContain("if (collisionRows[0]) return");
    expect(block).toContain("eq(repairRequests.technicianId, role.id)");
    expect(block).toContain("technicianId: technician.id");
    const resolver = db.slice(
      db.indexOf("export async function resolveActiveTechnicianForUser"),
      db.indexOf("// phoneNumber로 기사 조회"),
    );
    const fullTableLock = resolver.indexOf("const activeRows = await tx");
    const linkedFastPath = resolver.indexOf("if (linkedRows.length === 1)");
    expect(linkedFastPath).toBeGreaterThan(-1);
    expect(linkedFastPath).toBeLessThan(fullTableLock);
    expect(resolver.slice(linkedFastPath, fullTableLock)).toContain("return linkedRows[0]");
  });

  it("repairs exactly one strict manual technician duplicate without taking a full-table lock", () => {
    const helper = db.slice(
      db.indexOf("async function migrateUniqueManualTechnicianAssignmentsWithTx"),
      db.indexOf("export async function resolveActiveTechnicianForUser"),
    );
    expect(helper).toContain("REGEXP_REPLACE");
    expect(helper).toContain("eq(technicians.name, technician.name)");
    expect(helper).toContain("sameBranch");
    expect(helper).toContain("isNull(technicians.userId)");
    expect(helper).toContain(".limit(2)");
    expect(helper).toContain("if (legacyRows.length !== 1) return");
    expect(helper).not.toContain(".from(technicians)\n    .for");
    expect(helper).toContain("isNull(repairRequests.completedAt)");
    expect(helper).toContain("isNull(repairRequests.status)");
    expect(helper).toContain("isNull(repairRequests.workflowStage)");
    expect(helper).toContain("NOT IN ('작업완료', '공사완료')");
    expect(helper).toContain("eq(workReports.isCompleted, false)");
    expect(helper).toContain('eq(locationSessions.status, "이동중")');
    expect(helper).toContain("eq(locationConsents.isActive, true)");
    expect(helper).toContain("technicianId: technician.id");

    const resolver = db.slice(
      db.indexOf("export async function resolveActiveTechnicianForUser"),
      db.indexOf("// phoneNumber로 기사 조회"),
    );
    expect(resolver).toContain("migrateUniqueManualTechnicianAssignmentsWithTx(tx, linkedRows[0])");
  });

  it("uses the canonical dashboard auth helper everywhere", () => {
    expect(dashboard).not.toContain("buildAuthHeaders");
    expect(dashboard).not.toContain("sessionStorage.getItem('token')");
    expect(dashboard).toContain("authHeaders({ 'Content-Type': 'application/json' })");
  });

  it("does not expose the broken branch manual completion mutation", () => {
    expect(branch).not.toContain("completeRequest(");
    expect(branch).not.toContain("/repair.update");
    expect(branch).toContain("기사앱 완료보고 후 자동 반영");
  });

  it("returns ended sessions before attempting bearer owner verification", () => {
    const block = webRoutes.slice(
      webRoutes.indexOf('app.get("/api/location/session/:token"'),
      webRoutes.indexOf('app.post("/api/location/update"'),
    );
    expect(block.indexOf("getCustomerLocationSessionByToken"))
      .toBeLessThan(block.indexOf("requireTechnicianRequest(req)"));
    expect(block.indexOf("return res.status(410)"))
      .toBeLessThan(block.indexOf("requireTechnicianRequest(req)"));
  });
});
