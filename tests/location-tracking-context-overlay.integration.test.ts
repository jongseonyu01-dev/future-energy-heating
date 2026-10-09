import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const stateA = { token: "a".repeat(43), requestId: 71, technicianUserId: 17, technicianId: 3, startedAt: 71_000, trackingUrl: null };
const tick = () => new Promise<void>((resolveTick) => setImmediate(resolveTick));

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "location-context-overlay."));
  const stubs = join(sandbox, "stubs");
  try {
    await mkdir(stubs, { recursive: true });
    await writeFile(join(stubs, "react.ts"), `
      type Effect = { deps: unknown[] | undefined; cleanup?: (() => void) | void; run: () => (() => void) | void };
      const hooks: any[] = [];
      const effects: Effect[] = [];
      let hookIndex = 0;
      let component: (() => unknown) | null = null;
      let dirty = false;
      let latest: any = null;
      const same = (a: unknown[] | undefined, b: unknown[] | undefined) => Boolean(a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));
      export const createContext = (fallback: unknown) => ({ Provider: (props: any) => { latest = props.value; return props.children ?? null; }, fallback });
      export const useState = <T,>(initial: T) => {
        const index = hookIndex++;
        if (!(index in hooks)) hooks[index] = initial;
        const set = (value: T | ((previous: T) => T)) => { hooks[index] = typeof value === "function" ? (value as any)(hooks[index]) : value; dirty = true; };
        return [hooks[index] as T, set] as const;
      };
      export const useRef = <T,>(initial: T) => {
        const index = hookIndex++;
        if (!(index in hooks)) hooks[index] = { current: initial };
        return hooks[index] as { current: T };
      };
      export const useCallback = <T,>(callback: T, _deps: unknown[]) => callback;
      export const useEffect = (run: () => (() => void) | void, deps?: unknown[]) => {
        const index = hookIndex++;
        const previous = effects[index];
        if (!previous || !same(previous.deps, deps)) effects[index] = { deps, run, cleanup: previous?.cleanup };
      };
      const React = { createContext, useState, useRef, useCallback, useEffect, createElement: (type: any, props: any, ...children: any[]) => typeof type === "function" ? type({ ...props, children: children[0] }) : null };
      export default React;
      export const __render = async (next: () => unknown) => {
        component = next;
        for (let passes = 0; passes < 12; passes += 1) {
          dirty = false; hookIndex = 0; component();
          const runs = effects.map((effect, index) => effect ? ({ effect, index }) : null).filter(Boolean) as { effect: Effect; index: number }[];
          for (const { effect } of runs) {
            if (effect.cleanup === undefined) effect.cleanup = effect.run();
          }
          await Promise.resolve();
          if (!dirty) break;
        }
      };
      export const __flush = async () => { if (component) await __render(component); };
      export const __latest = () => latest;
    `);
    await writeFile(join(stubs, "react-native.ts"), `
      let listener: ((state: string) => void) | null = null;
      export const Platform = { OS: "android" };
      export const AppState = { addEventListener: (_name: string, next: (state: string) => void) => { listener = next; return { remove: () => { listener = null; } }; } };
      export const emitState = (state: string) => listener?.(state);
      export const emitActive = () => listener?.("active");
    `);
    await writeFile(join(stubs, "notifications.ts"), 'export const getPermissionsAsync = async () => ({ granted: true });\n');
    await writeFile(join(stubs, "location.ts"), 'export const getForegroundPermissionsAsync = async () => ({ status: "granted" }); export const getBackgroundPermissionsAsync = async () => ({ status: "denied" });\n');
    await writeFile(join(stubs, "auth-context.ts"), 'export const useAppAuth = () => ({ user: { userId: 17, appRole: "technician", token: "bearer" }, isLoading: false });\n');
    await writeFile(join(stubs, "tracking.ts"), `
      let trackingListener: ((state: any) => void) | null = null;
      let debugListener: ((state: any) => void) | null = null;
      export let permissionPending = true;
      export let resumeCalls = 0;
      export let latestUnbound: any = null;
      export const appStateEvents: string[] = [];
      export const setLatestUnbound = (value: any) => { latestUnbound = value; };
      export const getLatestUnboundLocationTaskEvent = async () => latestUnbound;
      export const createLocationStopAuthSnapshot = () => ({ technicianUserId: 17, bearerToken: "bearer" });
      export const getPersistedTrackingState = async () => (${JSON.stringify(stateA)});
      export const isLocationTrackingPermissionPending = async () => permissionPending;
      export const recordLocationTrackingAppState = (next: string) => { appStateEvents.push(next); };
      export const resumeLocationTrackingAfterPermissionCheck = async () => { resumeCalls += 1; permissionPending = false; return { state: ${JSON.stringify(stateA)}, status: "resumed" }; };
      export const restoreLocationTrackingForUser = async () => null;
      export const startLocationTracking = async () => undefined;
      export const stopStoredTrackingAndNotify = async () => { trackingListener?.(null); };
      export const stopExactStoredTrackingAndNotify = async () => undefined;
      export const subscribeDebug = (listener: (state: any) => void) => { debugListener = listener; listener({ lastStoredAt: null, serverStatus: "idle" }); return () => { debugListener = null; }; };
      export const subscribeTrackingState = (listener: (state: any) => void) => { trackingListener = listener; listener(${JSON.stringify(stateA)}); return () => { trackingListener = null; }; };
    `);
    await writeFile(join(stubs, "owner-reconciliation.ts"), 'export class LocationTrackingOwnerReconciliationGuard { generation = 0; begin() { return ++this.generation; } isCurrent(generation: number) { return generation === this.generation; } } export const reconcileLocationTrackingOwner = async () => undefined;\n');
    await writeFile(join(stubs, "overlay.ts"), `
      export type LocationStatusOverlayState = { available: boolean; permission: boolean; visible: boolean; settingsOpened?: boolean };
      export type LocationStatusOverlayPresentation = { statusText: string; lastStoredAt: number | null };
      let owner: any = null;
      export let getStatusGate: Promise<any> | null = null;
      export const setGetStatusGate = (value: Promise<any> | null) => { getStatusGate = value; };
      export const calls: any[] = [];
      export const activateLocationStatusOverlayOwner = (state: any, force = false) => { if (!owner || force) owner = { ownerId: state.requestId + ":" + state.technicianUserId + ":" + state.startedAt, generation: (owner?.generation ?? 0) + 1 }; return owner; };
      export const isCurrentLocationStatusOverlayOwner = (candidate: any) => Boolean(owner && candidate && owner.ownerId === candidate.ownerId && owner.generation === candidate.generation);
      export const synchronizeLocationStatusOverlayOwner = async (candidate: any) => Boolean(owner && candidate && owner.ownerId === candidate.ownerId && owner.generation === candidate.generation);
      export const invalidateLocationStatusOverlayOwner = (state: any) => { if (owner?.ownerId === state.requestId + ":" + state.technicianUserId + ":" + state.startedAt) { calls.push(["invalidate", owner.ownerId]); owner = null; } };
      export const getLocationStatusOverlayState = async () => getStatusGate ? await getStatusGate : ({ available: true, permission: true, visible: false });
      export const requestLocationStatusOverlayPermission = async () => ({ available: true, permission: false, visible: false, settingsOpened: true });
      export const showLocationStatusOverlay = async (candidate: any) => { calls.push(["show", candidate.ownerId]); return { available: true, permission: true, visible: true }; };
    `);
    await writeFile(join(stubs, "lifecycle.ts"), 'export const sameTrackingLifecycleState = (left: any, right: any) => Boolean(left && right && left.token === right.token && left.requestId === right.requestId && left.technicianUserId === right.technicianUserId && left.startedAt === right.startedAt);\n');

    const source = await readFile(join(root, "lib/location-tracking-context.tsx"), "utf8");
    const transformed = source
      .replace('import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";', 'import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "./stubs/react.ts";')
      .replace('import { AppState, Platform } from "react-native";', 'import { AppState, Platform } from "./stubs/react-native.ts";')
      .replace('import * as Notifications from "expo-notifications";', 'import * as Notifications from "./stubs/notifications.ts";')
      .replace('import * as Location from "expo-location";', 'import * as Location from "./stubs/location.ts";')
      .replace('import { useAppAuth } from "@/lib/auth-context";', 'import { useAppAuth } from "./stubs/auth-context.ts";')
      .replace('} from "@/lib/location-tracking";', '} from "./stubs/tracking.ts";')
      .replace('import type { UnboundLocationTaskEvent } from "@/lib/location-runtime-diagnostics";', 'export type UnboundLocationTaskEvent = { code: string; observedAt: number };')
      .replace('} from "@/lib/location-tracking-owner-reconciliation";', '} from "./stubs/owner-reconciliation.ts";')
      .replace('} from "@/lib/location-status-overlay";', '} from "./stubs/overlay.ts";')
      .replace('import { sameTrackingLifecycleState } from "@/lib/location-tracking-lifecycle";', 'import { sameTrackingLifecycleState } from "./stubs/lifecycle.ts";');
    await writeFile(join(sandbox, "location-tracking-context-under-test.tsx"), transformed);

    const react = await import(pathToFileURL(join(stubs, "react.ts")).href) as any;
    const native = await import(pathToFileURL(join(stubs, "react-native.ts")).href) as any;
    const tracking = await import(pathToFileURL(join(stubs, "tracking.ts")).href) as any;
    const overlay = await import(pathToFileURL(join(stubs, "overlay.ts")).href) as any;
    const provider = await import(`${pathToFileURL(join(sandbox, "location-tracking-context-under-test.tsx")).href}?v=${Date.now()}`) as any;

    await react.__render(() => provider.LocationTrackingProvider({ children: null }));
    await tick();
    await react.__flush();
    assert.equal(react.__latest().isTracking, true, "provider must receive the active exact tracking session");
    assert.equal(react.__latest().isPermissionPending, true, "permission-pending work must remain visible so arrival/cancel controls are not lost");

    assert.equal(await react.__latest().resumeTrackingAfterPermissionCheck(), "resumed", "explicit foreground approval resumes only the preserved local session");
    await react.__flush();
    assert.equal(tracking.resumeCalls, 1, "resume control must call the local resume API once without a departure/server start path");
    assert.equal(react.__latest().trackingRequestId, stateA.requestId, "resume must retain the original work identity");
    assert.equal(react.__latest().isPermissionPending, false, "resumed exact session must not remain visually blocked by a stale pending marker");

    native.emitState("background");
    await tick();
    assert.deepEqual(tracking.appStateEvents, ["background"], "AppState transition must record only a diagnostic marker before any foreground reconciliation");

    // getStatus is delayed. Stop completes before it resolves; the late open
    // must not call native show or restore visible state.
    const statusGate = Promise.withResolvers<any>();
    overlay.setGetStatusGate(statusGate.promise);
    const opening = react.__latest().openStatusOverlay();
    await tick();
    await react.__latest().stopTracking("도착완료");
    statusGate.resolve({ available: true, permission: true, visible: false });
    assert.equal(await opening, "unavailable", "late getStatus after stop must not reopen optional overlay");
    assert.equal(overlay.calls.some((call: any[]) => call[0] === "show"), false, "stop must fence delayed native show");

    // A new unbound event is module-level evidence. Returning to active refreshes
    // only this diagnostic read; it does not invoke any location upload API.
    tracking.setLatestUnbound({ code: "TASK_NATIVE_ERROR", observedAt: 91_000 });
    native.emitActive();
    await tick();
    await react.__flush();
    assert.deepEqual(react.__latest().unboundTaskEvent, { code: "TASK_NATIVE_ERROR", observedAt: 91_000 }, "AppState active must refresh new unbound evidence for the current technician scope");
    console.log("LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
