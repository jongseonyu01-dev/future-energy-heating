import { isCurrentTechEstimateWorkGeneration } from "./tech-estimate-actor-scope";

export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type ScopedDraftOperation = {
  storage: DraftStorage;
  draftKey: string;
  startedRequestScope: string | null;
  getCurrentRequestScope: () => string | null;
  startedWorkGeneration: number;
  getCurrentWorkGeneration: () => number;
  /** 현재 초안 revision을 소유한 완료 작업만 저장소 삭제를 시작할 수 있다. */
  isCurrentDraftOwner?: () => boolean;
  onCurrentScope: () => void;
};

function isCurrentWork(operation: ScopedDraftOperation): boolean {
  return isCurrentTechEstimateWorkGeneration(
    operation.startedRequestScope,
    operation.getCurrentRequestScope(),
    operation.startedWorkGeneration,
    operation.getCurrentWorkGeneration(),
  );
}

function ownsCurrentDraft(operation: ScopedDraftOperation): boolean {
  return operation.isCurrentDraftOwner ? operation.isCurrentDraftOwner() : true;
}

/**
 * 저장 완료 뒤에도 동일 기사·동일 접수 화면인지 재확인한다.
 * 저장 자체는 시작 당시 초안 key에만 수행되므로 다른 기사 초안을 덮어쓰지 않는다.
 */
export async function saveDraftForCurrentTechEstimateScope(
  operation: ScopedDraftOperation & { serializedDraft: string },
): Promise<boolean> {
  await operation.storage.setItem(operation.draftKey, operation.serializedDraft);
  if (!isCurrentWork(operation)) return false;
  operation.onCurrentScope();
  return true;
}

/**
 * 삭제 완료 뒤에도 동일 기사·동일 접수 화면인지 재확인한다.
 * 전환 뒤에는 이전 접수의 storage key만 삭제하고 현재 화면 state는 변경하지 않는다.
 */
export async function removeDraftForCurrentTechEstimateScope(operation: ScopedDraftOperation): Promise<boolean> {
  // AsyncStorage 삭제를 시작하기 전에 현재 화면과 초안 revision의 소유권을 확인한다.
  // A→B→A로 돌아온 뒤 작성한 새 초안을 옛 A 보고 응답이 지우지 못하게 한다.
  if (!isCurrentWork(operation) || !ownsCurrentDraft(operation)) return false;
  await operation.storage.removeItem(operation.draftKey);
  if (!isCurrentWork(operation) || !ownsCurrentDraft(operation)) return false;
  operation.onCurrentScope();
  return true;
}

type DraftMigrationOperation = {
  storage: Pick<DraftStorage, "getItem" | "setItem">;
  currentDraftKey: string;
  legacyDraftKey: string | null;
  /** legacy 원본은 보존하되 한 번 이전한 뒤에는 새 key 삭제 후 재복사하지 않는다. */
  legacyMigrationMarkerKey?: string | null;
  isCurrent: () => boolean;
  isValid: (raw: string) => boolean;
};

/**
 * v33 이전 key를 같은 기사·같은 접수의 새 scoped key로 복사한다.
 * 유효성을 확인한 복사본만 만들며 기존 key는 삭제하지 않아 이전 초안을 보존한다.
 */
export async function loadCurrentOrMigrateLegacyDraft(
  operation: DraftMigrationOperation,
): Promise<{ raw: string; migrated: boolean } | null> {
  const currentRaw = await operation.storage.getItem(operation.currentDraftKey);
  if (!operation.isCurrent()) return null;
  if (currentRaw) return { raw: currentRaw, migrated: false };
  if (!operation.legacyDraftKey || operation.legacyDraftKey === operation.currentDraftKey) return null;
  if (operation.legacyMigrationMarkerKey) {
    const migrationMarked = await operation.storage.getItem(operation.legacyMigrationMarkerKey);
    if (!operation.isCurrent() || migrationMarked) return null;
  }

  const legacyRaw = await operation.storage.getItem(operation.legacyDraftKey);
  if (!operation.isCurrent() || !legacyRaw || !operation.isValid(legacyRaw)) return null;
  await operation.storage.setItem(operation.currentDraftKey, legacyRaw);
  if (operation.legacyMigrationMarkerKey) {
    await operation.storage.setItem(operation.legacyMigrationMarkerKey, "v33-migrated");
  }
  if (!operation.isCurrent()) return null;
  return { raw: legacyRaw, migrated: true };
}
