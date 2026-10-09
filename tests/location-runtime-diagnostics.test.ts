import { describe, expect, it, vi } from "vitest";

import {
  LocationRuntimeDiagnosticsStore,
  type KeyValueStorage,
} from "../lib/location-runtime-diagnostics";
import { LatestOnlyUploadQueue } from "../lib/location-upload-scheduler";
import { parseJsonWithin } from "../lib/location-upload-response";
import { createTaskDeadline, remainingTaskBudgetMs, TaskCallbackDeadlineFence } from "../lib/location-task-budget";
import { locationRuntimeStatusFromDiagnostics } from "../lib/location-runtime-status";

const stateA = {
  token: "a".repeat(43), requestId: 91, technicianUserId: 41, technicianId: 11, startedAt: 91_000, trackingUrl: null,
};
const stateB = {
  token: "b".repeat(43), requestId: 92, technicianUserId: 42, technicianId: 12, startedAt: 92_000, trackingUrl: null,
};

function memoryStorage(): KeyValueStorage & { raw: string | null } {
  let raw: string | null = null;
  return {
    get raw() { return raw; },
    getItem: async () => raw,
    setItem: async (_key, value) => { raw = value; },
  };
}

describe("세션별 위치 런타임 진단", () => {
  it("callback·응답·저장은 복귀 뒤에도 동일 세션에서만 보존한다", async () => {
    const storage = memoryStorage();
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);
    await diagnostics.update(stateA, (current) => ({
      ...current,
      nativeRegistration: "registered",
      lastNativeCheckAt: 1_010,
      lastCallbackAt: 1_020,
      lastMeasuredAt: 1_015,
      lastUploadStartedAt: 1_030,
      lastResponseAt: 1_040,
      lastStoredAt: 1_035,
      attemptCount: current.attemptCount + 1,
      storedCount: current.storedCount + 1,
    }));
    const reloaded = new LocationRuntimeDiagnosticsStore(storage);
    expect(await reloaded.read(stateA)).toMatchObject({
      nativeRegistration: "registered",
      lastCallbackAt: 1_020,
      lastStoredAt: 1_035,
      attemptCount: 1,
      storedCount: 1,
    });

    await diagnostics.begin(stateB, 2_000);
    expect(await diagnostics.patch(stateA, { lastErrorCode: "OLD_A" })).toBeNull();
    expect((await diagnostics.read(stateB))?.lastErrorCode).toBeNull();
  });

  it("등록 여부를 callback 또는 저장 성공으로 승격하지 않는다", async () => {
    const storage = memoryStorage();
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);
    const next = await diagnostics.patch(stateA, { nativeRegistration: "registered", lastNativeCheckAt: 1_050 });
    expect(next).toMatchObject({ nativeRegistration: "registered", lastCallbackAt: null, lastStoredAt: null });
  });

  it("세션을 아직 채택하지 못한 callback은 A/B 진단에 귀속하지 않는다", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);
    await expect(diagnostics.recordUnboundTaskEvent("NO_CREDENTIAL", 1_100)).resolves.toMatchObject({
      schemaVersion: 1,
      observedAt: 1_100,
      code: "NO_CREDENTIAL",
    });
    await expect(diagnostics.read(stateA)).resolves.toMatchObject({
      requestId: stateA.requestId,
      lastCallbackAt: null,
      lastErrorCode: null,
    });
    await expect(diagnostics.readUnboundTaskEvent()).resolves.toMatchObject({
      observedAt: 1_100,
      code: "NO_CREDENTIAL",
    });
  });

  it("late A immutable write는 더 늦게 발생한 B unbound 증거를 덮지 않는다", async () => {
    const values = new Map<string, string>();
    const aWriteStarted = Promise.withResolvers<void>();
    const aGate = Promise.withResolvers<void>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        const parsed = JSON.parse(value) as { code?: string };
        if (parsed.code === "TASK_NATIVE_ERROR") {
          aWriteStarted.resolve();
          await aGate.promise;
        }
        values.set(key, value);
      },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    const writeA = diagnostics.recordUnboundTaskEvent("TASK_NATIVE_ERROR", 10_000);
    await aWriteStarted.promise;
    await diagnostics.recordUnboundTaskEvent("NO_FRESH_MEASUREMENT", 10_751);
    aGate.resolve();
    await writeA;

    await expect(diagnostics.readUnboundTaskEvent()).resolves.toMatchObject({
      observedAt: 10_751,
      code: "NO_FRESH_MEASUREMENT",
    });
    expect([...values.keys()].filter((key) => key.includes("_task_event_v2:"))).toHaveLength(2);
  });

  it("서버 accepted outcome은 지연된 session journal deadline보다 우선하고 B에 귀속되지 않는다", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 10_000);
    await diagnostics.recordAcceptedOutcome(stateA, {
      callbackAt: 10_100,
      attemptStartedAt: 10_120,
      responseHeadersAt: 10_130,
      responseBodyAt: 10_140,
      acceptedAt: 10_140,
      storedAt: 10_140,
    }, 10_140);
    await diagnostics.patch(stateA, {
      lastCallbackAt: 10_100,
      lastErrorCode: "CALLBACK_DEADLINE_EXCEEDED",
      lastErrorAt: 20_000,
      lastCallbackDeadlineAt: 20_000,
    });

    await expect(diagnostics.read(stateA)).resolves.toMatchObject({
      lastAcceptedAt: 10_140,
      lastResponseHeadersAt: 10_130,
      lastResponseBodyAt: 10_140,
      lastStoredAt: 10_140,
      lastErrorCode: null,
      storedCount: 1,
    });

    await diagnostics.begin(stateB, 30_000);
    await expect(diagnostics.read(stateB)).resolves.toMatchObject({
      lastAcceptedAt: null,
      lastStoredAt: null,
      storedCount: 0,
    });
  });

  it("새 accepted outcome 복원은 같은 세션의 과거 network 오류만 해소한다", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 100_000);
    await diagnostics.patch(stateA, {
      lastCallbackAt: 100_100,
      lastErrorCode: "NETWORK_TIMEOUT",
      lastErrorAt: 100_200,
    });
    await diagnostics.recordAcceptedOutcome(stateA, {
      callbackAt: 100_100,
      attemptStartedAt: 100_110,
      responseHeadersAt: 100_320,
      responseBodyAt: 100_330,
      acceptedAt: 100_330,
      storedAt: 100_330,
    }, 100_330);
    await expect(new LocationRuntimeDiagnosticsStore(storage).read(stateA)).resolves.toMatchObject({
      lastStoredAt: 100_330,
      storedCount: 1,
      lastErrorCode: null,
    });

    await diagnostics.patch(stateA, {
      lastCallbackAt: 100_400,
      lastErrorCode: "NETWORK_TIMEOUT",
      lastErrorAt: 100_450,
    });
    await expect(new LocationRuntimeDiagnosticsStore(storage).read(stateA)).resolves.toMatchObject({
      lastStoredAt: 100_330,
      storedCount: 1,
      lastErrorCode: "NETWORK_TIMEOUT",
      lastErrorAt: 100_450,
    });
  });

  it("checkpoint 전 30개 accepted outcome은 중단·반복 복원 뒤에도 정확히 한 번 누적한다", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      removeItem: async (key) => { values.delete(key); },
    };
    const writer = new LocationRuntimeDiagnosticsStore(storage);
    await writer.begin(stateA, 200_000);
    await Promise.all(Array.from({ length: 30 }, async (_, index) => {
      const at = 200_100 + index;
      await writer.recordAcceptedOutcome(stateA, {
        callbackAt: at,
        attemptStartedAt: at,
        responseHeadersAt: at,
        responseBodyAt: at,
        acceptedAt: at,
        storedAt: at,
      }, at);
    }));
    const beforeCheckpoint = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(beforeCheckpoint).toMatchObject({ storedCount: 30, lastStoredAt: 200_129 });
    const repeatedRead = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(repeatedRead).toMatchObject({ storedCount: 30, lastStoredAt: 200_129 });

    // A normal summary update checkpoints all merged immutable events. Only
    // after that durable exact count exists may their individual keys be pruned.
    await writer.patch(stateA, { nativeRegistration: "registered", lastNativeCheckAt: 200_200 });
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    const restored = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(restored).toMatchObject({ storedCount: 30, lastStoredAt: 200_129 });
    expect([...values.keys()].filter((key) => key.includes("_accepted_outcome_v1:"))).toHaveLength(0);
  });

  it("checkpoint 뒤 늦게 도착한 accepted outcome도 정확히 한 번 복원하고 그 뒤에만 정리한다", async () => {
    const values = new Map<string, string>();
    const lateStarted = Promise.withResolvers<void>();
    const lateGate = Promise.withResolvers<void>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        const parsed = JSON.parse(value) as { acceptedAt?: number };
        if (parsed.acceptedAt === 300_100) {
          lateStarted.resolve();
          await lateGate.promise;
        }
        values.set(key, value);
      },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      removeItem: async (key) => { values.delete(key); },
    };
    const writer = new LocationRuntimeDiagnosticsStore(storage);
    await writer.begin(stateA, 300_000);
    const delayedA = writer.recordAcceptedOutcome(stateA, {
      callbackAt: 300_100, attemptStartedAt: 300_100, responseHeadersAt: 300_100,
      responseBodyAt: 300_100, acceptedAt: 300_100, storedAt: 300_100,
    }, 300_100);
    await lateStarted.promise;
    await writer.recordAcceptedOutcome(stateA, {
      callbackAt: 300_200, attemptStartedAt: 300_200, responseHeadersAt: 300_200,
      responseBodyAt: 300_200, acceptedAt: 300_200, storedAt: 300_200,
    }, 300_200);
    await writer.patch(stateA, { nativeRegistration: "registered" });
    lateGate.resolve();
    await delayedA;

    const beforeLateCheckpoint = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(beforeLateCheckpoint).toMatchObject({ storedCount: 2, lastStoredAt: 300_200 });
    expect([...values.keys()].filter((key) => key.includes("_accepted_outcome_v1:"))).toHaveLength(1);

    await writer.patch(stateA, { lastNativeCheckAt: 300_300 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const restored = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(restored).toMatchObject({ storedCount: 2, lastStoredAt: 300_200 });
    expect([...values.keys()].filter((key) => key.includes("_accepted_outcome_v1:"))).toHaveLength(0);
  });

  it("같은 storage의 두 Store가 summary·compaction과 교차해도 accepted 증거를 0/null로 되돌리지 않는다", async () => {
    const values = new Map<string, string>();
    const firstSummaryStarted = Promise.withResolvers<void>();
    const firstSummaryGate = Promise.withResolvers<void>();
    let holdFirstSummary = true;
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        const parsed = JSON.parse(value) as { storedCount?: number };
        if (holdFirstSummary && key.includes("location_tracking_runtime_diagnostics_v2:") && parsed.storedCount === 1) {
          holdFirstSummary = false;
          firstSummaryStarted.resolve();
          await firstSummaryGate.promise;
        }
        values.set(key, value);
      },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      removeItem: async (key) => { values.delete(key); },
    };
    const first = new LocationRuntimeDiagnosticsStore(storage);
    const second = new LocationRuntimeDiagnosticsStore(storage);
    await first.begin(stateA, 400_000);
    await first.recordAcceptedOutcome(stateA, {
      callbackAt: 400_100, attemptStartedAt: 400_100, responseHeadersAt: 400_100,
      responseBodyAt: 400_100, acceptedAt: 400_100, storedAt: 400_100,
    }, 400_100);
    const checkpointing = first.patch(stateA, { nativeRegistration: "registered" });
    await firstSummaryStarted.promise;
    let secondSettled = false;
    const staleSecond = second.patch(stateA, { lastAppState: "background", lastAppStateAt: 400_200 })
      .then(() => { secondSettled = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(secondSettled).toBe(false);
    firstSummaryGate.resolve();
    await Promise.all([checkpointing, staleSecond]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect([...values.keys()].filter((key) => key.includes("_accepted_outcome_v1:"))).toHaveLength(0);

    // The second Store proceeds only after the first checkpoint/compaction and
    // must retain the durable accepted floor instead of writing 0/null.
    const restored = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(restored).toMatchObject({ storedCount: 1, lastAcceptedAt: 400_100, lastStoredAt: 400_100 });
  });

  it("summary가 없는 정상 callback도 fetch 뒤 비차단 update로 callback·measurement를 복원한다", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.recordAcceptedOutcome(stateA, {
      callbackAt: 500_100, attemptStartedAt: 500_110, responseHeadersAt: 500_120,
      responseBodyAt: 500_130, acceptedAt: 500_130, storedAt: 500_130,
    }, 500_130);
    await diagnostics.update(stateA, (current) => ({
      ...current,
      lastCallbackAt: 500_100,
      lastMeasuredAt: 500_090,
      lastUploadStartedAt: 500_110,
      attemptCount: current.attemptCount + 1,
    }));
    await expect(new LocationRuntimeDiagnosticsStore(storage).read(stateA)).resolves.toMatchObject({
      lastCallbackAt: 500_100,
      lastMeasuredAt: 500_090,
      attemptCount: 1,
      storedCount: 1,
      lastStoredAt: 500_130,
    });
  });

  it("복귀 뒤에도 최근 오류를 보이고 오래된 uploading은 유지하지 않는다", async () => {
    const storage = memoryStorage();
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);
    await diagnostics.patch(stateA, {
      lastUploadStartedAt: 2_000,
      lastErrorCode: "NETWORK_TIMEOUT",
      lastErrorAt: 2_010,
    });
    const restored = await new LocationRuntimeDiagnosticsStore(storage).read(stateA);
    expect(restored).not.toBeNull();
    expect(locationRuntimeStatusFromDiagnostics(restored!, 30_000)).toEqual({
      serverStatus: "error",
      serverError: "최근 위치 전송 오류: NETWORK_TIMEOUT",
    });

    await diagnostics.update(stateA, (current) => ({
      ...current,
      lastResponseAt: 3_000,
      lastStoredAt: 3_000,
      lastErrorCode: null,
      lastErrorAt: null,
      storedCount: current.storedCount + 1,
    }));
    const acceptedAfterError = await diagnostics.read(stateA);
    expect(locationRuntimeStatusFromDiagnostics(acceptedAfterError!, 3_100)).toEqual({
      serverStatus: "stored",
      serverError: null,
    });

    await diagnostics.patch(stateA, {
      lastStoredAt: null,
      lastUploadStartedAt: 20_000,
      lastResponseAt: null,
    });
    const staleUploading = await diagnostics.read(stateA);
    expect(locationRuntimeStatusFromDiagnostics(staleUploading!, 30_001)).toEqual({
      serverStatus: "error",
      serverError: "오래된 위치 전송 시도는 완료로 표시하지 않습니다.",
    });
  });

  it("deadline 뒤 늦게 풀린 진단 읽기는 새 write를 시작하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const readLatch = Promise.withResolvers<string | null>();
      let writes = 0;
      const storage: KeyValueStorage = {
        getItem: () => readLatch.promise,
        setItem: async () => { writes += 1; },
      };
      const fence = new TaskCallbackDeadlineFence(createTaskDeadline(10_000));
      const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
      const pending = fence.run(() => diagnostics.ensure(stateA, 1_000, () => fence.isActive()));
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual({ kind: "EXPIRED" });
      diagnostics.releaseExpiredWork();
      const next = await diagnostics.begin(stateB, 12_000, () => true);
      expect(next?.requestId).toBe(stateB.requestId);
      expect(writes).toBe(1);
      readLatch.resolve(null);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(writes).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("getAllKeys 실패를 빈 기록으로 오인해 기존 오류·카운터를 가리지 않는다", async () => {
    const values = new Map<string, string>();
    let failListing = false;
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => {
        if (failListing) throw new Error("TEMPORARY_LIST_FAILURE");
        return [...values.keys()];
      },
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await diagnostics.begin(stateA, 1_000);
    await diagnostics.update(stateA, (current) => ({
      ...current,
      attemptCount: 7,
      storedCount: 6,
      lastErrorCode: "NETWORK_TIMEOUT",
      lastErrorAt: 1_100,
    }));

    failListing = true;
    expect(await diagnostics.ensure(stateA, 1_200)).toBeNull();
    failListing = false;
    await expect(diagnostics.read(stateA)).resolves.toMatchObject({
      attemptCount: 7,
      storedCount: 6,
      lastErrorCode: "NETWORK_TIMEOUT",
    });
  });

  it("같은 밀리초에는 operation-10을 operation-9보다 최신으로 선택한다", async () => {
    const prefix = "location_tracking_runtime_diagnostics_v2:91:41:91000:";
    const base = {
      schemaVersion: 1 as const,
      requestId: stateA.requestId,
      technicianUserId: stateA.technicianUserId,
      startedAt: stateA.startedAt,
      updatedAt: 5_000,
      buildLabel: null,
      nativeRegistration: "registered" as const,
      lastNativeCheckAt: null,
      lastCallbackAt: null,
      lastMeasuredAt: null,
      lastUploadStartedAt: null,
      lastResponseAt: null,
      lastStoredAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      attemptCount: 0,
      storedCount: 0,
      ignoredCount: 0,
      finalizedAt: null,
    };
    const values = new Map<string, string>([
      [`${prefix}5000-9`, JSON.stringify({ ...base, operationId: "5000-9", attemptCount: 9 })],
      [`${prefix}5000-10`, JSON.stringify({ ...base, operationId: "5000-10", attemptCount: 10 })],
    ]);
    const storage: KeyValueStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      getAllKeys: async () => [...values.keys()],
      multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    };
    const diagnostics = new LocationRuntimeDiagnosticsStore(storage);
    await expect(diagnostics.read(stateA)).resolves.toMatchObject({ operationId: "5000-10", attemptCount: 10 });
  });
});

