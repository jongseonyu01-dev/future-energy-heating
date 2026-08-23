import { eq, desc, or, and, sql, like, isNull, inArray, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser,
  users,
  repairRequests,
  technicians,
  appSettings,
  notificationLogs,
  InsertRepairRequest,
  RepairRequest,
  Technician,
  InsertTechnician,
  InsertNotificationLog,
  flowRateSettings,
  flowRateLogs,
  flowRateAlertEvents,
  FlowRateSetting,
  InsertFlowRateSetting,
  InsertFlowRateLog,
  FlowRateAlertEvent,
  InsertFlowRateAlertEvent,
  priceItems,
  PriceItem,
  InsertPriceItem,
  jobOrders,
  JobOrder,
  InsertJobOrder,
  asRecords,
  AsRecord,
  InsertAsRecord,
  dailyReports,
  DailyReport,
  InsertDailyReport,
  codeSettings,
  CodeSetting,
  InsertCodeSetting,
  estimates,
  estimateMessageLogs,
} from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import {
  buildTechnicianArrivedMessage,
  buildTechnicianDepartedMessage,
  buildWorkCompletedMessage,
  buildEstimateScheduleConfirmedMessage,
  buildStatusChangeMessage,
  buildScheduleConfirmedMessage,
  buildTechnicianReassignedMessage,
  getScheduleNoticeKind,
} from "./notification.js";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;

/**
 * DATABASE_URL을 기반으로 TLS(SSL)가 적용된 mysql2 connection pool을 생성한다.
 * TiDB Cloud Starter는 TLS 연결이 필수이므로 ssl 옵션을 반드시 적용한다.
 * 연결 문자열에 ssl 파라미터가 있더라도, 명시적 ssl 객체를 우선 적용한다.
 */
export function buildSslOptions() {
  // TiDB Cloud Starter 등 TLS 필수 환경. 공인 CA 체인을 검증한다.
  return {
    minVersion: "TLSv1.2" as const,
    rejectUnauthorized: true,
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // 명시적 SSL 옵션을 적용한 mysql2 pool을 생성한후 drizzle에 전달.
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: buildSslOptions(),
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

// 서버 시작 시 branch_applications 테이블 자동 생성
let _branchTableEnsured = false;
export async function ensureBranchApplicationsTable() {
  if (_branchTableEnsured) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS branch_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        applicantName VARCHAR(50) NOT NULL,
        phoneNumber VARCHAR(20) NOT NULL,
        consultStatus ENUM('신규접수','연락완료','상담진행','보류','계약완료') NOT NULL DEFAULT '신규접수',
        adminMemo TEXT,
        privacyAgreed BOOLEAN NOT NULL DEFAULT false,
        applyChannel VARCHAR(50) DEFAULT 'web',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    _branchTableEnsured = true;
    console.log('[Database] branch_applications table ensured.');
  } catch (error) {
    console.warn('[Database] Failed to ensure branch_applications table:', error);
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── 접수번호 생성 ─────────────────────────────────────────────
function generateRequestNumber(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `FE-${ymd}-${rand}`;
}

// ─── 접수 생성 ─────────────────────────────────────────────────
export async function createRepairRequest(
  data: Omit<InsertRepairRequest, "requestNumber">
): Promise<{ id: number; requestNumber: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const requestNumber = generateRequestNumber();
  const result = await db
    .insert(repairRequests)
    .values({ ...data, requestNumber });
  return { id: (result as any)[0].insertId, requestNumber };
}

// ─── 접수 조회 (접수번호 또는 전화번호) ───────────────────────
export async function findRepairRequest(
  query: string
): Promise<RepairRequest[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(repairRequests)
    .where(
      or(
        eq(repairRequests.requestNumber, query),
        eq(repairRequests.phoneNumber, query)
      )
    )
    .orderBy(desc(repairRequests.createdAt));
}

// ─── 접수 단건 조회 ────────────────────────────────────────────
export async function getRepairRequestById(
  id: number
): Promise<RepairRequest | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(repairRequests)
    .where(eq(repairRequests.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ─── 전체 접수 목록 (관리자용) ─────────────────────────────────
export async function getAllRepairRequests(): Promise<RepairRequest[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(repairRequests)
    .orderBy(desc(repairRequests.createdAt));
}

// ─── 상태 변경 ─────────────────────────────────────────────────
export async function updateRepairStatus(
  id: number,
  status: RepairRequest["status"],
  adminMemo?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(repairRequests)
    .set({ status, ...(adminMemo !== undefined ? { adminMemo } : {}) })
    .where(eq(repairRequests.id, id));
}

export async function updateRepairStatusAuthorized(params: {
  id: number;
  status: RepairRequest["status"];
  adminMemo?: string;
  callerUserId: number;
  notify: boolean;
}): Promise<{
  request: RepairRequest;
  notificationClaim: WorkflowNotificationClaim | null;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const requestRows = await tx.select().from(repairRequests)
      .where(eq(repairRequests.id, params.id)).limit(1).for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      request.completedAt
    ) {
      throw new Error("WORK_REPORT_ALREADY_COMPLETED");
    }
    // 출발·도착·완료는 위치/작업보고 전용 mutation만 상태와 outbox를 함께 바꾼다.
    if (["출발", "도착", "공사완료", "작업완료"].includes(params.status)) {
      throw new Error("LEGACY_STATUS_DEDICATED_MUTATION_REQUIRED");
    }

    const callerRows = await tx.select().from(appRoles)
      .where(eq(appRoles.userId, params.callerUserId)).limit(1).for("update");
    const caller = callerRows[0];
    if (!caller || !caller.isActive) throw new Error("LEGACY_STATUS_FORBIDDEN");
    if (caller.appRole === "technician") {
      const technicianRows = await tx.select().from(technicians).where(and(
        eq(technicians.userId, params.callerUserId),
        eq(technicians.isActive, true),
        eq(technicians.isDeleted, false),
      )).limit(2).for("update");
      const technician = technicianRows.length === 1 ? technicianRows[0] : null;
      const allowedTechnicianStatuses: RepairRequest["status"][] = [
        "기사확인완료", "공사중", "작업진행중", "재방문필요",
      ];
      if (
        !technician || request.technicianId !== technician.id ||
        !allowedTechnicianStatuses.includes(params.status)
      ) {
        throw new Error("LEGACY_STATUS_FORBIDDEN");
      }
    } else if (caller.appRole === "branch_manager") {
      const branchRows = await tx.select({ id: branches.id }).from(branches).where(and(
        eq(branches.managerUserId, params.callerUserId),
        eq(branches.isActive, true),
        eq(branches.isDeleted, false),
      )).limit(2).for("update");
      if (branchRows.length !== 1 || request.branchId !== branchRows[0].id) {
        throw new Error("LEGACY_STATUS_FORBIDDEN");
      }
    } else if (caller.appRole !== "hq_admin") {
      throw new Error("LEGACY_STATUS_FORBIDDEN");
    }

    const messageType = `상태변경:${params.status}`;
    const content = buildStatusChangeMessage(
      request.customerName,
      request.requestNumber,
      params.status,
      request.technicianName,
      request.scheduledDate,
      request.scheduledTime,
    );
    const notificationClaim = params.notify
      ? await claimWorkflowNotificationWithTx(tx, {
          requestId: request.id,
          phoneNumber: request.phoneNumber,
          eventKey: JSON.stringify({ v: 1, type: "legacy_status", requestId: request.id, status: params.status }),
          messageType,
          content,
        })
      : null;
    await tx.update(repairRequests).set({
      status: params.status,
      ...(params.adminMemo !== undefined ? { adminMemo: params.adminMemo } : {}),
    }).where(eq(repairRequests.id, params.id));
    return { request, notificationClaim };
  });
}

// ─── 기사 배정 ─────────────────────────────────────────────────
export async function assignTechnician(
  id: number,
  technicianId: number,
  technicianName: string,
  scheduledDate?: string,
  scheduledTime?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(repairRequests)
    .set({
      technicianId,
      technicianName,
      status: "기사확인대기",
      workflowStage: scheduledDate && scheduledTime ? "일정확정" : "기사배정",
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(scheduledTime ? { scheduledTime } : {}),
    })
    .where(eq(repairRequests.id, id));
}

export class RepairScheduleAuthorizationError extends Error {
  constructor(public readonly reason:
    | "not_found"
    | "invalid_technician"
    | "forbidden"
    | "report_exists"
    | "terminal"
    | "delivery_pending"
  ) {
    super(`REPAIR_SCHEDULE_${reason.toUpperCase()}`);
    this.name = "RepairScheduleAuthorizationError";
  }
}

/** 관리자 권한, 지사 범위, 이전 일정 snapshot을 한 트랜잭션에서 확정한다. */
export async function assignTechnicianAuthorized(params: {
  id: number;
  technicianId: number;
  callerUserId: number;
  scheduledDate?: string;
  scheduledTime?: string;
  claimNotification?: boolean;
  estimateScheduleNotification?: { estimateId: number };
}): Promise<{
  request: RepairRequest;
  technicianName: string;
  previousTechnicianId: number | null;
  previousScheduledDate: string | null;
  previousScheduledTime: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  unchanged: boolean;
  notificationClaim: Awaited<ReturnType<typeof claimRepairNotificationWithTx>> | null;
  estimateNotificationClaim: EstimateScheduleNotificationClaim | null;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    // 견적 전환 경로는 confirmSchedule과 같은 잠금 순서(estimate 우선)를
    // 사용해 일정 상태·outbox 선택까지 한 transaction에 묶는다.
    const estimateRows = params.estimateScheduleNotification
      ? await tx.select().from(estimates)
          .where(eq(estimates.id, params.estimateScheduleNotification.estimateId))
          .limit(1).for("update")
      : [];
    const estimate = estimateRows[0] ?? null;
    if (params.estimateScheduleNotification && !estimate) {
      throw new RepairScheduleAuthorizationError("not_found");
    }
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.id))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new RepairScheduleAuthorizationError("not_found");

    const technicianRows = await tx
      .select()
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new RepairScheduleAuthorizationError("invalid_technician");
    }

    const callerRows = await tx
      .select()
      .from(appRoles)
      .where(eq(appRoles.userId, params.callerUserId))
      .limit(1)
      .for("update");
    const caller = callerRows[0];
    if (
      !caller ||
      !caller.isActive ||
      (caller.appRole !== "hq_admin" && caller.appRole !== "branch_manager")
    ) {
      throw new RepairScheduleAuthorizationError("forbidden");
    }
    if (caller.appRole === "branch_manager") {
      const branchRows = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(
          eq(branches.managerUserId, params.callerUserId),
          eq(branches.isActive, true),
          eq(branches.isDeleted, false),
        ))
        .limit(2)
        .for("update");
      const managedBranch = branchRows.length === 1 ? branchRows[0] : null;
      if (
        !managedBranch ||
        request.branchId !== managedBranch.id ||
        technician.branchId !== managedBranch.id ||
        Boolean(estimate && estimate.branchId !== null && estimate.branchId !== managedBranch.id)
      ) {
        throw new RepairScheduleAuthorizationError("forbidden");
      }
    }

    const reports = await tx
      .select({
        id: workReports.id,
        technicianId: workReports.technicianId,
        isCompleted: workReports.isCompleted,
      })
      .from(workReports)
      .where(eq(workReports.requestId, params.id))
      .limit(2)
      .for("update");
    const terminalRequest =
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt) ||
      Boolean(reports[0]?.isCompleted);
    if (terminalRequest) {
      throw new RepairScheduleAuthorizationError("terminal");
    }
    if (
      reports.length > 1 ||
      (reports[0] && (
        request.technicianId !== params.technicianId ||
        reports[0].technicianId !== params.technicianId
      ))
    ) {
      throw new RepairScheduleAuthorizationError("report_exists");
    }

    const normalizedDate = params.scheduledDate?.trim() || null;
    const normalizedTime = params.scheduledTime?.trim() || null;
    const scheduledDate = params.scheduledDate === undefined
      ? request.scheduledDate?.trim() || null
      : normalizedDate;
    const scheduledTime = params.scheduledTime === undefined
      ? request.scheduledTime?.trim() || null
      : normalizedTime;
    const previousScheduledDate = request.scheduledDate?.trim() || null;
    const previousScheduledTime = request.scheduledTime?.trim() || null;
    const unchanged =
      request.technicianId === params.technicianId &&
      previousScheduledDate === scheduledDate &&
      previousScheduledTime === scheduledTime;
    const assignmentEventKey = JSON.stringify({
      v: 1,
      requestId: request.id,
      technicianId: params.technicianId,
      scheduledDate,
      scheduledTime,
    });
    const latestRepairClaims = params.claimNotification
      ? await tx.select({ responsePayload: notificationLogs.responsePayload })
          .from(notificationLogs)
          .where(and(
            eq(notificationLogs.requestId, request.id),
            like(notificationLogs.responsePayload, `${REPAIR_NOTIFICATION_CLAIM_PREFIX}%`),
          ))
          .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
          .limit(1).for("update")
      : [];
    const hasCurrentRepairTarget = latestRepairClaims[0]?.responsePayload ===
      `${REPAIR_NOTIFICATION_CLAIM_PREFIX}${assignmentEventKey}`;
    const scheduleChanged =
      previousScheduledDate !== scheduledDate || previousScheduledTime !== scheduledTime;
    const technicianChanged =
      request.technicianId !== null && request.technicianId !== params.technicianId;
    const firstAssignment = request.technicianId === null;
    const sameTechnician = request.technicianId === params.technicianId;
    const scheduleNoticeKind = firstAssignment
      ? (scheduledDate ? "confirmed" : "none")
      : technicianChanged && scheduleChanged
        ? "changed"
        : sameTechnician
          ? getScheduleNoticeKind(
              previousScheduledDate,
              previousScheduledTime,
              scheduledDate,
              scheduledTime,
            )
          : "unchanged";
    const technicianReassigned = !firstAssignment && !sameTechnician;
    let notificationMessageType: string;
    let notificationContent: string;
    if (technicianReassigned) {
      notificationMessageType = scheduleChanged ? "일정변경" : "기사재배정";
      notificationContent = buildTechnicianReassignedMessage(
        request.customerName,
        technician.name,
        scheduledDate,
        scheduledTime,
        scheduleChanged,
      );
    } else if (scheduledDate) {
      notificationMessageType = scheduleNoticeKind === "changed"
        ? "일정변경"
        : "일정확정";
      notificationContent = buildScheduleConfirmedMessage(
        request.customerName,
        scheduledDate,
        scheduledTime ?? "",
        scheduleNoticeKind === "changed",
      );
    } else {
      notificationMessageType = "기사배정";
      notificationContent = buildStatusChangeMessage(
        request.customerName,
        request.requestNumber,
        "방문예정",
        technician.name,
      );
    }

    // 견적 확정 outbox는 변환 직후 최초 배정/동일 payload 재시도에만 쓴다.
    // 실제 일정·기사 변경 또는 그 실패 재시도는 repair 변경 outbox를 유지해
    // A→B→A 회귀가 과거 estimate A 성공에 의해 suppress되지 않게 한다.
    const usesExactEstimateSchedule = Boolean(
      params.claimNotification &&
      estimate &&
      scheduledDate &&
      !scheduleChanged &&
      !technicianChanged &&
      !hasCurrentRepairTarget &&
      ["schedule_confirmed", "converted"].includes(estimate.status) &&
      (estimate.visitDate?.trim() || null) === scheduledDate &&
      (estimate.visitTime?.trim() || null) === scheduledTime
    );
    const estimateNotificationClaim = usesExactEstimateSchedule && estimate
      ? await claimEstimateScheduleNotificationWithTx(tx, {
          estimateId: estimate.id,
          branchId: estimate.branchId ?? request.branchId ?? null,
          customerName: estimate.customerName ?? request.customerName,
          phoneNumber: estimate.customerPhone ?? request.phoneNumber,
          confirmedDate: scheduledDate!,
          confirmedTime: scheduledTime,
          senderId: params.callerUserId,
          noticeKind: "confirmed",
        })
      : null;
    const notificationClaim = params.claimNotification && !usesExactEstimateSchedule
      ? await claimRepairNotificationWithTx(tx, {
          requestId: request.id,
          phoneNumber: request.phoneNumber,
          eventKey: assignmentEventKey,
          messageType: notificationMessageType,
          content: notificationContent,
        })
      : null;

    if (!unchanged) {
      await tx.update(repairRequests).set({
        technicianId: params.technicianId,
        technicianName: technician.name,
        status: "기사확인대기",
        workflowStage: scheduledDate ? "일정확정" : "기사배정",
        ...(params.scheduledDate !== undefined ? { scheduledDate: normalizedDate } : {}),
        ...(params.scheduledTime !== undefined ? { scheduledTime: normalizedTime } : {}),
      }).where(eq(repairRequests.id, params.id));
    }

    return {
      request,
      technicianName: technician.name,
      previousTechnicianId: request.technicianId ?? null,
      previousScheduledDate,
      previousScheduledTime,
      scheduledDate,
      scheduledTime,
      unchanged,
      notificationClaim,
      estimateNotificationClaim,
    };
  });
}

// ─── 워크플로우 단계만 갱신 ───────────────────────────────────
export async function setWorkflowStage(
  id: number,
  stage: RepairRequest["workflowStage"]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(repairRequests)
    .set({ workflowStage: stage })
    .where(eq(repairRequests.id, id));
}

// ─── 방문 일정 변경 ────────────────────────────────────────────
export async function updateSchedule(
  id: number,
  scheduledDate: string,
  scheduledTime: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(repairRequests)
    .set({ scheduledDate, scheduledTime, workflowStage: "일정확정" })
    .where(eq(repairRequests.id, id));
}

export async function updateScheduleAuthorized(params: {
  id: number;
  callerUserId: number;
  scheduledDate: string;
  scheduledTime: string;
  changeReason?: string | null;
  claimNotification?: boolean;
}): Promise<{
  request: RepairRequest;
  previousScheduledDate: string | null;
  previousScheduledTime: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  unchanged: boolean;
  notificationClaim: Awaited<ReturnType<typeof claimRepairNotificationWithTx>> | null;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.id))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new RepairScheduleAuthorizationError("not_found");

    const callerRows = await tx
      .select()
      .from(appRoles)
      .where(eq(appRoles.userId, params.callerUserId))
      .limit(1)
      .for("update");
    const caller = callerRows[0];
    if (
      !caller ||
      !caller.isActive ||
      (caller.appRole !== "hq_admin" && caller.appRole !== "branch_manager")
    ) {
      throw new RepairScheduleAuthorizationError("forbidden");
    }
    if (caller.appRole === "branch_manager") {
      const branchRows = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(
          eq(branches.managerUserId, params.callerUserId),
          eq(branches.isActive, true),
          eq(branches.isDeleted, false),
        ))
        .limit(2)
        .for("update");
      const managedBranch = branchRows.length === 1 ? branchRows[0] : null;
      if (!managedBranch || request.branchId !== managedBranch.id) {
        throw new RepairScheduleAuthorizationError("forbidden");
      }
    }

    const reports = await tx
      .select({ id: workReports.id, isCompleted: workReports.isCompleted })
      .from(workReports)
      .where(eq(workReports.requestId, params.id))
      .limit(2)
      .for("update");
    const terminalRequest =
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt) ||
      Boolean(reports[0]?.isCompleted);
    if (reports.length > 1 || terminalRequest) {
      throw new RepairScheduleAuthorizationError("terminal");
    }

    const previousScheduledDate = request.scheduledDate?.trim() || null;
    const previousScheduledTime = request.scheduledTime?.trim() || null;
    const scheduledDate = params.scheduledDate.trim() || null;
    const scheduledTime = params.scheduledTime.trim() || null;
    const unchanged =
      previousScheduledDate === scheduledDate &&
      previousScheduledTime === scheduledTime;
    const noticeKind = getScheduleNoticeKind(
      previousScheduledDate,
      previousScheduledTime,
      scheduledDate,
      scheduledTime,
    );
    const notificationMessageType = noticeKind === "changed"
      ? "일정변경"
      : "일정확정";
    const notificationContent = buildScheduleConfirmedMessage(
      request.customerName,
      scheduledDate ?? "",
      scheduledTime ?? "",
      noticeKind === "changed",
      params.changeReason,
    );
    const notificationClaim = params.claimNotification
      ? await claimRepairNotificationWithTx(tx, {
          requestId: request.id,
          phoneNumber: request.phoneNumber,
          eventKey: JSON.stringify({
            v: 1,
            requestId: request.id,
            technicianId: request.technicianId ?? null,
            scheduledDate,
            scheduledTime,
          }),
          messageType: notificationMessageType,
          content: notificationContent,
        })
      : null;
    if (!unchanged || params.changeReason !== undefined) {
      await tx.update(repairRequests).set({
        scheduledDate,
        scheduledTime,
        workflowStage: scheduledDate ? "일정확정" : "기사배정",
        ...(params.changeReason !== undefined
          ? { scheduleChangeReason: params.changeReason?.trim() || null }
          : {}),
      }).where(eq(repairRequests.id, params.id));
    }
    return {
      request,
      previousScheduledDate,
      previousScheduledTime,
      scheduledDate,
      scheduledTime,
      unchanged,
      notificationClaim,
    };
  });
}

