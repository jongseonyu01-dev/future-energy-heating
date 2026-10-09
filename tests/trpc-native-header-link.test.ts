import { describe, expect, it, vi } from "vitest";

import {
  getTRPCOperationHeaders,
  temporaryAuthTokenFromOperationContext,
} from "../lib/trpc-operation-headers";

describe("tRPC httpLink native authorization boundary", () => {
  it("passes the current bearer through the exact httpLink header delegate for internally authorized location paths", async () => {
    for (const path of [
      "repair.listMySchedule",
      "location.getConsent",
      "location.saveConsent",
      "location.startTracking",
      "location.getSessionByRequest",
    ]) {
      const readToken = vi.fn(async () => "current-technician-bearer");
      await expect(getTRPCOperationHeaders({ path, platform: "android", readToken })).resolves.toEqual({
        Authorization: "Bearer current-technician-bearer",
      });
      expect(readToken, path).toHaveBeenCalledTimes(1);
    }
  });

  it("aborts before httpLink fetch when an internally authorized path has no native session", async () => {
    await expect(getTRPCOperationHeaders({
      path: "location.startTracking",
      platform: "android",
      readToken: async () => null,
    })).rejects.toMatchObject({ code: "AUTH_SESSION_MISSING" });
  });

  it("keeps public pre-login and browser-cookie flows available without SecureStore", async () => {
    const nativeRead = vi.fn(async () => "not-read");
    await expect(getTRPCOperationHeaders({ path: "auth.login", platform: "android", readToken: nativeRead })).resolves.toEqual({});
    expect(nativeRead).not.toHaveBeenCalled();

    const intakeRead = vi.fn(async () => "not-read");
    await expect(getTRPCOperationHeaders({ path: "repair.create", platform: "android", readToken: intakeRead })).resolves.toEqual({});
    expect(intakeRead).not.toHaveBeenCalled();

    const browserRead = vi.fn(async () => "not-read");
    await expect(getTRPCOperationHeaders({ path: "repair.listMySchedule", platform: "web", readToken: browserRead })).resolves.toEqual({});
    expect(browserRead).not.toHaveBeenCalled();
  });

  it("uses a request-scoped first-login token for only the password-change operation", async () => {
    const context = { temporaryAuthToken: "one-time-first-login-token" };
    const temporaryAuthToken = temporaryAuthTokenFromOperationContext(context);
    const readToken = vi.fn(async () => "must-not-read");

    await expect(getTRPCOperationHeaders({
      path: "auth.changePassword",
      platform: "android",
      readToken,
      temporaryAuthToken,
    })).resolves.toEqual({ Authorization: "Bearer one-time-first-login-token" });
    expect(readToken).not.toHaveBeenCalled();

    await expect(getTRPCOperationHeaders({
      path: "location.startTracking",
      platform: "android",
      readToken: async () => null,
      temporaryAuthToken,
    })).rejects.toMatchObject({ code: "AUTH_SESSION_MISSING" });
  });
});
