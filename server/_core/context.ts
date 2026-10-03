import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db.js";
import crypto from "crypto";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// 토큰 만료: 30일 (초 단위)
const TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/**
 * 앱 세션 토큰 생성: userId:issuedAt:HMAC(passwordHash, "userId:issuedAt")
 * - issuedAt: Unix 초 단위 타임스탬프
 * - 비밀번호 변경 시 passwordHash가 바뀌므로 기존 토큰 자동 폐기
 * - 30일 후 만료
 */
export function createAppSessionToken(userId: number, passwordHash: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${userId}:${issuedAt}`;
  const sig = crypto
    .createHmac("sha256", passwordHash || "seed")
    .update(payload)
    .digest("hex");
  return `${payload}:${sig}`;
}

/**
 * Bearer 토큰 검증 (신형: userId:issuedAt:sig, 구형 호환: userId:sig)
 * - 신형: 30일 만료 + 비밀번호 변경 시 폐기
 * - 구형(v1.1.8): 서명만 확인, 만료 없음 (하위 호환)
 * 성공 시 User 객체, 실패 시 null.
 */
async function authenticateAppToken(authHeader: string | undefined): Promise<User | null> {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  const parts = raw.split(":");
  if (parts.length < 2) return null;

  const userId = parseInt(parts[0], 10);
  if (isNaN(userId)) return null;

  const role = await db.getAppRole(userId);
  if (!role || !role.isActive) return null;

  if (parts.length >= 3) {
    // 신형: userId:issuedAt:sig
    const issuedAt = parseInt(parts[1], 10);
    const sig = parts.slice(2).join(":");
    if (isNaN(issuedAt) || !sig) return null;

    // 30일 만료 확인
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - issuedAt > TOKEN_TTL_SEC) return null;

    // 서명 검증
    const payload = `${userId}:${issuedAt}`;
    const expected = crypto
      .createHmac("sha256", role.passwordHash || "seed")
      .update(payload)
      .digest("hex");
    if (expected !== sig) return null;
  } else {
    // 구형 호환: userId:sig (v1.1.8 앱)
    const sig = parts[1];
    if (!sig) return null;
    const expected = crypto
      .createHmac("sha256", role.passwordHash || "seed")
      .update(String(role.userId))
      .digest("hex");
    if (expected !== sig) return null;
  }

  // app_roles 기반 가상 User 객체 반환
  const now = new Date();
  return {
    id: role.userId,
    openId: `app_role_${role.userId}`,
    name: role.name ?? null,
    email: null,
    loginMethod: "app",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    ...({ appRole: role.appRole, branchId: role.branchId ?? null } as any),
  } as User;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  const authHeader = opts.req.headers.authorization || (opts.req.headers as any).Authorization;

  // 1. 앱 HMAC 토큰 우선 검증 (Bearer userId:... 형식)
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    if (raw.includes(":")) {
      user = await authenticateAppToken(authHeader);
    }
  }

  // 2. 앱 토큰 실패 시 Manus OAuth JWT 검증 (폴백)
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
