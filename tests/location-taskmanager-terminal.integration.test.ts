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
        setItem: async (key: string, value: string) => { values.set(key, value); },
        removeItem: async (key: string) => { values.delete(key); },
        getAllKeys: async () => [...values.keys()],
        multiGet: async (keys: readonly string[]) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
      };
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
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => globalThis.__tokenGate ? await globalThis.__tokenGate : "technician-bearer"; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), `
      export const buildLocationRequestHeaders = (token: string | null) => token ? { Authorization: "Bearer " + token } : null;
      export const formatLocationRequestFailure = () => "";
    `);

    const source = await readFile(join(root, "lib/location-tracking.ts"), "utf8");
    const transformed = source
      .replace('import { Platform } from "react-native";', 'import { Platform } from "./stubs/react-native.ts";')
      .replace('import AsyncStorage from "@react-native-async-storage/async-storage";', 'import AsyncStorage from "./stubs/async-storage.ts";')
      .replace('import * as Notifications from "expo-notifications";', 'import * as Notifications from "./stubs/notifications.ts";')
      .replace('import * as Location from "expo-location";', 'import * as Location from "./stubs/location.ts";')
      .replace('import * as TaskManager from "expo-task-manager";', 'import * as TaskManager from "./stubs/task-manager.ts";')
      .replace('import { getApiBaseUrl } from "@/constants/oauth";', 'import { getApiBaseUrl } from "./stubs/oauth.ts";')
      .replace('import * as Auth from "@/lib/_core/auth";', 'import * as Auth from "./stubs/auth.ts";')
      .replace('import { buildLocationRequestHeaders, formatLocationRequestFailure } from "@/lib/location-request-auth";', 'import { buildLocationRequestHeaders, formatLocationRequestFailure } from "./stubs/request-auth.ts";')
      .replace('} from "@/lib/location-upload-scheduler";', `} from ${JSON.stringify(join(root, "lib/location-upload-scheduler.ts"))};`)
      .replace('} from "@/lib/location-runtime-diagnostics";', `} from ${JSON.stringify(join(root, "lib/location-runtime-diagnostics.ts"))};`)
      .replace('import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from "@/lib/location-runtime-status";', `import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from ${JSON.stringify(join(root, "lib/location-runtime-status.ts"))};`)
      .replace('import { parseJsonWithin } from "@/lib/location-upload-response";', `import { parseJsonWithin } from ${JSON.stringify(join(root, "lib/location-upload-response.ts"))};`)
      .replace('} from "@/lib/location-tracking-lifecycle";', `} from ${JSON.stringify(join(root, "lib/location-tracking-lifecycle.ts"))};`)
      .replace('import { runGuardedLocationUpload } from "@/lib/location-upload-guard";', `import { runGuardedLocationUpload } from ${JSON.stringify(join(root, "lib/location-upload-guard.ts"))};`)
      .replace('import { adoptHeadlessTrackingWithCredential } from "@/lib/location-tracking-runtime";', `import { adoptHeadlessTrackingWithCredential } from ${JSON.stringify(join(root, "lib/location-tracking-runtime.ts"))};`)
      .replace('} from "@/lib/location-task-budget";', `} from ${JSON.stringify(join(root, "lib/location-task-budget.ts"))};`)
      .replace("const TASK_CALLBACK_NETWORK_BUDGET_MS = 8_000;", "const TASK_CALLBACK_NETWORK_BUDGET_MS = 4;")
      .replace("const RESPONSE_BODY_TIMEOUT_MS = 2_000;", "const RESPONSE_BODY_TIMEOUT_MS = 1;");
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
      const taskManager = await import(`${pathToFileURL(join(stubs, "task-manager.ts")).href}?v=${Date.now()}`);
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
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 12));
      assert.equal(
        debugUpdates.some((next) => next.serverError === "위치 전송 준비 시간 제한으로 저장 여부를 확인하지 못했습니다."),
        false,
        "expired A preparation must not publish an error over replacement B",
      );
      tokenGate.resolve("technician-bearer");
      await delayedA;
      unsubscribe();
      Object.assign(globalThis as Record<string, unknown>, { __tokenGate: null });
    } finally {
      Object.assign(globalThis as Record<string, unknown>, { fetch: originalFetch });
    }

    console.log("LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
