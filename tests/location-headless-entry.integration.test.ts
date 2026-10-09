import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const stoppedState = {
  token: "s".repeat(43), requestId: 941, technicianUserId: 71, technicianId: 31, startedAt: 941_000, trackingUrl: null,
};

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "location-headless-entry."));
  const stubs = join(sandbox, "stubs");
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { main?: string };
    assert.equal(packageJson.main, "./index.ts", "production bundle must start at the custom headless entry");

    const appEntry = await readFile(join(root, "index.ts"), "utf8");
    assert.ok(appEntry.indexOf("./lib/location-task-entry") >= 0, "custom entry must import location task entry");
    assert.ok(appEntry.indexOf("./lib/location-task-entry") < appEntry.indexOf("expo-router/entry"), "task definition must precede Router entry");
    const routerEntry = await readFile(join(root, "node_modules/expo-router/entry.js"), "utf8");
    const routerClassic = await readFile(join(root, "node_modules/expo-router/entry-classic.js"), "utf8");
    const routerContext = await readFile(join(root, "node_modules/expo-router/_ctx.android.js"), "utf8");
    assert.match(routerEntry, /expo-router\/entry-classic/, "SDK 54 Router entry chain changed unexpectedly");
    assert.match(routerClassic, /renderRootComponent\(App\)/, "SDK 54 Router root registration changed unexpectedly");
    assert.match(routerContext, /require\.context\(/, "SDK 54 route context creation changed unexpectedly");

    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "noop.ts"), "export {};\n");
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
      export const hasStartedLocationUpdatesAsync = async () => false;
      export const startLocationUpdatesAsync = async () => undefined;
      export const stopLocationUpdatesAsync = async () => undefined;
      export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
      export const getCurrentPositionAsync = async () => null;
    `);
    await writeFile(join(stubs, "task-manager.ts"), `
      let task: ((payload: unknown) => Promise<void>) | null = null;
      export const isTaskDefined = () => task !== null;
      export const defineTask = (_name: string, callback: (payload: unknown) => Promise<void>) => { task = callback; };
      export const definitionCount = () => task ? 1 : 0;
      export const invokeTask = async (payload: unknown) => { if (!task) throw new Error("TASK_NOT_REGISTERED"); await task(payload); };
    `);
    await writeFile(join(stubs, "constants.ts"), 'export default { nativeAppVersion: "test", nativeBuildVersion: "0", expoConfig: null };\n');
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => "technician-bearer"; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), 'export const buildLocationRequestHeaders = (token: string | null) => token ? { Authorization: "Bearer " + token } : null; export const formatLocationRequestFailure = () => "";\n');
    await writeFile(join(stubs, "status-overlay.ts"), 'export type LocationStatusOverlayPresentation = { statusText: string; lastStoredAt: number | null }; let owner: { ownerId: string; generation: number } | null = null; export const activateLocationStatusOverlayOwner = (state: { requestId: number; technicianUserId: number; startedAt: number }) => (owner = { ownerId: state.requestId + ":" + state.technicianUserId + ":" + state.startedAt, generation: (owner?.generation ?? 0) + 1 }); export const getLocationStatusOverlayOwner = () => owner; export const invalidateActiveLocationStatusOverlayOwner = () => { owner = null; }; export const invalidateLocationStatusOverlayOwner = () => { owner = null; }; export const synchronizeLocationStatusOverlayOwner = async () => true; export const updateVisibleLocationStatusOverlay = async () => ({ available: false, permission: false, visible: false });\n');
    // Execute the SDK-locked Android context generator itself, with only Metro's
    // require.context primitive replaced. This proves the package-main path
    // reaches the same route-context creation boundary without evaluating a UI
    // route or rendering React.
    const routerContextUnderTest = `
      const contextCalls: unknown[][] = [];
      const require = { context: (...args: unknown[]) => {
        contextCalls.push(args);
        return { routeEvaluations: 0 };
      } };
      ${routerContext}
      export { contextCalls };
    `;
    await writeFile(join(stubs, "router-context.ts"), routerContextUnderTest);
    await writeFile(join(stubs, "qualified-entry.ts"), `
      import { ctx } from "./router-context.ts";
      export const App = () => ctx;
    `);
    await writeFile(join(stubs, "render-root.ts"), `
      let registrations = 0;
      export const renderRootComponent = () => { registrations += 1; };
      export const mainRegistrations = () => registrations;
    `);

    const trackingSource = await readFile(join(root, "lib/location-tracking.ts"), "utf8");
    const tracking = trackingSource
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
      .replace('} from "@/lib/location-task-budget";', `} from ${JSON.stringify(join(root, "lib/location-task-budget.ts"))};`);
    await writeFile(join(sandbox, "location-tracking-under-test.ts"), tracking);

    const taskEntrySource = await readFile(join(root, "lib/location-task-entry.ts"), "utf8");
    await writeFile(join(sandbox, "location-task-entry-under-test.ts"), taskEntrySource
      .replace('"@/lib/location-tracking"', '"./location-tracking-under-test.ts"'));

    const actualRouterEntry = routerEntry.replace("import 'expo-router/entry-classic';", 'import "./router-entry-classic-under-test.ts";');
    const actualRouterClassic = routerClassic
      .replace("import '@expo/metro-runtime';", 'import "./stubs/noop.ts";')
      .replace("import { App } from 'expo-router/build/qualified-entry';", 'import { App } from "./stubs/qualified-entry.ts";')
      .replace("import { renderRootComponent } from 'expo-router/build/renderRootComponent';", 'import { renderRootComponent } from "./stubs/render-root.ts";');
    await writeFile(join(sandbox, "router-entry-under-test.ts"), actualRouterEntry);
    await writeFile(join(sandbox, "router-entry-classic-under-test.ts"), actualRouterClassic);

    const entryUnderTest = appEntry
      .replace('"./lib/location-task-entry"', '"./location-task-entry-under-test.ts"')
      .replace('"expo-router/entry"', '"./router-entry-under-test.ts"');
    await writeFile(join(sandbox, "package-main-under-test.ts"), entryUnderTest);

    let fetches = 0;
    const originalFetch = globalThis.fetch;
    Object.assign(globalThis as Record<string, unknown>, {
      fetch: async () => { fetches += 1; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    try {
      // This is the custom package.main path. It does not import _layout or
      // invoke React UI. It performs the real task-entry module side effect,
      // then executes the SDK's actual Router entry/classic registration source.
      await import(`${pathToFileURL(join(sandbox, "package-main-under-test.ts")).href}?v=${Date.now()}`);
      const taskManager = await import(pathToFileURL(join(stubs, "task-manager.ts")).href) as {
        definitionCount: () => number;
        invokeTask: (payload: unknown) => Promise<void>;
      };
      const rendered = await import(pathToFileURL(join(stubs, "render-root.ts")).href) as { mainRegistrations: () => number };
      const context = await import(pathToFileURL(join(stubs, "router-context.ts")).href) as { contextCalls: unknown[][]; ctx: { routeEvaluations: number } };
      const trackingModule = await import(pathToFileURL(join(sandbox, "location-tracking-under-test.ts")).href) as any;

      assert.equal(context.contextCalls.length, 1, "actual SDK Android context generator must invoke require.context once");
      assert.equal(context.contextCalls[0]?.[1], true, "actual Router context must scan nested routes without evaluating them");
      assert.equal(rendered.mainRegistrations(), 1, "Router root must be registered once");
      assert.equal(context.ctx.routeEvaluations, 0, "headless entry must not evaluate route modules");
      assert.equal(taskManager.definitionCount(), 1, "custom package entry must define the Location task exactly once before UI render");

      await taskManager.invokeTask({ error: new Error("SYNTHETIC_HEADLESS_CALLBACK") });
      const event = await trackingModule.getLatestUnboundLocationTaskEvent();
      assert.equal(event?.code, "TASK_NATIVE_ERROR", "headless callback must reach the defined task handler");

      await trackingModule.startLocationTracking(stoppedState);
      await trackingModule.stopStoredTrackingAndNotify("업무취소");
      await taskManager.invokeTask({ data: { locations: [{ timestamp: Date.now(), coords: { latitude: 0.1, longitude: 0.2 } }] } });
      assert.equal(fetches, 0, "terminal local state must not be re-adopted by a later headless callback");
      console.log("LOCATION_CUSTOM_PACKAGE_ENTRY_HEADLESS_INTEGRATION_PASS");
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
