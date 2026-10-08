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

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type DiagnosticsOperationGuard = () => boolean;

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

export function createLocationRuntimeDiagnostics(
  state: TrackingLifecycleState,
  now = Date.now(),
): LocationRuntimeDiagnostics {
  return {
    schemaVersion: 1,
    ...diagnosticScopeOf(state),
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

function active(guard?: DiagnosticsOperationGuard): boolean {
  return !guard || guard();
}

/**
 * All read-modify-write operations share one serialized queue. A stale session
 * can therefore never overwrite diagnostics that have already been initialized
 * for a replacement customer/technician session. A callback deadline guard is
 * rechecked after each awaited storage boundary, so a late operation may not
 * write or emit state after its TaskManager callback has expired.
 */
export class LocationRuntimeDiagnosticsStore {
  private writes: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = "location_tracking_runtime_diagnostics_v1",
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.catch(() => undefined);
    return next;
  }

  /**
   * A TaskManager deadline may detach a hung best-effort storage promise. The
   * operation itself received an inactive guard and cannot write after it later
   * resolves; releasing this chain lets the next native callback record its own
   * diagnostic and continue to upload instead of inheriting the old stall.
   */
  public releaseExpiredWork(): void {
    this.writes = Promise.resolve();
  }

  private async readUnsafe(guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    if (!active(guard)) return null;
    try {
      const raw = await this.storage.getItem(this.key);
      if (!active(guard) || !raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isValidDiagnostics(parsed) ? normalizeDiagnostics(parsed) : null;
    } catch {
      return null;
    }
  }

  private async writeUnsafe(value: LocationRuntimeDiagnostics, guard?: DiagnosticsOperationGuard): Promise<boolean> {
    if (!active(guard)) return false;
    try {
      await this.storage.setItem(this.key, JSON.stringify(value));
      return active(guard);
    } catch {
      // Diagnostics are intentionally best effort and must not block collection.
      return false;
    }
  }

  public async read(state: TrackingLifecycleState, guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    const current = await this.readUnsafe(guard);
    return active(guard) && sameDiagnosticScope(current, diagnosticScopeOf(state)) ? current : null;
  }

  /** Starts an exact replacement diagnostic scope after a new local share starts. */
  public begin(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    return this.enqueue(async () => {
      if (!active(guard)) return null;
      const next = createLocationRuntimeDiagnostics(state, now);
      return (await this.writeUnsafe(next, guard)) ? next : null;
    });
  }

  /** Creates a legacy/missing record only when no other session diagnostic exists. */
  public ensure(
    state: TrackingLifecycleState,
    now = Date.now(),
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    return this.enqueue(async () => {
      const current = await this.readUnsafe(guard);
      if (!active(guard)) return null;
      if (sameDiagnosticScope(current, diagnosticScopeOf(state))) return current;
      if (current) return null;
      const next = createLocationRuntimeDiagnostics(state, now);
      return (await this.writeUnsafe(next, guard)) ? next : null;
    });
  }

  public patch(
    state: TrackingLifecycleState,
    patch: Partial<Omit<LocationRuntimeDiagnostics, "schemaVersion" | "requestId" | "technicianUserId" | "startedAt">>,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    return this.enqueue(async () => {
      const current = await this.readUnsafe(guard);
      if (!active(guard) || !current || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      const next = normalizeDiagnostics({ ...current, ...patch });
      return (await this.writeUnsafe(next, guard)) ? next : null;
    });
  }

  /** Applies a current-scope transformation without trusting module-memory counters. */
  public update(
    state: TrackingLifecycleState,
    update: (current: LocationRuntimeDiagnostics) => LocationRuntimeDiagnostics,
    guard?: DiagnosticsOperationGuard,
  ): Promise<LocationRuntimeDiagnostics | null> {
    return this.enqueue(async () => {
      const current = await this.readUnsafe(guard);
      if (!active(guard) || !current || !sameDiagnosticScope(current, diagnosticScopeOf(state))) return null;
      const next = normalizeDiagnostics(update(current));
      if (!active(guard) || !sameDiagnosticScope(next, diagnosticScopeOf(state))) return null;
      return (await this.writeUnsafe(next, guard)) ? next : null;
    });
  }

  /** Retains an ended session summary for the next in-app inspection without reviving it. */
  public finalize(state: TrackingLifecycleState, now = Date.now(), guard?: DiagnosticsOperationGuard): Promise<LocationRuntimeDiagnostics | null> {
    return this.patch(state, { finalizedAt: now }, guard);
  }
}