// ─── 일정 변경 (사유 기록) ────────────────────────────────────
export async function updateScheduleWithReason(
  id: number,
  scheduledDate: string,
  scheduledTime: string,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(repairRequests)
    .set({ scheduledDate, scheduledTime, scheduleChangeReason: reason, workflowStage: "일정확정" })
    .where(eq(repairRequests.id, id));
}

// ─── 점검 결과 등록 ────────────────────────────────────────────
// 이 레거시 입력은 결과 본문만 저장한다. 작업 완료 상태 전환은
// upsertWorkReport(workReport.save) 한 경로에서만 수행한다.
export async function updateInspectionResultAuthorized(params: {
  id: number;
  technicianId: number;
  inspectionResult: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.id))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (request.technicianId !== params.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const technicianRows = await tx
      .select({ isActive: technicians.isActive, isDeleted: technicians.isDeleted })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const terminal =
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt);
    if (terminal) throw new Error("WORK_REPORT_ALREADY_COMPLETED");

    await tx.update(repairRequests).set({
      inspectionResult: params.inspectionResult,
    }).where(and(
      eq(repairRequests.id, params.id),
      eq(repairRequests.technicianId, params.technicianId),
    ));
  });
}

/** 구버전 앱의 별도 재방문 API. 최신 앱은 workReport.save에 함께 저장한다. */
export async function setRepairRevisitAuthorized(params: {
  id: number;
  technicianId: number;
  needsRevisit: boolean;
  revisitReason?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.id))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (request.technicianId !== params.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const technicianRows = await tx
      .select({ isActive: technicians.isActive, isDeleted: technicians.isDeleted })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const terminal =
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt);
    if (terminal) throw new Error("WORK_REPORT_ALREADY_COMPLETED");

    await tx.update(repairRequests).set({
      needsRevisit: params.needsRevisit,
      revisitReason: params.needsRevisit
        ? params.revisitReason?.trim() || null
        : null,
    }).where(and(
      eq(repairRequests.id, params.id),
      eq(repairRequests.technicianId, params.technicianId),
    ));
  });
}

// ─── 기사 관리 ─────────────────────────────────────────────────
// 활성 기사 목록 (technicians 테이블 기준, app_roles에서 loginId 보조 조회)
export async function getActiveTechnicians(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: technicians.id,
      name: technicians.name,
      phoneNumber: technicians.phoneNumber,
      specialty: technicians.specialty,
      branchId: technicians.branchId,
      userId: technicians.userId,
      isActive: technicians.isActive,
      createdAt: technicians.createdAt,
    })
    .from(technicians)
    .where(and(eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
    .orderBy(technicians.name);
  // loginId 보조 조회
  const result: any[] = [];
  for (const t of rows) {
    let loginId: string | null = null;
    if (t.userId) {
      const role = await getAppRole(t.userId);
      loginId = role?.loginId ?? null;
    }
    result.push({ ...t, loginId });
  }
  return result;
}

// 전체 기사 목록 (관리자용 - 비활성 포함, technicians 테이블 기준)
export async function getAllTechnicians(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: technicians.id,
      name: technicians.name,
      phoneNumber: technicians.phoneNumber,
      specialty: technicians.specialty,
      branchId: technicians.branchId,
      userId: technicians.userId,
      isActive: technicians.isActive,
      createdAt: technicians.createdAt,
    })
    .from(technicians)
    .where(eq(technicians.isDeleted, false))
    .orderBy(technicians.name);
  // loginId 보조 조회
  const result: any[] = [];
  for (const t of rows) {
    let loginId: string | null = null;
    if (t.userId) {
      const role = await getAppRole(t.userId);
      loginId = role?.loginId ?? null;
    }
    result.push({ ...t, loginId });
  }
  return result;
}

// 기사 등록
export async function createTechnician(
  data: InsertTechnician
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(technicians).values(data);
  return { id: (result as any)[0].insertId };
}

// 기사 수정
export async function updateTechnician(
  id: number,
  data: Partial<Pick<Technician, "name" | "phoneNumber" | "specialty" | "isActive">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(technicians).set(data).where(eq(technicians.id, id));
}

// 기사 활성/비활성 토글
export async function setTechnicianActive(
  id: number,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(technicians)
    .set({ isActive })
    .where(eq(technicians.id, id));
}

// ─── 앱 설정 (key-value) ───────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.settingKey, key))
    .limit(1);
  return rows[0]?.settingValue ?? null;
}

export async function setSetting(
  key: string,
  value: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(appSettings)
    .values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

// 여러 설정 한번에 조회
export async function getSettings(
  keys: string[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = await getSetting(key);
  }
  return result;
}

// ─── 관리자 비밀번호 ───────────────────────────────────────────
export async function getAdminPassword(): Promise<string> {
  const stored = await getSetting("admin_password");
  // 설정이 없으면 기본값 반환
  return stored ?? "admin1234";
}

export async function verifyAdminPassword(
  password: string
): Promise<boolean> {
  const current = await getAdminPassword();
  return password === current;
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const isValid = await verifyAdminPassword(currentPassword);
  if (!isValid) {
    return { success: false, error: "현재 비밀번호가 일치하지 않습니다." };
  }
  if (newPassword.length < 4) {
    return { success: false, error: "새 비밀번호는 4자 이상이어야 합니다." };
  }
  await setSetting("admin_password", newPassword);
  return { success: true };
}

// ─── 알림 로그 ─────────────────────────────────────────────────
export async function createNotificationLog(
  data: InsertNotificationLog
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(notificationLogs).values(data);
  } catch (error) {
    console.error("[Database] Failed to log notification:", error);
  }
}

export async function getNotificationLogs(
  requestId?: number
): Promise<(typeof notificationLogs.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];

  if (requestId !== undefined) {
    return db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.requestId, requestId))
      .orderBy(desc(notificationLogs.createdAt));
  }
  return db
    .select()
    .from(notificationLogs)
    .orderBy(desc(notificationLogs.createdAt))
    .limit(100);
}

export async function getLatestNotificationLogByTypes(
  requestId: number,
  messageTypes: string[],
): Promise<(typeof notificationLogs.$inferSelect) | null> {
  const db = await getDb();
  if (!db || messageTypes.length === 0) return null;
  const rows = await db
    .select()
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, requestId),
      inArray(notificationLogs.messageType, messageTypes),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(1);
  return rows[0] ?? null;
}

const REPAIR_NOTIFICATION_CLAIM_PREFIX = "REPAIR_NOTIFICATION_CLAIM:";
const REPAIR_NOTIFICATION_PENDING = "DELIVERY_CLAIM_PENDING";
type RepairNotificationClaim =
  | {
      claimed: true;
      claimId: number;
      retried: boolean;
      retryMessageType?: string;
      retryContent?: string;
    }
  | { claimed: false; reason: "pending" | "already_sent" };

async function claimRepairNotificationWithTx(
  tx: any,
  params: {
    requestId: number;
    phoneNumber: string;
    eventKey: string;
    messageType: string;
    content: string;
  },
): Promise<RepairNotificationClaim> {
  const fingerprint = `${REPAIR_NOTIFICATION_CLAIM_PREFIX}${params.eventKey}`;
  const requests = await tx
    .select({ id: repairRequests.id, isDeleted: repairRequests.isDeleted })
    .from(repairRequests)
    .where(eq(repairRequests.id, params.requestId))
    .limit(1)
    .for("update");
  if (!requests[0] || requests[0].isDeleted) {
    throw new Error("REPAIR_NOTIFICATION_REQUEST_NOT_FOUND");
  }
  const rows = await tx
    .select()
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, params.requestId),
      like(notificationLogs.responsePayload, `${REPAIR_NOTIFICATION_CLAIM_PREFIX}%`),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(1)
    .for("update");
  // 왕복 변경(A→B→A)은 새 이벤트다. 오직 가장 최근 목표가 현재 fingerprint와
  // 같을 때만 성공/진행중/실패 상태를 재사용한다.
  const latestClaim = rows[0];
  const existing = latestClaim?.responsePayload === fingerprint ? latestClaim : null;
  const now = new Date();
  if (
    latestClaim && !existing &&
    latestClaim.errorMessage === REPAIR_NOTIFICATION_PENDING
  ) {
    const leaseStartedAt = latestClaim.sentAt ?? latestClaim.createdAt;
    const leaseAgeMs = Date.now() - new Date(leaseStartedAt).getTime();
    if (Number.isFinite(leaseAgeMs) && leaseAgeMs < 2 * 60 * 1000) {
      // 이전 날짜/기사 안내가 transaction 밖에서 발송 중인 동안 새 상태를
      // 커밋하면 두 문자가 역순 도착할 수 있으므로 호출 transaction을 중단한다.
      throw new RepairScheduleAuthorizationError("delivery_pending");
    }
    await tx.update(notificationLogs).set({
      result: "FAILED",
      errorMessage: "DELIVERY_LEASE_EXPIRED",
      sentAt: now,
    }).where(eq(notificationLogs.id, latestClaim.id));
  }
  if (existing?.result === "SUCCESS" || existing?.result === "REQUESTED") {
    return { claimed: false, reason: "already_sent" };
  }
  if (existing?.errorMessage === REPAIR_NOTIFICATION_PENDING) {
    const leaseStartedAt = existing.sentAt ?? existing.createdAt;
    const leaseAgeMs = Date.now() - new Date(leaseStartedAt).getTime();
    if (Number.isFinite(leaseAgeMs) && leaseAgeMs < 2 * 60 * 1000) {
      return { claimed: false, reason: "pending" };
    }
  }
  if (existing) {
    const retryMessageType = existing.content
      ? existing.messageType
      : params.messageType;
    const retryContent = existing.content ?? params.content;
    await tx.update(notificationLogs).set({
      messageType: retryMessageType,
      content: retryContent,
      result: "SKIPPED",
      errorMessage: REPAIR_NOTIFICATION_PENDING,
      sentAt: now,
    }).where(eq(notificationLogs.id, existing.id));
    return {
      claimed: true,
      claimId: existing.id,
      retried: true,
      // 재배정 실패 직후 같은 요청을 다시 누르면 DB의 현재 snapshot에는
      // "이전 기사"가 이미 사라진다. 최초 실패 때 저장한 정확한 문구를 다시
      // 사용해 일정확정 문자 등 다른 의미로 바뀌지 않게 한다.
      retryMessageType,
      retryContent,
    };
  }
  const result = await tx.insert(notificationLogs).values({
    requestId: params.requestId,
    phoneNumber: params.phoneNumber,
    channel: "SMS",
    // claim과 상태 변경은 같은 transaction에서 커밋된다. 네트워크 발송 전에
    // 프로세스가 종료돼도 재시도가 당시의 정확한 변경 문구를 복구할 수 있다.
    messageType: params.messageType,
    content: params.content,
    result: "SKIPPED",
    errorMessage: REPAIR_NOTIFICATION_PENDING,
    responsePayload: fingerprint,
    sentAt: now,
  });
  return {
    claimed: true,
    claimId: (result as any)[0].insertId,
    retried: false,
    retryMessageType: params.messageType,
    retryContent: params.content,
  };
}

/**
 * 동일한 배정/일정 결과에 대한 발송권을 접수 행 잠금 아래 선점한다.
 * 별도 스키마 없이 notification_logs.responsePayload를 결과 fingerprint로 사용한다.
 */
export async function claimRepairNotification(params: {
  requestId: number;
  phoneNumber: string;
  eventKey: string;
  messageType: string;
  content: string;
}): Promise<RepairNotificationClaim> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => claimRepairNotificationWithTx(tx, params));
}

export async function completeRepairNotificationClaim(params: {
  claimId: number;
  messageType: string;
  content: string;
  channel: "SMS" | "ALIMTALK";
  result: "SUCCESS" | "FAILED" | "SKIPPED" | "REQUESTED";
  errorMessage?: string;
  fallbackUsed: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notificationLogs).set({
    messageType: params.messageType,
    content: params.content,
    channel: params.channel,
    result: params.result,
    errorMessage: params.errorMessage ?? null,
    fallbackUsed: params.fallbackUsed,
    sentAt: new Date(),
  }).where(eq(notificationLogs.id, params.claimId));
}

const WORKFLOW_NOTIFICATION_CLAIM_PREFIX = "WORKFLOW_NOTIFICATION_CLAIM:";
const WORKFLOW_NOTIFICATION_PENDING = "DELIVERY_CLAIM_PENDING";
const WORKFLOW_NOTIFICATION_LEASE_MS = 2 * 60 * 1000;

export type WorkflowNotificationClaim =
  | {
      claimed: true;
      claimId: number;
      retried: boolean;
      phoneNumber: string;
      messageType: string;
      content: string;
    }
  | { claimed: false; reason: "pending" | "already_sent" | "cooldown" };

/**
 * 도착/완료 상태 변경과 같은 트랜잭션에서 durable outbox 행을 선점한다.
 * 이전 버전이 이미 남긴 성공/접수 로그도 확인하며, 실패했거나 2분 lease가
 * 만료된 행은 같은 claim을 다시 선점해 프로세스 중단 뒤에도 복구한다.
 */
async function claimWorkflowNotificationWithTx(
  tx: any,
  params: {
    requestId: number;
    phoneNumber: string;
    eventKey: string;
    messageType: string;
    content: string;
  },
): Promise<WorkflowNotificationClaim> {
  const fingerprint = `${WORKFLOW_NOTIFICATION_CLAIM_PREFIX}${params.eventKey}`;

  // 배포 전 즉시 발송 경로가 남긴 성공 로그가 있으면 새 outbox를 만들지 않는다.
  const successfulRows = await tx
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, params.requestId),
      eq(notificationLogs.messageType, params.messageType),
      inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"]),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(1)
    .for("update");
  if (successfulRows[0]) {
    return { claimed: false, reason: "already_sent" };
  }

  const rows = await tx
    .select()
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, params.requestId),
      eq(notificationLogs.responsePayload, fingerprint),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(2)
    .for("update");
  if (rows.length > 1) throw new Error("WORKFLOW_NOTIFICATION_DUPLICATE_CLAIM");
  const existing = rows[0];

  if (existing?.result === "SUCCESS" || existing?.result === "REQUESTED") {
    return { claimed: false, reason: "already_sent" };
  }
  if (existing?.errorMessage === WORKFLOW_NOTIFICATION_PENDING) {
    const leaseStartedAt = existing.sentAt ?? existing.createdAt;
    const leaseAgeMs = Date.now() - new Date(leaseStartedAt).getTime();
    if (Number.isFinite(leaseAgeMs) && leaseAgeMs < WORKFLOW_NOTIFICATION_LEASE_MS) {
      return { claimed: false, reason: "pending" };
    }
  }

  const now = new Date();
  if (existing) {
    const phoneNumber = existing.phoneNumber || params.phoneNumber;
    const messageType = existing.messageType || params.messageType;
    const content = existing.content || params.content;
    await tx.update(notificationLogs).set({
      phoneNumber,
      messageType,
      content,
      result: "SKIPPED",
      errorMessage: WORKFLOW_NOTIFICATION_PENDING,
      sentAt: now,
    }).where(eq(notificationLogs.id, existing.id));
    return {
      claimed: true,
      claimId: existing.id,
      retried: true,
      phoneNumber,
      messageType,
      content,
    };
  }

  const result = await tx.insert(notificationLogs).values({
    requestId: params.requestId,
    phoneNumber: params.phoneNumber,
    channel: "SMS",
    messageType: params.messageType,
    content: params.content,
    result: "SKIPPED",
    errorMessage: WORKFLOW_NOTIFICATION_PENDING,
    responsePayload: fingerprint,
    sentAt: now,
  });
  return {
    claimed: true,
    claimId: (result as any)[0].insertId,
    retried: false,
    phoneNumber: params.phoneNumber,
    messageType: params.messageType,
    content: params.content,
  };
}

// ─── 누수센서 ─────────────────────────────────────────────────
import {
  leakSensors,
  sensorEvents,
  LeakSensor,
  InsertLeakSensor,
  InsertSensorEvent,
} from "../drizzle/schema.js";

// 전체 센서 목록 (관리자용)
export async function getAllSensors(): Promise<LeakSensor[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leakSensors).orderBy(desc(leakSensors.updatedAt));
}

// 고객 센서 조회 (전화번호 기준)
export async function getSensorsByPhone(
  phoneNumber: string
): Promise<LeakSensor[]> {
  const db = await getDb();
  if (!db) return [];
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const all = await db.select().from(leakSensors);
  return all
    .filter((s) => s.phoneNumber.replace(/[^0-9]/g, "") === normalized)
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

// 센서 단건 조회 (id)
export async function getSensorById(id: number): Promise<LeakSensor | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(leakSensors)
    .where(eq(leakSensors.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// 센서 단건 조회 (sensorUid)
export async function getSensorByUid(
  sensorUid: string
): Promise<LeakSensor | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(leakSensors)
    .where(eq(leakSensors.sensorUid, sensorUid))
    .limit(1);
  return rows[0] ?? null;
}

// 센서 등록 (관리자/연동용)
export async function createSensor(
  data: InsertLeakSensor
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leakSensors).values(data);
  return { id: (result as any)[0].insertId };
}

// 센서 상태 업데이트 (테스트/웹훅 공통)
export async function updateSensorState(
  sensorUid: string,
  patch: Partial<
    Pick<
      LeakSensor,
      | "status"
      | "batteryLevel"
      | "lastCommAt"
      | "leakDetectedAt"
      | "isResolved"
    >
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(leakSensors)
    .set(patch)
    .where(eq(leakSensors.sensorUid, sensorUid));
}

// 센서 관리자 처리 (기사 배정/메모/완료)
export async function updateSensorAdmin(
  id: number,
  patch: Partial<
    Pick<
      LeakSensor,
      | "status"
      | "isResolved"
      | "technicianId"
      | "technicianName"
      | "adminMemo"
    >
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leakSensors).set(patch).where(eq(leakSensors.id, id));
}

// 센서 이벤트 기록
export async function createSensorEvent(
  data: InsertSensorEvent
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(sensorEvents).values(data);
  } catch (error) {
    console.error("[Database] Failed to log sensor event:", error);
  }
}

// 센서 이벤트 목록 (특정 센서)
export async function getSensorEvents(
  sensorUid: string
): Promise<(typeof sensorEvents.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sensorEvents)
    .where(eq(sensorEvents.sensorUid, sensorUid))
    .orderBy(desc(sensorEvents.createdAt))
    .limit(50);
}

// ─── 앱 권한 관리 ──────────────────────────────────────────────
import {
  appRoles,
  phoneVerifications,
  branches,
  regionMappings,
  workReports,
  notices,
  trainingMaterials,
  materialOrders,
  AppRole,
  InsertAppRole,
  PhoneVerification,
  InsertPhoneVerification,
  Branch,
  InsertBranch,
  WorkReport,
  InsertWorkReport,
  Notice,
  InsertNotice,
  TrainingMaterial,
  InsertTrainingMaterial,
  MaterialOrder,
  InsertMaterialOrder,
} from "../drizzle/schema.js";
// 앱 권한 조회 (userId 기준)
export async function getAppRole(userId: number): Promise<AppRole | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appRoles).where(eq(appRoles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// 앱 권한 생성/업데이트
export async function upsertAppRole(data: InsertAppRole): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(appRoles).values(data).onDuplicateKeyUpdate({
    set: {
      appRole: data.appRole,
      loginId: data.loginId,
      passwordHash: data.passwordHash,
      phoneNumber: data.phoneNumber,
      name: data.name,
      branchId: data.branchId,
      mustChangePassword: data.mustChangePassword,
      isActive: data.isActive,
    },
  });
}

// 부분 업데이트 (특정 userId의 일부 필드만 변경)
export async function updateAppRoleFields(
  userId: number,
  fields: Partial<Pick<InsertAppRole, "passwordHash" | "mustChangePassword" | "isActive" | "name" | "phoneNumber" | "branchId" | "appRole" | "loginId">>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appRoles).set(fields).where(eq(appRoles.userId, userId));
}

// loginId 중복 제외 phoneNumber로 계정 조회 (아이디 찾기용)
export async function getAppRolesByPhone(phoneNumber: string): Promise<AppRole[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appRoles).where(eq(appRoles.phoneNumber, phoneNumber));
}

// ─── 휴대폰 인증코드 관리 ──────────────────────────────────────
export async function createPhoneVerification(data: InsertPhoneVerification): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(phoneVerifications).values(data);
}

