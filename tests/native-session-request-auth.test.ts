import { describe, expect, it, vi } from "vitest";

import {
  getNativeSessionHeaders,
  NativeSessionAuthorizationError,
} from "../lib/native-session-request-auth";

describe("native protected tRPC session header guard", () => {
  it("blocks protected schedule calls before network when the bearer is missing", async () => {
    const readToken = vi.fn(async () => null);
    await expect(getNativeSessionHeaders({ path: "repair.listMySchedule", readToken }))
      .rejects.toMatchObject({ code: "AUTH_SESSION_MISSING" } satisfies Partial<NativeSessionAuthorizationError>);
    expect(readToken).toHaveBeenCalledTimes(1);
  });

  it("surfaces SecureStore read failure as a recovery error instead of an anonymous request", async () => {
    const readToken = vi.fn(async () => { throw new Error("SecureStore unavailable"); });
    await expect(getNativeSessionHeaders({ path: "repair.listMySchedule", readToken }))
      .rejects.toMatchObject({ code: "AUTH_SESSION_STORAGE_UNAVAILABLE" } satisfies Partial<NativeSessionAuthorizationError>);
  });

  it("preserves public login flow without attempting to read a bearer", async () => {
    const readToken = vi.fn(async () => "unexpected");
    await expect(getNativeSessionHeaders({ path: "auth.login", readToken })).resolves.toEqual({});
    expect(readToken).not.toHaveBeenCalled();
  });

  it("preserves the explicitly public customer repair intake without attempting to read a bearer", async () => {
    const readToken = vi.fn(async () => "unexpected");
    await expect(getNativeSessionHeaders({ path: "repair.create", readToken })).resolves.toEqual({});
    expect(readToken).not.toHaveBeenCalled();
  });

  it("uses only the current bearer for a protected schedule call", async () => {
    await expect(getNativeSessionHeaders({
      path: "repair.listMySchedule",
      readToken: async () => "current-bearer",
    })).resolves.toEqual({ Authorization: "Bearer current-bearer" });
  });

  it("requires a bearer for password change and permits an in-memory token only for that exact path", async () => {
    const storedToken = vi.fn(async () => "stored-bearer");
    await expect(getNativeSessionHeaders({ path: "auth.changePassword", readToken: storedToken })).resolves.toEqual({
      Authorization: "Bearer stored-bearer",
    });

    const oneTimeRead = vi.fn(async () => "must-not-read");
    await expect(getNativeSessionHeaders({
      path: "auth.changePassword",
      readToken: oneTimeRead,
      temporaryAuthToken: "first-login-bearer",
    })).resolves.toEqual({ Authorization: "Bearer first-login-bearer" });
    expect(oneTimeRead).not.toHaveBeenCalled();

    await expect(getNativeSessionHeaders({
      path: "location.startTracking",
      readToken: async () => null,
      temporaryAuthToken: "first-login-bearer",
    })).rejects.toMatchObject({ code: "AUTH_SESSION_MISSING" } satisfies Partial<NativeSessionAuthorizationError>);
  });
});
