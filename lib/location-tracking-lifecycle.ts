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

const TERMINAL_CLEANUP_STEP_BUDGET_MS = 1_500;

async function settleWithin<T>(operation: () => Promise<T>, budgetMs = TERMINAL_CLEANUP_STEP_BUDGET_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs); }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

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
  /** Legacy pointer cleanup must recheck the authorization guard before mutation. */
  clearIfSame: (state: T, isStillAuthorized?: () => boolean) => Promise<void>;
  /** Persists a per-session inactive marker before best-effort cleanup. */
  markInactive?: (state: T, isStillAuthorized?: () => boolean) => Promise<void>;
  /** Rejects a terminal session before restore or headless adoption. */
  isInactive?: (state: T, isStillAuthorized?: () => boolean) => Promise<boolean>;
  /**
   * Records a reversible local pause after permission is denied. Unlike an
   * inactive marker, a matching saved session may resume after approval.
   */
  markPermissionPending?: (state: T, isStillAuthorized?: () => boolean) => Promise<void>;
  /** Clears only a matching reversible pause after native collection restarts. */
  clearPermissionPending?: (state: T, isStillAuthorized?: () => boolean) => Promise<void>;
  /** Blocks headless adoption until foreground approval explicitly restores it. */
  isPermissionPending?: (state: T, isStillAuthorized?: () => boolean) => Promise<boolean>;
  showControlNotification: (state: T) => Promise<void>;
  clearControlNotification: (state: T | null, isStillAuthorized?: () => boolean) => Promise<void>;
  /** Registration state only; it is not proof of a future callback or server persistence. */
  isNativeCollectionRegistered?: () => Promise<boolean>;
  startNativeCollection: () => Promise<void>;
  /** A terminal cleanup may pass a guard so a late A native read cannot stop B. */
  stopNativeCollection: (isStillAuthorized?: () => boolean) => Promise<void>;
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

  /** Captured before an await so a stale preparation cannot publish over B. */
  public captureGeneration(): number {
    return this.generation;
  }

  public isGenerationCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private owns(state: T, generation: number): boolean {
    return generation === this.generation && sameTrackingLifecycleState(this.intent, state);
  }

  private async isInactive(state: T, guard: () => boolean = () => true): Promise<boolean> {
    if (!guard()) return true;
    if (!this.adapter.isInactive) return false;
    try {
      return Boolean(await this.adapter.isInactive(state, guard));
    } catch {
      // A failed terminal-marker read is fail-closed: duplicate location uploads
      // are less safe than requiring an explicit new start.
      return true;
    }
  }

  private async markInactive(state: T, guard: () => boolean = () => true): Promise<void> {
    if (!guard() || !this.adapter.markInactive) return;
    await this.adapter.markInactive(state, guard).catch(() => undefined);
  }

  private async isPermissionPending(state: T, guard: () => boolean = () => true): Promise<boolean> {
    if (!guard()) return true;
    if (!this.adapter.isPermissionPending) return false;
    try {
      return Boolean(await this.adapter.isPermissionPending(state, guard));
    } catch {
      // Permission pending is a local safety pause. A failed marker read must
      // not make a cold headless runtime resume collection without foreground
      // confirmation.
      return true;
    }
  }

  public invalidate(state?: T | null): void {
    this.generation += 1;
    if (!state || sameTrackingLifecycleState(this.intent, state)) this.intent = null;
  }

  /** Rechecks generation and intent after asynchronous storage reads. */
  public async isCurrent(
    state: T,
    expectedGeneration = this.generation,
    isActive: () => boolean = () => true,
  ): Promise<boolean> {
    if (!isActive() || !this.owns(state, expectedGeneration)) return false;
    const persisted = await this.adapter.read();
    if (!isActive() || !this.owns(state, expectedGeneration) || !sameTrackingLifecycleState(persisted, state)) return false;
    return !(await this.isInactive(state, () => isActive() && this.owns(state, expectedGeneration)));
  }

  private beginStop(state: T): Promise<T> {
    // Atomic section: no await before invalidating the exact captured owner.
    const stopGeneration = this.generation + 1;
    this.generation = stopGeneration;
    this.intent = null;
    const stillStoppingOwner = () => stopGeneration === this.generation && this.intent === null;
    return this.enqueue(async () => {
      await this.markInactive(state, stillStoppingOwner);
      await this.adapter.clearIfSame(state, stillStoppingOwner);
      await this.adapter.clearControlNotification(state, stillStoppingOwner);
      await this.adapter.stopNativeCollection(stillStoppingOwner);
      if (stillStoppingOwner()) this.adapter.onStateChanged(null);
      return state;
    });
  }

  /**
   * Confirmed permission denial is not a terminal server response. Invalidate
   * only the exact in-memory owner synchronously, stop native collection before
   * waiting on persistence, and retain the saved pointer for later approval.
   */
  private beginPermissionSuspend(state: T): Promise<T> {
    const suspendGeneration = this.generation + 1;
    this.generation = suspendGeneration;
    this.intent = null;
    const stillSuspendingOwner = () => suspendGeneration === this.generation && this.intent === null;
    // A stalled local marker must never delay the native stop or permit another
    // callback to upload. Its guard prevents late A persistence from affecting B.
    void this.adapter.markPermissionPending?.(state, stillSuspendingOwner).catch(() => undefined);
    // Preserve the exact non-terminal work session for foreground arrival,
    // cancel, and explicit approval. `intent` is already null, so this view
    // publication cannot revive native collection or upload authority.
    this.adapter.onStateChanged(state);
    return this.enqueue(async () => {
      await this.adapter.stopNativeCollection(stillSuspendingOwner);
      await this.adapter.clearControlNotification(state, stillSuspendingOwner);
      if (stillSuspendingOwner()) this.adapter.onStateChanged(state);
      return state;
    });
  }

  /**
   * Terminal server authority is invalidated before any diagnostic, storage, or
   * native cleanup await. From this point `isCurrent(state)` is false, so a
   * later native callback cannot issue another HTTP update for this session.
   */
  public invalidateForTerminalResponse(state: T): boolean {
    if (!sameTrackingLifecycleState(this.intent, state)) return false;
    this.generation += 1;
    this.intent = null;
    this.adapter.onStateChanged(null);
    return true;
  }

  /**
   * Best-effort physical cleanup for an already-invalidated terminal session.
   * It is intentionally separate from terminal authority: a hung diagnostic,
   * storage read, or native stop must not keep a TaskManager callback pending or
   * revive the ability to upload. The native guard prevents late A cleanup from
   * stopping a replacement B collection after the bounded wait expires.
   */
  public completeInvalidatedTerminalCleanup(state: T): Promise<void> {
    const terminalGeneration = this.generation;
    const stillTerminalOwner = () => terminalGeneration === this.generation && this.intent === null;
    // Start the marker outside the serialized cleanup queue. Platform adapters
    // can synchronously fence their in-memory owner before their durable write
    // awaits, so a following TaskManager callback cannot re-adopt terminal A.
    const inactiveMarker = this.markInactive(state, stillTerminalOwner);
    return this.enqueue(async () => {
      // This marker is independent from the following tracking-state read. A
      // hung cleanup must not make a later TaskManager runtime adopt terminal A.
      await settleWithin(() => inactiveMarker);
      await settleWithin(() => this.adapter.stopNativeCollection(stillTerminalOwner));
      await Promise.all([
        settleWithin(() => this.adapter.clearIfSame(state, stillTerminalOwner)),
        settleWithin(() => this.adapter.clearControlNotification(state, stillTerminalOwner)),
      ]);
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
      if (await this.isInactive(state, () => coldStopGeneration === this.generation && !this.intent)) return null;
      // No await occurs between this final ownership check and local invalidation.
      this.generation += 1;
      const stoppedGeneration = this.generation;
      const stillStoppingOwner = () => stoppedGeneration === this.generation && this.intent === null;
      await this.markInactive(state, stillStoppingOwner);
      await this.adapter.clearIfSame(state, stillStoppingOwner);
      await this.adapter.clearControlNotification(state, stillStoppingOwner);
      await this.adapter.stopNativeCollection(stillStoppingOwner);
      if (stillStoppingOwner()) this.adapter.onStateChanged(null);
      return state;
    });
  }

  public async start(state: T, options: {
    restore?: boolean;
    expectedGeneration?: number;
    /** Cancels a queued foreground recovery when auth/work ownership changed. */
    isStillAuthorized?: () => boolean;
  } = {}): Promise<boolean> {
    const expectedGeneration = options.expectedGeneration;
    const isStillAuthorized = options.isStillAuthorized ?? (() => true);
    if (!isStillAuthorized() || (expectedGeneration !== undefined && expectedGeneration !== this.generation)) return false;
    const startGeneration = ++this.generation;
    this.intent = state;

    return this.enqueue(async () => {
      try {
        if (!isStillAuthorized()) {
          if (this.owns(state, startGeneration)) {
            this.generation += 1;
            this.intent = null;
          }
          return false;
        }
        if (!options.restore) await this.adapter.save(state);
        if (!isStillAuthorized() || !this.owns(state, startGeneration)) {
          await this.adapter.clearIfSame(state, () => this.owns(state, startGeneration));
          return false;
        }

        // Clear a prior reversible pause before native collection starts. The
        // adapter drops its in-memory marker synchronously; its durable removal
        // stays best effort and never extends the FGS start window.
        void this.adapter.clearPermissionPending?.(state, () => this.owns(state, startGeneration)).catch(() => undefined);

        // Expo Location starts Android's location FGS only while the app is in
        // the foreground. The local control notification is useful status UI,
        // but it must not widen the user-visible departure → FGS start window.
        // It also remains separate from proof of GPS callback/server storage.
        if (!isStillAuthorized()) return false;
        await this.adapter.startNativeCollection();
        if (!isStillAuthorized() || !this.owns(state, startGeneration)) {
          const stillFailedStart = () => isStillAuthorized() && this.owns(state, startGeneration);
          await this.adapter.stopNativeCollection(stillFailedStart);
          await this.adapter.clearIfSame(state, stillFailedStart);
          return false;
        }

        if (!isStillAuthorized()) return false;
        await this.adapter.showControlNotification(state);
        if (!isStillAuthorized() || !this.owns(state, startGeneration)) {
          const stillFailedStart = () => isStillAuthorized() && this.owns(state, startGeneration);
          await this.adapter.stopNativeCollection(stillFailedStart);
          await this.adapter.clearControlNotification(state, stillFailedStart);
          await this.adapter.clearIfSame(state, stillFailedStart);
          return false;
        }

        this.adapter.onStateChanged(state);
        return true;
      } catch (error) {
        const stillOwnsRuntime = this.owns(state, startGeneration);
        if (stillOwnsRuntime) {
          // Invalidate A before cleanup.  The cleanup guard captures this new
          // generation so a synchronous B start can supersede it without A
          // erasing B's pointer, notification, or native collection.
          const failedStartGeneration = this.generation + 1;
          this.intent = null;
          this.generation = failedStartGeneration;
          const stillFailedStartOwner = () => (
            failedStartGeneration === this.generation && this.intent === null
          );
          await this.adapter.stopNativeCollection(stillFailedStartOwner);
          await this.adapter.clearControlNotification(state, stillFailedStartOwner);
          await this.adapter.clearIfSame(state, stillFailedStartOwner);
          if (stillFailedStartOwner()) this.adapter.onStateChanged(null);
        }
        throw error;
      }
    });
  }

  /**
   * Restore owns both the initial storage read and its later enqueue boundary.
   * A stop/logout/new start while `read()` is pending changes generation, so the
   * stale saved A is never passed to `startNativeCollection()`.
   */
  public async restoreForUser(
    userId: number,
    expectedState?: T,
    isStillAuthorized: () => boolean = () => true,
  ): Promise<T | null> {
    const readGeneration = this.generation;
    if (!isStillAuthorized()) return null;
    const state = await this.adapter.read();
    if (!isStillAuthorized() || !state) return null;
    // A foreground permission-confirmation result belongs only to the exact
    // saved work it started with. If logout, terminal stop, or a replacement
    // share changed the pointer while permission UI was open, do not inspect or
    // stop that newer state on behalf of old A.
    if (expectedState && !sameTrackingLifecycleState(state, expectedState)) return null;
    if (await this.isInactive(state, () => isStillAuthorized() && readGeneration === this.generation)) return null;
    if (!isStillAuthorized()) return null;
    if (state.technicianUserId !== userId) {
      if (readGeneration === this.generation && !this.intent) {
        this.intent = state;
        await this.beginStop(state);
      }
      return null;
    }
    if (!isStillAuthorized() || readGeneration !== this.generation) return null;
    if (this.intent) return sameTrackingLifecycleState(this.intent, state) ? state : null;
    const restored = await this.start(state, {
      restore: true,
      expectedGeneration: readGeneration,
      isStillAuthorized,
    });
    return restored ? state : null;
  }

  /**
   * Rechecks the native task registration after a UI runtime returns. Persisted
   * intent or a sticky notification alone is deliberately not treated as proof
   * that Android still owns the collection task. The check/start is serialized
   * with normal start/stop transitions so an A recovery cannot start or stop B.
   */
  public async reconcileNativeCollection(state: T): Promise<"registered" | "restarted" | "superseded" | "unavailable"> {
    if (!this.adapter.isNativeCollectionRegistered) return "unavailable";
    const recoveryGeneration = this.generation;
    if (!this.owns(state, recoveryGeneration)) return "superseded";

    // The Android registration query may hang. It must never occupy the
    // lifecycle queue: a fresh B start advances generation synchronously and
    // proceeds independently while this old A observation is still pending.
    const persisted = await this.adapter.read();
    if (!this.owns(state, recoveryGeneration) || !sameTrackingLifecycleState(persisted, state)) return "superseded";
    if (await this.isInactive(state, () => this.owns(state, recoveryGeneration))) return "superseded";
    const registered = await this.adapter.isNativeCollectionRegistered();
    if (!this.owns(state, recoveryGeneration)) return "superseded";
    if (registered) return "registered";

    // Only the actual native restart is serialized. Recheck ownership after B
    // had a chance to enqueue its own start while the registration read waited.
    return this.enqueue(async () => {
      if (!this.owns(state, recoveryGeneration)) return "superseded";
      await this.adapter.startNativeCollection();
      if (!this.owns(state, recoveryGeneration)) {
        await this.adapter.stopNativeCollection();
        return "superseded";
      }
      this.adapter.onStateChanged(state);
      return "restarted";
    });
  }

  /**
   * Adopt a persisted session for a fresh headless TaskManager JS runtime.
   * The existing Android foreground service is already running, so this does not
   * start native collection again. The caller must still validate its bearer at
   * the server before an update can be accepted.
   */
  public async adoptStoredForHeadlessTask(isActive: () => boolean = () => true): Promise<T | null> {
    const readGeneration = this.generation;
    if (!isActive()) return null;
    const state = await this.adapter.read();
    if (!isActive() || !state || readGeneration !== this.generation) return null;
    if (await this.isInactive(state, () => isActive() && readGeneration === this.generation)) return null;
    // A foreground-approved runtime clears its in-memory marker before FGS
    // start while the durable removal may still settle. Its exact current intent
    // is safe; only a cold runtime with no owner remains blocked by the marker.
    if (this.intent) return sameTrackingLifecycleState(this.intent, state) ? state : null;
    if (await this.isPermissionPending(state, () => isActive() && readGeneration === this.generation)) return null;
    if (!isActive()) return null;
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

  /**
   * Does not clear or mark a session terminal. Used only after a native error
   * whose exact state is already owned by this JS runtime.
   */
  public suspendKnownExact(state: T, expectedGeneration = this.generation): boolean {
    if (expectedGeneration !== this.generation) return false;
    // Native error payloads do not identify a saved session. This path is only
    // safe for an exact owner already held by this JS runtime; a cold or late
    // callback must remain unbound rather than claiming a guessed pointer.
    if (!this.intent || !sameTrackingLifecycleState(this.intent, state)) return false;
    void this.beginPermissionSuspend(state);
    return true;
  }

  /** Applies an explicitly classified terminal server response to its exact owner only. */
  public async stopForTerminalResponse(state: T): Promise<T | null> {
    if (!this.invalidateForTerminalResponse(state)) return null;
    void this.completeInvalidatedTerminalCleanup(state);
    return state;
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
    if (await this.isInactive(state, () => readGeneration === this.generation && !this.intent)) return null;
    this.intent = state;
    return this.beginStop(state);
  }

  /** Stops a cold stored state only when its notification/request predicate matches. */
  public async stopStoredIf(predicate: (state: T) => boolean): Promise<T | null> {
    const readGeneration = this.generation;
    const state = await this.adapter.read();
    if (!state || !predicate(state) || readGeneration !== this.generation || this.intent) return null;
    if (await this.isInactive(state, () => readGeneration === this.generation && !this.intent)) return null;
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
    if (await this.isInactive(state, () => readGeneration === this.generation && !this.intent)) return null;
    this.intent = state;
    return this.beginStop(state);
  }

  /**
   * Cold restore may discover a permission denial before it has claimed intent.
   * Re-read the exact pointer under the captured generation, then suspend native
   * collection without terminal-marking or deleting the same resumable session.
   */
  public async suspendStoredExact(state: T): Promise<T | null> {
    const readGeneration = this.generation;
    const persisted = await this.adapter.read();
    if (!sameTrackingLifecycleState(persisted, state)
      || readGeneration !== this.generation
      || this.intent) return null;
    if (await this.isInactive(state, () => readGeneration === this.generation && !this.intent)) return null;
    this.intent = state;
    return this.beginPermissionSuspend(state);
  }
}
