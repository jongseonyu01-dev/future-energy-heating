import type { TrackingLifecycleState } from "@/lib/location-tracking-lifecycle";

/**
 * This store intentionally excludes raw bearer tokens and coordinates. It keeps
 * only timestamps and bounded counters needed to distinguish registration,
 * callback, network response, and server-accepted persistence after a JS
 * runtime is recreated.
 */
export type NativeRegistrationState = "unknown" | "registered" | "not_registered" | "restart_failed";
export type LocationCallbackStage =
  | "ADOPTED"
  | "QUEUE"
  | "OWNER_CHECK"
  | "CREDENTIAL"
  | "HTTP_REQUEST"
  | "HTTP_HEADERS"
  | "RESPONSE_BODY"
  | "SERVER_ACCEPTED"
  | "CALLBACK_DEADLINE";
export type LocationAppStateMarker = "active" | "background" | "inactive" | "unknown";

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
  /** Header receipt, completed body, accepted contract, and deadline are distinct evidence. */
  lastResponseHeadersAt: number | null;
  lastResponseBodyAt: number | null;
  lastAcceptedAt: number | null;
  lastCallbackDeadlineAt: number | null;
  /** Latest safe phase marker; names are fixed, non-sensitive implementation stages. */
  lastCallbackStage: LocationCallbackStage | null;
  lastCallbackStageAt: number | null;
  lastCallbackStageElapsedMs: number | null;
  lastAttemptStage: LocationCallbackStage | null;
  lastAttemptStageAt: number | null;
  lastAttemptStageElapsedMs: number | null;
  /** UI lifecycle evidence only; it never triggers an upload. */
  lastAppState: LocationAppStateMarker | null;
  lastAppStateAt: number | null;
  /** Bounded ids of accepted outcome events already folded into storedCount. */
  acceptedOutcomeIds: string[];
  /** Newest immutable accepted event durably reflected in this summary. */
  acceptedOutcomeThrough: string | null;
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

/**
 * A server-accepted outcome bypasses the best-effort diagnostic read/write
 * chain. The response has already been verified; a stuck local setItem must not
 * turn it into a deadline failure or erase it after a fresh JS runtime starts.
 */
export interface AcceptedLocationOutcomeEvent extends LocationRuntimeDiagnosticScope {
  schemaVersion: 1;
  eventId: string;
  observedAt: number;
  callbackAt: number;
  attemptStartedAt: number;
  responseHeadersAt: number;
  responseBodyAt: number;
  acceptedAt: number;
  storedAt: number;
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
    lastResponseHeadersAt: null,
    lastResponseBodyAt: null,
    lastAcceptedAt: null,
    lastCallbackDeadlineAt: null,
    lastCallbackStage: null,
    lastCallbackStageAt: null,
    lastCallbackStageElapsedMs: null,
    lastAttemptStage: null,
    lastAttemptStageAt: null,
    lastAttemptStageElapsedMs: null,
    lastAppState: null,
    lastAppStateAt: null,
    acceptedOutcomeIds: [],
    acceptedOutcomeThrough: null,
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

function normalizeDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 60_000 ? Math.round(value) : null;
}

function normalizeCallbackStage(value: unknown): LocationCallbackStage | null {
  return ["ADOPTED", "QUEUE", "OWNER_CHECK", "CREDENTIAL", "HTTP_REQUEST", "HTTP_HEADERS", "RESPONSE_BODY", "SERVER_ACCEPTED", "CALLBACK_DEADLINE"].includes(String(value))
    ? value as LocationCallbackStage
    : null;
}

function normalizeAppStateMarker(value: unknown): LocationAppStateMarker | null {
  return ["active", "background", "inactive", "unknown"].includes(String(value))
    ? value as LocationAppStateMarker
    : null;
}

function normalizeOutcomeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 80);
  // These identifiers are only retained until their immutable event keys have
  // been removed after a durable summary write. Truncating this acknowledgement
  // list before compaction can make a delayed event count twice or disappear.
  return [...new Set(ids)];
}

function normalizeOutcomeCheckpoint(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 80 ? value : null;
}