export async function getLatestPhoneVerification(
  phoneNumber: string,
  purpose: string,
): Promise<PhoneVerification | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(phoneVerifications)
    .where(and(eq(phoneVerifications.phoneNumber, phoneNumber), eq(phoneVerifications.purpose, purpose)))
    .orderBy(desc(phoneVerifications.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPhoneVerificationVerified(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(phoneVerifications).set({ verified: true }).where(eq(phoneVerifications.id, id));
}

// loginId로 앱 권한 조회 (비밀번호 로그인용)
export async function getAppRoleByLoginId(loginId: string): Promise<AppRole | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appRoles).where(eq(appRoles.loginId, loginId)).limit(1);
  return rows[0] ?? null;
}

// 전체 앱 권한 목록 (본사 관리자용)
export async function getAllAppRoles(): Promise<AppRole[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appRoles).orderBy(desc(appRoles.createdAt));
}

// ─── 지사 관리 ─────────────────────────────────────────────────
export async function getAllBranches(): Promise<Branch[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).orderBy(branches.name);
}

export async function getActiveBranches(): Promise<Branch[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.name);
}

export async function getBranchById(id: number): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * 지사장 권한의 기준 소속을 app_roles.branchId가 아닌 현재 branches.managerUserId에서 찾는다.
 * 활성·미삭제 지사가 정확히 하나일 때만 권한을 부여하여 전임자/stale branchId와
 * 한 계정의 중복 지사 연결을 모두 fail-closed 한다.
 */
export async function getManagedActiveBranchByUserId(userId: number): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(branches)
    .where(and(
      eq(branches.managerUserId, userId),
      eq(branches.isActive, true),
      eq(branches.isDeleted, false),
    ))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export async function createBranch(data: InsertBranch): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(branches).values(data);
  return { id: (result as any)[0].insertId };
}

export async function updateBranch(id: number, data: Partial<InsertBranch>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(branches).set(data).where(eq(branches.id, id));
}

// ─── 지역 자동 배정 ────────────────────────────────────────────
// 주소 문자열에서 담당 지사를 찾아 반환 (없으면 null = 본사)
// region_mappings 조회가 실패하더라도(테이블/DB 문제 등) 예외를 삼키고 null(본사)을 반환하여
// 고객 접수 자체가 절대 막히지 않도록 한다.
export async function findBranchByAddress(address: string): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const mappings = await db
      .select()
      .from(regionMappings)
      .orderBy(desc(regionMappings.priority));
    for (const mapping of mappings) {
      if (address.includes(mapping.keyword)) {
        try {
          const branch = await getBranchById(mapping.branchId);
          if (branch?.isActive) return branch;
        } catch (branchErr) {
          console.warn("[지역배정] 지사 조회 실패, 건너뜀:", branchErr);
        }
      }
    }
  } catch (error) {
    // region_mappings 테이블 미존재/연결 문제 등 - 본사 배정(null)으로 폴백
    console.warn("[지역배정] region_mappings 조회 실패, 본사 배정으로 폴백:", error);
    return null;
  }
  return null;
}

// 지역 매핑 목록 조회
export async function getRegionMappings() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(regionMappings).orderBy(desc(regionMappings.priority));
  } catch (error) {
    console.warn("[지역배정] region_mappings 목록 조회 실패, 빈 목록 반환:", error);
    return [];
  }
}

// 지역 매핑 추가
export async function addRegionMapping(branchId: number, keyword: string, priority: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(regionMappings).values({ branchId, keyword, priority });
}

// 지역 매핑 삭제
export async function deleteRegionMapping(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(regionMappings).where(eq(regionMappings.id, id));
}

// ─── 지사별 접수 조회 ──────────────────────────────────────────
export async function getRepairRequestsByBranch(branchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairRequests)
    .where(eq(repairRequests.branchId, branchId))
    .orderBy(desc(repairRequests.createdAt));
}

// 기사별 배정 접수 조회
export async function getRepairRequestsByTechnician(technicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairRequests)
    .where(eq(repairRequests.technicianId, technicianId))
    .orderBy(desc(repairRequests.createdAt));
}

// 여러 technicianId로 접수건 조회 (기사 중복 레코드 대응)
export async function getRepairRequestsByTechnicianIds(technicianIds: number[]) {
  const db = await getDb();
  if (!db || technicianIds.length === 0) return [];
  return db
    .select()
    .from(repairRequests)
    .where(inArray(repairRequests.technicianId, technicianIds))
    .orderBy(desc(repairRequests.createdAt));
}

// 접수 지사 재배정 (본사 관리자용)
export async function reassignBranch(requestId: number, branchId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests).set({ branchId }).where(eq(repairRequests.id, requestId));
}

// ─── 기사 지사별 조회 (technicians 테이블 기준) ──────────────────────────────────────────
export async function getTechniciansByBranch(branchId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: technicians.id,
      name: technicians.name,
      phoneNumber: technicians.phoneNumber,
      specialty: technicians.specialty,
      branchId: technicians.branchId,
      userId: technicians.userId,
      isActive: technicians.isActive,
      createdAt: technicians.createdAt,
    })
    .from(technicians)
    .where(and(eq(technicians.branchId, branchId), eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
    .orderBy(technicians.name);
  // loginId 보조 조회
  const result: any[] = [];
  for (const t of rows) {
    let loginId: string | null = null;
    if (t.userId) {
      const role = await getAppRole(t.userId);
      loginId = role?.loginId ?? null;
    }
    result.push({ ...t, loginId });
  }
  return result;
}

// userId로 기사 조회
export async function getTechnicianById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(technicians).where(eq(technicians.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getTechnicianByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(technicians).where(eq(technicians.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/**
 * 아주 초기 버전이 repair_requests.technicianId에 technicians.id 대신
 * app_roles.id를 저장한 자료를 canonical 기사 ID로 이관한다. 두 숫자가 다른
 * 실제 기사와 충돌하면 아무 것도 바꾸지 않아 타인 배정을 가져오지 않는다.
 */
async function migrateLegacyTechnicianAssignmentsWithTx(
  tx: any,
  userId: number,
  technician: Technician,
): Promise<void> {
  const roleRows = await tx
    .select()
    .from(appRoles)
    .where(eq(appRoles.userId, userId))
    .limit(2)
    .for("update");
  const role = roleRows.length === 1 ? roleRows[0] : null;
  if (!role || role.appRole !== "technician" || !role.isActive || role.id === technician.id) {
    return;
  }

  // 같은 숫자의 technicians 행이 하나라도 있으면 그 기사 배정일 수 있으므로
  // fail-closed 한다. 전체 기사 테이블을 잠그지 않고 PK 후보 한 행만 확인한다.
  const collisionRows = await tx
    .select({ id: technicians.id })
    .from(technicians)
    .where(eq(technicians.id, role.id))
    .limit(1)
    .for("update");
  if (collisionRows[0]) return;

  const legacyRequests = await tx
    .select({ id: repairRequests.id })
    .from(repairRequests)
    .where(eq(repairRequests.technicianId, role.id))
    .for("update");
  // 과거 부분 이관으로 request만 canonical이고 하위 자료가 legacy ID인 경우도
  // 복구한다. collision 부재를 확인했으므로 이 ID는 실제 다른 기사일 수 없다.
  await tx.update(workReports).set({ technicianId: technician.id })
    .where(eq(workReports.technicianId, role.id));
  await tx.update(locationSessions).set({ technicianId: technician.id })
    .where(eq(locationSessions.technicianId, role.id));
  if (legacyRequests.length > 0) {
    const requestIds = legacyRequests.map((row: { id: number }) => row.id);
    await tx.update(repairRequests).set({ technicianId: technician.id }).where(and(
      inArray(repairRequests.id, requestIds),
      eq(repairRequests.technicianId, role.id),
    ));
  }
  await tx.update(locationConsents).set({ technicianId: technician.id })
    .where(eq(locationConsents.technicianId, role.id));
}

/**
 * 관리자 화면에서 먼저 만든 userId-null 기사행과 앱 가입 때 생성된 canonical
 * 기사행이 따로 존재하는 구버전 자료를 수선한다. 전화번호·지사·이름이 모두
 * 같고 후보가 정확히 하나일 때만 현재 진행 자료를 옮긴다.
 */
async function migrateUniqueManualTechnicianAssignmentsWithTx(
  tx: any,
  technician: Technician,
): Promise<void> {
  const normalizedPhone = technician.phoneNumber?.replace(/[^0-9]/g, "") ?? "";
  if (normalizedPhone.length < 10) return;

  const sameBranch = technician.branchId === null
    ? isNull(technicians.branchId)
    : eq(technicians.branchId, technician.branchId);
  const legacyRows = await tx
    .select()
    .from(technicians)
    .where(and(
      isNull(technicians.userId),
      eq(technicians.isActive, true),
      eq(technicians.isDeleted, false),
      eq(technicians.name, technician.name),
      sameBranch,
      sql`${technicians.id} <> ${technician.id}`,
      sql`REGEXP_REPLACE(${technicians.phoneNumber}, '[^0-9]', '') = ${normalizedPhone}`,
    ))
    .limit(2)
    .for("update");
  // 이름·전화·지사가 같은 수기 행이 둘 이상이면 어느 행인지 추측하지 않는다.
  if (legacyRows.length !== 1) return;
  const legacy = legacyRows[0];

  const openRequests = await tx
    .select({ id: repairRequests.id })
    .from(repairRequests)
    .where(and(
      eq(repairRequests.isDeleted, false),
      isNull(repairRequests.completedAt),
      inArray(repairRequests.technicianId, [legacy.id, technician.id]),
      or(
        isNull(repairRequests.status),
        sql`${repairRequests.status} NOT IN ('작업완료', '공사완료')`,
      ),
      or(
        isNull(repairRequests.workflowStage),
        sql`${repairRequests.workflowStage} NOT IN ('작업완료', '결제완료', '후기요청')`,
      ),
    ))
    .for("update");
  const openRequestIds = openRequests.map((row: { id: number }) => row.id);

  if (openRequestIds.length > 0) {
    await tx.update(repairRequests).set({
      technicianId: technician.id,
      technicianName: technician.name,
    }).where(and(
      inArray(repairRequests.id, openRequestIds),
      eq(repairRequests.technicianId, legacy.id),
    ));
    await tx.update(workReports).set({ technicianId: technician.id }).where(and(
      inArray(workReports.requestId, openRequestIds),
      eq(workReports.technicianId, legacy.id),
      eq(workReports.isCompleted, false),
    ));
    await tx.update(locationSessions).set({ technicianId: technician.id }).where(and(
      inArray(locationSessions.requestId, openRequestIds),
      eq(locationSessions.technicianId, legacy.id),
      eq(locationSessions.status, "이동중"),
    ));
  }
  await tx.update(locationConsents).set({ technicianId: technician.id }).where(and(
    eq(locationConsents.technicianId, legacy.id),
    eq(locationConsents.isActive, true),
  ));
}

/**
 * 기사 앱 계정과 technicians 행의 명시적 연결을 확인한다.
 * 레거시 행에 userId가 없을 때만 정규화 전화번호가 유일하게 일치하는 활성 행을
 * 잠근 뒤 1회 연결하며, 중복 전화번호나 다른 계정에 연결된 행은 추측하지 않는다.
 */
export async function resolveActiveTechnicianForUser(
  userId: number,
  phoneNumber?: string | null,
): Promise<Technician | null> {
  const db = await getDb();
  if (!db) return null;
  return db.transaction(async (tx) => {
    const linkedRows = await tx
      .select()
      .from(technicians)
      .where(and(
        eq(technicians.userId, userId),
        eq(technicians.isActive, true),
        eq(technicians.isDeleted, false),
      ))
      .limit(2)
      .for("update");
    if (linkedRows.length === 1) {
      await migrateLegacyTechnicianAssignmentsWithTx(tx, userId, linkedRows[0]);
      await migrateUniqueManualTechnicianAssignmentsWithTx(tx, linkedRows[0]);
      return linkedRows[0];
    }
    if (linkedRows.length > 1) return null;

    const normalizedPhone = phoneNumber?.replace(/[^0-9]/g, "") ?? "";
    if (normalizedPhone.length < 10) return null;

    // userId 없는 레거시 행의 최초 연결에서만 실행되는 희소 경로다. 활성 기사 행을
    // 같은 transaction에서 잠가 동시 로그인이나 중복 전화번호 생성을 추측 연결하지 않는다.
    const activeRows = await tx
      .select()
      .from(technicians)
      .where(and(eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
      .for("update");
    const phoneMatches = activeRows.filter(
      (row) => row.phoneNumber?.replace(/[^0-9]/g, "") === normalizedPhone,
    );
    if (phoneMatches.length !== 1) return null;

    const candidate = phoneMatches[0];
    if (candidate.userId !== null && candidate.userId !== userId) return null;
    if (candidate.userId === userId) return candidate;

    const updateResult = await tx
      .update(technicians)
      .set({ userId })
      .where(and(
        eq(technicians.id, candidate.id),
        isNull(technicians.userId),
        eq(technicians.isActive, true),
        eq(technicians.isDeleted, false),
      ));
    const affectedRows = Number((updateResult as any)?.[0]?.affectedRows ?? 0);
    if (affectedRows !== 1) return null;
    const linked = { ...candidate, userId };
    await migrateLegacyTechnicianAssignmentsWithTx(tx, userId, linked);
    await migrateUniqueManualTechnicianAssignmentsWithTx(tx, linked);
    return linked;
  });
}

// phoneNumber로 기사 조회 (앱 가입 기사 매칭용 - userId 있는 것 우선)
export async function getTechnicianByPhone(phoneNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const rows = await db.select().from(technicians)
    .where(eq(technicians.isActive, true))
    .orderBy(desc(technicians.id));
  const withUserId = rows.filter((r: any) => r.userId !== null && r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
  if (withUserId.length > 0) return withUserId[0];
  const byPhone = rows.filter((r: any) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
  return byPhone[0] ?? null;
}

// phoneNumber로 기사 전체 조회 (중복 레코드 대응)
export async function getTechniciansByPhone(phoneNumber: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const rows = await db.select().from(technicians)
    .where(eq(technicians.isActive, true))
    .orderBy(desc(technicians.id));
  return rows.filter((r: any) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
}

// userId로 기사 조회 + 없으면 phoneNumber로 fallback
export async function getTechnicianByUserIdOrPhone(userId: number, phoneNumber?: string | null) {
  const byUserId = await getTechnicianByUserId(userId);
  if (byUserId) return byUserId;
  if (phoneNumber) return getTechnicianByPhone(phoneNumber);
  return null;
}

// technicians 레코드에 userId 연결 (최초 1회 업데이트)
export async function updateTechnicianUserId(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(technicians).set({ userId }).where(eq(technicians.id, id));
}

// ─── 작업 보고서 ───────────────────────────────────────────────
function isDuplicateKeyError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 2) return false;
  const candidate = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062) return true;
  return candidate.cause !== error && isDuplicateKeyError(candidate.cause, depth + 1);
}

export async function getWorkReportByRequestId(requestId: number): Promise<WorkReport | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(workReports).where(eq(workReports.requestId, requestId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertWorkReport(
  data: InsertWorkReport,
  options: {
    needsRevisit?: boolean;
    revisitReason?: string | null;
  } = {},
): Promise<{
  id: number | null;
  alreadyCompletedConflict: boolean;
  completion?: {
    request: RepairRequest;
    firstCompletion: boolean;
    notificationClaim: WorkflowNotificationClaim;
  };
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.isCompleted && options.needsRevisit) {
    throw new Error("WORK_REPORT_REVISIT_COMPLETION_CONFLICT");
  }
  return db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, data.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (request.technicianId !== data.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const technicianRows = await tx
      .select({ isActive: technicians.isActive, isDeleted: technicians.isDeleted })
      .from(technicians)
      .where(eq(technicians.id, data.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const rows = await tx
      .select()
      .from(workReports)
      .where(eq(workReports.requestId, data.requestId))
      .limit(2)
      .for("update");
    if (rows.length > 1) throw new Error("WORK_REPORT_DUPLICATE_REQUEST_ID");
    let existing = rows[0];
    if (existing && existing.technicianId !== data.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    const requestAlreadyCompleted =
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt);
    // 완료 뒤 일반 저장 payload는 성공처럼 버리지 않는다. 다만 완료 요청의
    // 재호출은 같은 트랜잭션에서 미발송 outbox를 복구한 뒤 라우터가 conflict로
    // 응답할 수 있도록 claim을 반환한다.
    if (existing?.isCompleted || requestAlreadyCompleted) {
      if (!data.isCompleted) throw new Error("WORK_REPORT_ALREADY_COMPLETED");
      const notificationClaim = await claimWorkflowNotificationWithTx(tx, {
        requestId: request.id,
        phoneNumber: request.phoneNumber,
        eventKey: JSON.stringify({
          v: 1,
          type: "work_completed",
          requestId: request.id,
          technicianId: data.technicianId,
        }),
        messageType: "작업완료",
        content: buildWorkCompletedMessage(request.customerName),
      });
      return {
        id: existing?.id ?? null,
        alreadyCompletedConflict: true,
        completion: { request, firstCompletion: false, notificationClaim },
      };
    }

    let reportId: number;
    if (existing) {
      await tx.update(workReports).set(data).where(eq(workReports.id, existing.id));
      reportId = existing.id;
    } else {
      try {
        const result = await tx.insert(workReports).values(data);
        reportId = (result as any)[0].insertId;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const recoveredRows = await tx
          .select()
          .from(workReports)
          .where(eq(workReports.requestId, data.requestId))
          .limit(2)
          .for("update");
        if (recoveredRows.length !== 1) {
          throw new Error("WORK_REPORT_DUPLICATE_REQUEST_ID");
        }
        existing = recoveredRows[0];
        if (existing.technicianId !== data.technicianId) {
          throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
        }
        if (existing.isCompleted) throw new Error("WORK_REPORT_ALREADY_COMPLETED");
        await tx.update(workReports).set(data).where(eq(workReports.id, existing.id));
        reportId = existing.id;
      }
    }

    if (!data.isCompleted) {
      if (options.needsRevisit !== undefined) {
        await tx.update(repairRequests).set({
          needsRevisit: options.needsRevisit,
          revisitReason: options.needsRevisit
            ? options.revisitReason?.trim() || null
            : null,
        }).where(and(
          eq(repairRequests.id, data.requestId),
          eq(repairRequests.technicianId, data.technicianId),
        ));
      }
      return { id: reportId, alreadyCompletedConflict: false };
    }

    await lockAndAssertLocationDeparturesSettledWithTx(
      tx,
      data.requestId,
      data.technicianId,
    );
    const completedAt = data.completedAt ?? new Date();
    await tx.update(repairRequests).set({
      status: "작업완료",
      workflowStage: "작업완료",
      completedAt,
      needsRevisit: false,
      revisitReason: null,
    }).where(and(
      eq(repairRequests.id, data.requestId),
      eq(repairRequests.technicianId, data.technicianId),
    ));
    await tx.update(locationSessions).set({
      status: "도착완료",
      arrivedAt: completedAt,
    } as Record<string, unknown>).where(and(
      eq(locationSessions.requestId, data.requestId),
      eq(locationSessions.technicianId, data.technicianId),
      eq(locationSessions.status, "이동중"),
    ));
    const notificationClaim = await claimWorkflowNotificationWithTx(tx, {
      requestId: request.id,
      phoneNumber: request.phoneNumber,
      eventKey: JSON.stringify({
        v: 1,
        type: "work_completed",
        requestId: request.id,
        technicianId: data.technicianId,
      }),
      messageType: "작업완료",
      content: buildWorkCompletedMessage(request.customerName),
    });
    return {
      id: reportId,
      alreadyCompletedConflict: false,
      completion: { request, firstCompletion: true, notificationClaim },
    };
  });
}

/**
 * 작업 완료 버튼의 최종 전환. 접수·기사·보고서를 잠근 뒤 현재 배정을 재검증하고,
 * 첫 완료 요청 하나만 firstCompletion=true를 받도록 한다.
 */
export async function markRepairWorkCompletedAuthorized(params: {
  requestId: number;
  technicianId: number;
  reviewUrl?: string | null;
}): Promise<{
  request: RepairRequest;
  firstCompletion: boolean;
  notificationClaim: WorkflowNotificationClaim;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (request.technicianId !== params.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }

    const technicianRows = await tx
      .select({ isActive: technicians.isActive, isDeleted: technicians.isDeleted })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }

    const reports = await tx
      .select()
      .from(workReports)
      .where(eq(workReports.requestId, params.requestId))
      .limit(2)
      .for("update");
    if (reports.length > 1) throw new Error("WORK_REPORT_DUPLICATE_REQUEST_ID");
    const report = reports[0];
    if (report && report.technicianId !== params.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }

    const firstCompletion = !(
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt) ||
      Boolean(report?.isCompleted)
    );
    await lockAndAssertLocationDeparturesSettledWithTx(
      tx,
      params.requestId,
      params.technicianId,
    );
    const now = new Date();
    if (firstCompletion) {
      if (report) {
        await tx.update(workReports).set({
          isCompleted: true,
          completedAt: report.completedAt ?? now,
        }).where(eq(workReports.id, report.id));
      }
      await tx.update(repairRequests).set({
        status: "작업완료",
        workflowStage: "작업완료",
        completedAt: request.completedAt ?? now,
        needsRevisit: false,
        revisitReason: null,
      }).where(and(
        eq(repairRequests.id, params.requestId),
        eq(repairRequests.technicianId, params.technicianId),
      ));
    }
    await tx.update(locationSessions).set({
      status: "도착완료",
      arrivedAt: now,
    } as Record<string, unknown>).where(and(
      eq(locationSessions.requestId, params.requestId),
      eq(locationSessions.technicianId, params.technicianId),
      eq(locationSessions.status, "이동중"),
    ));
    const notificationClaim = await claimWorkflowNotificationWithTx(tx, {
      requestId: request.id,
      phoneNumber: request.phoneNumber,
      eventKey: JSON.stringify({
        v: 1,
        type: "work_completed",
        requestId: request.id,
        technicianId: params.technicianId,
      }),
      messageType: "작업완료",
      content: buildWorkCompletedMessage(request.customerName, params.reviewUrl),
    });
    return { request, firstCompletion, notificationClaim };
  });
}

/**
 * 사진이 보고서 본문보다 먼저 올라와도 URL을 잃지 않도록 접수 행 잠금 안에서
 * 보고서 행을 만들거나 해당 사진 열만 갱신한다.
 */
export async function setWorkReportPhotoUrl(params: {
  requestId: number;
  technicianId: number;
  photoType: "before" | "after";
  url: string;
}): Promise<{ id: number; previousUrl: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    const requestRows = await tx
      .select({
        id: repairRequests.id,
        technicianId: repairRequests.technicianId,
        branchId: repairRequests.branchId,
        isDeleted: repairRequests.isDeleted,
        status: repairRequests.status,
        workflowStage: repairRequests.workflowStage,
        completedAt: repairRequests.completedAt,
      })
      .from(repairRequests)
      .where(eq(repairRequests.id, params.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("WORK_REPORT_REQUEST_NOT_FOUND");
    if (request.technicianId !== params.technicianId) {
      throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
    }
    if (
      ["공사완료", "작업완료"].includes(request.status) ||
      ["작업완료", "결제완료", "후기요청"].includes(request.workflowStage) ||
      Boolean(request.completedAt)
    ) {
      throw new Error("WORK_REPORT_ALREADY_COMPLETED");
    }

    const rows = await tx
      .select()
      .from(workReports)
      .where(eq(workReports.requestId, params.requestId))
      .limit(2)
      .for("update");
    if (rows.length > 1) throw new Error("WORK_REPORT_DUPLICATE_REQUEST_ID");

    const existing = rows[0];
    const field = params.photoType === "before" ? "beforePhotoUrl" : "afterPhotoUrl";
    const previousUrl = existing?.[field] ?? null;
    if (existing) {
      if (existing.technicianId !== params.technicianId) {
        throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
      }
      await tx
        .update(workReports)
        .set({ [field]: params.url })
        .where(eq(workReports.id, existing.id));
      return { id: existing.id, previousUrl };
    }

    try {
      const result = await tx.insert(workReports).values({
        requestId: params.requestId,
        technicianId: params.technicianId,
        [field]: params.url,
      });
      return { id: (result as any)[0].insertId, previousUrl };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const recoveredRows = await tx
        .select()
        .from(workReports)
        .where(eq(workReports.requestId, params.requestId))
        .limit(2)
        .for("update");
      if (recoveredRows.length !== 1) {
        throw new Error("WORK_REPORT_DUPLICATE_REQUEST_ID");
      }
      const recovered = recoveredRows[0];
      if (recovered.technicianId !== params.technicianId) {
        throw new Error("WORK_REPORT_ASSIGNMENT_CHANGED");
      }
      if (recovered.isCompleted) throw new Error("WORK_REPORT_ALREADY_COMPLETED");
      const recoveredPreviousUrl = recovered[field] ?? null;
      await tx.update(workReports).set({ [field]: params.url })
        .where(eq(workReports.id, recovered.id));
      return { id: recovered.id, previousUrl: recoveredPreviousUrl };
    }
  });
}

// ─── 공지사항 ──────────────────────────────────────────────────
export async function getNotices(branchId?: number): Promise<Notice[]> {
  const db = await getDb();
  if (!db) return [];
  // 전체 공지 + 해당 지사 공지
  const all = await db.select().from(notices).orderBy(desc(notices.isPinned), desc(notices.createdAt)).limit(50);
  if (branchId === undefined) return all;
  return all.filter(n => n.targetBranchId === null || n.targetBranchId === branchId);
}

export async function createNotice(data: InsertNotice): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notices).values(data);
  return { id: (result as any)[0].insertId };
}

// ─── 교육 자료 ─────────────────────────────────────────────────
export async function getTrainingMaterials(): Promise<TrainingMaterial[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trainingMaterials).orderBy(desc(trainingMaterials.createdAt));
}

export async function createTrainingMaterial(data: InsertTrainingMaterial): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(trainingMaterials).values(data);
  return { id: (result as any)[0].insertId };
}

// ─── 자재 주문 ─────────────────────────────────────────────────
export async function getMaterialOrders(branchId?: number): Promise<MaterialOrder[]> {
  const db = await getDb();
  if (!db) return [];
  if (branchId !== undefined) {
    return db.select().from(materialOrders).where(eq(materialOrders.branchId, branchId)).orderBy(desc(materialOrders.createdAt));
  }
  return db.select().from(materialOrders).orderBy(desc(materialOrders.createdAt));
}

export async function createMaterialOrder(data: InsertMaterialOrder): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(materialOrders).values(data);
  return { id: (result as any)[0].insertId };
}

