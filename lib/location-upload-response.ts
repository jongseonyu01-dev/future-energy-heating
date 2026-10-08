export interface JsonResponseLike {
  json(): Promise<unknown>;
}

export type BoundedJsonResult =
  | { kind: "JSON"; value: unknown }
  | { kind: "TIMEOUT" }
  | { kind: "INVALID" };

/**
 * fetch resolving only proves headers arrived. Bound body parsing separately so
 * a stalled response body cannot keep the single latest-only uploader occupied.
 */
export async function parseJsonWithin(
  response: JsonResponseLike,
  timeoutMs: number,
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout"> = globalThis,
): Promise<BoundedJsonResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<BoundedJsonResult>((resolve) => {
      timeoutId = timers.setTimeout(() => resolve({ kind: "TIMEOUT" }), timeoutMs);
    });
    const parsed = response.json()
      .then((value) => ({ kind: "JSON" as const, value }))
      .catch(() => ({ kind: "INVALID" as const }));
    return await Promise.race([parsed, timeout]);
  } finally {
    if (timeoutId !== null) timers.clearTimeout(timeoutId);
  }
}
