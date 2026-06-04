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
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 타입 내보내기
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RepairRequest = typeof repairRequests.$inferSelect;
export type InsertRepairRequest = typeof repairRequests.$inferInsert;
export type Technician = typeof technicians.$inferSelect;
export type InsertTechnician = typeof technicians.$inferInsert;