function normalizeDiagnostics(value: LocationRuntimeDiagnostics): LocationRuntimeDiagnostics {
  return {
    ...value,
    buildLabel: typeof value.buildLabel === "string" && value.buildLabel.length <= 64 ? value.buildLabel : null,
    lastNativeCheckAt: normalizeTimestamp(value.lastNativeCheckAt),
    lastCallbackAt: normalizeTimestamp(value.lastCallbackAt),
    lastMeasuredAt: normalizeTimestamp(value.lastMeasuredAt),
    lastUploadStartedAt: normalizeTimestamp(value.lastUploadStartedAt),
    lastResponseHeadersAt: normalizeTimestamp(value.lastResponseHeadersAt),
    lastResponseBodyAt: normalizeTimestamp(value.lastResponseBodyAt),
    lastAcceptedAt: normalizeTimestamp(value.lastAcceptedAt),
    lastCallbackDeadlineAt: normalizeTimestamp(value.lastCallbackDeadlineAt),
    lastCallbackStage: normalizeCallbackStage(value.lastCallbackStage),
    lastCallbackStageAt: normalizeTimestamp(value.lastCallbackStageAt),
    lastCallbackStageElapsedMs: normalizeDuration(value.lastCallbackStageElapsedMs),
    lastAttemptStage: normalizeCallbackStage(value.lastAttemptStage),
    lastAttemptStageAt: normalizeTimestamp(value.lastAttemptStageAt),
    lastAttemptStageElapsedMs: normalizeDuration(value.lastAttemptStageElapsedMs),
    lastAppState: normalizeAppStateMarker(value.lastAppState),
    lastAppStateAt: normalizeTimestamp(value.lastAppStateAt),
    acceptedOutcomeIds: normalizeOutcomeIds(value.acceptedOutcomeIds),
    acceptedOutcomeThrough: normalizeOutcomeCheckpoint(value.acceptedOutcomeThrough),
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

function isValidAcceptedOutcomeEvent(value: unknown): value is AcceptedLocationOutcomeEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AcceptedLocationOutcomeEvent>;
  return candidate.schemaVersion === 1
    && typeof candidate.eventId === "string" && candidate.eventId.length > 0 && candidate.eventId.length <= 80
    && Number.isSafeInteger(candidate.requestId) && (candidate.requestId as number) > 0
    && Number.isSafeInteger(candidate.technicianUserId) && (candidate.technicianUserId as number) > 0
    && isFiniteTimestamp(candidate.startedAt)
    && isFiniteTimestamp(candidate.observedAt)
    && isFiniteTimestamp(candidate.callbackAt)
    && isFiniteTimestamp(candidate.attemptStartedAt)
    && isFiniteTimestamp(candidate.responseHeadersAt)
    && isFiniteTimestamp(candidate.responseBodyAt)
    && isFiniteTimestamp(candidate.acceptedAt)
    && isFiniteTimestamp(candidate.storedAt);
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

function isNewerAcceptedOutcome(left: AcceptedLocationOutcomeEvent, right: AcceptedLocationOutcomeEvent): boolean {
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
  /**
   * Multiple JS module instances can construct Stores over the same AsyncStorage
   * object. Summary mutations for one scope need a shared lock across those
   * instances; otherwise an old reader can append 0/null after another instance
   * has checkpointed and compacted accepted evidence.
   */
  private static readonly scopeWrites = new WeakMap<object, Map<string, Promise<unknown>>>();
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

  private enqueueScopeWrite<T>(state: TrackingLifecycleState, operation: () => Promise<T>): Promise<T> {
    const storage = this.storage as object;
    let locks = LocationRuntimeDiagnosticsStore.scopeWrites.get(storage);
    if (!locks) {
      locks = new Map<string, Promise<unknown>>();
      LocationRuntimeDiagnosticsStore.scopeWrites.set(storage, locks);
    }
    const key = this.scopePrefix(state);
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.catch(() => undefined);
    locks.set(key, settled);
    void settled.finally(() => {
      if (locks?.get(key) === settled) locks.delete(key);
    });
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

  private acceptedOutcomePrefix(state: TrackingLifecycleState): string {
    const scope = diagnosticScopeOf(state);
    return `${this.keyPrefix.replace(/_v2$/, "_accepted_outcome_v1")}:${scope.requestId}:${scope.technicianUserId}:${scope.startedAt}:`;
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
    // A deadline may detach an already-issued immutable write. Do not let its
    // shared per-scope lock hold a following callback hostage; late A remains
    // safe because it appends its own record and the reader merges durable
    // accepted evidence instead of replacing B's summary.
    LocationRuntimeDiagnosticsStore.scopeWrites.get(this.storage as object)?.clear();
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
    return newest
      ? { kind: "VALUE", value: this.mergeDurableAcceptedSummaries(newest, recordsResult.records) }
      : this.legacyRecord(state, guard);
  }

  /**
   * Two runtime instances can read/write the same immutable summary journal.
   * The most recently started operation may have read an older summary before a
   * different instance checkpointed accepted evidence. Preserve that durable
   * acceptance floor instead of allowing the later stale write to erase it.
   */
  private mergeDurableAcceptedSummaries(
    newest: LocationRuntimeDiagnostics,
    records: readonly LocationRuntimeDiagnostics[],
  ): LocationRuntimeDiagnostics {
    const normalizedNewest = normalizeDiagnostics(newest);
    const acknowledged = new Set(normalizedNewest.acceptedOutcomeIds);
    let storedCount = normalizedNewest.storedCount;
    let attemptCount = normalizedNewest.attemptCount;
    let lastAcceptedAt = normalizedNewest.lastAcceptedAt;
    let lastStoredAt = normalizedNewest.lastStoredAt;
    let lastResponseAt = normalizedNewest.lastResponseAt;
    let lastResponseHeadersAt = normalizedNewest.lastResponseHeadersAt;
    let lastResponseBodyAt = normalizedNewest.lastResponseBodyAt;
    let checkpoint = normalizedNewest.acceptedOutcomeThrough;

    for (const record of records) {
      const candidate = normalizeDiagnostics(record);
      for (const id of candidate.acceptedOutcomeIds) acknowledged.add(id);
      storedCount = Math.max(storedCount, candidate.storedCount);
      attemptCount = Math.max(attemptCount, candidate.attemptCount);
      lastAcceptedAt = Math.max(lastAcceptedAt ?? 0, candidate.lastAcceptedAt ?? 0) || null;
      lastStoredAt = Math.max(lastStoredAt ?? 0, candidate.lastStoredAt ?? 0) || null;
      lastResponseAt = Math.max(lastResponseAt ?? 0, candidate.lastResponseAt ?? 0) || null;
      lastResponseHeadersAt = Math.max(lastResponseHeadersAt ?? 0, candidate.lastResponseHeadersAt ?? 0) || null;
      lastResponseBodyAt = Math.max(lastResponseBodyAt ?? 0, candidate.lastResponseBodyAt ?? 0) || null;
      if (candidate.acceptedOutcomeThrough && (!checkpoint || candidate.acceptedOutcomeThrough > checkpoint)) {
        checkpoint = candidate.acceptedOutcomeThrough;
      }
    }
    return normalizeDiagnostics({
      ...normalizedNewest,
      acceptedOutcomeIds: [...acknowledged],
      acceptedOutcomeThrough: checkpoint,
      attemptCount,
      storedCount,
      lastAcceptedAt,
      lastStoredAt,
      lastResponseAt,
      lastResponseHeadersAt,
      lastResponseBodyAt,
    });
  }

  /** Merges independent accepted events before a summary mutation can checkpoint them. */
  private async readMergedUnsafe(state: TrackingLifecycleState, guard?: DiagnosticsOperationGuard): Promise<DiagnosticsReadResult> {
    const result = await this.readUnsafe(state, guard);
    const outcomes = await this.acceptedOutcomesForScope(state, guard);
    if (result.kind === "FAILED" || !active(guard)) return result;
    const current = result.value ?? (outcomes.length > 0 ? createLocationRuntimeDiagnostics(state, Date.now(), this.nextOperationId(Date.now())) : null);
    if (!current) return { kind: "VALUE", value: null };
    return active(guard)
      ? { kind: "VALUE", value: this.mergeAcceptedOutcomes(current, outcomes) }
      : { kind: "VALUE", value: null };
  }

  private async acceptedOutcomesForScope(
    state: TrackingLifecycleState,
    guard?: DiagnosticsOperationGuard,
  ): Promise<AcceptedLocationOutcomeEvent[]> {
    if (!active(guard) || !this.storage.getAllKeys) return [];
    try {
      const prefix = this.acceptedOutcomePrefix(state);
      const keys = (await this.storage.getAllKeys()).filter((key) => key.startsWith(prefix));
      if (!active(guard)) return [];
      const pairs = this.storage.multiGet
        ? await this.storage.multiGet(keys)
        : await Promise.all(keys.map(async (key) => [key, await this.storage.getItem(key)] as [string, string | null]));
      if (!active(guard)) return [];
      const outcomes: AcceptedLocationOutcomeEvent[] = [];
      for (const [, raw] of pairs) {
        if (!raw) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isValidAcceptedOutcomeEvent(parsed) && sameDiagnosticScope(parsed, diagnosticScopeOf(state))) outcomes.push(parsed);
        } catch {
          // Outcome evidence is best effort and must not block diagnostics restoration.
        }
      }
      return outcomes;
    } catch {
      return [];
    }
  }

  private mergeAcceptedOutcomes(
    current: LocationRuntimeDiagnostics,
    outcomes: readonly AcceptedLocationOutcomeEvent[],
  ): LocationRuntimeDiagnostics {
    const presentOutcomeIds = new Set(outcomes.map((outcome) => outcome.eventId));
    // After a successful getAllKeys listing, IDs whose immutable event keys were
    // already compacted no longer need acknowledgement slots. Keep them only on
    // storage implementations that cannot enumerate outcome keys.
    const retainedIds = this.storage.getAllKeys
      ? normalizeDiagnostics(current).acceptedOutcomeIds.filter((id) => presentOutcomeIds.has(id))
      : normalizeDiagnostics(current).acceptedOutcomeIds;
    let merged = normalizeDiagnostics({ ...current, acceptedOutcomeIds: retainedIds });
    for (const outcome of [...outcomes].sort((left, right) => isNewerAcceptedOutcome(left, right) ? 1 : -1)) {
      // A delayed write can carry an older observedAt than a summary checkpoint
      // written by a newer callback. Only this exact durable eventId proves the
      // event was already counted; timestamp order alone cannot safely prune it.
      if (merged.acceptedOutcomeIds.includes(outcome.eventId)) continue;
      const belongsToCurrentCallback = merged.lastCallbackAt === outcome.callbackAt;
      const shouldAdvanceVisibleStage = !merged.lastCallbackAt || merged.lastCallbackAt <= outcome.callbackAt;
      const clearsOlderError = Boolean(
        merged.lastErrorCode
        && (
          (merged.lastErrorCode === "CALLBACK_DEADLINE_EXCEEDED" && belongsToCurrentCallback)
          || (merged.lastErrorAt !== null && merged.lastErrorAt <= outcome.acceptedAt && shouldAdvanceVisibleStage)
        ),
      );
      const acceptedOutcomeIds = [...merged.acceptedOutcomeIds, outcome.eventId];
      merged = normalizeDiagnostics({
        ...merged,
        acceptedOutcomeIds,
        acceptedOutcomeThrough: outcome.eventId,
        lastResponseHeadersAt: Math.max(merged.lastResponseHeadersAt ?? 0, outcome.responseHeadersAt) || null,
        lastResponseBodyAt: Math.max(merged.lastResponseBodyAt ?? 0, outcome.responseBodyAt) || null,
        lastAcceptedAt: Math.max(merged.lastAcceptedAt ?? 0, outcome.acceptedAt) || null,
        // lastResponseAt remains the completed-body timestamp. A callback deadline
        // never manufactures this field when no HTTP response was received.
        lastResponseAt: Math.max(merged.lastResponseAt ?? 0, outcome.responseBodyAt) || null,
        lastStoredAt: Math.max(merged.lastStoredAt ?? 0, outcome.storedAt) || null,
        storedCount: merged.storedCount + 1,
        ...(clearsOlderError
          ? { lastErrorCode: null, lastErrorAt: null }
          : {}),
        ...(shouldAdvanceVisibleStage
          ? {
              lastCallbackStage: "SERVER_ACCEPTED" as const,
              lastCallbackStageAt: outcome.acceptedAt,
              lastCallbackStageElapsedMs: Math.max(0, outcome.acceptedAt - outcome.callbackAt),
              lastAttemptStage: "SERVER_ACCEPTED" as const,
              lastAttemptStageAt: outcome.acceptedAt,
              lastAttemptStageElapsedMs: Math.max(0, outcome.acceptedAt - outcome.attemptStartedAt),
            }
          : {}),
      });
    }
    return merged;
  }

  private async writeUnsafe(
    state: TrackingLifecycleState,
    value: LocationRuntimeDiagnostics,
    guard?: DiagnosticsOperationGuard,
  ): Promise<boolean> {
    if (!active(guard)) return false;
    try {
      // A different JS runtime can checkpoint and compact an accepted outcome
      // between this Store's earlier read and this immutable summary write.
      // Re-read the durable journal immediately before append and carry its
      // accepted floor forward, so this stale operation cannot reset 1/null to
      // 0/null after the event key has already been compacted.
      const latest = this.storage.getAllKeys
        ? await this.readMergedUnsafe(state, guard)
        : null;
      if (!active(guard)) return false;
      const mergedValue = latest?.kind === "VALUE" && latest.value
        ? this.mergeDurableAcceptedSummaries(value, [latest.value])
        : value;
      await this.storage.setItem(`${this.scopePrefix(state)}${mergedValue.operationId}`, JSON.stringify(mergedValue));
      if (!active(guard)) return false;
      void this.pruneScope(state);
      void this.pruneAcceptedOutcomes(state);
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
    const result = await this.readMergedUnsafe(state, guard);
    if (result.kind === "FAILED") return null;
    const { value: current } = result;
    if (!active(guard) || !current || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
    return current;
  }

  /**
   * Writes confirmed server acceptance directly to its own immutable key. It is
   * intentionally not serialized behind diagnostic reads/writes, so an accepted
   * response cannot be relabelled as CALLBACK_DEADLINE_EXCEEDED by local I/O.
   */
  public async recordAcceptedOutcome(
    state: TrackingLifecycleState,
    values: Omit<AcceptedLocationOutcomeEvent, "schemaVersion" | "eventId" | "requestId" | "technicianUserId" | "startedAt" | "observedAt">,
    observedAt = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<AcceptedLocationOutcomeEvent | null> {
    const event: AcceptedLocationOutcomeEvent = {
      schemaVersion: 1,
      ...diagnosticScopeOf(state),
      eventId: this.nextOperationId(observedAt),
      observedAt,
      ...values,
    };
    if (!isValidAcceptedOutcomeEvent(event) || !active(guard)) return null;
    try {
      await this.storage.setItem(`${this.acceptedOutcomePrefix(state)}${event.eventId}`, JSON.stringify(event));
      void this.pruneAcceptedOutcomes(state);
      return active(guard) ? event : null;
    } catch {
      return null;
    }
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

  /** Bounds accepted outcome retention without making a callback wait for cleanup. */
  private async pruneAcceptedOutcomes(state: TrackingLifecycleState): Promise<void> {
    if (!this.storage.getAllKeys || !this.storage.multiGet || !this.storage.removeItem) return;
    try {
      const prefix = this.acceptedOutcomePrefix(state);
      const keys = (await this.storage.getAllKeys()).filter((key) => key.startsWith(prefix));
      const pairs = await this.storage.multiGet(keys);
      const events = pairs.flatMap(([key, raw]) => {
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : null;
          return isValidAcceptedOutcomeEvent(parsed) ? [{ key, event: parsed }] : [];
        } catch {
          return [];
        }
      });
      const summary = await this.readUnsafe(state);
      if (summary.kind === "FAILED" || !summary.value) return;
      const normalized = normalizeDiagnostics(summary.value);
      const acknowledged = new Set(normalized.acceptedOutcomeIds);
      // Only a durably written exact event id may delete an immutable outcome.
      // A timestamp/checkpoint can precede a delayed setItem and is not proof of
      // that outcome having been folded into storedCount.
      const stale = events.filter(({ event }) => acknowledged.has(event.eventId));
      await Promise.all(stale.map(({ key }) => this.storage.removeItem!(key).catch(() => undefined)));
    } catch {
      // Outcome retention is deliberately best effort. An unacknowledged event
      // is retained rather than risking a lower restored storedCount.
    }
  }

  /** Starts an exact replacement diagnostic scope after a new local share starts. */
  public begin(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const id = this.nextOperationId(now);
    return this.enqueue(() => this.enqueueScopeWrite(state, async () => {
      if (!active(guard)) return null;
      const next = createLocationRuntimeDiagnostics(state, now, id);
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    }));
  }

  /** Creates a legacy/missing record only when this exact scope has no record. */
  public ensure(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const id = this.nextOperationId(now);
    return this.enqueue(() => this.enqueueScopeWrite(state, async () => {
      const result = await this.readUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      const { value: current } = result;
      if (!active(guard)) return null;
      if (current) return current;
      const next = createLocationRuntimeDiagnostics(state, now, id);
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    }));
  }

  public patch(
    state: TrackingLifecycleState,
    patch: Partial<Omit<LocationRuntimeDiagnostics, "schemaVersion" | "requestId" | "technicianUserId" | "startedAt" | "updatedAt" | "operationId">>,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const now = Date.now();
    const id = this.nextOperationId(now);
    return this.enqueue(() => this.enqueueScopeWrite(state, async () => {
      const result = await this.readMergedUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      if (result.value && !sameDiagnosticScope(result.value, diagnosticScopeOf(state))) return null;
      if (!result.value && !this.storage.getAllKeys) return null;
      const current = result.value ?? createLocationRuntimeDiagnostics(state, now, id);
      if (!active(guard) || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      // A late same-callback deadline write has no authority over a response
      // already accepted after that callback. A genuinely newer callback has a
      // later lastCallbackAt and still records its own failure normally.
      const acceptedCoversCurrentCallback = patch.lastErrorCode === "CALLBACK_DEADLINE_EXCEEDED"
        && current.lastAcceptedAt !== null
        && (current.lastCallbackAt === null || current.lastCallbackAt <= current.lastAcceptedAt);
      const effectivePatch = acceptedCoversCurrentCallback
        ? { ...patch, lastErrorCode: null, lastErrorAt: null }
        : patch;
      const next = normalizeDiagnostics({ ...current, ...effectivePatch, updatedAt: now, operationId: id });
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    }));
  }

  /** Applies a current-scope transformation without trusting module-memory counters. */
  public update(
    state: TrackingLifecycleState,
    update: (current: LocationRuntimeDiagnostics) => LocationRuntimeDiagnostics,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    const now = Date.now();
    const id = this.nextOperationId(now);
    return this.enqueue(() => this.enqueueScopeWrite(state, async () => {
      const result = await this.readMergedUnsafe(state, guard);
      if (result.kind === "FAILED") return null;
      if (result.value && !sameDiagnosticScope(result.value, diagnosticScopeOf(state))) return null;
      if (!result.value && !this.storage.getAllKeys) return null;
      const current = result.value ?? createLocationRuntimeDiagnostics(state, now, id);
      if (!active(guard) || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      const next = normalizeDiagnostics({ ...update(current), updatedAt: now, operationId: id });
      if (!active(guard) || !sameDiagnosticScope(next, diagnosticScopeOf(state))) return null;
      return (await this.writeUnsafe(state, next, guard)) ? next : null;
    }));
  }

  /** Retains an ended session summary for the next in-app inspection without reviving it. */
  public finalize(state: TrackingLifecycleState, now = Date.now(), guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    return this.patch(state, { finalizedAt: now }, guard);
  }
}
