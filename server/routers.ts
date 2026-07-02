import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import * as db from "./db";
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
  buildEstimateRejectedAdminMessage,
  buildEstimateApprovedAdminMessage,
  buildEstimateApprovedCustomerMessage,
} from "./notification";
import { dispatchLeakSms } from "./leak-sms";
import { buildTechnicianDepartedMessage } from "./notification";

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

export const appRouter = router({
  // 헬스체크
  health: publicProcedure.query(() => ({ status: "ok" })),

  // ─── 앱 인증 (ID/PW 기반, 홈페이지·앱 공통) ──────────────────
  auth: router({
    // 통합 로그인 (고객/기사/지사장/본사관리자 공통)
    login: publicProcedure
      .input(z.object({ loginId: z.string().min(1), password: z.string().min(1) }))
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
        // 레거시 해시로 로그인 성공 시 bcrypt로 자동 업그레이드
        if (check.isLegacy) {
          try { await db.updateAppRoleFields(role.userId, { passwordHash: hashPassword(input.password) }); } catch {}
        }
        // 권한별 부가정보
        let technicianId: number | null = null;
        let branchId: number | null = role.branchId ?? null;
        if (role.appRole === "technician") {
          // userId로 먼저 조회, 없으면 phoneNumber로 fallback (앱 가입 기사 매칭)
          const tech = await db.getTechnicianByUserIdOrPhone(role.userId, role.phoneNumber);
          if (tech) {
            technicianId = tech.id;
            branchId = tech.branchId ?? branchId;
            // userId가 없는 technicians 레코드에 userId 연결 (최초 1회)
            if (!tech.userId) {
              try { await db.updateTechnicianUserId(tech.id, role.userId); } catch {}
            }
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
          const tech = await db.getTechnicianByUserIdOrPhone(role.userId, role.phoneNumber);
          if (tech) {
            technicianId = tech.id;
            branchId = tech.branchId ?? branchId;
            if (!tech.userId) {
              try { await db.updateTechnicianUserId(tech.id, role.userId); } catch {}
            }
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

    // ── 기사 회원가입 (휴대폰 인증 완료 후, 즉시 로그인 가능) ──
    registerTechnician: publicProcedure
      .input(z.object({
        loginId: z.string().min(4).max(64),
        password: z.string().min(6).max(64),
        name: z.string().min(1).max(50),
        phoneNumber: z.string().min(10),
        branchId: z.number().optional(),
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
        // technicians 테이블에도 등록 (활성 상태)
        await db.createTechnician({
          name: input.name,
          phoneNumber: phone,
          branchId: input.branchId,
          userId,
          isActive: true,
        });
        return { success: true, userId };
      }),

    // ── 지사장 회원가입 (휴대폰 인증 완료 후, 즉시 로그인 가능) ──
    registerBranchManager: publicProcedure
      .input(z.object({
        loginId: z.string().min(4).max(64),
        password: z.string().min(6).max(64),
        name: z.string().min(1).max(50),
        phoneNumber: z.string().min(10),
        branchId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const phone = normalizePhone(input.phoneNumber);
        const v = await db.getLatestPhoneVerification(phone, "signup");
        if (!v || !v.verified) return { success: false, error: "휴대폰 인증을 먼저 완료하세요." };
        const existing = await db.getAppRoleByLoginId(input.loginId.trim());
        if (existing) return { success: false, error: "이미 사용 중인 아이디입니다." };
        const userId = generateSafeUserId(input.loginId + phone + Date.now());
        // 지사 자동 생성 (승인 없이 즉시 사용 가능)
        const branchCode = "BRANCH_" + Date.now().toString(36).toUpperCase();
        let resolvedBranchId = input.branchId;
        if (!resolvedBranchId) {
          const newBranch = await db.createBranch({
            name: input.name + " 지사",
            code: branchCode,
            region: "미지정",
            managerName: input.name,
            phoneNumber: phone,
            isActive: true,
          });
          resolvedBranchId = newBranch.id;
        }
        await db.upsertAppRole({
          userId,
          appRole: "branch_manager",
          loginId: input.loginId.trim(),
          passwordHash: hashPassword(input.password),
          name: input.name,
          phoneNumber: phone,
          branchId: resolvedBranchId,
          mustChangePassword: false,
          isActive: true, // 즉시 로그인 가능
        });
        // 지사의 managerUserId 연결
        if (resolvedBranchId) {
          try { await db.updateBranch(resolvedBranchId, { managerUserId: userId }); } catch {}
        }
        return { success: true, userId, branchId: resolvedBranchId };
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
      .mutation(async ({ input }) => {
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

    // 계정 목록 (본사 관리자용)
    listAccounts: publicProcedure.query(async () => {
      return db.getAllAppRoles();
    }),

    // 계정 정보 수정 (본사 관리자용)
    updateAccount: publicProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().optional(),
        phoneNumber: z.string().optional(),
        branchId: z.number().optional(),
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
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

    // 계정 활성/비활성
    setActive: publicProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
        await db.updateAppRoleFields(input.userId, { isActive: input.isActive });
        return { success: true };
      }),

    // 관리자에 의한 임시 비밀번호 재발급
    resetTempPassword: publicProcedure
      .input(z.object({ userId: z.number(), tempPassword: z.string().min(4) }))
      .mutation(async ({ input }) => {
        const role = await db.getAppRole(input.userId);
        if (!role) return { success: false };
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

    // 지사 삭제 (본사 전용). mode=transfer(본사 이관) | cascade(함께 삭제)
    softDelete: publicProcedure
      .input(z.object({
        id: z.number(),
        actorRole: z.enum(["hq_admin", "branch_manager"]),
        actorUserId: z.number(),
        mode: z.enum(["transfer", "cascade"]),
      }))
      .mutation(async ({ input }) => {
        if (input.actorRole !== "hq_admin") {
          return { success: false, error: "지사 삭제 권한은 본사 관리자에게만 있습니다." };
        }
        const branch = await db.getBranchById(input.id);
        if (!branch || branch.isDeleted) {
          return { success: false, error: "존재하지 않는 지사입니다." };
        }
        const result = await db.softDeleteBranch(input.id, input.actorUserId, input.mode);
        return { success: true, ...result, mode: input.mode };
      }),

    // 지사 복구 (본사 전용)
    restore: publicProcedure
      .input(z.object({ id: z.number(), actorRole: z.enum(["hq_admin", "branch_manager"]) }))
      .mutation(async ({ input }) => {
        if (input.actorRole !== "hq_admin") {
          return { success: false, error: "복구 권한은 본사 관리자에게만 있습니다." };
        }
        await db.restoreBranch(input.id);
        return { success: true };
      }),
  }),

  // ─── 접수 관련 ─────────────────────────────────────────────────
  repair: router({
    // 접수 생성 (고객용) - 주소 기반 지사 자동 배정
    create: publicProcedure
      .input(z.object({
        customerName: z.string().min(1).max(50),
        phoneNumber: z.string().min(9).max(20),
        sido: z.string().max(30).optional(),
        sigungu: z.string().max(40).optional(),
        eupmyeondong: z.string().max(40).optional(),
        apartmentName: z.string().min(1).max(100),
        roadAddress: z.string().max(200).optional(),
        customerLat: z.number().optional(),
        customerLng: z.number().optional(),
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
        // symptoms 배열을 JSON 문자열로 저장
        const symptomsJson = input.symptoms && input.symptoms.length > 0
          ? JSON.stringify(input.symptoms)
          : null;
        // 신규접수 기본값: ownerType=unassigned, branchId=null (본사가 수동 배정)
        const created = await db.createRepairRequest({
          ...input,
          customerLat: input.customerLat !== undefined ? String(input.customerLat) : null,
          customerLng: input.customerLng !== undefined ? String(input.customerLng) : null,
          symptoms: symptomsJson,
          branchId: null,
          ownerType: "unassigned",
          workflowStage: "접수완료",
        });

        // 실제 증상 목록 (복수 선택 우선, 없으면 단일 symptom 사용)
        const symptomsForSms: string[] = input.symptoms && input.symptoms.length > 0
          ? input.symptoms
          : [input.symptom];
        const typeLabel = requestTypeLabel[input.requestType] ?? "서비스";

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








        return { ...created, branchId: null, branchName: "본사" };
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

    // 기사별 배정 목록 (기사용 - technicianId 기준)
    listByTechnician: publicProcedure
      .input(z.object({ technicianId: z.number() }))
      .query(async ({ input }) => db.getRepairRequestsByTechnician(input.technicianId)),
    // 기사별 배정 목록 (userId 기준 - 신규 가입 기사용, phone fallback 포함)
    listByTechnicianUserId: publicProcedure
      .input(z.object({ userId: z.number(), phoneNumber: z.string().optional() }))
      .query(async ({ input }) => {
        const tech = await db.getTechnicianByUserIdOrPhone(input.userId, input.phoneNumber ?? null);
        if (!tech) return [];
        // 앱 가입 기사 최초 조회 시 userId 자동 연결
        if (tech.userId === null) {
          try { await db.updateTechnicianUserId(tech.id, input.userId); } catch {}
        }
        return db.getRepairRequestsByTechnician(tech.id);
      }),

    // 접수/오더 삭제 (본사=전체, 지사=자기 지사 접수만)
    softDelete: publicProcedure
      .input(z.object({
        id: z.number(),
        actorRole: z.enum(["hq_admin", "branch_manager"]),
        actorUserId: z.number(),
        actorBranchId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const req = await db.getRepairRequestById(input.id);
        if (!req || req.isDeleted) {
          return { success: false, error: "존재하지 않는 접수입니다." };
        }
        if (input.actorRole === "branch_manager") {
          if (!input.actorBranchId || req.branchId !== input.actorBranchId) {
            return { success: false, error: "자기 지사 접수만 삭제할 수 있습니다." };
          }
        }
        await db.softDeleteRepairRequest(input.id, input.actorUserId);
        return { success: true };
      }),

    // 고객 삭제 (전화번호 기준 전체 접수 삭제). 본사=전체, 지사=자기 지사 고객만
    softDeleteCustomer: publicProcedure
      .input(z.object({
        phoneNumber: z.string().min(9),
        actorRole: z.enum(["hq_admin", "branch_manager"]),
        actorUserId: z.number(),
        actorBranchId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        // 지사는 자기 지사 소속 고객인지 확인
        if (input.actorRole === "branch_manager") {
          const normalized = input.phoneNumber.replace(/[^0-9]/g, "");
          const all = await db.getAllRepairRequests();
          const mine = all.filter((r) => r.phoneNumber?.replace(/[^0-9]/g, "") === normalized);
          const outside = mine.find((r) => r.branchId !== input.actorBranchId);
          if (!input.actorBranchId || outside || mine.length === 0) {
            return { success: false, error: "자기 지사 소속 고객만 삭제할 수 있습니다." };
          }
        }
        const count = await db.softDeleteCustomerByPhone(input.phoneNumber, input.actorUserId);
        return { success: true, deletedCount: count };
      }),

    // 접수 복구 (본사 전용)
    restore: publicProcedure
      .input(z.object({ id: z.number(), actorRole: z.enum(["hq_admin", "branch_manager"]) }))
      .mutation(async ({ input }) => {
        if (input.actorRole !== "hq_admin") {
          return { success: false, error: "복구 권한은 본사 관리자에게만 있습니다." };
        }
        await db.restoreRepairRequest(input.id);
        return { success: true };
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
        const { repairRequests: rr } = await import("../drizzle/schema");
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
        const { repairRequests: rr } = await import("../drizzle/schema");
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
        const { repairRequests: rr } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(rr).set({ estimateAmount: String(input.estimateAmount), status: "견적승인대기", workflowStage: "견적전달", estimateSentAt: new Date() }).where(eq(rr.id, input.id));
        // 고객에게 견적 안내 SMS 발송
        try {
          const req = await db.getRepairRequestById(input.id);
          if (req && req.phoneNumber) {
            const message = buildEstimateMessage(
              req.customerName,
              req.requestNumber,
              input.estimateAmount
            );
            const sendResult = await sendSms(req.phoneNumber, message);
            await db.createNotificationLog({
              requestId: req.id,
              phoneNumber: req.phoneNumber,
              channel: "SMS",
              messageType: "견적전달",
              content: message,
              result: sendResult.result,
              errorMessage: sendResult.errorMessage,
            });
          }
        } catch (e) {
          // 알림 실패해도 견적 등록은 성공
          console.error("[견적 SMS 발송 오류]", e);
        }
        return { success: true };
      }),

    // 견적 승인 (고객용) → 견적승인 단계로 이동 (기사 배정/일정 확정 가능)
    approveEstimate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new Error("Database not available");
        const { repairRequests: rr } = await import("../drizzle/schema");
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
        if (input.branchId) {
          await db.setWorkflowStage(input.id, "지사배정");
        }
        return { success: true };
      }),

    // 본사 처리 선택 (본사 관리자용) – ownerType=headquarters
    assignToHeadquarters: publicProcedure
      .input(z.object({
        id: z.number(),
        actorUserId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.assignToHeadquarters(input.id, input.actorUserId);
        return { success: true };
      }),

    // 지사 배정 (본사 관리자용) – ownerType=branch
    assignToBranch: publicProcedure
      .input(z.object({
        id: z.number(),
        branchId: z.number(),
        actorUserId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.assignToBranch(input.id, input.branchId, input.actorUserId);
        try {
          const req = await db.getRepairRequestById(input.id);
          const branch = await db.getBranchById(input.branchId);
          if (req && branch?.phoneNumber && branch.phoneNumber.trim().length >= 9) {
            const msg = `[지사배정] ${req.customerName} 고객\n휴대: ${req.phoneNumber}\n${req.apartmentName} ${req.dong}동 ${req.ho}호\n접수번호: ${req.requestNumber}\n→ ${branch.name}으로 배정되었습니다.`;
            await sendSms(branch.phoneNumber.trim(), msg);
          }
        } catch (e) {
          console.error("[지사배정 SMS 오류]", e);
        }
        return { success: true };
      }),
  }),

  // ─── 기사 관리 ─────────────────────────────────────────────────
  technicians: router({
    list: publicProcedure.query(async () => db.getActiveTechnicians()),
    listAll: publicProcedure.query(async () => db.getAllTechnicians()),

    // 본사 직속 기사 목록 (branchId=null)
    listHQ: publicProcedure.query(async () => db.getHQTechnicians()),

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

    // 기사 삭제 (본사=전체, 지사=자기 소속만). 진행중 작업 있으면 차단
    softDelete: publicProcedure
      .input(z.object({
        id: z.number(),
        actorRole: z.enum(["hq_admin", "branch_manager"]),
        actorUserId: z.number(),
        actorBranchId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const tech = await db.getTechnicianById(input.id);
        if (!tech || tech.isDeleted) {
          return { success: false, error: "존재하지 않는 기사입니다." };
        }
        // 권한: 지사는 자기 소속 기사만 삭제 가능
        if (input.actorRole === "branch_manager") {
          if (!input.actorBranchId || tech.branchId !== input.actorBranchId) {
            return { success: false, error: "자기 지사 소속 기사만 삭제할 수 있습니다." };
          }
        }
        // 진행중(미완료) 배정 작업 체크
        const active = await db.countActiveAssignmentsByTechnician(input.id);
        if (active > 0) {
          return { success: false, error: `진행 중인 작업이 ${active}건 있습니다. 작업을 완료하거나 다른 기사에게 재배정한 후 삭제해 주세요.` };
        }
        await db.softDeleteTechnician(input.id, input.actorUserId);
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
    getAlertPhones: publicProcedure
      .query(async () => {
        const raw = await db.getSetting("leak_alert_phones");
        const phones = raw ? raw.split(/[,\s]+/).map((p: string) => p.trim()).filter(Boolean) : [];
        return { phones };
      }),
    setAlertPhones: publicProcedure
      .input(z.object({ phones: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        const value = input.phones.map((p: string) => p.replace(/[^0-9]/g, "")).filter((p: string) => p.length >= 10).join(",");
        await db.setSetting("leak_alert_phones", value);
        return { ok: true };
      }),
    // 누수 알림 발송 내역 조회
    getNotificationLogs: publicProcedure
      .input(z.object({ limit: z.number().default(50) }).optional())
      .query(async ({ input }) => {
        const logs = await db.getNotificationLogs();
        return logs
          .filter((l: any) => l.messageType?.startsWith("누수감지"))
          .slice(0, input?.limit ?? 50);
      }),
  }),
  // ─── 유량 관리 ──────────────────────────────────────────────────
  flowRate: router({
    listSettings: publicProcedure
      .input(z.object({
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]).optional(),
        branchId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const settings = await db.getAllFlowRateSettings();
        const role = input?.appRole ?? "customer";
        if (role === "hq_admin") return settings;
        if (role === "branch_manager" && input?.branchId) {
          return settings.filter((s: any) => s.branchId === input.branchId);
        }
        // customer / technician: strip technical data
        return settings.map((s: any) => {
          const { lastFlowRateLpm, baseFlowRateLpm, lastSupplyPressure, lastReturnPressure, ...rest } = s;
          return rest;
        });
      }),

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
      }))
      .mutation(async ({ input }) => {
        const { id, baseFlowRateLpm, ...rest } = input;
        await db.updateFlowRateSetting(id, {
          ...(baseFlowRateLpm !== undefined && { baseFlowRateLpm: String(baseFlowRateLpm.toFixed(2)) }),
          ...rest,
        });
        return { success: true };
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
      .input(z.object({
        phone: z.string().min(1),
        appRole: z.enum(["customer", "technician", "branch_manager", "hq_admin"]).optional(),
      }))
      .query(async ({ input }) => {
        const settings = await db.getAllFlowRateSettings();
        const matched = settings.filter((s: any) => s.customerId === input.phone);
        const role = input.appRole ?? "customer";
        if (role === "hq_admin" || role === "branch_manager") return matched;
        // customer / technician: strip technical data
        return matched.map((s: any) => {
          const { lastFlowRateLpm, baseFlowRateLpm, lastSupplyPressure, lastReturnPressure, ...rest } = s;
          return rest;
        });
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
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간 후 만료 (작업 완료 전까지 유효)
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
        // 고객용 전용 링크 생성
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
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
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
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
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
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
        if (!session) return null;
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
        const trackingUrl = `${baseUrl}/track/${session.trackingToken}`;
        return { ...session, trackingUrl };
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

  // ─── 견적서 라우터 (독립형 – 파일 업로드 기반) ────────────────────────
  estimates: router({

    // 견적서 파일 업로드 (base64 → S3)
    uploadFile: publicProcedure
      .input(z.object({
        fileName: z.string().min(1),
        fileType: z.string().min(1),
        base64: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
        if (!allowed.includes(input.fileType.toLowerCase())) {
          throw new Error("PDF, JPG, PNG 파일만 업로드할 수 있습니다.");
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        if (buffer.length > 15 * 1024 * 1024) {
          throw new Error("파일 크기는 15MB 이하여야 합니다.");
        }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { url } = await storagePut(`estimates/${Date.now()}_${safeName}`, buffer, input.fileType);
        return { fileUrl: url, fileName: input.fileName, fileType: input.fileType, fileSize: buffer.length };
      }),

    // 독립 견적서 전송 (파일 + 고객정보 + SMS)
    send: publicProcedure
      .input(z.object({
        title: z.string().optional(),
        amount: z.number().min(0).default(0),
        description: z.string().optional(),
        customerName: z.string().min(1),
        customerPhone: z.string().min(8),
        fileUrl: z.string().min(1),
        fileName: z.string().optional(),
        fileType: z.string().optional(),
        fileSize: z.number().optional(),
        ownerType: z.enum(["headquarters", "branch"]).default("headquarters"),
        branchId: z.number().nullable().optional(),
        sentBy: z.number().optional(),
        senderRole: z.string().optional(),
        validHours: z.number().default(72),
      }))
      .mutation(async ({ input }) => {
        const token = crypto.randomBytes(24).toString("base64url");
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${token}`;
        const validUntil = new Date(Date.now() + input.validHours * 60 * 60 * 1000);

        let branchName: string | null = null;
        if (input.ownerType === "branch" && input.branchId) {
          const b = await db.getBranchById(input.branchId);
          branchName = b?.name ?? null;
        }

        const estimateId = await db.createEstimate({
          requestId: null,
          token,
          title: input.title ?? null,
          amount: String(input.amount),
          description: input.description ?? null,
          customerName: input.customerName,
          customerPhone: input.customerPhone.replace(/[^0-9]/g, ""),
          fileUrl: input.fileUrl,
          fileName: input.fileName ?? null,
          fileType: input.fileType ?? null,
          fileSize: input.fileSize ?? null,
          ownerType: input.ownerType,
          branchId: input.branchId ?? null,
          branchName,
          status: "pending",
          sentAt: new Date(),
          validUntil,
          sentBy: input.sentBy ?? null,
          senderRole: input.senderRole ?? null,
        } as any);

        // 고객 SMS 발송
        const msg = buildEstimateDocMessage(input.customerName, estimateUrl, input.amount);
        let smsSent = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(input.customerPhone, msg);
          smsSent = r.result === "SUCCESS";
          if (!smsSent) smsError = r.errorMessage;
          await db.createEstimateMessageLog({
            estimateId, customerName: input.customerName, customerPhone: input.customerPhone,
            branchId: input.branchId ?? null, branchName, senderRole: input.senderRole ?? null,
            senderId: input.sentBy ?? null, messageType: "견적서발송", messageBody: msg,
            linkUrl: estimateUrl, sendStatus: r.result as any,
          });
        } catch (e) {
          smsError = e instanceof Error ? e.message : String(e);
        }

        return { success: true, estimateId, token, estimateUrl, smsSent, smsError };
      }),

    // 견적서 재전송
    resend: publicProcedure
      .input(z.object({ id: z.number(), senderId: z.number().optional(), senderRole: z.string().optional() }))
      .mutation(async ({ input }) => {
        const est = await db.getEstimateById(input.id);
        if (!est) throw new Error("견적서를 찾을 수 없습니다.");
        if (est.status === "approved" || est.status === "rejected") {
          return { success: false, message: "이미 응답된 견적서는 재전송할 수 없습니다." };
        }
        const baseUrl = (process.env.SITE_URL || "https://futureenergytech.co.kr").replace(/\/$/, "");
        const estimateUrl = `${baseUrl}/estimate/${est.token}`;
        const newValid = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await db.updateEstimateById(input.id, {
          status: "pending", validUntil: newValid, resendCount: (est.resendCount ?? 0) + 1, sentAt: new Date(),
        });
        const msg = buildEstimateDocMessage(est.customerName ?? "고객", estimateUrl, Number(est.amount));
        let smsSent = false;
        let smsError: string | undefined;
        try {
          const r = await sendNotification(est.customerPhone ?? "", msg);
          smsSent = r.result === "SUCCESS";
          if (!smsSent) smsError = r.errorMessage;
          await db.createEstimateMessageLog({
            estimateId: est.id, customerName: est.customerName, customerPhone: est.customerPhone,
            branchId: est.branchId, branchName: est.branchName, senderRole: input.senderRole ?? null,
            senderId: input.senderId ?? null, messageType: "견적서재발송", messageBody: msg,
            linkUrl: estimateUrl, sendStatus: r.result as any,
          });
        } catch (e) {
          smsError = e instanceof Error ? e.message : String(e);
        }
        return { success: true, smsSent, smsError };
      }),

    // 토큰으로 견적 조회 (고객용) + viewed 표시
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        await db.expireOldEstimates();
        const estimate = await db.getEstimateByToken(input.token);
        if (!estimate) return null;
        await db.markEstimateViewed(input.token);
        return estimate;
      }),

    // 견적 거절 (고객) → 본사/지사 알림
    reject: publicProcedure
      .input(z.object({ token: z.string(), rejectReason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const estimate = await db.getEstimateByToken(input.token);
        if (!estimate) throw new Error("견적서를 찾을 수 없습니다.");
        if (estimate.status === "approved" || estimate.status === "rejected") {
          return { success: false, message: "이미 응답된 견적입니다." };
        }
        await db.rejectEstimate(input.token, input.rejectReason);

        // 본사/지사 담당자 알림
        const adminMsg = buildEstimateRejectedAdminMessage(estimate.customerName ?? "고객", input.rejectReason);
        try {
          let adminPhone: string | null = null;
          if (estimate.ownerType === "branch" && estimate.branchId) {
            adminPhone = await db.getBranchPhone(estimate.branchId);
          }
          if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
          if (adminPhone && adminPhone.trim().length >= 9) {
            const r = await sendSms(adminPhone.trim(), adminMsg);
            await db.createEstimateMessageLog({
              estimateId: estimate.id, customerName: estimate.customerName, customerPhone: adminPhone.trim(),
              branchId: estimate.branchId, branchName: estimate.branchName, messageType: "견적거절알림",
              messageBody: adminMsg, sendStatus: r.result as any,
            });
          }
        } catch (e) {
          console.error("[estimate.reject] admin notify failed:", e);
        }
        return { success: true, message: "견적을 거절했습니다." };
      }),

    // 견적 승인 + 주소/일정 → 신규 오더 생성 (고객)
    approveWithOrder: publicProcedure
      .input(z.object({
        token: z.string(),
        addressFull: z.string().min(1),
        buildingName: z.string().optional(),
        buildingDong: z.string().optional(),
        buildingHo: z.string().optional(),
        visitDate: z.string().optional(),
        visitTime: z.string().optional(),
        requestMemo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const estimate = await db.getEstimateByToken(input.token);
        if (!estimate) throw new Error("견적서를 찾을 수 없습니다.");
        if (estimate.status === "approved") {
          return { success: false, message: "이미 승인된 견적입니다." };
        }
        if (estimate.status === "rejected") {
          return { success: false, message: "이미 거절된 견적입니다." };
        }
        if (estimate.validUntil && new Date(estimate.validUntil) < new Date()) {
          await db.rejectEstimate(input.token, "유효기간 만료");
          return { success: false, message: "견적 유효기간이 만료되었습니다." };
        }

        // 지사 자동 배정 (주소 기반) — 견적의 ownerType이 branch면 그 지사 우선
        let branchId: number | null = estimate.branchId ?? null;
        if (!branchId) {
          const b = await db.findBranchByAddress(input.addressFull);
          branchId = b?.id ?? null;
        }

        // 신규 오더(접수) 생성
        const order = await db.createRepairRequest({
          branchId,
          customerName: estimate.customerName ?? "고객",
          phoneNumber: estimate.customerPhone ?? "",
          apartmentName: input.buildingName || input.addressFull,
          dong: input.buildingDong || "-",
          ho: input.buildingHo || "-",
          symptom: "기타문의",
          detailContent: `[견적승인 자동접수]\n주소: ${input.addressFull}\n견적금액: ${Number(estimate.amount).toLocaleString("ko-KR")}원${input.requestMemo ? `\n요청메모: ${input.requestMemo}` : ""}`,
          preferredDate: input.visitDate ?? null,
          preferredTime: input.visitTime ?? null,
          ownerType: branchId ? "branch" : "headquarters",
          status: "기사배정대기",
          workflowStage: "견적승인",
          estimateAmount: String(estimate.amount),
          estimateApprovedAt: new Date(),
        } as any);

        // 견적 승인 처리 + 오더 연결
        await db.updateEstimateById(estimate.id, {
          status: "approved",
          approvedAt: new Date(),
          addressFull: input.addressFull,
          buildingName: input.buildingName ?? null,
          buildingDong: input.buildingDong ?? null,
          buildingHo: input.buildingHo ?? null,
          visitDate: input.visitDate ?? null,
          visitTime: input.visitTime ?? null,
          requestMemo: input.requestMemo ?? null,
          orderId: order.id,
          branchId,
        });

        // 고객 접수완료 안내
        try {
          const custMsg = buildEstimateApprovedCustomerMessage(estimate.customerName ?? "고객", order.requestNumber);
          const r = await notifyAndLog({
            requestId: order.id, phoneNumber: estimate.customerPhone ?? "",
            messageType: "ESTIMATE_APPROVED", content: custMsg,
          });
          await db.createEstimateMessageLog({
            estimateId: estimate.id, orderId: order.id, customerName: estimate.customerName,
            customerPhone: estimate.customerPhone, branchId, branchName: estimate.branchName,
            messageType: "승인접수완료알림", messageBody: custMsg, sendStatus: r.result as any,
          });
        } catch (e) {
          console.error("[approveWithOrder] customer notify failed:", e);
        }

        // 본사/지사 승인 알림
        try {
          const adminMsg = buildEstimateApprovedAdminMessage(estimate.customerName ?? "고객", order.requestNumber);
          let adminPhone: string | null = null;
          if (branchId) adminPhone = await db.getBranchPhone(branchId);
          if (!adminPhone) adminPhone = await db.getSetting("hq_admin_phone");
          if (adminPhone && adminPhone.trim().length >= 9) {
            const r = await sendSms(adminPhone.trim(), adminMsg);
            await db.createEstimateMessageLog({
              estimateId: estimate.id, orderId: order.id, customerName: estimate.customerName,
              customerPhone: adminPhone.trim(), branchId, branchName: estimate.branchName,
              messageType: "견적승인알림", messageBody: adminMsg, sendStatus: r.result as any,
            });
          }
        } catch (e) {
          console.error("[approveWithOrder] admin notify failed:", e);
        }

        return { success: true, message: "견적을 승인했습니다. 작업 접수가 완료되었습니다.", orderId: order.id, requestNumber: order.requestNumber };
      }),

    // 견적서 목록 (권한별: 본사=전체, 지사=자기것만)
    list: publicProcedure
      .input(z.object({ branchId: z.number().nullable().optional(), status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return db.listEstimates({ branchId: input?.branchId ?? null, status: input?.status });
      }),

    // 메시지 발송 기록 (권한별)
    messageLogs: publicProcedure
      .input(z.object({ branchId: z.number().nullable().optional() }).optional())
      .query(async ({ input }) => {
        return db.getEstimateMessageLogs({ branchId: input?.branchId ?? null });
      }),

    // 접수 건별 견적 목록 (기존 호환)
    listByRequest: publicProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input }) => {
        return db.getEstimatesByRequestId(input.requestId);
      }),
  }),
});
export type AppRouter = typeof appRouter;
