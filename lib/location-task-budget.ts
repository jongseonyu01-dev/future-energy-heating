/**
 * Creates a deadline for the JavaScript portion of one native TaskManager
 * callback. Each awaited boundary must recalculate the remaining time; a
 * Promise.race alone would return early while its original I/O kept running.
 */
export function createTaskDeadline(budgetMs: number, now = Date.now()): number {
  return Number.isFinite(budgetMs) && budgetMs > 0 ? now + budgetMs : now;
}

export function remainingTaskBudgetMs(deadlineAt: number, now = Date.now()): number {
  if (!Number.isFinite(deadlineAt)) return 0;
  return Math.max(0, deadlineAt - now);
}

export type TaskDeadlineResult<T> =
  | { kind: "VALUE"; value: T }
  | { kind: "EXPIRED" };

/**
 * A callback-local cancellation fence. JavaScript cannot cancel an already
 * submitted native storage or network promise, so callers must pass
 * `isActive()` into work that could otherwise perform a late state change.
 */
export class TaskCallbackDeadlineFence {
  private expired = false;

  public constructor(
    public readonly deadlineAt: number,
    private readonly timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout"> = globalThis,
    private readonly now: () => number = Date.now,
  ) {}

  public remainingMs(): number {
    return this.isActive() ? remainingTaskBudgetMs(this.deadlineAt, this.now()) : 0;
  }

  public isActive(): boolean {
    if (!this.expired && remainingTaskBudgetMs(this.deadlineAt, this.now()) <= 0) this.expired = true;
    return !this.expired;
  }

  public expire(): void {
    this.expired = true;
  }

  /**
   * Returns at the callback deadline even when `operation` never settles. A
   * late operation receives no authority through this fence: it must recheck
   * `isActive()` before it starts I/O or emits diagnostic/native state.
   */
  public async run<T>(operation: () => Promise<T>): Promise<TaskDeadlineResult<T>> {
    const timeoutMs = this.remainingMs();
    if (timeoutMs <= 0) return { kind: "EXPIRED" };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<TaskDeadlineResult<T>>((resolve) => {
      timeoutId = this.timers.setTimeout(() => {
        this.expire();
        resolve({ kind: "EXPIRED" });
      }, timeoutMs);
    });
    const work = Promise.resolve()
      .then(operation)
      .then((value): TaskDeadlineResult<T> => (this.isActive() ? { kind: "VALUE", value } : { kind: "EXPIRED" }))
      .catch((error: unknown): TaskDeadlineResult<T> => {
        if (!this.isActive()) return { kind: "EXPIRED" };
        throw error;
      });

    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timeoutId !== null) this.timers.clearTimeout(timeoutId);
    }
  }
}
