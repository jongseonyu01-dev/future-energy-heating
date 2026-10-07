import { describe, expect, it } from "vitest";
import {
  classifyLocationUpdateResponse,
  LatestOnlyUploadQueue,
  selectNewestFreshLocation,
} from "../lib/location-upload-scheduler";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("TaskManager 위치 배치 선택", () => {
  it("unordered batch에서 현재 시각 기준 가장 최신의 유효 측정값만 선택한다", () => {
    const now = 1_000_000;
    const selected = selectNewestFreshLocation([
      { timestamp: now - 90_000, marker: "older" },
      { timestamp: now - 2_000, marker: "newest" },
      { timestamp: now - 400_000, marker: "expired" },
    ], now, 5 * 60 * 1000);
    expect(selected?.marker).toBe("newest");
  });

  it("미래·5분 초과 측정값은 선택하지 않는다", () => {
    const now = 1_000_000;
    expect(selectNewestFreshLocation([
      { timestamp: now + 1, marker: "future" },
      { timestamp: now - 300_001, marker: "stale" },
    ], now, 5 * 60 * 1000)).toBeNull();
  });
});

describe("위치 업데이트 응답계약", () => {
  it("2xx라도 accepted:false는 새 위치 저장 성공으로 처리하지 않는다", () => {
    expect(classifyLocationUpdateResponse(200, { success: true, accepted: true, timingSource: "client" })).toBe("accepted");
    expect(classifyLocationUpdateResponse(200, { success: true, accepted: false, timingSource: "client" })).toBe("ignored");
    expect(classifyLocationUpdateResponse(200, { success: true })).toBe("rejected");
  });

  it("401·403·404는 종료 경계, 5xx와 429는 제한 재시도 대상으로 분류한다", () => {
    expect(classifyLocationUpdateResponse(401, null)).toBe("terminal");
    expect(classifyLocationUpdateResponse(403, null)).toBe("terminal");
    expect(classifyLocationUpdateResponse(404, null)).toBe("terminal");
    expect(classifyLocationUpdateResponse(429, null)).toBe("retryable");
    expect(classifyLocationUpdateResponse(503, null)).toBe("retryable");
  });
});

describe("최신 한 건 위치 업로드 큐", () => {
  it("첫 전송 중 들어온 여러 위치 중 최신 한 건만 직렬 전송한다", async () => {
    const queue = new LatestOnlyUploadQueue<{ measuredAt: number; marker: string }>();
    const firstGate = deferred<void>();
    const calls: string[] = [];
    const first = queue.enqueue({ measuredAt: 1, marker: "A" }, async (sample) => {
      calls.push(sample.marker);
      await firstGate.promise;
    });
    await tick();
    const second = queue.enqueue({ measuredAt: 2, marker: "B" }, async (sample) => { calls.push(sample.marker); });
    const third = queue.enqueue({ measuredAt: 3, marker: "C" }, async (sample) => { calls.push(sample.marker); });
    expect(queue.hasNewerPending(1)).toBe(true);
    firstGate.resolve();
    await Promise.all([first, second, third]);
    expect(calls).toEqual(["A", "C"]);
  });
});
