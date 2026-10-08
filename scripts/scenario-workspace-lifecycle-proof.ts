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

// Bind the pure decisions to their production call sites. These guards are
// intentionally structural; this remains Node evidence, not browser evidence.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const useProjectSource = readFileSync(`${repoRoot}/lib/instrument/useProject.ts`, "utf8");
const savedScenariosSource = readFileSync(`${repoRoot}/components/instrument/SavedScenarios.tsx`, "utf8");
assert.match(useProjectSource, /decodeWorkspaceDraft\(raw\)/);
assert.match(useProjectSource, /"inputVerificationError" in patch/);
assert.match(useProjectSource, /savedScenarioReplyDisposition\(/);
assert.match(useProjectSource, /responseStatus: detail\.status/);
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
