import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
} from "drizzle-orm/mysql-core";

// ─── 사용자 테이블 (기본 제공) ──────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── 앱 권한 (4단계) ────────────────────────────────────────────
// 별도 테이블로 관리하여 users 테이블을 건드리지 않음
export const appRoles = mysqlTable("app_roles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // users.id
  appRole: mysqlEnum("appRole", [
    "customer",    // 고객
    "technician",  // 현장 기사
    "branch_manager", // 지사장
    "hq_admin",    // 본사 관리자
  ]).notNull().default("customer"),
  // 비밀번호 기반 로그인 (Manus OAuth 미사용 시)
  loginId: varchar("loginId", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 128 }),
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 지사 테이블 ─────────────────────────────────────────────────
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),        // 예: 서울 강남지사
  code: varchar("code", { length: 20 }).notNull().unique(), // 예: GN
  region: varchar("region", { length: 100 }).notNull(),    // 예: 서울 강남구, 서초구
  managerName: varchar("managerName", { length: 50 }),
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  address: varchar("address", { length: 200 }),
  isActive: boolean("isActive").default(true).notNull(),
  // 지사장 userId (app_roles.userId)
  managerUserId: int("managerUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 지역 → 지사 매핑 테이블 ────────────────────────────────────
// 고객 주소의 키워드(시/구/동)와 지사를 연결
export const regionMappings = mysqlTable("region_mappings", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(), // branches.id
  keyword: varchar("keyword", { length: 100 }).notNull(), // 예: "강남구", "서초구"
  priority: int("priority").default(0).notNull(), // 높을수록 우선
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 처리 상태 enum ──────────────────────────────────────────────
export const repairStatusEnum = mysqlEnum("status", [
  "신규접수",
  "기사배정대기",
  "방문예정",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
]);

// ─── 증상 유형 enum ──────────────────────────────────────────────
export const symptomEnum = mysqlEnum("symptom", [
  "집전체가춥다",
  "방일부만춥다",
  "분배기에서물이샌다",
  "온도조절기가작동하지않는다",
  "난방비가많이나온다",
  "배관청소가필요하다",
  "기타문의",
]);

// ─── 접수 유형 enum ──────────────────────────────────────────────
export const requestTypeEnum = mysqlEnum("requestType", [
  "난방고장",
  "배관청소",
]);

// ─── 난방 접수 테이블 ────────────────────────────────────────────
export const repairRequests = mysqlTable("repair_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestNumber: varchar("requestNumber", { length: 30 }).notNull().unique(),
  // 지사 배정 (null = 본사 직접 관리)
  branchId: int("branchId"),
  // 고객 정보
  customerName: varchar("customerName", { length: 50 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  apartmentName: varchar("apartmentName", { length: 100 }).notNull(),
  dong: varchar("dong", { length: 20 }).notNull(),
  ho: varchar("ho", { length: 20 }).notNull(),
  // 접수 유형 및 증상
  requestType: requestTypeEnum.notNull().default("난방고장"),
  symptom: symptomEnum.notNull(),
  detailContent: text("detailContent"),
  photoUrl: text("photoUrl"),
  // 방문 희망 일정
  preferredDate: varchar("preferredDate", { length: 20 }),
  preferredTime: varchar("preferredTime", { length: 20 }),
  // 처리 상태
  status: mysqlEnum("status", [
    "신규접수",
    "기사배정대기",
    "방문예정",
    "작업진행중",
    "견적승인대기",
    "작업완료",
    "재방문필요",
  ]).notNull().default("신규접수"),
  // 배정된 기사 정보
  technicianId: int("technicianId"),
  technicianName: varchar("technicianName", { length: 50 }),
  // 방문 확정 일정
  scheduledDate: varchar("scheduledDate", { length: 20 }),
  scheduledTime: varchar("scheduledTime", { length: 20 }),
  // 관리자 메모
  adminMemo: text("adminMemo"),
  // 점검 결과
  inspectionResult: text("inspectionResult"),
  // 견적 금액
  estimateAmount: decimal("estimateAmount", { precision: 12, scale: 2 }),
  estimateApprovedAt: timestamp("estimateApprovedAt"),
  // 작업 완료 정보
  completedAt: timestamp("completedAt"),
  completionMemo: text("completionMemo"),
  // 재방문 여부
  needsRevisit: boolean("needsRevisit").default(false).notNull(),
  revisitReason: text("revisitReason"),
  // 타임스탬프
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 기사 테이블 ─────────────────────────────────────────────────
export const technicians = mysqlTable("technicians", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  specialty: varchar("specialty", { length: 100 }),
  // 소속 지사 (null = 본사 직속)
  branchId: int("branchId"),
  // 앱 로그인 userId 연결
  userId: int("userId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 현장 점검표 테이블 ──────────────────────────────────────────
export const workReports = mysqlTable("work_reports", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(), // repair_requests.id
  technicianId: int("technicianId").notNull(),
  // 점검 내용
  checkItems: text("checkItems"),        // JSON 배열
  usedMaterials: text("usedMaterials"),  // JSON 배열
  beforePhotoUrl: text("beforePhotoUrl"),
  afterPhotoUrl: text("afterPhotoUrl"),
  // 고객 서명 (base64 또는 S3 URL)
  customerSignatureUrl: text("customerSignatureUrl"),
  workMemo: text("workMemo"),
  // 작업 완료 여부
  isCompleted: boolean("isCompleted").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 앱 설정 테이블 ──────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 알림 발송 로그 테이블 ───────────────────────────────────────
export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId"),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  channel: mysqlEnum("channel", ["SMS", "ALIMTALK"]).notNull().default("SMS"),
  messageType: varchar("messageType", { length: 50 }),
  content: text("content"),
  result: mysqlEnum("result", ["SUCCESS", "FAILED", "SKIPPED"]).notNull().default("SKIPPED"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 누수센서 테이블 ─────────────────────────────────────────────
export const leakSensors = mysqlTable("leak_sensors", {
  id: int("id").autoincrement().primaryKey(),
  sensorUid: varchar("sensorUid", { length: 64 }).notNull().unique(),
  // 소속 지사
  branchId: int("branchId"),
  // 고객 정보
  customerName: varchar("customerName", { length: 50 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  apartmentName: varchar("apartmentName", { length: 100 }).notNull(),
  dong: varchar("dong", { length: 20 }).notNull(),
  ho: varchar("ho", { length: 20 }).notNull(),
  // 센서 정보
  sensorName: varchar("sensorName", { length: 100 }).notNull(),
  installLocation: varchar("installLocation", { length: 100 }).notNull(),
  // 현재 상태
  status: mysqlEnum("status", [
    "정상",
    "누수감지",
    "배터리부족",
    "통신끊김",
    "점검필요",
  ]).notNull().default("정상"),
  batteryLevel: int("batteryLevel").default(100).notNull(),
  lastCommAt: timestamp("lastCommAt").defaultNow().notNull(),
  leakDetectedAt: timestamp("leakDetectedAt"),
  isResolved: boolean("isResolved").default(true).notNull(),
  technicianId: int("technicianId"),
  technicianName: varchar("technicianName", { length: 50 }),
  adminMemo: text("adminMemo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 센서 이벤트 로그 테이블 ────────────────────────────────────
export const sensorEvents = mysqlTable("sensor_events", {
  id: int("id").autoincrement().primaryKey(),
  sensorUid: varchar("sensorUid", { length: 64 }).notNull(),
  leakDetected: boolean("leakDetected").default(false).notNull(),
  batteryLevel: int("batteryLevel"),
  reportedAt: timestamp("reportedAt").defaultNow().notNull(),
  source: mysqlEnum("source", ["DEMO_TEST", "WEBHOOK"]).notNull().default("WEBHOOK"),
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── 본사 공지사항 테이블 ────────────────────────────────────────
export const notices = mysqlTable("notices", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  authorId: int("authorId").notNull(),
  // null = 전체 공지, branchId = 특정 지사 공지
  targetBranchId: int("targetBranchId"),
  isPinned: boolean("isPinned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 교육 자료 테이블 ────────────────────────────────────────────
export const trainingMaterials = mysqlTable("training_materials", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content"),
  fileUrl: text("fileUrl"),
  category: varchar("category", { length: 50 }),
  authorId: int("authorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 자재 주문 테이블 ────────────────────────────────────────────
export const materialOrders = mysqlTable("material_orders", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  orderItems: text("orderItems").notNull(), // JSON 배열
  status: mysqlEnum("status", ["신청", "승인", "발송", "완료", "반려"])
    .notNull().default("신청"),
  requestedBy: int("requestedBy").notNull(), // userId
  approvedBy: int("approvedBy"),
  memo: text("memo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── 타입 내보내기 ───────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AppRole = typeof appRoles.$inferSelect;
export type InsertAppRole = typeof appRoles.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;
export type RegionMapping = typeof regionMappings.$inferSelect;
export type InsertRegionMapping = typeof regionMappings.$inferInsert;
export type RepairRequest = typeof repairRequests.$inferSelect;
export type InsertRepairRequest = typeof repairRequests.$inferInsert;
export type Technician = typeof technicians.$inferSelect;
export type InsertTechnician = typeof technicians.$inferInsert;
export type WorkReport = typeof workReports.$inferSelect;
export type InsertWorkReport = typeof workReports.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;
export type LeakSensor = typeof leakSensors.$inferSelect;
export type InsertLeakSensor = typeof leakSensors.$inferInsert;
export type SensorEvent = typeof sensorEvents.$inferSelect;
export type InsertSensorEvent = typeof sensorEvents.$inferInsert;
export type Notice = typeof notices.$inferSelect;
export type InsertNotice = typeof notices.$inferInsert;
export type TrainingMaterial = typeof trainingMaterials.$inferSelect;
export type InsertTrainingMaterial = typeof trainingMaterials.$inferInsert;
export type MaterialOrder = typeof materialOrders.$inferSelect;
export type InsertMaterialOrder = typeof materialOrders.$inferInsert;
