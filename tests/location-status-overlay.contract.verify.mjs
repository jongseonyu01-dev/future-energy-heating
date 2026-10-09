import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = await readFile(join(root, "lib/location-status-overlay.ts"), "utf8");
const native = await readFile(join(root, "modules/future-energy-status-overlay/android/src/main/java/expo/modules/futureenergystatusoverlay/FutureEnergyStatusOverlayModule.kt"), "utf8");
const config = await readFile(join(root, "app.config.ts"), "utf8");
const moduleConfig = await readFile(join(root, "modules/future-energy-status-overlay/expo-module.config.json"), "utf8");

assert.match(config, /SYSTEM_ALERT_WINDOW/, "optional overlay must be declared explicitly");
assert.match(moduleConfig, /FutureEnergyStatusOverlayModule/, "Expo autolinking module must name the Kotlin implementation");
assert.match(native, /Settings\.canDrawOverlays/, "native module must check special overlay access");
assert.match(native, /ACTION_MANAGE_OVERLAY_PERMISSION/, "native module must open Android special-access settings");
assert.match(native, /TYPE_APPLICATION_OVERLAY/, "native module must use the Android overlay window type");
assert.match(native, /activeOwnerGeneration/, "native module must fence delayed calls by owner generation");
assert.match(native, /invalidateOwner/, "terminal/close must revoke native visual authority");
assert.match(native, /System\.currentTimeMillis\(\)/, "native module must calculate accepted-storage age from its own clock");
assert.match(native, /mainHandler\.postDelayed/, "visible overlay must refresh absolute storage age without callbacks");
assert.match(native, /serverConfirmationDelayMs/, "overlay must distinguish a prolonged accepted-save confirmation gap from fresh evidence");
assert.match(native, /서버 저장 확인 지연/, "long-running age label must not imply a current server save");
assert.match(native, /updateIfVisible/, "headless diagnostics may update only an already-opened overlay");
assert.match(native, /hideOverlay\(\)/, "close and module teardown must remove the optional window");
assert.doesNotMatch(native, /latitude|longitude|customer|address|token|fetch\(/i, "overlay native implementation must not collect or display PII/network data");

const sandbox = await mkdtemp(join(tmpdir(), "location-status-overlay."));
try {
  const calls = [];
  await writeFile(join(sandbox, "react-native.ts"), 'export const Platform = { OS: "android" };\n');
  await writeFile(join(sandbox, "expo.ts"), `
    export const requireOptionalNativeModule = () => ({
      getStatus: async () => ({ available: true, permission: false, visible: false }),
      openPermissionSettings: async () => { globalThis.__calls.push("settings"); return { available: true, permission: false, visible: false, settingsOpened: true }; },
      activateOwner: async (id, generation) => { globalThis.__calls.push(["activate", id, generation]); return { available: true, permission: true, visible: false }; },
      invalidateOwner: async (id, generation) => { globalThis.__calls.push(["invalidate", id, generation]); return { available: true, permission: true, visible: false }; },
      show: async (id, generation, text, storedAt) => { globalThis.__calls.push(["show", id, generation, text, storedAt]); return { available: true, permission: true, visible: true }; },
      updateIfVisible: async (id, generation, text, storedAt) => { globalThis.__calls.push(["update", id, generation, text, storedAt]); return { available: true, permission: true, visible: true }; },
      hide: async (id, generation) => { globalThis.__calls.push(["hide", id, generation]); return { available: true, permission: true, visible: false }; },
    });
  `);
  const transformed = source
    .replace('import { Platform } from "react-native";', 'import { Platform } from "./react-native.ts";')
    .replace('import { requireOptionalNativeModule } from "expo";', 'import { requireOptionalNativeModule } from "./expo.ts";');
  await writeFile(join(sandbox, "overlay-under-test.ts"), transformed);
  globalThis.__calls = calls;
  const overlay = await import(`${pathToFileURL(join(sandbox, "overlay-under-test.ts")).href}?v=${Date.now()}`);
  const stateA = { requestId: 11, technicianUserId: 21, startedAt: 31 };
  const stateB = { requestId: 12, technicianUserId: 21, startedAt: 32 };
  const presentation = { statusText: "위치 공유 중", lastStoredAt: 1_000 };

  const before = await overlay.getLocationStatusOverlayState();
  assert.deepEqual(before, { available: true, permission: false, visible: false });
  const requested = await overlay.requestLocationStatusOverlayPermission();
  assert.equal(requested.settingsOpened, true, "permission path must be user-initiated system settings, not an automatic grant");

  const ownerA = overlay.activateLocationStatusOverlayOwner(stateA);
  assert.equal(await overlay.synchronizeLocationStatusOverlayOwner(ownerA), true, "native owner must be applied before show");
  await overlay.showLocationStatusOverlay(ownerA, presentation);
  assert.equal(overlay.isCurrentLocationStatusOverlayOwner(ownerA), true);

  // B replaces A while A has a late update pending. A must not call native
  // update or invalidate/hide B after its owner is no longer current.
  const ownerB = overlay.activateLocationStatusOverlayOwner(stateB);
  assert.equal(await overlay.synchronizeLocationStatusOverlayOwner(ownerB), true, "replacement B must apply a newer native owner");
  const staleAUpdate = await overlay.updateVisibleLocationStatusOverlay(ownerA, presentation);
  assert.equal(staleAUpdate.visible, false, "late A update must not reopen or update replacement B");
  overlay.invalidateLocationStatusOverlayOwner(stateA);
  assert.equal(overlay.isCurrentLocationStatusOverlayOwner(ownerB), true, "late A invalidation must not revoke B");

  // Explicit close invalidates B before any later show/update continuation.
  overlay.invalidateLocationStatusOverlayOwner(stateB);
  const staleBShow = await overlay.showLocationStatusOverlay(ownerB, presentation);
  assert.equal(staleBShow.visible, false, "close/terminal must block a delayed B show");
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "update" && call[1] === ownerA.ownerId), false);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "show" && call[1] === ownerB.ownerId), false);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "invalidate" && call[1] === ownerB.ownerId), true, "close/terminal must request native invalidation immediately");
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "show" && call[4] === 1_000), true, "absolute accepted timestamp must cross the JS/native boundary");
  console.log("LOCATION_STATUS_OVERLAY_OWNER_AND_AGE_CONTRACT_PASS");
} finally {
  delete globalThis.__calls;
  await rm(sandbox, { recursive: true, force: true });
}
