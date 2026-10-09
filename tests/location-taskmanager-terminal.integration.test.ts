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
      const testGlobals = globalThis as Record<string, any>;
      export default {
        getItem: async (key: string) => {
          if (key === "location_tracking_state_v2" && testGlobals.__delayOwnerRead) {
            testGlobals.__delayOwnerRead = false;
            testGlobals.__ownerReadStarted?.resolve();
            await testGlobals.__ownerReadGate;
          }
          return values.get(key) ?? null;
        },
      setItem: async (key: string, value: string) => {
        const record = key.startsWith("location_tracking_runtime_diagnostics_v2:") ? JSON.parse(value) : null;
        const unbound = key.startsWith("location_tracking_runtime_diagnostics_task_event_v2:") ? JSON.parse(value) : null;
        const acceptedOutcome = key.startsWith("location_tracking_runtime_diagnostics_accepted_outcome_v1:") ? JSON.parse(value) : null;
        if (record?.requestId === testGlobals.__delayInitialDiagnosticRequestId) {
          testGlobals.__initialDiagnosticWriteStarted?.resolve();
          await testGlobals.__initialDiagnosticWriteGate;
        }
        if (record?.requestId === testGlobals.__delayDiagnosticRequestId && record?.lastUploadStartedAt) {
          testGlobals.__diagnosticWriteStarted?.resolve();
          await testGlobals.__diagnosticWriteGate;
        }
        if (record?.requestId === testGlobals.__delayAcceptedDiagnosticRequestId && record?.lastStoredAt) {
          testGlobals.__acceptedDiagnosticWriteStarted?.resolve();
          await testGlobals.__acceptedDiagnosticWriteGate;
        }
        if (record?.requestId === testGlobals.__delayStageDiagnosticRequestId && record?.lastCallbackStage === "QUEUE") {
          testGlobals.__stageDiagnosticWriteStarted?.resolve();
          await testGlobals.__stageDiagnosticWriteGate;
        }
        if (unbound?.code === testGlobals.__delayUnboundCode) {
          testGlobals.__unboundWriteStarted?.resolve();
          await testGlobals.__unboundWriteGate;
          testGlobals.__unboundWriteCompleted?.resolve();
        }
        values.set(key, value);
      },
        removeItem: async (key: string) => { values.delete(key); },
        getAllKeys: async () => {
          const requestId = testGlobals.__delayCallbackDiagnosticReadRequestId;
          const hasScope = Number.isSafeInteger(requestId)
            && [...values.keys()].some((key) => key.includes(":" + requestId + ":"));
          if (hasScope && !testGlobals.__callbackDiagnosticReadReleased) {
            testGlobals.__callbackDiagnosticReadStarted?.resolve();
            await testGlobals.__callbackDiagnosticReadGate;
          }
          return [...values.keys()];
        },
        multiGet: async (keys: readonly string[]) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      };
      export const diagnosticRecords = () => [...values.entries()]
        .filter(([key]) => key.startsWith("location_tracking_runtime_diagnostics_v2:"))
        .map(([, value]) => JSON.parse(value));
      export const acceptedOutcomes = () => [...values.entries()]
        .filter(([key]) => key.startsWith("location_tracking_runtime_diagnostics_accepted_outcome_v1:"))
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
      let running = false;
      let stopCount = 0;
      export const hasStartedLocationUpdatesAsync = async () => running;
      export const startLocationUpdatesAsync = async () => { running = true; };
      export const stopLocationUpdatesAsync = async () => { stopCount += 1; running = false; };
      export const nativeStopCount = () => stopCount;
      export const nativeRunning = () => running;
      export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
      export const getForegroundPermissionsAsync = async () => globalThis.__foregroundPermission ?? ({ status: "granted" });
      export const getBackgroundPermissionsAsync = async () => {
        if (globalThis.__backgroundPermissionGate) {
          globalThis.__backgroundPermissionReadStarted?.resolve();
          return await globalThis.__backgroundPermissionGate;
        }
        return globalThis.__backgroundPermission ?? ({ status: "granted" });
      };
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
      // Keep production's 8s request + 2s body budget. This integration test
      // exercises the actual callback boundary; shrinking it would turn Node
      // loader scheduling into a false deadline result.
      .replace("const TASK_ENTRY_EVENT_BUDGET_MS = 750;", "const TASK_ENTRY_EVENT_BUDGET_MS = 8;")
      + "\nexport const __publishCallbackDeadlineForTest = publishCallbackDeadline;\nexport const __beginDebugCallbackForTest = (state: PersistedTrackingState) => beginDebugCallback(state, trackingLifecycle.captureGeneration());\nexport const __readRuntimeDiagnosticsForTest = (state: PersistedTrackingState) => runtimeDiagnostics.read(state);\n";
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
      // The sandbox path is unique per run. Do not add a query string here or
      // below: Node/tsx treats a query-suffixed relative task-manager import as
      // a separate module instance, so the test would invoke an empty stub.
      const tracking = await import(pathToFileURL(join(sandbox, "location-tracking-under-test.ts")).href);
      assert.equal(tracking.registerLocationTrackingTask(), true, "custom entry must register the TaskManager handler before callback delivery");
      const taskManager = await import(pathToFileURL(join(stubs, "task-manager.ts")).href);
      const nativeLocation = await import(pathToFileURL(join(stubs, "location.ts")).href) as {
        nativeStopCount: () => number;
        nativeRunning: () => boolean;
      };
      const storage = await import(pathToFileURL(join(stubs, "async-storage.ts")).href) as {
        diagnosticRecords: () => {
          requestId: number; attemptCount: number; lastErrorCode?: string | null;
          lastCallbackAt?: number | null; lastMeasuredAt?: number | null; lastStoredAt?: number | null;
        }[];
        acceptedOutcomes: () => { requestId: number }[];
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
            coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 },
          }],
        },
      };
      await taskManager.invokeTask(payload);
      assert.equal(requests, 1, "first callback must issue one terminal response request");
      for (let attempt = 0; attempt < 50 && maxAttempts(state.requestId) !== 1; attempt += 1) {
        await waitForDiagnostics();
      }
      assert.equal(
        maxAttempts(state.requestId),
        1,
        `terminal response must retain exactly one started fetch attempt; records=${JSON.stringify(storage.diagnosticRecords().filter((record) => record.requestId === state.requestId))}`,
      );

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
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
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
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
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
      const ownerReadStarted = Promise.withResolvers<void>();
      const ownerReadGate = Promise.withResolvers<void>();
      const timeoutUpdates: { serverStatus?: string; serverError?: string | null; lastCallbackDeadlineAt?: number | null }[] = [];
      const unsubscribeTimeout = tracking.subscribeDebug((next: typeof timeoutUpdates[number]) => timeoutUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        __delayOwnerRead: true,
        __ownerReadStarted: ownerReadStarted,
        __ownerReadGate: ownerReadGate.promise,
        fetch: async () => new Promise<never>(() => {}),
      });
      await tracking.startLocationTracking(timeoutState);
      const timedOutCallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await ownerReadStarted.promise;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 2));
      ownerReadGate.resolve();
      await timedOutCallback;
      await waitForDiagnostics();
      assert.equal(maxAttempts(timeoutState.requestId), 1, "timed-out fetch must retain one started attempt");
      assert.equal(timeoutUpdates.at(-1)?.serverStatus, "error", "the current callback deadline must not be hidden merely because its own attempt began after callback entry");
      assert.equal(timeoutUpdates.at(-1)?.serverError, "위치 전송 시간 제한으로 저장 여부를 확인하지 못했습니다.");
      assert.ok(timeoutUpdates.at(-1)?.lastCallbackDeadlineAt, "the current callback deadline must retain its observed timestamp");
      unsubscribeTimeout();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayOwnerRead: false,
        __ownerReadStarted: null,
        __ownerReadGate: null,
      });

      const noCredentialState = { ...state, token: "n".repeat(43), requestId: 506, startedAt: 506_000 };
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: Promise.resolve(null) });
      await tracking.startLocationTracking(noCredentialState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
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

      // A specifically classified native permission revocation is not a
      // generic task error: it invalidates the exact current share before
      // another callback can upload. A delayed old-A error, however, must not
      // stop a replacement B that begins while its unbound journal is pending.
      const permissionRevokedState = { ...state, token: "p".repeat(43), requestId: 5060, startedAt: 506_000 };
      const requestsBeforePermissionStop = requests;
      const permissionJournalStarted = Promise.withResolvers<void>();
      const releasePermissionJournal = Promise.withResolvers<void>();
      const permissionJournalCompleted = Promise.withResolvers<void>();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: "TASK_NATIVE_PERMISSION_REVOKED",
        __unboundWriteStarted: permissionJournalStarted,
        __unboundWriteGate: releasePermissionJournal.promise,
        __unboundWriteCompleted: permissionJournalCompleted,
      });
      await tracking.startLocationTracking(permissionRevokedState);
      const permissionStopBefore = nativeLocation.nativeStopCount();
      await taskManager.invokeTask({ error: { code: "E_LOCATION_UNAUTHORIZED", message: "synthetic permission revoked" } });
      await permissionJournalStarted.promise;
      assert.equal(nativeLocation.nativeStopCount(), permissionStopBefore + 1, "confirmed current permission revocation must stop native collection once");
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      assert.equal(requests, requestsBeforePermissionStop, "permission journal delay must not allow a later callback HTTP before fetch");
      assert.equal(
        (await tracking.getPersistedTrackingState())?.requestId,
        permissionRevokedState.requestId,
        "permission revocation must retain the exact resumable local session",
      );
      releasePermissionJournal.resolve();
      await permissionJournalCompleted.promise;
      assert.equal(
        storage.unboundTaskEvents().some((event: { code?: string }) => event.code === "TASK_NATIVE_PERMISSION_REVOKED"),
        true,
        "permission revocation remains separately observable without a token or coordinate",
      );
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: undefined,
        __unboundWriteStarted: undefined,
        __unboundWriteGate: undefined,
        __unboundWriteCompleted: undefined,
      });

      // A regular location callback also checks the existing permission state
      // after exact headless adoption and before sendLocationToServer. This
      // covers a revoke with no native error payload at all.
      const deniedUploadState = { ...state, token: "u".repeat(43), requestId: 50600, startedAt: 506_005 };
      const nativeStopsBeforeDeniedUpload = nativeLocation.nativeStopCount();
      const requestsBeforeDeniedUpload = requests;
      Object.assign(globalThis as Record<string, unknown>, { __backgroundPermission: { status: "denied" } });
      await tracking.startLocationTracking(deniedUploadState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      for (let attempt = 0; attempt < 20 && nativeLocation.nativeStopCount() === nativeStopsBeforeDeniedUpload; attempt += 1) {
        await waitForDiagnostics();
      }
      assert.equal(requests, requestsBeforeDeniedUpload, "denied permission must block an adopted headless callback before HTTP");
      assert.equal(nativeLocation.nativeStopCount(), nativeStopsBeforeDeniedUpload + 1, "denied permission must stop the exact adopted native share");
      Object.assign(globalThis as Record<string, unknown>, { __backgroundPermission: { status: "granted" } });

      const permissionLateA = { ...state, token: "l".repeat(43), requestId: 50601, startedAt: 506_010 };
      const permissionFreshB = { ...state, token: "m".repeat(43), requestId: 50602, startedAt: 506_020 };
      const permissionAStarted = Promise.withResolvers<void>();
      const releasePermissionA = Promise.withResolvers<void>();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: "TASK_NATIVE_PERMISSION_REVOKED",
        __unboundWriteStarted: permissionAStarted,
        __unboundWriteGate: releasePermissionA.promise,
        fetch: async () => {
          requests += 1;
          return { ok: true, status: 200, json: async () => ({ success: true, accepted: true }) };
        },
      });
      await tracking.startLocationTracking(permissionLateA);
      const delayedPermissionA = taskManager.invokeTask({ error: { code: "E_LOCATION_UNAUTHORIZED", message: "synthetic delayed A permission revoked" } });
      await permissionAStarted.promise;
      await tracking.startLocationTracking(permissionFreshB);
      const requestsBeforeFreshB = requests;
      releasePermissionA.resolve();
      await delayedPermissionA;
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      assert.equal(requests, requestsBeforeFreshB + 1, "late A permission error must not stop replacement B HTTP");
      Object.assign(globalThis as Record<string, unknown>, {
        __delayUnboundCode: undefined,
        __unboundWriteStarted: undefined,
        __unboundWriteGate: undefined,
      });

      const invalidCoordinateState = { ...state, token: "i".repeat(43), requestId: 5061, startedAt: 506_100 };
      await tracking.startLocationTracking(invalidCoordinateState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: "not-a-number", longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      const invalidDiagnostics = storage.diagnosticRecords()
        .filter((record) => record.requestId === invalidCoordinateState.requestId)
        .at(-1) as { lastCallbackAt?: number; lastErrorCode?: string; attemptCount?: number } | undefined;
      assert.ok(invalidDiagnostics?.lastCallbackAt, "adopted callback must persist its entry timestamp before coordinate validation");
      assert.equal(invalidDiagnostics?.lastErrorCode, "COORDINATE_INVALID");
      assert.equal(invalidDiagnostics?.attemptCount, 0, "coordinate rejection before fetch must retain zero attempts");

      // A confirmed accepted response must be visible immediately even when the
      // later best-effort session journal write stalls. It must not become a
      // callback-deadline error or invent a deadline timestamp as response time.
      const acceptedDelayState = { ...state, token: "r".repeat(43), requestId: 5062, startedAt: 506_200 };
      const acceptedWriteStarted = Promise.withResolvers<void>();
      const acceptedWriteGate = Promise.withResolvers<void>();
      const acceptedDebug: { serverStatus?: string; serverError?: string | null; storedCount?: number; lastResponseAt?: number | null; lastAcceptedAt?: number | null; lastCallbackDeadlineAt?: number | null }[] = [];
      const unsubscribeAccepted = tracking.subscribeDebug((next: typeof acceptedDebug[number]) => acceptedDebug.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        __delayAcceptedDiagnosticRequestId: acceptedDelayState.requestId,
        __acceptedDiagnosticWriteStarted: acceptedWriteStarted,
        __acceptedDiagnosticWriteGate: acceptedWriteGate.promise,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) }),
      });
      await tracking.startLocationTracking(acceptedDelayState);
      const acceptedCallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await acceptedWriteStarted.promise;
      await Promise.race([
        acceptedCallback,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("accepted callback waited for stalled diagnostic write")), 100)),
      ]);
      const acceptedVisible = acceptedDebug.at(-1);
      assert.equal(acceptedVisible?.serverStatus, "stored", "verified accepted response must not be relabelled as a local deadline error");
      assert.equal(acceptedVisible?.serverError, null);
      assert.equal(acceptedVisible?.storedCount, 1, "verified accepted response must increment the visible new-save count before diagnostic I/O settles");
      assert.ok(acceptedVisible?.lastAcceptedAt, "accepted timestamp must reflect the verified response");
      assert.ok(acceptedVisible?.lastResponseAt, "response timestamp must reflect the actual completed response");
      assert.equal(acceptedVisible?.lastCallbackDeadlineAt ?? null, null, "deadline timestamp must remain absent after accepted response");
      assert.equal(storage.acceptedOutcomes().filter((event: { requestId?: number }) => event.requestId === acceptedDelayState.requestId).length, 1, "accepted evidence must exist independently while the summary write is stalled");
      acceptedWriteGate.resolve();
      await waitForDiagnostics();
      assert.equal(storage.acceptedOutcomes().filter((event: { requestId?: number }) => event.requestId === acceptedDelayState.requestId).length, 0, "only the outcome checkpointed by the durable summary is eligible for cleanup");
      unsubscribeAccepted();
      Object.assign(globalThis as Record<string, unknown>, {
        __delayAcceptedDiagnosticRequestId: null,
        __acceptedDiagnosticWriteStarted: null,
        __acceptedDiagnosticWriteGate: null,
      });

      // A valid callback must persist callback/measurement evidence after fetch
      // begins, even if this scope had no prior diagnostic summary. This remains
      // detached from the HTTP critical path.
      const normalPersistenceState = { ...state, token: "u".repeat(43), requestId: 50621, startedAt: 506_210 };
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) }),
      });
      await tracking.startLocationTracking(normalPersistenceState);
      const normalMeasuredAt = Date.now();
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: normalMeasuredAt, coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const latest = storage.diagnosticRecords().filter((record) => record.requestId === normalPersistenceState.requestId).at(-1);
        if (latest?.lastCallbackAt && latest.lastMeasuredAt && latest.lastStoredAt) break;
        await waitForDiagnostics();
      }
      const normalPersisted = storage.diagnosticRecords().filter((record) => record.requestId === normalPersistenceState.requestId).at(-1);
      assert.ok(normalPersisted?.lastCallbackAt, "normal callback must persist its entry timestamp after fetch starts");
      assert.equal(normalPersisted?.lastMeasuredAt, normalMeasuredAt, "normal callback must persist its measurement timestamp without coordinates");
      assert.ok(normalPersisted?.lastStoredAt, "accepted callback must retain server save evidence");

      // A first-session diagnostic setItem can stall after native collection
      // has started. It must not prevent a later valid TaskManager callback
      // from issuing HTTP while the UI start promise is still pending.
      const initialWriteState = { ...state, token: "p".repeat(43), requestId: 5063, startedAt: 506_300 };
      const initialWriteStarted = Promise.withResolvers<void>();
      const initialWriteGate = Promise.withResolvers<void>();
      let initialWriteFetches = 0;
      Object.assign(globalThis as Record<string, unknown>, {
        __delayInitialDiagnosticRequestId: initialWriteState.requestId,
        __initialDiagnosticWriteStarted: initialWriteStarted,
        __initialDiagnosticWriteGate: initialWriteGate.promise,
        fetch: async () => {
          initialWriteFetches += 1;
          return { ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) };
        },
      });
      const initialStart = tracking.startLocationTracking(initialWriteState);
      await initialWriteStarted.promise;
      const initialWriteCallback = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      while (initialWriteFetches !== 1) await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      initialWriteGate.resolve();
      await initialWriteCallback;
      await initialStart;
      Object.assign(globalThis as Record<string, unknown>, {
        __delayInitialDiagnosticRequestId: null,
        __initialDiagnosticWriteStarted: null,
        __initialDiagnosticWriteGate: null,
      });

      // Headers are evidence of a response, while a hanging body remains a
      // separate bounded failure. Neither is reported as a completed body.
      const bodyTimeoutState = { ...state, token: "j".repeat(43), requestId: 5064, startedAt: 506_400 };
      const bodyTimeoutDebug: { serverError?: string | null; lastResponseAt?: number | null; lastResponseHeadersAt?: number | null; lastResponseBodyAt?: number | null }[] = [];
      const unsubscribeBodyTimeout = tracking.subscribeDebug((next: typeof bodyTimeoutDebug[number]) => bodyTimeoutDebug.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => ({ ok: true, status: 200, json: () => new Promise<unknown>(() => {}) }),
      });
      await tracking.startLocationTracking(bodyTimeoutState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      const bodyTimeoutVisible = bodyTimeoutDebug.at(-1);
      assert.equal(bodyTimeoutVisible?.serverError, "응답 본문 시간 초과로 위치 저장 여부를 확인하지 못했습니다.");
      assert.ok(bodyTimeoutVisible?.lastResponseHeadersAt, "HTTP headers timestamp must remain observable");
      assert.equal(bodyTimeoutVisible?.lastResponseBodyAt ?? null, null, "body timeout must not fabricate a completed-body timestamp");
      assert.equal(bodyTimeoutVisible?.lastResponseAt, bodyTimeoutVisible?.lastResponseHeadersAt, "last response remains the actual header receipt when the body did not complete");
      unsubscribeBodyTimeout();

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
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
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
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      const hasSecondResponseGate = () => responseGates.length === 2;
      while (!hasSecondResponseGate()) await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      assert.equal(displayUpdates.at(-1)?.serverStatus, "uploading", "second pending fetch must not remain stored from first acceptance");
      assert.equal(displayUpdates.at(-1)?.lastStoredAt, firstStoredAt, "pending fetch must retain the prior stored timestamp as history");
      responseGates[1]!.resolve({ ok: true, status: 200, json: async () => ({ success: true, accepted: false }) });
      await secondDisplayCallback;
      for (let attempt = 0; attempt < 50 && displayUpdates.at(-1)?.serverStatus !== "ignored"; attempt += 1) {
        await waitForDiagnostics();
      }
      assert.equal(displayUpdates.at(-1)?.serverStatus, "ignored", "ignored response must publish its own terminal display state");
      unsubscribeDisplay();

      // A completed callback owns its final response classification. Delayed
      // HTTP_HEADERS/attempt snapshots from its best-effort diagnostics must
      // not restore an earlier accepted state over a later error or ignored
      // response in the same active session.
      const finalResultState = { ...state, token: "f".repeat(43), requestId: 5071, startedAt: 507_100 };
      const finalResultUpdates: { serverStatus?: string; serverError?: string | null; lastResponseAt?: number | null; storedCount?: number }[] = [];
      const unsubscribeFinalResult = tracking.subscribeDebug((next: typeof finalResultUpdates[number]) => finalResultUpdates.push(next));
      let finalFetchCall = 0;
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => {
          finalFetchCall += 1;
          if (finalFetchCall === 1) {
            return { ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) };
          }
          if (finalFetchCall === 2) throw new Error("SYNTHETIC_FINAL_NETWORK_ERROR");
          return { ok: true, status: 200, json: async () => ({ success: true, accepted: false }) };
        },
      });
      await tracking.startLocationTracking(finalResultState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5));
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      for (let attempt = 0; attempt < 20 && finalResultUpdates.at(-1)?.serverStatus !== "error"; attempt += 1) await waitForDiagnostics();
      assert.equal(finalResultUpdates.at(-1)?.serverStatus, "error", "a later network error must remain the current final result");
      await waitForDiagnostics();
      assert.equal(finalResultUpdates.at(-1)?.serverStatus, "error", "late accepted-progress diagnostics must not restore stored over error");
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5));
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      for (let attempt = 0; attempt < 20 && finalResultUpdates.at(-1)?.serverStatus !== "ignored"; attempt += 1) await waitForDiagnostics();
      assert.equal(finalResultUpdates.at(-1)?.serverStatus, "ignored", "a later duplicate response must remain ignored");
      await waitForDiagnostics();
      assert.equal(finalResultUpdates.at(-1)?.serverStatus, "ignored", "late accepted-progress diagnostics must not restore stored over ignored");
      const finalRestored = await tracking.__readRuntimeDiagnosticsForTest(finalResultState) as { storedCount?: number; lastResponseAt?: number | null } | null;
      assert.equal(finalRestored?.storedCount, 1, "one accepted response must restore as one stored server save");
      assert.ok(finalRestored?.lastResponseAt, "the later ignored response must preserve its real response time");
      unsubscribeFinalResult();

      // Immutable accepted outcomes are the sole counting path. One and two
      // normal TaskManager acceptances must remain one and two after detached
      // diagnostics settle and after a fresh runtime reads the same storage.
      const exactCountState = { ...state, token: "x".repeat(43), requestId: 5072, startedAt: 507_200 };
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) }),
      });
      await tracking.startLocationTracking(exactCountState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      let exactRestored = await tracking.__readRuntimeDiagnosticsForTest(exactCountState) as { storedCount?: number } | null;
      assert.equal(exactRestored?.storedCount, 1, "one normal accepted callback must restore as exactly one save");
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5));
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      exactRestored = await tracking.__readRuntimeDiagnosticsForTest(exactCountState) as { storedCount?: number } | null;
      assert.equal(exactRestored?.storedCount, 2, "two normal accepted callbacks must restore as exactly two saves");

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
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
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

      // B is an actual TaskManager callback accepted for the same session.
      // A's delayed deadline is then delivered after B and must be ignored
      // rather than relabelling B's visible/persisted success as an error.
      const sameSessionState = { ...state, token: "s".repeat(43), requestId: 510, startedAt: 510_000 };
      const sameSessionUpdates: { serverStatus?: string; serverError?: string | null; lastAcceptedAt?: number | null }[] = [];
      const unsubscribeSameSession = tracking.subscribeDebug((next: typeof sameSessionUpdates[number]) => sameSessionUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) }),
      });
      await tracking.startLocationTracking(sameSessionState);
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await waitForDiagnostics();
      const acceptedBeforeLateA = sameSessionUpdates.at(-1);
      assert.equal(acceptedBeforeLateA?.serverStatus, "stored");
      assert.ok(acceptedBeforeLateA?.lastAcceptedAt);
      tracking.__publishCallbackDeadlineForTest(sameSessionState, Date.now() - 5_000);
      await waitForDiagnostics();
      assert.equal(sameSessionUpdates.at(-1)?.serverStatus, "stored", "late A deadline must not overwrite B accepted status");
      assert.equal(sameSessionUpdates.at(-1)?.serverError, null);
      const sameSessionRecords = storage.diagnosticRecords().filter((record) => record.requestId === sameSessionState.requestId);
      assert.equal(sameSessionRecords.some((record) => record.lastErrorCode === "CALLBACK_DEADLINE_EXCEEDED"), false, "late A deadline must not persist over B accepted evidence");
      unsubscribeSameSession();

      // Timestamp order is not ownership: A callback's attempt can start after
      // its entry. A later B callback owns the view, so A's late deadline must
      // not overwrite B even within the same exact session.
      const callbackOwnerState = { ...state, token: "v".repeat(43), requestId: 511, startedAt: 511_000 };
      const ownerUpdates: { serverStatus?: string; serverError?: string | null }[] = [];
      const unsubscribeOwner = tracking.subscribeDebug((next: typeof ownerUpdates[number]) => ownerUpdates.push(next));
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, updatedAt: new Date().toISOString() }) }),
      });
      await tracking.startLocationTracking(callbackOwnerState);
      const staleOwner = tracking.__beginDebugCallbackForTest(callbackOwnerState);
      assert.ok(staleOwner, "test setup must create A callback ownership before B enters");
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      tracking.__publishCallbackDeadlineForTest(callbackOwnerState, Date.now() - 5_000, staleOwner);
      await waitForDiagnostics();
      assert.equal(ownerUpdates.at(-1)?.serverStatus, "stored", "late A deadline must not overwrite B callback's verified accepted state");
      assert.equal(ownerUpdates.at(-1)?.serverError, null);
      unsubscribeOwner();

      // Body-classified terminal is authority invalidation, not a UI-only
      // result. While A waits for its 400 terminal body, B can acquire the
      // view lease and queue behind A. Releasing A must stop the exact session
      // before B drains; a later C must not make any HTTP request either.
      const bodyTerminalState = { ...state, token: "z".repeat(43), requestId: 512, startedAt: 512_000 };
      const terminalBodyStarted = Promise.withResolvers<void>();
      const releaseTerminalBody = Promise.withResolvers<void>();
      let terminalBodyRequests = 0;
      Object.assign(globalThis as Record<string, unknown>, {
        fetch: async () => {
          terminalBodyRequests += 1;
          if (terminalBodyRequests === 1) {
            return {
              ok: false,
              status: 400,
              json: async () => {
                terminalBodyStarted.resolve();
                await releaseTerminalBody.promise;
                return { success: false, code: "LOCATION_SESSION_TERMINATED", error: "synthetic terminal" };
              },
            };
          }
          return { ok: true, status: 200, json: async () => ({ success: true, accepted: true }) };
        },
      });
      await tracking.startLocationTracking(bodyTerminalState);
      const stopCountBeforeBodyTerminal = nativeLocation.nativeStopCount();
      const terminalA = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await terminalBodyStarted.promise;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5));
      const queuedB = taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      releaseTerminalBody.resolve();
      await terminalA;
      await queuedB;
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      await taskManager.invokeTask({
        data: { locations: [{ timestamp: Date.now(), coords: { latitude: 1, longitude: 1, speed: null, heading: null, accuracy: 5 } }] },
      });
      for (let attempt = 0; attempt < 20 && nativeLocation.nativeRunning(); attempt += 1) await waitForDiagnostics();
      assert.equal(terminalBodyRequests, 1, "terminal body A must block queued B and later C HTTP uploads");
      assert.equal(nativeLocation.nativeStopCount(), stopCountBeforeBodyTerminal + 1, "terminal body A must stop native collection exactly once");
      assert.equal(nativeLocation.nativeRunning(), false, "terminal body A must leave native collection stopped");
    } finally {
      Object.assign(globalThis as Record<string, unknown>, { fetch: originalFetch });
    }

    console.log("LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

export const locationTaskmanagerTerminalIntegration = main();
// `tsx` compiles this standalone runner as CJS in some Node 24 environments,
// where top-level await is unavailable. Keep one harmless handle alive until
// the exported promise settles so an unresolved fixture cannot look like PASS.
const completionKeepalive = setInterval(() => undefined, 1_000);
void locationTaskmanagerTerminalIntegration.then(
  () => clearInterval(completionKeepalive),
  (error) => {
    clearInterval(completionKeepalive);
    console.error(error);
    process.exitCode = 1;
  },
);
