import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);

const state = {
  token: "t".repeat(43),
  requestId: 501,
  technicianUserId: 61,
  technicianId: 23,
  startedAt: 501_000,
  trackingUrl: null,
};

const replacementState = {
  token: "r".repeat(43),
  requestId: 502,
  technicianUserId: 61,
  technicianId: 23,
  startedAt: 502_000,
  trackingUrl: null,
};

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "location-taskmanager-terminal."));
  const stubs = join(sandbox, "stubs");
  try {
    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "react-native.ts"), 'export const Platform = { OS: "android" };\n');
    await writeFile(join(stubs, "async-storage.ts"), `
      const values = new Map<string, string>();
      export default {
        getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        const record = key.startsWith("location_tracking_runtime_diagnostics_v2:") ? JSON.parse(value) : null;
        const unbound = key.startsWith("location_tracking_runtime_diagnostics_task_event_v2:") ? JSON.parse(value) : null;
        const testGlobals = globalThis as Record<string, any>;
        if (record?.requestId === testGlobals.__delayDiagnosticRequestId && record?.lastUploadStartedAt) {
          testGlobals.__diagnosticWriteStarted?.resolve();
          await testGlobals.__diagnosticWriteGate;
        }
        if (unbound?.code === testGlobals.__delayUnboundCode) {
          testGlobals.__unboundWriteStarted?.resolve();
          await testGlobals.__unboundWriteGate;
          testGlobals.__unboundWriteCompleted?.resolve();
        }
        values.set(key, value);
      },
        removeItem: async (key: string) => { values.delete(key); },
        getAllKeys: async () => [...values.keys()],
        multiGet: async (keys: readonly string[]) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      };
      export const diagnosticRecords = () => [...values.entries()]
        .filter(([key]) => key.startsWith("location_tracking_runtime_diagnostics_v2:"))
        .map(([, value]) => JSON.parse(value));
      export const unboundTaskEvents = () => [...values.entries()]
        .filter(([key]) => key.startsWith("location_tracking_runtime_diagnostics_task_event_v2:"))
        .map(([, value]) => JSON.parse(value));
    `);
    await writeFile(join(stubs, "notifications.ts"), `
      export const IosAuthorizationStatus = { PROVISIONAL: 3 };
      export const setNotificationHandler = () => undefined;
      export const setNotificationCategoryAsync = async () => undefined;
      export const scheduleNotificationAsync = async () => "notification";
      export const cancelScheduledNotificationAsync = async () => undefined;
      export const dismissNotificationAsync = async () => undefined;
      export const getPresentedNotificationsAsync = async () => [];
      export const requestPermissionsAsync = async () => ({ granted: true });
      export const addNotificationResponseReceivedListener = () => ({ remove: () => undefined });
      export const getLastNotificationResponseAsync = async () => null;
    `);
    await writeFile(join(stubs, "location.ts"), `
      export const Accuracy = { High: 1 };
      export const hasStartedLocationUpdatesAsync = async () => true;
      export const startLocationUpdatesAsync = async () => undefined;
      export const stopLocationUpdatesAsync = async () => undefined;
      export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
      export const getCurrentPositionAsync = async () => null;
    `);
    await writeFile(join(stubs, "task-manager.ts"), `
      let task: ((payload: unknown) => Promise<void>) | null = null;
      export const isTaskDefined = () => false;
      export const defineTask = (_name: string, callback: (payload: unknown) => Promise<void>) => { task = callback; };
      export const invokeTask = async (payload: unknown) => { if (!task) throw new Error("TASK_NOT_REGISTERED"); await task(payload); };
    `);
    await writeFile(join(stubs, "constants.ts"), 'export default { nativeAppVersion: "test", nativeBuildVersion: "0", expoConfig: null };\n');
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => globalThis.__tokenGate ? await globalThis.__tokenGate : "technician-bearer"; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), `
      export const buildLocationRequestHeaders = (token: string | null) => token ? { Authorization: "Bearer " + token } : null;
      export const formatLocationRequestFailure = () => "";
    `);
    await writeFile(join(stubs, "status-overlay.ts"), `
      export type LocationStatusOverlayPresentation = { statusText: string; lastStoredAt: number | null };
      let owner: { ownerId: string; generation: number } | null = null;
      export const activateLocationStatusOverlayOwner = (state: { requestId: number; technicianUserId: number; startedAt: number }) => {
        owner = { ownerId: state.requestId + ":" + state.technicianUserId + ":" + state.startedAt, generation: (owner?.generation ?? 0) + 1 };
        return owner;
      };
      export const getLocationStatusOverlayOwner = () => owner;
      export const invalidateActiveLocationStatusOverlayOwner = () => { owner = null; };
      export const invalidateLocationStatusOverlayOwner = () => { owner = null; };
      export const synchronizeLocationStatusOverlayOwner = async () => true; export const updateVisibleLocationStatusOverlay = async () => ({ available: false, permission: false, visible: false });
    `);

    const source = await readFile(join(root, "lib/location-tracking.ts"), "utf8");
    const transformed = source
      .replace('import { Platform } from "react-native";', 'import { Platform } from "./stubs/react-native.ts";')
      .replace('import AsyncStorage from "@react-native-async-storage/async-storage";', 'import AsyncStorage from "./stubs/async-storage.ts";')
      .replace('import * as Notifications from "expo-notifications";', 'import * as Notifications from "./stubs/notifications.ts";')
      .replace('import * as Location from "expo-location";', 'import * as Location from "./stubs/location.ts";')
      .replace('import * as TaskManager from "expo-task-manager";', 'import * as TaskManager from "./stubs/task-manager.ts";')
      .replace('import Constants from "expo-constants";', 'import Constants from "./stubs/constants.ts";')
      .replace('import { getApiBaseUrl } from "@/constants/oauth";', 'import { getApiBaseUrl } from "./stubs/oauth.ts";')
      .replace('import * as Auth from "@/lib/_core/auth";', 'import * as Auth from "./stubs/auth.ts";')
      .replace('import { buildLocationRequestHeaders, formatLocationRequestFailure } from "@/lib/location-request-auth";', 'import { buildLocationRequestHeaders, formatLocationRequestFailure } from "./stubs/request-auth.ts";')
      .replace('import { activateLocationStatusOverlayOwner, getLocationStatusOverlayOwner, invalidateActiveLocationStatusOverlayOwner, invalidateLocationStatusOverlayOwner, synchronizeLocationStatusOverlayOwner, updateVisibleLocationStatusOverlay, type LocationStatusOverlayPresentation } from "@/lib/location-status-overlay";', 'import { activateLocationStatusOverlayOwner, getLocationStatusOverlayOwner, invalidateActiveLocationStatusOverlayOwner, invalidateLocationStatusOverlayOwner, synchronizeLocationStatusOverlayOwner, updateVisibleLocationStatusOverlay, type LocationStatusOverlayPresentation } from "./stubs/status-overlay.ts";')
      .replace('} from "@/lib/location-upload-scheduler";', `} from ${JSON.stringify(join(root, "lib/location-upload-scheduler.ts"))};`)
      .replace('} from "@/lib/location-runtime-diagnostics";', `} from ${JSON.stringify(join(root, "lib/location-runtime-diagnostics.ts"))};`)
      .replace('import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from "@/lib/location-runtime-status";', `import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from ${JSON.stringify(join(root, "lib/location-runtime-status.ts"))};`)
      .replace('import { parseJsonWithin } from "@/lib/location-upload-response";', `import { parseJsonWithin } from ${JSON.stringify(join(root, "lib/location-upload-response.ts"))};`)
      .replace('} from "@/lib/location-tracking-lifecycle";', `} from ${JSON.stringify(join(root, "lib/location-tracking-lifecycle.ts"))};`)
      .replace('import { runGuardedLocationUpload } from "@/lib/location-upload-guard";', `import { runGuardedLocationUpload } from ${JSON.stringify(join(root, "lib/location-upload-guard.ts"))};`)
      .replace('import {\n  adoptHeadlessTrackingWithCredential,\n  adoptHeadlessTrackingWithCredentialResult,\n} from "@/lib/location-tracking-runtime";', `import { adoptHeadlessTrackingWithCredential, adoptHeadlessTrackingWithCredentialResult } from ${JSON.stringify(join(root, "lib/location-tracking-runtime.ts"))};`)
      .replace('} from "@/lib/location-task-budget";', `} from ${JSON.stringify(join(root, "lib/location-task-budget.ts"))};`)
      // Preserve a bounded callback deadline while leaving enough scheduling
      // room for the genuine terminal path. A 4ms Node transform was flaky and
      // could expire before the mocked immediate HTTP response was classified.
      .replace("const TASK_CALLBACK_NETWORK_BUDGET_MS = 8_000;", "const TASK_CALLBACK_NETWORK_BUDGET_MS = 40;")
      .replace("const RESPONSE_BODY_TIMEOUT_MS = 2_000;", "const RESPONSE_BODY_TIMEOUT_MS = 5;")
      .replace("const TASK_ENTRY_EVENT_BUDGET_MS = 750;", "const TASK_ENTRY_EVENT_BUDGET_MS = 8;");
    await writeFile(join(sandbox, "location-tracking-under-test.ts"), transformed);

    let requests = 0;
    const originalFetch = globalThis.fetch;
    Object.assign(globalThis as Record<string, unknown>, {
      fetch: async () => {
        requests += 1;
        return { ok: false, status: 409, json: async () => null };
      },
    });
    try {
      const tracking = await import(`${pathToFileURL(join(sandbox, "location-tracking-under-test.ts")).href}?v=${Date.now()}`);
      assert.equal(tracking.registerLocationTrackingTask(), true, "custom entry must register the TaskManager handler before callback delivery");
      const taskManager = await import(`${pathToFileURL(join(stubs, "task-manager.ts")).href}?v=${Date.now()}`);
      const storage = await import(pathToFileURL(join(stubs, "async-storage.ts")).href) as {
        diagnosticRecords: () => { requestId: number; attemptCount: number }[];
        unboundTaskEvents: () => { observedAt: number; code: string }[];
      };
      const waitForDiagnostics = async () => {
        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      };
      const maxAttempts = (requestId: number) => Math.max(
        0,
        ...storage.diagnosticRecords()
          .filter((record) => record.requestId === requestId)
          .map((record) => record.attemptCount),
      );
      assert.equal(await tracking.startLocationTracking(state), undefined);
      const payload = {
        data: {
          locations: [{
            timestamp: Date.now(),
            coords: { latitude: 37.5, longitude: 127.0, speed: null, heading: null, accuracy: 5 },
          }],
        },
      };
      await taskManager.invokeTask(payload);
      assert.equal(requests, 1, "first callback must issue one terminal response request");
      await waitForDiagnostics();
      assert.equal(maxAttempts(state.requestId), 1, "terminal response must retain exactly one started fetch attempt");

      await taskManager.invokeTask(payload);
      assert.equal(requests, 1, "terminal marker must block next TaskManager callback before HTTP");

      // P2: an old preparation timeout must not set the debug error over a new
      // B share that begins before A's held credential read completes.
      const debugUpdates: { serverError?: string | null }[] = [];
      const unsubscribe = tracking.subscribeDebug((next: { serverError?: string | null }) => debugUpdates.push(next));
      debugUpdates.length = 0;
      const tokenGate = Promise.withResolvers<string>();
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: tokenGate.promise });
      const stateC = { ...state, token: "c".repeat(43), requestId: 503, startedAt: 503_000 };
      await tracking.startLocationTracking(stateC);
      const delayedA = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 37.6, longitude: 127.1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      await tracking.startLocationTracking(replacementState);
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 60));
      assert.equal(
        debugUpdates.some((next) => next.serverError === "위치 전송 준비 시간 제한으로 저장 여부를 확인하지 못했습니다."),
        false,
        "expired A preparation must not publish an error over replacement B",
      );
      tokenGate.resolve("technician-bearer");
      await delayedA;
      unsubscribe();
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: null });

      // A rejected fetch has no Response object, but it did begin one real HTTP
      // attempt.  The callback must record exactly one attempt while a
      // credential failure before fetch would remain at zero.
      const failedFetchState = { ...state, token: "e".repeat(43), requestId: 504, startedAt: 504_000 };
      const failureDebugUpdates: { attemptCount?: number; serverError?: string | null }[] = [];
      const unsubscribeFailure = tracking.subscribeDebug((next: { attemptCount?: number; serverError?: string | null }) => failureDebugUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => {
          requests += 1;
          throw new Error("SYNTHETIC_NETWORK_REJECT");
        },
      });
      await tracking.startLocationTracking(failedFetchState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 37.7, longitude: 127.2, speed: null, heading: null, accuracy: 5 } }] },
      });
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      assert.equal(failureDebugUpdates.at(-1)?.attemptCount, 1, "one rejected fetch must increment attemptCount exactly once");
      assert.equal(failureDebugUpdates.at(-1)?.serverError, "네트워크 연결을 기다리는 중");
      await waitForDiagnostics();
      assert.equal(maxAttempts(failedFetchState.requestId), 1, "network rejection must retain one started fetch attempt");
      unsubscribeFailure();

      // An abort/timeout is also a started fetch. Conversely, a missing
      // credential is rejected before fetch and therefore remains at zero.
      const timeoutState = { ...state, token: "q".repeat(43), requestId: 505, startedAt: 505_000 };
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => new Promise<never>(() => {}),
      });
      await tracking.startLocationTracking(timeoutState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 37.8, longitude: 127.3, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      assert.equal(maxAttempts(timeoutState.requestId), 1, "timed-out fetch must retain one started attempt");

      const noCredentialState = { ...state, token: "n".repeat(43), requestId: 506, startedAt: 506_000 };
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: Promise.resolve(null) });
      await tracking.startLocationTracking(noCredentialState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 37.9, longitude: 127.4, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      assert.equal(maxAttempts(noCredentialState.requestId), 0, "credential failure before fetch must retain zero attempts");
      assert.equal(storage.unboundTaskEvents().at(-1)?.code, "NO_CREDENTIAL", "unbound credential failure must be durable without guessing a session owner");
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: null });

      // Callback arrival and preparation failures are distinct from a callback
      // that has not been observed. Neither may be attributed to the active
      // customer session before adoption succeeds.
      await taskManager.invokeTask({ error: new Error("SYNTHETIC_NATIVE_TASK_ERROR") });
      assert.equal(storage.unboundTaskEvents().at(-1)?.code, "TASK_NATIVE_ERROR");
      await taskManager.invokeTask({ data: { locations: [] } });
      assert.equal(storage.unboundTaskEvents().at(-1)?.code, "NO_FRESH_MEASUREMENT");

      // The callback's bounded 8ms diagnostic window must not let an
      // already-issued A write overwrite B after A returns. This uses the real
      // TaskManager callback, not the store helper in isolation.
      const lateAStarted = Promise.withResolvers<void>();
      const lateAGate = Promise.withResolvers<void>();
      const lateACompleted = Promise.withResolvers<void>();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: "TASK_NATIVE_ERROR",
        __unboundWriteStarted: lateAStarted,
        __unboundWriteGate: lateAGate.promise,
        __unboundWriteCompleted: lateACompleted,
      });
      await taskManager.invokeTask({ error: new Error("SYNTHETIC_DELAYED_A") });
      await lateAStarted.promise;
      await taskManager.invokeTask({ data: { locations: [] } });
      lateAGate.resolve();
      await Promise.race([
        lateACompleted.promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late A unbound write did not settle")), 1_000)),
      ]);
      await waitForDiagnostics();
      const latestUnbound = await tracking.getLatestUnboundLocationTaskEvent();
      assert.equal(latestUnbound?.code, "NO_FRESH_MEASUREMENT", "late A must not replace newer B unbound evidence");
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: undefined,
        __unboundWriteStarted: undefined,
        __unboundWriteGate: undefined,
        __unboundWriteCompleted: undefined,
      });

      const invalidCoordinateState = { ...state, token: "i".repeat(43), requestId: 5061, startedAt: 506_100 };
      await tracking.startLocationTracking(invalidCoordinateState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: "not-a-number", longitude: 127.45, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      const invalidDiagnostics = storage.diagnosticRecords()
        .filter((record) => record.requestId === invalidCoordinateState.requestId)
        .at(-1) as { lastCallbackAt?: number; lastErrorCode?: string; attemptCount?: number } | undefined;
      assert.ok(invalidDiagnostics?.lastCallbackAt, "adopted callback must persist its entry timestamp before coordinate validation");
      assert.equal(invalidDiagnostics?.lastErrorCode, "COORDINATE_INVALID");
      assert.equal(invalidDiagnostics?.attemptCount, 0, "coordinate rejection before fetch must retain zero attempts");

      // A stored result is historical evidence only. A following actual fetch
      // must remain "uploading" until its own response is classified.
      const displayState = { ...state, token: "d".repeat(43), requestId: 507, startedAt: 507_000 };
      const responseGates: { resolve: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void }[] = [];
      const displayUpdates: {
        serverStatus?: string; lastStoredAt?: number | null; serverError?: string | null;
      }[] = [];
      const unsubscribeDisplay = tracking.subscribeDebug((next: {
        serverStatus?: string; lastStoredAt?: number | null; serverError?: string | null;
      }) => displayUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => {
          requests += 1;
          const gate = Promise.withResolvers<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
          responseGates.push(gate);
          return gate.promise;
        },
      });
      await tracking.startLocationTracking(displayState);
      const firstDisplayCallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 38.0, longitude: 127.5, speed: null, heading: null, accuracy: 5 } }] },
      });
      while (responseGates.length !== 1) await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      assert.equal(displayUpdates.at(-1)?.serverStatus, "uploading", "started fetch must publish uploading, not prior storage evidence");
      responseGates[0]!.resolve({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) });
      await firstDisplayCallback;
      await waitForDiagnostics();
      const firstStoredAt = displayUpdates.at(-1)?.lastStoredAt;
      assert.equal(displayUpdates.at(-1)?.serverStatus, "stored", "accepted response must publish stored");

      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 2));
      const secondDisplayCallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 38.1, longitude: 127.6, speed: null, heading: null, accuracy: 5 } }] },
      });
      const hasSecondResponseGate = () => responseGates.length === 2;
      while (!hasSecondResponseGate()) await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      assert.equal(displayUpdates.at(-1)?.serverStatus, "uploading", "second pending fetch must not remain stored from first acceptance");
      assert.equal(displayUpdates.at(-1)?.lastStoredAt, firstStoredAt, "pending fetch must retain the prior stored timestamp as history");
      responseGates[1]!.resolve({ ok: true, status: 200, json: async () => ({ success: true, accepted: false }) });
      await secondDisplayCallback;
      await waitForDiagnostics();
      assert.equal(displayUpdates.at(-1)?.serverStatus, "ignored", "ignored response must publish its own terminal display state");
      unsubscribeDisplay();

      // A's durable attempt history may finish late, but only B owns the current
      // debug view. The exact module must not emit A counters/status over B.
      const staleA = { ...state, token: "a".repeat(43), requestId: 508, startedAt: 508_000 };
      const freshB = { ...state, token: "b".repeat(43), requestId: 509, startedAt: 509_000 };
      const delayedAttemptWrite = Promise.withResolvers<void>();
      const delayedAttemptStarted = Promise.withResolvers<void>();
      const replacementUpdates: {
        serverStatus?: string; attemptCount?: number; storedCount?: number; serverError?: string | null;
      }[] = [];
      const unsubscribeReplacement = tracking.subscribeDebug((next: {
        serverStatus?: string; attemptCount?: number; storedCount?: number; serverError?: string | null;
      }) => replacementUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        __delayDiagnosticRequestId: staleA.requestId,
        __diagnosticWriteGate: delayedAttemptWrite.promise,
        __diagnosticWriteStarted: delayedAttemptStarted,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true }) }),
      });
      await tracking.startLocationTracking(staleA);
      const delayedACallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 38.2, longitude: 127.7, speed: null, heading: null, accuracy: 5 } }] },
      });
      await delayedAttemptStarted.promise;
      const startingB = tracking.startLocationTracking(freshB);
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      delayedAttemptWrite.resolve();
      await delayedACallback;
      await startingB;
      await waitForDiagnostics();
      assert.equal(replacementUpdates.at(-1)?.serverStatus, "idle", "late A attempt must not overwrite fresh B's idle view");
      assert.equal(replacementUpdates.at(-1)?.attemptCount, 0, "late A attempt count must not appear on fresh B");
      assert.equal(replacementUpdates.at(-1)?.storedCount, 0, "late A accepted result must not appear on fresh B");
      unsubscribeReplacement();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayDiagnosticRequestId: null,
        __diagnosticWriteGate: null,
        __diagnosticWriteStarted: null,
      });
    } finally {
      Object.assign(globalThis as Record<string, unknown>, { fetch: originalFetch });
    }

    console.log("LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

export const locationTaskmanagerTerminalIntegration = main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  throw error;
});
