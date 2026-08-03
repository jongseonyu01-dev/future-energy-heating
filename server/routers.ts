import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc.js";
import * as db from "./db.js";
import {
  sendSms,
  sendNotification,
  isSmsConfigured,
  isAlimtalkConfigured,
  buildReceivedMessage,
  buildStatusChangeMessage,
  buildLeakAlertMessage,
  buildCustomerReceivedMessage,
  buildAdminReceivedMessage,
  buildSmsTestMessage,
  friendlySmsError,
  buildBranchAssignedMessage,
  buildScheduleConfirmedMessage,
  buildTechnicianArrivedMessage,
  buildWorkCompletedMessage,
  buildEstimateMessage,
  buildEstimateDocMessage,
  buildEstimateApprovedAdminMessage,
  buildEstimateRejectedAdminMessage,
  buildEstimateApprovedCustomerMessage,
  buildScheduleRequestAdminMessage,
  buildInquiryAdminMessage,
} from "./notification.js";
import { dispatchLeakSms } from "./leak-sms.js";
import { buildTechnicianDepartedMessage } from "./notification.js";
import { storagePut } from "./storage.js";

// 알림 통합 발송 + 이력 기록 헬퍼 (알림톡 우선 → 실패 시 문자 대체)
async function notifyAndLog(params: {
  requestId: number;
  phoneNumber: string;
  messageType: string;
  content: string;
}): Promise<{ channel: string; result: string; fallbackUsed: boolean; errorMessage?: string }> {
  const r = await sendNotification(params.phoneNumber, params.content);
  await db.createNotificationLog({
    requestId: params.requestId,
    phoneNumber: params.phoneNumber,
    channel: r.channel as "SMS" | "ALIMTALK",
    messageType: params.messageType,
    content: params.content,
    result: r.result,
    errorMessage: r.errorMessage,
    fallbackUsed: r.fallbackUsed,
  });
  return r;
}

// 추측 불가능한 긴 일회용 위치코드 생성 (256비트 = 43자 base64url)
// 예: "Xa7kQ2..." (대소문자+숫자+-_, URL-safe)
function generateTrackingToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

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
  "기사확인대기",
  "기사확인완료",
  "기사일정확인",
  "출발",
  "도착",
  "공사중",
  "공사완료",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
] as const;

const requestTypeLabel: Record<string, string> = {
  난방고장: "난방 고장",
  배관청소: "배관청소",
};

// 레거시 해시 (구버전 계정 호환용 검증 전용, 신규 저장에는 사용 안 함)
function legacyHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

// bcrypt 해시 생성 (신규 비밀번호는 모두 이것으로 저장)
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

// 비밀번호 검증: bcrypt 우선, 레거시 해시 폴백
// 반환값: { ok, isLegacy } — isLegacy=true면 로그인 성공 후 bcrypt로 재저장 필요
function verifyPassword(password: string, storedHash: string | null): { ok: boolean; isLegacy: boolean } {
  if (!storedHash) return { ok: false, isLegacy: false };
  // bcrypt 해시는 $2a$ / $2b$ / $2y$ 로 시작
  if (storedHash.startsWith("$2")) {
    return { ok: bcrypt.compareSync(password, storedHash), isLegacy: false };
  }
  // 레거시 해시
  return { ok: legacyHash(password) === storedHash, isLegacy: true };
}

// 6자리 숫자 인증코드 생성
function generateVerifyCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 휴대폰 번호 정규화 (숫자만)
function normalizePhone(phone: string): string {
  return (phone || "").replace(/[^0-9]/g, "");
}

// MySQL INT(부호있음, 최대 2,147,483,647) 안전 범위 내 userId 생성
// 100000 ~ 2,000,099,999 사이 값으로 제한
function generateSafeUserId(seed: string): number {
  const h = crypto.createHash("sha256").update(seed).digest().readUInt32BE(0);
  return (h % 2_000_000_000) + 100000;
}

/**
 * 관리자 전용 API 인증 헬퍼
 * 요청에서 Bearer userId:token 헤더를 읽어 app_roles 계정을 검증하고 반환
 * 인증 실패 시 null 반환
 */
async function resolveCallerRole(ctx: any): Promise<{ userId: number; appRole: string; branchId: number | null } | null> {
  const authHeader = ctx?.req?.headers?.authorization || ctx?.req?.headers?.Authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const parts = authHeader.slice(7).trim().split(":");
    if (parts.length === 2) {
      const userId = parseInt(parts[0], 10);
      const token = parts[1];
      if (!isNaN(userId) && token) {
        const role = await db.getAppRole(userId);
        if (role && role.isActive) {
          const expected = crypto
            .createHmac("sha256", (role.passwordHash || "seed"))
            .update(String(role.userId))
            .digest("hex");
          if (expected === token) {
            return { userId: role.userId, appRole: role.appRole, branchId: role.branchId ?? null };
          }
        }
      }
    }
  }
  return null;
}