export async function updateMaterialOrderStatus(id: number, status: MaterialOrder["status"], approvedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(materialOrders).set({ status, ...(approvedBy ? { approvedBy } : {}) }).where(eq(materialOrders.id, id));
}

// ─── 지사별 누수센서 조회 ──────────────────────────────────────
export async function getSensorsByBranch(branchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leakSensors).where(eq(leakSensors.branchId, branchId)).orderBy(desc(leakSensors.updatedAt));
}

// ─── 통계 (지사별 매출/실적) ───────────────────────────────────
export async function getBranchStats(branchId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, pending: 0, revisit: 0 };
  let query = db.select().from(repairRequests);
  const all = branchId
    ? await query.where(eq(repairRequests.branchId, branchId))
    : await query;
  return {
    total: all.length,
    completed: all.filter(r => r.status === "작업완료").length,
    pending: all.filter(r => !["작업완료"].includes(r.status)).length,
    revisit: all.filter(r => r.needsRevisit).length,
  };
}

// ─── 세대별 유량 설정 CRUD ────────────────────────────────────────────────
export async function getAllFlowRateSettings(): Promise<FlowRateSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flowRateSettings).orderBy(flowRateSettings.apartmentName, flowRateSettings.buildingNumber, flowRateSettings.roomNumber);
}

export async function getFlowRateSettingById(id: number): Promise<FlowRateSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(flowRateSettings).where(eq(flowRateSettings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getFlowRateSettingBySensorId(sensorId: string): Promise<FlowRateSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(flowRateSettings).where(eq(flowRateSettings.sensorId, sensorId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertFlowRateSetting(data: InsertFlowRateSetting): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(flowRateSettings).values(data).onDuplicateKeyUpdate({
    set: {
      branchId: data.branchId,
      apartmentName: data.apartmentName,
      buildingNumber: data.buildingNumber,
      roomNumber: data.roomNumber,
      baseFlowRateLpm: data.baseFlowRateLpm,
      warningRangePercent: data.warningRangePercent,
      cautionRangePercent: data.cautionRangePercent,
      alertDurationMinutes: data.alertDurationMinutes,
    },
  });
}

export async function updateFlowRateSetting(
  id: number,
  data: Partial<Pick<FlowRateSetting, "baseFlowRateLpm" | "warningRangePercent" | "cautionRangePercent" | "alertDurationMinutes" | "apartmentName" | "buildingNumber" | "roomNumber" | "branchId" | "customerId" | "notifyPhone" | "inspectionStatus" | "inspectionMemo">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(flowRateSettings).set(data as Record<string, unknown>).where(eq(flowRateSettings.id, id));
}

export async function updateFlowRateLastData(
  sensorId: string,
  data: {
    lastFlowRateLpm: string;
    lastSupplyPressure?: string | null;
    lastReturnPressure?: string | null;
    lastDifferentialPressure?: string | null;
    lastMeasuredAt: Date;
    lastStatus: "정상" | "주의" | "경고" | "저유량 확인 필요" | "고유량 이상" | "통신 끊김" | "안정화 중" | "정지";
    alertStartedAt?: Date | null;
    alertSentAt?: Date | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(flowRateSettings).set(data as Record<string, unknown>).where(eq(flowRateSettings.sensorId, sensorId));
}

export async function deleteFlowRateSetting(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(flowRateSettings).where(eq(flowRateSettings.id, id));
}

// ─── 유량 로그 ────────────────────────────────────────────────────────────
export async function createFlowRateLog(data: InsertFlowRateLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(flowRateLogs).values(data);
}

export async function getFlowRateLogs(sensorId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flowRateLogs)
    .where(eq(flowRateLogs.sensorId, sensorId))
    .orderBy(desc(flowRateLogs.measuredAt))
    .limit(limit);
}

export async function getRecentFlowRateLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flowRateLogs)
    .orderBy(desc(flowRateLogs.measuredAt))
    .limit(limit);
}

// 역할별 앱 권한 목록 조회 (SMS 발송 대상자 조회용)
export async function getAppRolesByRole(role: "hq_admin" | "branch_manager" | "technician" | "customer"): Promise<AppRole[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appRoles).where(and(eq(appRoles.appRole, role), eq(appRoles.isActive, true)));
}

// ─── 위치 추적 세션 ────────────────────────────────────────────────────────
import { locationSessions, locationConsents, LocationSession, InsertLocationSession } from "../drizzle/schema.js";

const LOCATION_SMS_CLAIM_LEASE_MS = 2 * 60 * 1000;

export function isLocationDepartureDeliveryPending(params: {
  smsSentAt: Date | string | null;
  accepted: boolean;
  nowMs?: number;
}): boolean {
  if (!params.smsSentAt || params.accepted) return false;
  const claimAgeMs = (params.nowMs ?? Date.now()) - new Date(params.smsSentAt).getTime();
  return Number.isFinite(claimAgeMs) && claimAgeMs < LOCATION_SMS_CLAIM_LEASE_MS;
}

function locationTrackingLogPattern(token: string): string {
  // trackingToken은 base64url이지만 LIKE의 '_'도 wildcard이므로 함께 escape한다.
  const escaped = token.replace(/[\\%_]/g, "\\$&");
  return `%/track/${escaped}%`;
}

async function assertLocationDepartureDeliverySettledWithTx(
  tx: any,
  session: Pick<LocationSession, "id" | "requestId" | "trackingToken" | "smsSentAt" | "createdAt">,
): Promise<void> {
  if (!session.smsSentAt) return;
  const acceptedRows = await tx
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, session.requestId),
      eq(notificationLogs.messageType, "기사출발"),
      inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"]),
      like(notificationLogs.content, locationTrackingLogPattern(session.trackingToken)),
      gte(notificationLogs.createdAt, session.createdAt),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(1);
  if (acceptedRows[0]) return;
  if (isLocationDepartureDeliveryPending({
    smsSentAt: session.smsSentAt,
    accepted: false,
  })) {
    throw new Error("LOCATION_DELIVERY_PENDING");
  }
}

async function lockAndAssertLocationDeparturesSettledWithTx(
  tx: any,
  requestId: number,
  technicianId: number,
): Promise<void> {
  const sessions = await tx
    .select()
    .from(locationSessions)
    .where(and(
      eq(locationSessions.requestId, requestId),
      eq(locationSessions.technicianId, technicianId),
      eq(locationSessions.status, "이동중"),
    ))
    .orderBy(desc(locationSessions.createdAt), desc(locationSessions.id))
    .for("update");
  for (const session of sessions) {
    await assertLocationDepartureDeliverySettledWithTx(tx, session);
  }
}

export async function createLocationSession(data: InsertLocationSession): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(locationSessions).values(data);
  const rows = await db.select().from(locationSessions)
    .where(eq(locationSessions.trackingToken, data.trackingToken))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 접수 행을 잠근 상태에서 유효한 이동 세션을 재사용하거나 정확히 하나만 만든다.
 * 서버 인스턴스가 동시에 출발 요청을 받아도 고객 링크와 문자가 중복되지 않는다.
 */
export async function getOrCreateActiveLocationSession(
  data: InsertLocationSession,
  authorization?: { managerUserId: number },
): Promise<{ session: LocationSession; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    // 같은 접수 또는 같은 기사로 들어오는 동시 출발을 모두 직렬화한다.
    // 잠금 순서는 항상 접수 -> 기사로 고정해 교착 가능성을 줄인다.
    const requestRows = await tx
      .select({
        id: repairRequests.id,
        technicianId: repairRequests.technicianId,
        branchId: repairRequests.branchId,
        status: repairRequests.status,
        workflowStage: repairRequests.workflowStage,
        isDeleted: repairRequests.isDeleted,
      })
      .from(repairRequests)
      .where(eq(repairRequests.id, data.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("LOCATION_REQUEST_NOT_FOUND");

    const technicianRows = await tx
      .select({
        id: technicians.id,
        branchId: technicians.branchId,
        isActive: technicians.isActive,
        isDeleted: technicians.isDeleted,
      })
      .from(technicians)
      .where(eq(technicians.id, data.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("LOCATION_TECHNICIAN_NOT_ACTIVE");
    }
    if (request.technicianId !== data.technicianId) {
      throw new Error("LOCATION_ASSIGNMENT_CHANGED");
    }
    if (authorization) {
      const callerRows = await tx
        .select()
        .from(appRoles)
        .where(eq(appRoles.userId, authorization.managerUserId))
        .limit(1)
        .for("update");
      const caller = callerRows[0];
      if (
        !caller ||
        !caller.isActive ||
        (caller.appRole !== "hq_admin" && caller.appRole !== "branch_manager")
      ) {
        throw new Error("LOCATION_MANAGER_FORBIDDEN");
      }
      if (caller.appRole === "branch_manager") {
        const branchRows = await tx
          .select({ id: branches.id })
          .from(branches)
          .where(and(
            eq(branches.managerUserId, authorization.managerUserId),
            eq(branches.isActive, true),
            eq(branches.isDeleted, false),
          ))
          .limit(2)
          .for("update");
        const managedBranch = branchRows.length === 1 ? branchRows[0] : null;
        if (
          !managedBranch ||
          request.branchId !== managedBranch.id ||
          technician.branchId !== managedBranch.id
        ) {
          throw new Error("LOCATION_MANAGER_FORBIDDEN");
        }
      }
    }
    const arrivedOrCompleted = [
      "도착",
      "공사중",
      "작업진행중",
      "공사완료",
      "작업완료",
    ].includes(request.status) || [
      "기사도착",
      "작업진행",
      "작업완료",
      "결제완료",
      "후기요청",
    ].includes(request.workflowStage);
    if (arrivedOrCompleted) throw new Error("LOCATION_ALREADY_ARRIVED");

    const activeRows = await tx
      .select()
      .from(locationSessions)
      .where(and(
        or(
          eq(locationSessions.requestId, data.requestId),
          eq(locationSessions.technicianId, data.technicianId),
        ),
        eq(locationSessions.status, "이동중"),
      ))
      .orderBy(desc(locationSessions.createdAt))
      .for("update");

    const now = Date.now();
    let reusable: LocationSession | null = null;
    for (const row of activeRows) {
      const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
      const isExpired = Boolean(expiresAt && expiresAt <= now);
      if (
        !reusable &&
        !isExpired &&
        row.requestId === data.requestId &&
        row.technicianId === data.technicianId
      ) {
        reusable = row;
        continue;
      }
      // A 출발 claim 직후 B 출발이 A를 취소하면, A의 네트워크 발송이 끝나며
      // 이미 취소된 링크가 고객에게 늦게 도착할 수 있다. 아직 lease 안의 claim은
      // 정확한 token 성공 로그가 생기기 전까지 다른 세션으로 전환하지 않는다.
      if (!isExpired && row.smsSentAt) {
        const acceptedRows = await tx
          .select({ id: notificationLogs.id })
          .from(notificationLogs)
          .where(and(
            eq(notificationLogs.requestId, row.requestId),
            eq(notificationLogs.messageType, "기사출발"),
            inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"]),
            like(notificationLogs.content, locationTrackingLogPattern(row.trackingToken)),
            gte(notificationLogs.createdAt, row.createdAt),
          ))
          .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
          .limit(1);
        const claimAgeMs = now - new Date(row.smsSentAt).getTime();
        if (
          !acceptedRows[0] &&
          Number.isFinite(claimAgeMs) &&
          claimAgeMs < LOCATION_SMS_CLAIM_LEASE_MS
        ) {
          throw new Error("LOCATION_DELIVERY_PENDING");
        }
      }
      await tx
        .update(locationSessions)
        .set({
          status: isExpired ? "만료" : "업무취소",
          ...(isExpired ? {} : { cancelledAt: new Date() }),
        } as Record<string, unknown>)
        .where(eq(locationSessions.id, row.id));
    }

    if (reusable) {
      await tx.update(repairRequests).set({
        status: "출발",
        workflowStage: "기사출발",
      }).where(and(
        eq(repairRequests.id, data.requestId),
        eq(repairRequests.technicianId, data.technicianId),
      ));
      return { session: reusable, created: false };
    }

    await tx.insert(locationSessions).values(data);
    await tx.update(repairRequests).set({
      status: "출발",
      workflowStage: "기사출발",
    }).where(and(
      eq(repairRequests.id, data.requestId),
      eq(repairRequests.technicianId, data.technicianId),
    ));
    const rows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, data.trackingToken))
      .limit(1);
    const session = rows[0];
    if (!session) throw new Error("LOCATION_SESSION_CREATE_FAILED");
    return { session, created: true };
  });
}

export async function getLocationSessionByToken(token: string): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(locationSessions)
    .where(eq(locationSessions.trackingToken, token))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 고객 capability 링크를 열 때 세션만 믿지 않고 현재 접수 배정과 기사 계정을 다시 확인한다.
 * 기사가 비활성화/삭제되었거나 접수가 재배정·종료된 경우 이동 세션도 즉시 종료해
 * 앱의 마지막 stop 요청이 인증 만료로 실패했더라도 위치가 계속 공개되지 않게 한다.
 */
export async function getCustomerLocationSessionByToken(
  token: string,
): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  return db.transaction(async (tx) => {
    const snapshots = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, token))
      .limit(1);
    const snapshot = snapshots[0];
    if (!snapshot) return null;

    // 다른 위치 mutation과 같은 접수 -> 기사 -> 세션 잠금 순서를 유지한다.
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, snapshot.requestId))
      .limit(1)
      .for("update");
    const technicianRows = await tx
      .select()
      .from(technicians)
      .where(eq(technicians.id, snapshot.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    const roleRows = technician?.userId
      ? await tx
          .select({ appRole: appRoles.appRole, isActive: appRoles.isActive })
          .from(appRoles)
          .where(eq(appRoles.userId, technician.userId))
          .limit(1)
          .for("update")
      : [];
    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) return null;
    if (session.status !== "이동중") return session;

    const request = requestRows[0];
    const linkedRole = roleRows[0];
    const expired = Boolean(
      session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now(),
    );
    const terminalRequest = Boolean(request && (
      ["도착", "공사중", "작업진행중", "공사완료", "작업완료"].includes(request.status) ||
      ["기사도착", "작업진행", "작업완료", "결제완료", "후기요청"].includes(request.workflowStage)
    ));
    const invalidAssignment = Boolean(
      !request || request.isDeleted || request.technicianId !== session.technicianId,
    );
    const inactiveTechnician = Boolean(
      !technician ||
      !technician.isActive ||
      technician.isDeleted ||
      (technician.userId && (!linkedRole || !linkedRole.isActive || linkedRole.appRole !== "technician")),
    );

    let endedStatus: LocationSession["status"] | null = null;
    if (expired) endedStatus = "만료";
    else if (terminalRequest) endedStatus = "도착완료";
    else if (invalidAssignment || inactiveTechnician) endedStatus = "업무취소";
    if (!endedStatus) return session;

    const now = new Date();
    await tx.update(locationSessions).set({
      status: endedStatus,
      ...(endedStatus === "도착완료" ? { arrivedAt: session.arrivedAt ?? now } : {}),
      ...(endedStatus === "업무취소" ? { cancelledAt: session.cancelledAt ?? now } : {}),
    } as Record<string, unknown>).where(and(
      eq(locationSessions.id, session.id),
      eq(locationSessions.status, "이동중"),
    ));
    return {
      ...session,
      status: endedStatus,
      ...(endedStatus === "도착완료" ? { arrivedAt: session.arrivedAt ?? now } : {}),
      ...(endedStatus === "업무취소" ? { cancelledAt: session.cancelledAt ?? now } : {}),
    };
  });
}

