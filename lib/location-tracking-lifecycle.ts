/**
 * Shared, platform-neutral lifecycle coordinator for one customer location share.
 *
 * Every restore/adoption read is fenced by a generation captured before the await.
 * A terminal response may only stop the exact state and generation that produced it;
 * it can never turn a later customer share off.
 */
export interface TrackingLifecycleState {
  token: string;
  requestId: number;
  technicianUserId: number;
  technicianId: number;
  startedAt: number;
  trackingUrl: string | null;
}

export type TrackingStopReason = "도착완료" | "업무취소";

export function sameTrackingLifecycleState(
  left: TrackingLifecycleState | null | undefined,
  right: TrackingLifecycleState | null | undefined,
): boolean {
  return Boolean(left && right
    && left.token === right.token
    && left.requestId === right.requestId
    && left.technicianUserId === right.technicianUserId
    && left.technicianId === right.technicianId
    && left.startedAt === right.startedAt);
}

/** Rejects a delayed notification action that belongs to a previous customer share. */
export function matchesTrackingStopAction(
  state: TrackingLifecycleState | null | undefined,
  data: unknown,
): boolean {
  if (!state || !data || typeof data !== "object") return false;
  const candidate = data as { trackingControl?: unknown; requestId?: unknown; startedAt?: unknown };
  return candidate.trackingControl === "stop"
    && candidate.requestId === state.requestId
    && candidate.startedAt === state.startedAt;
}

export interface TrackingLifecycleAdapter<T extends TrackingLifecycleState> {
  read: () => Promise<T | null>;
  save: (state: T) => Promise<void>;
  clearIfSame: (state: T) => Promise<void>;
  showControlNotification: (state: T) => Promise<void>;
  clearControlNotification: (state: T | null) => Promise<void>;
  startNativeCollection: () => Promise<void>;
  stopNativeCollection: () => Promise<void>;
  onStateChanged: (state: T | null) => void;
}

/**
 * Native start/stop and notification changes are serialized. `generation` is
 * advanced synchronously before any local shutdown await, so late A callbacks
 * cannot clear storage or stop native collection belonging to replacement B.
 */
export class TrackingLifecycleCoordinator<T extends TrackingLifecycleState> {
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private intent: T | null = null;

  public constructor(private readonly adapter: TrackingLifecycleAdapter<T>) {}

