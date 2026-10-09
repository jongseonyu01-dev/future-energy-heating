import type { TrackingLifecycleState } from "@/lib/location-tracking-lifecycle";

/**
 * This store intentionally excludes raw bearer tokens and coordinates. It keeps
 * only timestamps and bounded counters needed to distinguish registration,
 * callback, network response, and server-accepted persistence after a JS
 * runtime is recreated.
 */
export type NativeRegistrationState = "unknown" | "registered" | "not_registered" | "restart_failed";

export interface LocationRuntimeDiagnosticScope {
  requestId: number;
  technicianUserId: number;
  startedAt: number;
}

export interface LocationRuntimeDiagnostics extends LocationRuntimeDiagnosticScope {
  schemaVersion: 1;
  /** Captured when this immutable diagnostic operation begins, not when I/O finally commits. */
  updatedAt: number;
  operationId: string;
  /** App version/build only; excludes package identity, tokens, and user data. */
  buildLabel: string | null;
  nativeRegistration: NativeRegistrationState;
  lastNativeCheckAt: number | null;
  lastCallbackAt: number | null;
  lastMeasuredAt: number | null;
  lastUploadStartedAt: number | null;
  lastResponseAt: number | null;
  lastStoredAt: number | null;
  lastErrorCode: string | null;
  /** Optional for v1 records written before explicit error ordering existed. */
  lastErrorAt: number | null;
  attemptCount: number;
  storedCount: number;
  ignoredCount: number;
  finalizedAt: number | null;
}

/**
 * A callback can arrive before a fresh JS runtime has safely adopted a saved
 * session. This deliberately remains module-scoped: it never guesses which
 * A/B session owns the event and never stores a token, customer, or coordinate.
 */
export interface UnboundLocationTaskEvent {
  schemaVersion: 1;
  /** Immutable event key; never reused for a later callback. */
  eventId: string;
  observedAt: number;
  code: string;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys?: () => Promise<readonly string[]>;
  multiGet?: (keys: readonly string[]) => Promise<readonly [string, string | null][]>;
  removeItem?: (key: string) => Promise<void>;
}

export type DiagnosticsOperationGuard = () => boolean;

type ScopeRecordsResult =
  | { kind: "VALUE"; records: LocationRuntimeDiagnostics[] }
  | { kind: "FAILED" };

type DiagnosticsReadResult =
  | { kind: "VALUE"; value: LocationRuntimeDiagnostics | null }
  | { kind: "FAILED" };

export function diagnosticScopeOf(state: TrackingLifecycleState): LocationRuntimeDiagnosticScope {
  return {
    requestId: state.requestId,
    technicianUserId: state.technicianUserId,
    startedAt: state.startedAt,
  };
}

export function sameDiagnosticScope(
  left: LocationRuntimeDiagnosticScope | null | undefined,
  right: LocationRuntimeDiagnosticScope | null | undefined,
): boolean {
  return Boolean(left && right
    && left.requestId === right.requestId
    && left.technicianUserId === right.technicianUserId
    && left.startedAt === right.startedAt);
}

function operationId(now: number, sequence: number): string {
  return `${now}-${sequence}`;
}

