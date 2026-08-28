import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createSingleRetryLoop,
  createTrackingRecoveryLock,
  requestLocationUpdate,
  resolveTrackingStopToken,
  startNativeTrackingAndSendInitialLocation,
  startNativeTrackingWithRetry,
} from "../lib/location-tracking-startup";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("technician arrival workspace flow", () => {
  it("removes the schedule checklist shortcut and opens the workspace after arrival", () => {
    const schedule = source("app/(tabs)/tech-schedule.tsx");

    expect(schedule).not.toContain("📋 점검표");
    expect(schedule).toContain("trpc.location.markArrived.useMutation");
    expect(schedule).toContain("markArrivedMutation.mutateAsync");
    expect(schedule).toContain("arrivingRequestIdRef");
    expect(schedule).not.toContain("recoverableDepartures");
    expect(schedule).not.toContain("effectiveTrackingRequestId");
    expect(schedule).toContain("/job-workspace?requestId=");
  });

  it("isolates departure loading by request and blocks rapid or overlapping departures", () => {
    const schedule = source("app/(tabs)/tech-schedule.tsx");
    const works = source("app/(tabs)/tech-works.tsx");

    for (const screen of [schedule, works]) {
      expect(screen).toContain("startingTrackingRequestIdRef");
      expect(screen).toContain("startingTrackingRequestIdRef.current !== null");
      expect(screen).toContain("startingTrackingRequestIdRef.current = work.id");
      expect(screen).toContain("trackingRequestId !== null && trackingRequestId !== work.id");
      expect(screen).toContain("현재 이동 중인 방문을 먼저 도착 또는 취소 처리해 주세요.");
      expect(screen).toContain("friendlyDepartError(e)");
      expect(screen).toContain("requestId: work.id");
    }

    expect(schedule).not.toContain("isStartingTracking");
    expect(schedule).toContain("const isStartingThis = startingTrackingRequestId === work.id");
    expect(schedule).toContain("(isStartingThis || needsLocationRecovery) && s.btnDisabled");
    expect(schedule).toContain("{isStartingThis ? (");
    expect(works).toContain("const isStartingThis = startingTrackingRequestId === work.id");
    expect(works).toContain("isStartingThis || needsLocationRecovery || isThisTracking");
    expect(works).toContain("{isStartingThis ? (");
  });

  it("treats a server departure as complete when only local tracking startup fails", () => {
    const schedule = source("app/(tabs)/tech-schedule.tsx");
    const works = source("app/(tabs)/tech-works.tsx");

    for (const screen of [schedule, works]) {
      expect(screen).toContain("trackingRecoveryRequestId");
      expect(screen).toContain("isTrackingRecoveryLocked()");
      expect(screen).toContain("출발 완료 · 위치 확인 필요");
      expect(screen).toContain("출발 버튼을 다시 누르지 마세요");
      expect(screen).toContain("앱을 완전히 종료했다가 다시 실행하고 위치 권한을 확인해 주세요");
      expect(screen).toContain("needsLocationRecovery");
      expect(screen).toContain("disabled={isDepartBusy}");
    }

    expect(schedule).toContain("if (!trackResult.ok)");
    expect(schedule).not.toContain("throw new Error(trackResult.error");
    expect(works).toContain("if (!trackingResult.ok)");
    expect(works).not.toContain("throw new Error(trackingResult.error");

    const sharedRecoveryLock = createTrackingRecoveryLock();
    const scheduleCanMutateServer = () => !sharedRecoveryLock.isLocked();
    const worksCanMutateServer = () => !sharedRecoveryLock.isLocked();
    expect(scheduleCanMutateServer()).toBe(true);
    expect(worksCanMutateServer()).toBe(true);
    const scheduleMutation = vi.fn();
    const worksMutation = vi.fn();
    expect(sharedRecoveryLock.tryBegin(101)).toBe(true);
    scheduleMutation();
    expect(sharedRecoveryLock.tryBegin(202)).toBe(false);
    if (sharedRecoveryLock.getRequestId() === 202) worksMutation();
    expect(scheduleMutation).toHaveBeenCalledTimes(1);
    expect(worksMutation).not.toHaveBeenCalled();
    expect(sharedRecoveryLock.lock(202)).toBe(false);
    expect(sharedRecoveryLock.lock(101)).toBe(true);
    expect(scheduleCanMutateServer()).toBe(false);
    expect(worksCanMutateServer()).toBe(false);
    expect(sharedRecoveryLock.getRequestId()).toBe(101);
    expect(sharedRecoveryLock.release(101)).toBe(false);

    for (const screen of [schedule, works]) {
      expect(screen.indexOf("if (!tryBeginDeparture(work.id))")).toBeLessThan(
        screen.indexOf("startTrackingMutation.mutateAsync"),
      );
    }
  });

  it("propagates native startup, GPS, and initial-send failures to the caller", async () => {
    const getCurrentLocation = vi.fn(async () => ({ lat: 37.5, lng: 127 }));
    const persistSession = vi.fn(async () => {});
    const sendCurrentLocation = vi.fn(async () => true);

    const nativeFailure = await startNativeTrackingAndSendInitialLocation({
      persistSession,
      startNativeTracking: vi.fn(async () => { throw new Error("native start failed"); }),
      getCurrentLocation,
      sendCurrentLocation,
    });
    expect(nativeFailure).toEqual({ ok: false, error: "native start failed" });
    expect(getCurrentLocation).not.toHaveBeenCalled();
    expect(sendCurrentLocation).not.toHaveBeenCalled();

    const gpsFailure = await startNativeTrackingAndSendInitialLocation({
      persistSession,
      startNativeTracking: vi.fn(async () => {}),
      getCurrentLocation: vi.fn(async () => null),
      sendCurrentLocation,
    });
    expect(gpsFailure.ok).toBe(false);
    expect(sendCurrentLocation).not.toHaveBeenCalled();

    const sendFailure = await startNativeTrackingAndSendInitialLocation({
      persistSession,
      startNativeTracking: vi.fn(async () => {}),
      getCurrentLocation,
      sendCurrentLocation: vi.fn(async () => false),
    });
    expect(sendFailure).toEqual({ ok: false, error: "첫 위치를 서버에 전송하지 못했습니다." });

    const success = await startNativeTrackingAndSendInitialLocation({
      persistSession,
      startNativeTracking: vi.fn(async () => {}),
      getCurrentLocation,
      sendCurrentLocation,
    });
    expect(success).toEqual({ ok: true });

    const tracking = source("lib/location-tracking.ts");
    const context = source("lib/location-tracking-context.tsx");
    expect(tracking).toContain("): Promise<boolean>");
    expect(tracking).toContain("return result.ok");
    expect(tracking).toContain("return false");
    expect(tracking).toContain("throw new Error(e?.message || \"기기 위치 추적을 시작하지 못했습니다.\")");
    expect(context).toContain("startNativeTrackingAndSendInitialLocation");
    expect(context).toContain("if (!startupResult.ok)");
    expect(context).toContain("lockTrackingRecovery(requestId)");
  });

  it("persists the complete session before local startup and fails closed when persistence fails", async () => {
    const callOrder: string[] = [];
    const success = await startNativeTrackingAndSendInitialLocation({
      persistSession: vi.fn(async () => { callOrder.push("persist"); }),
      startNativeTracking: vi.fn(async () => { callOrder.push("start"); }),
      getCurrentLocation: vi.fn(async () => {
        callOrder.push("locate");
        return { lat: 37.5, lng: 127 };
      }),
      sendCurrentLocation: vi.fn(async () => {
        callOrder.push("send");
        return true;
      }),
    });
    expect(success).toEqual({ ok: true });
    expect(callOrder).toEqual(["persist", "start", "locate", "send"]);

    const startNativeTracking = vi.fn(async () => {});
    const persistenceFailure = await startNativeTrackingAndSendInitialLocation({
      persistSession: vi.fn(async () => { throw new Error("storage unavailable"); }),
      startNativeTracking,
      getCurrentLocation: vi.fn(async () => ({ lat: 37.5, lng: 127 })),
      sendCurrentLocation: vi.fn(async () => true),
    });
    expect(persistenceFailure).toEqual({ ok: false, error: "storage unavailable" });
    expect(startNativeTracking).not.toHaveBeenCalled();
  });

  it("retains the foreground retry when native startup rejects", async () => {
    const startRetryLoop = vi.fn();
    await expect(startNativeTrackingWithRetry(
      startRetryLoop,
      vi.fn(async () => { throw new Error("native rejected"); }),
    )).rejects.toThrow("native rejected");
    expect(startRetryLoop).toHaveBeenCalledTimes(1);

    const tracking = source("lib/location-tracking.ts");
    expect(tracking).toContain("startNativeTrackingWithRetry(startGlobalFgInterval");
  });

  it("returns false for HTTP and network failures from the real update request contract", async () => {
    const init = { method: "POST" as const, headers: { "Content-Type": "application/json" }, body: "{}" };
    const httpFailure = await requestLocationUpdate(
      vi.fn(async () => ({ ok: false, status: 500 })),
      "https://example.test/api/location/update",
      init,
    );
    expect(httpFailure).toEqual({ ok: false, status: 500 });

    const networkFailure = await requestLocationUpdate(
      vi.fn(async () => { throw new Error("offline"); }),
      "https://example.test/api/location/update",
      init,
    );
    expect(networkFailure).toEqual({ ok: false, error: "offline" });

    const tracking = source("lib/location-tracking.ts");
    expect(tracking).toContain("requestLocationUpdate(fetch");
    expect(tracking).toContain("return result.ok");
  });

  it("runs only one foreground retry loop and can restart it after cleanup", () => {
    const schedule = vi.fn(() => ({ id: Symbol("interval") }));
    const cancel = vi.fn();
    const retryLoop = createSingleRetryLoop(schedule, cancel);
    const callback = vi.fn();

    expect(retryLoop.start(callback, 10_000)).toBe(true);
    expect(retryLoop.start(callback, 10_000)).toBe(false);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(retryLoop.isRunning()).toBe(true);
    retryLoop.stop();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(retryLoop.isRunning()).toBe(false);
    expect(retryLoop.start(callback, 10_000)).toBe(true);
    expect(schedule).toHaveBeenCalledTimes(2);

    const context = source("lib/location-tracking-context.tsx");
    const tracking = source("lib/location-tracking.ts");
    expect(context).not.toContain("setInterval(");
    expect(context).not.toContain("fgIntervalRef");
    expect(tracking).toContain("createSingleRetryLoop");
  });

  it("recovers a stop token from durable storage after failed startup", () => {
    expect(resolveTrackingStopToken(null, null, "legacy-token", "session-token")).toBe("legacy-token");
    expect(resolveTrackingStopToken(null, null, null, "session-token")).toBe("session-token");
    expect(resolveTrackingStopToken("ref-token", "state-token", "legacy-token", "session-token")).toBe("ref-token");

    const context = source("lib/location-tracking-context.tsx");
    expect(context).toContain("resolveTrackingStopToken(");
    expect(context).toContain("getActiveTrackingToken()");
    expect(context).toContain("sessionRef.current?.token");
    expect(context).toContain("persisted?.token ?? null");
    expect(context.indexOf("await stopLocationTracking()")).toBeGreaterThan(
      context.indexOf("resolveTrackingStopToken("),
    );
  });

  it("restores the complete tracking session after an iPhone app restart", () => {
    const tracking = source("lib/location-tracking-context.tsx");

    expect(tracking).toContain('TRACKING_SESSION_KEY = "location_tracking_session_v1"');
    expect(tracking).toContain("AsyncStorage.getItem(TRACKING_SESSION_KEY)");
    expect(tracking).toContain("AsyncStorage.setItem(TRACKING_SESSION_KEY");
    expect(tracking).toContain("AsyncStorage.removeItem(TRACKING_SESSION_KEY)");
    expect(tracking).toContain("setTrackingRequestId(persisted.requestId)");
    expect(tracking).toContain("const token = legacyToken ?? persisted?.token ?? null");
    expect(tracking).toContain("persisted?.requiresRecovery");
    expect(tracking).toContain("requiresRecovery: true");
    expect(tracking).toContain("requiresRecovery: false");
    expect(tracking).toContain("hydrationRef.current = true");
  });

  it("blocks work-list shortcuts before arrival", () => {
    const works = source("app/(tabs)/tech-works.tsx");

    expect(works).toContain("도착 완료 후 이용 가능");
    expect(works).toContain("canOpenWorkspace(work)");
    expect(works).toContain("/job-workspace?requestId=");
    expect(works).toContain('router.push("/tech-estimate"');
    expect(works).toContain("✏️ 견적 작성");
  });

  it("offers exactly the requested field-work entry points", () => {
    const workspace = source("app/job-workspace.tsx");

    expect(workspace).toContain("현장 점검표");
    expect(workspace).toContain("견적서 만들기");
    expect(workspace).toContain("견적서 송출하기");
    expect(workspace).toContain('openEstimate("draft")');
    expect(workspace).toContain('openEstimate("send")');
    expect(workspace).toContain("고객에게 직접 발송되지 않습니다");
    expect(workspace).not.toContain("customerPhone=${encodeURIComponent");
  });

  it("keeps photo normalization and adds payment fields with iOS keyboard handling", () => {
    const report = source("app/work-report.tsx");

    expect(report).toContain("paymentMethod: paymentMethod || null");
    expect(report).toContain("paymentAmount: amount ?? null");
    expect(report).toContain('request.status === "공사완료"');
    expect(report).toContain("Boolean(existingReport?.isCompleted)");
    expect(report).toContain("router.replace(`/job-workspace?requestId=");
    expect(report).toContain("KeyboardAvoidingView");
    expect(report).not.toContain("automaticallyAdjustKeyboardInsets");
    expect(report).toContain("ImageManipulator.manipulateAsync");
    expect(report).toContain('mimeType: "image/jpeg"');
    expect(report).toContain("MAX_WORK_REPORT_PHOTO_BYTES");
  });

  it("separates a local estimate draft from the manager-review request", () => {
    const estimate = source("app/tech-estimate.tsx");

    expect(estimate).toContain("AsyncStorage.setItem");
    expect(estimate).toContain("fe_estimate_draft_");
    expect(estimate).toContain("requestId: requestId ?? undefined");
    expect(estimate).toContain("techRequestMutation.mutateAsync");
    expect(estimate).toContain("본사/지사 검토대기");
    expect(estimate).toContain("고객에게 직접 발송된 것은 아닙니다");
    expect(estimate).toContain("linkedRequest?.customerName ?? customerName");
    expect(estimate).toContain("subtotal: item.unitPrice * item.qty");
    expect(estimate).toContain("editable={requestId === null}");
    expect(estimate).not.toContain("automaticallyAdjustKeyboardInsets");
  });

  it("ships distinct iOS and Android build numbers for the new workflow", () => {
    const config = source("app.config.ts");

    expect(config).toContain('version: "1.1.20"');
    expect(config).toContain('buildNumber: "20"');
    expect(config).toContain("versionCode: 31");
  });
});
