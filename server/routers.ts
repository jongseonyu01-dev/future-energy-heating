import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import * as db from "./db";

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

export const appRouter = router({
  // 헬스체크
  health: publicProcedure.query(() => ({ status: "ok" })),

  // 접수 관련
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
        return db.createRepairRequest(input);
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
        })
      )
      .mutation(async ({ input }) => {
        await db.updateRepairStatus(input.id, input.status, input.adminMemo);
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

  // 기사 목록
  technicians: router({
    list: publicProcedure.query(async () => {
      return db.getActiveTechnicians();
    }),
  }),
});

export type AppRouter = typeof appRouter;
