import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const adminPages = [
  "public/web/admin/dashboard.html",
  "public/web/admin/branch.html",
] as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

type AuthRuntime = {
  normalizeStoredAuthToken: (user: unknown) => string | null;
  authHeaders: (extra?: Record<string, string>) => Record<string, string>;
};

/** Inline browser helpers만 분리 실행해 실제 Authorization 결과를 확인한다. */
function loadAuthRuntime(source: string, user: unknown): AuthRuntime {
  const normalizeStart = source.indexOf("function normalizeStoredAuthToken(authUser)");
  const authHeadersStart = source.indexOf("function authHeaders(extra)", normalizeStart);
  const authHeadersEnd = source.indexOf("function doLogout", authHeadersStart);
  expect(normalizeStart).toBeGreaterThan(-1);
  expect(authHeadersStart).toBeGreaterThan(normalizeStart);
  expect(authHeadersEnd).toBeGreaterThan(authHeadersStart);

  const normalizeSource = source.slice(normalizeStart, authHeadersStart);
  const authHeadersSource = source.slice(authHeadersStart, authHeadersEnd);
  return new Function(
    "initialUser",
    `${normalizeSource}\nlet user = initialUser;\n${authHeadersSource}\n` +
      "return { normalizeStoredAuthToken, authHeaders };",
  )(user) as AuthRuntime;
}

describe.each(adminPages)("admin browser HMAC header: %s", (relativePath) => {
  const source = read(relativePath);
  const signature = "A".repeat(64);

  it("uses a stored userId:signature token exactly once", () => {
    const runtime = loadAuthRuntime(source, { userId: 165, token: `165:${signature}` });
    const extra = {
      "Content-Type": "application/json",
      Authorization: "Bearer attacker",
      authorization: "Bearer attacker-lowercase",
    };
    const headers = runtime.authHeaders(extra);

    expect(headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer 165:${signature.toLowerCase()}`,
    });
    expect(headers.Authorization).toMatch(/^Bearer 165:[a-f0-9]{64}$/);
    expect(headers.Authorization).not.toContain("165:165:");
    expect(extra).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer attacker",
      authorization: "Bearer attacker-lowercase",
    });
  });

  it("adds userId only for the legacy signature-only token", () => {
    const runtime = loadAuthRuntime(source, { userId: "165", token: signature });
    expect(runtime.normalizeStoredAuthToken({ userId: "165", token: signature }))
      .toBe(`165:${signature.toLowerCase()}`);
    expect(runtime.authHeaders()).toEqual({
      Authorization: `Bearer 165:${signature.toLowerCase()}`,
    });
  });

  it("rejects mismatched, duplicated, prefixed and malformed stored tokens", () => {
    const invalidUsers = [
      { userId: 165, token: `166:${signature}` },
      { userId: 165, token: `165:165:${signature}` },
      { userId: 165, token: `Bearer 165:${signature}` },
      { userId: 165, token: "a".repeat(63) },
      { userId: 165, token: "g".repeat(64) },
      { userId: "0165", token: signature },
      { userId: Number.MAX_SAFE_INTEGER + 1, token: signature },
      { userId: 165, token: null },
    ];

    for (const invalidUser of invalidUsers) {
      const runtime = loadAuthRuntime(source, invalidUser);
      expect(runtime.normalizeStoredAuthToken(invalidUser)).toBeNull();
      expect(runtime.authHeaders({
        Accept: "application/json",
        Authorization: "Bearer attacker",
        authorization: "Bearer attacker-lowercase",
      })).toEqual({
        Accept: "application/json",
      });
    }
  });

  it("contains the strict normalizer and no legacy double-concatenation expression", () => {
    const checkAuthBlock = source.slice(
      source.indexOf("function checkAuth()"),
      source.indexOf("function normalizeStoredAuthToken(authUser)"),
    );
    expect(source).toContain("normalizeStoredAuthToken(user)");
    expect(source).toContain("/^([1-9]\\d*):([a-f0-9]{64})$/i");
    expect(source).toContain("/^[a-f0-9]{64}$/i");
    expect(source).not.toContain("'Bearer ' + user.userId + ':' + user.token");
    expect(checkAuthBlock).toContain("if (!normalizeStoredAuthToken(user))");
    expect(checkAuthBlock).toContain("doLogout()");
  });
});
