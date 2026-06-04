import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// 사용자 테이블 (기본 제공)
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

// 처리 상태 enum
export const repairStatusEnum = mysqlEnum("status", [
  "신규접수",
  "기사배정대기",
  "방문예정",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
]);

// 증상 유형 enum
export const symptomEnum = mysqlEnum("symptom", [
  "집전체가춥다",
  "방일부만춥다",
  "분배기에서물이샌다",
  "온도조절기가작동하지않는다",
  "난방비가많이나온다",
  "배관청소가필요하다",
  "기타문의",
]);

// 접수 유형 enum
export const requestTypeEnum = mysqlEnum("requestType", [
  "난방고장",
  "배관청소",
]);

// 난방 접수 테이블
export const repairRequests = mysqlTable("repair_requests", {
  id: int("id").autoincrement().primaryKey(),
  // 접수번호 (예: FE-20240604-001)
  requestNumber: varchar("requestNumber", { length: 30 }).notNull().unique(),
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
  // 사진 URL (S3)
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
  ])
    .notNull()
    .default("신규접수"),
  // 배정된 기사 정보
  technicianId: int("technicianId"),
  technicianName: varchar("technicianName", { length: 50 }),
  // 방문 확정 일정
  scheduledDate: varchar("scheduledDate", { length: 20 }),
  scheduledTime: varchar("scheduledTime", { length: 20 }),
  // 작업 메모 (관리자용)
  adminMemo: text("adminMemo"),
  // 점검 결과
  inspectionResult: text("inspectionResult"),
  // 타임스탬프
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 기사 테이블
export const technicians = mysqlTable("technicians", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  // 담당 구역/전문 분야
  specialty: varchar("specialty", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 앱 설정 테이블 (관리자 비밀번호, SMS 알림 설정 등 key-value)
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 알림 발송 로그 테이블 (requestId는 누수 알림 등 접수건이 없는 경우 null)
export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId"),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  channel: mysqlEnum("channel", ["SMS", "ALIMTALK"]).notNull().default("SMS"),
  messageType: varchar("messageType", { length: 50 }),
  content: text("content"),
  // 발송 결과: SUCCESS, FAILED, SKIPPED(미설정)
  result: mysqlEnum("result", ["SUCCESS", "FAILED", "SKIPPED"])
    .notNull()
    .default("SKIPPED"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 센서 상태 enum (정상/누수감지/배터리부족/통신끊김/점검필요)
export const sensorStatusEnum = mysqlEnum("status", [
  "정상",
  "누수감지",
  "배터리부족",
  "통신끊김",
  "점검필요",
]);

// 누수센서 테이블
export const leakSensors = mysqlTable("leak_sensors", {
  id: int("id").autoincrement().primaryKey(),
  // 외부 센서 연동용 고유 ID (업체 API/웹훅에서 사용)
  sensorUid: varchar("sensorUid", { length: 64 }).notNull().unique(),
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
  ])
    .notNull()
    .default("정상"),
  // 배터리 잔량 (0~100)
  batteryLevel: int("batteryLevel").default(100).notNull(),
  // 마지막 통신 시간
  lastCommAt: timestamp("lastCommAt").defaultNow().notNull(),
  // 누수 감지 시간 (null이면 미감지)
  leakDetectedAt: timestamp("leakDetectedAt"),
  // 관리자 처리 상태
  isResolved: boolean("isResolved").default(true).notNull(),
  // 배정된 기사
  technicianId: int("technicianId"),
  technicianName: varchar("technicianName", { length: 50 }),
  // 처리 메모
  adminMemo: text("adminMemo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 센서 이벤트 로그 테이블 (외부 웹훅/API 수신 기록)
export const sensorEvents = mysqlTable("sensor_events", {
  id: int("id").autoincrement().primaryKey(),
  sensorUid: varchar("sensorUid", { length: 64 }).notNull(),
  // 누수 여부
  leakDetected: boolean("leakDetected").default(false).notNull(),
  // 배터리 잔량
  batteryLevel: int("batteryLevel"),
  // 수신 당시 통신 시간
  reportedAt: timestamp("reportedAt").defaultNow().notNull(),
  // 이벤트 출처: DEMO_TEST(테스트), WEBHOOK(외부연동)
  source: mysqlEnum("source", ["DEMO_TEST", "WEBHOOK"])
    .notNull()
    .default("WEBHOOK"),
  // 원본 페이로드 (디버깅용)
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 타입 내보내기
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RepairRequest = typeof repairRequests.$inferSelect;
export type InsertRepairRequest = typeof repairRequests.$inferInsert;
export type Technician = typeof technicians.$inferSelect;
export type InsertTechnician = typeof technicians.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;
export type LeakSensor = typeof leakSensors.$inferSelect;
export type InsertLeakSensor = typeof leakSensors.$inferInsert;
export type SensorEvent = typeof sensorEvents.$inferSelect;
export type InsertSensorEvent = typeof sensorEvents.$inferInsert;
