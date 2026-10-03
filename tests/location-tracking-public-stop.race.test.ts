import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const tick = () => new Promise<void>((resolveTick) => setImmediate(resolveTick));

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  return {
    promise: new Promise<T>((resolvePromiseInner) => { resolvePromise = resolvePromiseInner; }),
    resolve: resolvePromise,
  };
}

const stateA = {
  token: "a".repeat(43),
  requestId: 91,
  technicianUserId: 41,
  technicianId: 17,
  startedAt: 91_000,
  trackingUrl: null,
};

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "location-public-stop-race."));
  const stubs = join(sandbox, "stubs");
  let nativeStarts = 0;
  let nativeStops = 0;
  const read1 = deferred<string | null>();
  const read2 = deferred<string | null>();
  let readCount = 0;
  let stored = JSON.stringify(stateA);

  try {
    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "react-native.ts"), 'export const Platform = { OS: "android" };\n');
    await writeFile(join(stubs, "async-storage.ts"), `
      let readCount = 0;
      export default {
        getItem: async () => {
          readCount += 1;
          if (readCount === 1) return globalThis.__read1;
          if (readCount === 2) return globalThis.__read2;
          return globalThis.__stored;
        },
        setItem: async (_key: string, value: string) => { globalThis.__stored = value; },
        removeItem: async () => { globalThis.__stored = null; },
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
      export const startLocationUpdatesAsync = async () => { globalThis.__nativeStarts += 1; };
      export const stopLocationUpdatesAsync = async () => { globalThis.__nativeStops += 1; };
      export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
      export const getCurrentPositionAsync = async () => null;
    `);
    await writeFile(join(stubs, "task-manager.ts"), 'export const isTaskDefined = () => true; export const defineTask = () => undefined;\n');
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => null; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), 'export const buildLocationRequestHeaders = () => null; export const formatLocationRequestFailure = () => "";\n');

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
      .replace('} from "@/lib/location-tracking-lifecycle";', `} from ${JSON.stringify(join(root, "lib/location-tracking-lifecycle.ts"))};`)
      .replace('import { runGuardedLocationUpload } from "@/lib/location-upload-guard";', `import { runGuardedLocationUpload } from ${JSON.stringify(join(root, "lib/location-upload-guard.ts"))};`)
      .replace('import { adoptHeadlessTrackingWithCredential } from "@/lib/location-tracking-runtime";', `import { adoptHeadlessTrackingWithCredential } from ${JSON.stringify(join(root, "lib/location-tracking-runtime.ts"))};`);
    await writeFile(join(sandbox, "location-tracking-under-test.ts"), transformed);

    Object.assign(globalThis as Record<string, unknown>, {
      __read1: read1.promise,
      __read2: read2.promise,
      __stored: stored,
      __nativeStarts: nativeStarts,
      __nativeStops: nativeStops,
    });
    const tracking = await import(`${pathToFileURL(join(sandbox, "location-tracking-under-test.ts")).href}?v=${Date.now()}`);

    // Public entrypoint order: restore read1 is held, logout-stop enters and starts
    // its cold-state read2, then read1 completes before read2.
    const restoring = tracking.restoreLocationTrackingForUser(stateA.technicianUserId);
    await tick();
    const stopping = tracking.stopStoredTrackingAndNotify("업무취소");
    await tick();
    read1.resolve(stored);
    assert.equal(await restoring, null, "invalidated restore must not start persisted A");
    read2.resolve(stored);
    await stopping;

    const globals = globalThis as Record<string, unknown>;
    assert.equal(globals.__stored, null, "public stop must clear stored A after its cold read");
    assert.equal(globals.__nativeStarts, 0, "late restore must never start native collection");
    assert.equal(globals.__nativeStops, 1, "public stop must terminate the existing native task once");
    console.log("LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