export async function getLocationSessionByRequestId(requestId: number): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(locationSessions)
    .where(and(eq(locationSessions.requestId, requestId), eq(locationSessions.status, "이동중")))
    .orderBy(desc(locationSessions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveLocationSessions(): Promise<LocationSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locationSessions)
    .where(eq(locationSessions.status, "이동중"))
    .orderBy(desc(locationSessions.departedAt));
}

export async function getActiveLocationSessionsByBranch(branchId: number): Promise<LocationSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locationSessions)
    .where(and(eq(locationSessions.status, "이동중"), eq(locationSessions.branchId, branchId)))
    .orderBy(desc(locationSessions.departedAt));
}

export async function updateLocationSessionPosition(
  token: string,
  lat: string,
  lng: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(locationSessions).set({
    currentLat: lat,
    currentLng: lng,
    currentUpdatedAt: new Date(),
  } as Record<string, unknown>).where(eq(locationSessions.trackingToken, token));
}

/**
 * 기사 REST 위치 전송을 세션과 현재 배정이 유지되는 동안에만 반영한다.
 */
export async function updateLocationSessionPositionAuthorized(params: {
  token: string;
  technicianId: number;
  lat: string;
  lng: string;
}): Promise<"updated" | "not_found" | "forbidden" | "ended"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const sessionSnapshotRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1);
    const snapshot = sessionSnapshotRows[0];
    if (!snapshot) return "not_found";
    if (snapshot.technicianId !== params.technicianId) return "forbidden";

    const requestRows = await tx
      .select({
        technicianId: repairRequests.technicianId,
        isDeleted: repairRequests.isDeleted,
      })
      .from(repairRequests)
      .where(eq(repairRequests.id, snapshot.requestId))
      .limit(1)
      .for("update");
    const technicianRows = await tx
      .select({
        name: technicians.name,
        isActive: technicians.isActive,
        isDeleted: technicians.isDeleted,
      })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) return "not_found";
    const request = requestRows[0];
    const technician = technicianRows[0];
    if (
      session.requestId !== snapshot.requestId ||
      session.technicianId !== params.technicianId ||
      !request ||
      request.isDeleted ||
      request.technicianId !== params.technicianId ||
      !technician ||
      !technician.isActive ||
      technician.isDeleted
    ) {
      await tx.update(locationSessions).set({
        status: "업무취소",
        cancelledAt: new Date(),
      } as Record<string, unknown>).where(and(
        eq(locationSessions.id, session.id),
        eq(locationSessions.status, "이동중"),
      ));
      return "forbidden";
    }
    if (session.status !== "이동중") return "ended";

    await tx.update(locationSessions).set({
      currentLat: params.lat,
      currentLng: params.lng,
      currentUpdatedAt: new Date(),
    } as Record<string, unknown>).where(and(
      eq(locationSessions.id, session.id),
      eq(locationSessions.status, "이동중"),
    ));
    return "updated";
  });
}

export async function stopLocationSession(
  token: string,
  reason: "도착완료" | "업무취소" | "만료"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const updateData: Record<string, unknown> = { status: reason };
  if (reason === "도착완료") updateData.arrivedAt = now;
  if (reason === "업무취소") updateData.cancelledAt = now;
  await db.update(locationSessions).set(updateData).where(eq(locationSessions.trackingToken, token));
}

/** 기사 REST 종료 요청의 세션/현재 배정을 한 트랜잭션에서 검증한다. */
export async function stopLocationSessionAuthorized(params: {
  token: string;
  technicianId: number;
  reason: "도착완료" | "업무취소";
}): Promise<"stopped" | "not_found" | "forbidden" | "already_ended"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const sessionSnapshotRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1);
    const snapshot = sessionSnapshotRows[0];
    if (!snapshot) return "not_found";
    if (snapshot.technicianId !== params.technicianId) return "forbidden";

    const requestRows = await tx
      .select({
        technicianId: repairRequests.technicianId,
        isDeleted: repairRequests.isDeleted,
      })
      .from(repairRequests)
      .where(eq(repairRequests.id, snapshot.requestId))
      .limit(1)
      .for("update");
    const technicianRows = await tx
      .select({
        isActive: technicians.isActive,
        isDeleted: technicians.isDeleted,
      })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) return "not_found";
    const request = requestRows[0];
    const technician = technicianRows[0];
    if (
      session.requestId !== snapshot.requestId ||
      session.technicianId !== params.technicianId ||
      !request ||
      request.isDeleted ||
      request.technicianId !== params.technicianId ||
      !technician ||
      !technician.isActive ||
      technician.isDeleted
    ) {
      await tx.update(locationSessions).set({
        status: "업무취소",
        cancelledAt: new Date(),
      } as Record<string, unknown>).where(and(
        eq(locationSessions.id, session.id),
        eq(locationSessions.status, "이동중"),
      ));
      return "forbidden";
    }
    if (session.status !== "이동중") return "already_ended";

    await assertLocationDepartureDeliverySettledWithTx(tx, session);
    const now = new Date();
    await tx.update(locationSessions).set({
      status: params.reason,
      ...(params.reason === "도착완료" ? { arrivedAt: now } : { cancelledAt: now }),
    } as Record<string, unknown>).where(and(
      eq(locationSessions.id, session.id),
      eq(locationSessions.status, "이동중"),
    ));
    return "stopped";
  });
}

/** 관리자 종료도 세션과 현재 지사 범위를 같은 트랜잭션 안에서 다시 검증한다. */
export async function stopLocationSessionByManagerAuthorized(params: {
  token: string;
  managerUserId: number;
  reason: "도착완료" | "업무취소";
}): Promise<"stopped" | "not_found" | "forbidden" | "already_ended"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const snapshotRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1);
    const snapshot = snapshotRows[0];
    if (!snapshot) return "not_found";

    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, snapshot.requestId))
      .limit(1)
      .for("update");
    await tx
      .select({ id: technicians.id })
      .from(technicians)
      .where(eq(technicians.id, snapshot.technicianId))
      .limit(1)
      .for("update");
    const callerRows = await tx
      .select()
      .from(appRoles)
      .where(eq(appRoles.userId, params.managerUserId))
      .limit(1)
      .for("update");
    const caller = callerRows[0];
    let branchIsManaged = true;
    if (caller?.appRole === "branch_manager") {
      const branchRows = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(
          eq(branches.managerUserId, params.managerUserId),
          eq(branches.isActive, true),
          eq(branches.isDeleted, false),
        ))
        .limit(2)
        .for("update");
      const managedBranch = branchRows.length === 1 ? branchRows[0] : null;
      branchIsManaged = Boolean(
        managedBranch &&
        requestRows[0]?.branchId === managedBranch.id &&
        snapshot.branchId === managedBranch.id
      );
    }
    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) return "not_found";
    const request = requestRows[0];
    if (
      session.requestId !== snapshot.requestId ||
      session.technicianId !== snapshot.technicianId ||
      !request ||
      request.isDeleted ||
      !caller ||
      !caller.isActive ||
      (caller.appRole !== "hq_admin" && caller.appRole !== "branch_manager") ||
      (caller.appRole === "branch_manager" && (
        !branchIsManaged
      ))
    ) {
      return "forbidden";
    }
    if (session.status !== "이동중") return "already_ended";

    await assertLocationDepartureDeliverySettledWithTx(tx, session);
    const now = new Date();
    await tx.update(locationSessions).set({
      status: params.reason,
      ...(params.reason === "도착완료" ? { arrivedAt: now } : { cancelledAt: now }),
    } as Record<string, unknown>).where(and(
      eq(locationSessions.id, session.id),
      eq(locationSessions.status, "이동중"),
    ));
    return "stopped";
  });
}

export async function markLocationSessionSmsSent(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(locationSessions).set({ smsSentAt: new Date() } as Record<string, unknown>)
    .where(eq(locationSessions.trackingToken, token));
}

/**
 * 출발 문자 발송권을 세션 행 잠금 안에서 선점한다. 성공이면 smsSentAt을 유지하고,
 * 실패면 clearLocationSessionSmsClaim으로 비워 다음 출발 재시도가 다시 선점한다.
 */
export async function claimLocationSessionSms(params: {
  token: string;
  requestId: number;
  technicianId: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: locationSessions.id,
        requestId: locationSessions.requestId,
        technicianId: locationSessions.technicianId,
        status: locationSessions.status,
        smsSentAt: locationSessions.smsSentAt,
        createdAt: locationSessions.createdAt,
      })
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = rows[0];
    if (
      !session ||
      session.status !== "이동중" ||
      session.requestId !== params.requestId ||
      session.technicianId !== params.technicianId
    ) {
      return false;
    }
    if (session.smsSentAt) {
      const successfulLogs = await tx
        .select({ id: notificationLogs.id })
        .from(notificationLogs)
        .where(and(
          eq(notificationLogs.requestId, params.requestId),
          eq(notificationLogs.messageType, "기사출발"),
          inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"]),
          like(notificationLogs.content, locationTrackingLogPattern(params.token)),
          gte(notificationLogs.createdAt, session.createdAt),
        ))
        .orderBy(desc(notificationLogs.createdAt))
        .limit(1);
      if (successfulLogs[0]) return false;

      // 전송 프로세스가 claim 직후 죽으면 영구 잠금되지 않도록 2분 lease로 재선점한다.
      const claimAgeMs = Date.now() - new Date(session.smsSentAt).getTime();
      if (Number.isFinite(claimAgeMs) && claimAgeMs < LOCATION_SMS_CLAIM_LEASE_MS) return false;
    }
    await tx
      .update(locationSessions)
      .set({ smsSentAt: new Date() } as Record<string, unknown>)
      .where(eq(locationSessions.id, session.id));
    return true;
  });
}

/** SMS 네트워크 호출 직전에 출발 claim이 아직 현재 배정/활성 세션인지 재검증한다. */
export async function validateLocationSessionSmsClaim(params: {
  token: string;
  requestId: number;
  technicianId: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const requestRows = await tx.select().from(repairRequests)
      .where(eq(repairRequests.id, params.requestId)).limit(1).for("update");
    const request = requestRows[0];
    // getOrCreateActiveLocationSession과 동일한 request -> technician -> session 잠금 순서.
    const technicianRows = await tx.select().from(technicians)
      .where(eq(technicians.id, params.technicianId)).limit(1).for("update");
    const technician = technicianRows[0];
    const sessionRows = await tx.select().from(locationSessions).where(and(
      eq(locationSessions.trackingToken, params.token),
      eq(locationSessions.requestId, params.requestId),
      eq(locationSessions.technicianId, params.technicianId),
    )).limit(1).for("update");
    const session = sessionRows[0];
    return Boolean(
      request && !request.isDeleted && request.technicianId === params.technicianId &&
      !["도착", "공사중", "작업진행중", "공사완료", "작업완료"].includes(request.status) &&
      session && session.status === "이동중" && session.smsSentAt &&
      technician && technician.isActive && !technician.isDeleted
    );
  });
}

/** 반환 DTO의 smsSent는 pending marker가 아닌 이 token의 실제 accepted 로그만 사용한다. */
export async function hasAcceptedLocationSessionSms(params: {
  token: string;
  requestId: number;
  technicianId: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sessions = await db.select({ createdAt: locationSessions.createdAt })
    .from(locationSessions)
    .where(and(
      eq(locationSessions.trackingToken, params.token),
      eq(locationSessions.requestId, params.requestId),
      eq(locationSessions.technicianId, params.technicianId),
    ))
    .limit(1);
  const session = sessions[0];
  if (!session) return false;
  const acceptedRows = await db.select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.requestId, params.requestId),
      eq(notificationLogs.messageType, "기사출발"),
      inArray(notificationLogs.result, ["SUCCESS", "REQUESTED"]),
      like(notificationLogs.content, locationTrackingLogPattern(params.token)),
      gte(notificationLogs.createdAt, session.createdAt),
    ))
    .orderBy(desc(notificationLogs.createdAt), desc(notificationLogs.id))
    .limit(1);
  return Boolean(acceptedRows[0]);
}

const LOCATION_RESEND_MESSAGE_TYPE = "기사출발재발송";
const LOCATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 위치 링크 재발송은 현재 배정/기사/관리자 지사 범위를 DB에서 다시 검증하고,
 * notification_logs에 durable claim을 만든다. 동시 요청은 2분 lease로 합쳐지고
 * 성공한 재발송(또는 직전 최초 발송) 뒤 5분 동안 추가 비용 발생을 막는다.
 */
export async function claimLocationSessionResendSms(params: {
  token: string;
  callerUserId: number;
}): Promise<WorkflowNotificationClaim> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const snapshotRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1);
    const snapshot = snapshotRows[0];
    if (!snapshot) throw new Error("LOCATION_SESSION_NOT_FOUND");

    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, snapshot.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    const technicianRows = await tx
      .select({
        id: technicians.id,
        userId: technicians.userId,
        name: technicians.name,
        branchId: technicians.branchId,
        isActive: technicians.isActive,
        isDeleted: technicians.isDeleted,
      })
      .from(technicians)
      .where(eq(technicians.id, snapshot.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    const callerRows = await tx
      .select()
      .from(appRoles)
      .where(eq(appRoles.userId, params.callerUserId))
      .limit(1)
      .for("update");
    const caller = callerRows[0];
    if (
      !request ||
      request.isDeleted ||
      request.technicianId !== snapshot.technicianId ||
      !technician ||
      !technician.isActive ||
      technician.isDeleted
    ) {
      throw new Error("LOCATION_ASSIGNMENT_CHANGED");
    }
    if (
      !caller ||
      !caller.isActive ||
      !["technician", "branch_manager", "hq_admin"].includes(caller.appRole)
    ) {
      throw new Error("LOCATION_MANAGER_FORBIDDEN");
    }
    if (caller.appRole === "technician" && technician.userId !== caller.userId) {
      throw new Error("LOCATION_ASSIGNMENT_CHANGED");
    }
    if (caller.appRole === "branch_manager") {
      const branchRows = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(
          eq(branches.managerUserId, caller.userId),
          eq(branches.isActive, true),
          eq(branches.isDeleted, false),
        ))
        .limit(2)
        .for("update");
      const branch = branchRows.length === 1 ? branchRows[0] : null;
      if (
        !branch ||
        request.branchId !== branch.id ||
        technician.branchId !== branch.id ||
        snapshot.branchId !== branch.id
      ) {
        throw new Error("LOCATION_MANAGER_FORBIDDEN");
      }
    }

    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) throw new Error("LOCATION_SESSION_NOT_FOUND");
    if (
      session.requestId !== request.id ||
      session.technicianId !== technician.id
    ) {
      throw new Error("LOCATION_SESSION_MISMATCH");
    }
    if (session.status !== "이동중") throw new Error("LOCATION_SESSION_ENDED");

    const logs = await tx
      .select()
      .from(notificationLogs)
      .where(and(
        eq(notificationLogs.requestId, request.id),
        gte(notificationLogs.createdAt, session.createdAt),
        or(
          and(
            eq(notificationLogs.messageType, "기사출발"),
            like(
              notificationLogs.content,
              locationTrackingLogPattern(session.trackingToken),
            ),
          ),
          and(
            eq(notificationLogs.messageType, LOCATION_RESEND_MESSAGE_TYPE),
            eq(
              notificationLogs.responsePayload,
              `LOCATION_RESEND_CLAIM:${session.trackingToken}`,
            ),
          ),
        ),
      ))
      .orderBy(desc(notificationLogs.sentAt), desc(notificationLogs.createdAt), desc(notificationLogs.id))
      .limit(1)
      .for("update");
    const latest = logs[0];
    const latestAt = latest?.sentAt ?? latest?.createdAt;
    const latestAgeMs = latestAt ? Date.now() - new Date(latestAt).getTime() : Number.POSITIVE_INFINITY;
    if (
      latest?.messageType === LOCATION_RESEND_MESSAGE_TYPE &&
      latest.errorMessage === WORKFLOW_NOTIFICATION_PENDING &&
      Number.isFinite(latestAgeMs) &&
      latestAgeMs < WORKFLOW_NOTIFICATION_LEASE_MS
    ) {
      return { claimed: false, reason: "pending" };
    }
    if (
      (latest?.result === "SUCCESS" || latest?.result === "REQUESTED") &&
      Number.isFinite(latestAgeMs) &&
      latestAgeMs < LOCATION_RESEND_COOLDOWN_MS
    ) {
      return { claimed: false, reason: "cooldown" };
    }
    if (!latest && session.smsSentAt) {
      const initialClaimAgeMs = Date.now() - new Date(session.smsSentAt).getTime();
      if (Number.isFinite(initialClaimAgeMs) && initialClaimAgeMs < WORKFLOW_NOTIFICATION_LEASE_MS) {
        return { claimed: false, reason: "pending" };
      }
    }

    const content = buildTechnicianDepartedMessage(
      request.customerName,
      technician.name,
      `https://퓨처에너지테크.kr/track/${encodeURIComponent(session.trackingToken)}`,
    );
    const now = new Date();
    if (
      latest?.messageType === LOCATION_RESEND_MESSAGE_TYPE &&
      latest.result !== "SUCCESS" &&
      latest.result !== "REQUESTED"
    ) {
      const preservedContent = latest.content || content;
      const preservedPhone = latest.phoneNumber || request.phoneNumber;
      await tx.update(notificationLogs).set({
        phoneNumber: preservedPhone,
        content: preservedContent,
        result: "SKIPPED",
        errorMessage: WORKFLOW_NOTIFICATION_PENDING,
        sentAt: now,
      }).where(eq(notificationLogs.id, latest.id));
      return {
        claimed: true,
        claimId: latest.id,
        retried: true,
        phoneNumber: preservedPhone,
        messageType: LOCATION_RESEND_MESSAGE_TYPE,
        content: preservedContent,
      };
    }

    const result = await tx.insert(notificationLogs).values({
      requestId: request.id,
      phoneNumber: request.phoneNumber,
      channel: "SMS",
      messageType: LOCATION_RESEND_MESSAGE_TYPE,
      content,
      result: "SKIPPED",
      errorMessage: WORKFLOW_NOTIFICATION_PENDING,
      responsePayload: `LOCATION_RESEND_CLAIM:${session.trackingToken}`,
      sentAt: now,
    });
    return {
      claimed: true,
      claimId: (result as any)[0].insertId,
      retried: false,
      phoneNumber: request.phoneNumber,
      messageType: LOCATION_RESEND_MESSAGE_TYPE,
      content,
    };
  });
}

export async function clearLocationSessionSmsClaim(params: {
  token: string;
  requestId: number;
  technicianId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(locationSessions)
    .set({ smsSentAt: null } as Record<string, unknown>)
    .where(and(
      eq(locationSessions.trackingToken, params.token),
      eq(locationSessions.requestId, params.requestId),
      eq(locationSessions.technicianId, params.technicianId),
      eq(locationSessions.status, "이동중"),
    ));
}

/**
 * 토큰·접수·현재 배정을 잠금 안에서 검증하고 최초 도착 전환 여부를 반환한다.
 * 동시 도착 요청 중 정확히 하나만 firstArrival=true를 받는다.
 */
export async function markLocationSessionArrivedAuthorized(params: {
  token: string;
  requestId: number;
  technicianId: number;
}): Promise<{
  request: RepairRequest;
  firstArrival: boolean;
  notificationClaim: WorkflowNotificationClaim;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const requestRows = await tx
      .select()
      .from(repairRequests)
      .where(eq(repairRequests.id, params.requestId))
      .limit(1)
      .for("update");
    const request = requestRows[0];
    if (!request || request.isDeleted) throw new Error("LOCATION_REQUEST_NOT_FOUND");
    if (request.technicianId !== params.technicianId) {
      throw new Error("LOCATION_ASSIGNMENT_CHANGED");
    }

    const technicianRows = await tx
      .select({
        name: technicians.name,
        isActive: technicians.isActive,
        isDeleted: technicians.isDeleted,
      })
      .from(technicians)
      .where(eq(technicians.id, params.technicianId))
      .limit(1)
      .for("update");
    const technician = technicianRows[0];
    if (!technician || !technician.isActive || technician.isDeleted) {
      throw new Error("LOCATION_TECHNICIAN_NOT_ACTIVE");
    }

    const sessionRows = await tx
      .select()
      .from(locationSessions)
      .where(eq(locationSessions.trackingToken, params.token))
      .limit(1)
      .for("update");
    const session = sessionRows[0];
    if (!session) throw new Error("LOCATION_SESSION_NOT_FOUND");
    if (
      session.requestId !== params.requestId ||
      session.technicianId !== params.technicianId
    ) {
      throw new Error("LOCATION_SESSION_MISMATCH");
    }
    if (session.status !== "이동중" && session.status !== "도착완료") {
      throw new Error("LOCATION_SESSION_ENDED");
    }

    if (session.status === "이동중") {
      await assertLocationDepartureDeliverySettledWithTx(tx, session);
    }

    const statusArrived = [
      "도착",
      "공사중",
      "작업진행중",
      "공사완료",
      "작업완료",
    ].includes(request.status);
    const stageArrived = [
      "기사도착",
      "작업진행",
      "작업완료",
      "결제완료",
      "후기요청",
    ].includes(request.workflowStage);
    const firstArrival = !statusArrived && !stageArrived;

    if (session.status === "이동중") {
      await tx.update(locationSessions).set({
        status: "도착완료",
        arrivedAt: new Date(),
      } as Record<string, unknown>).where(and(
        eq(locationSessions.id, session.id),
        eq(locationSessions.status, "이동중"),
      ));
    }
    if (firstArrival) {
      await tx.update(repairRequests).set({
        status: "도착",
        workflowStage: "기사도착",
      }).where(and(
        eq(repairRequests.id, params.requestId),
        eq(repairRequests.technicianId, params.technicianId),
      ));
    }
    const notificationClaim = await claimWorkflowNotificationWithTx(tx, {
      requestId: request.id,
      phoneNumber: request.phoneNumber,
      eventKey: JSON.stringify({
        v: 1,
        type: "technician_arrived",
        requestId: request.id,
        technicianId: params.technicianId,
      }),
      messageType: "기사도착",
      content: buildTechnicianArrivedMessage(request.customerName, technician.name),
    });
    return { request, firstArrival, notificationClaim };
  });
}

