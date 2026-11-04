import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RECOVERED_DRAFT_VERIFICATION_ERROR,
  decodeWorkspaceDraft,
  encodePendingScenarioMutation,
  encodeWorkspaceDraft,
  resolvePendingScenarioMutation,
  savedScenarioReplyDisposition,
  upsertScenarioMutationResult,
  decodeParkedWorkspaceDrafts,
  parkWorkspaceDraft,
  SCENARIO_DRAFT_STORAGE_KEY,
  SCENARIO_PARKED_DRAFTS_KEY,
} from "../lib/scenario/workspaceRecovery";
import {
  SAVED_SCENARIO_BASELINE_VERSION,
  SAVED_SCENARIO_PAYLOAD_VERSION,
  type SavedScenarioBaselineV1,
  type SavedScenarioPayloadV1,
} from "../lib/scenario/saved";

const payload: SavedScenarioPayloadV1 = {
  version: SAVED_SCENARIO_PAYLOAD_VERSION,
  remainingEstimateByCapabilityId: {},
  decisionPlans: {},
  capacityPlan: null,
  phasedCapacityPlan: null,
  capacityOverrideByScope: {},
  excludedItemIds: ["LIN-1"],
  includedItemIds: [],
  resolvedGateIds: [],
  estimateOverrideByItemId: {},
  knowledgeEstimateByCapabilityId: {},
  capabilityStaffingById: {},
  bypassedFeatureIds: [],
  includedCapabilityIds: [],
  draftFeatures: [],
  acceptedCandidateIds: [],
  scopeProposalSelections: [],
  contextSwitchCostPct: null,
};
const baseline: SavedScenarioBaselineV1 = {
  version: SAVED_SCENARIO_BASELINE_VERSION,
  fingerprint: `sha256:${"a".repeat(64)}`,
  scopeRevisionById: { "scope-a": 7 },
};

// A recovered document must fail closed even if the previous document had
// completed its check; only the new document's successful baseline check may
// clear this state.
const recovered = decodeWorkspaceDraft(encodeWorkspaceDraft({
  payload,
  baseline,
  saved: { id: "saved-1", name: "Launch option", revision: 3 },
  dirty: false,
  inputVerificationError: null,
}));
assert.deepEqual(recovered.payload, payload);
assert.deepEqual(recovered.baseline, baseline);
assert.equal(recovered.saved?.revision, 3);
assert.equal(recovered.dirty, false);
assert.equal(recovered.inputVerificationError, RECOVERED_DRAFT_VERIFICATION_ERROR);

const priorFailure = "Signal could not verify current project inputs.";
assert.equal(decodeWorkspaceDraft(encodeWorkspaceDraft({
  payload,
  baseline,
  saved: null,
  dirty: true,
  inputVerificationError: priorFailure,
})).inputVerificationError, priorFailure, "a failed check must survive reload until a successful replacement baseline");

assert.throws(() => decodeWorkspaceDraft(JSON.stringify({
  version: 1,
  payload,
  baseline,
  saved: { id: "saved-1", name: "Launch option", revision: 0 },
  dirty: false,
})), /recovery link is invalid/, "invalid saved-version metadata must not be recovered");

// An uncertain request keeps its idempotency key in session state. A reload
// reuses it for the exact request, while any changed request receives a new key.
let generated = 0;
const createId = () => `retry-${++generated}`;
const first = resolvePendingScenarioMutation({ signature: "create:launch", current: null, storedRaw: null, createId });
assert.equal(first.id, "retry-1");
const afterReload = resolvePendingScenarioMutation({
  signature: "create:launch",
  current: null,
  storedRaw: encodePendingScenarioMutation(first),
  createId,
});
assert.equal(afterReload.id, first.id, "reload must replay the same uncertain mutation key");
assert.equal(generated, 1, "idempotent reload must not allocate a replacement key");
const changedRequest = resolvePendingScenarioMutation({
  signature: "create:launch-v2",
  current: null,
  storedRaw: encodePendingScenarioMutation(first),
  createId,
});
assert.equal(changedRequest.id, "retry-2", "changed request bodies must never reuse an earlier key");

// Late replies only attach to the draft generation that originated them.
assert.equal(savedScenarioReplyDisposition({
  requestGeneration: 4,
  currentGeneration: 5,
  savedPayloadSignature: "payload-a",
  currentPayloadSignature: "payload-a",
  responseStatus: "active",
}), "ignore");
assert.equal(savedScenarioReplyDisposition({
  requestGeneration: 5,
  currentGeneration: 5,
  savedPayloadSignature: "payload-a",
  currentPayloadSignature: "payload-a",
  responseStatus: "active",
}), "attach-clean");
assert.equal(savedScenarioReplyDisposition({
  requestGeneration: 5,
  currentGeneration: 5,
  savedPayloadSignature: "payload-a",
  currentPayloadSignature: "payload-edited",
  responseStatus: "active",
}), "attach-dirty");
assert.equal(savedScenarioReplyDisposition({
  requestGeneration: 5,
  currentGeneration: 5,
  savedPayloadSignature: "payload-a",
  currentPayloadSignature: "payload-a",
  responseStatus: "archived",
}), "detach-archived", "an archived receipt must never become current saved metadata");

