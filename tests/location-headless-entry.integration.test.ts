import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "location-headless-entry."));
  const stubs = join(sandbox, "stubs");
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { main?: string };
    assert.equal(packageJson.main, "expo-router/entry", "production Android bundle must use Expo Router entry");
    const routerContext = await readFile(join(root, "node_modules/expo-router/_ctx.android.js"), "utf8");
    assert.match(routerContext, /require\.context\(/, "Expo Router entry must load the app route context before a route render");
    assert.match(routerContext, /EXPO_ROUTER_APP_ROOT/, "Expo Router context must be rooted at this app directory");

    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "noop.ts"), "export {};\n");
    await writeFile(join(stubs, "react-native.ts"), 'export const Platform = { OS: "android" };\n');
    await writeFile(join(stubs, "async-storage.ts"), `
      export default {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
        getAllKeys: async () => [],
        multiGet: async () => [],
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
      const calls: string[] = [];
      export const isTaskDefined = () => false;
      export const defineTask = (name: string) => { calls.push(name); };
      export const definedTaskNames = () => [...calls];
    `);
    await writeFile(join(stubs, "constants.ts"), 'export default { nativeAppVersion: "test", nativeBuildVersion: "0", expoConfig: null };\n');
    await writeFile(join(stubs, "oauth.ts"), 'export const getApiBaseUrl = () => "https://invalid.example";\n');
    await writeFile(join(stubs, "auth.ts"), 'export const getSessionToken = async () => null; export const getUserInfo = async () => null;\n');
    await writeFile(join(stubs, "request-auth.ts"), 'export const buildLocationRequestHeaders = () => null; export const formatLocationRequestFailure = () => "";\n');

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
      .replace('} from "@/lib/location-upload-scheduler";', `} from ${JSON.stringify(join(root, "lib/location-upload-scheduler.ts"))};`)
      .replace('} from "@/lib/location-runtime-diagnostics";', `} from ${JSON.stringify(join(root, "lib/location-runtime-diagnostics.ts"))};`)
      .replace('import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from "@/lib/location-runtime-status";', `import { CALLBACK_DEADLINE_ERROR, locationRuntimeStatusFromDiagnostics } from ${JSON.stringify(join(root, "lib/location-runtime-status.ts"))};`)
      .replace('import { parseJsonWithin } from "@/lib/location-upload-response";', `import { parseJsonWithin } from ${JSON.stringify(join(root, "lib/location-upload-response.ts"))};`)
      .replace('} from "@/lib/location-tracking-lifecycle";', `} from ${JSON.stringify(join(root, "lib/location-tracking-lifecycle.ts"))};`)
      .replace('import { runGuardedLocationUpload } from "@/lib/location-upload-guard";', `import { runGuardedLocationUpload } from ${JSON.stringify(join(root, "lib/location-upload-guard.ts"))};`)
      .replace('import {\n  adoptHeadlessTrackingWithCredential,\n  adoptHeadlessTrackingWithCredentialResult,\n} from "@/lib/location-tracking-runtime";', `import { adoptHeadlessTrackingWithCredential, adoptHeadlessTrackingWithCredentialResult } from ${JSON.stringify(join(root, "lib/location-tracking-runtime.ts"))};`)
      .replace('} from "@/lib/location-task-budget";', `} from ${JSON.stringify(join(root, "lib/location-task-budget.ts"))};`);
    await writeFile(join(sandbox, "location-tracking-under-test.ts"), tracking);
    await writeFile(join(sandbox, "location-tracking-context.tsx"), `
      import "./location-tracking-under-test.ts";
      export const LocationTrackingProvider = ({ children }: { children?: unknown }) => children ?? null;
    `);

    await writeFile(join(stubs, "react-query.ts"), 'export class QueryClient {} export const QueryClientProvider = () => null;\n');
    await writeFile(join(stubs, "router.ts"), 'export const Stack = () => null;\n');
    await writeFile(join(stubs, "status-bar.ts"), 'export const StatusBar = () => null;\n');
    await writeFile(join(stubs, "react.ts"), 'export const useCallback = (v: unknown) => v; export const useEffect = () => undefined; export const useMemo = (v: () => unknown) => v(); export const useState = () => { throw new Error("ROOT_LAYOUT_RENDERED"); };\n');
    await writeFile(join(stubs, "gesture.ts"), 'export const GestureHandlerRootView = () => null;\n');
    await writeFile(join(stubs, "theme.ts"), 'export const ThemeProvider = ({ children }: { children?: unknown }) => children ?? null;\n');
    await writeFile(join(stubs, "auth-context.ts"), 'export const AuthProvider = ({ children }: { children?: unknown }) => children ?? null;\n');
    await writeFile(join(stubs, "safe-area.ts"), `
      export const SafeAreaFrameContext = { Provider: () => null };
      export const SafeAreaInsetsContext = { Provider: () => null };
      export const SafeAreaProvider = () => null;
      export const initialWindowMetrics = null;
    `);
    await writeFile(join(stubs, "trpc.ts"), 'export const trpc = { Provider: () => null }; export const createTRPCClient = () => ({});\n');
    await writeFile(join(stubs, "runtime.ts"), 'export const initManusRuntime = () => undefined; export const subscribeSafeAreaInsets = () => () => undefined;\n');
    await writeFile(join(stubs, "app-update.ts"), 'export const useAppUpdate = () => ({});\n');
    await writeFile(join(stubs, "app-update-modal.ts"), 'export const AppUpdateModal = () => null;\n');

    const layoutSource = await readFile(join(root, "app/_layout.tsx"), "utf8");
    const layout = layoutSource
      .replace('import "@/global.css";', 'import "./stubs/noop.ts";')
      .replace('import { QueryClient, QueryClientProvider } from "@tanstack/react-query";', 'import { QueryClient, QueryClientProvider } from "./stubs/react-query.ts";')
      .replace('import { Stack } from "expo-router";', 'import { Stack } from "./stubs/router.ts";')
      .replace('import { StatusBar } from "expo-status-bar";', 'import { StatusBar } from "./stubs/status-bar.ts";')
      .replace('import { useCallback, useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useState } from "./stubs/react.ts";')
      .replace('import { GestureHandlerRootView } from "react-native-gesture-handler";', 'import { GestureHandlerRootView } from "./stubs/gesture.ts";')
      .replace('import "react-native-reanimated";', 'import "./stubs/noop.ts";')
      .replace('import { Platform } from "react-native";', 'import { Platform } from "./stubs/react-native.ts";')
      .replace('import "@/lib/_core/nativewind-pressable";', 'import "./stubs/noop.ts";')
      .replace('import { ThemeProvider } from "@/lib/theme-provider";', 'import { ThemeProvider } from "./stubs/theme.ts";')
      .replace('import { AuthProvider } from "@/lib/auth-context";', 'import { AuthProvider } from "./stubs/auth-context.ts";')
      .replace('import { LocationTrackingProvider } from "@/lib/location-tracking-context";', 'import { LocationTrackingProvider } from "./location-tracking-context.tsx";')
      .replace('} from "react-native-safe-area-context";', '} from "./stubs/safe-area.ts";')
      .replace('import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";', 'type EdgeInsets = any; type Metrics = any; type Rect = any;')
      .replace('import { trpc, createTRPCClient } from "@/lib/trpc";', 'import { trpc, createTRPCClient } from "./stubs/trpc.ts";')
      .replace('import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";', 'import { initManusRuntime, subscribeSafeAreaInsets } from "./stubs/runtime.ts";')
      .replace('import { useAppUpdate } from "@/hooks/use-app-update";', 'import { useAppUpdate } from "./stubs/app-update.ts";')
      .replace('import { AppUpdateModal } from "@/components/app-update-modal";', 'import { AppUpdateModal } from "./stubs/app-update-modal.ts";');
    await writeFile(join(sandbox, "root-layout-under-test.tsx"), layout);

    // Importing the root module is the cold/headless entry analogue. The test
    // deliberately does not invoke RootLayout; its stub would throw if render
    // hooks ran. Task definition must nevertheless occur exactly once.
    await import(`${pathToFileURL(join(sandbox, "root-layout-under-test.tsx")).href}?v=${Date.now()}`);
    const taskManager = await import(`${pathToFileURL(join(stubs, "task-manager.ts")).href}?v=${Date.now()}`) as {
      definedTaskNames: () => string[];
    };
    assert.deepEqual(taskManager.definedTaskNames(), ["FUTURE_ENERGY_LOCATION_TASK"]);
    console.log("LOCATION_HEADLESS_ENTRY_INTEGRATION_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
