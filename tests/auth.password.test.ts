import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// routers.ts 내부 헬퍼와 동일한 로직을 재현하여 단위 검증한다.
// (routers.ts는 DB/외부 모듈 의존성이 커서 직접 import 대신 동일 알고리즘을 검증한다.)

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function legacyHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

function verifyPassword(password: string, storedHash: string | null): { ok: boolean; isLegacy: boolean } {
  if (!storedHash) return { ok: false, isLegacy: false };
  if (storedHash.startsWith("$2")) {
    return { ok: bcrypt.compareSync(password, storedHash), isLegacy: false };
  }
  return { ok: legacyHash(password) === storedHash, isLegacy: true };
}

const MYSQL_INT_MAX = 2_147_483_647;
function generateSafeUserId(seed: string): number {
  const h = crypto.createHash("sha256").update(seed).digest().readUInt32BE(0);
  return (h % 2_000_000_000) + 100000;
}

describe("비밀번호 해싱/검증", () => {
  it("비밀번호는 평문이 아닌 bcrypt 해시로 저장된다", () => {
    const plain = "Customer1234";
    const hash = hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.length).toBeGreaterThanOrEqual(59);
  });

  it("올바른 비밀번호는 검증을 통과한다", () => {
    const hash = hashPassword("Branch1234");
    expect(verifyPassword("Branch1234", hash).ok).toBe(true);
  });

  it("틀린 비밀번호는 검증에 실패한다", () => {
    const hash = hashPassword("Admin1234");
    expect(verifyPassword("wrongpass", hash).ok).toBe(false);
  });

  it("같은 비밀번호라도 솔트로 인해 해시가 매번 다르다", () => {
    const a = hashPassword("samepw123");
    const b = hashPassword("samepw123");
    expect(a).not.toBe(b);
    expect(verifyPassword("samepw123", a).ok).toBe(true);
    expect(verifyPassword("samepw123", b).ok).toBe(true);
  });

  it("저장된 해시가 없으면 검증에 실패한다", () => {
    expect(verifyPassword("anything", null).ok).toBe(false);
  });

  it("레거시 해시는 검증되며 isLegacy=true로 표시된다", () => {
    const legacy = legacyHash("oldpw");
    const r = verifyPassword("oldpw", legacy);
    expect(r.ok).toBe(true);
    expect(r.isLegacy).toBe(true);
  });
});

describe("userId 생성 - MySQL INT 안전 범위", () => {
  it("생성된 userId는 항상 MySQL INT 최대값 이하이다", () => {
    for (let i = 0; i < 5000; i++) {
      const id = generateSafeUserId(`user_${i}_${i * 7919}`);
      expect(id).toBeGreaterThanOrEqual(100000);
      expect(id).toBeLessThanOrEqual(MYSQL_INT_MAX);
      expect(Number.isInteger(id)).toBe(true);
    }
  });

  it("이전 버그 시드(범위 초과 사례)도 안전 범위로 들어온다", () => {
    // 과거 readUInt32BE 그대로 사용 시 2,147,483,647을 초과하던 케이스 재현 방지
    const seeds = ["test_branch", "test_tech", "test_admin", "test_customer"];
    for (const s of seeds) {
      const id = generateSafeUserId(s + "1717800000000");
      expect(id).toBeLessThanOrEqual(MYSQL_INT_MAX);
    }
  });
});