export function createLocationRuntimeDiagnostics(
  state: TrackingLifecycleState,
  now = Date.now(),
  id = operationId(now, 0),
): LocationRuntimeDiagnostics {
  return {
    schemaVersion: 1,
    ...diagnosticScopeOf(state),
    updatedAt: now,
    operationId: id,
    buildLabel: null,
    nativeRegistration: "unknown",
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
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidDiagnostics(value: unknown): value is LocationRuntimeDiagnostics {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocationRuntimeDiagnostics>;
  return candidate.schemaVersion === 1
    && Number.isSafeInteger(candidate.requestId) && (candidate.requestId as number) > 0
    && Number.isSafeInteger(candidate.technicianUserId) && (candidate.technicianUserId as number) > 0
    && isFiniteTimestamp(candidate.startedAt)
    && isFiniteTimestamp(candidate.updatedAt)
    && typeof candidate.operationId === "string" && candidate.operationId.length > 0 && candidate.operationId.length <= 80
    && (candidate.buildLabel === null || candidate.buildLabel === undefined || (typeof candidate.buildLabel === "string" && candidate.buildLabel.length <= 64))
    && ["unknown", "registered", "not_registered", "restart_failed"].includes(String(candidate.nativeRegistration))
    && Number.isSafeInteger(candidate.attemptCount) && (candidate.attemptCount as number) >= 0
    && Number.isSafeInteger(candidate.storedCount) && (candidate.storedCount as number) >= 0
    && Number.isSafeInteger(candidate.ignoredCount) && (candidate.ignoredCount as number) >= 0;
}

function normalizeTimestamp(value: unknown): number | null {
  return value === null || value === undefined ? null : isFiniteTimestamp(value) ? value : null;
}

function normalizeDiagnostics(value: LocationRuntimeDiagnostics): LocationRuntimeDiagnostics {
  return {
    ...value,
    buildLabel: typeof value.buildLabel === "string" && value.buildLabel.length <= 64 ? value.buildLabel : null,
    lastNativeCheckAt: normalizeTimestamp(value.lastNativeCheckAt),
    lastCallbackAt: normalizeTimestamp(value.lastCallbackAt),
    lastMeasuredAt: normalizeTimestamp(value.lastMeasuredAt),
    lastUploadStartedAt: normalizeTimestamp(value.lastUploadStartedAt),
    lastResponseAt: normalizeTimestamp(value.lastResponseAt),
    lastStoredAt: normalizeTimestamp(value.lastStoredAt),
    lastErrorAt: normalizeTimestamp(value.lastErrorAt),
    finalizedAt: normalizeTimestamp(value.finalizedAt),
    lastErrorCode: typeof value.lastErrorCode === "string" && value.lastErrorCode.length <= 96 ? value.lastErrorCode : null,
  };
}

function isValidUnboundTaskEvent(value: unknown): value is UnboundLocationTaskEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnboundLocationTaskEvent>;
  return candidate.schemaVersion === 1
    && typeof candidate.eventId === "string"
    && candidate.eventId.length > 0
    && candidate.eventId.length <= 80
    && isFiniteTimestamp(candidate.observedAt)
    && typeof candidate.code === "string"
    && candidate.code.length > 0
    && candidate.code.length <= 96;
}

function active(guard?: DiagnosticsOperationGuard): boolean {
  return !guard || guard();
}

function operationSequence(value: string): number {
  const match = /-(\d+)$/.exec(value);
  return match ? Number(match[1]) : -1;
}

function isNewerUnboundTaskEvent(left: UnboundLocationTaskEvent, right: UnboundLocationTaskEvent): boolean {
  if (left.observedAt !== right.observedAt) return left.observedAt > right.observedAt;
  const leftSequence = operationSequence(left.eventId);
  const rightSequence = operationSequence(right.eventId);
  if (leftSequence !== rightSequence) return leftSequence > rightSequence;
  return left.eventId > right.eventId;
}

function isNewer(left: LocationRuntimeDiagnostics, right: LocationRuntimeDiagnostics): boolean {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt;
  const leftSequence = operationSequence(left.operationId);
  const rightSequence = operationSequence(right.operationId);
  if (leftSequence !== rightSequence) return leftSequence > rightSequence;
  // A stable final tie-breaker handles legacy/runtime-prefixed IDs without
  // letting `...-9` incorrectly outrank `...-10` as a string comparison.
  return left.operationId > right.operationId;
}

/**
 * Each operation writes an immutable scope-specific record. A setItem already
 * issued by expired A cannot overwrite B's later accepted diagnostic because it
 * has a different key; reads select the newest operation-start timestamp. This
 * is intentionally stronger than replacing a shared write queue after timeout.
 */
export class LocationRuntimeDiagnosticsStore {
  private writes: Promise<unknown> = Promise.resolve();
  private sequence = 0;

  public constructor(
    private readonly storage: KeyValueStorage,
    private readonly keyPrefix = "location_tracking_runtime_diagnostics_v2",
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.catch(() => undefined);
    return next;
  }

  private scopePrefix(state: TrackingLifecycleState): string {
    const scope = diagnosticScopeOf(state);
    return `${this.keyPrefix}:${scope.requestId}:${scope.technicianUserId}:${scope.startedAt}:`;
  }

  private legacyKey(): string {
    return this.keyPrefix.replace(/_v2$/, "_v1");
  }

  private unboundTaskEventPrefix(): string {
    return this.keyPrefix.replace(/_v2$/, "_task_event_v2:");
  }

  private legacyUnboundTaskEventKey(): string {
    return this.keyPrefix.replace(/_v2$/, "_task_event_v1");
  }

  private nextOperationId(now: number): string {
    this.sequence += 1;
    return operationId(now, this.sequence);
  }

  /**
   * A TaskManager deadline may detach a hung best-effort storage promise. The
   * detached operation can only append its own immutable record; it cannot
   * overwrite a newer callback's selected diagnostics. Releasing this local
   * chain lets the next callback continue without inheriting the old stall.
   */
  public releaseExpiredWork(): void {
    this.writes = Promise.resolve();
  }

  private async recordsForScope(
    state: TrackingLifecycleState,
    guard?: DiagnosticsOperationGuard,
  ): Promise<ScopeRecordsResult> {
    if (!active(guard)) return { kind: "VALUE", records: [] };
    const prefix = this.scopePrefix(state);
    try {
      const keys = this.storage.getAllKeys ? await this.storage.getAllKeys() : [];
      if (!active(guard)) return { kind: "VALUE", records: [] };
      const matching = keys.filter((key) => key.startsWith(prefix));
      const pairs = this.storage.multiGet
        ? await this.storage.multiGet(matching)
        : await Promise.all(matching.map(async (key) => [key, await this.storage.getItem(key)] as [string, string | null]));
      if (!active(guard)) return { kind: "VALUE", records: [] };
      const records: LocationRuntimeDiagnostics[] = [];
      for (const [, raw] of pairs) {
        if (!raw) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isValidDiagnostics(parsed) && sameDiagnosticScope(parsed, diagnosticScopeOf(state))) {
            records.push(normalizeDiagnostics(parsed));
          }
        } catch {
          // A corrupt diagnostic is never allowed to block a location callback.
        }
      }
      return { kind: "VALUE", records };
    } catch {
      // A storage failure is not evidence that this scope is empty. In
      // particular, ensure() must not append a blank journal record that masks
      // existing counters or an error after the next successful read.
      return { kind: "FAILED" };
    }
  }

  private async legacyRecord(state: TrackingLifecycleState, guard?: DiagnosticsOperationGuard): Promise<DiagnosticsReadResult> {
    if (!active(guard)) return { kind: "VALUE", value: null };
    try {
      const raw = await this.storage.getItem(this.legacyKey());
      if (!active(guard) || !raw) return { kind: "VALUE", value: null };
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !sameDiagnosticScope(parsed as LocationRuntimeDiagnosticScope, diagnosticScopeOf(state))) return { kind: "VALUE", value: null };
      const candidate = parsed as Partial<LocationRuntimeDiagnostics>;
      const updatedAt = normalizeTimestamp(candidate.lastStoredAt)
        ?? normalizeTimestamp(candidate.lastResponseAt)
        ?? normalizeTimestamp(candidate.lastUploadStartedAt)
        ?? normalizeTimestamp(candidate.lastCallbackAt)
        ?? state.startedAt;
      const converted = { ...candidate, schemaVersion: 1, updatedAt, operationId: `legacy-${updatedAt}` } as LocationRuntimeDiagnostics;
      return { kind: "VALUE", value: isValidDiagnostics(converted) ? normalizeDiagnostics(converted) : null };
    } catch {
      return { kind: "FAILED" };
    }
  }

  private async readUnsafe(state: TrackingLifecycleState, guard?: DiagnosticsOperationGuard): Promise<DiagnosticsReadResult> {
    const recordsResult = await this.recordsForScope(state, guard);
    if (recordsResult.kind === "FAILED") return recordsResult;
    if (!active(guard)) return { kind: "VALUE", value: null };
    let newest: LocationRuntimeDiagnostics | null = null;
    for (const record of recordsResult.records) {
      if (!newest || isNewer(record, newest)) newest = record;
    }
    return newest ? { kind: "VALUE", value: newest } : this.legacyRecord(state, guard);
  }

  private async writeUnsafe(
    state: TrackingLifecycleState,
    value: LocationRuntimeDiagnostics,
    guard?: DiagnosticsOperationGuard,
  ): Promise<boolean> {
    if (!active(guard)) return false;
    try {
      await this.storage.setItem(`${this.scopePrefix(state)}${value.operationId}`, JSON.stringify(value));
      if (!active(guard)) return false;
      void this.pruneScope(state);
      return true;
    } catch {
      // Diagnostics are intentionally best effort and must not block collection.
      return false;
    }
  }

  /** Keeps a bounded immutable journal without making callback completion wait for cleanup. */
  private async pruneScope(state: TrackingLifecycleState): Promise<void> {
    if (!this.storage.removeItem) return;
    const result = await this.recordsForScope(state);
    if (result.kind === "FAILED") return;
    const { records } = result;
    if (records.length <= 24) return;
    const stale = [...records]
      .sort((left, right) => isNewer(left, right) ? -1 : 1)
      .slice(24);
    await Promise.all(stale.map((record) => this.storage.removeItem!(
      `${this.scopePrefix(state)}${record.operationId}`,
    ).catch(() => undefined)));
  }

  public async read(state: TrackingLifecycleState, guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    const result = await this.readUnsafe(state, guard);
    if (result.kind === "FAILED") return null;
    const { value: current } = result;
    return active(guard) && sameDiagnosticScope(current, diagnosticScopeOf(state)) ? current : null;
  }

  /**
   * Appends an immutable callback event that could not be safely associated
   * with a session. It intentionally bypasses the session journal queue: a
   * hung A diagnostic read must not consume a later callback's bounded entry
   * window. Operation-start time and sequence select the newest event at read
   * time, so an already-issued late A write cannot replace B's evidence.
   */
  public async recordUnboundTaskEvent(
    code: string,
    observedAt = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<UnboundLocationTaskEvent | null> {
    const event: UnboundLocationTaskEvent = {
      schemaVersion: 1,
      eventId: this.nextOperationId(observedAt),
      observedAt,
      code,
    };
    if (!isValidUnboundTaskEvent(event) || !active(guard)) return null;
    try {
      await this.storage.setItem(`${this.unboundTaskEventPrefix()}${event.eventId}`, JSON.stringify(event));
      void this.pruneUnboundTaskEvents();
      return active(guard) ? event : null;
    } catch {
      // This event is diagnostic-only and must never block a TaskManager callback.
      return null;
    }
  }

  /** Reads the newest module-scoped event without assigning it to any active session. */
  public async readUnboundTaskEvent(guard?: DiagnosticsOperationGuard): Promise<UnboundLocationTaskEvent | null> {
    if (!active(guard)) return null;
    try {
      const prefix = this.unboundTaskEventPrefix();
      const keys = this.storage.getAllKeys ? await this.storage.getAllKeys() : [];
      if (!active(guard)) return null;
      const eventKeys = keys.filter((key) => key.startsWith(prefix));
      const pairs = this.storage.multiGet
        ? await this.storage.multiGet(eventKeys)
        : await Promise.all(eventKeys.map(async (key) => [key, await this.storage.getItem(key)] as [string, string | null]));
      if (!active(guard)) return null;
      let newest: UnboundLocationTaskEvent | null = null;
      for (const [, raw] of pairs) {
        if (!raw) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isValidUnboundTaskEvent(parsed) && (!newest || isNewerUnboundTaskEvent(parsed, newest))) newest = parsed;
        } catch {
          // Corrupt diagnostics must never block collection.
        }
      }
      if (newest || !this.storage.getAllKeys) return newest;
      // Read-only compatibility for one legacy fixed-key record. It cannot
      // outrank a v2 immutable record because that branch returns above.
      const legacyRaw = await this.storage.getItem(this.legacyUnboundTaskEventKey());
      if (!active(guard) || !legacyRaw) return null;
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!legacy || typeof legacy !== "object") return null;
      const candidate = legacy as Partial<UnboundLocationTaskEvent>;
      return isFiniteTimestamp(candidate.observedAt) && typeof candidate.code === "string"
        ? { schemaVersion: 1, eventId: `legacy-${candidate.observedAt}`, observedAt: candidate.observedAt, code: candidate.code }
        : null;
    } catch {
      return null;
    }
  }

  /** Bounds unbound retention without making a callback wait for cleanup. */
  private async pruneUnboundTaskEvents(): Promise<void> {
    if (!this.storage.getAllKeys || !this.storage.multiGet || !this.storage.removeItem) return;
    try {
      const keys = (await this.storage.getAllKeys()).filter((key) => key.startsWith(this.unboundTaskEventPrefix()));
      if (keys.length <= 24) return;
      const pairs = await this.storage.multiGet(keys);
      const events = pairs.flatMap(([key, raw]) => {
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : null;
          return isValidUnboundTaskEvent(parsed) ? [{ key, event: parsed }] : [];
        } catch {
          return [];
        }
      });
      const stale = events.sort((left, right) => isNewerUnboundTaskEvent(left.event, right.event) ? -1 : 1).slice(24);
      await Promise.all(stale.map(({ key }) => this.storage.removeItem!(key).catch(() => undefined)));
    } catch {
      // Retention cleanup is deliberately best effort.
    }
  }

  /** Starts an exact replacement diagnostic scope after a new local share starts. */
  public begin(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const id = this.nextOperationId(now);
    return this.enqueue(async () => {
      if (!active(guard)) return null;
      const next = createLocationRuntimeDiagnostics(state, now, id);
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    });
  }

  /** Creates a legacy/missing record only when this exact scope has no record. */
  public ensure(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const id = this.nextOperationId(now);
    return this.enqueue(async () => {
      const result = await this.readUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      const { value: current } = result;
      if (!active(guard)) return null;
      if (current) return current;
      const next = createLocationRuntimeDiagnostics(state, now, id);
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    });
  }

  public patch(
    state: TrackingLifecycleState,
    patch: Partial<Omit<LocationRuntimeDiagnostics, "schemaVersion" | "requestId" | "technicianUserId" | "startedAt" | "updatedAt" | "operationId">>,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const now = Date.now();
    const id = this.nextOperationId(now);
    return this.enqueue(async () => {
      const result = await this.readUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      const { value: current } = result;
      if (!active(guard) || !current || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      const next = normalizeDiagnostics({ ...current, ...patch, updatedAt: now, operationId: id });
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    });
  }

  /** Applies a current-scope transformation without trusting module-memory counters. */
  public update(
    state: TrackingLifecycleState,
    update: (current: LocationRuntimeDiagnostics) => LocationRuntimeDiagnostics,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const now = Date.now();
    const id = this.nextOperationId(now);
    return this.enqueue(async () => {
      const result = await this.readUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      const { value: current } = result;
      if (!active(guard) || !current || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      const next = normalizeDiagnostics({ ...update(current), updatedAt: now, operationId: id });
      if (!active(guard) || !sameDiagnosticScope(next, diagnosticScopeOf(state))) return null;
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    });
  }

  /** Retains an ended session summary for the next in-app inspection without reviving it. */
  public finalize(state: TrackingLifecycleState, now = Date.now(), guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    return this.patch(state, { finalizedAt: now }, guard);
  }
}
