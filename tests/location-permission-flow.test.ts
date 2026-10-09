import { describe, expect, it, vi } from "vitest";

import {
  canStartLocationTrackingSession,
  requestBackgroundLocationPermissionFlow,
} from "../lib/location-permission-flow";

const granted = { status: "granted", granted: true };
const denied = { status: "denied", granted: false };

async function runDeparture(
  dependencies: Parameters<typeof requestBackgroundLocationPermissionFlow>[0],
  createServerSession: () => Promise<void>,
) {
  const result = await requestBackgroundLocationPermissionFlow(dependencies);
  if (!canStartLocationTrackingSession(result)) return { result, started: false };
  await createServerSession();
  return { result, started: true };
}

describe("Android background location departure gate", () => {
  it("foreground denial does not request background access, notifications, or a server session", async () => {
    const requestBackground = vi.fn(async () => granted);
    const requestNotifications = vi.fn(async () => granted);
    const createServerSession = vi.fn(async () => undefined);

    const outcome = await runDeparture({
      requestForeground: async () => denied,
      requestBackground,
      requestNotifications,
    }, createServerSession);

    expect(outcome).toMatchObject({ started: false, result: { foregroundGranted: false, backgroundGranted: false } });
    expect(requestBackground).not.toHaveBeenCalled();
    expect(requestNotifications).not.toHaveBeenCalled();
    expect(createServerSession).not.toHaveBeenCalled();
  });

  it("Android pre-explanation dismissal does not open Settings or create a server session", async () => {
    const requestBackground = vi.fn(async () => granted);
    const createServerSession = vi.fn(async () => undefined);

    const outcome = await runDeparture({
      requestForeground: async () => granted,
      confirmBackgroundAccess: async () => false,
      requestBackground,
      requestNotifications: async () => granted,
    }, createServerSession);

    expect(outcome).toMatchObject({ started: false, result: { foregroundGranted: true, backgroundGranted: false } });
    expect(requestBackground).not.toHaveBeenCalled();
    expect(createServerSession).not.toHaveBeenCalled();
  });

  it("background denial after the Android Settings route blocks the server session", async () => {
    const requestNotifications = vi.fn(async () => granted);
    const createServerSession = vi.fn(async () => undefined);

    const outcome = await runDeparture({
      requestForeground: async () => granted,
      confirmBackgroundAccess: async () => true,
      requestBackground: async () => denied,
      requestNotifications,
    }, createServerSession);

    expect(outcome).toMatchObject({ started: false, result: { foregroundGranted: true, backgroundGranted: false } });
    expect(requestNotifications).not.toHaveBeenCalled();
    expect(createServerSession).not.toHaveBeenCalled();
  });

  it("background access plus notification denial still blocks the server session", async () => {
    const createServerSession = vi.fn(async () => undefined);

    const outcome = await runDeparture({
      requestForeground: async () => granted,
      requestBackground: async () => granted,
      requestNotifications: async () => denied,
    }, createServerSession);

    expect(outcome).toMatchObject({ started: false, result: { granted: true, backgroundGranted: true, notificationGranted: false } });
    expect(createServerSession).not.toHaveBeenCalled();
  });

  it("requests foreground, background, then notification before exactly one server session", async () => {
    const calls: string[] = [];
    const createServerSession = vi.fn(async () => { calls.push("session"); });

    const outcome = await runDeparture({
      requestForeground: async () => { calls.push("foreground"); return granted; },
      confirmBackgroundAccess: async () => { calls.push("explain"); return true; },
      requestBackground: async () => { calls.push("background"); return granted; },
      requestNotifications: async () => { calls.push("notification"); return granted; },
    }, createServerSession);

    expect(outcome.started).toBe(true);
    expect(calls).toEqual(["foreground", "explain", "background", "notification", "session"]);
    expect(createServerSession).toHaveBeenCalledTimes(1);
  });
});
