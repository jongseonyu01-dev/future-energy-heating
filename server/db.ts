import { eq, desc, or, and } from "drizzle-orm";
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
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(scheduledTime ? { scheduledTime } : {}),
    })
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
    .set({ scheduledDate, scheduledTime })
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
    .where(eq(technicians.isActive, true))
    .orderBy(desc(technicians.createdAt));
}

// 전체 기사 목록 (관리자용 - 비활성 포함)
export async function getAllTechnicians(): Promise<Technician[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(technicians).orderBy(desc(technicians.createdAt));
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
