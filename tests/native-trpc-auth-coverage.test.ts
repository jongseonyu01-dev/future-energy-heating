import { describe, expect, it, vi } from "vitest";

import {
  getNativeSessionHeaders,
  NativeSessionAuthorizationError,
  requiresNativeSession,
} from "../lib/native-session-request-auth";

const AUTH_REQUIRED_NATIVE_PATHS = [
  "repair.listMySchedule",
  "location.getConsent",
  "location.saveConsent",
  "location.startTracking",
  "location.getSessionByRequest",
  "location.stopTracking",
  "location.markArrived",
  "location.markWorkCompleted",
  "auth.updateMyProfile",
] as const;

const PREAUTH_NATIVE_PATHS = [
  "auth.login",
  "auth.changePassword",
  "auth.sendVerifyCode",
  "auth.checkVerifyCode",
  "auth.registerCustomer",
  "auth.findLoginId",
  "auth.resetPassword",
] as const;

describe("native tRPC bearer coverage", () => {
  it("preserves the current bearer for every known internally authorized location and schedule call", async () => {
    for (const path of AUTH_REQUIRED_NATIVE_PATHS) {
      const readToken = vi.fn(async () => "current-native-token");
      expect(requiresNativeSession(path), path).toBe(true);
      await expect(getNativeSessionHeaders({ path, readToken })).resolves.toEqual({
        Authorization: "Bearer current-native-token",
      });
      expect(readToken, path).toHaveBeenCalledTimes(1);
    }
  });

  it("blocks all authenticated paths before fetch when the bearer is missing or storage fails", async () => {
    for (const path of AUTH_REQUIRED_NATIVE_PATHS) {
      await expect(getNativeSessionHeaders({ path, readToken: async () => null }))
        .rejects.toMatchObject({ code: "AUTH_SESSION_MISSING" } satisfies Partial<NativeSessionAuthorizationError>);
      await expect(getNativeSessionHeaders({ path, readToken: async () => { throw new Error("storage failed"); } }))
        .rejects.toMatchObject({ code: "AUTH_SESSION_STORAGE_UNAVAILABLE" } satisfies Partial<NativeSessionAuthorizationError>);
    }
  });

  it("keeps only explicit pre-login flows usable without a bearer", async () => {
    for (const path of PREAUTH_NATIVE_PATHS) {
      const readToken = vi.fn(async () => "should-not-be-read");
      expect(requiresNativeSession(path), path).toBe(false);
      await expect(getNativeSessionHeaders({ path, readToken })).resolves.toEqual({});
      expect(readToken, path).not.toHaveBeenCalled();
    }
  });
});
