import { describe, expect, it, vi } from "vitest";

import {
  isAuthenticatedScheduleReady,
  refreshAuthenticatedSchedule,
} from "../lib/authenticated-schedule-refresh";

describe("authenticated schedule imperative refresh", () => {
  it("blocks focus, return, retry, and pull-to-refresh callbacks while auth restoration is pending", async () => {
    const refetch = vi.fn(async () => "network-called");
    const ready = isAuthenticatedScheduleReady({ userId: 101, isAuthLoading: true });

    for (const trigger of ["focus", "app-return", "retry", "pull-to-refresh"]) {
      await expect(refreshAuthenticatedSchedule({ ready, refetch })).resolves.toBeUndefined();
      expect(refetch, trigger).not.toHaveBeenCalled();
    }
  });

  it("blocks a direct schedule entry with no current user", async () => {
    const refetch = vi.fn(async () => "network-called");
    const ready = isAuthenticatedScheduleReady({ userId: null, isAuthLoading: false });
    await refreshAuthenticatedSchedule({ ready, refetch });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("allows refresh only after the current authenticated user is ready", async () => {
    const refetch = vi.fn(async () => "current-user-schedule");
    const ready = isAuthenticatedScheduleReady({ userId: 202, isAuthLoading: false });
    await expect(refreshAuthenticatedSchedule({ ready, refetch })).resolves.toBe("current-user-schedule");
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
