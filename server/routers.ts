import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import * as db from "./db";
import {
  sendSms,
  isSmsConfigured,
  buildReceivedMessage,
  buildStatusChangeMessage,
  buildLeakAlertMessage,
} from "./notification";
import { dispatchLeakSms } from "./leak-sms";

// 증상 enum
const symptomValues = [
  "집전체가춥다",
  "방일부만춥다",
  "분배기에서물이샌다",
  "온도조절기가작동하지않는다",
  "난방비가많이나온다",
  "배관청소가필요하다",
  "기타문의",
] as const;

// 상태 enum
const statusValues = [
  "신규접수",
  "기사배정대기",
  "방문예정",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
] as const;

const requestTypeLabel: Record<string, string> = {
  난방고장: "난방 고장",
  배관청소: "배관청소",
};

// 간단한 비밀번호 해시 (실제 운영에서는 bcrypt 사용 권장)
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

export const appRouter = router({
  // 헬스체크
  health: publicProcedure.query(() => ({ status: "ok" })),

  // ─── 앱 인증 (ID/PW 기반) ────────────────────────────────────
  auth: router({
    // 앱 로그인 (기사/지사장/본사관리자용)
    login: publicProcedure
      .input(z.object({ loginId: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRoleByLoginId(input.loginId);
        if (!role || !role.isActive) {
          return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }
        const hash = simpleHash(input.password);
        if (role.passwordHash !== hash) {
          return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }
        // 기사인 경우 기사 정보도 반환
        let technicianId: number | null = null;
        let branchId: number | null = null;
        if (role.appRole === "technician") {
          const tech = await db.getTechnicianByUserId(role.userId);
          if (tech) {
            technicianId = tech.id;
            branchId = tech.branchId ?? null;
          }
        } else if (role.appRole === "branch_manager") {
          // 지사장이면 본인 지사 찾기
          const allBranches = await db.getAllBranches();
          const branch = allBranches.find(b => b.managerUserId === role.userId);
          if (branch) branchId = branch.id;
        }
        return {
          success: true,
          userId: role.userId,
          appRole: role.appRole,
          technicianId,
          branchId,
          phoneNumber: role.phoneNumber,
        };
      }),

    // 계정 생성 (본사 관리자용)
    createAccount: publicProcedure
      .input(z.object({
        loginId: z.string().min(2).max(64),
        password: z.string().min(4).max(64),
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]),
        phoneNumber: z.string().optional(),
        // 기사인 경우 기사 정보
        technicianName: z.string().optional(),
        branchId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getAppRoleByLoginId(input.loginId);
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const passwordHash = simpleHash(input.password);
        // userId는 loginId 해시로 임시 생성 (Manus OAuth 미사용)
        const userId = Math.abs(simpleHash(input.loginId + Date.now()).split("").reduce((a, c) => a + c.charCodeAt(0), 0)) + 100000;
        await db.upsertAppRole({
          userId,
          appRole: input.appRole,
          loginId: input.loginId,
          passwordHash,
          phoneNumber: input.phoneNumber,
          isActive: true,
        });
        // 기사 계정이면 technicians 테이블에도 등록
        if (input.appRole === "technician" && input.technicianName) {
          await db.createTechnician({
            name: input.technicianName,
            phoneNumber: input.phoneNumber,
            branchId: input.branchId,
            userId,
            isActive: true,
          });
        }
        return { success: true, userId };
      }),

    // 계정 목록 (본사 관리자용)
    listAccounts: publicProcedure.query(async () => {
      return db.getAllAppRoles();
    }),

    // 계정 활성/비활성
    setActive: publicProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
        await db.upsertAppRole({ ...role, isActive: input.isActive });
        return { success: true };
      }),

    // 비밀번호 변경
    changePassword: publicProcedure
      .input(z.object({ userId: z.number(), newPassword: z.string().min(4) }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
        await db.upsertAppRole({ ...role, passwordHash: simpleHash(input.newPassword) });
        return { success: true };
      }),
  }),

  // ─── 지사 관리 ───────────────────────────────────────────────
  branch: router({
    listAll: publicProcedure.query(async () => db.getAllBranches()),
    listActive: publicProcedure.query(async () => db.getActiveBranches()),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getBranchById(input.id)),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        code: z.string().min(1).max(20),
        region: z.string().min(1).max(100),
        managerName: z.string().optional(),
        phoneNumber: z.string().optional(),
        address: z.string().optional(),
        managerUserId: z.number().optional(),
      }))
      .mutation(async ({ input }) => db.createBranch(input)),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        region: z.string().optional(),
        managerName: z.string().optional(),
        phoneNumber: z.string().optional(),
        address: z.string().optional(),
        isActive: z.boolean().optional(),
        managerUserId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await db.updateBranch(id, rest);
        return { success: true };
      }),

    // 지역 매핑 관리
    getRegionMappings: publicProcedure.query(async () => db.getRegionMappings()),

    addRegionMapping: publicProcedure
      .input(z.object({ branchId: z.number(), keyword: z.string(), priority: z.number().default(0) }))
      .mutation(async ({ input }) => {
        await db.addRegionMapping(input.branchId, input.keyword, input.priority);
        return { success: true };
      }),

    deleteRegionMapping: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRegionMapping(input.id);
        return { success: true };
      }),

    // 지사별 통계
    stats: publicProcedure
      .input(z.object({ branchId: z.number().optional() }))
      .query(async ({ input }) => db.getBranchStats(input.branchId)),
  }),

  // ─── 접수 관련 ─────────────────────────────────────────────────
  repair: router({
    // 접수 생성 (고객용) - 주소 기반 지사 자동 배정
    create: publicProcedure
      .input(z.object({
        customerName: z.string().min(1).max(50),
        phoneNumber: z.string().min(9).max(20),
        apartmentName: z.string().min(1).max(100),
        dong: z.string().min(1).max(20),
        ho: z.string().min(1).max(20),
        requestType: z.enum(["난방고장", "배관청소"]).default("난방고장"),
        symptom: z.enum(symptomValues),
        detailContent: z.string().max(2000).optional(),
        photoUrl: z.string().optional(),
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // 주소 기반 지사 자동 배정
        const address = `${input.apartmentName} ${input.dong}`;
        const branch = await db.findBranchByAddress(address);
        const created = await db.createRepairRequest({ ...input, branchId: branch?.id ?? null });

        const message = buildReceivedMessage(
          input.customerName,
          created.requestNumber,
          requestTypeLabel[input.requestType] ?? "서비스"
        );
        const sendResult = await sendSms(input.phoneNumber, message);
        await db.createNotificationLog({
          requestId: created.id,
          phoneNumber: input.phoneNumber,
          channel: "SMS",
          messageType: "접수완료",
          content: message,
          result: sendResult.result,
          errorMessage: sendResult.errorMessage,
        });

        return { ...created, branchId: branch?.id ?? null, branchName: branch?.name ?? "본사" };
      }),

    // 접수 조회 (접수번호 또는 전화번호)
    find: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => db.findRepairRequest(input.query)),

    // 단건 조회
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getRepairRequestById(input.id)),

    // 전체 목록 (본사 관리자용)
    listAll: publicProcedure.query(async () => db.getAllRepairRequests()),

    // 지사별 목록 (지사장용)
    listByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => db.getRepairRequestsByBranch(input.branchId)),

    // 기사별 배정 목록 (기사용)
    listByTechnician: publicProcedure
      .input(z.object({ technicianId: z.number() }))
      .query(async ({ input }) => db.getRepairRequestsByTechnician(input.technicianId)),

    // 상태 변경
    updateStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(statusValues),
        adminMemo: z.string().optional(),
        notify: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await db.updateRepairStatus(input.id, input.status, input.adminMemo);
        if (input.notify) {
          const req = await db.getRepairRequestById(input.id);
          if (req) {
            const message = buildStatusChangeMessage(
              req.customerName, req.requestNumber, input.status,
              req.technicianName, req.scheduledDate, req.scheduledTime
            );
            const sendResult = await sendSms(req.phoneNumber, message);
            await db.createNotificationLog({
              requestId: req.id, phoneNumber: req.phoneNumber, channel: "SMS",
              messageType: `상태변경:${input.status}`, content: message,
              result: sendResult.result, errorMessage: sendResult.errorMessage,
            });
          }
        }
        return { success: true };
      }),

    // 기사 배정
    assignTechnician: publicProcedure
      .input(z.object({
        id: z.number(),
        technicianId: z.number(),
        technicianName: z.string(),
        scheduledDate: z.string().optional(),
        scheduledTime: z.string().optional(),
        notify: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await db.assignTechnician(input.id, input.technicianId, input.technicianName, input.scheduledDate, input.scheduledTime);
        if (input.notify) {
          const req = await db.getRepairRequestById(input.id);
          if (req) {
            const message = buildStatusChangeMessage(
              req.customerName, req.requestNumber, "방문예정",
              input.technicianName, input.scheduledDate ?? req.scheduledDate, input.scheduledTime ?? req.scheduledTime
            );
            const sendResult = await sendSms(req.phoneNumber, message);
            await db.createNotificationLog({
              requestId: req.id, phoneNumber: req.phoneNumber, channel: "SMS",
              messageType: "기사배정", content: message,
              result: sendResult.result, errorMessage: sendResult.errorMessage,
            });
          }
        }
        return { success: true };
      }),

    // 방문 일정 변경
    updateSchedule: publicProcedure
      .input(z.object({ id: z.number(), scheduledDate: z.string(), scheduledTime: z.string() }))
      .mutation(async ({ input }) => {
        await db.updateSchedule(input.id, input.scheduledDate, input.scheduledTime);
        return { success: true };
      }),

    // 점검 결과 등록
    updateInspectionResult: publicProcedure
      .input(z.object({ id: z.number(), inspectionResult: z.string() }))
      .mutation(async ({ input }) => {
        await db.updateInspectionResult(input.id, input.inspectionResult);
        return { success: true };
      }),

    // 견적 금액 등록 (지사장용)
    updateEstimate: publicProcedure
      .input(z.object({ id: z.number(), estimateAmount: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ estimateAmount: String(input.estimateAmount), status: "견적승인대기" }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 견적 승인 (고객용)
    approveEstimate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ estimateApprovedAt: new Date(), status: "작업진행중" }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 재방문 설정 (기사용)
    setRevisit: publicProcedure
      .input(z.object({ id: z.number(), needsRevisit: z.boolean(), revisitReason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ needsRevisit: input.needsRevisit, revisitReason: input.revisitReason ?? null }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 지사 재배정 (본사 관리자용)
    reassignBranch: publicProcedure
      .input(z.object({ id: z.number(), branchId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        await db.reassignBranch(input.id, input.branchId);
        return { success: true };
      }),
  }),

  // ─── 기사 관리 ─────────────────────────────────────────────────
  technicians: router({
    list: publicProcedure.query(async () => db.getActiveTechnicians()),
    listAll: publicProcedure.query(async () => db.getAllTechnicians()),

    listByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => db.getTechniciansByBranch(input.branchId)),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        phoneNumber: z.string().max(20).optional(),
        specialty: z.string().max(100).optional(),
        branchId: z.number().optional(),
      }))
      .mutation(async ({ input }) => db.createTechnician(input)),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        phoneNumber: z.string().max(20).optional(),
        specialty: z.string().max(100).optional(),
        isActive: z.boolean().optional(),
        branchId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await db.updateTechnician(id, rest);
        return { success: true };
      }),

    setActive: publicProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setTechnicianActive(input.id, input.isActive);
        return { success: true };
      }),
  }),

  // ─── 작업 보고서 ──────────────────────────────────────────────
  workReport: router({
    getByRequest: publicProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input }) => db.getWorkReportByRequestId(input.requestId)),

    save: publicProcedure
      .input(z.object({
        requestId: z.number(),
        technicianId: z.number(),
        checkItems: z.string().optional(),
        usedMaterials: z.string().optional(),
        workMemo: z.string().optional(),
        isCompleted: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const result = await db.upsertWorkReport({
          ...input,
          completedAt: input.isCompleted ? new Date() : undefined,
        });
        if (input.isCompleted) {
          await db.updateRepairStatus(input.requestId, "작업완료");
        }
        return result;
      }),
  }),

  // ─── 관리자 설정 ───────────────────────────────────────────────
  admin: router({
    verifyPassword: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        const valid = await db.verifyAdminPassword(input.password);
        return { valid };
      }),

    changePassword: publicProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(4).max(64) }))
      .mutation(async ({ input }) => {
        return db.changeAdminPassword(input.currentPassword, input.newPassword);
      }),

    smsStatus: publicProcedure.query(async () => ({ configured: isSmsConfigured() })),

    notificationLogs: publicProcedure
      .input(z.object({ requestId: z.number().optional() }).optional())
      .query(async ({ input }) => db.getNotificationLogs(input?.requestId)),
  }),

  // ─── 공지사항 ─────────────────────────────────────────────────
  notice: router({
    list: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(async ({ input }) => db.getNotices(input?.branchId)),

    create: publicProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        authorId: z.number(),
        targetBranchId: z.number().optional(),
        isPinned: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => db.createNotice(input)),
  }),

  // ─── 교육 자료 ────────────────────────────────────────────────
  training: router({
    list: publicProcedure.query(async () => db.getTrainingMaterials()),

    create: publicProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        content: z.string().optional(),
        fileUrl: z.string().optional(),
        category: z.string().optional(),
        authorId: z.number(),
      }))
      .mutation(async ({ input }) => db.createTrainingMaterial(input)),
  }),

  // ─── 자재 주문 ────────────────────────────────────────────────
  materialOrder: router({
    list: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(async ({ input }) => db.getMaterialOrders(input?.branchId)),

    create: publicProcedure
      .input(z.object({
        branchId: z.number(),
        orderItems: z.string(),
        requestedBy: z.number(),
        memo: z.string().optional(),
      }))
      .mutation(async ({ input }) => db.createMaterialOrder(input)),

    updateStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["신청", "승인", "발송", "완료", "반려"]),
        approvedBy: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateMaterialOrderStatus(input.id, input.status, input.approvedBy);
        return { success: true };
      }),
  }),

  // ─── 누수센서 ──────────────────────────────────────────────────
  sensor: router({
    listAll: publicProcedure.query(async () => db.getAllSensors()),

    listByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => db.getSensorsByBranch(input.branchId)),

    listByPhone: publicProcedure
      .input(z.object({ phoneNumber: z.string().min(1) }))
      .query(async ({ input }) => db.getSensorsByPhone(input.phoneNumber)),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getSensorById(input.id)),

    assignTechnician: publicProcedure
      .input(z.object({ id: z.number(), technicianId: z.number(), technicianName: z.string() }))
      .mutation(async ({ input }) => {
        await db.updateSensorAdmin(input.id, {
          technicianId: input.technicianId,
          technicianName: input.technicianName,
          status: "점검필요",
        });
        return { success: true };
      }),

    resolve: publicProcedure
      .input(z.object({ id: z.number(), adminMemo: z.string().optional() }))
      .mutation(async ({ input }) => {
        await db.updateSensorAdmin(input.id, { status: "정상", isResolved: true, adminMemo: input.adminMemo });
        const sensor = await db.getSensorById(input.id);
        if (sensor) {
          await db.updateSensorState(sensor.sensorUid, { leakDetectedAt: null });
        }
        return { success: true };
      }),

    updateMemo: publicProcedure
      .input(z.object({ id: z.number(), adminMemo: z.string() }))
      .mutation(async ({ input }) => {
        await db.updateSensorAdmin(input.id, { adminMemo: input.adminMemo });
        return { success: true };
      }),

    triggerLeakTest: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const sensor = await db.getSensorById(input.id);
        if (!sensor) return { success: false, error: "센서를 찾을 수 없습니다." };
        const now = new Date();
        await db.updateSensorState(sensor.sensorUid, {
          status: "누수감지", leakDetectedAt: now, lastCommAt: now, isResolved: false,
        });
        await db.createSensorEvent({
          sensorUid: sensor.sensorUid, leakDetected: true,
          batteryLevel: sensor.batteryLevel, reportedAt: now,
          source: "DEMO_TEST", rawPayload: JSON.stringify({ test: true, sensorId: input.id }),
        });
        const message = buildLeakAlertMessage(sensor.apartmentName, sensor.dong, sensor.ho, sensor.installLocation);
        const result = await dispatchLeakSms(sensor, message);
        return { success: true, sms: result };
      }),

    events: publicProcedure
      .input(z.object({ sensorUid: z.string() }))
      .query(async ({ input }) => db.getSensorEvents(input.sensorUid)),
  }),
});

export type AppRouter = typeof appRouter;
