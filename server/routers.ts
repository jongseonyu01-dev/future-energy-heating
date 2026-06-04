import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import * as db from "./db";
import {
  sendSms,
  isSmsConfigured,
  buildReceivedMessage,
  buildStatusChangeMessage,
} from "./notification";

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

export const appRouter = router({
  // 헬스체크
  health: publicProcedure.query(() => ({ status: "ok" })),

  // ─── 접수 관련 ─────────────────────────────────────────────
  repair: router({
    // 접수 생성 (고객용, 인증 불필요)
    create: publicProcedure
      .input(
        z.object({
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
        })
      )
      .mutation(async ({ input }) => {
        const created = await db.createRepairRequest(input);

        // 접수 완료 SMS 발송 (설정된 경우에만)
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

        return created;
      }),

    // 접수 조회 (접수번호 또는 전화번호)
    find: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        return db.findRepairRequest(input.query);
      }),

    // 단건 조회
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRepairRequestById(input.id);
      }),

    // 전체 목록 (관리자용)
    listAll: publicProcedure.query(async () => {
      return db.getAllRepairRequests();
    }),

    // 상태 변경 (관리자용)
    updateStatus: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(statusValues),
          adminMemo: z.string().optional(),
          notify: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateRepairStatus(input.id, input.status, input.adminMemo);

        // 상태 변경 SMS 발송
        if (input.notify) {
          const req = await db.getRepairRequestById(input.id);
          if (req) {
            const message = buildStatusChangeMessage(
              req.customerName,
              req.requestNumber,
              input.status,
              req.technicianName,
              req.scheduledDate,
              req.scheduledTime
            );
            const sendResult = await sendSms(req.phoneNumber, message);
            await db.createNotificationLog({
              requestId: req.id,
              phoneNumber: req.phoneNumber,
              channel: "SMS",
              messageType: `상태변경:${input.status}`,
              content: message,
              result: sendResult.result,
              errorMessage: sendResult.errorMessage,
            });
          }
        }
        return { success: true };
      }),

    // 기사 배정 (관리자용)
    assignTechnician: publicProcedure
      .input(
        z.object({
          id: z.number(),
          technicianId: z.number(),
          technicianName: z.string(),
          scheduledDate: z.string().optional(),
          scheduledTime: z.string().optional(),
          notify: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        await db.assignTechnician(
          input.id,
          input.technicianId,
          input.technicianName,
          input.scheduledDate,
          input.scheduledTime
        );

        // 기사 배정/방문예정 안내 SMS
        if (input.notify) {
          const req = await db.getRepairRequestById(input.id);
          if (req) {
            const message = buildStatusChangeMessage(
              req.customerName,
              req.requestNumber,
              "방문예정",
              input.technicianName,
              input.scheduledDate ?? req.scheduledDate,
              input.scheduledTime ?? req.scheduledTime
            );
            const sendResult = await sendSms(req.phoneNumber, message);
            await db.createNotificationLog({
              requestId: req.id,
              phoneNumber: req.phoneNumber,
              channel: "SMS",
              messageType: "기사배정",
              content: message,
              result: sendResult.result,
              errorMessage: sendResult.errorMessage,
            });
          }
        }
        return { success: true };
      }),

    // 방문 일정 변경 (관리자용)
    updateSchedule: publicProcedure
      .input(
        z.object({
          id: z.number(),
          scheduledDate: z.string(),
          scheduledTime: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateSchedule(
          input.id,
          input.scheduledDate,
          input.scheduledTime
        );
        return { success: true };
      }),

    // 점검 결과 등록 (관리자용)
    updateInspectionResult: publicProcedure
      .input(
        z.object({
          id: z.number(),
          inspectionResult: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateInspectionResult(input.id, input.inspectionResult);
        return { success: true };
      }),
  }),

  // ─── 기사 관리 ─────────────────────────────────────────────
  technicians: router({
    // 활성 기사 목록 (배정용)
    list: publicProcedure.query(async () => {
      return db.getActiveTechnicians();
    }),

    // 전체 기사 목록 (관리자용)
    listAll: publicProcedure.query(async () => {
      return db.getAllTechnicians();
    }),

    // 기사 등록
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(50),
          phoneNumber: z.string().max(20).optional(),
          specialty: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createTechnician(input);
      }),

    // 기사 수정
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(50).optional(),
          phoneNumber: z.string().max(20).optional(),
          specialty: z.string().max(100).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await db.updateTechnician(id, rest);
        return { success: true };
      }),

    // 활성/비활성 토글
    setActive: publicProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setTechnicianActive(input.id, input.isActive);
        return { success: true };
      }),
  }),

  // ─── 관리자 설정 ───────────────────────────────────────────
  admin: router({
    // 비밀번호 검증 (로그인)
    verifyPassword: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        const valid = await db.verifyAdminPassword(input.password);
        return { valid };
      }),

    // 비밀번호 변경
    changePassword: publicProcedure
      .input(
        z.object({
          currentPassword: z.string(),
          newPassword: z.string().min(4).max(64),
        })
      )
      .mutation(async ({ input }) => {
        return db.changeAdminPassword(
          input.currentPassword,
          input.newPassword
        );
      }),

    // SMS 설정 상태 조회
    smsStatus: publicProcedure.query(async () => {
      return { configured: isSmsConfigured() };
    }),

    // 알림 발송 로그 조회
    notificationLogs: publicProcedure
      .input(z.object({ requestId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return db.getNotificationLogs(input?.requestId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
