import { eq, desc, or, and, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  FlowRateSetting,
  InsertFlowRateSetting,
  InsertFlowRateLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    .where(eq(repairRequests.isDeleted, false))
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
      status: "방문예정",
      workflowStage: scheduledDate && scheduledTime ? "일정확정" : "기사배정",
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(scheduledTime ? { scheduledTime } : {}),
    })
    .where(eq(repairRequests.id, id));
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
export async function updateInspectionResult(
  id: number,
  inspectionResult: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(repairRequests)
    .set({ inspectionResult, status: "작업완료" })
    .where(eq(repairRequests.id, id));
}

// ─── 기사 관리 ─────────────────────────────────────────────────
// 활성 기사 목록
export async function getActiveTechnicians(): Promise<Technician[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(technicians)
    .where(and(eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
    .orderBy(desc(technicians.createdAt));
}

// 전체 기사 목록 (관리자용 - 비활성 포함)
export async function getAllTechnicians(): Promise<Technician[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(technicians).where(eq(technicians.isDeleted, false)).orderBy(desc(technicians.createdAt));
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

// ─── 누수센서 ─────────────────────────────────────────────────
import {
  leakSensors,
  sensorEvents,
  LeakSensor,
  InsertLeakSensor,
  InsertSensorEvent,
} from "../drizzle/schema";

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
} from "../drizzle/schema";
import { like, sql } from "drizzle-orm";

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
  return db.select().from(branches).where(eq(branches.isDeleted, false)).orderBy(branches.name);
}

export async function getActiveBranches(): Promise<Branch[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).where(and(eq(branches.isActive, true), eq(branches.isDeleted, false))).orderBy(branches.name);
}

export async function getBranchById(id: number): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return rows[0] ?? null;
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
export async function findBranchByAddress(address: string): Promise<Branch | null> {
  const db = await getDb();
  if (!db) return null;
  const mappings = await db
    .select()
    .from(regionMappings)
    .orderBy(desc(regionMappings.priority));
  for (const mapping of mappings) {
    if (address.includes(mapping.keyword)) {
      const branch = await getBranchById(mapping.branchId);
      if (branch?.isActive) return branch;
    }
  }
  return null;
}

// 지역 매핑 목록 조회
export async function getRegionMappings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(regionMappings).orderBy(desc(regionMappings.priority));
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
    .where(and(eq(repairRequests.branchId, branchId), eq(repairRequests.isDeleted, false)))
    .orderBy(desc(repairRequests.createdAt));
}

// 기사별 배정 접수 조회
export async function getRepairRequestsByTechnician(technicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairRequests)
    .where(and(eq(repairRequests.technicianId, technicianId), eq(repairRequests.isDeleted, false)))
    .orderBy(desc(repairRequests.createdAt));
}

// 접수 지사 재배정 (본사 관리자용)
export async function reassignBranch(requestId: number, branchId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests).set({ branchId }).where(eq(repairRequests.id, requestId));
}

// ─── 본사 직속 기사 조회 (branchId=null) ──────────────────────
export async function getHQTechnicians() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(technicians)
    .where(and(isNull(technicians.branchId), eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
    .orderBy(technicians.name);
}

// ─── ownerType 기반 배정 ──────────────────────────────────────
export async function assignToHeadquarters(requestId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests).set({
    ownerType: "headquarters",
    branchId: null,
    status: "본사배정",
    workflowStage: "현장확인",
  }).where(eq(repairRequests.id, requestId));
}

export async function assignToBranch(requestId: number, branchId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests).set({
    ownerType: "branch",
    branchId,
    status: "지사배정",
    workflowStage: "지사배정",
  }).where(eq(repairRequests.id, requestId));
}

// ─── 기사 지사별 조회 ──────────────────────────────────────────
export async function getTechniciansByBranch(branchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(technicians)
    .where(and(eq(technicians.branchId, branchId), eq(technicians.isActive, true), eq(technicians.isDeleted, false)))
    .orderBy(technicians.name);
}

// id로 기사 조회
export async function getTechnicianById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(technicians).where(eq(technicians.id, id)).limit(1);
  return rows[0] ?? null;
}

