import { describe, expect, it } from "vitest";
import { createTechEstimateActorScope, createTechEstimateRequestScope, isCurrentTechEstimateActorScope } from "../lib/tech-estimate-actor-scope";
import { loadCurrentOrMigrateLegacyDraft, removeDraftForCurrentTechEstimateScope, saveDraftForCurrentTechEstimateScope } from "../lib/tech-estimate-draft-operations";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const instantStorage = { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined };

describe("tech estimate actor-scoped state", () => {
  it("gives different technicians distinct cache and draft scopes without exposing a token", () => {
    const first = createTechEstimateActorScope({ userId: 101, technicianId: 11, appRole: "technician", loginId: "review-tech", token: "secret-a" });
    const second = createTechEstimateActorScope({ userId: 102, technicianId: 12, appRole: "technician", loginId: "review-tech-2", token: "secret-b" });
    expect(first).toBe("tech:101:11");
    expect(second).toBe("tech:102:12");
    expect(first).not.toContain("secret");
    expect(first).not.toBe(second);
  });

  it("rejects a response that started under a different technician scope", () => {
    expect(isCurrentTechEstimateActorScope("tech:101:11", "tech:102:12")).toBe(false);
    expect(isCurrentTechEstimateActorScope("tech:101:11", "tech:101:11")).toBe(true);
    expect(isCurrentTechEstimateActorScope(null, "tech:101:11")).toBe(false);
  });

  it("drops a delayed A-technician response after switching to B technician", async () => {
    const startedScope = createTechEstimateActorScope({ userId: 101, technicianId: 11, appRole: "technician", loginId: "review-tech", token: "secret-a" });
    let activeScope = startedScope;
    const delayedAResponse = new Promise((resolve) => setTimeout(() => resolve({ requestId: 810001 }), 0));
    activeScope = createTechEstimateActorScope({ userId: 102, technicianId: 12, appRole: "technician", loginId: "review-tech-2", token: "secret-b" });
    await delayedAResponse;
    expect(isCurrentTechEstimateActorScope(startedScope, activeScope)).toBe(false);
  });

  it("does not open A draft on B screen when A save completes late", async () => {
    const aScope = createTechEstimateRequestScope("tech:101:11", "810001");
    const bScope = createTechEstimateRequestScope("tech:102:12", "810002");
    let currentScope = aScope;
    let visibleDraft = "B-current";
    const write = deferred<void>();
    const save = saveDraftForCurrentTechEstimateScope({
      storage: { getItem: instantStorage.getItem, setItem: async () => write.promise, removeItem: instantStorage.removeItem },
      draftKey: "draft:A:810001", serializedDraft: "A-draft", startedRequestScope: aScope,
      getCurrentRequestScope: () => currentScope, startedWorkGeneration: 1, getCurrentWorkGeneration: () => 1,
      onCurrentScope: () => { visibleDraft = "A-draft"; },
    });
    currentScope = bScope;
    write.resolve();
    expect(await save).toBe(false);
    expect(visibleDraft).toBe("B-current");
  });

  it("does not clear B draft when A delete completes late", async () => {
    const aScope = createTechEstimateRequestScope("tech:101:11", "810001");
    const bScope = createTechEstimateRequestScope("tech:102:12", "810002");
    let currentScope = aScope;
    let visibleDraft: string | null = "B-current";
    const remove = deferred<void>();
    const deletion = removeDraftForCurrentTechEstimateScope({
      storage: { getItem: instantStorage.getItem, setItem: instantStorage.setItem, removeItem: async () => remove.promise },
      draftKey: "draft:A:810001", startedRequestScope: aScope,
      getCurrentRequestScope: () => currentScope, startedWorkGeneration: 1, getCurrentWorkGeneration: () => 1,
      onCurrentScope: () => { visibleDraft = null; },
    });
    currentScope = bScope;
    remove.resolve();
    expect(await deletion).toBe(false);
    expect(visibleDraft).toBe("B-current");
  });

  it("keeps B report button unlocked when a late A submit finishes after account switch", async () => {
    const aScope = createTechEstimateRequestScope("tech:101:11", "810001");
    const bScope = createTechEstimateRequestScope("tech:102:12", "810002");
    let currentScope = aScope;
    let generation = 1;
    let submitting = true;
    const remove = deferred<void>();
    const completion = removeDraftForCurrentTechEstimateScope({
      storage: { getItem: instantStorage.getItem, setItem: instantStorage.setItem, removeItem: async () => remove.promise },
      draftKey: "draft:A:810001", startedRequestScope: aScope,
      getCurrentRequestScope: () => currentScope, startedWorkGeneration: 1, getCurrentWorkGeneration: () => generation,
      onCurrentScope: () => { submitting = false; },
    });
    currentScope = bScope;
    generation = 2;
    submitting = false;
    remove.resolve();
    expect(await completion).toBe(false);
    expect(submitting).toBe(false);
  });

  it("does not let old A completion remove a newer A draft revision after A→B→A", async () => {
    const aScope = createTechEstimateRequestScope("tech:101:11", "810001");
    let currentScope = aScope;
    let generation = 7;
    let visibleDraft = "A-new-items-and-memo";
    const remove = deferred<void>();
    const completion = removeDraftForCurrentTechEstimateScope({
      storage: { getItem: instantStorage.getItem, setItem: instantStorage.setItem, removeItem: async () => remove.promise },
      draftKey: "draft:A:810001", startedRequestScope: aScope,
      getCurrentRequestScope: () => currentScope, startedWorkGeneration: 5, getCurrentWorkGeneration: () => generation,
      onCurrentScope: () => { visibleDraft = "deleted"; },
    });
    currentScope = createTechEstimateRequestScope("tech:102:12", "810002");
    generation = 6;
    currentScope = aScope;
    generation = 7;
    remove.resolve();
    expect(await completion).toBe(false);
    expect(visibleDraft).toBe("A-new-items-and-memo");
  });

  it("does not start storage deletion when a late report no longer owns A's current draft revision", async () => {
    const aScope = createTechEstimateRequestScope("tech:101:11", "810001");
    let currentScope = aScope;
    let generation = 5;
    let revision = 9;
    let removeCalls = 0;
    const removed = await removeDraftForCurrentTechEstimateScope({
      storage: {
        ...instantStorage,
        removeItem: async () => { removeCalls += 1; },
      },
      draftKey: "draft:A:810001",
      startedRequestScope: aScope,
      getCurrentRequestScope: () => currentScope,
      startedWorkGeneration: 5,
      getCurrentWorkGeneration: () => generation,
      isCurrentDraftOwner: () => revision === 8,
      onCurrentScope: () => { throw new Error("stale report must not update UI"); },
    });
    expect(removed).toBe(false);
    expect(removeCalls).toBe(0);
    expect(currentScope).toBe(aScope);
    expect(generation).toBe(5);
  });

  it("migrates valid v33 same-technician/request draft without deleting its legacy key", async () => {
    const records = new Map<string, string>([["draft:v1:11:810001", "valid-v33"]]);
    const loaded = await loadCurrentOrMigrateLegacyDraft({
      storage: { getItem: async (key) => records.get(key) ?? null, setItem: async (key, value) => { records.set(key, value); } },
      currentDraftKey: "draft:v1:tech:101:11:810001", legacyDraftKey: "draft:v1:11:810001",
      legacyMigrationMarkerKey: "draft:v1:tech:101:11:810001:v33-migrated",
      isCurrent: () => true, isValid: (value) => value === "valid-v33",
    });
    expect(loaded).toEqual({ raw: "valid-v33", migrated: true });
    expect(records.get("draft:v1:tech:101:11:810001")).toBe("valid-v33");
    expect(records.get("draft:v1:11:810001")).toBe("valid-v33");
  });

  it("preserves the v33 source but does not copy it again after the migrated scoped draft is deleted", async () => {
    const legacyKey = "draft:v1:11:810001";
    const currentKey = "draft:v1:tech:101:11:810001";
    const markerKey = `${currentKey}:v33-migrated`;
    const records = new Map<string, string>([[legacyKey, "valid-v33"]]);
    const storage = {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => { records.set(key, value); },
    };
    const first = await loadCurrentOrMigrateLegacyDraft({
      storage, currentDraftKey: currentKey, legacyDraftKey: legacyKey, legacyMigrationMarkerKey: markerKey,
      isCurrent: () => true, isValid: (value) => value === "valid-v33",
    });
    expect(first?.migrated).toBe(true);
    records.delete(currentKey);
    const reentered = await loadCurrentOrMigrateLegacyDraft({
      storage, currentDraftKey: currentKey, legacyDraftKey: legacyKey, legacyMigrationMarkerKey: markerKey,
      isCurrent: () => true, isValid: (value) => value === "valid-v33",
    });
    expect(reentered).toBeNull();
    expect(records.get(legacyKey)).toBe("valid-v33");
    expect(records.get(currentKey)).toBeUndefined();
  });
});
