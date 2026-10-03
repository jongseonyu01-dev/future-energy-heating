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

  // B: stop during delayed notification start cannot revive native collection.
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
    assert.ok(!fixture.calls.includes("native:start"));
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
    assert.equal(stored?.requestId, second.requestId);
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
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const first = state("A", 21);
    const second = state("B", 22);
    const pendingRestore = coordinator.restoreForUser(first.technicianUserId);
    await tick();
    assert.equal(await coordinator.start(second), true);
    read.resolve(first);
    assert.equal(await pendingRestore, null, "late A restore must be cancelled before enqueue");
    assert.equal((await coordinator.isCurrent(second)), true);
    assert.equal(stored?.requestId, second.requestId);
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
    const coordinator = new TrackingLifecycleCoordinator(fixture.adapter);
    const replacement = state("H", 23);
    const pendingColdStop = coordinator.stopCurrent();
    await tick();
    const pendingReplacement = coordinator.start(replacement);
    read.resolve(state("A", 22));
    assert.equal(await pendingColdStop, null, "cold stop must yield to an explicit replacement B");
    assert.equal(await pendingReplacement, true);
    assert.equal((await coordinator.isCurrent(replacement)), true);
    assert.equal(stored?.requestId, replacement.requestId);
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