// userId로 기사 조회
export async function getTechnicianByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(technicians).where(eq(technicians.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// phoneNumber로 기사 조회 (앱 가입 기사 매칭용 - userId 있는 것 우선)
export async function getTechnicianByPhone(phoneNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const rows = await db.select().from(technicians)
    .where(eq(technicians.isActive, true))
    .orderBy(desc(technicians.id));
  // userId가 있는 레코드 우선
  const withUserId = rows.filter((r: Technician) => r.userId !== null && r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
  if (withUserId.length > 0) return withUserId[0];
  const byPhone = rows.filter((r: Technician) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
  return byPhone[0] ?? null;
}

// userId로 기사 조회 + 없으면 phoneNumber로 fallback
export async function getTechnicianByUserIdOrPhone(userId: number, phoneNumber?: string | null) {
  const byUserId = await getTechnicianByUserId(userId);
  if (byUserId) return byUserId;
  if (phoneNumber) return getTechnicianByPhone(phoneNumber);
  return null;
}

// technicians 레코드에 userId 연결 (앱 가입 기사 매칭 후 최초 1회 업데이트)
export async function updateTechnicianUserId(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(technicians).set({ userId }).where(eq(technicians.id, id));
}

// ─── soft delete (삭제) ────────────────────────────────────────
// 접수/오더 단건 soft delete
export async function softDeleteRepairRequest(id: number, deletedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests)
    .set({ isDeleted: true, deletedAt: new Date(), deletedBy })
    .where(eq(repairRequests.id, id));
}

// 기사 soft delete
export async function softDeleteTechnician(id: number, deletedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(technicians)
    .set({ isDeleted: true, isActive: false, deletedAt: new Date(), deletedBy })
    .where(eq(technicians.id, id));
}

// 진행중(미완료) 배정 작업 수 (기사 삭제 전 체크용)
export async function countActiveAssignmentsByTechnician(technicianId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(repairRequests)
    .where(and(
      eq(repairRequests.technicianId, technicianId),
      eq(repairRequests.isDeleted, false),
    ));
  return rows.filter((r: RepairRequest) => r.status !== "작업완료").length;
}

// 고객(전화번호 기준) 접수 전체 soft delete → 고객 삭제
export async function softDeleteCustomerByPhone(phoneNumber: string, deletedBy: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  const all = await db.select().from(repairRequests).where(eq(repairRequests.isDeleted, false));
  const targets = all.filter((r: RepairRequest) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
  for (const t of targets) {
    await db.update(repairRequests)
      .set({ isDeleted: true, deletedAt: new Date(), deletedBy })
      .where(eq(repairRequests.id, t.id));
  }
  return targets.length;
}

// 지사 soft delete (옵션: transfer = 소속 데이터 본사 이관 / cascade = 함께 삭제)
export async function softDeleteBranch(
  id: number,
  deletedBy: number,
  mode: "transfer" | "cascade",
): Promise<{ technicians: number; requests: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 소속 기사
  const techs = await db.select().from(technicians)
    .where(and(eq(technicians.branchId, id), eq(technicians.isDeleted, false)));
  // 소속 접수
  const reqs = await db.select().from(repairRequests)
    .where(and(eq(repairRequests.branchId, id), eq(repairRequests.isDeleted, false)));
  if (mode === "transfer") {
    // 기사/접수를 본사 직속(branchId=null)으로 이관
    for (const t of techs) {
      await db.update(technicians).set({ branchId: null }).where(eq(technicians.id, t.id));
    }
    for (const r of reqs) {
      await db.update(repairRequests).set({ branchId: null }).where(eq(repairRequests.id, r.id));
    }
  } else {
    // cascade: 소속 기사/접수 함께 soft delete
    for (const t of techs) {
      await db.update(technicians)
        .set({ isDeleted: true, isActive: false, deletedAt: new Date(), deletedBy })
        .where(eq(technicians.id, t.id));
    }
    for (const r of reqs) {
      await db.update(repairRequests)
        .set({ isDeleted: true, deletedAt: new Date(), deletedBy })
        .where(eq(repairRequests.id, r.id));
    }
  }
  // 지사 본체 soft delete
  await db.update(branches)
    .set({ isDeleted: true, isActive: false, deletedAt: new Date(), deletedBy })
    .where(eq(branches.id, id));
  return { technicians: techs.length, requests: reqs.length };
}

// 삭제 항목 복구 (본사 전용)
export async function restoreBranch(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(branches).set({ isDeleted: false, isActive: true, deletedAt: null, deletedBy: null }).where(eq(branches.id, id));
}
export async function restoreTechnician(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(technicians).set({ isDeleted: false, isActive: true, deletedAt: null, deletedBy: null }).where(eq(technicians.id, id));
}
export async function restoreRepairRequest(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairRequests).set({ isDeleted: false, deletedAt: null, deletedBy: null }).where(eq(repairRequests.id, id));
}

// ─── 작업 보고서 ───────────────────────────────────────────────
export async function getWorkReportByRequestId(requestId: number): Promise<WorkReport | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(workReports).where(eq(workReports.requestId, requestId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertWorkReport(data: InsertWorkReport): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getWorkReportByRequestId(data.requestId);
  if (existing) {
    await db.update(workReports).set(data).where(eq(workReports.id, existing.id));
    return { id: existing.id };
  }
  const result = await db.insert(workReports).values(data);
  return { id: (result as any)[0].insertId };
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
  data: Partial<Pick<FlowRateSetting, "baseFlowRateLpm" | "warningRangePercent" | "cautionRangePercent" | "alertDurationMinutes" | "apartmentName" | "buildingNumber" | "roomNumber" | "branchId" | "customerId" | "inspectionStatus" | "inspectionMemo">>
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
    lastStatus: "정상" | "주의" | "경고";
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
import { locationSessions, locationConsents, LocationSession, InsertLocationSession } from "../drizzle/schema";

export async function createLocationSession(data: InsertLocationSession): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(locationSessions).values(data);
  const rows = await db.select().from(locationSessions)
    .where(eq(locationSessions.trackingToken, data.trackingToken))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLocationSessionByToken(token: string): Promise<LocationSession | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(locationSessions)
    .where(eq(locationSessions.trackingToken, token))
    .limit(1);
  return rows[0] ?? null;
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

export async function markLocationSessionSmsSent(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(locationSessions).set({ smsSentAt: new Date() } as Record<string, unknown>)
    .where(eq(locationSessions.trackingToken, token));
}

// 만료된 세션 자동 처리 (4시간 초과)
export async function expireOldLocationSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  // 이동중 상태이면서 expiresAt이 지난 세션
  const expiredRows = await db.select().from(locationSessions)
    .where(eq(locationSessions.status, "이동중"));
  for (const row of expiredRows) {
    if (row.expiresAt && new Date(row.expiresAt) < now) {
      await db.update(locationSessions).set({ status: "만료" } as Record<string, unknown>)
        .where(eq(locationSessions.id, row.id));
    }
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
