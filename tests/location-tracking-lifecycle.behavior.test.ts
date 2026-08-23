import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageState = vi.hoisted(() => new Map<string, string>());
const asyncStorageMock = vi.hoisted(() => ({
  getItem: vi.fn(async (key: string) => storageState.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    storageState.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    storageState.delete(key);
  }),
  multiGet: vi.fn(async (keys: string[]) =>
    keys.map((key) => [key, storageState.get(key) ?? null] as [string, string | null])),
  multiSet: vi.fn(async (entries: [string, string][]) => {
    for (const [key, value] of entries) storageState.set(key, value);
  }),
  multiRemove: vi.fn(async (keys: string[]) => {
    for (const key of keys) storageState.delete(key);
  }),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorageMock,
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/_core/auth", () => ({
  getSessionToken: vi.fn(async () => "secure-auth-token"),
}));
vi.mock("@/constants/oauth", () => ({
  API_BASE_URL: "https://api.example.test",
}));

// Mocks must be registered before loading the module-level lifecycle state.
// eslint-disable-next-line import/first
import {
  adoptPersistedTrackingRequest,
  bindPersistedTrackingOwnerIfMissing,
  enableLocationTrackingAuth,
  getPersistedTrackingSession,
  invalidateLocationTrackingAuth,
  isPersistedTrackingOwnedBy,
  resumeTrackingIfActive,
  sendLocationToServer,
  startLocationTracking,
  stopLocationTracking,
  suspendTrackingForAuthUnavailable,
  type LocationTrackingAuthSnapshot,
} from "../lib/location-tracking";

const TRACKING_TOKEN_KEY = "location_tracking_token";
const TRACKING_ACTIVE_KEY = "location_tracking_active";
const TRACKING_SESSION_KEY = "location_tracking_session_v1";

function response(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe("location tracking lifecycle behavior", () => {
  let authSnapshot: LocationTrackingAuthSnapshot;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    invalidateLocationTrackingAuth();
    await stopLocationTracking();
    storageState.clear();
    authSnapshot = enableLocationTrackingAuth("secure-auth-token", 165, 21);
  });

  afterEach(async () => {
    invalidateLocationTrackingAuth();
    await stopLocationTracking();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not persist a late start after auth invalidation", async () => {
    const pendingStart = startLocationTracking(
      "late-session",
      10,
      "https://example.test/track/late-session",
      false,
      authSnapshot,
    );
    invalidateLocationTrackingAuth();

    await expect(pendingStart).resolves.toBe(false);
    expect(storageState.has(TRACKING_TOKEN_KEY)).toBe(false);
  });

  it("does not let a late terminal response for A stop active session B", async () => {
    await expect(startLocationTracking(
      "session-a",
      11,
      null,
      false,
      authSnapshot,
    )).resolves.toBe(true);
    await expect(startLocationTracking(
      "session-b",
      12,
      null,
      false,
      authSnapshot,
    )).resolves.toBe(true);

    vi.mocked(fetch).mockResolvedValueOnce(response(409, { ended: true }));
    await expect(sendLocationToServer("session-a", 37.1, 127.1)).resolves.toBe(
      "terminal",
    );
    expect(storageState.get(TRACKING_TOKEN_KEY)).toBe("session-b");
  });

  it("preserves persisted tracking when update authentication is unavailable", async () => {
    await startLocationTracking(
      "auth-session",
      13,
      null,
      false,
      authSnapshot,
    );
    vi.mocked(fetch).mockResolvedValueOnce(response(401, { error: "unauthorized" }));

    await expect(sendLocationToServer("auth-session", 37.2, 127.2)).resolves.toBe(
      "auth-failed",
    );
    expect((await getPersistedTrackingSession())?.token).toBe("auth-session");
  });

  it("suspends delivery without deleting the visit after auth verification is unavailable", async () => {
    await startLocationTracking(
      "restore-after-auth-outage",
      14,
      "https://example.test/track/restore-after-auth-outage",
      false,
      authSnapshot,
    );

    invalidateLocationTrackingAuth();
    await suspendTrackingForAuthUnavailable();

    expect(await getPersistedTrackingSession()).toMatchObject({
      token: "restore-after-auth-outage",
      requestId: 14,
      ownerUserId: 165,
      ownerTechnicianId: 21,
    });
  });

  it("never restores or transfers a preserved visit to another technician account", async () => {
    await startLocationTracking(
      "owned-session",
      15,
      null,
      false,
      authSnapshot,
    );
    invalidateLocationTrackingAuth();
    await suspendTrackingForAuthUnavailable();

    const otherAuth = enableLocationTrackingAuth("other-auth-token", 266, 31);
    await expect(resumeTrackingIfActive(otherAuth)).resolves.toEqual({
      state: "owner-mismatch",
    });
    await expect(isPersistedTrackingOwnedBy(266, 31)).resolves.toBe(false);
    expect(await getPersistedTrackingSession()).toMatchObject({
      token: "owned-session",
      ownerUserId: 165,
      ownerTechnicianId: 21,
    });
  });

  it("binds an ownerless legacy session only through the explicit one-time owner helper", async () => {
    storageState.set(TRACKING_ACTIVE_KEY, "true");
    storageState.set(TRACKING_TOKEN_KEY, "legacy-ownerless");
    storageState.set(TRACKING_SESSION_KEY, JSON.stringify({
      token: "legacy-ownerless",
      requestId: 16,
      trackingUrl: null,
      backgroundEnabled: false,
    }));

    await expect(bindPersistedTrackingOwnerIfMissing(165, 21)).resolves.toBe(true);
    await expect(isPersistedTrackingOwnedBy(165, 21)).resolves.toBe(true);
    await expect(isPersistedTrackingOwnedBy(266, 31)).resolves.toBe(false);
  });

  it("serializes duplicate legacy adoption so only one request wins", async () => {
    await startLocationTracking(
      "legacy-session",
      null,
      null,
      false,
      authSnapshot,
    );

    const results = await Promise.all([
      adoptPersistedTrackingRequest(
        "legacy-session",
        21,
        "https://example.test/track/legacy-session",
        authSnapshot,
      ),
      adoptPersistedTrackingRequest(
        "legacy-session",
        22,
        "https://example.test/track/legacy-session",
        authSnapshot,
      ),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect([21, 22]).toContain((await getPersistedTrackingSession())?.requestId);
  });
});