// 만료된 세션 자동 처리 (4시간 초과)
export async function expireOldLocationSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 시간 만료뿐 아니라 재배정/기사 비활성/접수 종료도 고객 조회 전에 함께 정리한다.
  const expiredRows = await db.select().from(locationSessions)
    .where(eq(locationSessions.status, "이동중"));
  for (const row of expiredRows) {
    await getCustomerLocationSessionByToken(row.trackingToken);
  }
}

// ─── 위치 추적 동의 ────────────────────────────────────────────────────────
export async function getLocationConsent(technicianId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(locationConsents)
    .where(and(eq(locationConsents.technicianId, technicianId), eq(locationConsents.isActive, true)))
    .orderBy(desc(locationConsents.consentedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLocationConsent(technicianId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(locationConsents).values({
    technicianId,
    consentedAt: new Date(),
    consentVersion: "1.0",
    isActive: true,
  });
}

// ─── 지사 모집 상담 신청 ──────────────────────────────────────────────────────
import {
  branchApplications,
  BranchApplication,
  InsertBranchApplication,
} from "../drizzle/schema.js";

export async function createBranchApplication(
  data: Omit<InsertBranchApplication, "id" | "createdAt" | "updatedAt">
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(branchApplications).values(data);
  return { id: (result as any)[0].insertId };
}

export async function getAllBranchApplications(): Promise<BranchApplication[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branchApplications).orderBy(desc(branchApplications.createdAt));
}

export async function getBranchApplicationById(id: number): Promise<BranchApplication | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(branchApplications)
    .where(eq(branchApplications.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateBranchApplication(
  id: number,
  data: Partial<Pick<BranchApplication, "consultStatus" | "adminMemo">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(branchApplications).set(data as Record<string, unknown>)
    .where(eq(branchApplications.id, id));
}

// ─── 견적서 (estimates) ────────────────────────────────────────────────────
export async function createEstimate(data: Record<string, any>): Promise<number> {
  const db2 = await getDb();
  if (!db2) throw new Error("Database not available");
  const { estimates } = await import("../drizzle/schema.js");
  const result = await db2.insert(estimates).values(data as any);
  return (result[0] as any).insertId;
}

// 견적 단건 조회 (id)
export async function getEstimateById(id: number): Promise<any> {
  const db2 = await getDb();
  if (!db2) return null;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const rows = await db2.select().from(estimates).where(eq(estimates.id, id)).limit(1);
  return rows[0] ?? null;
}

// 견적 부분 업데이트 (id)
export async function updateEstimateById(id: number, data: Record<string, any>): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  await db2.update(estimates).set(data as any).where(eq(estimates.id, id));
}

const ESTIMATE_SCHEDULE_CONFIRMED_TYPE = "schedule_confirmed_customer";
const ESTIMATE_SCHEDULE_CHANGED_TYPE = "schedule_changed_customer";
const ESTIMATE_SCHEDULE_CLAIM_PREFIX = "ESTIMATE_SCHEDULE_CLAIM:";
const ESTIMATE_SCHEDULE_PENDING = "DELIVERY_CLAIM_PENDING";
const ESTIMATE_SCHEDULE_LEASE_MS = 2 * 60 * 1000;

export type EstimateScheduleNotificationClaim =
  | {
      claimed: true;
      claimId: number;
      estimateId: number;
      phoneNumber: string;
      content: string;
      retried: boolean;
    }
  | { claimed: false; reason: "pending" | "already_sent" };

export class EstimateScheduleAuthorizationError extends Error {
  constructor(public readonly reason:
    | "not_found"
    | "forbidden"
    | "invalid_status"
    | "delivery_pending"
  ) {
    super(`ESTIMATE_SCHEDULE_${reason.toUpperCase()}`);
    this.name = "EstimateScheduleAuthorizationError";
  }
}

async function authorizeEstimateManagerWithTx(tx: any, estimate: any, callerUserId: number) {
  const callerRows = await tx.select().from(appRoles)
    .where(eq(appRoles.userId, callerUserId)).limit(1).for("update");
  const caller = callerRows[0];
  if (
    !caller || !caller.isActive ||
    (caller.appRole !== "hq_admin" && caller.appRole !== "branch_manager")
  ) {
    throw new EstimateScheduleAuthorizationError("forbidden");
  }
  if (caller.appRole === "branch_manager") {
    const managed = await tx.select({ id: branches.id }).from(branches).where(and(
      eq(branches.managerUserId, callerUserId),
      eq(branches.isActive, true),
      eq(branches.isDeleted, false),
    )).limit(2).for("update");
    if (managed.length !== 1 || estimate.branchId !== managed[0].id) {
      throw new EstimateScheduleAuthorizationError("forbidden");
    }
  }
  return caller;
}

async function claimEstimateScheduleNotificationWithTx(
  tx: any,
  params: {
    estimateId: number;
    branchId: number | null;
    customerName: string;
    phoneNumber: string;
    confirmedDate: string;
    confirmedTime: string | null;
    senderId: number;
    noticeKind: "confirmed" | "changed";
  },
): Promise<EstimateScheduleNotificationClaim> {
  const confirmedContent = buildEstimateScheduleConfirmedMessage({
    customerName: params.customerName,
    confirmedDate: params.confirmedDate,
    confirmedTime: params.confirmedTime,
  });
  const changedContent = buildScheduleConfirmedMessage(
    params.customerName,
    params.confirmedDate,
    params.confirmedTime ?? "",
    true,
  );
  const buildFingerprint = (noticeKind: "confirmed" | "changed", content: string) =>
    `${ESTIMATE_SCHEDULE_CLAIM_PREFIX}${JSON.stringify({
      v: 1,
      estimateId: params.estimateId,
      phoneNumber: params.phoneNumber,
      confirmedDate: params.confirmedDate,
      confirmedTime: params.confirmedTime,
      noticeKind,
      content,
    })}`;
  const confirmedFingerprint = buildFingerprint("confirmed", confirmedContent);
  const changedFingerprint = buildFingerprint("changed", changedContent);
  const rows = await tx.select().from(estimateMessageLogs).where(and(
    eq(estimateMessageLogs.estimateId, params.estimateId),
    inArray(estimateMessageLogs.messageType, [
      ESTIMATE_SCHEDULE_CONFIRMED_TYPE,
      ESTIMATE_SCHEDULE_CHANGED_TYPE,
    ]),
  )).orderBy(desc(estimateMessageLogs.sentAt), desc(estimateMessageLogs.id))
    .limit(20).for("update");
  const now = new Date();
  const latest = rows[0];
  const latestKind = latest?.linkUrl === confirmedFingerprint
    ? "confirmed"
    : latest?.linkUrl === changedFingerprint
      ? "changed"
      : null;
  // 동일 목표 재호출은 최초/변경 당시의 정확한 종류와 본문을 보존한다.
  const noticeKind = latestKind ?? params.noticeKind;
  const content = noticeKind === "changed" ? changedContent : confirmedContent;
  const messageType = noticeKind === "changed"
    ? ESTIMATE_SCHEDULE_CHANGED_TYPE
    : ESTIMATE_SCHEDULE_CONFIRMED_TYPE;
  const fingerprint = noticeKind === "changed" ? changedFingerprint : confirmedFingerprint;
  const latestIsExactTarget = Boolean(
    latest &&
    latest.linkUrl === fingerprint &&
    latest.customerPhone === params.phoneNumber &&
    latest.messageType === messageType &&
    latest.messageBody === content
  );

  // 앞선 날짜의 발송자가 transaction 밖에서 전송 중이면 새 날짜를 먼저
  // 커밋하지 않는다. sendNotification timeout(10초)보다 긴 lease가 끝난 뒤에만 회수한다.
  if (
    latest && !latestIsExactTarget &&
    latest.senderRole === ESTIMATE_SCHEDULE_PENDING
  ) {
    const leaseAgeMs = Date.now() - new Date(latest.sentAt).getTime();
    if (Number.isFinite(leaseAgeMs) && leaseAgeMs < ESTIMATE_SCHEDULE_LEASE_MS) {
      throw new EstimateScheduleAuthorizationError("delivery_pending");
    }
    await tx.update(estimateMessageLogs).set({
      sendStatus: "FAILED",
      senderRole: "DELIVERY_LEASE_EXPIRED",
    }).where(eq(estimateMessageLogs.id, latest.id));
  }

  // 과거 A 성공이 있어도 latest target이 B라면 B→A는 새 변경 이벤트다.
  // 오직 최신 target fingerprint와 수신번호/본문이 모두 같은 경우만 재사용한다.
  const exact = latestIsExactTarget ? latest : null;
  if (exact && (exact.sendStatus === "SUCCESS" || exact.sendStatus === "REQUESTED")) {
    return { claimed: false, reason: "already_sent" };
  }
  if (exact?.senderRole === ESTIMATE_SCHEDULE_PENDING) {
    const leaseAgeMs = Date.now() - new Date(exact.sentAt).getTime();
    if (Number.isFinite(leaseAgeMs) && leaseAgeMs < ESTIMATE_SCHEDULE_LEASE_MS) {
      return { claimed: false, reason: "pending" };
    }
  }
  if (exact) {
    await tx.update(estimateMessageLogs).set({
      sendStatus: "SKIPPED",
      senderRole: ESTIMATE_SCHEDULE_PENDING,
      senderId: params.senderId,
      sentAt: now,
    }).where(eq(estimateMessageLogs.id, exact.id));
    return {
      claimed: true,
      claimId: exact.id,
      estimateId: params.estimateId,
      phoneNumber: params.phoneNumber,
      content,
      retried: true,
    };
  }

  const inserted = await tx.insert(estimateMessageLogs).values({
    estimateId: params.estimateId,
    customerName: params.customerName,
    customerPhone: params.phoneNumber,
    branchId: params.branchId,
    senderRole: ESTIMATE_SCHEDULE_PENDING,
    senderId: params.senderId,
    messageType,
    messageBody: content,
    linkUrl: fingerprint,
    sendStatus: "SKIPPED",
    sentAt: now,
  });
  return {
    claimed: true,
    claimId: (inserted as any)[0].insertId,
    estimateId: params.estimateId,
    phoneNumber: params.phoneNumber,
    content,
    retried: false,
  };
}

export async function confirmEstimateScheduleAuthorizedAndClaim(params: {
  estimateId: number;
  callerUserId: number;
  confirmedDate: string;
  confirmedTime?: string | null;
}): Promise<{
  estimateId: number;
  confirmedDate: string;
  confirmedTime: string | null;
  notificationClaim: EstimateScheduleNotificationClaim;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(estimates)
      .where(eq(estimates.id, params.estimateId)).limit(1).for("update");
    const estimate = rows[0];
    if (!estimate) throw new EstimateScheduleAuthorizationError("not_found");
    await authorizeEstimateManagerWithTx(tx, estimate, params.callerUserId);
    if (!["schedule_requested", "schedule_confirmed", "converted"].includes(estimate.status)) {
      throw new EstimateScheduleAuthorizationError("invalid_status");
    }
    const confirmedDate = params.confirmedDate.trim();
    const confirmedTime = params.confirmedTime?.trim() || null;
    const noticeKind = estimate.status === "schedule_confirmed" && (
      (estimate.visitDate?.trim() || null) !== confirmedDate ||
      (estimate.visitTime?.trim() || null) !== confirmedTime
    ) ? "changed" : "confirmed";
    if (estimate.status === "converted" && (
      estimate.visitDate !== confirmedDate || (estimate.visitTime?.trim() || null) !== confirmedTime
    )) {
      throw new EstimateScheduleAuthorizationError("invalid_status");
    }
    const notificationClaim = await claimEstimateScheduleNotificationWithTx(tx, {
      estimateId: estimate.id,
      branchId: estimate.branchId ?? null,
      customerName: estimate.customerName ?? "고객",
      phoneNumber: estimate.customerPhone ?? "",
      confirmedDate,
      confirmedTime,
      senderId: params.callerUserId,
      noticeKind,
    });
    await tx.update(estimates).set({
      ...(estimate.status === "converted" ? {} : { status: "schedule_confirmed" as const }),
      visitDate: confirmedDate,
      visitTime: confirmedTime,
    }).where(eq(estimates.id, estimate.id));
    return { estimateId: estimate.id, confirmedDate, confirmedTime, notificationClaim };
  });
}

export async function claimConfirmedEstimateScheduleNotification(params: {
  estimateId: number;
  callerUserId: number;
}): Promise<EstimateScheduleNotificationClaim | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(estimates)
      .where(eq(estimates.id, params.estimateId)).limit(1).for("update");
    const estimate = rows[0];
    if (!estimate) throw new EstimateScheduleAuthorizationError("not_found");
    await authorizeEstimateManagerWithTx(tx, estimate, params.callerUserId);
    const confirmedDate = estimate.visitDate?.trim() || "";
    if (!confirmedDate || !["schedule_confirmed", "converted"].includes(estimate.status)) return null;
    return claimEstimateScheduleNotificationWithTx(tx, {
      estimateId: estimate.id,
      branchId: estimate.branchId ?? null,
      customerName: estimate.customerName ?? "고객",
      phoneNumber: estimate.customerPhone ?? "",
      confirmedDate,
      confirmedTime: estimate.visitTime?.trim() || null,
      senderId: params.callerUserId,
      noticeKind: "confirmed",
    });
  });
}

export async function completeEstimateScheduleNotificationClaim(params: {
  claimId: number;
  result: "SUCCESS" | "FAILED" | "SKIPPED" | "REQUESTED";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(estimateMessageLogs).set({
    sendStatus: params.result,
    senderRole: params.result === "SUCCESS" || params.result === "REQUESTED"
      ? "DELIVERY_ACCEPTED"
      : "DELIVERY_FAILED",
    sentAt: new Date(),
  }).where(eq(estimateMessageLogs.id, params.claimId));
}

// 고객 열람 표시 (pending -> viewed)
export async function markEstimateViewed(token: string): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");
  await db2.update(estimates).set({ viewedAt: new Date(), status: "viewed" } as any)
    .where(and(eq(estimates.token, token), eq(estimates.status, "pending")));
}

// 권한별 견적 목록 (branchId null이면 전체 = 본사)
export async function listEstimates(opts: { branchId?: number | null; status?: string; sourceType?: string }): Promise<any[]> {
  const db2 = await getDb();
  if (!db2) return [];
  const { estimates } = await import("../drizzle/schema.js");
  const { eq, and, desc } = await import("drizzle-orm");
  const conds: any[] = [];
  if (opts.branchId != null) conds.push(eq(estimates.branchId, opts.branchId));
  if (opts.status) conds.push(eq(estimates.status, opts.status as any));
  if (opts.sourceType) conds.push(eq(estimates.sourceType, opts.sourceType as any));
  let q = db2.select().from(estimates) as any;
  if (conds.length === 1) q = q.where(conds[0]);
  else if (conds.length > 1) q = q.where(and(...conds));
  return q.orderBy(desc(estimates.createdAt));
}

// 견적 메시지 로그 생성
export async function createEstimateMessageLog(data: Record<string, any>): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimateMessageLogs } = await import("../drizzle/schema.js");
  await db2.insert(estimateMessageLogs).values(data as any);
}

// 견적 메시지 로그 조회 (권한별)
export async function getEstimateMessageLogs(opts: { branchId?: number | null }): Promise<any[]> {
  const db2 = await getDb();
  if (!db2) return [];
  const { estimateMessageLogs } = await import("../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");
  let q = db2.select().from(estimateMessageLogs) as any;
  if (opts.branchId != null) q = q.where(eq(estimateMessageLogs.branchId, opts.branchId));
  return q.orderBy(desc(estimateMessageLogs.createdAt));
}

// 지사 담당 전화번호 조회
export async function getBranchPhone(branchId: number): Promise<string | null> {
  const b = await getBranchById(branchId);
  if (!b) return null;
  return (b as any).phoneNumber || null;
}

export async function getEstimateByToken(token: string): Promise<any> {
  const db2 = await getDb();
  if (!db2) return null;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const rows = await db2.select().from(estimates).where(eq(estimates.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function getEstimatesByRequestId(requestId: number): Promise<any[]> {
  const db2 = await getDb();
  if (!db2) return [];
  const { estimates } = await import("../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");
  return db2.select().from(estimates)
    .where(eq(estimates.requestId, requestId))
    .orderBy(desc(estimates.createdAt));
}

export async function approveEstimateByToken(token: string, visitDate?: string, visitTime?: string): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  await db2.update(estimates).set({
    status: "approved",
    approvedAt: new Date(),
    visitDate: visitDate ?? null,
    visitTime: visitTime ?? null,
  } as any).where(eq(estimates.token, token));
}

export async function rejectEstimateByToken(token: string, rejectReason?: string): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  await db2.update(estimates).set({
    status: "rejected",
    rejectedAt: new Date(),
    rejectReason: rejectReason ?? null,
  } as any).where(eq(estimates.token, token));
}

export async function expireOldEstimates(): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { estimates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const now = new Date();
  const pendingRows = await db2.select({ id: estimates.id, validUntil: estimates.validUntil })
    .from(estimates)
    .where(eq(estimates.status, "pending"));
  for (const row of pendingRows) {
    if (row.validUntil && new Date(row.validUntil) < now) {
      await db2.update(estimates).set({ status: "expired" } as any)
        .where(eq(estimates.id, row.id));
    }
  }
}

// ─── 본사 소속 기사 조회 (branchId IS NULL) ────────────────────
export async function getHQTechnicians() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(technicians)
    .where(and(isNull(technicians.branchId), eq(technicians.isActive, true)))
    .orderBy(technicians.name);
}
// ─── 접수 ownerType 업데이트 ────────────────────────────────────
export async function assignRepairToHQ(requestId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(repairRequests)
    .set({ ownerType: "headquarters", branchId: null })
    .where(eq(repairRequests.id, requestId));
}
export async function assignRepairToBranch(requestId: number, branchId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(repairRequests)
    .set({ ownerType: "branch", branchId })
    .where(eq(repairRequests.id, requestId));
}

// ─── 단가 항목 CRUD ─────────────────────────────────────────────
export async function getAllPriceItems(): Promise<PriceItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceItems).orderBy(priceItems.sortOrder, priceItems.id);
}

export async function getActivePriceItems(): Promise<PriceItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceItems)
    .where(eq(priceItems.isActive, true))
    .orderBy(priceItems.sortOrder, priceItems.id);
}

export async function upsertPriceItem(data: InsertPriceItem & { id?: number }): Promise<{ success: boolean; id?: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    await db.update(priceItems).set({
      category: data.category,
      name: data.name,
      unit: data.unit,
      stdPrice: data.stdPrice,
      discPrice: data.discPrice,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      description: data.description,
    }).where(eq(priceItems.id, data.id));
    return { success: true, id: data.id };
  } else {
    const result = await db.insert(priceItems).values(data);
    return { success: true, id: (result as any)[0].insertId };
  }
}

export async function togglePriceItemActive(id: number, isActive: boolean): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(priceItems).set({ isActive }).where(eq(priceItems.id, id));
  return { success: true };
}

export async function deletePriceItem(id: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(priceItems).where(eq(priceItems.id, id));
  return { success: true };
}

