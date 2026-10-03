import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc.js";
import * as db from "./db.js";

/**
 * 고객 원장 로그 라우터
 * customer_ledger_logs 테이블 기반 감사 로그 조회/기록
 */
export const customerLedgerRouter = router({
  // 로그 목록 조회 (본사 관리자 전용)
  list: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      userId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const callerRole = (ctx.user as any)?.appRole;
      if (!callerRole || !["hq_admin", "admin"].includes(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "본사 관리자만 접근 가능합니다." });
      }
      // 기본 구현: 빈 배열 반환 (향후 db.listCustomerLedgerLogs 구현 시 교체)
      return { logs: [], total: 0 };
    }),

  // 로그 기록 (내부 사용)
  record: protectedProcedure
    .input(z.object({
      customerId: z.number().optional(),
      customerNo: z.string().optional(),
      action: z.enum(["조회","등록","수정","삭제","복구","엑셀다운로드","엑셀업로드","백업","복원","이력등록","이력수정","이력삭제"]),
      beforeData: z.string().optional(),
      afterData: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 감사 로그 기록 (향후 구현)
      return { success: true };
    }),
});
