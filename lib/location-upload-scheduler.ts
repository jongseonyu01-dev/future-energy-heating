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

type Completion = {
  resolve: () => void;
  reject: (reason: unknown) => void;
};

type PendingOperation<T> = {
  scope: string;
  value: T;
  execute: (value: T) => Promise<void>;
  completion: Completion;
};

function createCompletion(): { promise: Promise<void>; completion: Completion } {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, completion: { resolve, reject } };
}

/**
 * A single-consumer queue retaining only the newest pending update.
 *
 * `enqueue()` resolves when *that callback's own sample* is either processed or
 * superseded. It intentionally does not return the shared drain Promise: a
 * later B callback must never extend an earlier A TaskManager callback beyond
 * A's own deadline. The active operation is never cancelled; caller-level
 * generation fencing prevents an old completion from affecting a replacement
 * location session.
 */
export class LatestOnlyUploadQueue<T extends { measuredAt: number }> {
  private pending: PendingOperation<T> | null = null;
  private draining: Promise<void> | null = null;

  public enqueue(scope: string, value: T, execute: (value: T) => Promise<void>): Promise<void> {
    const { promise, completion } = createCompletion();
    const previous = this.pending;

    // A different location-session/user scope replaces stale pending work. For
    // the same scope, delayed batches may only replace pending work with a newer
    // measurement. A discarded callback is complete from its own perspective.
    if (!previous || previous.scope !== scope || value.measuredAt > previous.value.measuredAt) {
      if (previous) previous.completion.resolve();
      this.pending = { scope, value, execute, completion };
    } else {
      completion.resolve();
    }

    if (!this.draining) this.draining = this.drain();
    return promise;
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
        try {
          await current.execute(current.value);
          // Resolve the caller before draining a later pending callback. This is
          // the callback-local completion boundary used by TaskManager.
          current.completion.resolve();
        } catch (error) {
          current.completion.reject(error);
        }
      }
    } finally {
      this.draining = null;
      // No await lies between the loop exit and this assignment. A subsequent
      // enqueue therefore starts a fresh drain rather than being lost.
    }
  }
}