export async function ensurePriceItemsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`price_items\` (
        \`id\` int AUTO_INCREMENT PRIMARY KEY,
        \`category\` varchar(50) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`unit\` varchar(20) DEFAULT '개',
        \`stdPrice\` int NOT NULL DEFAULT 0,
        \`discPrice\` int NOT NULL DEFAULT 0,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`description\` varchar(255),
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // 기존 테이블에 unit, description 컬럼이 없으면 추가 (마이그레이션)
    try {
      await db.execute(sql`ALTER TABLE \`price_items\` ADD COLUMN IF NOT EXISTS \`unit\` varchar(20) DEFAULT '개' AFTER \`name\``);
    } catch (e: any) { if (!String(e?.message || '').includes('Duplicate column')) console.warn('[DB] ALTER unit:', e?.message); }
    try {
      await db.execute(sql`ALTER TABLE \`price_items\` ADD COLUMN IF NOT EXISTS \`description\` varchar(255) DEFAULT NULL AFTER \`isActive\``);
    } catch (e: any) { if (!String(e?.message || '').includes('Duplicate column')) console.warn('[DB] ALTER description:', e?.message); }
    // 데이터가 없으면 기본 단가 삽입
    const existing = await db.select().from(priceItems).limit(1);
    if (existing.length === 0) {
      const defaultPrices: InsertPriceItem[] = [
        { category: '분배기교체', name: '분배기 교체 (2구)', unit: '식', stdPrice: 150000, discPrice: 130000, sortOrder: 10, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (3구)', unit: '식', stdPrice: 170000, discPrice: 148000, sortOrder: 20, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (4구)', unit: '식', stdPrice: 190000, discPrice: 165000, sortOrder: 30, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (5구)', unit: '식', stdPrice: 210000, discPrice: 183000, sortOrder: 40, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (6구)', unit: '식', stdPrice: 230000, discPrice: 200000, sortOrder: 50, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (7구)', unit: '식', stdPrice: 250000, discPrice: 218000, sortOrder: 60, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (8구)', unit: '식', stdPrice: 270000, discPrice: 235000, sortOrder: 70, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (9구)', unit: '식', stdPrice: 290000, discPrice: 252000, sortOrder: 80, isActive: true },
        { category: '분배기교체', name: '분배기 교체 (10구)', unit: '식', stdPrice: 310000, discPrice: 270000, sortOrder: 90, isActive: true },
        { category: '밸브/배관', name: '유량밸브 교체', unit: '개', stdPrice: 35000, discPrice: 30000, sortOrder: 100, isActive: true },
        { category: '밸브/배관', name: '스트레이너 교체', unit: '개', stdPrice: 25000, discPrice: 22000, sortOrder: 110, isActive: true },
        { category: '밸브/배관', name: '배관 수리', unit: '식', stdPrice: 80000, discPrice: 70000, sortOrder: 120, isActive: true },
        { category: '밸브/배관', name: '배관 청소', unit: '식', stdPrice: 120000, discPrice: 105000, sortOrder: 130, isActive: true },
        { category: '밸브/배관', name: '배관 교체 (m당)', unit: 'm', stdPrice: 15000, discPrice: 13000, sortOrder: 140, isActive: true },
        { category: '제어/조절', name: '온도조절기 교체', unit: '개', stdPrice: 45000, discPrice: 39000, sortOrder: 200, isActive: true },
        { category: '제어/조절', name: '구동기 교체', unit: '개', stdPrice: 40000, discPrice: 35000, sortOrder: 210, isActive: true },
        { category: '제어/조절', name: '제어기 교체', unit: '개', stdPrice: 55000, discPrice: 48000, sortOrder: 220, isActive: true },
        { category: '열량/계량', name: '열량계 교체', unit: '개', stdPrice: 180000, discPrice: 157000, sortOrder: 300, isActive: true },
        { category: '열량/계량', name: '수도계량기 교체', unit: '개', stdPrice: 80000, discPrice: 70000, sortOrder: 310, isActive: true },
        { category: '청소/점검', name: '전체 배관 세척', unit: '식', stdPrice: 150000, discPrice: 130000, sortOrder: 400, isActive: true },
        { category: '청소/점검', name: '분배기 청소', unit: '식', stdPrice: 50000, discPrice: 44000, sortOrder: 410, isActive: true },
        { category: '청소/점검', name: '기본 점검', unit: '식', stdPrice: 30000, discPrice: 26000, sortOrder: 420, isActive: true },
        { category: '청소/점검', name: '정밀 점검', unit: '식', stdPrice: 60000, discPrice: 52000, sortOrder: 430, isActive: true },
        { category: '기타', name: '출장비', unit: '회', stdPrice: 30000, discPrice: 26000, sortOrder: 500, isActive: true },
        { category: '기타', name: '긴급출동비', unit: '회', stdPrice: 50000, discPrice: 44000, sortOrder: 510, isActive: true },
        { category: '기타', name: '기타 부품 교체', unit: '식', stdPrice: 0, discPrice: 0, sortOrder: 520, isActive: true },
      ];
      await db.insert(priceItems).values(defaultPrices);
      console.log('[Database] price_items default data inserted.');
    }
    console.log('[Database] price_items table ensured.');
  } catch (error) {
    console.warn('[Database] Failed to ensure price_items table:', error);
  }
}

// ─── 접수번호 자동 생성 ──────────────────────────────────────────
async function generateJobNo(): Promise<string> {
  const today = new Date();
  const ymd = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `FET-${ymd}-`;
  const db = await getDb();
  if (!db) return prefix + '001';
  const rows = await db.execute(
    sql`SELECT jobNo FROM job_orders WHERE jobNo LIKE ${prefix + '%'} ORDER BY jobNo DESC LIMIT 1`
  ) as any[];
  const list = Array.isArray(rows[0]) ? rows[0] : rows;
  if (!list.length) return prefix + '001';
  const last = list[0]?.jobNo || '';
  const seq = parseInt(last.split('-')[2] || '0', 10);
  return prefix + String(seq + 1).padStart(3, '0');
}

async function generateAsNo(): Promise<string> {
  const today = new Date();
  const ymd = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `AS-${ymd}-`;
  const db = await getDb();
  if (!db) return prefix + '001';
  const rows = await db.execute(
    sql`SELECT asNo FROM as_records WHERE asNo LIKE ${prefix + '%'} ORDER BY asNo DESC LIMIT 1`
  ) as any[];
  const list = Array.isArray(rows[0]) ? rows[0] : rows;
  if (!list.length) return prefix + '001';
  const last = list[0]?.asNo || '';
  const seq = parseInt(last.split('-')[2] || '0', 10);
  return prefix + String(seq + 1).padStart(3, '0');
}

// ─── 접수공사현황 CRUD ────────────────────────────────────────────
export async function listJobOrders(filter: { q?: string; status?: string; dateFrom?: string; dateTo?: string } = {}): Promise<JobOrder[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filter.q) {
    conditions.push(sql`(jobNo LIKE ${'%' + filter.q + '%'} OR customerName LIKE ${'%' + filter.q + '%'} OR customerPhone LIKE ${'%' + filter.q + '%'})`);
  }
  if (filter.status) conditions.push(eq(jobOrders.status, filter.status));
  if (filter.dateFrom) conditions.push(sql`receivedAt >= ${filter.dateFrom}`);
  if (filter.dateTo) conditions.push(sql`receivedAt <= ${filter.dateTo + ' 23:59:59'}`);
  const query = conditions.length
    ? db.select().from(jobOrders).where(and(...conditions)).orderBy(desc(jobOrders.receivedAt))
    : db.select().from(jobOrders).orderBy(desc(jobOrders.receivedAt));
  return query;
}

export async function getJobOrder(id: number): Promise<JobOrder | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(jobOrders).where(eq(jobOrders.id, id)).limit(1);
  return rows[0] || null;
}

export async function createJobOrder(data: Omit<InsertJobOrder, 'id' | 'jobNo' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; id?: number; jobNo?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const jobNo = await generateJobNo();
  const result = await db.insert(jobOrders).values({ ...data, jobNo } as InsertJobOrder);
  return { success: true, id: (result as any)[0]?.insertId, jobNo };
}

export async function updateJobOrder(id: number, data: Partial<InsertJobOrder>): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { id: _id, jobNo: _jobNo, createdAt: _c, updatedAt: _u, ...updateData } = data as any;
  await db.update(jobOrders).set(updateData).where(eq(jobOrders.id, id));
  return { success: true };
}

// ─── AS 관리 CRUD ─────────────────────────────────────────────────
export async function listAsRecords(filter: { q?: string; status?: string } = {}): Promise<AsRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filter.q) {
    conditions.push(sql`(asNo LIKE ${'%' + filter.q + '%'} OR origJobNo LIKE ${'%' + filter.q + '%'} OR customerName LIKE ${'%' + filter.q + '%'})`);
  }
  if (filter.status) conditions.push(eq(asRecords.status, filter.status));
  const query = conditions.length
    ? db.select().from(asRecords).where(and(...conditions)).orderBy(desc(asRecords.receivedAt))
    : db.select().from(asRecords).orderBy(desc(asRecords.receivedAt));
  return query;
}

export async function getAsRecord(id: number): Promise<AsRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(asRecords).where(eq(asRecords.id, id)).limit(1);
  return rows[0] || null;
}

export async function createAsRecord(data: Omit<InsertAsRecord, 'id' | 'asNo' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; id?: number; asNo?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const asNo = await generateAsNo();
  const result = await db.insert(asRecords).values({ ...data, asNo } as InsertAsRecord);
  return { success: true, id: (result as any)[0]?.insertId, asNo };
}

export async function updateAsRecord(id: number, data: Partial<InsertAsRecord>): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { id: _id, asNo: _asNo, createdAt: _c, updatedAt: _u, ...updateData } = data as any;
  await db.update(asRecords).set(updateData).where(eq(asRecords.id, id));
  return { success: true };
}

// ─── 일일보고 CRUD ────────────────────────────────────────────────
export async function getDailyReport(date: string): Promise<DailyReport | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dailyReports).where(eq(dailyReports.reportDate, date)).limit(1);
  return rows[0] || null;
}

export async function listDailyReports(): Promise<DailyReport[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyReports).orderBy(desc(dailyReports.reportDate)).limit(90);
}

export async function saveDailyReport(data: { reportDate: string; newRequests?: number; estIssued?: number; estApproved?: number; workPlanned?: number; workDone?: number; newAs?: number; delayed?: number; billed?: number; collected?: number; unpaid?: number; orderNeeded?: string; exceptions?: string }): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const existing = await getDailyReport(data.reportDate);
  if (existing) {
    const { reportDate: _d, ...updateData } = data;
    await db.update(dailyReports).set(updateData).where(eq(dailyReports.reportDate, data.reportDate));
  } else {
    await db.insert(dailyReports).values(data as InsertDailyReport);
  }
  return { success: true };
}

// ─── 코드설정 CRUD ────────────────────────────────────────────────
export async function listCodeSettings(): Promise<CodeSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(codeSettings).where(eq(codeSettings.isActive, true)).orderBy(codeSettings.codeType, codeSettings.sortOrder, codeSettings.id);
}

export async function addCodeSetting(data: { codeType: string; codeValue: string; sortOrder?: number }): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(codeSettings).values({ ...data, isActive: true } as InsertCodeSetting);
  return { success: true };
}

export async function deleteCodeSetting(id: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(codeSettings).set({ isActive: false }).where(eq(codeSettings.id, id));
  return { success: true };
}

// ─── 업무관리 DB 테이블 자동 생성 ────────────────────────────────
let _workMgmtTablesEnsured = false;
export async function ensureWorkMgmtTables(): Promise<void> {
  if (_workMgmtTablesEnsured) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`job_orders\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`jobNo\` VARCHAR(30) NOT NULL UNIQUE,
        \`receivedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`customerName\` VARCHAR(100),
        \`customerPhone\` VARCHAR(20),
        \`address\` TEXT,
        \`workType\` VARCHAR(50),
        \`urgency\` VARCHAR(20) DEFAULT '일반',
        \`channel\` VARCHAR(30) DEFAULT '전화',
        \`branchName\` VARCHAR(100),
        \`techName\` VARCHAR(100),
        \`visitDate\` VARCHAR(10),
        \`estimateAmount\` INT DEFAULT 0,
        \`completeDate\` VARCHAR(10),
        \`billAmount\` INT DEFAULT 0,
        \`payDate\` VARCHAR(10),
        \`payAmount\` INT DEFAULT 0,
        \`status\` VARCHAR(20) DEFAULT '접수',
        \`memo\` TEXT,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`as_records\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`asNo\` VARCHAR(30) NOT NULL UNIQUE,
        \`origJobNo\` VARCHAR(30),
        \`receivedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`customerName\` VARCHAR(100),
        \`customerPhone\` VARCHAR(20),
        \`symptom\` TEXT,
        \`techName\` VARCHAR(100),
        \`doneDate\` VARCHAR(10),
        \`status\` VARCHAR(20) DEFAULT '접수',
        \`memo\` TEXT,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`daily_reports\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`reportDate\` VARCHAR(10) NOT NULL UNIQUE,
        \`newRequests\` INT DEFAULT 0,
        \`estIssued\` INT DEFAULT 0,
        \`estApproved\` INT DEFAULT 0,
        \`workPlanned\` INT DEFAULT 0,
        \`workDone\` INT DEFAULT 0,
        \`newAs\` INT DEFAULT 0,
        \`delayed\` INT DEFAULT 0,
        \`billed\` INT DEFAULT 0,
        \`collected\` INT DEFAULT 0,
        \`unpaid\` INT DEFAULT 0,
        \`orderNeeded\` TEXT,
        \`exceptions\` TEXT,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`code_settings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`codeType\` VARCHAR(50) NOT NULL,
        \`codeValue\` VARCHAR(100) NOT NULL,
        \`sortOrder\` INT DEFAULT 0,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // 기본 코드 데이터 삽입 (없을 때만)
    const existing = await listCodeSettings().catch(() => []);
    if (!existing.length) {
      const defaults = [
        { codeType: 'work_type', codeValue: '배관수리', sortOrder: 1 },
        { codeType: 'work_type', codeValue: '분배기교체', sortOrder: 2 },
        { codeType: 'work_type', codeValue: '밸브교체', sortOrder: 3 },
        { codeType: 'work_type', codeValue: '온도조절기교체', sortOrder: 4 },
        { codeType: 'work_type', codeValue: '열량계교체', sortOrder: 5 },
        { codeType: 'work_type', codeValue: '배관청소', sortOrder: 6 },
        { codeType: 'work_type', codeValue: '기타', sortOrder: 7 },
        { codeType: 'urgency', codeValue: '일반', sortOrder: 1 },
        { codeType: 'urgency', codeValue: '긴급', sortOrder: 2 },
        { codeType: 'urgency', codeValue: '초긴급', sortOrder: 3 },
        { codeType: 'channel', codeValue: '전화', sortOrder: 1 },
        { codeType: 'channel', codeValue: '앱', sortOrder: 2 },
        { codeType: 'channel', codeValue: '홈페이지', sortOrder: 3 },
        { codeType: 'channel', codeValue: '현장', sortOrder: 4 },
        { codeType: 'channel', codeValue: '기타', sortOrder: 5 },
        { codeType: 'as_status', codeValue: '접수', sortOrder: 1 },
        { codeType: 'as_status', codeValue: '처리중', sortOrder: 2 },
        { codeType: 'as_status', codeValue: '완료', sortOrder: 3 },
        { codeType: 'as_status', codeValue: '보류', sortOrder: 4 },
        { codeType: 'customer_type', codeValue: '개인', sortOrder: 1 },
        { codeType: 'customer_type', codeValue: '법인', sortOrder: 2 },
        { codeType: 'customer_type', codeValue: '아파트관리소', sortOrder: 3 },
        { codeType: 'pay_method', codeValue: '현금', sortOrder: 1 },
        { codeType: 'pay_method', codeValue: '카드', sortOrder: 2 },
        { codeType: 'pay_method', codeValue: '계좌이체', sortOrder: 3 },
        { codeType: 'pay_method', codeValue: '미수', sortOrder: 4 },
      ];
      for (const d of defaults) {
        await addCodeSetting(d).catch(() => {});
      }
    }
    _workMgmtTablesEnsured = true;
    console.log('[Database] Work management tables ensured.');
  } catch (error) {
    console.warn('[Database] Failed to ensure work management tables:', error);
  }
}

// ─── 견적서 ID로 접수건 조회 (중복방지용) ──────────────────────────
export async function findRepairByEstimateId(estimateId: number): Promise<RepairRequest | null> {
  const db2 = await getDb();
  if (!db2) return null;
  const { repairRequests: rr } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const rows = await db2.select().from(rr)
    .where(eq((rr as any).fromEstimateId, estimateId))
    .limit(1);
  return (rows[0] as any) ?? null;
}

// ─── 접수건 부분 업데이트 (id 기준) ────────────────────────────────
export async function updateRepairRequestById(id: number, data: Record<string, any>): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const { repairRequests: rr } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  await db2.update(rr).set(data as any).where(eq(rr.id, id));
}

// ─── repair_requests 테이블 컬럼 자동 추가 (접수전환 기능) ──────────────────
let _repairRequestsColumnsEnsured = false;
export function resetRepairRequestsColumnsFlag() { _repairRequestsColumnsEnsured = false; }
export async function ensureRepairRequestsColumns(): Promise<void> {
  if (_repairRequestsColumnsEnsured) return;
  const db2 = await getDb();
  if (!db2) return;
  // INFORMATION_SCHEMA로 기존 컬럼 목록 조회 (MySQL 5.7 호환)
  const dbName = process.env.DB_NAME || process.env.DATABASE_URL?.match(/\/([^/?]+)(\?|$)/)?.[1] || '';
  let existingCols: Set<string> = new Set();
  try {
    const rawRows = await db2.execute(sql.raw(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'repair_requests'${dbName ? ` AND TABLE_SCHEMA = '${dbName}'` : ''}`
    )) as any;
    // drizzle mysql2 execute returns [rows, fields] tuple; rows itself may be the array
    let arr: any[] = [];
    if (Array.isArray(rawRows)) {
      // rawRows[0] is the actual rows array when using mysql2 pool
      arr = Array.isArray(rawRows[0]) ? rawRows[0] : rawRows;
    }
    arr.forEach((r: any) => { if (r?.COLUMN_NAME) existingCols.add(r.COLUMN_NAME); });
    console.log('[DB] ensureRepairRequestsColumns: existing cols count=', existingCols.size, 'cols=', [...existingCols].join(','));
  } catch (e: any) {
    console.warn('[DB] ensureRepairRequestsColumns: INFORMATION_SCHEMA query failed', e?.message);
  }
  const colDefs: Array<{ name: string; ddl: string }> = [
    { name: 'fromEstimateId', ddl: 'int NULL' },
    { name: 'estimateId', ddl: 'int NULL' },
    { name: 'estimateTotal', ddl: 'decimal(12,2) NULL' },
    { name: 'addressFull', ddl: 'text NULL' },
    { name: 'addressDetail', ddl: 'text NULL' },
    { name: 'requestContent', ddl: 'text NULL' },
    { name: 'customerPreferredDate', ddl: 'varchar(20) NULL' },
    { name: 'customerPreferredTime', ddl: 'varchar(20) NULL' },
    { name: 'scheduleChangeReason', ddl: 'text NULL' },
    { name: 'isUrgent', ddl: 'boolean NOT NULL DEFAULT false' },
    { name: 'ownerType', ddl: "ENUM('unassigned','headquarters','branch') NOT NULL DEFAULT 'unassigned'" },
    // 기사 워크플로우 컨럼 (schema.ts에 있지만 DB에 없을 수 있음)
    { name: 'departedAt', ddl: 'timestamp NULL' },
    { name: 'arrivedAt', ddl: 'timestamp NULL' },
    { name: 'workStartedAt', ddl: 'timestamp NULL' },
    { name: 'technicianConfirmedAt', ddl: 'timestamp NULL' },
  ];
  for (const col of colDefs) {
    if (existingCols.has(col.name)) continue;
    try {
      await db2.execute(sql.raw(`ALTER TABLE \`repair_requests\` ADD COLUMN \`${col.name}\` ${col.ddl}`));
      console.log(`[DB] ensureRepairRequestsColumns: added ${col.name}`);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!msg.includes('Duplicate column') && (e as any)?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('[DB] ensureRepairRequestsColumns:', col.name, msg);
      }
    }
  }
  // fromEstimateId unique 인덱스 추가 (중복 접수 방지)
  try {
    await db2.execute(sql.raw("ALTER TABLE `repair_requests` ADD UNIQUE INDEX `uq_fromEstimateId` (`fromEstimateId`)"));
  } catch (e: any) {
    if (!String(e?.message || '').includes('Duplicate key name') && (e as any)?.code !== 'ER_DUP_KEYNAME') {
      console.warn('[DB] ensureRepairRequestsColumns unique index:', (e as any)?.message);
    }
  }
  _repairRequestsColumnsEnsured = true;
  console.log('[Database] repair_requests columns ensured (fromEstimateId, customerPreferredDate, customerPreferredTime).');
}

// app_roles.id로 직접 필드 업데이트 (관리자용)
export async function updateAppRoleById(
  id: number,
  fields: Partial<Pick<InsertAppRole, "passwordHash" | "mustChangePassword" | "isActive" | "name" | "phoneNumber" | "branchId" | "appRole" | "loginId" | "userId">>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appRoles).set(fields).where(eq(appRoles.id, id));
}