const reconciled = upsertScenarioMutationResult(
  [{ id: "saved-1", status: "active" as const }, { id: "saved-2", status: "active" as const }],
  { id: "saved-1", status: "archived" as const },
);
assert.deepEqual(reconciled, [
  { id: "saved-1", status: "archived" },
  { id: "saved-2", status: "active" },
], "the mutation receipt must update status before any optional list refresh");

// A stale draft can leave the active workspace only after a verified backup.
const originalRecovery = encodeWorkspaceDraft({ payload, baseline, saved: { id: "saved-1", name: "Launch option", revision: 3 }, dirty: true, inputVerificationError: priorFailure });
const values = new Map<string, string>([[SCENARIO_DRAFT_STORAGE_KEY, originalRecovery]]);
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
const draft = decodeWorkspaceDraft(originalRecovery);
const parked = parkWorkspaceDraft(storage, draft, { id: "paused-1", parkedAt: "2026-11-04T15:00:00Z" });
assert.equal(storage.getItem(SCENARIO_DRAFT_STORAGE_KEY), null);
const afterPauseReload = decodeParkedWorkspaceDrafts(storage.getItem(SCENARIO_PARKED_DRAFTS_KEY));
assert.deepEqual(afterPauseReload, parked);
assert.deepEqual(afterPauseReload[0].draft.payload, payload);
assert.deepEqual(afterPauseReload[0].draft.baseline, baseline, "pausing must not rebase or approve changed inputs");
assert.equal(afterPauseReload[0].draft.saved?.revision, 3);
assert.equal(afterPauseReload[0].draft.dirty, true);
storage.setItem(SCENARIO_DRAFT_STORAGE_KEY, originalRecovery);
const twice = parkWorkspaceDraft(storage, draft, { id: "paused-2", parkedAt: "2026-11-04T15:01:00Z" });
assert.equal(twice.length, 2, "new pauses must not silently overwrite older drafts");
assert.equal(twice[1].id, "paused-1");
storage.setItem(SCENARIO_DRAFT_STORAGE_KEY, originalRecovery);
assert.throws(() => parkWorkspaceDraft({ ...storage, setItem: () => { throw new Error("quota"); } }, draft, { id: "quota", parkedAt: "2026-11-04T15:02:00Z" }), /quota/);
assert.equal(storage.getItem(SCENARIO_DRAFT_STORAGE_KEY), originalRecovery, "storage failure retains active recovery");
assert.throws(() => parkWorkspaceDraft({ ...storage, setItem: () => {} }, draft, { id: "silent", parkedAt: "2026-11-04T15:03:00Z" }), /could not be verified/);
assert.equal(storage.getItem(SCENARIO_DRAFT_STORAGE_KEY), originalRecovery);
assert.throws(() => parkWorkspaceDraft({ ...storage, removeItem: () => {} }, draft, { id: "remove", parkedAt: "2026-11-04T15:04:00Z" }), /could not be cleared/);
assert.equal(storage.getItem(SCENARIO_DRAFT_STORAGE_KEY), originalRecovery);
const beforeCorrupt = storage.getItem(SCENARIO_DRAFT_STORAGE_KEY);
storage.setItem(SCENARIO_PARKED_DRAFTS_KEY, "unreadable existing backups");
assert.throws(() => parkWorkspaceDraft(storage, draft, { id: "corrupt", parkedAt: "2026-11-04T15:05:00Z" }));
assert.equal(storage.getItem(SCENARIO_DRAFT_STORAGE_KEY), beforeCorrupt);
assert.equal(storage.getItem(SCENARIO_PARKED_DRAFTS_KEY), "unreadable existing backups", "corrupt prior backups are never overwritten");

// Bind the pure decisions to their production call sites. These guards are
// intentionally structural; this remains Node evidence, not browser evidence.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const useProjectSource = readFileSync(`${repoRoot}/lib/instrument/useProject.ts`, "utf8");
const savedScenariosSource = readFileSync(`${repoRoot}/components/instrument/SavedScenarios.tsx`, "utf8");
assert.match(useProjectSource, /decodeWorkspaceDraft\(raw\)/);
assert.match(useProjectSource, /"inputVerificationError" in patch/);
assert.match(useProjectSource, /savedScenarioReplyDisposition\(/);
assert.match(useProjectSource, /responseStatus: detail\.status/);
assert.match(useProjectSource, /parkWorkspaceDraft\(window\.sessionStorage/);
assert.match(useProjectSource, /scenarioBaseline: draft\.baseline/);
assert.match(useProjectSource, /if \(scenarioIsActive\(store\.scenario\)\) throw new Error/);
assert.match(savedScenariosSource, /restorePausedScenario\(row\.id\)/);
assert.match(savedScenariosSource, /resolvePendingScenarioMutation\(/);
assert.match(savedScenariosSource, /upsertScenarioMutationResult\(current, detail\)/);
assert.match(savedScenariosSource, /disabled=\{!reviewed \|\| busy \|\| !!workspace\.inputVerificationError\}/);
assert.match(savedScenariosSource, /disabled=\{busy \|\| needsReview \|\| !!workspace\.inputVerificationError/);

console.log(JSON.stringify({
  result: "SCENARIO WORKSPACE LIFECYCLE VERIFIED (NODE ONLY)",
  reload: "draft retained and preview/save held for a new baseline check",
  uncertainRequest: `same signature reused ${afterReload.id}`,
  status: reconciled[0].status,
  lateReply: "generation mismatch ignored; archived metadata detached",
  browserAcceptance: false,
}, null, 2));
