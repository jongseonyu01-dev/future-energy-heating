import { describe, expect, it, vi } from "vitest";

import {
  LocationRuntimeDiagnosticsStore,
  type KeyValueStorage,
} from "../lib/location-runtime-diagnostics";
import { LatestOnlyUploadQueue } from "../lib/location-upload-scheduler";
import { parseJsonWithin } from "../lib/location-upload-response";
import { createTaskDeadline, remainingTaskBudgetMs } from "../lib/location-task-budget";

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
});