// app_roles 테이블에서 phoneNumber로 기사 조회 (정규화)
export async function getAppRolesByPhoneNormalized(phoneNumber: string): Promise<AppRole[]> {
  const db = await getDb();
  if (!db) return [];
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const rows = await db.select().from(appRoles)
    .where(and(eq(appRoles.appRole, "technician"), eq(appRoles.isActive, true)));
  return rows.filter((r: any) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
}

// ─── 기사앱 버전 관리 함수 ─────────────────────────────────────────────
export async function getLatestAppRelease(appId: string = "driver"): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await ensureMobileAppReleasesTable();
    const { mobileAppReleases } = await import("../drizzle/schema.js");
    const { desc } = await import("drizzle-orm");
    const rows = await db.select().from(mobileAppReleases)
      .where(eq(mobileAppReleases.appId, appId))
      .orderBy(desc(mobileAppReleases.versionCode))
      .limit(1);
    return rows[0] ?? null;
  } catch (e: any) {
    console.error("[DB] getLatestAppRelease:", e.message);
    return null;
  }
}

export async function getAllAppReleases(appId: string = "driver"): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    await ensureMobileAppReleasesTable();
    const { mobileAppReleases } = await import("../drizzle/schema.js");
    const { desc } = await import("drizzle-orm");
    return await db.select().from(mobileAppReleases)
      .where(eq(mobileAppReleases.appId, appId))
      .orderBy(desc(mobileAppReleases.versionCode));
  } catch (e: any) {
    console.error("[DB] getAllAppReleases:", e.message);
    return [];
  }
}

export async function createAppRelease(data: {
  appId?: string;
  versionName: string;
  versionCode: number;
  minSupportedVersionCode?: number;
  apkUrl: string;
  sha256?: string;
  fileSize?: number;
  releaseNotes?: string;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureMobileAppReleasesTable();
  const { mobileAppReleases } = await import("../drizzle/schema.js");
  const appId = data.appId ?? "driver";
  // 기존 latest 해제
  await db.update(mobileAppReleases)
    .set({ isLatest: false })
    .where(and(eq(mobileAppReleases.appId, appId), eq(mobileAppReleases.isLatest, true)));
  // 새 버전 등록
  const result = await db.insert(mobileAppReleases).values({
    appId,
    versionName: data.versionName,
    versionCode: data.versionCode,
    minSupportedVersionCode: data.minSupportedVersionCode ?? 1,
    apkUrl: data.apkUrl,
    sha256: data.sha256 ?? null,
    fileSize: data.fileSize ?? null,
    releaseNotes: data.releaseNotes ?? null,
    isLatest: true,
    publishedAt: new Date(),
  });
  return result;
}

let _mobileAppReleasesTableEnsured = false;
export async function ensureMobileAppReleasesTable(): Promise<void> {
  if (_mobileAppReleasesTableEnsured) return;
  const db2 = await getDb();
  if (!db2) return;
  try {
    await db2.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS `mobile_app_releases` (" +
      "  `id` INT AUTO_INCREMENT PRIMARY KEY," +
      "  `appId` VARCHAR(100) NOT NULL DEFAULT \'driver\'," +
      "  `versionName` VARCHAR(50) NOT NULL," +
      "  `versionCode` INT NOT NULL," +
      "  `minSupportedVersionCode` INT NOT NULL DEFAULT 1," +
      "  `apkUrl` TEXT NOT NULL," +
      "  `sha256` VARCHAR(64)," +
      "  `fileSize` INT," +
      "  `releaseNotes` TEXT," +
      "  `isLatest` BOOLEAN NOT NULL DEFAULT FALSE," +
      "  `publishedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
      ")"
    ));
    // iOS 전용 컬럼 추가 (기존 테이블에 없을 경우)
    const iosColumns = [
      "ALTER TABLE `mobile_app_releases` ADD COLUMN IF NOT EXISTS `iosBuildNumber` VARCHAR(20)",
      "ALTER TABLE `mobile_app_releases` ADD COLUMN IF NOT EXISTS `iosMinSupportedBuildNumber` VARCHAR(20)",
      "ALTER TABLE `mobile_app_releases` ADD COLUMN IF NOT EXISTS `iosDistributionType` VARCHAR(20)",
      "ALTER TABLE `mobile_app_releases` ADD COLUMN IF NOT EXISTS `iosTestFlightUrl` TEXT",
      "ALTER TABLE `mobile_app_releases` ADD COLUMN IF NOT EXISTS `iosAppStoreUrl` TEXT",
    ];
    for (const alterSql of iosColumns) {
      try { await db2.execute(sql.raw(alterSql)); } catch (_) {}
    }
    _mobileAppReleasesTableEnsured = true;
    console.log("[Database] mobile_app_releases table ensured.");
  } catch (e: any) {
    if (!String(e?.message || "").includes("already exists")) {
      console.warn("[DB] ensureMobileAppReleasesTable:", e?.message);
    }
    _mobileAppReleasesTableEnsured = true;
  }
}

// ─── 전시 모니터 슬라이드 DB 함수 ──────────────────────────────────────────

export async function getActiveDisplaySlides() {
  const db2 = await getDb();
  if (!db2) return [];
  try {
    const rows = await db2.execute(sql.raw(`SELECT * FROM display_slides WHERE isActive = 1 ORDER BY sortOrder ASC, id ASC`)) as any;
    return Array.isArray(rows[0]) ? rows[0] : [];
  } catch { return []; }
}

export async function getAllDisplaySlides() {
  const db2 = await getDb();
  if (!db2) return [];
  try {
    const rows = await db2.execute(sql.raw(`SELECT * FROM display_slides ORDER BY sortOrder ASC, id ASC`)) as any;
    return Array.isArray(rows[0]) ? rows[0] : [];
  } catch { return []; }
}

export async function createDisplaySlide(data: { sortOrder: number; slideType: string; title: string; body?: string; durationMs: number; isActive: boolean; updatedBy: number; }) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  const bodyVal = data.body ? `'${data.body.replace(/'/g, "''")}'` : 'NULL';
  const titleVal = `'${data.title.replace(/'/g, "''")}'`;
  await db2.execute(sql.raw(`INSERT INTO display_slides (sortOrder, slideType, title, body, durationMs, isActive, updatedBy) VALUES (${data.sortOrder}, '${data.slideType}', ${titleVal}, ${bodyVal}, ${data.durationMs}, ${data.isActive ? 1 : 0}, ${data.updatedBy})`));
}

export async function updateDisplaySlide(id: number, data: { sortOrder?: number; slideType?: string; title?: string; body?: string; durationMs?: number; isActive?: boolean; updatedBy: number; }) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  const sets: string[] = [];
  if (data.sortOrder !== undefined) sets.push(`sortOrder = ${data.sortOrder}`);
  if (data.slideType !== undefined) sets.push(`slideType = '${data.slideType}'`);
  if (data.title !== undefined) sets.push(`title = '${data.title.replace(/'/g, "''")}'`);
  if (data.body !== undefined) sets.push(`body = '${data.body.replace(/'/g, "''")}'`);
  if (data.durationMs !== undefined) sets.push(`durationMs = ${data.durationMs}`);
  if (data.isActive !== undefined) sets.push(`isActive = ${data.isActive ? 1 : 0}`);
  sets.push(`updatedBy = ${data.updatedBy}`);
  if (sets.length === 0) return;
  await db2.execute(sql.raw(`UPDATE display_slides SET ${sets.join(', ')} WHERE id = ${id}`));
}

export async function deleteDisplaySlide(id: number) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  await db2.execute(sql.raw(`DELETE FROM display_slides WHERE id = ${id}`));
}

export async function reorderDisplaySlides(orders: { id: number; sortOrder: number }[]) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  for (const o of orders) {
    await db2.execute(sql.raw(`UPDATE display_slides SET sortOrder = ${o.sortOrder} WHERE id = ${o.id}`));
  }
}

export async function seedDefaultDisplaySlides() {
  const db2 = await getDb();
  if (!db2) return;
  try {
    const rows = await db2.execute(sql.raw(`SELECT COUNT(*) as cnt FROM display_slides`)) as any;
    const cnt = Number((Array.isArray(rows[0]) ? rows[0][0] : {})?.cnt ?? 0);
    if (cnt > 0) return;
    const defaults = [
      { sortOrder: 1, slideType: 'brand', title: '퓨처에너지테크 지역난방센터', body: JSON.stringify(['분배기 · 구동기 · 온도조절기 전문 교체', '누수감지 · 유량 이상감지 스마트 센서', '빠른 출동 · 당일 처리 원칙', '행복한마을점 공식 운영']), durationMs: 20000 },
      { sortOrder: 2, slideType: 'service', title: '지역난방 전문 서비스 한 곳에서 해결', body: JSON.stringify(['난방 장치 교체 - 분배기, 구동기, 온도조절기 전문 교체', '누수 · 배관 청소 - 신속 출동, 배관 청소로 난방 효율 회복', '스마트 센서 설치 - 누수감지 · 유량 이상감지 센서 24시간 모니터링']), durationMs: 15000 },
      { sortOrder: 3, slideType: 'sensor', title: '누수감지 센서', body: JSON.stringify(['분배기 주변 누수 발생 즉시 감지 · 문자 알림', '배터리 구동으로 정전 시에도 정상 작동', '설치 후 24시간 자동 모니터링 · 원격 상태 확인', '누수 발생 시 기사 즉시 출동 연결']), durationMs: 15000 },
      { sortOrder: 4, slideType: 'sensor', title: '유량 이상감지 센서', body: JSON.stringify(['세대별 기준 유량 설정 · 이탈 시 즉시 알림', '스트레이너 후단 유속·유량 이상 실시간 감지', '10분 이상 이상 지속 시 자동 SMS 발송', '관리자 웹 화면에서 전체 세대 현황 한눈에 확인']), durationMs: 15000 },
      { sortOrder: 5, slideType: 'symptom', title: '이런 증상이 있으시면 바로 연락주세요', body: JSON.stringify(['난방이 약해요 - 온도조절기 설정 온도까지 올라가지 않는 경우', '물이 새는 것 같아요 - 분배기 주변 바닥이 젖어있는 경우', '소음이 심해요 - 배관에서 쿵쿵거리거나 물 흐르는 소리', '온도조절기 고장 - 화면이 꺼지거나 버튼이 작동하지 않는 경우']), durationMs: 15000 },
      { sortOrder: 6, slideType: 'qr', title: '상담 예약 · QR 접수', body: JSON.stringify(['010-3440-7310', 'https://퓨처에너지테크.kr']), durationMs: 15000 },
    ];
    for (const s of defaults) {
      const titleVal = s.title.replace(/'/g, "''");
      const bodyVal = s.body.replace(/'/g, "''");
      await db2.execute(sql.raw(`INSERT INTO display_slides (sortOrder, slideType, title, body, durationMs, isActive, updatedBy) VALUES (${s.sortOrder}, '${s.slideType}', '${titleVal}', '${bodyVal}', ${s.durationMs}, 1, 0)`));
    }
    console.log('[Display] 기본 슬라이드 6개 초기화 완료');
  } catch (e: any) { console.warn('[Display] seedDefaultDisplaySlides:', e?.message); }
}

export async function migrateDisplaySlideUrls() {
  const db2 = await getDb();
  if (!db2) return;
  try {
    // 슬라이드 6번 QR 슬라이드의 구 URL을 공식 URL로 업데이트
    await db2.execute(sql.raw(`UPDATE display_slides SET body = REPLACE(body, 'https://www.futureenergytech.co.kr', 'https://퓨처에너지테크.kr') WHERE slideType = 'qr' AND body LIKE '%futureenergytech.co.kr%'`));
    console.log('[Display] 슬라이드 URL 마이그레이션 완료');
  } catch (e: any) { console.warn('[Display] migrateDisplaySlideUrls:', e?.message); }
}
export async function getDisplayDeviceSession(sessionToken: string) {
  const db2 = await getDb();
  if (!db2) return null;
  try {
    const escaped = sessionToken.replace(/'/g, "''");
    const rows = await db2.execute(sql.raw(`SELECT * FROM display_device_sessions WHERE sessionToken = '${escaped}' AND isActive = 1 LIMIT 1`)) as any;
    const list = Array.isArray(rows[0]) ? rows[0] : [];
    return list[0] ?? null;
  } catch { return null; }
}

export async function createDisplayDeviceSession(data: { sessionToken: string; deviceName: string; registeredBy: number; }) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  const tokenEsc = data.sessionToken.replace(/'/g, "''");
  const nameEsc = data.deviceName.replace(/'/g, "''");
  await db2.execute(sql.raw(`INSERT INTO display_device_sessions (sessionToken, deviceName, registeredBy, lastSeenAt, isActive) VALUES ('${tokenEsc}', '${nameEsc}', ${data.registeredBy}, NOW(), 1)`));
}

export async function touchDisplayDeviceSession(sessionToken: string) {
  const db2 = await getDb();
  if (!db2) return;
  try {
    const escaped = sessionToken.replace(/'/g, "''");
    await db2.execute(sql.raw(`UPDATE display_device_sessions SET lastSeenAt = NOW() WHERE sessionToken = '${escaped}'`));
  } catch { /* 무시 */ }
}

export async function getAllDisplayDeviceSessions() {
  const db2 = await getDb();
  if (!db2) return [];
  try {
    const rows = await db2.execute(sql.raw(`SELECT id, deviceName, registeredBy, lastSeenAt, expiresAt, isActive, createdAt FROM display_device_sessions ORDER BY createdAt DESC`)) as any;
    return Array.isArray(rows[0]) ? rows[0] : [];
  } catch { return []; }
}

export async function deactivateDisplayDeviceSession(id: number) {
  const db2 = await getDb();
  if (!db2) throw new Error("DB unavailable");
  await db2.execute(sql.raw(`UPDATE display_device_sessions SET isActive = 0 WHERE id = ${id}`));
}

export async function ensureDisplayTables() {
  const db2 = await getDb();
  if (!db2) return;
  try {
    await db2.execute(sql.raw(`CREATE TABLE IF NOT EXISTS display_slides (id INT AUTO_INCREMENT PRIMARY KEY, sortOrder INT NOT NULL DEFAULT 0, slideType ENUM('brand','service','sensor','symptom','qr') NOT NULL DEFAULT 'brand', title VARCHAR(200) NOT NULL, body TEXT, durationMs INT NOT NULL DEFAULT 15000, isActive BOOLEAN NOT NULL DEFAULT TRUE, updatedBy INT, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
    await db2.execute(sql.raw(`CREATE TABLE IF NOT EXISTS display_device_sessions (id INT AUTO_INCREMENT PRIMARY KEY, sessionToken VARCHAR(128) NOT NULL UNIQUE, deviceName VARCHAR(100), registeredBy INT NOT NULL, lastSeenAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt TIMESTAMP NULL, isActive BOOLEAN NOT NULL DEFAULT TRUE, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`));
    await db2.execute(sql.raw(`CREATE TABLE IF NOT EXISTS display_admin_sessions (id INT AUTO_INCREMENT PRIMARY KEY, sessionToken VARCHAR(128) NOT NULL UNIQUE, userId INT NOT NULL, expiresAt BIGINT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`));
    console.log('[Display] display_slides, display_device_sessions, display_admin_sessions 테이블 확인 완료');
  } catch (e: any) { console.warn('[Display] ensureDisplayTables:', e?.message); }
}

// ─── 관리자 세션 DB 함수 ─────────────────────────────────────────────────────
export async function createAdminSession(sessionToken: string, userId: number, expiresAt: number): Promise<void> {
  const db2 = await getDb();
  if (!db2) throw new Error('DB unavailable');
  const esc = sessionToken.replace(/'/g, "''");
  // 만료된 세션 정리
  await db2.execute(sql.raw(`DELETE FROM display_admin_sessions WHERE expiresAt < ${Date.now()}`)).catch(() => {});
  await db2.execute(sql.raw(`INSERT INTO display_admin_sessions (sessionToken, userId, expiresAt) VALUES ('${esc}', ${userId}, ${expiresAt})`));
}

export async function getAdminSession(sessionToken: string): Promise<{ userId: number; expiresAt: number } | null> {
  const db2 = await getDb();
  if (!db2) return null;
  const esc = sessionToken.replace(/'/g, "''");
  try {
    const rows = await db2.execute(sql.raw(`SELECT userId, expiresAt FROM display_admin_sessions WHERE sessionToken = '${esc}' AND expiresAt > ${Date.now()} LIMIT 1`)) as any;
    // mysql2 drizzle execute 결과: [RowDataPacket[], FieldPacket[]]
    // rows[0]은 RowDataPacket 배열, rows[0][0]이 첫 번째 행
    const resultSet = Array.isArray(rows[0]) ? rows[0] : rows;
    const data = resultSet[0] ?? null;
    if (!data) return null;
    return { userId: Number(data.userId), expiresAt: Number(data.expiresAt) };
  } catch { return null; }
}

export async function deleteAdminSession(sessionToken: string): Promise<void> {
  const db2 = await getDb();
  if (!db2) return;
  const esc = sessionToken.replace(/'/g, "''");
  await db2.execute(sql.raw(`DELETE FROM display_admin_sessions WHERE sessionToken = '${esc}'`)).catch(() => {});
}

// ─── 유량 알림 v1.1 DB 함수 ──────────────────────────────────────────────────

/** 최근 N분 이내 유량 로그 조회 (5분 평균 계산용) */
export async function getFlowRateLogsAfter(sensorId: string, minutes: number) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return db.select().from(flowRateLogs)
    .where(and(eq(flowRateLogs.sensorId, sensorId), sql`${flowRateLogs.measuredAt} >= ${since}`))
    .orderBy(desc(flowRateLogs.measuredAt));
}

/** flowRateSettings v1.1 전용 필드 업데이트 */
export async function updateFlowRateSettingV11Fields(
  sensorId: string,
  data: {
    meterType?: "적산열량계" | "유량계" | null;
    registeredPyeong?: string | null;
    lowerLimitLpm?: string | null;
    upperLimitLpm?: string | null;
    stabilizingStartedAt?: Date | null;
    alertType?: "저유량" | "고유량" | "통신끊김" | null;
    alertNormalStartedAt?: Date | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(flowRateSettings).set(data as Record<string, unknown>).where(eq(flowRateSettings.sensorId, sensorId));
}

/** 유량 알림 이벤트 생성 */
export async function createFlowRateAlertEvent(data: {
  sensorId: string;
  branchId: number | null;
  apartmentName: string;
  buildingNumber: string;
  roomNumber: string;
  meterType: "적산열량계" | "유량계";
  registeredPyeong: string;
  alertType: "저유량" | "고유량" | "통신끊김";
  avgFlowRateLpm: string | null;
  lowerLimitLpm: string | null;
  upperLimitLpm: string | null;
  alertStartedAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(flowRateAlertEvents).values(data as any);
}

/** 진행 중인 이상 이벤트에 SMS 발송 기록 */
export async function updateFlowRateAlertEventSmsSent(
  sensorId: string,
  data: {
    smsSentAt: Date;
    smsContent: string;
    smsRecipient: string;
    avgFlowRateLpm: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 가장 최근 미발송 이벤트에 업데이트
  const rows = await db.select().from(flowRateAlertEvents)
    .where(and(
      eq(flowRateAlertEvents.sensorId, sensorId),
      isNull(flowRateAlertEvents.smsSentAt),
      isNull(flowRateAlertEvents.resolvedAt)
    ))
    .orderBy(desc(flowRateAlertEvents.alertStartedAt))
    .limit(1);
  if (rows.length === 0) return;
  await db.update(flowRateAlertEvents)
    .set(data as any)
    .where(eq(flowRateAlertEvents.id, rows[0].id));
}

/** 진행 중인 이상 이벤트 종료 처리 */
export async function resolveActiveFlowRateAlertEvent(sensorId: string, resolvedAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(flowRateAlertEvents)
    .set({ resolvedAt, normalReturnedAt: resolvedAt } as any)
    .where(and(
      eq(flowRateAlertEvents.sensorId, sensorId),
      isNull(flowRateAlertEvents.resolvedAt)
    ));
}

/** 유량 알림 이벤트 이력 조회 */
export async function getFlowRateAlertEvents(
  sensorId?: string,
  limit = 50
): Promise<FlowRateAlertEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(flowRateAlertEvents);
  if (sensorId) {
    return q.where(eq(flowRateAlertEvents.sensorId, sensorId))
      .orderBy(desc(flowRateAlertEvents.alertStartedAt))
      .limit(limit);
  }
  return q.orderBy(desc(flowRateAlertEvents.alertStartedAt)).limit(limit);
}

/** 전체 유량 알림 이벤트 이력 (관리화면용) */
export async function getAllFlowRateAlertEvents(limit = 200): Promise<FlowRateAlertEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flowRateAlertEvents)
    .orderBy(desc(flowRateAlertEvents.alertStartedAt))
    .limit(limit);
}
