import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("estimate conversion assignment notification", () => {
  const routers = read("server/routers.ts");
  const db = read("server/db.ts");
  const block = routers.slice(
    routers.indexOf("convertToOrderAndAssign: protectedProcedure"),
    routers.indexOf("// ─── 단가 관리"),
  );

  it("protects the conversion and handles orderId, recovered order, and new order branches", () => {
    expect(block).toContain("requireManagerCaller(ctx)");
    expect(block).toContain("let orderId = est.orderId ?? null");
    expect(block).toContain("db.findRepairByEstimateId(est.id)");
    expect(block).toContain("db.createRepairRequest");
    expect(block).toContain("db.updateEstimateById(est.id, { status: \"converted\", orderId })");
    expect(block).toContain("manager.appRole === \"branch_manager\"");
    expect(block).toContain("input.ownerId !== manager.branchId");
  });

  it("uses the canonical atomic assignment and common retrying delivery in every branch", () => {
    expect(block).toContain("db.assignTechnicianAuthorized");
    expect(block).toContain("callerUserId: manager.userId");
    expect(block).toContain("claimNotification: input.notify");
    expect(block).toContain("estimateScheduleNotification: { estimateId: est.id }");
    expect(block).toContain("deliverAssignmentNotification");
    expect(block).not.toContain("db.assignTechnician(");
    expect(block).not.toContain("notifyAndLog(");
    expect((block.match(/await db\.assignTechnicianAuthorized/g) ?? [])).toHaveLength(1);
    expect(block.indexOf("db.assignTechnicianAuthorized"))
      .toBeGreaterThan(block.indexOf("db.createRepairRequest"));
    expect(block).not.toContain("skipUnchanged");
    expect(block).not.toContain("scheduleAlreadyConfirmed");

    const common = routers.slice(
      routers.indexOf("async function deliverAssignmentNotification"),
      routers.indexOf("// 추측 불가능한 긴 일회용 위치코드"),
    );
    expect(common).toContain("assignment.notificationClaim");
    expect(common).toContain("notifyClaimedAndLog");
    expect(common).toContain("notificationRetried: claim.retried");
    expect(common).toContain("claim.retryMessageType ?? messageType");
    expect(common).toContain("claim.retryContent ?? message");
    expect(db).toContain("latestClaim?.responsePayload === fingerprint ? latestClaim : null");

    const assignment = db.slice(
      db.indexOf("export async function assignTechnicianAuthorized"),
      db.indexOf("// ─── 워크플로우 단계만 갱신"),
    );
    expect(assignment.indexOf("claimRepairNotificationWithTx"))
      .toBeLessThan(assignment.indexOf("if (!unchanged)"));
    const claim = db.slice(
      db.indexOf("async function claimRepairNotificationWithTx"),
      db.indexOf("export async function claimRepairNotification("),
    );
    expect(claim).toContain('existing?.result === "SUCCESS" || existing?.result === "REQUESTED"');
    expect(claim).toContain("if (existing)");
    expect(claim).toContain("retried: true");
    expect(claim).toContain("const retryMessageType = existing.content");
    expect(claim).toContain("const retryContent = existing.content ?? params.content");
    expect(claim).toContain("messageType: params.messageType");
    expect(claim).toContain("content: params.content");
    expect(claim).not.toContain('messageType: "발송선점"');
    expect(claim).not.toContain("content: null");
    expect(claim).toContain("latestClaim && !existing");
    expect(claim).toContain("latestClaim.errorMessage === REPAIR_NOTIFICATION_PENDING");
    expect(claim).toContain('throw new RepairScheduleAuthorizationError("delivery_pending")');
    expect(claim).toContain('errorMessage: "DELIVERY_LEASE_EXPIRED"');
    expect(claim.indexOf("latestClaim && !existing"))
      .toBeLessThan(claim.indexOf('existing?.result === "SUCCESS"'));
    expect(routers).toContain('error.reason === "delivery_pending"');
  });

  it("stores the exact assignment and schedule message in the durable claim transaction", () => {
    const assignment = db.slice(
      db.indexOf("export async function assignTechnicianAuthorized"),
      db.indexOf("// ─── 워크플로우 단계만 갱신"),
    );
    const schedule = db.slice(
      db.indexOf("export async function updateScheduleAuthorized"),
      db.indexOf("// ─── 일정 변경 (사유 기록)"),
    );
    for (const block of [assignment, schedule]) {
      expect(block).toContain("messageType: notificationMessageType");
      expect(block).toContain("content: notificationContent");
    }
    expect(schedule).toContain("params.changeReason");
  });

  it("reuses only an exact accepted estimate confirmation and retries failed or missing delivery", () => {
    expect(block).toContain("assignment.estimateNotificationClaim");
    expect(block).toContain("deliverEstimateScheduleNotificationClaim(");

    const assignment = db.slice(
      db.indexOf("export async function assignTechnicianAuthorized"),
      db.indexOf("// ─── 워크플로우 단계만 갱신"),
    );
    expect(assignment).toContain("usesExactEstimateSchedule");
    expect(assignment).toContain("estimate.visitDate?.trim()");
    expect(assignment).toContain("estimate.visitTime?.trim()");
    expect(assignment).toContain("claimEstimateScheduleNotificationWithTx");
    expect(assignment).toContain("claimRepairNotificationWithTx");
    expect(assignment).toContain("estimateNotificationClaim");
    expect(assignment).toContain("!scheduleChanged");
    expect(assignment).toContain("!technicianChanged");
    expect(assignment).toContain("!hasCurrentRepairTarget");

    const claim = db.slice(
      db.indexOf("async function claimEstimateScheduleNotificationWithTx"),
      db.indexOf("export async function confirmEstimateScheduleAuthorizedAndClaim"),
    );
    expect(claim).toContain("latest.linkUrl === fingerprint");
    expect(claim).toContain("latest.customerPhone === params.phoneNumber");
    expect(claim).toContain("latest.messageBody === content");
    expect(claim).toContain('exact.sendStatus === "SUCCESS" || exact.sendStatus === "REQUESTED"');
    expect(claim).toContain("if (exact)");
    expect(claim).toContain("retried: true");
    expect(claim).toContain("ESTIMATE_SCHEDULE_LEASE_MS");
    expect(claim).toContain("latestKind ?? params.noticeKind");
    expect(claim).toContain("ESTIMATE_SCHEDULE_CHANGED_TYPE");

    const shouldUseEstimate = (fixture: {
      scheduleChanged: boolean;
      technicianChanged: boolean;
      hasCurrentRepairTarget: boolean;
    }) => !fixture.scheduleChanged && !fixture.technicianChanged && !fixture.hasCurrentRepairTarget;
    expect(shouldUseEstimate({
      scheduleChanged: false,
      technicianChanged: false,
      hasCurrentRepairTarget: false,
    })).toBe(true); // 최초 A 변환 또는 estimate FAILED 재시도
    expect(shouldUseEstimate({
      scheduleChanged: true,
      technicianChanged: false,
      hasCurrentRepairTarget: false,
    })).toBe(false); // B→A 및 일정 비움→A 실제 변경
    expect(shouldUseEstimate({
      scheduleChanged: false,
      technicianChanged: false,
      hasCurrentRepairTarget: true,
    })).toBe(false); // B→A 변경 SMS 실패 후 같은 A 재시도
  });

  it("confirms schedule with manager auth, an atomic exact outbox and truthful delivery response", () => {
    const confirm = routers.slice(
      routers.indexOf("confirmSchedule: protectedProcedure"),
      routers.indexOf("// 곬적 승인 (고객)"),
    );
    expect(confirm).toContain("requireManagerCaller(ctx)");
    expect(confirm).toContain("db.confirmEstimateScheduleAuthorizedAndClaim");
    expect(confirm).toContain("deliverEstimateScheduleNotificationClaim");
    expect(confirm).toContain("scheduleSaved: true");
    expect(confirm).not.toContain("db.updateEstimateById");
    expect(confirm).not.toContain("try { await sendNotification");
    expect(confirm).not.toContain("010-3440-7310");

    const atomic = db.slice(
      db.indexOf("export async function confirmEstimateScheduleAuthorizedAndClaim"),
      db.indexOf("export async function claimConfirmedEstimateScheduleNotification"),
    );
    expect(atomic).toContain("db.transaction");
    expect(atomic).toContain(".from(estimates)");
    expect(atomic).toContain('.for("update")');
    expect(atomic).toContain("authorizeEstimateManagerWithTx");
    expect(atomic).toContain("claimEstimateScheduleNotificationWithTx");
    expect(atomic).toContain('const noticeKind = estimate.status === "schedule_confirmed"');
    expect(atomic.indexOf("claimEstimateScheduleNotificationWithTx"))
      .toBeLessThan(atomic.indexOf("tx.update(estimates)"));

    const notification = read("server/notification.ts");
    const builder = notification.slice(
      notification.indexOf("export function buildEstimateScheduleConfirmedMessage"),
      notification.indexOf("export function buildTechnicianReassignedMessage"),
    );
    expect(builder).toContain("031-8042-7310");
    expect(builder).not.toContain("010-3440-7310");
  });

  it("does not report FAILED/SKIPPED delivery as a fully successful conversion", () => {
    expect(block).toContain('notification.notificationResult === "SUCCESS"');
    expect(block).toContain('notification.notificationResult === "REQUESTED"');
    expect(block).toContain('notification.notificationSkipped === "already_sent"');
    expect(block).toContain("success: notificationAccepted");
    expect(block).toContain("assignmentSaved: true");
    expect(block).toContain("고객 안내에 실패했습니다. 다시 시도해 주세요.");
  });
});
