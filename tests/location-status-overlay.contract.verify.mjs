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
      show: async (text) => { globalThis.__calls.push(["show", text]); return { available: true, permission: true, visible: true }; },
      updateIfVisible: async (text) => { globalThis.__calls.push(["update", text]); return { available: true, permission: true, visible: true }; },
      hide: async () => { globalThis.__calls.push("hide"); return { available: true, permission: true, visible: false }; },
    });
  `);
  const transformed = source
    .replace('import { Platform } from "react-native";', 'import { Platform } from "./react-native.ts";')
    .replace('import { requireOptionalNativeModule } from "expo";', 'import { requireOptionalNativeModule } from "./expo.ts";');
  await writeFile(join(sandbox, "overlay-under-test.ts"), transformed);
  globalThis.__calls = calls;
  const overlay = await import(`${pathToFileURL(join(sandbox, "overlay-under-test.ts")).href}?v=${Date.now()}`);
  const before = await overlay.getLocationStatusOverlayState();
  assert.deepEqual(before, { available: true, permission: false, visible: false });
  const requested = await overlay.requestLocationStatusOverlayPermission();
  assert.equal(requested.settingsOpened, true, "permission path must be user-initiated system settings, not an automatic grant");
  await overlay.showLocationStatusOverlay("위치 공유 중 · 마지막 서버 저장 10초 전");
  await overlay.updateVisibleLocationStatusOverlay("위치 공유 중 · 서버 저장 확인 필요");
  await overlay.hideLocationStatusOverlay();
  assert.deepEqual(calls, [
    "settings",
    ["show", "위치 공유 중 · 마지막 서버 저장 10초 전"],
    ["update", "위치 공유 중 · 서버 저장 확인 필요"],
    "hide",
  ]);
  console.log("LOCATION_STATUS_OVERLAY_CONTRACT_PASS");
} finally {
  delete globalThis.__calls;
  await rm(sandbox, { recursive: true, force: true });
}
