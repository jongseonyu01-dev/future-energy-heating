import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSms, SMS_REQUEST_TIMEOUT_MS } from "../server/notification";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Solapi request timeout", () => {
  it("aborts a hung request and returns a deterministic failure", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SOLAPI_API_KEY", "test-key");
    vi.stubEnv("SOLAPI_API_SECRET", "test-secret");
    vi.stubEnv("SOLAPI_SENDER", "03180427310");

    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }));

    const pending = sendSms("01012345678", "timeout test");
    await vi.advanceTimersByTimeAsync(SMS_REQUEST_TIMEOUT_MS);
    const result = await pending;

    expect(capturedSignal?.aborted).toBe(true);
    expect(result.result).toBe("FAILED");
    expect(result.errorMessage).toContain("10초");
  });
});
