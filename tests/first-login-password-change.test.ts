import { describe, expect, it } from "vitest";

import { FirstLoginPasswordChange } from "../lib/first-login-password-change";

function candidate(loginId: string, token: string) {
  return {
    userId: loginId === "A" ? 1 : 2,
    loginId,
    appRole: "technician",
    token,
    currentPassword: `${loginId}-temporary-password`,
  } as const;
}

describe("first-login password-change session", () => {
  it("uses the replacement token only for the current pending account and never includes the current password", () => {
    const flow = new FirstLoginPasswordChange();
    const pending = flow.begin(candidate("A", "temporary-A"));

    const completed = flow.complete(pending, {
      success: true,
      token: "replacement-A",
      technicianId: 11,
    });

    expect(completed).toEqual({
      userId: 1,
      loginId: "A",
      appRole: "technician",
      token: "replacement-A",
      technicianId: 11,
      mustChangePassword: false,
    });
    expect(completed).not.toHaveProperty("currentPassword");
    expect(flow.isCurrent(pending)).toBe(false);
  });

  it("drops a delayed A password-change completion after a newer B login begins", () => {
    const flow = new FirstLoginPasswordChange();
    const pendingA = flow.begin(candidate("A", "temporary-A"));
    const pendingB = flow.begin(candidate("B", "temporary-B"));

    expect(flow.complete(pendingA, { success: true, token: "replacement-A" })).toBeNull();
    expect(flow.complete(pendingB, { success: true, token: "replacement-B" })).toMatchObject({
      loginId: "B",
      token: "replacement-B",
    });
  });

  it("keeps the pending account retryable after a failed password-change response and invalidates it on cancellation", () => {
    const flow = new FirstLoginPasswordChange();
    const pending = flow.begin(candidate("A", "temporary-A"));

    expect(flow.complete(pending, { success: false, token: null })).toBeNull();
    expect(flow.isCurrent(pending)).toBe(true);

    flow.cancel();
    expect(flow.complete(pending, { success: true, token: "replacement-A" })).toBeNull();
  });
});
