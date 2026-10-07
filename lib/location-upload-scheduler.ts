/**
 * Platform-neutral queue and response helpers for one technician's location
 * uploader. The native TaskManager callback can arrive in overlapping batches;
 * only one HTTP upload runs at a time and at most the newest pending sample is
 * retained.
 */

export type TimestampedLocation<T = unknown> = T & {
  timestamp?: unknown;
};

export type LocationUpdateResponseBody = {
  success?: unknown;
  accepted?: unknown;
  updatedAt?: unknown;
  timingSource?: unknown;
  error?: unknown;
  code?: unknown;
};

export type LocationUpdateDisposition =
  | "accepted"
  | "ignored"
  | "retryable"
  | "terminal"
  | "rejected";

/**
 * Selects the newest measurement that is still eligible for the server's
 * five-minute freshness contract. A TaskManager batch is not assumed ordered.
 */
export function selectNewestFreshLocation<T extends TimestampedLocation>(
  locations: readonly T[],
  now: number,
  maximumAgeMs: number,
): T | null {
  let newest: T | null = null;
  for (const location of locations) {
    const timestamp = Number(location?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || now - timestamp > maximumAgeMs) continue;
    if (!newest || timestamp > Number(newest.timestamp)) newest = location;
  }
  return newest;
}

/**
 * Classifies the explicit production response contract. HTTP 200 alone is not
 * considered proof that a new customer-visible location was persisted.
 */
export function classifyLocationUpdateResponse(
  status: number,
  payload: LocationUpdateResponseBody | null,
): LocationUpdateDisposition {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (status === 401 || status === 403 || status === 404 || status === 409) return "terminal";
  if (status === 400 && ["LOCATION_SESSION_TERMINATED", "LOCATION_SESSION_EXPIRED", "LOCATION_ASSIGNMENT_CHANGED"].includes(code)) {
    return "terminal";
  }
  if (status === 408 || status === 429 || status >= 500) return "retryable";
  if (status < 200 || status >= 300) return "rejected";
  if (payload?.success !== true) return "rejected";
  if (payload.accepted === true) return "accepted";
  if (payload.accepted === false) return "ignored";
  return "rejected";
}

/**
 * A single-consumer queue retaining only the newest pending update. The active
 * operation is never cancelled; caller-level generation fencing prevents a
 * completed old operation from affecting a replacement location session.
 */
export class LatestOnlyUploadQueue<T extends { measuredAt: number }> {
  private pending: { scope: string; value: T; execute: (value: T) => Promise<void> } | null = null;
  private draining: Promise<void> | null = null;

  public enqueue(scope: string, value: T, execute: (value: T) => Promise<void>): Promise<void> {
    // A different location-session/user scope replaces a stale pending callback
    // regardless of device timestamp. Within the same scope, delayed TaskManager
    // batches must never overwrite a newer sample already waiting to send.
    if (!this.pending || this.pending.scope !== scope || value.measuredAt > this.pending.value.measuredAt) {
      this.pending = { scope, value, execute };
    }
    if (!this.draining) this.draining = this.drain();
    return this.draining;
  }

  /** Allows retry code to yield to a fresher queued sample. */
  public hasNewerPending(scope: string, measuredAt: number): boolean {
    return Boolean(this.pending && this.pending.scope === scope && this.pending.value.measuredAt > measuredAt);
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const current = this.pending;
        this.pending = null;
        await current.execute(current.value);
      }
    } finally {
      this.draining = null;
      // No await lies between the loop exit and this assignment. A subsequent
      // enqueue therefore starts a fresh drain rather than being lost.
    }
  }
}