  public currentIntent(): T | null {
    return this.intent;
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private owns(state: T, generation: number): boolean {
    return generation === this.generation && sameTrackingLifecycleState(this.intent, state);
  }

  public invalidate(state?: T | null): void {
    this.generation += 1;
    if (!state || sameTrackingLifecycleState(this.intent, state)) this.intent = null;
  }

  /** Rechecks generation and intent after asynchronous storage reads. */
  public async isCurrent(state: T, expectedGeneration = this.generation): Promise<boolean> {
    if (!this.owns(state, expectedGeneration)) return false;
    const persisted = await this.adapter.read();
    return this.owns(state, expectedGeneration) && sameTrackingLifecycleState(persisted, state);
  }

  private beginStop(state: T): Promise<T> {
    // Atomic section: no await before invalidating the exact captured owner.
    this.generation += 1;
    this.intent = null;
    return this.enqueue(async () => {
      await this.adapter.clearIfSame(state);
      await this.adapter.clearControlNotification(state);
      await this.adapter.stopNativeCollection();
      this.adapter.onStateChanged(null);
      return state;
    });
  }

  /**
   * A cold runtime may have no in-memory intent while a restore/adoption read is
   * pending. Invalidate synchronously before its second stored-state read, then
   * stop only when no explicit replacement share has claimed a newer generation.
   */
  private stopColdStored(): Promise<T | null> {
    const coldStopGeneration = ++this.generation;
    return this.enqueue(async () => {
      if (coldStopGeneration !== this.generation || this.intent) return null;
      const state = await this.adapter.read();
      if (!state || coldStopGeneration !== this.generation || this.intent) return null;
      // No await occurs between this final ownership check and local invalidation.
      this.generation += 1;
      await this.adapter.clearIfSame(state);
      await this.adapter.clearControlNotification(state);
      await this.adapter.stopNativeCollection();
      this.adapter.onStateChanged(null);
      return state;
    });
  }

  public async start(state: T, options: { restore?: boolean; expectedGeneration?: number } = {}): Promise<boolean> {
    const expectedGeneration = options.expectedGeneration;
    if (expectedGeneration !== undefined && expectedGeneration !== this.generation) return false;
    const startGeneration = ++this.generation;
    this.intent = state;

    return this.enqueue(async () => {
      try {
        if (!options.restore) await this.adapter.save(state);
        if (!this.owns(state, startGeneration)) {
          await this.adapter.clearIfSame(state);
          return false;
        }

        await this.adapter.showControlNotification(state);
        if (!this.owns(state, startGeneration)) {
          await this.adapter.clearControlNotification(state);
          await this.adapter.clearIfSame(state);
          return false;
        }

        await this.adapter.startNativeCollection();
        if (!this.owns(state, startGeneration)) {
          await this.adapter.stopNativeCollection();
          await this.adapter.clearControlNotification(state);
          await this.adapter.clearIfSame(state);
          return false;
        }

        this.adapter.onStateChanged(state);
        return true;
      } catch (error) {
        const stillOwnsRuntime = this.owns(state, startGeneration);
        if (stillOwnsRuntime) {
          this.intent = null;
          this.generation += 1;
          await this.adapter.stopNativeCollection();
          await this.adapter.clearControlNotification(state);
        }
        await this.adapter.clearIfSame(state);
        if (stillOwnsRuntime) this.adapter.onStateChanged(null);
        throw error;
      }
    });
  }

  /**
   * Restore owns both the initial storage read and its later enqueue boundary.
   * A stop/logout/new start while `read()` is pending changes generation, so the
   * stale saved A is never passed to `startNativeCollection()`.
   */
  public async restoreForUser(userId: number): Promise<T | null> {
    const readGeneration = this.generation;
    const state = await this.adapter.read();
    if (!state) return null;
    if (state.technicianUserId !== userId) {
      if (readGeneration === this.generation && !this.intent) {
        this.intent = state;
        await this.beginStop(state);
      }
      return null;
    }
    if (readGeneration !== this.generation) return null;
    if (this.intent) return sameTrackingLifecycleState(this.intent, state) ? state : null;
    const restored = await this.start(state, { restore: true, expectedGeneration: readGeneration });
    return restored ? state : null;
  }

  /**
   * Adopt a persisted session for a fresh headless TaskManager JS runtime.
   * The existing Android foreground service is already running, so this does not
   * start native collection again. The caller must still validate its bearer at
   * the server before an update can be accepted.
   */
  public async adoptStoredForHeadlessTask(): Promise<T | null> {
    const readGeneration = this.generation;
    const state = await this.adapter.read();
    if (!state || readGeneration !== this.generation) return null;
    if (this.intent) return sameTrackingLifecycleState(this.intent, state) ? state : null;
    this.generation += 1;
    this.intent = state;
    return state;
  }

  /** Stops the state currently owned in memory, invalidating local work first. */
  public async stopCurrent(): Promise<T | null> {
    const target = this.intent;
    return target ? this.beginStop(target) : this.stopColdStored();
  }

  /**
   * Stops only if a terminal response still belongs to the exact active state.
   * The post-read ownership test and synchronous invalidation form one atomic
   * application step; a late A response therefore cannot stop B.
   */
  public async stopIfCurrent(state: T): Promise<T | null> {
    const responseGeneration = this.generation;
    if (!(await this.isCurrent(state, responseGeneration))) return null;
    if (!this.owns(state, responseGeneration)) return null;
    return this.beginStop(state);
  }

  /** Applies an explicitly classified terminal server response to its exact owner only. */
  public async stopForTerminalResponse(state: T): Promise<T | null> {
    return this.stopIfCurrent(state);
  }

  /**
   * Handles a cold notification action with no in-memory intent. A stored state
   * read that races with a new start is rejected before it can stop the shared
   * Android foreground service.
   */
  public async stopStored(): Promise<T | null> {
    const readGeneration = this.generation;
    const state = await this.adapter.read();
    if (!state || readGeneration !== this.generation || this.intent) return null;
    this.intent = state;
    return this.beginStop(state);
  }

  /** Stops a cold stored state only when its notification/request predicate matches. */
  public async stopStoredIf(predicate: (state: T) => boolean): Promise<T | null> {
    const readGeneration = this.generation;
    const state = await this.adapter.read();
    if (!state || !predicate(state) || readGeneration !== this.generation || this.intent) return null;
    this.intent = state;
    return this.beginStop(state);
  }

  /**
   * Stops a previously-read orphan only when storage still contains that exact
   * state and no newer in-memory share has been claimed. This is intentionally
   * separate from `stopCurrent()`: an old provider effect must never turn a B
   * foreground service off merely because it finished reading A late.
   */
  public async stopStoredExact(state: T): Promise<T | null> {
    const readGeneration = this.generation;
    const persisted = await this.adapter.read();
    if (!sameTrackingLifecycleState(persisted, state)
      || readGeneration !== this.generation
      || this.intent) return null;
    this.intent = state;
    return this.beginStop(state);
  }
}
