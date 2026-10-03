import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/tech-estimate.tsx", import.meta.url), "utf8");

assert.match(source, /import\s*\{[\s\S]*loadCurrentOrMigrateLegacyDraft,[\s\S]*\}\s*from "@\/lib\/tech-estimate-draft-operations"/, "screen must import the legacy draft loader it invokes");
assert.match(source, /const requestScope = createTechEstimateRequestScope\(actorScope, rawRequestId\)/, "screen must create a combined actor/request scope");
assert.match(source, /const workGenerationRef = useRef\(0\)/, "screen must track a monotonic work generation");
assert.match(source, /const reportOperationRef = useRef\(0\)/, "screen must keep report button state tied to a report operation rather than only a draft generation");
assert.match(source, /setSubmitting\(false\);/, "scope change must release a stale report button lock");
assert.match(source, /startedWorkGeneration: submittedGeneration/, "submit cleanup must include the started work generation");
assert.match(source, /reportOperationRef\.current === submittedReportOperation\) setSubmitting\(false\)/, "late submit finally must release only its current report operation lock");
assert.match(source, /setSubmitting\(false\);\s*advanceWorkGeneration\(\);\s*draftRevisionRef\.current \+= 1;\s*setLines\(\[\]\);/s, "current submit success must unlock before it advances generation, retires its draft revision, and clears form state");
assert.match(source, /legacyDraftKey = `\$\{DRAFT_STORAGE_PREFIX\}:\$\{technicianId \|\| "unknown"\}:\$\{requestDraftId\}`/, "screen must retain the v33 technician/request draft key for migration");
assert.match(source, /loadCurrentOrMigrateLegacyDraft\(/, "screen must migrate a valid legacy draft before declaring no draft");
assert.match(source, /legacyMigrationMarkerKey/, "screen must pass a one-time v33 migration marker");
assert.match(source, /isCurrentDraftOwner: \(\) => draftRevisionRef\.current === submittedDraftRevision/, "submit cleanup must check draft ownership before storage deletion");
assert.match(source, /const saved = await saveDraftForCurrentTechEstimateScope\(/, "saveDraft must verify scope after async storage completes");
assert.match(source, /await removeDraftForCurrentTechEstimateScope\(\{\s*storage: scopedDraftStorage,\s*draftKey,/s, "clearLocalDraft must verify scope after async removal completes");
assert.match(source, /const removed = await removeDraftForCurrentTechEstimateScope\(\{\s*storage: scopedDraftStorage,\s*draftKey: submittedDraftKey,/s, "submit completion must verify scope before clearing draft and form state");

console.log("PASS tech-estimate screen binds late save/delete/submit completions to actor/request/generation scope and migrates valid v33 drafts");
