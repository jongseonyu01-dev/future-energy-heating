import { describe, expect, it, vi } from "vitest";
import { isValidAppSessionToken, synchronizeAppSessionToken } from "../lib/session-token-storage";

const validToken = `123:456:${"a".repeat(64)}`;

describe("native app session token synchronization", () => {
  it("accepts only the server HMAC token format", () => {
    expect(isValidAppSessionToken(validToken)).toBe(true);
    expect(isValidAppSessionToken("Bearer token")).toBe(false);
    expect(isValidAppSessionToken("123:456:short")).toBe(false);
    expect(isValidAppSessionToken(null)).toBe(false);
  });

  it("persists a verified token before allowing the native session", async () => {
    const persist = vi.fn(async () => undefined);
    await expect(synchronizeAppSessionToken(validToken, persist)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(validToken);
  });

  it("rejects a failed SecureStore write and never accepts an invalid token", async () => {
    const rejectedPersist = vi.fn(async () => { throw new Error("storage unavailable"); });
    await expect(synchronizeAppSessionToken(validToken, rejectedPersist)).resolves.toBe(false);
    expect(rejectedPersist).toHaveBeenCalledTimes(1);

    const neverPersist = vi.fn(async () => undefined);
    await expect(synchronizeAppSessionToken("invalid", neverPersist)).resolves.toBe(false);
    expect(neverPersist).not.toHaveBeenCalled();
  });
});
