import { describe, expect, it } from "vitest";

import {
  LocationRuntimeDiagnosticsStore,
  type KeyValueStorage,
} from "../lib/location-runtime-diagnostics";
import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from "../lib/location-runtime-status";
import { TaskCallbackDeadlineFence, createTaskDeadline } from "../lib/location-task-budget";
import { LatestOnlyUploadQueue } from "../lib/location-upload-scheduler";
import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";
import { runGuardedLocationUpload } from "../lib/location-upload-guard";

const stateA: TrackingLifecycleState = {
  token: "a".repeat(43), requestId: 91, technicianUserId: 41, technicianId: 11, startedAt: 91_000, trackingUrl: null,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function exactAdapter(overrides: Partial<TrackingLifecycleAdapter<TrackingLifecycleState>> = {}) {
  let stored: TrackingLifecycleState | null = null;
  const adapter: TrackingLifecycleAdapter<TrackingLifecycleState> = {
    read: async () => stored,
    save: async (state) => { stored = state; },
    clearIfSame: async (state) => { if (stored?.token === state.token && stored.startedAt === state.startedAt) stored = null; },
    showControlNotification: async () => {},
    clearControlNotification: async () => {},
    startNativeCollection: async () => {},
    stopNativeCollection: async () => {},
    onStateChanged: () => {},
    ...overrides,
  };
  return { adapter, stored: () => stored };
}

describe("TaskManager callback별 격리", () => {
  it("A 완료 Promise는 B의 지연 실행을 기다리지 않는다", async () => {
    const queue = new LatestOnlyUploadQueue<{ measuredAt: number }>();
    const aGate = deferred<void>();
    const bGate = deferred<void>();
    let bFinished = false;

    const callbackA = queue.enqueue("session-A", { measuredAt: 100 }, async () => {
      await aGate.promise;
    });
    await Promise.resolve();
    const callbackB = queue.enqueue("session-A", { measuredAt: 200 }, async () => {
      await bGate.promise;
      bFinished = true;
    });

    aGate.resolve();
    await expect(callbackA).resolves.toBeUndefined();
    expect(bFinished).toBe(false);
    bGate.resolve();
    await expect(callbackB).resolves.toBeUndefined();
    expect(bFinished).toBe(true);
  });

  it("A deadline 만료는 B 대기 샘플을 취소하지 않으며 A 후속 부작용을 차단한다", async () => {
    const queue = new LatestOnlyUploadQueue<{ measuredAt: number }>();
    const credential = deferred<void>();
    const firstFence = new TaskCallbackDeadlineFence(createTaskDeadline(5));
    const processed: number[] = [];
    let lateAEffects = 0;

    const callbackA = queue.enqueue("session-A", { measuredAt: 100 }, async () => {
      await firstFence.run(async () => {
        await credential.promise;
        if (firstFence.isActive()) lateAEffects += 1;
      });
    });
    await Promise.resolve();
    const callbackB = queue.enqueue("session-A", { measuredAt: 200 }, async (sample) => {
      processed.push(sample.measuredAt);
    });

    await new Promise((resolve) => setTimeout(resolve, 12));
    await expect(callbackA).resolves.toBeUndefined();
    await expect(callbackB).resolves.toBeUndefined();
    expect(processed).toEqual([200]);
    credential.resolve();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(lateAEffects).toBe(0);
  });
});

describe("terminal 위치 응답", () => {
  it("진단·native 정리가 멎어도 exact 세션은 즉시 무효화되어 후속 HTTP가 없다", async () => {
    const nativeStop = deferred<void>();
    const fixture = exactAdapter({
      stopNativeCollection: async () => nativeStop.promise,
    });
    const lifecycle = new TrackingLifecycleCoordinator(fixture.adapter);
    expect(await lifecycle.start(stateA)).toBe(true);

    const stopped = await lifecycle.stopForTerminalResponse(stateA);
    expect(stopped?.requestId).toBe(stateA.requestId);
    expect(await lifecycle.isCurrent(stateA)).toBe(false);

    let requests = 0;
    await expect(runGuardedLocationUpload({
      isCurrent: () => lifecycle.isCurrent(stateA),
      getCredential: async () => "technician-bearer",
      request: async () => { requests += 1; return { ok: true }; },
    })).resolves.toEqual({ kind: "STALE" });
    expect(requests).toBe(0);
    nativeStop.resolve();
  });
});

describe("불변 위치 진단", () => {
  it("이미 시작된 A write가 늦게 commit해도 B 최신 accepted 상태를 덮지 않는다", async () => {
    const values = new Map<string, string>();
    const pauseA = deferred<void>();
    const aWriteStarted = deferred<void>();
    let blockA = false;
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        const record = JSON.parse(value) as { operationId: string };
        if (blockA && record.operationId.endsWith("-2")) {
          aWriteStarted.resolve();
          await pauseA.promise;
        }
        values.set(key, value);
      },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);

    blockA = true;
    const expiredA = diagnostics.patch(stateA, { lastErrorCode: "NETWORK_ERROR", lastErrorAt: 2_000 });
    await aWriteStarted.promise;
    diagnostics.releaseExpiredWork();
    const acceptedB = diagnostics.update(stateA, (current) => ({
      ...current,
      lastStoredAt: 3_000,
      lastResponseAt: 3_000,
      lastErrorCode: null,
      lastErrorAt: null,
      storedCount: current.storedCount + 1,
    }));
    await expect(acceptedB).resolves.toMatchObject({ lastStoredAt: 3_000, lastErrorCode: null });

    pauseA.resolve();
    await expiredA;
    await expect(diagnostics.read(stateA)).resolves.toMatchObject({
      lastStoredAt: 3_000,
      lastErrorCode: null,
      storedCount: 1,
    });
  });

  it("callback deadline 결과는 새 이벤트 없이도 uploading 표시를 error로 전환한다", async () => {
    const diagnostics = {
      schemaVersion: 1 as const,
      requestId: stateA.requestId,
      technicianUserId: stateA.technicianUserId,
      startedAt: stateA.startedAt,
      updatedAt: 10_000,
      operationId: "10000-1",
      buildLabel: null,
      nativeRegistration: "registered" as const,
      lastNativeCheckAt: null,
      lastCallbackAt: 10_000,
      lastMeasuredAt: 10_000,
      lastUploadStartedAt: 10_000,
      lastResponseHeadersAt: null,
      lastResponseBodyAt: null,
      lastAcceptedAt: null,
      lastCallbackDeadlineAt: 20_000,
      lastCallbackStage: "CALLBACK_DEADLINE" as const,
      lastCallbackStageAt: 20_000,
      lastCallbackStageElapsedMs: 10_000,
      lastAttemptStage: null,
      lastAttemptStageAt: null,
      lastAttemptStageElapsedMs: null,
      lastAppState: null,
      lastAppStateAt: null,
      acceptedOutcomeIds: [],
      lastResponseAt: null,
      lastStoredAt: null,
      lastErrorCode: CALLBACK_DEADLINE_ERROR,
      lastErrorAt: 20_000,
      attemptCount: 1,
      storedCount: 0,
      ignoredCount: 0,
      finalizedAt: null,
    };
    expect(locationRuntimeStatusFromDiagnostics(diagnostics, 70_000)).toEqual({
      serverStatus: "error",
      serverError: "위치 전송 시간 제한으로 저장 여부를 확인하지 못했습니다.",
    });
  });
});
