import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(works).toContain("startingTrackingRequestId === work.id || isThisTracking");
    expect(works).toContain("{startingTrackingRequestId === work.id ? (");
  });

  it("treats a server departure as complete when only local tracking startup fails", () => {
    const schedule = source("app/(tabs)/tech-schedule.tsx");

    expect(schedule).toContain("if (!trackResult.ok)");
    expect(schedule).toContain("departedWithoutLocalTrackingRequestIdRef.current = work.id");
    expect(schedule).toContain("departedWithoutLocalTrackingRequestIdRef.current !== null");
    expect(schedule).toContain("출발 완료 · 위치 확인 필요");
    expect(schedule).toContain("출발 버튼을 다시 누르지 마세요");
    expect(schedule).toContain("앱을 완전히 종료했다가 다시 실행하고 위치 권한을 확인해 주세요");
    expect(schedule).toContain("needsLocationRecovery");
    expect(schedule).toContain("startingTrackingRequestId !== null || departedWithoutLocalTrackingRequestId !== null");
    expect(schedule).toContain("disabled={isDepartBusy}");
    expect(schedule).not.toContain("throw new Error(trackResult.error");
  });

  it("restores the complete tracking session after an iPhone app restart", () => {
    const tracking = source("lib/location-tracking-context.tsx");

    expect(tracking).toContain('TRACKING_SESSION_KEY = "location_tracking_session_v1"');
    expect(tracking).toContain("AsyncStorage.getItem(TRACKING_SESSION_KEY)");
    expect(tracking).toContain("AsyncStorage.setItem(TRACKING_SESSION_KEY");
    expect(tracking).toContain("AsyncStorage.removeItem(TRACKING_SESSION_KEY)");
    expect(tracking).toContain("setTrackingRequestId(persisted.requestId)");
    expect(tracking).toContain("const token = legacyToken ?? persisted?.token ?? null");
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
