import assert from "node:assert/strict";
import { classifyLocationUpdateResponse } from "../lib/location-upload-scheduler";
import {
  TrackingLifecycleCoordinator,
  type TrackingLifecycleAdapter,
  type TrackingLifecycleState,
} from "../lib/location-tracking-lifecycle";
import { runGuardedLocationUpload } from "../lib/location-upload-guard";

type State = TrackingLifecycleState;

const state: State = {
  token: "t".repeat(43), requestId: 91, technicianUserId: 51, technicianId: 19, startedAt: 91_000, trackingUrl: null,
};

function adapterFor(calls: string[]): TrackingLifecycleAdapter<State> {
  let stored: State | null = null;
  return {
    read: async () => stored,
    save: async (next) => { stored = next; },
    clearIfSame: async (next) => { if (stored?.token === next.token && stored.startedAt === next.startedAt) stored = null; },
    showControlNotification: async () => {},
    clearControlNotification: async () => {},
    startNativeCollection: async () => { calls.push("native:start"); },
    stopNativeCollection: async () => { calls.push("native:stop"); },
    onStateChanged: (next) => { calls.push(next ? "state:active" : "state:stopped"); },
  };
}

async function main() {
  const terminalCases = [
    { status: 400, payload: { code: "LOCATION_SESSION_TERMINATED" } },
    { status: 400, payload: { code: "LOCATION_SESSION_EXPIRED" } },
    { status: 400, payload: { code: "LOCATION_ASSIGNMENT_CHANGED" } },
    { status: 409, payload: null },
  ] as const;

  for (const terminal of terminalCases) {
    assert.equal(classifyLocationUpdateResponse(terminal.status, terminal.payload), "terminal");
    const calls: string[] = [];
    const lifecycle = new TrackingLifecycleCoordinator(adapterFor(calls));
    assert.equal(await lifecycle.start(state), true);
    assert.ok(await lifecycle.stopForTerminalResponse(state), "terminal response must stop its exact native session");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(calls.includes("native:stop"));
    assert.equal(await lifecycle.isCurrent(state), false);

    let requests = 0;
    const result = await runGuardedLocationUpload({
      isCurrent: () => lifecycle.isCurrent(state),
      getCredential: async () => "technician-bearer",
      request: async () => { requests += 1; return { status: 200, ok: true }; },
    });
    assert.deepEqual(result, { kind: "STALE" });
    assert.equal(requests, 0, "no follow-up /api/location/update may be issued after terminal stop");
  }

  console.log("LOCATION_TERMINAL_RESPONSE_INTEGRATION_PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
