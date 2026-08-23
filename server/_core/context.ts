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

/**
 * Bearer userId:hmacSignature 형식의 앱 전용 HMAC 토큰을 검증하고
 * app_roles 기반 가상 User 객체를 반환한다.
 * 성공 시 User 객체 (id=app_roles.userId, appRole 포함), 실패 시 null.
 */
async function authenticateAppToken(authHeader: string | undefined): Promise<User | null> {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  const tokenMatch = raw.match(/^([1-9]\d*):([a-f0-9]{64})$/i);
  if (!tokenMatch) return null;
  const userId = Number(tokenMatch[1]);
  const sig = tokenMatch[2].toLowerCase();
  if (!Number.isSafeInteger(userId)) return null;
  const role = await db.getAppRole(userId);
  if (!role || !role.isActive || !role.passwordHash) return null;
  const expected = crypto
    .createHmac("sha256", role.passwordHash)
    .update(String(role.userId))
    .digest("hex");
  const actualBuffer = Buffer.from(sig, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) return null;
  let canonicalBranchId = role.branchId ?? null;
  if (role.appRole === "branch_manager") {
    const managedBranch = await db.getManagedActiveBranchByUserId(role.userId);
    if (!managedBranch) return null;
    canonicalBranchId = managedBranch.id;
  }
  // app_roles 기반 가상 User 객체 반환 (users 테이블 없이도 인증 가능)
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
    // 앱 권한 정보 (as any로 확장)
    ...({ appRole: role.appRole, branchId: canonicalBranchId } as any),
  } as User;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  const authHeader = opts.req.headers.authorization || (opts.req.headers as any).Authorization;
  // 1. 앱 HMAC 토큰 우선 검증 (Bearer userId:서명값 형식)
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
