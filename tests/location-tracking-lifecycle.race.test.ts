import assert from "node:assert/strict";
import {
  matchesTrackingStopAction,
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";
import { runGuardedLocationUpload } from "../lib/location-upload-guard";

type State = TrackingLifecycleState;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function within<T>(promise: Promise<T>, timeoutMs = 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`TEST_WATCHDOG_${timeoutMs}MS`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const state = (name: string, requestId: number): State => ({
  token: name.repeat(43).slice(0, 43),
  requestId,
  technicianUserId: 41,
  technicianId: 17,
  startedAt: requestId * 1000,
  trackingUrl: null,
});

function buildAdapter(overrides: Partial<TrackingLifecycleAdapter<State>> = {}) {
  let stored: State | null = null;
  const calls: string[] = [];
  const adapter: TrackingLifecycleAdapter<State> = {
    read: async () => stored,
    save: async (next) => { stored = { ...next }; calls.push(`save:${next.requestId}`); },
    clearIfSame: async (next) => {
      if (stored?.token === next.token && stored.startedAt === next.startedAt) stored = null;
      calls.push(`clear:${next.requestId}`);
    },
    showControlNotification: async (next) => { calls.push(`show:${next.requestId}`); },
    clearControlNotification: async (next) => { calls.push(`dismiss:${next?.requestId ?? "none"}`); },
    startNativeCollection: async () => { calls.push("native:start"); },
    stopNativeCollection: async () => { calls.push("native:stop"); },
    onStateChanged: (next) => { calls.push(`state:${next?.requestId ?? "none"}`); },
    ...overrides,
  };
  return { adapter, calls, readStored: () => stored };
}

async function main() {
  // A: an old credential read cannot start /update after B replaces A.
  {
    let current = "A";
    const credential = deferred<string>();
    let requests = 0;
    const pending = runGuardedLocationUpload({
      isCurrent: async () => current === "A",
      getCredential: async () => credential.promise,
      request: async () => { requests += 1; return { ok: false, status: 400 }; },
    });
    await tick();
    current = "B";
    credential.resolve("old-credential");
    assert.deepEqual(await pending, { kind: "STALE" });
    assert.equal(requests, 0);
  }

  // A response: terminal response A cannot stop B.
  {
    let current = "A";
    const response = deferred<{ ok: boolean; status: number }>();
    const pending = runGuardedLocationUpload({
      isCurrent: async () => current === "A",
      getCredential: async () => "A-token",
      request: async () => response.promise,
    });
    await tick();
    current = "B";
    response.resolve({ ok: false, status: 400 });
    assert.deepEqual(await pending, { kind: "STALE" });
  }

  // B: native FGS must start before auxiliary notification work; a stop while
  // that work is delayed must still fence and clean the native collector.
  {
    const notification = deferred<void>();
    const fixture = buildAdapter({
      showControlNotification: async (next) => {
        fixture.calls.push(`show:${next.requestId}`);
        await notification.promise;
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const pendingStart = coordinator.start(state("A", 1));
    await tick();
    const pendingStop = coordinator.stopCurrent();
    notification.resolve();
    assert.equal(await pendingStart, false);
    assert.ok(await pendingStop);
    assert.equal(fixture.readStored(), null);
    assert.ok(fixture.calls.includes("native:stop"));
    assert.ok(fixture.calls.includes("native:start"), "FGS start must not wait for the optional control notification");
  }

  // Cancellation has two distinct boundaries: it may happen before Android
  // starts collection, or after native start while the auxiliary notification is
  // still being created. In both cases authority is synchronously invalidated;
  // a started A collector is stopped and its saved intent is removed. This is
  // the logout/account-switch guard used by foreground permission recovery.
  {
    let authorized = true;
    const nativeStartEntered = deferred<void>();
    const nativeStartGate = deferred<void>();
    const notificationGate = deferred<void>();
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        fixture.calls.push("native:start");
        nativeStartEntered.resolve();
        await nativeStartGate.promise;
      },
      stopNativeCollection: async () => { fixture.calls.push("native:stop"); },
      showControlNotification: async (next) => {
        fixture.calls.push(`show:${next.requestId}`);
        await notificationGate.promise;
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const active = state("Q", 100);
    const starting = coordinator.start(active, { isStillAuthorized: () => authorized });
    await nativeStartEntered.promise;
    authorized = false;
    nativeStartGate.resolve();
    assert.equal(await within(starting), false, "cancellation during native start must reject the old recovery");
    assert.ok(fixture.calls.includes("native:start"), "test must enter native start before cancellation");
    assert.ok(fixture.calls.includes("native:stop"), `cancelled native start must be physically stopped: ${fixture.calls.join(",")}`);
    assert.equal(fixture.calls.some((call) => call.startsWith("show:")), false, "cancelled native start must not create the control notification");
    assert.equal(fixture.readStored(), null, "cancelled native start must remove only A's saved pointer");
    assert.equal(await coordinator.isCurrent(active), false, "cancelled A must not retain upload authority");
    let cancelledRequests = 0;
    assert.deepEqual(await runGuardedLocationUpload({
      isCurrent: () => coordinator.isCurrent(active),
      getCredential: async () => "old-A-token",
      request: async () => { cancelledRequests += 1; return { ok: true, status: 200 }; },
    }), { kind: "STALE" }, "cancelled A must be fenced before any later HTTP request");
    assert.equal(cancelledRequests, 0, "cancelled A must issue zero post-cleanup HTTP requests");

    // A separately started session reaches notification creation, then logout
    // begins. The notification can finish late, but cleanup still stops its
    // collector and dismisses the now-stale notification.
    authorized = true;
    const notificationStarted = deferred<void>();
    const lateNotification = deferred<void>();
    const notificationFixture = buildAdapter({
      showControlNotification: async (next) => {
        notificationFixture.calls.push(`show:${next.requestId}`);
        notificationStarted.resolve();
        await lateNotification.promise;
      },
    });
    const notificationCoordinator = new TrackingLifecycleCoordinator(notificationFixture.adapter);
    const notificationState = state("N", 101);
    const notificationStart = notificationCoordinator.start(notificationState, { isStillAuthorized: () => authorized });
    await notificationStarted.promise;
    authorized = false;
    lateNotification.resolve();
    assert.equal(await within(notificationStart), false, "cancellation during notification creation must reject the old recovery");
    assert.ok(notificationFixture.calls.includes("native:stop"), "late notification cancellation must stop the old native collector");
    assert.ok(notificationFixture.calls.includes("dismiss:101"), "late notification cancellation must dismiss only A's notification");
    assert.equal(notificationFixture.readStored(), null, "late notification cancellation must remove A's saved pointer");
    assert.equal(await notificationCoordinator.isCurrent(notificationState), false, "late notification cancellation must retain no A upload authority");
  }

  // A's cancellation cleanup may wait on native stop while a new B work is
  // claimed. The delayed cleanup guard must yield rather than stopping or
  // clearing B. Actual app adapters recheck this guard before every mutation.
  {
    let authorizedA = true;
    const nativeStarted = deferred<void>();
    const releaseOldStop = deferred<void>();
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        fixture.calls.push("native:start");
        nativeStarted.resolve();
      },
      stopNativeCollection: async (guard) => {
        fixture.calls.push("native:stop-requested");
        if (!guard?.()) return;
        await releaseOldStop.promise;
        if (guard()) fixture.calls.push("native:stop");
      },
      clearIfSame: async (next, guard) => {
        fixture.calls.push(`clear:${next.requestId}`);
        if (guard?.() && fixture.readStored()?.requestId === next.requestId) {
          // buildAdapter's closure is intentionally private; pointer safety is
          // asserted through B ownership below rather than mutating it here.
        }
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 102);
    const second = state("B", 103);
    const startingA = coordinator.start(first, { isStillAuthorized: () => authorizedA });
    await nativeStarted.promise;
    authorizedA = false;
    await tick();
    const startingB = coordinator.start(second);
    releaseOldStop.resolve();
    assert.equal(await within(startingA), false, "cancelled A must finish without regaining authority");
    assert.equal(await within(startingB), true, "B start must proceed after cancelled A cleanup yields");
    assert.equal(fixture.readStored()?.requestId, second.requestId, "late A cleanup must not clear B's saved pointer");
    assert.equal(await coordinator.isCurrent(second), true, "late A cancellation must not stop B collection authority");
  }

  // Logout/arrival calls stopCurrent() synchronously while a recovery may still
  // be inside Android start. It must request native stop before that start
  // promise resolves, then issue a guarded post-start cleanup. No location
  // callback can regain A authority during the delayed native operation.
  {
    const nativeStartEntered = deferred<void>();
    const releaseNativeStart = deferred<void>();
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        fixture.calls.push("native:start");
        nativeStartEntered.resolve();
        await releaseNativeStart.promise;
      },
      stopNativeCollection: async () => { fixture.calls.push("native:stop"); },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const active = state("L", 104);
    const starting = coordinator.start(active);
    await nativeStartEntered.promise;
    const stopping = coordinator.stopCurrent();
    assert.equal(await coordinator.isCurrent(active), false, "logout stop must synchronously revoke A upload authority before native start settles");
    assert.ok(fixture.calls.includes("native:stop"), "logout stop must immediately request physical native cleanup during start");
    assert.equal(fixture.readStored(), null, "logout stop must synchronously remove the adoptable A pointer while native start is pending");
    releaseNativeStart.resolve();
    assert.equal(await within(starting), false, "late native start completion must not report A as active");
    assert.ok(await within(stopping), "logout stop must complete after the delayed start yields");
    assert.equal(fixture.readStored(), null, "logout stop must remove the cancelled A pointer");
    assert.equal(await coordinator.isCurrent(active), false, "late start must not restore A upload authority");
  }

  // P1: a storage snapshot returned after A stop and B start cannot clear B.
  {
    const read = deferred<State | null>();
    let stored: State | null = null;
    let reads = 0;
    const fixture = buildAdapter({
      read: async () => (++reads === 1 ? read.promise : stored),
      save: async (next) => { stored = next; },
    });
    const saved = (): State | null => stored;
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 11);
    const second = state("B", 12);
    assert.equal(await coordinator.start(first), true);
    const lateTerminal = coordinator.stopIfCurrent(first);
    await tick();
    await coordinator.stopCurrent();
    assert.equal(await coordinator.start(second), true);
    read.resolve(first);
    assert.equal(await lateTerminal, null, "late A storage read must not invoke a global B stop");
    assert.equal((await coordinator.isCurrent(second)), true);
    assert.equal(saved()?.requestId, second.requestId);
  }

  // P1: restore ownership is captured before storage await; an old A cannot enqueue after B starts.
  {
    const read = deferred<State | null>();
    let stored: State | null = null;
    let reads = 0;
    const fixture = buildAdapter({
      read: async () => (++reads === 1 ? read.promise : stored),
      save: async (next) => { stored = next; },
    });
    const saved = (): State | null => stored;
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 21);
    const second = state("B", 22);
    const pendingRestore = coordinator.restoreForUser(first.technicianUserId);
    await tick();
    assert.equal(await coordinator.start(second), true);
    read.resolve(first);
    assert.equal(await pendingRestore, null, "late A restore must be cancelled before enqueue");
    assert.equal((await coordinator.isCurrent(second)), true);
    assert.equal(saved()?.requestId, second.requestId);
  }

  // P1: a cold stop fences pending restore reads but never stops an explicit replacement B.
  {
    const read = deferred<State | null>();
    let stored: State | null = null;
    let reads = 0;
    const fixture = buildAdapter({
      read: async () => (++reads === 1 ? read.promise : stored),
      save: async (next) => { stored = next; },
    });
    const saved = (): State | null => stored;
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const replacement = state("H", 23);
    const pendingColdStop = coordinator.stopCurrent();
    await tick();
    const pendingReplacement = coordinator.start(replacement);
    read.resolve(state("A", 22));
    assert.equal(await pendingColdStop, null, "cold stop must yield to an explicit replacement B");
    assert.equal(await pendingReplacement, true);
    assert.equal((await coordinator.isCurrent(replacement)), true);
    assert.equal(saved()?.requestId, replacement.requestId);
  }

  // C: stop while credential read is pending prevents old credentials from issuing /update.
  {
    const fixture = buildAdapter();
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const active = state("C", 3);
    assert.equal(await coordinator.start(active), true);
    const credential = deferred<string>();
    let requests = 0;
    const pending = runGuardedLocationUpload({
      isCurrent: () => coordinator.isCurrent(active),
      getCredential: async () => credential.promise,
      request: async () => { requests += 1; return { ok: true, status: 200 }; },
    });
    await tick();
    await coordinator.stopCurrent();
    credential.resolve("stale-login-token");
    assert.deepEqual(await pending, { kind: "STALE" });
    assert.equal(requests, 0);
  }

  // FGS start may be rejected if the technician backgrounds the app while
  // departure is starting. The saved local intent and notification must be
  // cleared so the schedule UI can stop the just-created server session and
  // ask for a foreground retry instead of claiming that tracking started.
  {
    let attempts = 0;
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        attempts += 1;
        fixture.calls.push("native:start");
        if (attempts === 1) throw new Error("FOREGROUND_SERVICE_START_DENIED");
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    await assert.rejects(() => coordinator.start(state("F", 5)), /FOREGROUND_SERVICE_START_DENIED/);
    assert.equal(fixture.readStored(), null, "failed foreground start must clear persisted tracking intent");
    assert.ok(fixture.calls.includes("native:stop"), "failed foreground start must stop any partial native collection");
    assert.ok(fixture.calls.includes("state:none"), "failed foreground start must not report active sharing");
    assert.equal(await coordinator.start(state("F", 5)), true, "foreground retry may start after the transient failure");
  }

  // P1: a failed A native start must clean A, but a synchronous replacement B
  // may claim the lifecycle while that cleanup is awaiting.  A's guard must
  // then yield without clearing B or reporting B as inactive.
  {
    const cleanupStarted = deferred<void>();
    const releaseCleanup = deferred<void>();
    let starts = 0;
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        starts += 1;
        if (starts === 1) throw new Error("A_START_DENIED");
      },
      stopNativeCollection: async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 61);
    const second = state("B", 62);
    const failedA = coordinator.start(first);
    await cleanupStarted.promise;
    const pendingB = coordinator.start(second);
    releaseCleanup.resolve();
    await assert.rejects(() => failedA, /A_START_DENIED/);
    assert.equal(await pendingB, true, "replacement B must begin after A cleanup yields");
    assert.equal(fixture.readStored()?.requestId, second.requestId, "late A cleanup must not erase B pointer");
    assert.equal(await coordinator.isCurrent(second), true, "B must remain the active lifecycle owner");
  }

  // A failed start with no replacement must remove its pointer so restore does
  // not resurrect the rejected foreground service automatically.
  {
    let starts = 0;
    const fixture = buildAdapter({
      startNativeCollection: async () => {
        starts += 1;
        throw new Error("START_DENIED");
      },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("Z", 63);
    await assert.rejects(() => coordinator.start(first), /START_DENIED/);
    assert.equal(fixture.readStored(), null, "failed A pointer must be removed before restore");
    assert.equal(await coordinator.restoreForUser(first.technicianUserId), null);
    assert.equal(starts, 1, "restore must not restart a failed A service");
  }

  // A persisted intent may outlive Android's task consumer. Reconciliation must
  // restart only the exact current state; registration itself is not treated as
  // proof that GPS callbacks or HTTP persistence are healthy.
  {
    let nativeRegistered = true;
    let nativeStarts = 0;
    const fixture = buildAdapter({
      isNativeCollectionRegistered: async () => nativeRegistered,
      startNativeCollection: async () => { nativeStarts += 1; nativeRegistered = true; },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const active = state("R", 55);
    assert.equal(await coordinator.start(active), true);
    nativeRegistered = false;
    assert.equal(await coordinator.reconcileNativeCollection(active), "restarted");
    assert.equal(nativeStarts, 2, "external native loss requires one exact-session restart");
    assert.equal(await coordinator.reconcileNativeCollection(active), "registered");
    assert.equal(nativeStarts, 2, "registration check must not restart a registered task");

    const replacement = state("S", 56);
    assert.equal(await coordinator.start(replacement), true);
    assert.equal(await coordinator.reconcileNativeCollection(active), "superseded");
    assert.equal((await coordinator.isCurrent(replacement)), true, "old A recovery cannot affect B");
  }

  // A delayed native registration check must not restart/stop replacement B.
  {
    const registration = deferred<boolean>();
    let nativeStarts = 0;
    const fixture = buildAdapter({
      isNativeCollectionRegistered: async () => registration.promise,
      startNativeCollection: async () => { nativeStarts += 1; },
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 57);
    const second = state("B", 58);
    assert.equal(await coordinator.start(first), true);
    const delayedA = coordinator.reconcileNativeCollection(first);
    await tick();
    const pendingB = coordinator.start(second);
    await tick();
    registration.resolve(false);
    assert.equal(await within(pendingB), true, "B start must not wait for A registration query");
    assert.equal(await within(delayedA), "superseded");
    assert.equal(nativeStarts, 2, "A must not restart native collection after B owns the lifecycle");
    assert.equal((await coordinator.isCurrent(second)), true);
  }

  // A permanently delayed registration query must not block B stop either.
  {
    const registration = deferred<boolean>();
    const fixture = buildAdapter({
      isNativeCollectionRegistered: async () => registration.promise,
    });
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 59);
    const second = state("B", 60);
    assert.equal(await coordinator.start(first), true);
    const delayedA = coordinator.reconcileNativeCollection(first);
    await tick();
    assert.equal(await within(coordinator.start(second)), true);
    assert.ok(await within(coordinator.stopCurrent()), "B stop must not wait for A registration query");
    registration.resolve(false);
    assert.equal(await within(delayedA), "superseded");
    assert.equal(fixture.readStored(), null);
    assert.ok(fixture.calls.includes("native:stop"));
  }

  // Stale notification action cannot terminate a replacement customer's share.
  {
    const first = state("F", 6);
    const second = state("G", 7);
    assert.equal(matchesTrackingStopAction(second, { trackingControl: "stop", requestId: first.requestId, startedAt: first.startedAt }), false);
    assert.equal(matchesTrackingStopAction(second, { trackingControl: "stop", requestId: second.requestId, startedAt: second.startedAt }), true);
  }

  console.log("LOCATION_TRACKING_LIFECYCLE_RACE_PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