export const appRouter = router({
  // 헬스체크
  health: publicProcedure.query(() => ({ status: "ok" })),

  // ─── 앱 인증 (ID/PW 기반, 홈페이지·앱 공통) ──────────────────
  auth: router({
    // 통합 로그인 (고객/기사/지사장/본사관리자 공통)
    login: publicProcedure
      .input(z.object({ loginId: z.string().min(1), password: z.string().min(1), source: z.enum(["web", "app"]).optional() }))
      .mutation(async ({ input }) => {
        const loginId = input.loginId.trim();
        const role = await db.getAppRoleByLoginId(loginId);
        if (!role) {
          return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }
        if (!role.isActive) {
          return { success: false, error: "비활성화된 계정입니다. 관리자에게 문의하세요." };
        }
        const check = verifyPassword(input.password, role.passwordHash);
        if (!check.ok) {
          return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }
        // 홈페이지(web)에서 기사 계정 로그인 차단
        if (input.source === "web" && role.appRole === "technician") {
          return { success: false, blockedRole: "technician", error: "기사 계정은 기사용 앱에서만 이용할 수 있습니다. 플레이스토어에서 Future Energy Tech 기사용 앱을 설치해 주세요." };
        }
        // 기사용 앱(app)에서 본사·지사 계정 로그인 차단
        if (input.source === "app" && (role.appRole === "hq_admin" || role.appRole === "branch_manager")) {
          return { success: false, blockedRole: role.appRole, error: "본사와 지사는 홈페이지 관리시스템을 이용해 주세요. https://퓨처에너지테크.kr" };
        }
        // 레거시 해시로 로그인 성공 시 bcrypt로 자동 업그레이드
        if (check.isLegacy) {
          try { await db.updateAppRoleFields(role.userId, { passwordHash: hashPassword(input.password) }); } catch {}
        }
        // 권한별 부가정보
        let technicianId: number | null = null;
        let branchId: number | null = role.branchId ?? null;
        if (role.appRole === "technician") {
          // technicians 테이블 + app_roles 테이블 모두에서 technicianId 수집
          const techIdSet = new Set<number>();
          // technicians 테이블: userId로 조회
          const techByUserId = await db.getTechnicianByUserId(role.userId);
          if (techByUserId) techIdSet.add(techByUserId.id);
          if (role.phoneNumber) {
            // technicians 테이블: phoneNumber로 조회
            const allTechs = await db.getTechniciansByPhone(role.phoneNumber);
            for (const t of allTechs) techIdSet.add(t.id);
            // app_roles 테이블: phoneNumber로 조회 (repair_requests.technicianId가 app_roles.id를 참조하는 경우)
            const appRolesByPhone = await db.getAppRolesByPhoneNormalized(role.phoneNumber);
            for (const r of appRolesByPhone) techIdSet.add(r.id);
          }
          // app_roles 테이블: userId로 직접 조회
          techIdSet.add(role.id); // app_roles.id 자체도 포함
          if (techIdSet.size > 0) {
            // 접수건이 있는 technicianId 우선 선택
            let selectedId = Array.from(techIdSet)[0];
            for (const tid of techIdSet) {
              const works = await db.getRepairRequestsByTechnician(tid);
              if (works.length > 0) { selectedId = tid; break; }
            }
            technicianId = selectedId;
            // branchId 없는 경우 연결
            const selTech = techByUserId?.id === selectedId ? techByUserId : null;
            if (selTech?.branchId) branchId = selTech.branchId;
          }
        } else if (role.appRole === "branch_manager") {
          const allBranches = await db.getAllBranches();
          const branch = allBranches.find(b => b.managerUserId === role.userId);
          if (branch) branchId = branch.id;
        }
        // 소속 지사명 조회 (화면 표시용)
        let branchName: string | null = null;
        if (branchId) {
          const b = await db.getBranchById(branchId);
          branchName = b?.name ?? null;
        }
        // 자동로그인용 토큰 (userId + 비밀번호해시 일부로 서명)
        const token = crypto
          .createHmac("sha256", (role.passwordHash || "seed"))
          .update(String(role.userId))
          .digest("hex");
        return {
          success: true,
          userId: role.userId,
          appRole: role.appRole,
          name: role.name ?? null,
          technicianId,
          branchId,
          branchName,
          phoneNumber: role.phoneNumber,
          mustChangePassword: role.mustChangePassword,
          token,
        };
      }),

    // 자동로그인 토큰 검증
    verifyToken: publicProcedure
      .input(z.object({ userId: z.number(), token: z.string() }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role || !role.isActive) return { success: false };
        const expected = crypto
          .createHmac("sha256", (role.passwordHash || "seed"))
          .update(String(role.userId))
          .digest("hex");
        if (expected !== input.token) return { success: false };
        let technicianId: number | null = null;
        let branchId: number | null = role.branchId ?? null;
        if (role.appRole === "technician") {
          // technicians 테이블 + app_roles 테이블 모두에서 technicianId 수집
          const techIdSet2 = new Set<number>();
          const techByUserId3 = await db.getTechnicianByUserId(role.userId);
          if (techByUserId3) techIdSet2.add(techByUserId3.id);
          if (role.phoneNumber) {
            const allTechs3 = await db.getTechniciansByPhone(role.phoneNumber);
            for (const t of allTechs3) techIdSet2.add(t.id);
            const appRolesByPhone2 = await db.getAppRolesByPhoneNormalized(role.phoneNumber);
            for (const r of appRolesByPhone2) techIdSet2.add(r.id);
          }
          techIdSet2.add(role.id); // app_roles.id 자체도 포함
          if (techIdSet2.size > 0) {
            // 접수건이 있는 technicianId 우선 선택
            let selectedId2 = Array.from(techIdSet2)[0];
            for (const tid of techIdSet2) {
              const works = await db.getRepairRequestsByTechnician(tid);
              if (works.length > 0) { selectedId2 = tid; break; }
            }
            technicianId = selectedId2;
          }
        } else if (role.appRole === "branch_manager") {
          const allBranches = await db.getAllBranches();
          const branch = allBranches.find(b => b.managerUserId === role.userId);
          if (branch) branchId = branch.id;
        }
        let branchName: string | null = null;
        if (branchId) {
          const b = await db.getBranchById(branchId);
          branchName = b?.name ?? null;
        }
        return {
          success: true,
          userId: role.userId,
          appRole: role.appRole,
          name: role.name ?? null,
          technicianId,
          branchId,
          branchName,
          phoneNumber: role.phoneNumber,
          mustChangePassword: role.mustChangePassword,
        };
      }),

    // ── 고객 회원가입: 휴대폰 인증코드 발송 ──
    sendVerifyCode: publicProcedure
      .input(z.object({ phoneNumber: z.string().min(10), purpose: z.enum(["signup", "reset"]).default("signup") }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        if (phone.length < 10) return { success: false, error: "올바른 휴대폰 번호를 입력하세요." };
        // 가입 목적인데 이미 동일 휴대폰으로 고객계정이 있으면 안내
        if (input.purpose === "signup") {
          const existing = await db.getAppRolesByPhone(phone);
          if (existing.some(r => r.appRole === "customer" && r.loginId)) {
            return { success: false, error: "이미 가입된 휴대폰 번호입니다. 로그인 또는 아이디 찾기를 이용하세요." };
          }
        }
        const code = generateVerifyCode();
        const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3분
        await db.createPhoneVerification({ phoneNumber: phone, code, purpose: input.purpose, expiresAt });
        // SMS 발송
        let smsSent = false;
        if (isSmsConfigured()) {
          try {
            const res = await sendSms(phone, `[퓨처에너지테크] 인증번호 ${code} (3분 이내 입력)`);
            smsSent = res?.result === "SUCCESS";
          } catch {}
        }
        // 개발/미설정 환경에서는 코드 노출(테스트용)
        return { success: true, smsSent, devCode: smsSent ? undefined : code };
      }),

    // ── 휴대폰 인증코드 확인 ──
    checkVerifyCode: publicProcedure
      .input(z.object({ phoneNumber: z.string(), code: z.string(), purpose: z.enum(["signup", "reset"]).default("signup") }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, input.purpose);
        if (!v) return { success: false, error: "인증코드를 먼저 요청하세요." };
        if (new Date(v.expiresAt).getTime() < Date.now()) return { success: false, error: "인증코드가 만료되었습니다. 다시 요청하세요." };
        if (v.code !== input.code.trim()) return { success: false, error: "인증코드가 일치하지 않습니다." };
        await db.markPhoneVerificationVerified(v.id);
        return { success: true };
      }),

    // ── 고객 회원가입 (휴대폰 인증 완료 후) ──
    registerCustomer: publicProcedure
      .input(z.object({
        loginId: z.string().min(4).max(64),
        password: z.string().min(6).max(64),
        name: z.string().min(1).max(50),
        phoneNumber: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        // 휴대폰 인증 완료 여부 확인
        const v = await db.getLatestPhoneVerification(phone, "signup");
        if (!v || !v.verified) return { success: false, error: "휴대폰 인증을 먼저 완료하세요." };
        const existing = await db.getAppRoleByLoginId(input.loginId.trim());
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const userId = generateSafeUserId(input.loginId + phone + Date.now());
        await db.upsertAppRole({
          userId,
          appRole: "customer",
          loginId: input.loginId.trim(),
          passwordHash: hashPassword(input.password),
          name: input.name,
          phoneNumber: phone,
          mustChangePassword: false,
          isActive: true,
        });
        return { success: true, userId };
      }),

    // ── 기사 자가 가입 (즉시 로그인 가능) ──
    registerTechnician: publicProcedure
      .input(z.object({
        loginId: z.string().min(4).max(64),
        password: z.string().min(6).max(64),
        name: z.string().min(1).max(50),
        phoneNumber: z.string().min(10),
        branchId: z.number().optional(),
        serviceArea: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, "signup");
        if (!v || !v.verified) return { success: false, error: "휴대폰 인증을 먼저 완료하세요." };
        const existing = await db.getAppRoleByLoginId(input.loginId.trim());
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const userId = generateSafeUserId(input.loginId + phone + Date.now());
        await db.upsertAppRole({
          userId,
          appRole: "technician",
          loginId: input.loginId.trim(),
          passwordHash: hashPassword(input.password),
          name: input.name,
          phoneNumber: phone,
          branchId: input.branchId,
          mustChangePassword: false,
          isActive: true, // 즉시 로그인 가능
        });
        await db.createTechnician({
          name: input.name,
          phoneNumber: phone,
          branchId: input.branchId,
          userId,
          isActive: true,
        });
        return { success: true };
      }),

    // ── 지사 관리자 자가 가입 (즉시 로그인 가능) ──
    registerBranch: publicProcedure
      .input(z.object({
        loginId: z.string().min(4).max(64),
        password: z.string().min(6).max(64),
        name: z.string().min(1).max(50),
        phoneNumber: z.string().min(10),
        branchName: z.string().min(2).max(100),
        serviceArea: z.string().min(2).max(200),
      }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, "signup");
        if (!v || !v.verified) return { success: false, error: "휴대폰 인증을 먼저 완료하세요." };
        const existing = await db.getAppRoleByLoginId(input.loginId.trim());
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const userId = generateSafeUserId(input.loginId + phone + Date.now());
        const branchCode = "BRANCH_" + Date.now().toString(36).toUpperCase();
        const branch = await db.createBranch({
          name: input.branchName,
          code: branchCode,
          region: input.serviceArea,
          managerName: input.name,
          phoneNumber: phone,
          isActive: true, // 즉시 활성화
        });
        await db.upsertAppRole({
          userId,
          appRole: "branch_manager",
          loginId: input.loginId.trim(),
          passwordHash: hashPassword(input.password),
          name: input.name,
          phoneNumber: phone,
          branchId: branch.id,
          mustChangePassword: false,
          isActive: true, // 즉시 로그인 가능
        });
        // 지사의 managerUserId 연결
        try { await db.updateBranch(branch.id, { managerUserId: userId }); } catch {}
        return { success: true, branchId: branch.id };
      }),

    // ── 지사 목록 조회 (기사 가입 시 지사 선택용) ──
    listBranches: publicProcedure
      .query(async () => {
        const branches = await db.getActiveBranches();
        return branches.map(b => ({ id: b.id, name: b.name, region: b.region }));
      }),

    // ── 아이디 찾기 (휴대폰 인증 후 마스킹된 아이디 반환) ──
    findLoginId: publicProcedure
      .input(z.object({ phoneNumber: z.string(), code: z.string() }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, "reset");
        if (!v) return { success: false, error: "인증코드를 먼저 요청하세요." };
        if (new Date(v.expiresAt).getTime() < Date.now()) return { success: false, error: "인증코드가 만료되었습니다." };
        if (v.code !== input.code.trim()) return { success: false, error: "인증코드가 일치하지 않습니다." };
        const roles = await db.getAppRolesByPhone(phone);
        const ids = roles.filter(r => r.loginId).map(r => r.loginId as string);
        if (ids.length === 0) return { success: false, error: "해당 번호로 등록된 계정이 없습니다." };
        // 마스킹: 앞 3자만 노출
        const masked = ids.map(id => id.length <= 3 ? id[0] + "**" : id.slice(0, 3) + "*".repeat(Math.max(2, id.length - 3)));
        return { success: true, loginIds: masked };
      }),

    // ── 비밀번호 재설정 (휴대폰 인증 후) ──
    resetPassword: publicProcedure
      .input(z.object({ loginId: z.string(), phoneNumber: z.string(), code: z.string(), newPassword: z.string().min(6).max(64) }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, "reset");
        if (!v) return { success: false, error: "인증코드를 먼저 요청하세요." };
        if (new Date(v.expiresAt).getTime() < Date.now()) return { success: false, error: "인증코드가 만료되었습니다." };
        if (v.code !== input.code.trim()) return { success: false, error: "인증코드가 일치하지 않습니다." };
        const role = await db.getAppRoleByLoginId(input.loginId.trim());
        if (!role) return { success: false, error: "아이디를 찾을 수 없습니다." };
        if (normalizePhone(role.phoneNumber || "") !== phone) {
          return { success: false, error: "아이디와 휴대폰 번호가 일치하지 않습니다." };
        }
        await db.updateAppRoleFields(role.userId, { passwordHash: hashPassword(input.newPassword), mustChangePassword: false });
        return { success: true };
      }),

    // ── 계정 생성 (본사 관리자용: 지사장/기사 발급) ──
    createAccount: publicProcedure
      .input(z.object({
        loginId: z.string().min(2).max(64),
        password: z.string().min(4).max(64), // 임시 비밀번호
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]),
        name: z.string().optional(),
        phoneNumber: z.string().optional(),
        branchId: z.number().optional(),
        // 첫 로그인 시 비밀번호 변경 강제 여부 (관리자 발급 계정은 기본 true)
        mustChangePassword: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const callerRole = (ctx.user as any).appRole;
        if (!["hq_admin", "admin", "headquarters"].includes(callerRole)) throw new TRPCError({ code: "FORBIDDEN", message: "계정 생성 권한이 없습니다." });
        const existing = await db.getAppRoleByLoginId(input.loginId.trim());
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const passwordHash = hashPassword(input.password);
        const userId = generateSafeUserId(input.loginId + Date.now());
        await db.upsertAppRole({
          userId,
          appRole: input.appRole,
          loginId: input.loginId.trim(),
          passwordHash,
          name: input.name,
          phoneNumber: input.phoneNumber ? normalizePhone(input.phoneNumber) : undefined,
          branchId: input.branchId,
          mustChangePassword: input.mustChangePassword ?? (input.appRole !== "customer"),
          isActive: true,
        });
        // 기사 계정이면 technicians 테이블에도 등록
        if (input.appRole === "technician" && input.name) {
          await db.createTechnician({
            name: input.name,
            phoneNumber: input.phoneNumber ? normalizePhone(input.phoneNumber) : undefined,
            branchId: input.branchId,
            userId,
            isActive: true,
          });
        }
        // 지사장 계정이면 지사의 managerUserId 연결
        if (input.appRole === "branch_manager" && input.branchId) {
          try { await db.updateBranch(input.branchId, { managerUserId: userId }); } catch {}
        }
        return { success: true, userId, tempPassword: input.password };
      }),

    // 계정 목록 (본사 관리자 또는 지사장 전용)
    listAccounts: publicProcedure.query(async ({ ctx }) => {
      const callerRole = await resolveCallerRole(ctx);
      if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
      if (!['hq_admin', 'branch_manager'].includes(callerRole.appRole)) throw new TRPCError({ code: "FORBIDDEN", message: "권한이 없습니다." });
      const roles = await db.getAllAppRoles();
      const allBranches = await db.getAllBranches();
      const branchMap = new Map(allBranches.map(b => [b.id, b.name]));
      let filtered = roles.filter(r => r.appRole !== 'customer');
      // 지사장은 자기 지사 계정만 조회 가능
      if (callerRole.appRole === 'branch_manager' && callerRole.branchId) {
        filtered = filtered.filter(r => r.branchId === callerRole.branchId);
      }
      return filtered.map(r => ({
        ...r,
        passwordHash: undefined, // 비밀번호 해시 노출 방지
        branchName: r.branchId ? (branchMap.get(r.branchId) ?? null) : null,
      }));
    }),

    // 계정 정보 수정 (본사 관리자 전용)
    updateAccount: publicProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().optional(),
        phoneNumber: z.string().optional(),
        branchId: z.number().optional(),
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const callerRole = await resolveCallerRole(ctx);
        if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (callerRole.appRole !== 'hq_admin') throw new TRPCError({ code: "FORBIDDEN", message: "본사 관리자만 계정을 수정할 수 있습니다." });
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false, error: "계정을 찾을 수 없습니다." };
        await db.updateAppRoleFields(input.userId, {
          name: input.name ?? role.name ?? undefined,
          phoneNumber: input.phoneNumber ? normalizePhone(input.phoneNumber) : (role.phoneNumber ?? undefined),
          branchId: input.branchId ?? role.branchId ?? undefined,
          appRole: input.appRole ?? role.appRole,
          isActive: input.isActive ?? role.isActive,
        });
        return { success: true };
      }),

    // 계정 활성/비활성 (본사 관리자 또는 지사장)
    setActive: publicProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const callerRole = await resolveCallerRole(ctx);
        if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (!['hq_admin', 'branch_manager'].includes(callerRole.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
        // 지사장은 자기 지사 기사 계정만 활성/비활성 가능
        if (callerRole.appRole === 'branch_manager' && role.branchId !== callerRole.branchId) throw new TRPCError({ code: "FORBIDDEN" });
        await db.updateAppRoleFields(input.userId, { isActive: input.isActive });
        return { success: true };
      }),

    // 관리자에 의한 임시 비밀번호 재발급 (본사 관리자 또는 지사장)
    resetTempPassword: publicProcedure
      .input(z.object({ userId: z.number(), tempPassword: z.string().min(4) }))
      .mutation(async ({ input, ctx }) => {
        const callerRole = await resolveCallerRole(ctx);
        if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (!['hq_admin', 'branch_manager'].includes(callerRole.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
        // 지사장은 자기 지사 기사 계정 비밀번호만 초기화 가능
        if (callerRole.appRole === 'branch_manager' && role.branchId !== callerRole.branchId) throw new TRPCError({ code: "FORBIDDEN" });
        await db.updateAppRoleFields(input.userId, {
          passwordHash: hashPassword(input.tempPassword),
          mustChangePassword: true,
        });
        return { success: true };
      }),

    // 비밀번호 변경 (로그인 사용자 본인 / 첫 로그인 임시비번 변경)
    changePassword: publicProcedure
      .input(z.object({ userId: z.number(), currentPassword: z.string().optional(), newPassword: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false, error: "계정을 찾을 수 없습니다." };
        // 현재 비밀번호 확인 (mustChangePassword가 아닌 일반 변경 시)
        if (!role.mustChangePassword && input.currentPassword !== undefined) {
          const check = verifyPassword(input.currentPassword, role.passwordHash);
          if (!check.ok) return { success: false, error: "현재 비밀번호가 올바르지 않습니다." };
        }
        await db.updateAppRoleFields(input.userId, {
          passwordHash: hashPassword(input.newPassword),
          mustChangePassword: false,
        });
        return { success: true };
      }),

    // 관리자용: app_roles.id로 직접 필드 업데이트 (userId=null인 레거시 계정 포함)
    adminUpdateById: publicProcedure
      .input(z.object({
        id: z.number(),
        phoneNumber: z.string().optional(),
        name: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...fields } = input;
        await db.updateAppRoleById(id, fields);
        return { success: true };
      }),
    // ─── 테스트 계정 초기화 (yjs1234 공통 테스트 계정 생성/리셋) ──────────────────────────────────
    // ⚠️ 운영 전환 시 이 라우터를 제거하거나 비활성화하세요.
    resetTestAccounts: publicProcedure
      .input(z.object({ secret: z.string() }))
      .mutation(async ({ input }) => {
        // 비밀 키 검증 — 환경변수 RESET_SECRET 또는 기본 키와 일치해야 실행
        const ALLOWED = process.env.RESET_SECRET || "fet-reset-2025-internal";
        if (input.secret !== ALLOWED) {
          throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
        }
        const TEST_ACCOUNTS = [
          { loginId: "yjs1234", name: "유종선(테스트기사)", role: "technician", phoneNumber: "01012341234" },
          { loginId: "admin",   name: "본사관리자",         role: "hq_admin",   phoneNumber: "01099990001" },
        ];
        const results = [];
        for (const acct of TEST_ACCOUNTS) {
          try {
            const seedStr = `test-account-${acct.loginId}`;
            const userId = generateSafeUserId(seedStr);
            // 비밀번호는 소스코드에 저장하지 않음 — 계정 구조만 생성/확인
            // 실제 비밀번호는 관리자 화면에서 generateTestTechnicianPassword API로 재발급
            const existing = await db.getAppRoleByLoginId(acct.loginId);
            if (existing) {
              await db.updateAppRoleFields(existing.userId, {
                appRole: acct.role as any,
                mustChangePassword: true,
                isActive: true,
              });
            } else {
              // 신규 생성 시 임시 비밀번호는 난수로 생성 (평문 반환 안 함)
              const tempPw = crypto.randomBytes(16).toString("hex");
              await db.upsertAppRole({
                userId,
                appRole: acct.role as any,
                loginId: acct.loginId,
                passwordHash: hashPassword(tempPw),
                phoneNumber: acct.phoneNumber,
                name: acct.name,
                branchId: null,
                mustChangePassword: true,
                isActive: true,
              });
            }
            // 기사 계정이면 technicians 테이블에도 레코드 연결
            if (acct.role === "technician") {
              const existingTech = await db.getTechnicianByUserIdOrPhone(userId, acct.phoneNumber);
              if (!existingTech) {
                await db.createTechnician({
                  name: acct.name,
                  phoneNumber: acct.phoneNumber,
                  specialty: "난방수리",
                  branchId: null,
                  userId,
                  isActive: true,
                } as any);
              } else if (!existingTech.userId) {
                await db.updateTechnicianUserId(existingTech.id, userId);
              }
            }
            results.push({ loginId: acct.loginId, status: "ok" });
          } catch (e: any) {
            results.push({ loginId: acct.loginId, status: `error: ${e?.message}` });
          }
        }
        return { success: true, results };
      }),

    // ─── 테스트 기사 계정 임시 비밀번호 재발급 (본사 관리자 전용, 1회성 반환) ──────────────────────
    // 평문 비밀번호는 이 응답에서만 1회 반환되며, DB에는 bcrypt 해시만 저장됨
    // 관리자 화면을 닫거나 새로고침하면 다시 확인 불가 — 분실 시 재발급 필요
    generateTestTechnicianPassword: publicProcedure
      .input(z.object({ loginId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const callerRole = await resolveCallerRole(ctx);
        if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
        if (callerRole.appRole !== "hq_admin") throw new TRPCError({ code: "FORBIDDEN", message: "본사 관리자만 접근 가능합니다." });
        const role = await db.getAppRoleByLoginId(input.loginId.trim());
        if (!role) return { success: false, error: "계정을 찾을 수 없습니다." };
        if (role.appRole !== "technician") return { success: false, error: "기사 계정이 아닙니다." };
        // 서버에서 안전한 난수로 임시 비밀번호 생성 (12자: 영문+숫자 혼합)
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        const randomBytes = crypto.randomBytes(12);
        const tempPassword = Array.from(randomBytes)
          .map(b => chars[b % chars.length])
          .join("");
        // DB에는 bcrypt 해시만 저장 (평문 저장 금지)
        await db.updateAppRoleFields(role.userId, {
          passwordHash: hashPassword(tempPassword),
          mustChangePassword: true,
        });
        // 평문 비밀번호는 이 응답에서만 1회 반환 — 로그/DB에 저장 안 됨
        return {
          success: true,
          loginId: role.loginId,
          tempPassword, // 클라이언트에서 1회 표시 후 소멸
        };
      }),
    // ─── 내 계정정보 변경 (세션 기반, 기사앱 전용) ────────────────────────────────────────────────
    updateMyProfile: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1).optional(),
        newPassword: z.string().min(6).max(64).optional(),
        phoneNumber: z.string().max(20).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user.id;
        const role = await db.getAppRole(userId);
        if (!role) return { success: false, error: "계정을 찾을 수 없습니다." };
        // 비밀번호 변경 요청 시 현재 비밀번호 검증
        if (input.newPassword) {
          if (!input.currentPassword) return { success: false, error: "현재 비밀번호를 입력해주세요." };
          const check = verifyPassword(input.currentPassword, role.passwordHash);
          if (!check.ok) return { success: false, error: "현재 비밀번호가 올바르지 않습니다." };
          await db.updateAppRoleFields(userId, {
            passwordHash: hashPassword(input.newPassword),
            mustChangePassword: false,
          });
        }
        // 전화번호 변경 요청 시
        if (input.phoneNumber !== undefined) {
          const normalized = input.phoneNumber.replace(/[^0-9]/g, "");
          await db.updateAppRoleFields(userId, { phoneNumber: normalized || null });
          // technicians 테이블도 동기화
          const tech = await db.getTechnicianByUserId(userId);
          if (tech) await db.updateTechnician(tech.id, { phoneNumber: normalized || undefined });
        }
        return { success: true };
      }),
    // ─── 테스트 기사 계정 정보 조회 (본사 관리자 전용, 1회성 확인용) ─────────────────────────────────
    getTechnicianTestInfo: publicProcedure
      .input(z.object({ loginId: z.string() }))
      .query(async ({ input, ctx }) => {
        const callerRole = await resolveCallerRole(ctx);
        if (!callerRole) throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
        if (callerRole.appRole !== "hq_admin") throw new TRPCError({ code: "FORBIDDEN", message: "본사 관리자만 접근 가능합니다." });
        const role = await db.getAppRoleByLoginId(input.loginId.trim());
        if (!role) return { success: false, error: "계정을 찾을 수 없습니다." };
        if (role.appRole !== "technician") return { success: false, error: "기사 계정이 아닙니다." };
        // technicianId 조회
        const techIdSet = new Set<number>();
        const techByUserId = await db.getTechnicianByUserId(role.userId);
        if (techByUserId) techIdSet.add(techByUserId.id);
        if (role.phoneNumber) {
          const allTechs = await db.getTechniciansByPhone(role.phoneNumber);
          for (const t of allTechs) techIdSet.add(t.id);
          const appRolesByPhone = await db.getAppRolesByPhoneNormalized(role.phoneNumber);
          for (const r of appRolesByPhone) techIdSet.add(r.id);
        }
        techIdSet.add(role.id);
        // 배정된 접수 건 수 조회
        let assignedCount = 0;
        let selectedTechnicianId: number | null = null;
        for (const tid of techIdSet) {
          const works = await db.getRepairRequestsByTechnician(tid);
          if (works.length > 0) { selectedTechnicianId = tid; assignedCount = works.length; break; }
        }
        if (!selectedTechnicianId && techIdSet.size > 0) selectedTechnicianId = Array.from(techIdSet)[0];
        // 비밀번호는 반환하지 않음 - 관리자가 직접 임시 비밀번호를 재발급하도록 안내
        return {
          success: true,
          loginId: role.loginId,
          name: role.name,
          userId: role.userId,
          technicianId: selectedTechnicianId,
          phoneNumber: role.phoneNumber,
          isActive: role.isActive,
          mustChangePassword: role.mustChangePassword,
          assignedCount,
          appRole: role.appRole,
        };
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
        // 복수 증상 선택 (배열)
        symptoms: z.array(z.enum(symptomValues)).optional(),
        detailContent: z.string().max(2000).optional(),
        photoUrl: z.string().optional(),
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
        isUrgent: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        // 주소 기반 지사 자동 배정
        const address = `${input.apartmentName} ${input.dong}`;
        const branch = await db.findBranchByAddress(address);

        // symptoms 배열을 JSON 문자열로 저장
        const symptomsJson = input.symptoms && input.symptoms.length > 0
          ? JSON.stringify(input.symptoms)
          : null;
        let created;
        try {
          created = await db.createRepairRequest({
            ...input,
            symptoms: symptomsJson,
            branchId: branch?.id ?? null,
            // 주소 기반 자동 배정 성공 시 지사배정, 아니면 접수완료
            workflowStage: branch?.id ? "지사배정" : "접수완료",
          });
        } catch (insertErr) {
          // 접수 저장(INSERT) 실패 시 실제 오류 메시지·스택을 Vercel 로그에 남긴다.
          const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
          const errStack = insertErr instanceof Error ? insertErr.stack : undefined;
          console.error("[접수 INSERT 실패] message:", errMsg);
          if (errStack) console.error("[접수 INSERT 실패] stack:", errStack);
          console.error("[접수 INSERT 실패] payload:", JSON.stringify({
            customerName: input.customerName,
            apartmentName: input.apartmentName,
            requestType: input.requestType,
            symptom: input.symptom,
            symptoms: symptomsJson,
            branchId: branch?.id ?? null,
            workflowStage: branch?.id ? "지사배정" : "접수완료",
          }));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `접수 저장 실패: ${errMsg}`,
            cause: insertErr,
          });
        }

        // 실제 증상 목록 (복수 선택 우선, 없으면 단일 symptom 사용)
        const symptomsForSms: string[] = input.symptoms && input.symptoms.length > 0
          ? input.symptoms
          : [input.symptom];
        const typeLabel = requestTypeLabel[input.requestType] ?? "서비스";

        // 알림/SMS 등 부수효과는 접수 저장 성공 이후의 부가 작업이므로,
        // 여기서 오류가 나더라도 접수 자체는 성공 처리되도록 전체를 try/catch로 감싼다.
        try {
          // ① 고객에게 접수 완료 알림 (알림톡 우선 → 실패 시 문자 대체)
          const customerMsg = buildCustomerReceivedMessage({
            requestType: typeLabel,
            symptoms: symptomsForSms,
            apartmentName: input.apartmentName,
            dong: input.dong,
            ho: input.ho,
          });
          await notifyAndLog({
            requestId: created.id,
            phoneNumber: input.phoneNumber,
            messageType: "접수완료_고객",
            content: customerMsg,
          });

          // ② 본사 관리자에게 신규 접수 알림 SMS 발송 (관리자 번호가 설정된 경우만)
          const adminPhone = await db.getSetting("hq_admin_phone");
          if (adminPhone && adminPhone.trim().length >= 9) {
            const adminMsg = buildAdminReceivedMessage({
              customerName: input.customerName,
              phoneNumber: input.phoneNumber,
              requestType: typeLabel,
              symptoms: symptomsForSms,
              apartmentName: input.apartmentName,
              dong: input.dong,
              ho: input.ho,
            });
            const adminSendResult = await sendSms(adminPhone.trim(), adminMsg);
            await db.createNotificationLog({
              requestId: created.id,
              phoneNumber: adminPhone.trim(),
              channel: "SMS",
              messageType: "접수완료_관리자",
              content: adminMsg,
              result: adminSendResult.result,
              errorMessage: adminSendResult.errorMessage,
            });
          }

          // ③ 긴급 접수인 경우 담당 지사장에게도 긴급 SMS 발송
          if (input.isUrgent && branch) {
            const branchInfo = await db.getBranchById(branch.id);
            if (branchInfo?.phoneNumber && branchInfo.phoneNumber.trim().length >= 9) {
              const urgentMsg = `[긴급출동] ${input.customerName} 고객\n휴대: ${input.phoneNumber}\n${input.apartmentName} ${input.dong}동 ${input.ho}호\n증상: ${symptomsForSms.join(", ")}\n★ 긴급출동 요청입니다. 즉시 연락 바랍니다.`;
              await sendSms(branchInfo.phoneNumber.trim(), urgentMsg);
            }
          }
        } catch (notifyErr) {
          // 알림 실패는 접수 성공에 영향을 주지 않는다.
          console.warn("[접수] 알림/SMS 발송 중 오류(접수는 정상 저장됨):", notifyErr);
        }

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
    listAll: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const role = (ctx.user as any).appRole;
      const allowedRoles = ["hq_admin", "admin", "headquarters", "branch_manager", "staff"];
      if (!allowedRoles.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      return db.getAllRepairRequests();
    }),

    // 지사별 목록 (지사장용)
    listByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => db.getRepairRequestsByBranch(input.branchId)),

        // 기사별 배정 목록 (기사용 - technicianId 기준)
    listByTechnician: publicProcedure
      .input(z.object({ technicianId: z.number() }))
      .query(async ({ input }) => db.getRepairRequestsByTechnician(input.technicianId)),
    // 기사별 배정 목록 (userId 기준 - 신규 가입 기사용, phoneNumber fallback 포함)
    listByTechnicianUserId: publicProcedure
      .input(z.object({ userId: z.number(), phoneNumber: z.string().optional() }))
      .query(async ({ input }) => {
        // 모든 관련 technicianId 수집 (technicians 테이블 + app_roles 테이블 모두 포함)
        const techIdSet = new Set<number>();
        // 1) technicians 테이블: userId로 직접 조회
        const techByUserId = await db.getTechnicianByUserId(input.userId);
        if (techByUserId) techIdSet.add(techByUserId.id);
        // 2) technicians 테이블: phoneNumber로 모든 매칭 레코드 조회
        if (input.phoneNumber) {
          const allTechs = await db.getTechniciansByPhone(input.phoneNumber);
          for (const t of allTechs) techIdSet.add(t.id);
          // userId 없는 레코드에 userId 연결
          const noUserId = allTechs.find((t: any) => !t.userId);
          if (noUserId) {
            try { await db.updateTechnicianUserId(noUserId.id, input.userId); } catch {}
          }
          // 3) app_roles 테이블: phoneNumber로 모든 기사 계정 조회 (repair_requests.technicianId가 app_roles.id를 참조하는 경우 대응)
          const appRolesByPhone = await db.getAppRolesByPhoneNormalized(input.phoneNumber);
          for (const r of appRolesByPhone) techIdSet.add(r.id);
        }
        // 4) app_roles 테이블: userId로 직접 조회 (app_roles.id를 technicianId로 사용하는 경우)
        const appRoleByUserId = await db.getAppRole(input.userId);
        if (appRoleByUserId?.appRole === "technician") techIdSet.add(appRoleByUserId.id);
        if (techIdSet.size === 0) return [];
        return db.getRepairRequestsByTechnicianIds(Array.from(techIdSet));
      }),
    // 세션 기반 내 일정 조회 (protectedProcedure - 타인 조회 불가)
    listMySchedule: protectedProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user.id;
        // 모든 관련 technicianId 수집
        const techIdSet = new Set<number>();
        const techByUserId = await db.getTechnicianByUserId(userId);
        if (techByUserId) techIdSet.add(techByUserId.id);
        if (ctx.user.phoneNumber) {
          const allTechs = await db.getTechniciansByPhone(ctx.user.phoneNumber);
          for (const t of allTechs) techIdSet.add(t.id);
          const appRolesByPhone = await db.getAppRolesByPhoneNormalized(ctx.user.phoneNumber);
          for (const r of appRolesByPhone) techIdSet.add(r.id);
        }
        const appRoleByUserId = await db.getAppRole(userId);
        if (appRoleByUserId?.appRole === "technician") techIdSet.add(appRoleByUserId.id);
        if (techIdSet.size === 0) return [];
        return db.getRepairRequestsByTechnicianIds(Array.from(techIdSet));
      }),
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
            await notifyAndLog({
              requestId: req.id, phoneNumber: req.phoneNumber,
              messageType: "기사배정", content: message,
            });
          }
        }
        return { success: true };
      }),

    // 방문 일정 변경/확정 (지사장/본사만 가능 → 프론트 권한 제한, 변경 시 고객 안내)
    updateSchedule: publicProcedure
      .input(z.object({
        id: z.number(),
        scheduledDate: z.string(),
        scheduledTime: z.string(),
        changeReason: z.string().optional(),
        notify: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const before = await db.getRepairRequestById(input.id);
        const isChanged = Boolean(
          before && (before.scheduledDate !== input.scheduledDate || before.scheduledTime !== input.scheduledTime)
        );
        if (input.changeReason && input.changeReason.trim()) {
          await db.updateScheduleWithReason(input.id, input.scheduledDate, input.scheduledTime, input.changeReason.trim());
        } else {
          await db.updateSchedule(input.id, input.scheduledDate, input.scheduledTime);
        }
        if (input.notify && before) {
          const message = buildScheduleConfirmedMessage(
            before.customerName, input.scheduledDate, input.scheduledTime, isChanged, input.changeReason
          );
          await notifyAndLog({
            requestId: input.id, phoneNumber: before.phoneNumber,
            messageType: isChanged ? "일정변경" : "일정확정", content: message,
          });
        }
        return { success: true };
      }),

    // 지사 배정 안내 발송 (본사 관리자용, 발송 여부 선택)
    notifyBranchAssigned: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const req = await db.getRepairRequestById(input.id);
        if (!req) throw new Error("접수 정보를 찾을 수 없습니다.");
        const branch = req.branchId ? await db.getBranchById(req.branchId) : null;
        const message = buildBranchAssignedMessage(
          req.customerName, branch?.name ?? "본사", branch?.phoneNumber
        );
        const r = await notifyAndLog({
          requestId: req.id, phoneNumber: req.phoneNumber,
          messageType: "지사배정안내", content: message,
        });
        return { success: true, result: r.result };
      }),

    // 결제 완료 처리 (지사장/본사)
    markPaid: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ paidAt: new Date(), workflowStage: "결제완료" }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 후기 요청 발송 (지사장/본사)
    requestReview: publicProcedure
      .input(z.object({ id: z.number(), reviewUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ reviewRequestedAt: new Date(), workflowStage: "후기요청" }).where(eq(rr.id, input.id));
        const req = await db.getRepairRequestById(input.id);
        if (req) {
          const message = buildWorkCompletedMessage(req.customerName, input.reviewUrl);
          await notifyAndLog({
            requestId: req.id, phoneNumber: req.phoneNumber,
            messageType: "후기요청", content: message,
          });
        }
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
        const { repairRequests: rr } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ estimateAmount: String(input.estimateAmount), status: "견적승인대기", workflowStage: "견적전달", estimateSentAt: new Date() }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 견적 승인 (고객용) → 견적승인 단계로 이동 (기사 배정/일정 확정 가능)
    approveEstimate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ estimateApprovedAt: new Date(), status: "기사배정대기", workflowStage: "견적승인" }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 재방문 설정 (기사용)
    setRevisit: publicProcedure
      .input(z.object({ id: z.number(), needsRevisit: z.boolean(), revisitReason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ needsRevisit: input.needsRevisit, revisitReason: input.revisitReason ?? null }).where(eq(rr.id, input.id));
        return { success: true };
      }),

    // 지사 재배정 (본사 관리자용)
    reassignBranch: publicProcedure
      .input(z.object({ id: z.number(), branchId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        await db.reassignBranch(input.id, input.branchId);
        if (input.branchId) {
          await db.setWorkflowStage(input.id, "지사배정");
        }
        return { success: true };
      }),
    // 본사 처리 배정 (ownerType=headquarters, branchId=null)
    assignToHQ: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.assignRepairToHQ(input.id);
        return { success: true };
      }),
    // 지사 배정 (ownerType=branch, branchId=선택한 지사)
    assignToBranch: publicProcedure
      .input(z.object({ id: z.number(), branchId: z.number() }))
      .mutation(async ({ input }) => {
        await db.assignRepairToBranch(input.id, input.branchId);
        await db.setWorkflowStage(input.id, "지사배정");
        return { success: true };
      }),

    // 기사 일정확인 (기사가 배정된 접수건 일정 확인 시)
    confirmJobSchedule: publicProcedure
      .input(z.object({
        id: z.number(),
        technicianId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const req = await db.getRepairRequestById(input.id);
        if (!req) throw new Error("접수건을 찾을 수 없습니다.");
        // 기사 본인 접수건만 확인 가능
        if (req.technicianId !== input.technicianId) throw new Error("자신에게 배정된 접수건만 확인할 수 있습니다.");
        await db.updateRepairStatus(input.id, "기사확인완료");
        try { await db.setWorkflowStage(input.id, "기사배정"); } catch {}
        return { success: true, message: "일정을 확인했습니다." };
      }),

    // 기사 워크플로우 상태 변경 (출발/도착/공사중/공사완료)
    updateWorkflowStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        technicianId: z.number(),
        status: z.enum(["기사확인대기", "기사확인완료", "기사일정확인", "출발", "도착", "공사중", "공사완료"]),
        notify: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const req = await db.getRepairRequestById(input.id);
        if (!req) throw new Error("접수건을 찾을 수 없습니다.");
        if (req.technicianId !== input.technicianId) throw new Error("자신에게 배정된 접수건만 변경할 수 있습니다.");
        await db.updateRepairStatus(input.id, input.status);
        // workflowStage ENUM 매핑 (status 값과 workflowStage ENUM이 다를 수 있음)
        const stageMap: Record<string, string> = {
          '기사확인대기': '기사배정',
          '기사확인완료': '기사일정확인',
          '기사일정확인': '기사일정확인',
          '출발': '기사출발',
          '도착': '기사도착',
          '공사중': '작업진행',
          '공사완료': '작업완료',
        };
        const mappedStage = stageMap[input.status] ?? input.status;
        try { await db.setWorkflowStage(input.id, mappedStage as any); } catch (e: any) {
          console.warn('[updateWorkflowStatus] setWorkflowStage failed:', e?.message);
        }
        if (input.notify && req.phoneNumber) {
          let msg = "";
          if (input.status === "출발") {
            msg = `[퓨처에너지테크] ${req.customerName}님, 담당 기사(${req.technicianName})가 출발하였습니다. 공사 중 문의: 031-8042-7310`;
          } else if (input.status === "도착") {
            msg = `[퓨처에너지테크] ${req.customerName}님, 담당 기사(${req.technicianName})가 도착하였습니다. 잠시만 기다려 주세요. 문의: 031-8042-7310`;
          } else if (input.status === "공사완료") {
            msg = `[퓨처에너지테크] ${req.customerName}님, 요청하신 공사가 완료되었습니다. 이용해 주셔서 감사합니다. 문의: 031-8042-7310`;
          }
          if (msg) {
            try { await notifyAndLog({ requestId: input.id, phoneNumber: req.phoneNumber, messageType: input.status, content: msg }); } catch {}
          }
        }
        return { success: true, message: `상태가 '${input.status}'로 변경되었습니다.` };
      }),
  }),

  // ─── 기사 관리 ─────────────────────────────────────────────────
  technicians: router({
    list: publicProcedure.query(async () => db.getActiveTechnicians()),
    listAll: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const role = (ctx.user as any).appRole;
      if (!["hq_admin", "admin", "headquarters", "branch_manager", "staff"].includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
      return db.getAllTechnicians();
    }),

    listByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => db.getTechniciansByBranch(input.branchId)),

    // 본사 소속 기사 목록 (branchId IS NULL)
    listByHQ: publicProcedure
      .query(async () => db.getHQTechnicians()),

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

    // 본사 관리자 휴대폰 번호 조회
    getAdminPhone: publicProcedure.query(async () => {
      const phone = await db.getSetting("hq_admin_phone");
      return { phone: phone ?? "" };
    }),

    // 본사 관리자 휴대폰 번호 저장
    setAdminPhone: publicProcedure
      .input(z.object({ phone: z.string().max(20) }))
      .mutation(async ({ input }) => {
        await db.setSetting("hq_admin_phone", input.phone.replace(/[^0-9]/g, ""));
        return { success: true };
      }),

    // 운영시간 안내 문구 조회
    getOperatingHours: publicProcedure.query(async () => {
      const value = await db.getSetting("operating_hours");
      return { text: value ?? "평일 09:00 ~ 18:00 / 토요일 09:00 ~ 13:00 / 일요일·공휴일 휴무" };
    }),

    // 운영시간 안내 문구 저장 (관리자)
    setOperatingHours: publicProcedure
      .input(z.object({ text: z.string().max(500) }))
      .mutation(async ({ input }) => {
        await db.setSetting("operating_hours", input.text);
        return { success: true };
      }),

    // 문자 발송 테스트
    sendSmsTest: publicProcedure.mutation(async () => {
      const adminPhone = await db.getSetting("hq_admin_phone");
      if (!adminPhone || adminPhone.trim().length < 9) {
        return { success: false, error: "관리자 휴대폰 번호가 등록되지 않았습니다. 먼저 설정 화면에서 번호를 입력해 주세요." };
      }
      if (!isSmsConfigured()) {
        return { success: false, error: "SOLAPI 환경변수(API Key/Secret/발신번호)가 설정되지 않았습니다." };
      }
      const msg = buildSmsTestMessage();
      const result = await sendSms(adminPhone.trim(), msg);
      await db.createNotificationLog({
        requestId: undefined,
        phoneNumber: adminPhone.trim(),
        channel: "SMS",
        messageType: "SMS테스트",
        content: msg,
        result: result.result,
        errorMessage: result.errorMessage,
      });
      if (result.result === "SUCCESS") {
        return { success: true };
      }
      return { success: false, error: friendlySmsError(result.errorMessage) };
    }),

    // 고장접수 SMS 시뮬레이션 테스트 (지정 번호로 고객/관리자 SMS 동시 발송)
    sendRepairSmsTest: publicProcedure
      .input(z.object({
        customerPhone: z.string().min(9, "고객 전화번호를 입력해 주세요"),
      }))
      .mutation(async ({ input }) => {
        if (!isSmsConfigured()) {
          return {
            success: false,
            customerResult: null,
            adminResult: null,
            error: "SOLAPI 환경변수(API Key/Secret/발신번호)가 설정되지 않았습니다.",
          };
        }
        const customerPhone = input.customerPhone.replace(/[^0-9]/g, "");
        const adminPhone = await db.getSetting("hq_admin_phone");

        // 고객 SMS
        const customerMsg = buildCustomerReceivedMessage({
          requestType: "난방 고장 접수 (테스트)",
          symptoms: ["난방 불량", "온도조절기 이상"],
          apartmentName: "테스트 아파트",
          dong: "101",
          ho: "1234",
        });
        const customerResult = await sendSms(customerPhone, customerMsg);
        await db.createNotificationLog({
          requestId: undefined,
          phoneNumber: customerPhone,
          channel: "SMS",
          messageType: "접수완료(테스트-고객)",
          content: customerMsg,
          result: customerResult.result,
          errorMessage: customerResult.errorMessage,
        });

        // 관리자 SMS
        let adminResult = null;
        if (adminPhone && adminPhone.trim().length >= 9) {
          const adminMsg = buildAdminReceivedMessage({
            customerName: "홍길동(테스트)",
            phoneNumber: customerPhone,
            requestType: "난방 고장 접수 (테스트)",
            symptoms: ["난방 불량", "온도조절기 이상"],
            apartmentName: "테스트 아파트",
            dong: "101",
            ho: "1234",
          });
          adminResult = await sendSms(adminPhone.trim(), adminMsg);
          await db.createNotificationLog({
            requestId: undefined,
            phoneNumber: adminPhone.trim(),
            channel: "SMS",
            messageType: "접수완료(테스트-관리자)",
            content: adminMsg,
            result: adminResult.result,
            errorMessage: adminResult.errorMessage,
          });
        }

        const customerOk = customerResult.result === "SUCCESS";
        const adminOk = !adminResult || adminResult.result === "SUCCESS";

        return {
          success: customerOk,
          customerResult: {
            result: customerResult.result,
            phone: customerPhone,
            error: customerResult.result !== "SUCCESS" ? friendlySmsError(customerResult.errorMessage) : undefined,
          },
          adminResult: adminResult ? {
            result: adminResult.result,
            phone: adminPhone?.trim() ?? "",
            error: adminResult.result !== "SUCCESS" ? friendlySmsError(adminResult.errorMessage) : undefined,
          } : null,
          adminPhoneSet: !!(adminPhone && adminPhone.trim().length >= 9),
          error: !customerOk ? friendlySmsError(customerResult.errorMessage) : undefined,
        };
      }),
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
    // 누수 알림 수신번호 설정 조회
    getAlertPhones: publicProcedure.query(async () => {
      const adminPhone = await db.getSetting("admin_phone");
      const extraPhones = await db.getSetting("leak_alert_phones");
      return {
        adminPhone: adminPhone ?? "",
        extraPhones: extraPhones ?? "",
      };
    }),
    // 누수 알림 수신번호 저장
    setAlertPhones: publicProcedure
      .input(z.object({
        adminPhone: z.string(),
        extraPhones: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.setSetting("admin_phone", input.adminPhone);
        await db.setSetting("leak_alert_phones", input.extraPhones);
        return { success: true };
      }),
    // 발송 내역 조회
    getNotificationLogs: publicProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const logs = await db.getNotificationLogs();
        return logs
          .filter((l) => l.messageType?.startsWith("누수감지"))
          .slice(0, input.limit);
      }),
  }),

  // ─── 유량 관리 ──────────────────────────────────────────────────
  flowRate: router({
    listSettings: publicProcedure.query(async () => db.getAllFlowRateSettings()),

    addSetting: publicProcedure
      .input(z.object({
        sensorId: z.string().min(1),
        branchId: z.number().nullable().optional(),
        apartmentName: z.string().min(1),
        buildingNumber: z.string().min(1),
        roomNumber: z.string().min(1),
        baseFlowRateLpm: z.number().positive(),
        warningRangePercent: z.number().min(1).max(100).default(30),
        cautionRangePercent: z.number().min(1).max(100).default(15),
        alertDurationMinutes: z.number().min(1).default(10),
      }))
      .mutation(async ({ input }) => {
        await db.upsertFlowRateSetting({
          sensorId: input.sensorId,
          branchId: input.branchId ?? null,
          apartmentName: input.apartmentName,
          buildingNumber: input.buildingNumber,
          roomNumber: input.roomNumber,
          baseFlowRateLpm: String(input.baseFlowRateLpm.toFixed(2)),
          warningRangePercent: input.warningRangePercent,
          cautionRangePercent: input.cautionRangePercent,
          alertDurationMinutes: input.alertDurationMinutes,
        });
        return { success: true };
      }),

    updateSetting: publicProcedure
      .input(z.object({
        id: z.number(),
        baseFlowRateLpm: z.number().positive().optional(),
        warningRangePercent: z.number().min(1).max(100).optional(),
        cautionRangePercent: z.number().min(1).max(100).optional(),
        alertDurationMinutes: z.number().min(1).optional(),
        apartmentName: z.string().optional(),
        buildingNumber: z.string().optional(),
        roomNumber: z.string().optional(),
        branchId: z.number().nullable().optional(),
        // v1.1 필드
        meterType: z.enum(["\uc801\uc0b0\uc5f4\ub7c9\uacc4", "\uc720\ub7c9\uacc4"]).nullable().optional(),
        registeredPyeong: z.number().positive().nullable().optional(),
        customerId: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, baseFlowRateLpm, meterType, registeredPyeong, customerId, ...rest } = input;
        await db.updateFlowRateSetting(id, {
          ...(baseFlowRateLpm !== undefined && { baseFlowRateLpm: String(baseFlowRateLpm.toFixed(2)) }),
          ...rest,
        });
        // v1.1 필드 업데이트
        if (meterType !== undefined || registeredPyeong !== undefined || customerId !== undefined) {
          const setting = await db.getFlowRateSettingById(id);
          if (setting) {
            await db.updateFlowRateSettingV11Fields(setting.sensorId, {
              ...(meterType !== undefined && { meterType: meterType as any }),
              ...(registeredPyeong !== undefined && { registeredPyeong: registeredPyeong !== null ? String(registeredPyeong) : null }),
            });
            if (customerId !== undefined) {
              await db.updateFlowRateSetting(id, { customerId: customerId ?? null } as any);
            }
          }
        }
        return { success: true };
      }),
    // v1.1 유량 알림 이벤트 이력 조회
    listAlertEvents: publicProcedure
      .input(z.object({ sensorId: z.string().optional(), limit: z.number().default(100) }))
      .query(async ({ input }) => {
        if (input.sensorId) return db.getFlowRateAlertEvents(input.sensorId, input.limit);
        return db.getAllFlowRateAlertEvents(input.limit);
      }),

    deleteSetting: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteFlowRateSetting(input.id);
        return { success: true };
      }),

    getLogs: publicProcedure
      .input(z.object({ sensorId: z.string().optional(), limit: z.number().default(50) }))
      .query(async ({ input }) => {
        if (input.sensorId) return db.getFlowRateLogs(input.sensorId, input.limit);
        return db.getRecentFlowRateLogs(input.limit);
      }),

    // 고객 전화번호 기반 유량 데이터 조회
    getByCustomerPhone: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input }) => {
        // 전화번호로 고객 접수 이력에서 customerId 또는 sensorId 매핑
        const settings = await db.getAllFlowRateSettings();
        // customerId 필드가 전화번호와 일치하는 항목 반환
        const matched = settings.filter((s: any) => s.customerId === input.phone);
        return matched;
      }),

    // 점검 처리 상태 업데이트
    updateInspection: publicProcedure
      .input(z.object({
        id: z.number(),
        inspectionStatus: z.enum(["미처리", "처리중", "처리완료"]),
        inspectionMemo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateFlowRateSetting(input.id, {
          inspectionStatus: input.inspectionStatus,
          inspectionMemo: input.inspectionMemo ?? null,
        });
        return { success: true };
      }),

    // 고객 점검 요청
    requestInspection: publicProcedure
      .input(z.object({
        sensorId: z.string().min(1),
        customerPhone: z.string().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const setting = await db.getFlowRateSettingBySensorId(input.sensorId);
        if (!setting) throw new Error("센서 정보를 찾을 수 없습니다.");
        await db.updateFlowRateSetting(setting.id, {
          inspectionStatus: "처리중",
          inspectionMemo: `고객 점검 요청${input.message ? ': ' + input.message : ''} (${new Date().toLocaleString('ko-KR')})`,
        });
        return { success: true };
      }),

    // 기사앱용 - 고객 전화번호로 유량 이상 상태 조회
    getAlertByPhone: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input }) => {
        const settings = await db.getAllFlowRateSettings();
        const matched = settings.filter((s: any) => s.customerId === input.phone);
        if (matched.length === 0) return null;
        const s = matched[0];
        // v1.1 alertType 우선, 없으면 lastStatus로 판단
        const alertType = (s as any).alertType ?? null;
        const lastStatus = s.lastStatus ?? "정상";
        const isAlert = alertType !== null || lastStatus === "경고" || lastStatus === "주의";
        return {
          sensorId: s.sensorId,
          apartmentName: s.apartmentName,
          buildingNumber: s.buildingNumber,
          roomNumber: s.roomNumber,
          meterType: (s as any).meterType ?? null,
          registeredPyeong: (s as any).registeredPyeong ?? null,
          lastFlowRateLpm: s.lastFlowRateLpm ?? null,
          lowerLimitLpm: (s as any).lowerLimitLpm ?? null,
          upperLimitLpm: (s as any).upperLimitLpm ?? null,
          alertType,
          lastStatus,
          isAlert,
          lastMeasuredAt: s.lastMeasuredAt ?? null,
        };
      }),

    demoUpdate: publicProcedure
      .input(z.object({
        sensorId: z.string().min(1),
        flowRateLpm: z.number().min(0),
      }))
      .mutation(async ({ input }) => {
        const setting = await db.getFlowRateSettingBySensorId(input.sensorId);
        if (!setting) throw new Error("센서 설정을 찾을 수 없습니다.");
        const base = parseFloat(String(setting.baseFlowRateLpm));
        const diffPct = Math.abs((input.flowRateLpm - base) / base) * 100;
        let status: "정상" | "주의" | "경고" = "정상";
        if (diffPct >= setting.warningRangePercent) status = "경고";
        else if (diffPct >= setting.cautionRangePercent) status = "주의";
        const now = new Date();
        await db.createFlowRateLog({
          sensorId: input.sensorId,
          branchId: setting.branchId ?? null,
          apartmentName: setting.apartmentName,
          buildingNumber: setting.buildingNumber,
          roomNumber: setting.roomNumber,
          flowRateLpm: String(input.flowRateLpm.toFixed(2)),
          measuredAt: now,
          status,
          source: "DEMO",
        });
        let alertStartedAt = setting.alertStartedAt ? new Date(setting.alertStartedAt) : null;
        if (status === "정상") alertStartedAt = null;
        else if (!alertStartedAt) alertStartedAt = now;
        await db.updateFlowRateLastData(input.sensorId, {
          lastFlowRateLpm: String(input.flowRateLpm.toFixed(2)),
          lastMeasuredAt: now,
          lastStatus: status,
          alertStartedAt,
          alertSentAt: setting.alertSentAt ? new Date(setting.alertSentAt) : null,
        });
        return { success: true, status, flowRateLpm: input.flowRateLpm };
      }),
  }),
  // ─── 위치 추적 ───────────────────────────────────────────────────────────
  location: router({
    // 동의 여부 확인
    getConsent: publicProcedure
      .input(z.object({ technicianId: z.number() }))
      .query(async ({ input }) => {
        const consent = await db.getLocationConsent(input.technicianId);
        return { hasConsented: !!consent };
      }),

    // 동의 저장
    saveConsent: publicProcedure
      .input(z.object({ technicianId: z.number() }))
      .mutation(async ({ input }) => {
        await db.createLocationConsent(input.technicianId);
        return { success: true };
      }),

    // 위치 세션 시작 (기사가 "고객 집으로 출발" 누를 때)
    startTracking: publicProcedure
      .input(z.object({
        requestId: z.number(),
        technicianId: z.number(),
        technicianName: z.string(),
        technicianPhone: z.string().optional(),
        customerName: z.string(),
        customerPhone: z.string(),
        customerAddress: z.string(),
        customerLat: z.number().optional(),
        customerLng: z.number().optional(),
        branchId: z.number().optional(),
        branchName: z.string().optional(),
        demoMode: z.boolean().optional(), // 데모 모드: SMS 발송 안 함
      }))
      .mutation(async ({ input }) => {
        // 견적 게이팅: 견적이 고객에게 전달되었으나 아직 승인되지 않았다면 출발 차단
        const reqForGate = await db.getRepairRequestById(input.requestId);
        if (reqForGate && reqForGate.estimateSentAt && !reqForGate.estimateApprovedAt) {
          throw new Error("고객이 견적을 아직 승인하지 않았습니다. 견적 승인 후 출발 처리할 수 있습니다.");
        }
        // 이미 이동중인 세션이 있으면 종료
        const existing = await db.getLocationSessionByRequestId(input.requestId);
        if (existing) {
          await db.stopLocationSession(existing.trackingToken, "업무취소");
        }
        // 추측 불가능한 긴 일회용 위치코드 생성
        const token = generateTrackingToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4시간 후 만료
        // 카카오 지오코딩으로 customerLat/customerLng 자동 보완
        let resolvedCustomerLat = input.customerLat !== undefined ? String(input.customerLat) : null;
        let resolvedCustomerLng = input.customerLng !== undefined ? String(input.customerLng) : null;
        if ((!resolvedCustomerLat || !resolvedCustomerLng) && input.customerAddress) {
          try {
            const kakaoKey = process.env.KAKAO_REST_API_KEY || "";
            if (kakaoKey) {
              const geoUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(input.customerAddress)}`;
              const geoRes = await fetch(geoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
              if (geoRes.ok) {
                const geoData = await geoRes.json() as { documents?: Array<{ x: string; y: string }> };
                const doc = geoData.documents?.[0];
                if (doc) {
                  resolvedCustomerLat = doc.y;
                  resolvedCustomerLng = doc.x;
                  console.log(`[위치추적] 지오코딩 성공: ${input.customerAddress} -> ${doc.y},${doc.x}`);
                }
              }
            }
          } catch (geoErr) {
            console.warn("[위치추적] 카카오 지오코딩 실패:", geoErr);
          }
        }
        const session = await db.createLocationSession({
          requestId: input.requestId,
          technicianId: input.technicianId,
          technicianName: input.technicianName,
          technicianPhone: input.technicianPhone ?? null,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerAddress: input.customerAddress,
          customerLat: resolvedCustomerLat,
          customerLng: resolvedCustomerLng,
          branchId: input.branchId ?? null,
          branchName: input.branchName ?? null,
          trackingToken: token,
          status: "이동중",
          departedAt: now,
          expiresAt,
        });
        if (!session) throw new Error("세션 생성 실패");
        // 고객용 전용 링크 생성
        const baseUrl = process.env.SITE_URL || "https://퓨처에너지테크.kr";
        const trackingUrl = `${baseUrl}/track/${token}`;
        // 워크플로우 단계: 기사출발
        try { await db.setWorkflowStage(input.requestId, "기사출발"); } catch {}
        // 고객 알림 발송 (데모 모드가 아닌 경우, 알림톡 우선 → 문자 대체)
        let smsSent = false;
        if (!input.demoMode) {
          try {
            const msg = buildTechnicianDepartedMessage(
              input.customerName,
              input.technicianName,
              trackingUrl
            );
            const r = await notifyAndLog({
              requestId: input.requestId,
              phoneNumber: input.customerPhone,
              messageType: "기사출발",
              content: msg,
            });
            if (r.result === "SUCCESS") {
              smsSent = true;
              await db.markLocationSessionSmsSent(token);
            }
          } catch (smsErr) {
            console.error("[위치추적] SMS 발송 오류:", smsErr);
          }
        }
        return { success: true, token, trackingUrl, smsSent };
      }),

    // 관리자/지사장이 직접 위치 공유 시작 (전화 접수 고객 등 앱 미사용 케이스)
    // 기사 앱이 없어도 관리자가 세션을 만들고 고객에게 링크 SMS를 보낼 수 있음
    startTrackingByAdmin: publicProcedure
      .input(z.object({
        requestId: z.number(),
        technicianId: z.number(),
        technicianName: z.string(),
        technicianPhone: z.string().optional(),
        customerName: z.string(),
        customerPhone: z.string(),
        customerAddress: z.string(),
        customerLat: z.number().optional(),
        customerLng: z.number().optional(),
        branchId: z.number().optional(),
        branchName: z.string().optional(),
        expireHours: z.number().optional(), // 만료 시간(시간 단위), 기본 4시간
      }))
      .mutation(async ({ input }) => {
        // 이미 이동중인 세션이 있으면 종료(새 링크 발급)
        const existing = await db.getLocationSessionByRequestId(input.requestId);
        if (existing) {
          await db.stopLocationSession(existing.trackingToken, "업무취소");
        }
        const token = generateTrackingToken();
        const now = new Date();
        const hours = input.expireHours && input.expireHours > 0 ? input.expireHours : 4;
        const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
        const session = await db.createLocationSession({
          requestId: input.requestId,
          technicianId: input.technicianId,
          technicianName: input.technicianName,
          technicianPhone: input.technicianPhone ?? null,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerAddress: input.customerAddress,
          customerLat: input.customerLat !== undefined ? String(input.customerLat) : null,
          customerLng: input.customerLng !== undefined ? String(input.customerLng) : null,
          branchId: input.branchId ?? null,
          branchName: input.branchName ?? null,
          trackingToken: token,
          status: "이동중",
          departedAt: now,
          expiresAt,
        });
        if (!session) throw new Error("세션 생성 실패");
        const baseUrl = process.env.SITE_URL || "https://퓨처에너지테크.kr";
        const trackingUrl = `${baseUrl}/track/${token}`;
        let smsSent = false;
        let smsError: string | undefined;
        try {
          const msg = buildTechnicianDepartedMessage(
            input.customerName,
            input.technicianName,
            trackingUrl
          );
          const result = await sendSms(input.customerPhone, msg);
          if (result.result === "SUCCESS") {
            smsSent = true;
            await db.markLocationSessionSmsSent(token);
          } else {
            smsError = friendlySmsError(result.errorMessage);
          }
        } catch (smsErr) {
          smsError = smsErr instanceof Error ? smsErr.message : String(smsErr);
          console.error("[위치추적] 관리자 SMS 발송 오류:", smsErr);
        }
        return { success: true, token, trackingUrl, smsSent, smsError };
      }),

    // 관리자/지사장이 위치 세션 강제 종료 (도착완료/업무취소)
    stopTracking: publicProcedure
      .input(z.object({
        token: z.string(),
        reason: z.enum(["도착완료", "업무취소"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.stopLocationSession(input.token, input.reason ?? "업무취소");
        return { success: true, status: input.reason ?? "업무취소" };
      }),

    // 기사 도착 처리 (도착 버튼) → 단계 갱신 + 고객 도착 안내
    markArrived: publicProcedure
      .input(z.object({ requestId: z.number(), token: z.string().optional() }))
      .mutation(async ({ input }) => {
        if (input.token) {
          await db.stopLocationSession(input.token, "도착완료");
        }
        try { await db.setWorkflowStage(input.requestId, "기사도착"); } catch {}
        const req = await db.getRepairRequestById(input.requestId);
        if (req) {
          const message = buildTechnicianArrivedMessage(req.customerName, req.technicianName ?? "담당 기사");
          await notifyAndLog({
            requestId: req.id, phoneNumber: req.phoneNumber,
            messageType: "기사도착", content: message,
          });
        }
        return { success: true };
      }),

    // 작업 완료 처리 (완료 버튼) → 단계 갱신 + 고객 완료 안내
    markWorkCompleted: publicProcedure
      .input(z.object({ requestId: z.number(), reviewUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        try { await db.setWorkflowStage(input.requestId, "작업완료"); } catch {}
        // 공사완료 후 위치추적 세션 자동 만료 (보안: 위치확인 링크 접근 차단)
        try {
          const activeSession = await db.getLocationSessionByRequestId(input.requestId);
          if (activeSession && activeSession.status === "이동중") {
            await db.stopLocationSession(activeSession.trackingToken, "도착완료");
          }
        } catch (e) {
          console.error('[markWorkCompleted] 세션 만료 오류:', e);
        }
        const req = await db.getRepairRequestById(input.requestId);
        if (req) {
          const message = buildWorkCompletedMessage(req.customerName, input.reviewUrl);
          await notifyAndLog({
            requestId: req.id, phoneNumber: req.phoneNumber,
            messageType: "작업완료", content: message,
          });
        }
        return { success: true };
      }),

    // 토큰으로 위치 세션 재발송 SMS (고객이 문자를 못 받은 경우)
    resendTrackingSms: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const session = await db.getLocationSessionByToken(input.token);
        if (!session) throw new Error("세션을 찾을 수 없습니다.");
        if (session.status !== "이동중") {
          return { success: false, smsSent: false, smsError: "이미 종료된 세션입니다." };
        }
        const baseUrl = process.env.SITE_URL || "https://퓨처에너지테크.kr";
        const trackingUrl = `${baseUrl}/track/${session.trackingToken}`;
        let smsSent = false;
        let smsError: string | undefined;
        try {
          const msg = buildTechnicianDepartedMessage(
            session.customerName ?? "고객",
            session.technicianName ?? "담당 기사",
            trackingUrl
          );
          const result = await sendSms(session.customerPhone ?? "", msg);
          if (result.result === "SUCCESS") {
            smsSent = true;
            await db.markLocationSessionSmsSent(session.trackingToken);
          } else {
            smsError = friendlySmsError(result.errorMessage);
          }
        } catch (e) {
          smsError = e instanceof Error ? e.message : String(e);
        }
        return { success: true, smsSent, smsError, trackingUrl };
      }),

    // 현재 방문 건의 위치 세션 조회
    getSessionByRequest: publicProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input }) => {
        const session = await db.getLocationSessionByRequestId(input.requestId);
        return session;
      }),

    // 이동 중 전체 목록 (관리자용)
    getActiveSessions: publicProcedure
      .query(async () => {
        await db.expireOldLocationSessions();
        return db.getActiveLocationSessions();
      }),

    // 지사별 이동 중 목록 (지사장용)
    getActiveSessionsByBranch: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(async ({ input }) => {
        await db.expireOldLocationSessions();
        return db.getActiveLocationSessionsByBranch(input.branchId);
      }),
  }),
  // ─── 지사 모집 상담 신청 API ─────────────────────────────────
  branchApplication: router({
    // 공개: 신청서 제출
    submit: publicProcedure
      .input(z.object({
        applicantName: z.string().min(1).max(50),
        phoneNumber: z.string().min(9).max(20),
        privacyAgreed: z.boolean(),
        applyChannel: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (!input.privacyAgreed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "개인정보 수집에 동의해 주세요." });
        }
        const { id } = await db.createBranchApplication({
          applicantName: input.applicantName,
          phoneNumber: input.phoneNumber,
          privacyAgreed: true,
          applyChannel: input.applyChannel ?? "web",
          consultStatus: "신규접수",
        });
        return { success: true, id };
      }),
    // 관리자: 전체 목록 조회
    list: publicProcedure
      .query(async () => {
        return db.getAllBranchApplications();
      }),
    // 관리자: 단건 조회
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getBranchApplicationById(input.id);
      }),
    // 관리자: 상태·메모 수정
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        consultStatus: z.enum(["신규접수", "연락완료", "상담진행", "보류", "계약완료"]).optional(),
        adminMemo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateBranchApplication(id, data);
        return { success: true };
      }),
  }),

  // ─── 견적서 라우터 (독립형: 파일 업로드 → 발송 → 승인/거절 → 오더 생성) ─────────
  estimates: router({
    // 견적서 파일 업로드 (base64 → DB 저장, Vercel 환경 호환)
    uploadFile: publicProcedure
      .input(z.object({
        fileName: z.string(),
        contentType: z.string(),
        base64: z.string(),
        fileSize: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // 파일 크기 제한: 10MB (base64는 원본의 약 1.37배)
        const MAX_SIZE = 10 * 1024 * 1024;
        const estimatedSize = Math.round(input.base64.length * 0.75);
        if (estimatedSize > MAX_SIZE) {
          throw new Error(`파일 용량 초과: ${Math.round(estimatedSize / 1024 / 1024)}MB (최대 10MB)`);
        }
        // 지원 파일 형식 검증
        const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
        if (!allowedTypes.includes(input.contentType)) {
          throw new Error(`지원하지 않는 파일 형식: ${input.contentType} (PDF, JPG, PNG만 허용)`);
        }
        // 안전한 파일명 생성 (한글 포함 특수문자 → 영문/숫자만)
        const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "pdf";
        const safeName = `estimate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // DB에 임시 저장 후 파일 ID 반환 (실제 저장은 send 시 함께)
        // fileUrl은 /api/estimate-file/{token} 형태로 제공
        const tempToken = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return {
          url: `data:${input.contentType};base64,${input.base64.slice(0, 50)}...`,
          fileUrl: `__db__:${tempToken}`,
          fileData: input.base64,
          fileName: safeName,
          fileOriginalName: input.fileName,
          contentType: input.contentType,
          fileSize: estimatedSize,
        };
      }),

    // 견적서 생성 + 고객 발송
    send: publicProcedure
      .input(z.object({
        customerName: z.string().min(1),
        phoneNumber: z.string().min(8),
        title: z.string().optional(),
        amount: z.number().optional(),
        memo: z.string().optional(),
        fileUrl: z.string().optional(),
        fileData: z.string().optional(),
        fileName: z.string().optional(),
        fileOriginalName: z.string().optional(),
        fileType: z.string().optional(),
        fileSize: z.number().optional(),
        ownerType: z.enum(["headquarters", "branch"]).default("headquarters"),
        branchId: z.number().optional(),
        sentBy: z.number().optional(),
        sentByName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // 파일 업로드 없으면 발송 차단
        if (!input.fileData && !input.fileUrl) {
          throw new Error("견적서 파일을 먼저 업로드해주세요.");
        }
        const token = crypto.randomBytes(24).toString("base64url");
        const baseUrl = (process.env.SITE_URL || "https://퓨처에너지테크.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${token}`;
        const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const estimateNumber = `EST-${Date.now().toString().slice(-8)}`;
        // 파일 URL: DB 저장 방식이면 /api/estimate-file/{token} 형태로 제공
        const resolvedFileUrl = input.fileData
          ? `${baseUrl}/api/estimate-file/${token}`
          : (input.fileUrl ?? "");

        const estimateId = await db.createEstimate({
          requestId: null,
          estimateNumber,
          token,
          customerName: input.customerName,
          phoneNumber: input.phoneNumber.replace(/[^0-9]/g, ""),
          title: input.title ?? null,
          amount: input.amount != null ? String(input.amount) : null,
          memo: input.memo ?? null,
          fileUrl: resolvedFileUrl,
          fileData: input.fileData ?? null,
          fileName: input.fileName ?? null,
          fileOriginalName: input.fileOriginalName ?? null,
          fileType: input.fileType ?? null,
          fileSize: input.fileSize ?? null,
          ownerType: input.ownerType,
          branchId: input.branchId ?? null,
          status: "pending",
          sentAt: new Date(),
          validUntil,
          sentBy: input.sentBy ?? null,
          sentByName: input.sentByName ?? null,
        });

                // 고객 SMS 발송
        const phone = input.phoneNumber.replace(/[^0-9]/g, "");
        const msg = buildEstimateDocMessage({ customerName: input.customerName, estimateUrl, title: input.title });
        let smsSent = false;
        let smsRequested = false; // Solapi groupId 있음 (발송 요청 접수)
        let smsError: string | undefined;
        try {
          const r = await sendNotification(phone, msg);
          smsSent = r.result === "SUCCESS";
          smsRequested = r.result === "REQUESTED";
          if (!smsSent && !smsRequested) smsError = r.errorMessage;
        } catch (e: any) { smsError = e.message; }
        const logResult = smsSent ? "SUCCESS" : smsRequested ? "REQUESTED" : "FAIL";
        await db.createEstimateMessageLog({
          estimateId, branchId: input.branchId ?? null, phoneNumber: phone,
          messageType: "estimate_sent", content: msg,
          result: logResult, errorMessage: smsError ?? null,
        });
        return {
          success: true, estimateId, token, estimateUrl, estimateNumber,
          smsSent: smsSent || smsRequested,
          smsRequested,
          smsError: (smsSent || smsRequested) ? undefined : smsError,
        };
      }),

    // ─── 자동 생성기 견적 고객 송출 (파일 없이 품목 데이터로 견적 링크 생성) ───
    sendAuto: publicProcedure
      .input(z.object({
        customerName: z.string().min(1),
        phoneNumber: z.string().min(8),
        title: z.string().optional(),
        amount: z.number().optional(),
        description: z.string().optional(),
        autoEstimateItems: z.string().optional(),
        addressFull: z.string().optional(),
        buildingName: z.string().optional(),
        requestMemo: z.string().optional(),
        ownerType: z.enum(["headquarters", "branch"]).default("headquarters"),
        branchId: z.number().optional(),
        branchName: z.string().optional(),
        sentBy: z.number().optional(),
        sentByName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const token = crypto.randomBytes(24).toString("base64url");
        const baseUrl = (process.env.SITE_URL || "https://퓨처에너지테크.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${token}`;
        const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const estimateNumber = `EST-${Date.now().toString().slice(-8)}`;
        const estimateId = await db.createEstimate({
          estimateNumber,
          token,
          customerName: input.customerName,
          phoneNumber: input.phoneNumber.replace(/[^0-9]/g, ""),
          title: input.title ?? `${input.customerName} 고객 견적`,
          amount: input.amount != null ? String(input.amount) : null,
          description: input.description ?? null,
          autoEstimateItems: input.autoEstimateItems ?? null,
          addressFull: input.addressFull ?? null,
          buildingName: input.buildingName ?? null,
          requestMemo: input.requestMemo ?? null,
          memo: input.requestMemo ?? null,
          fileUrl: null,
          fileData: null,
          ownerType: input.ownerType,
          branchId: input.branchId ?? null,
          branchName: input.branchName ?? null,
          status: "sent",
          sourceType: "auto",
          sentAt: new Date(),
          validUntil,
          sentBy: input.sentBy ?? null,
          sentByName: input.sentByName ?? null,
        });
        const phone = input.phoneNumber.replace(/[^0-9]/g, "");
        const msg = buildEstimateDocMessage({ customerName: input.customerName, estimateUrl, title: input.title });
        let smsSent = false;
        let smsRequested = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(phone, msg);
          smsSent = r.result === "SUCCESS";
          smsRequested = r.result === "REQUESTED";
          if (!smsSent && !smsRequested) smsError = r.errorMessage;
        } catch (e: any) { smsError = e.message; }
        const logResult = smsSent ? "SUCCESS" : smsRequested ? "REQUESTED" : "FAIL";
        await db.createEstimateMessageLog({
          estimateId, branchId: input.branchId ?? null, phoneNumber: phone,
          messageType: "estimate_sent", content: msg,
          result: logResult, errorMessage: smsError ?? null,
        });
        return {
          success: true, estimateId, token, estimateUrl, estimateNumber,
          smsSent: smsSent || smsRequested,
          smsRequested,
          smsError: (smsSent || smsRequested) ? undefined : smsError,
        };
      }),
    // 견적서 재전송
    resend: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.id);
        if (!est) throw new Error("견적서를 찾을 수 없습니다.");
        const baseUrl = (process.env.SITE_URL || "https://퓨처에너지테크.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${est.token}`;
        const msg = buildEstimateDocMessage({ customerName: est.customerName, estimateUrl, title: est.title });
        let smsSent = false;
        let smsRequested = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(est.phoneNumber, msg);
          smsSent = r.result === "SUCCESS";
          smsRequested = r.result === "REQUESTED";
          if (!smsSent && !smsRequested) smsError = r.errorMessage;
        } catch (e: any) { smsError = e.message; }
        const logResult = smsSent ? "SUCCESS" : smsRequested ? "REQUESTED" : "FAIL";
        await db.createEstimateMessageLog({
          estimateId: est.id, branchId: est.branchId ?? null, phoneNumber: est.phoneNumber,
          messageType: "estimate_resent", content: msg,
          result: logResult, errorMessage: smsError ?? null,
        });
        return {
          success: true,
          smsSent: smsSent || smsRequested,
          smsRequested,
          smsError: (smsSent || smsRequested) ? undefined : smsError,
          estimateUrl,
        };
      }),

    // 토큰으로 견적 조회 (고객용) + 열람 표시
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        await db.expireOldEstimates();
        const est = await db.getEstimateByToken(input.token);
        if (!est) return null;
        if (est.status === "pending") {
          await db.markEstimateViewed(input.token);
        }
        // fileData(base64)는 고객에게 직접 노출하지 않음 - /api/estimate-file/:token 으로 제공
        const { fileData: _fd, ...safeEst } = est;
        return safeEst;
      }),

    // 곬적 거절 (고객) → 하위 호환 유지 (사용 안 함)
    reject: publicProcedure
      .input(z.object({ token: z.string(), rejectReason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateByToken(input.token);
        if (!est) throw new Error("곬적서를 찾을 수 없습니다.");
        if (est.status === "approved" || est.status === "rejected") {
          return { success: false, message: "이미 응답된 곬적입니다." };
        }
        await db.updateEstimateById(est.id, {
          status: "cancelled", rejectedAt: new Date(), rejectReason: input.rejectReason ?? null,
        });
        return { success: true, message: "처리되었습니다." };
      }),

    // ─── 고객 일정 잡기 (신규 흐름) ──────────────────────────────────────────
    requestSchedule: publicProcedure
      .input(z.object({
        token: z.string(),
        customerName: z.string().min(1),
        phoneNumber: z.string().min(8),
        address: z.string().optional(),
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
        requestMemo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateByToken(input.token);
        if (!est) throw new Error("곬적서를 찾을 수 없습니다.");
        if (est.status === "schedule_requested" || est.status === "schedule_confirmed" || est.status === "converted") {
          return { success: false, message: "이미 일정 요청이 접수되었습니다." };
        }
        if (est.validUntil && new Date(est.validUntil) < new Date()) {
          return { success: false, message: "곬적 유효기간이 만료되었습니다." };
        }
        await db.updateEstimateById(est.id, {
          status: "schedule_requested",
          scheduleRequestedAt: new Date(),
          visitDate: input.preferredDate ?? null,
          visitTime: input.preferredTime ?? null,
          addressFull: input.address ?? null,
          requestMemo: input.requestMemo ?? null,
          customerMemo: input.requestMemo ?? null,
        });
        // 관리자 알림 SMS 발송 (기존 승인/거절 SMS와 동일한 방식)
        const adminMsg = buildScheduleRequestAdminMessage({
          customerName: est.customerName,
          phoneNumber: est.phoneNumber,
          estimateNumber: est.estimateNumber ?? String(est.id),
          address: input.address,
          preferredDate: input.preferredDate,
          preferredTime: input.preferredTime,
          requestMemo: input.requestMemo,
        });
        let adminPhone: string | null = null;
        if (est.branchId) adminPhone = await db.getBranchPhone(est.branchId);
        if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
        if (adminPhone && adminPhone.trim().length >= 9) {
          let smsResult = "SUCCESS";
          let smsError: string | undefined;
          try {
            const r = await sendSms(adminPhone.trim(), adminMsg);
            if (r.result !== "SUCCESS") { smsResult = "FAILED"; smsError = r.errorMessage; }
          } catch (e: any) {
            smsResult = "FAILED"; smsError = e?.message ?? "알 수 없는 오류";
          }
          if (smsResult === "FAILED") console.error(`[SMS] 일정요청 알림 발송 실패: ${smsError}`);
          await db.createEstimateMessageLog({
            estimateId: est.id, branchId: est.branchId ?? null, phoneNumber: adminPhone.trim(),
            messageType: "schedule_requested_admin", content: adminMsg, result: smsResult,
          });
        } else {
          console.error("[SMS] 일정요청 알림 발송 실패: 본사 알림 수신번호 미설정 (hq_admin_phone)");
        }
        return { success: true, message: "일정 요청이 접수되었습니다. 담당자가 확인 후 연락드리겠습니다." };
      }),
    // ─── 고객 문의 접수 ────────────────────────────────────────────────────
    submitInquiry: publicProcedure
      .input(z.object({
        token: z.string(),
        customerName: z.string().min(1),
        phoneNumber: z.string().min(9),
        inquiryContent: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateByToken(input.token);
        if (!est) throw new Error("견적서를 찾을 수 없습니다.");

        // DB에 문의 접수 상태 저장 (기존 저장 기능 유지 + inquiry_received 상태 추가)
        await db.updateEstimateById(est.id, {
          status: "inquiry_received" as any,
          inquiryReceivedAt: new Date() as any,
          customerMemo: input.inquiryContent,
        });

        // 관리자 알림 SMS 발송 (기존 승인/거절 SMS와 동일한 방식 - hq_admin_phone DB 설정 사용)
        const adminMsg = buildInquiryAdminMessage({
          customerName: est.customerName,
          phoneNumber: est.phoneNumber,
          estimateNumber: est.estimateNumber ?? String(est.id),
          address: est.addressFull ?? undefined,
          inquiryContent: input.inquiryContent,
        });
        let adminPhone: string | null = null;
        if (est.branchId) adminPhone = await db.getBranchPhone(est.branchId);
        if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
        if (adminPhone && adminPhone.trim().length >= 9) {
          let smsResult = "SUCCESS";
          let smsError: string | undefined;
          try {
            const r = await sendSms(adminPhone.trim(), adminMsg);
            if (r.result !== "SUCCESS") { smsResult = "FAILED"; smsError = r.errorMessage; }
          } catch (e: any) {
            smsResult = "FAILED"; smsError = e?.message ?? "알 수 없는 오류";
          }
          if (smsResult === "FAILED") console.error(`[SMS] 문의하기 알림 발송 실패: ${smsError}`);
          await db.createEstimateMessageLog({
            estimateId: est.id, branchId: est.branchId ?? null, phoneNumber: adminPhone.trim(),
            messageType: "inquiry_received_admin", content: adminMsg, result: smsResult,
          });
        } else {
          console.error("[SMS] 문의하기 알림 발송 실패: 본사 알림 수신번호 미설정 (hq_admin_phone)");
        }
        return { success: true, message: "문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다." };
      }),

    // ─── 본사/지사 일정 확정 ────────────────────────────────────────────────
    confirmSchedule: publicProcedure
      .input(z.object({
        estimateId: z.number(),
        confirmedDate: z.string(),
        confirmedTime: z.string().optional(),
        confirmedByName: z.string().optional(),
        confirmedById: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.estimateId);
        if (!est) throw new Error("곬적서를 찾을 수 없습니다.");
        await db.updateEstimateById(est.id, {
          status: "schedule_confirmed",
          scheduleConfirmedAt: new Date(),
          scheduleConfirmedDate: input.confirmedDate,
          scheduleConfirmedTime: input.confirmedTime ?? null,
          scheduleConfirmedBy: input.confirmedById ?? null,
          scheduleConfirmedByName: input.confirmedByName ?? null,
        });
        const custMsg = `[퓨처에너지테크] ${est.customerName} 고객님, 방문 일정이 확정되었습니다.\n방문일: ${input.confirmedDate} ${input.confirmedTime ?? ""}\n문의: 010-3440-7310`;
        try { await sendNotification(est.phoneNumber, custMsg); } catch {}
        return { success: true, message: "일정이 확정되었습니다." };
      }),

    // 곬적 승인 (고객) + 주소/일정 입력 → 신규 오더(접수) 생성 (하위 호환 유지)
    approveWithOrder: publicProcedure
      .input(z.object({
        token: z.string(),
        apartmentName: z.string().min(1),
        dong: z.string().min(1),
        ho: z.string().min(1),
        addressDetail: z.string().optional(),
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
        customerMemo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateByToken(input.token);
        if (!est) throw new Error("견적서를 찾을 수 없습니다.");
        if (est.status === "approved") {
          return { success: false, message: "이미 승인된 견적입니다." };
        }
        if (est.status === "rejected") {
          return { success: false, message: "이미 거절된 견적입니다." };
        }
        if (est.validUntil && new Date(est.validUntil) < new Date()) {
          return { success: false, message: "견적 유효기간이 만료되었습니다." };
        }

        // 주소 기반 지사 자동 배정 (지사 견적이면 해당 지사 유지)
        let branchId: number | null = est.branchId ?? null;
        if (!branchId) {
          const fullAddr = `${input.apartmentName} ${input.dong} ${input.ho} ${input.addressDetail ?? ""}`;
          const matched = await db.findBranchByAddress(fullAddr);
          if (matched) branchId = matched.id;
        }

        // 신규 접수(오더) 생성
        const order = await db.createRepairRequest({
          branchId: branchId,
          customerName: est.customerName,
          phoneNumber: est.phoneNumber,
          apartmentName: input.apartmentName,
          dong: input.dong,
          ho: input.ho,
          requestType: "난방고장",
          symptom: "기타문의",
          detailContent: `[견적 승인 접수] ${est.title ?? ""}${input.customerMemo ? "\n고객메모: " + input.customerMemo : ""}${input.addressDetail ? "\n상세주소: " + input.addressDetail : ""}`,
          preferredDate: input.preferredDate ?? null,
          preferredTime: input.preferredTime ?? null,
          status: "기사배정대기",
          workflowStage: "견적승인",
          estimateAmount: est.amount ?? null,
          estimateApprovedAt: new Date(),
        } as any);

        // 견적 상태 업데이트
        await db.updateEstimateById(est.id, {
          status: "approved", approvedAt: new Date(),
          requestId: order.id,
          approvedApartmentName: input.apartmentName,
          approvedDong: input.dong,
          approvedHo: input.ho,
          approvedAddressDetail: input.addressDetail ?? null,
          visitDate: input.preferredDate ?? null,
          visitTime: input.preferredTime ?? null,
          customerMemo: input.customerMemo ?? null,
          branchId: branchId,
        });

        // 관리자 알림
        const adminMsg = buildEstimateApprovedAdminMessage({
          customerName: est.customerName, estimateNumber: est.estimateNumber, requestNumber: order.requestNumber,
        });
        let adminPhone: string | null = null;
        if (branchId) adminPhone = await db.getBranchPhone(branchId);
        if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
        if (adminPhone && adminPhone.trim().length >= 9) {
          try { await sendSms(adminPhone.trim(), adminMsg); } catch {}
          await db.createEstimateMessageLog({
            estimateId: est.id, branchId: branchId, phoneNumber: adminPhone.trim(),
            messageType: "estimate_approved_admin", content: adminMsg, result: "SUCCESS",
          });
        }

        // 고객 안내
        const custMsg = buildEstimateApprovedCustomerMessage({ customerName: est.customerName, requestNumber: order.requestNumber });
        try { await sendNotification(est.phoneNumber, custMsg); } catch {}
        await db.createEstimateMessageLog({
          estimateId: est.id, branchId: branchId, phoneNumber: est.phoneNumber,
          messageType: "estimate_approved_customer", content: custMsg, result: "SUCCESS",
        });

        return { success: true, message: "견적을 승인했습니다. 접수가 등록되어 기사 배정이 진행됩니다.", requestNumber: order.requestNumber };
      }),

    // 권한별 견적 목록
    list: publicProcedure
      .input(z.object({ branchId: z.number().optional(), status: z.string().optional(), sourceType: z.string().optional() }))
      .query(async ({ input }) => {
        return db.listEstimates({ branchId: input.branchId ?? null, status: input.status, sourceType: input.sourceType });
      }),

    // 견적 메시지 로그 (권한별)
    messageLogs: publicProcedure
      .input(z.object({ branchId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getEstimateMessageLogs({ branchId: input.branchId ?? null });
      }),

    // ─── 자동 생성 견적 발송 (JSON 붙여넣기 방식) ────────────────────────────
    sendFromAuto: publicProcedure
      .input(z.object({
        customerName: z.string().min(1),
        phoneNumber: z.string().min(8),
        title: z.string().optional(),
        amount: z.number().optional(),
        memo: z.string().optional(),
        autoEstimateItems: z.string(), // JSON 문자열 (견적 자동 생성기에서 내보낸 데이터)
        ownerType: z.enum(["headquarters", "branch"]).default("headquarters"),
        branchId: z.number().optional(),
        sentBy: z.number().optional(),
        sentByName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const token = crypto.randomBytes(24).toString("base64url");
        const baseUrl = (process.env.SITE_URL || "https://퓨처에너지테크.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${token}`;
        const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const estimateNumber = `EST-${Date.now().toString().slice(-8)}`;
        const estimateId = await db.createEstimate({
          requestId: null,
          estimateNumber,
          token,
          customerName: input.customerName,
          phoneNumber: input.phoneNumber.replace(/[^0-9]/g, ""),
          title: input.title ?? `견적서 ${estimateNumber}`,
          amount: input.amount != null ? String(input.amount) : null,
          memo: input.memo ?? null,
          fileUrl: null,
          fileData: null,
          fileName: null,
          fileOriginalName: null,
          fileType: null,
          fileSize: null,
          sourceType: "auto",
          autoEstimateItems: input.autoEstimateItems,
          ownerType: input.ownerType,
          branchId: input.branchId ?? null,
          status: "pending",
          sentAt: new Date(),
          validUntil,
          sentBy: input.sentBy ?? null,
          sentByName: input.sentByName ?? null,
        });
        const phone = input.phoneNumber.replace(/[^0-9]/g, "");
        const msg = buildEstimateDocMessage({ customerName: input.customerName, estimateUrl, title: input.title });
        let smsSent = false;
        let smsRequested = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(phone, msg);
          smsSent = r.result === "SUCCESS";
          smsRequested = r.result === "REQUESTED";
          if (!smsSent && !smsRequested) smsError = r.errorMessage;
        } catch (e: any) { smsError = e.message; }
        const logResult = smsSent ? "SUCCESS" : smsRequested ? "REQUESTED" : "FAIL";
        await db.createEstimateMessageLog({
          estimateId, branchId: input.branchId ?? null, phoneNumber: phone,
          messageType: "estimate_sent", content: msg,
          result: logResult, errorMessage: smsError ?? null,
        });
        return {
          success: true, estimateId, token, estimateUrl, estimateNumber,
          smsSent: smsSent || smsRequested,
          smsRequested,
          smsError: (smsSent || smsRequested) ? undefined : smsError,
        };
      }),

    // ─── 기사 송출 요청 (기사가 작성 → 본사/지사 검토 후 발송) ──────────
    techRequest: publicProcedure
      .input(z.object({
        customerName: z.string().min(1),
        phoneNumber: z.string().min(8),
        title: z.string().optional(),
        amount: z.number().optional(),
        autoEstimateItems: z.string(), // JSON 문자열
        branchId: z.number().optional(),
        techRequesterId: z.number(),
        techRequesterName: z.string(),
        techRequestNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const token = crypto.randomBytes(24).toString("base64url");
        const estimateNumber = `TECH-${Date.now().toString().slice(-8)}`;
        const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const estimateId = await db.createEstimate({
          requestId: null,
          estimateNumber,
          token,
          customerName: input.customerName,
          phoneNumber: input.phoneNumber.replace(/[^0-9]/g, ""),
          title: input.title ?? `현장 견적 ${estimateNumber}`,
          amount: input.amount != null ? String(input.amount) : null,
          memo: null,
          fileUrl: null,
          fileData: null,
          fileName: null,
          fileOriginalName: null,
          fileType: null,
          fileSize: null,
          sourceType: "tech_request",
          autoEstimateItems: input.autoEstimateItems,
          ownerType: input.branchId ? "branch" : "headquarters",
          branchId: input.branchId ?? null,
          status: "report_pending",  // 기사 보고 후 본사/지사 검토 대기
          sentAt: new Date(),
          validUntil,
          sentBy: input.techRequesterId,
          sentByName: input.techRequesterName,
          techRequestStatus: "pending",
          techRequesterId: input.techRequesterId,
          techRequesterName: input.techRequesterName,
          techRequestNote: input.techRequestNote ?? null,
        });
        // 본사/지사 알림 SMS
        let adminPhone: string | null = null;
        if (input.branchId) adminPhone = await db.getBranchPhone(input.branchId);
        if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
        if (adminPhone && adminPhone.trim().length >= 9) {
          const adminMsg = `[퓨처에너지테크] 기사 견적 보고 접수\n기사: ${input.techRequesterName}\n고객: ${input.customerName}\n금액: ${input.amount ? input.amount.toLocaleString() + '원' : '미정'}\n검토 후 고객에게 발송해주세요.`;
          try { await sendSms(adminPhone.trim(), adminMsg); } catch {}
        }
        return { success: true, estimateId, estimateNumber };
      }),

    // ─── 기사 송출 요청 승인 (본사/지사가 검토 후 고객에게 발송) ────────
    approveTechRequest: publicProcedure
      .input(z.object({
        estimateId: z.number(),
        approverName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.estimateId);
        if (!est) throw new Error("견적을 찾을 수 없습니다.");
        if (est.sourceType !== "tech_request") throw new Error("기사 요청 견적이 아닙니다.");
        if (est.techRequestStatus !== "pending") throw new Error("이미 처리된 요청입니다.");
        const baseUrl = (process.env.SITE_URL || "https://퓨처에너지테크.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${est.token}`;
        await db.updateEstimateById(est.id, { techRequestStatus: "approved" });
        const phone = (est.phoneNumber || "").replace(/[^0-9]/g, "");
        const msg = buildEstimateDocMessage({ customerName: est.customerName, estimateUrl, title: est.title });
        let smsSent = false;
        let smsRequested = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(phone, msg);
          smsSent = r.result === "SUCCESS";
          smsRequested = r.result === "REQUESTED";
          if (!smsSent && !smsRequested) smsError = r.errorMessage;
        } catch (e: any) { smsError = e.message; }
        await db.createEstimateMessageLog({
          estimateId: est.id, branchId: est.branchId ?? null, phoneNumber: phone,
          messageType: "estimate_sent", content: msg,
          result: smsSent ? "SUCCESS" : smsRequested ? "REQUESTED" : "FAIL",
          errorMessage: smsError ?? null,
        });
        return { success: true, estimateUrl, smsSent: smsSent || smsRequested, smsError };
      }),

    // ─── 기사 송출 요청 거절 ──────────────────────────────────────────────
    rejectTechRequest: publicProcedure
      .input(z.object({
        estimateId: z.number(),
        rejectReason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.estimateId);
        if (!est) throw new Error("견적을 찾을 수 없습니다.");
        if (est.techRequestStatus !== "pending") throw new Error("이미 처리된 요청입니다.");
        await db.updateEstimateById(est.id, {
          techRequestStatus: "rejected",
          rejectReason: input.rejectReason ?? null,
        });
        return { success: true };
      }),
    // ─── 일정요청/일정확정 후 접수 전환 (본사/지사) ─────────────────────────────
    convertToOrder: publicProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 권한 검사: 본사 관리자 또는 지사장만 접수전환 가능
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const role = (ctx.user as any).appRole;
        const allowedRoles = ["hq_admin", "admin", "headquarters", "branch_manager"];
        if (!allowedRoles.includes(role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "접수전환 권한이 없습니다." });
        }

        // 견적서 조회
        const est = await db.getEstimateById(input.id);
        if (!est) throw new Error("견적을 찾을 수 없습니다.");

        // 상태 조건: schedule_requested(일정요청) 또는 schedule_confirmed(일정확정) 모두 허용
        const allowedStatuses = ["schedule_requested", "schedule_confirmed"];
        if (!allowedStatuses.includes(est.status)) {
          return { success: false, message: `현재 상태(${est.status})에서는 접수 전환이 불가합니다. 고객이 일정 잡기를 완료한 후 접수전환이 가능합니다.` };
        }

        // 중복 방지: 이미 이 견적서로 생성된 접수건이 있으면 기존 것 반환
        const existing = await db.findRepairByEstimateId(est.id);
        if (existing) {
          return { success: true, orderId: existing.id, requestNumber: (existing as any).requestNumber, message: "이미 접수 전환된 견적입니다.", alreadyConverted: true };
        }

        // ── 고객 주소 결정 (우선순위: 고객이 일정잡기 시 입력한 주소 > 견적서 원본 주소) ──
        const apartmentName = est.approvedApartmentName || est.buildingName || "";
        const dong = est.approvedDong || est.buildingDong || "";
        const ho = est.approvedHo || est.buildingHo || "";
        const addressDetail = est.approvedAddressDetail || est.addressFull || "";

        // ── 고객 희망 방문일정 (고객이 일정잡기 시 입력한 visitDate/visitTime 우선) ──
        const preferredDate = est.visitDate || est.scheduleConfirmedDate || null;
        const preferredTime = est.visitTime || est.scheduleConfirmedTime || null;

        // ── 고객 연락처 (customerPhone 또는 phoneNumber) ──
        const customerPhone = est.customerPhone || est.phoneNumber || "";

        // ── 지사 배정 (견적서 branchId 우선, 없으면 주소 기반 자동 배정) ──
        let branchId: number | null = est.branchId ?? null;
        if (!branchId) {
          const addrForMatch = [apartmentName, dong, ho, addressDetail].filter(Boolean).join(" ");
          if (addrForMatch) {
            const matched = await db.findBranchByAddress(addrForMatch);
            if (matched) branchId = matched.id;
          }
        }

        // ── 견적 품목 요약 ──
        let itemsSummary = "";
        if (est.autoEstimateItems) {
          try {
            const items = JSON.parse(est.autoEstimateItems);
            if (Array.isArray(items) && items.length > 0) {
              itemsSummary = items.map((it: any) =>
                `${it.name || it.itemName || ''}×${it.qty || it.quantity || 1}(${Number(it.discPrice || it.price || 0).toLocaleString()}원)`
              ).join(', ');
            }
          } catch {}
        }

        // ── 상세내용 구성 (고객 요청내용 + 견적 정보 + 메모 전체 포함) ──
        const detailParts: string[] = [];
        detailParts.push(`[견적 접수전환] 견적번호: ${est.estimateNumber || ('#' + est.id)}`);
        if (est.title) detailParts.push(`견적제목: ${est.title}`);
        if (est.amount) detailParts.push(`견적금액: ${Number(est.amount).toLocaleString()}원`);
        if (itemsSummary) detailParts.push(`견적품목: ${itemsSummary}`);
        if (addressDetail) detailParts.push(`상세주소: ${addressDetail}`);
        if (preferredDate) detailParts.push(`희망방문일: ${preferredDate}${preferredTime ? ' ' + preferredTime : ''}`);
        if (est.requestMemo) detailParts.push(`고객요청: ${est.requestMemo}`);
        if (est.customerMemo) detailParts.push(`고객메모: ${est.customerMemo}`);
        if (est.description) detailParts.push(`견적설명: ${est.description}`);

        // ── 새 접수건 생성 (fromEstimateId로 중복방지 연결) ──
        const insertData: any = {
          branchId: branchId,
          customerName: est.customerName || "",
          phoneNumber: customerPhone,
          apartmentName: apartmentName,
          dong: dong,
          ho: ho,
          requestType: "난방고장",
          symptom: "기타문의",
          detailContent: detailParts.join('\n'),
          preferredDate: preferredDate,
          preferredTime: preferredTime,
          status: "기사배정대기",
          workflowStage: "견적승인",
          estimateAmount: est.amount ? Number(est.amount) : null,
          ownerType: branchId ? "branch" : "headquarters",
          adminMemo: `견적서ID:${est.id} | 견적번호:${est.estimateNumber || ''} | 전환일시:${new Date().toLocaleString('ko-KR')}`,
          fromEstimateId: est.id,
          customerPreferredDate: preferredDate,
          customerPreferredTime: preferredTime,
        };
        const order = await db.createRepairRequest(insertData);

        // 견적서 상태를 converted로 업데이트
        await db.updateEstimateById(est.id, {
          status: "converted",
          orderId: order.id,
        });

                return { success: true, orderId: order.id, requestNumber: order.requestNumber, message: "접수로 전환되었습니다." };
      }),

    // ─── 접수전환 + 기사배정 통합 ────────────────────────────────────
    convertToOrderAndAssign: publicProcedure
      .input(z.object({
        estimateId: z.number(),
        ownerType: z.enum(["hq", "branch"]),
        ownerId: z.number(),
        ownerName: z.string().optional(),
        technicianId: z.number(),
        technicianName: z.string(),
        scheduledDate: z.string().optional(),
        scheduledTime: z.string().optional(),
        notify: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.estimateId);
        if (!est) throw new Error("견적서를 찾을 수 없습니다.");
        // 중복 방지: 이미 전환된 견적서인지 확인
        if (est.orderId) {
          // 기사배정만 추가로 수행
          await db.assignTechnician(est.orderId, input.technicianId, input.technicianName, input.scheduledDate, input.scheduledTime);
          if (input.notify) {
            const req = await db.getRepairRequestById(est.orderId);
            if (req) {
              const msg = buildStatusChangeMessage(req.customerName, req.requestNumber, "방문예정", input.technicianName, input.scheduledDate ?? req.scheduledDate, input.scheduledTime ?? req.scheduledTime);
              await notifyAndLog({ requestId: req.id, phoneNumber: req.phoneNumber, messageType: "기사배정", content: msg });
            }
          }
          return { success: true, orderId: est.orderId, alreadyConverted: true, message: "이미 접수 전환된 견적입니다. 기사가 배정되었습니다." };
        }
        // 고객 주소 정보 추출
        const apartmentName = est.approvedApartmentName ?? est.buildingName ?? "";
        const dong = est.approvedDong ?? est.dong ?? "";
        const ho = est.approvedHo ?? est.ho ?? "";
        const addressFull = est.addressFull ?? `${apartmentName} ${dong}동 ${ho}호`.trim();
        const addressDetail = est.approvedAddressDetail ?? est.addressDetail ?? null;
        // 고객 희망일정 (confirmSchedule로 확정된 날짜 우선)
        const preferredDate = est.scheduleConfirmedDate ?? est.customerPreferredDate ?? input.scheduledDate ?? null;
        const preferredTime = est.scheduleConfirmedTime ?? est.customerPreferredTime ?? input.scheduledTime ?? null;
        // 지사 ID 결정
        let branchId: number | null = null;
        if (input.ownerType === "branch") branchId = input.ownerId;
        else branchId = est.branchId ?? null;
        // DB 컬럼 자동 추가 (최초 실행 시)
        await db.ensureRepairRequestsColumns();
        // 신규 접수건 생성
        const insertData: Parameters<typeof db.createRepairRequest>[0] = {
          branchId,
          customerName: est.customerName,
          phoneNumber: est.phoneNumber,
          apartmentName,
          dong,
          ho,
          addressFull,
          addressDetail,
          requestType: "난방고장",
          symptom: est.symptom ?? "기타문의",
          requestContent: est.requestContent ?? null,
          estimateId: est.id,
          estimateTotal: est.totalAmount ?? null,
          fromEstimateId: est.id,
          customerPreferredDate: preferredDate,
          customerPreferredTime: preferredTime,
          status: "기사확인대기",
          technicianId: input.technicianId,
          technicianName: input.technicianName,
          scheduledDate: preferredDate,
          scheduledTime: preferredTime,
          ownerType: input.ownerType === 'hq' ? 'headquarters' : 'branch',
        };
        const order = await db.createRepairRequest(insertData);
        // 견적서 상태 업데이트
        await db.updateEstimateById(est.id, { status: "converted", orderId: order.id });
        // 고객 알림 발송
        if (input.notify) {
          const msg = buildStatusChangeMessage(est.customerName, order.requestNumber, "방문예정", input.technicianName, preferredDate ?? undefined, preferredTime ?? undefined);
          await notifyAndLog({ requestId: order.id, phoneNumber: est.phoneNumber, messageType: "기사배정", content: msg });
        }
        return { success: true, orderId: order.id, requestNumber: order.requestNumber, message: "접수 전환 및 기사 배정이 완료되었습니다." };
      }),
  }),
  // ─── 단가 관리 ─────────────────────────────────────────────────
  prices: router({
    listAll: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const allowedRoles = ["hq_admin", "admin", "headquarters", "branch_manager", "staff", "technician"];
      if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      await db.ensurePriceItemsTable();
      return db.getAllPriceItems();
    }),
    listActive: publicProcedure.query(async () => {
      await db.ensurePriceItemsTable();
      return db.getActivePriceItems();
    }),
    upsert: publicProcedure
      .input(z.object({
        id: z.number().optional(),
        category: z.string(),
        name: z.string(),
        unit: z.string().optional(),
        stdPrice: z.number(),
        discPrice: z.number(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const allowedRoles = ["hq_admin", "admin", "headquarters"];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: "FORBIDDEN" });
        await db.ensurePriceItemsTable();
        return db.upsertPriceItem({
          ...input,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        });
      }),
    toggleActive: publicProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const allowedRoles = ["hq_admin", "admin", "headquarters"];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: "FORBIDDEN" });
        return db.togglePriceItemActive(input.id, input.isActive);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const allowedRoles = ["hq_admin", "admin", "headquarters"];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: "FORBIDDEN" });
        return db.deletePriceItem(input.id);
      }),
    // 관리자 전용 DB 마이그레이션 엔드포인트 (2026-07-10 재활성화: 스트레이너 분배기교체 단가 추가)
    migrate: publicProcedure
      .input(z.object({ adminKey: z.string() }))
      .mutation(async ({ input }) => {
        if (input.adminKey !== 'FutureEnergy2026!') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자 키가 올바르지 않습니다.' });
        }
        const results: string[] = [];
        // 스트레이너 25A (분배기교체) 단가 추가
        try {
          await db.upsertPriceItem({ category: '분배기교체', name: '스트레이너 25A (분배기교체)', unit: '개', stdPrice: 81000, discPrice: 36000, sortOrder: 25, isActive: true });
          results.push('✅ 스트레이너 25A (분배기교체) 추가/업데이트');
        } catch (e: any) {
          results.push('⚠️ 스트레이너 오류: ' + e.message);
        }
        // repair_requests 테이블 컬럼 추가 (2026-07-13)
        // repair_requests 컨럼 추가 - ensureRepairRequestsColumns 함수 사용
        try {
          db.resetRepairRequestsColumnsFlag(); // 플래그 리셋하여 강제 실행
          await db.ensureRepairRequestsColumns();
          results.push('✅ repair_requests 컨럼 마이그레이션 완료');
        } catch (e: any) {
          results.push('⚠️ repair_requests 컨럼 오류: code=' + (e as any)?.code + ' msg=' + e.message);
        }
        // DB 진단: repair_requests 테이블의 실제 컬럼 목록 확인
        try {
          const db2 = await db.getDb();
          if (db2) {
            const { sql } = await import('drizzle-orm');
            const rawRows = await db2.execute(sql.raw("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'repair_requests' ORDER BY ORDINAL_POSITION")) as any;
            let arr: any[] = [];
            if (Array.isArray(rawRows)) {
              arr = Array.isArray(rawRows[0]) ? rawRows[0] : rawRows;
            }
            const cols = arr.map((r: any) => r?.COLUMN_NAME).filter(Boolean);
            results.push('🔍 DB 실제 컬럼(' + cols.length + '): ' + cols.join(', '));
          }
        } catch (e: any) {
          results.push('⚠️ DB 진단 오류: ' + e.message);
        }
        return { success: true, results };
      }),
  }),
  // ===== 1단계 업무관리 라우터 (2026-07-11 추가) =====
  workMgmt: router({
  // ===== 접수공사현황 =====
  jobOrders: router({
    list: publicProcedure
      .input(z.object({ q: z.string().optional(), status: z.string().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.listJobOrders(input || {});
      }),
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.getJobOrder(input.id);
      }),
    create: publicProcedure
      .input(z.object({
        customerName: z.string(), customerPhone: z.string(), address: z.string(),
        workType: z.string().optional(), urgency: z.string().optional(), channel: z.string().optional(),
        branchName: z.string().optional(), techName: z.string().optional(),
        visitDate: z.string().nullable().optional(), estimateAmount: z.number().optional(),
        completeDate: z.string().nullable().optional(), billAmount: z.number().optional(),
        payDate: z.string().nullable().optional(), payAmount: z.number().optional(),
        status: z.string().optional(), memo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin', 'branch_manager'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.createJobOrder(input);
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        customerName: z.string().optional(), customerPhone: z.string().optional(), address: z.string().optional(),
        workType: z.string().optional(), urgency: z.string().optional(), channel: z.string().optional(),
        branchName: z.string().optional(), techName: z.string().optional(),
        visitDate: z.string().nullable().optional(), estimateAmount: z.number().optional(),
        completeDate: z.string().nullable().optional(), billAmount: z.number().optional(),
        payDate: z.string().nullable().optional(), payAmount: z.number().optional(),
        status: z.string().optional(), memo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin', 'branch_manager'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.updateJobOrder(input.id, input);
      }),
  }),

  // ===== AS 관리 =====
  asRecords: router({
    list: publicProcedure
      .input(z.object({ q: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.listAsRecords(input || {});
      }),
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.getAsRecord(input.id);
      }),
    create: publicProcedure
      .input(z.object({
        origJobNo: z.string().optional(), customerName: z.string(), customerPhone: z.string(),
        symptom: z.string(), techName: z.string().optional(),
        doneDate: z.string().nullable().optional(), status: z.string().optional(), memo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin', 'branch_manager'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.createAsRecord(input);
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        origJobNo: z.string().optional(), customerName: z.string().optional(), customerPhone: z.string().optional(),
        symptom: z.string().optional(), techName: z.string().optional(),
        doneDate: z.string().nullable().optional(), status: z.string().optional(), memo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin', 'branch_manager'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.updateAsRecord(input.id, input);
      }),
  }),

  // ===== 일일보고 =====
  dailyReport: router({
    get: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.getDailyReport(input.date);
      }),
    list: publicProcedure
      .input(z.object({}).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.listDailyReports();
      }),
    save: publicProcedure
      .input(z.object({
        reportDate: z.string(),
        newRequests: z.number().optional(), estIssued: z.number().optional(), estApproved: z.number().optional(),
        workPlanned: z.number().optional(), workDone: z.number().optional(), newAs: z.number().optional(),
        delayed: z.number().optional(), billed: z.number().optional(), collected: z.number().optional(),
        unpaid: z.number().optional(), orderNeeded: z.string().optional(), exceptions: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.saveDailyReport(input);
      }),
  }),

  // ===== 코드설정 =====
  codeSettings: router({
    list: publicProcedure
      .input(z.object({}).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return db.listCodeSettings();
      }),
    add: publicProcedure
      .input(z.object({ codeType: z.string(), codeValue: z.string(), sortOrder: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.addCodeSetting(input);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const allowedRoles = ['hq_admin', 'admin'];
        if (!allowedRoles.includes((ctx.user as any).appRole)) throw new TRPCError({ code: 'FORBIDDEN' });
        return db.deleteCodeSetting(input.id);
      }),
  }),
  }), // workMgmt end
});
export type AppRouter = typeof appRouter;
// redeploy Wed Jul  1 08:27:19 UTC 2026
// 1단계 업무관리 라우터 추가 2026-07-11