describe("위치 응답 본문 유한시간 경계", () => {
  it("fetch headers 뒤 response.json이 지연돼도 큐를 무한 점유하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const hanging = { json: () => new Promise<unknown>(() => {}) };
      const pending = parseJsonWithin(hanging, 500);
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toEqual({ kind: "TIMEOUT" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("정상 본문과 잘못된 본문을 구분한다", async () => {
    await expect(parseJsonWithin({ json: async () => ({ success: true }) }, 50))
      .resolves.toEqual({ kind: "JSON", value: { success: true } });
    await expect(parseJsonWithin({ json: async () => { throw new Error("bad json"); } }, 50))
      .resolves.toEqual({ kind: "INVALID" });
  });

  it("응답 본문이 지연돼도 시간제한 뒤 최신 유효 측정값이 이어진다", async () => {
    vi.useFakeTimers();
    try {
      const queue = new LatestOnlyUploadQueue<{ measuredAt: number }>();
      const completed: number[] = [];
      const first = queue.enqueue("session-A", { measuredAt: 100 }, async (sample) => {
        const result = await parseJsonWithin({ json: () => new Promise<unknown>(() => {}) }, 500);
        expect(result).toEqual({ kind: "TIMEOUT" });
        completed.push(sample.measuredAt);
      });
      const second = queue.enqueue("session-A", { measuredAt: 300 }, async (sample) => {
        completed.push(sample.measuredAt);
      });
      const superseded = queue.enqueue("session-A", { measuredAt: 200 }, async (sample) => {
        completed.push(sample.measuredAt);
      });
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all([first, second, superseded]);
      expect(completed).toEqual([100, 300]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TaskManager callback 예산", () => {
  it("native 15초 경계 전에 fetch와 본문에 남은 시간만 배정한다", () => {
    const deadline = createTaskDeadline(10_000, 1_000);
    expect(deadline).toBe(11_000);
    expect(remainingTaskBudgetMs(deadline, 4_000)).toBe(7_000);
    expect(remainingTaskBudgetMs(deadline, 12_000)).toBe(0);
  });

  it("총 deadline은 멎은 인증 await에서 반환하고 늦은 fetch를 차단한다", async () => {
    vi.useFakeTimers();
    try {
      const credentialLatch = Promise.withResolvers<void>();
      let fetchStarts = 0;
      const fence = new TaskCallbackDeadlineFence(createTaskDeadline(10_000));
      const pending = fence.run(async () => {
        await credentialLatch.promise;
        if (fence.isActive()) fetchStarts += 1;
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual({ kind: "EXPIRED" });
      credentialLatch.resolve();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(fetchStarts).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("멎은 A callback은 deadline 뒤 큐를 해제하고 B의 최신 측정을 진행시킨다", async () => {
    vi.useFakeTimers();
    try {
      const queue = new LatestOnlyUploadQueue<{ measuredAt: number }>();
      const credentialLatch = Promise.withResolvers<void>();
      const firstFence = new TaskCallbackDeadlineFence(createTaskDeadline(10_000));
      const completed: number[] = [];
      let lateAEffects = 0;
      const first = queue.enqueue("session-A", { measuredAt: 100 }, async () => {
        await firstFence.run(async () => {
          await credentialLatch.promise;
          if (firstFence.isActive()) lateAEffects += 1;
        });
      });
      const second = queue.enqueue("session-A", { measuredAt: 300 }, async (sample) => {
        completed.push(sample.measuredAt);
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.all([first, second]);
      expect(completed).toEqual([300]);
      credentialLatch.resolve();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(lateAEffects).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
