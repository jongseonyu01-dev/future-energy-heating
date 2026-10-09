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
  let stored = JSON.stringify(stateA);

  try {
    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "react-native.ts"), 'export const Platform = { OS: "android" };\n');
    await writeFile(join(stubs, "async-storage.ts"), `
      let readCount = 0;
      const inactiveMarkers = new Map<string, string>();
      const permissionMarkers = new Map<string, string>();
      const values = new Map<string, string>();
      export default {
        getItem: async (key: string) => {
          if (key.startsWith("location_tracking_inactive_v1:")) return inactiveMarkers.get(key) ?? null;
          if (key.startsWith("location_tracking_permission_pending_v1:") || key.startsWith("location_tracking_permission_resumed_v1:")) return permissionMarkers.get(key) ?? null;
          if (key.startsWith("location_tracking_runtime_diagnostics")) return values.get(key) ?? null;
          readCount += 1;
          if (readCount === 1) return globalThis.__read1;
          if (readCount === 2) return globalThis.__read2;
          return globalThis.__stored;
        },
        setItem: async (key: string, value: string) => {
          if (key.startsWith("location_tracking_inactive_v1:")) inactiveMarkers.set(key, value);
          else if (key.startsWith("location_tracking_permission_pending_v1:") || key.startsWith("location_tracking_permission_resumed_v1:")) permissionMarkers.set(key, value);
          else if (key.startsWith("location_tracking_runtime_diagnostics")) values.set(key, value);
          else globalThis.__stored = value;
        },
        removeItem: async (key: string) => {
          if (key.startsWith("location_tracking_inactive_v1:")) inactiveMarkers.delete(key);
          else if (key.startsWith("location_tracking_permission_pending_v1:") || key.startsWith("location_tracking_permission_resumed_v1:")) permissionMarkers.delete(key);
          else if (key.startsWith("location_tracking_runtime_diagnostics")) values.delete(key);
          else globalThis.__stored = null;
        },
        getAllKeys: async () => [...inactiveMarkers.keys(), ...permissionMarkers.keys(), ...values.keys()],
        multiGet: async (keys: readonly string[]) => keys.map((key) => [
          key,
          key.startsWith("location_tracking_inactive_v1:") ? inactiveMarkers.get(key) ?? null
            : key.startsWith("location_tracking_permission_pending_v1:") || key.startsWith("location_tracking_permission_resumed_v1:") ? permissionMarkers.get(key) ?? null
              : values.get(key) ?? null,
        ] as [string, string | null]),
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
      export const stopLocationUpdatesAsync = async () => { globalThis.__nativeStops += 1; if (globalThis.__nativeStopGate) await globalThis.__nativeStopGate; };
      export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
      export const getForegroundPermissionsAsync = async () => globalThis.__foregroundPermission ?? ({ status: "granted" });
      export const getBackgroundPermissionsAsync = async () => { if (globalThis.__backgroundPermissionGate) { globalThis.__backgroundPermissionReadStarted?.resolve(); return await globalThis.__backgroundPermissionGate; } return globalThis.__backgroundPermission ?? ({ status: "granted" }); };
      export const getCurrentPositionAsync = async () => null;
    `);
    await writeFile(join(stubs, "task-manager.ts"), 'export const isTaskDefined = () => true; export const defineTask = () => undefined;\n');
    await writeFile(join(stubs, "constants.ts"), 'export default { nativeAppVersion: "test", nativeBuildVersion: "0", expoConfig: null };\n');
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => null; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), 'export const buildLocationRequestHeaders = () => null; export const formatLocationRequestFailure = () => "";\n');
    await writeFile(join(stubs, "status-overlay.ts"), 'export type LocationStatusOverlayPresentation = { statusText: string; lastStoredAt: number | null }; let owner: { ownerId: string; generation: number } | null = null; export const activateLocationStatusOverlayOwner = (state: { requestId: number; technicianUserId: number; startedAt: number }) => (owner = { ownerId: state.requestId + ":" + state.technicianUserId + ":" + state.startedAt, generation: (owner?.generation ?? 0) + 1 }); export const getLocationStatusOverlayOwner = () => owner; export const invalidateActiveLocationStatusOverlayOwner = () => { if (owner) globalThis.__overlayEvents.push(["invalidate-active", owner.ownerId]); owner = null; }; export const invalidateLocationStatusOverlayOwner = (state: { requestId: number; technicianUserId: number; startedAt: number }) => { const id = state.requestId + ":" + state.technicianUserId + ":" + state.startedAt; if (owner?.ownerId === id) { globalThis.__overlayEvents.push(["invalidate", id]); owner = null; } }; export const synchronizeLocationStatusOverlayOwner = async () => true; export const updateVisibleLocationStatusOverlay = async () => ({ available: false, permission: false, visible: false });\n');

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
      .replace('} from "@/lib/location-tracking-lifecycle";', `} from ${JSON.stringify(join(root, "lib/location-tracking-lifecycle.ts"))};`)
      .replace('import { runGuardedLocationUpload } from "@/lib/location-upload-guard";', `import { runGuardedLocationUpload } from ${JSON.stringify(join(root, "lib/location-upload-guard.ts"))};`)
      .replace('import {\n  adoptHeadlessTrackingWithCredential,\n  adoptHeadlessTrackingWithCredentialResult,\n} from "@/lib/location-tracking-runtime";', `import { adoptHeadlessTrackingWithCredential, adoptHeadlessTrackingWithCredentialResult } from ${JSON.stringify(join(root, "lib/location-tracking-runtime.ts"))};`)
      + '\nexport const __testLifecycleIntent = () => trackingLifecycle.currentIntent();\n';
    await writeFile(join(sandbox, "location-tracking-under-test.ts"), transformed);

    Object.assign(globalThis as Record<string, unknown>, {
      __read1: read1.promise,
      __read2: read2.promise,
      __stored: stored,
      __nativeStarts: nativeStarts,
      __nativeStops: nativeStops,
      __nativeStopGate: null,
      __overlayEvents: [],
    });
    const tracking = await import(`${pathToFileURL(join(sandbox, "location-tracking-under-test.ts")).href}?v=${Date.now()}`);

    // Public entrypoint order: restore's permission pre-read holds read1,
    // logout-stop enters its cold-state read2, and both reads then settle.
    const restoring = tracking.restoreLocationTrackingForUser(stateA.technicianUserId);
    await tick();
    const stopping = tracking.stopStoredTrackingAndNotify("업무취소");
    await tick();
    read1.resolve(stored);
    read2.resolve(stored);
    assert.equal(await restoring, null, "invalidated restore must not start persisted A");
    await stopping;

    const globals = globalThis as Record<string, unknown>;
    assert.equal(globals.__stored, null, "public stop must clear stored A after its cold read");
    assert.equal(globals.__nativeStarts, 0, "late restore must never start native collection");
    assert.equal(globals.__nativeStops, 1, "public stop must terminate the existing native task once");

    // APK56 can already hold a persisted session when the permission contract
    // changes. A non-interactive denied background check must stop that exact
    // local state before restore/reconcile can start native collection, but must
    // retain the pointer as a reversible permission-pending session; no Settings
    // request is possible in this restore code path.
    const deniedRestore = { ...stateA, token: "d".repeat(43), requestId: 92, startedAt: 92_000 };
    globals.__stored = JSON.stringify(deniedRestore);
    globals.__foregroundPermission = { status: "granted" };
    globals.__backgroundPermission = { status: "denied" };
    const nativeStartsBeforeDeniedRestore = Number(globals.__nativeStarts);
    const nativeStopsBeforeDeniedRestore = Number(globals.__nativeStops);
    const pendingRestore = await tracking.restoreLocationTrackingForUser(deniedRestore.technicianUserId);
    assert.equal(
      pendingRestore?.requestId,
      deniedRestore.requestId,
      "unapproved stored share must remain visible as the same non-terminal permission-pending work",
    );
    assert.equal(globals.__nativeStarts, nativeStartsBeforeDeniedRestore, "denied restored share must issue zero native starts");
    assert.equal(globals.__nativeStops, nativeStopsBeforeDeniedRestore + 1, "denied restored share must stop its exact existing native task");
    assert.equal(globals.__stored, JSON.stringify(deniedRestore), "denied restored share must retain its exact pointer for later approval");

    // After Android approval, the same paused state resumes without a second
    // pre-explanation or a newly issued server session.
    globals.__backgroundPermission = { status: "granted" };
    assert.equal((await tracking.getPersistedTrackingState())?.requestId, deniedRestore.requestId, "approved pending fixture must retain its original session identity");
    assert.equal(tracking.__testLifecycleIntent(), null, "denied predecessor must leave no in-memory owner before an approved restore");
    const nativeStartsBeforeApprovedRestore = Number(globals.__nativeStarts);
    const resumedApproved = await tracking.resumeLocationTrackingAfterPermissionCheck(deniedRestore.technicianUserId);
    assert.equal(resumedApproved.status, "resumed", "foreground approval must explicitly resume the same local session without a server start request");
    assert.equal(resumedApproved.state?.requestId, deniedRestore.requestId, `approved exact pending session must restore normally: ${JSON.stringify(resumedApproved)}`);
    assert.equal(globals.__nativeStarts, nativeStartsBeforeApprovedRestore + 1, "approved restored share may start its exact native collector once");
    assert.equal(await tracking.isLocationTrackingPermissionPending(deniedRestore), false, "successful exact resume must clear the stale local permission-pending fence");

    // When this exact share is already current, Android Settings → app active
    // must suspend it immediately from the restore permission check. No later
    // native location callback is needed to trigger the local stop.
    const nativeStopsBeforeWarmDenied = Number(globals.__nativeStops);
    globals.__backgroundPermission = { status: "denied" };
    const warmDenied = await tracking.restoreLocationTrackingForUser(deniedRestore.technicianUserId);
    await tick();
    assert.equal(warmDenied?.requestId, deniedRestore.requestId, "denied current work remains visible as permission-pending");
    assert.equal(globals.__nativeStops, nativeStopsBeforeWarmDenied + 1, "denied current work must stop native collection during the permission check itself");
    assert.equal(await tracking.isLocationTrackingPermissionPending(deniedRestore), true, "denied current work must publish its reversible permission-pending marker");

    // A delayed foreground approval for old A cannot revive it after the user
    // ended A or moved to another work B.
    const permissionGate = deferred<{ status: string }>();
    globals.__backgroundPermission = undefined;
    globals.__backgroundPermissionReadStarted = { resolve: () => permissionGate.resolve({ status: "granted" }) };
    // Replace the resolver with an observable gate after the resume starts.
    const resumeReadStarted = deferred<void>();
    globals.__backgroundPermissionReadStarted = resumeReadStarted;
    globals.__backgroundPermissionGate = permissionGate.promise;
    const lateResumeA = tracking.resumeLocationTrackingAfterPermissionCheck(deniedRestore.technicianUserId, deniedRestore);
    await resumeReadStarted.promise;
    const replacementB = { ...deniedRestore, token: "b".repeat(43), requestId: 93, startedAt: 93_000 };
    await tracking.startLocationTracking(replacementB);
    permissionGate.resolve({ status: "granted" });
    const lateResumeResult = await lateResumeA;
    assert.equal(lateResumeResult.status, "no_matching_session", "late A permission approval must not apply after B replaces the pointer");
    assert.equal(tracking.__testLifecycleIntent()?.requestId, replacementB.requestId, "late A must not stop or replace current B");
    globals.__backgroundPermissionGate = null;
    globals.__backgroundPermissionReadStarted = null;

    // A visible optional overlay is revoked immediately when an exact in-memory
    // share stops. It must not wait for delayed Android native cleanup.
    await tracking.startLocationTracking(stateA);
    const nativeStopsBeforeVisibleStop = Number(globals.__nativeStops);
    const nativeStopGate = deferred<void>();
    globals.__nativeStopGate = nativeStopGate.promise;
    const stoppingVisibleShare = tracking.stopStoredTrackingAndNotify("도착완료");
    await tick();
    assert.deepEqual(globals.__overlayEvents, [["invalidate", "91:41:91000"]], "local stop must revoke the exact overlay before native stop settles");
    assert.equal(globals.__nativeStops, nativeStopsBeforeVisibleStop + 1, "native cleanup may remain pending after visual authority is revoked");
    nativeStopGate.resolve();
    await stoppingVisibleShare;
    globals.__nativeStopGate = null;
    console.log("LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

export const locationTrackingPublicStopRaceIntegration = main();
// Some Node/tsx runner combinations compile this standalone module as CJS and
// allow an unresolved promise to exit without a failure or PASS marker. Hold a
// harmless handle until every exact-restore assertion has actually settled.
const completionKeepalive = setInterval(() => undefined, 1_000);
void locationTrackingPublicStopRaceIntegration.then(
  () => clearInterval(completionKeepalive),
  (error) => {
    clearInterval(completionKeepalive);
    console.error(error);
    process.exitCode = 1;
  },
);
