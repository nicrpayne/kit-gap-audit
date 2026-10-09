import assert from "node:assert/strict";
import {
  buildCapacityPlanBaseline,
  createCapacityScenarioPlan,
} from "../lib/scenario/capacityPlan";
import { createPhasedCapacityPlan } from "../lib/scenario/phasedCapacity";
import {
  SAVED_SCENARIO_PAYLOAD_VERSION,
  SavedScenarioValidationError,
  buildSavedScenarioBaseline,
  compareSavedScenarioBaseline,
  decodeSavedScenario,
  encodeSavedScenario,
  parseSavedScenarioName,
  parseSavedScenarioPayload,
  summarizeSavedScenarioLevers,
  type SavedScenarioBaselineSource,
} from "../lib/scenario/saved";
import { makeSignalEstimate } from "../lib/scope/signalEstimates";
import type { SuiteScenario } from "../lib/instrument/useProject";

const capacityBaseline = buildCapacityPlanBaseline({
  people: [{ id: "person-1", name: "Person One", fte: 1, externalCommitmentFte: 0, active: true }],
  allocations: [
    { personId: "person-1", scopeId: "scope-a", fraction: 0.8 },
    { personId: "person-1", scopeId: "scope-b", fraction: 0.2 },
  ],
  contextSwitchCostPct: 10,
  scopeRevisionById: { "scope-a": 7, "scope-b": 4 },
});

const capacityPlan = createCapacityScenarioPlan({
  baseline: capacityBaseline,
  allocations: [
    { personId: "person-1", scopeId: "scope-a", fraction: 0.6 },
    { personId: "person-1", scopeId: "scope-b", fraction: 0.4 },
  ],
  hypotheticalPeople: [],
  requiredByScope: { "scope-b": 0.25 },
  contextSwitchCostPct: 8,
});

const phasedCapacityPlan = createPhasedCapacityPlan({
  baseline: capacityBaseline,
  transfers: [{
    id: "move-1",
    personId: "person-1",
    fromScopeId: "scope-a",
    toScopeId: "scope-b",
    fraction: 0.2,
    effectiveDate: "2026-11-15" as never,
  }],
});

const nativeEstimate = makeSignalEstimate("cap-a", 3, {
  alreadyDone: "Foundation complete",
  reuseFrom: "",
  remainingWork: "Finish the reviewed boundary",
  rationale: "Operator review",
  evidenceReference: "Planning review",
  asOfDate: "2026-10-07",
  reviewerDisplayName: "Proof operator",
  range: { low: 3, likely: 5, high: 8 },
  coveredOpenItemIds: ["LIN-1"],
  additionalOpenItemIds: ["LIN-2"],
}, ["LIN-1", "LIN-2"], "native-estimate-1", "2026-10-07T12:00:00.000Z");

const scenario: SuiteScenario & { phasedCapacityPlan: typeof phasedCapacityPlan } = {
  remainingEstimateByCapabilityId: { "cap-a": nativeEstimate },
  decisionPlans: {
    "decision-1": {
      basis: "exact-decision-basis",
      state: "gating",
      gate: { targetScopeId: "scope-b", dependency: "Approval", evidenceForGate: "Decision record", low: 1, likely: 2, high: 3 },
    },
  },
  capacityPlan,
  phasedCapacityPlan,
  capacityOverrideByScope: { "scope-a": 0.75 },
  excludedItemIds: new Set(["LIN-3"]),
  includedItemIds: new Set(["LIN-4"]),
  resolvedGateIds: new Set(["gate-1"]),
  estimateOverrideByItemId: { "LIN-5": { low: 2, likely: 4, high: 7 } },
  knowledgeEstimateByCapabilityId: {
    "cap-b": { estimateId: "estimate-knowledge", contextSnapshotId: "snapshot-1", low: 5, likely: 8, high: 13 },
  },
  capabilityStaffingById: {
    "cap-b": { contributors: [{ personId: "person-1", name: "Person One", fte: 0.4 }] },
  },
  bypassedFeatureIds: new Set(["capability:cap-out"]),
  includedCapabilityIds: new Set(["cap-in"]),
  draftFeatures: [{ id: "draft-1", name: "Draft capability", intent: "Preserve this exact draft", itemIds: ["LIN-6"] }],
  acceptedCandidateIds: new Set(["candidate-1"]),
  scopeProposalSelections: [{
    scopeId: "scope-a",
    proposalId: "proposal-1",
    itemId: "proposal-item-1",
    title: "Reviewed proposal",
    description: "Exact proposal copy",
    sourceCapabilityId: "cap-a",
    sourceAlreadyLinkedItemIds: ["LIN-1"],
    targetCapabilityId: "cap-b",
    expectedRevision: 3,
    itemIds: ["LIN-7"],
    releaseStatus: "accepted",
  }],
  contextSwitchCostPct: 12,
};

const encoded = encodeSavedScenario(scenario);
const jsonRoundTrip = parseSavedScenarioPayload(JSON.parse(JSON.stringify(encoded)));
const decoded = decodeSavedScenario(jsonRoundTrip);
assert.equal(encoded.version, SAVED_SCENARIO_PAYLOAD_VERSION);
assert.deepEqual(encodeSavedScenario(decoded), encoded, "every lever must survive JSON and Set conversion exactly");
assert.deepEqual(encoded.phasedCapacityPlan, phasedCapacityPlan, "dated capacity transfers must be preserved");
assert.deepEqual(encoded.remainingEstimateByCapabilityId["cap-a"], nativeEstimate, "native estimate drafts must not collapse to report fields");
assert.deepEqual(encoded.scopeProposalSelections, scenario.scopeProposalSelections, "Scope proposal selections must not be dropped");
assert.deepEqual(encoded.draftFeatures, scenario.draftFeatures, "draft capability intent must not be dropped");
assert.ok(summarizeSavedScenarioLevers(encoded).total >= 16);

assert.throws(
  () => parseSavedScenarioPayload({ ...encoded, reportOnlyShortcut: true }),
  (error: unknown) => error instanceof SavedScenarioValidationError && /unsupported fields/.test(error.message),
  "new fields must fail closed instead of being silently omitted",
);
assert.throws(
  () => parseSavedScenarioPayload({ ...encoded, excludedItemIds: ["LIN-3", "LIN-3"] }),
  /cannot repeat/,
);
assert.throws(
  () => parseSavedScenarioPayload({ ...encoded, phasedCapacityPlan: { ...encoded.phasedCapacityPlan!, completionTrigger: "scope-a" } }),
  /unsupported fields/,
  "nested capacity fields must fail closed instead of disappearing during canonicalization",
);
assert.deepEqual(parseSavedScenarioName("  Launch   option  "), { name: "Launch option", normalizedName: "launch option" });

const baselineSource: SavedScenarioBaselineSource = {
  startDate: new Date("2026-10-07T08:15:00.000Z"),
  scopes: [
    {
      scopeId: "scope-b",
      targetDate: "2027-02-01T00:00:00.000Z",
      dependsOnScopeIds: ["scope-a"],
      items: [{ id: "LIN-2", low: 2, likely: 4, high: 6, state: "Started" }],
      forecastItems: [{ id: "LIN-2", low: 2, likely: 4, high: 6 }],
      gates: [{ id: "gate-2", low: 1, likely: 2, high: 3 }],
      teamCapacity: 0.18,
      capacitySource: "allocations",
      explicitTeamCapacity: null,
      forecastSource: { provider: "Linear", availability: "available" },
      executionSource: { provider: "Linear", availability: "available" },
      forecastCoverage: { state: "forecastable", canonicalForecast: true, reasons: [], census: { executionIssueCount: 1 } },
      executionState: "configured",
      realityState: { realityRevision: 4 },
      capabilities: [{ id: "cap-b", status: "accepted", revision: 1, acceptedEstimate: null }],
      currentContextSnapshotId: "snapshot-b",
    },
    {
      scopeId: "scope-a",
      targetDate: null,
      dependsOnScopeIds: [],
      items: [{ id: "LIN-1", low: 1, likely: 3, high: 5, state: "Todo" }],
      forecastItems: [{ id: "LIN-1", low: 1, likely: 3, high: 5 }],
      gates: [],
      teamCapacity: 0.72,
      capacitySource: "allocations",
      explicitTeamCapacity: null,
      forecastSource: { provider: "Linear", availability: "available" },
      executionSource: { provider: "Linear", availability: "available" },
      forecastCoverage: { state: "forecastable", canonicalForecast: true, reasons: [], census: { executionIssueCount: 1 } },
      executionState: "configured",
      realityState: { realityRevision: 7 },
      capabilities: [{ id: "cap-a", status: "accepted", revision: 3, acceptedEstimate: nativeEstimate }],
      currentContextSnapshotId: "snapshot-a",
    },
  ],
  decisions: [{ id: "decision-1", scopeId: "scope-a", status: "open", updatedAt: "2026-10-07T12:00:00Z", readinessRole: "needs_review", gate: null }],
  people: [{ id: "person-1", fte: 1, externalCommitmentFte: 0, active: true, synthetic: false }],
  allocations: [
    { personId: "person-1", scopeId: "scope-b", fraction: 0.2 },
    { personId: "person-1", scopeId: "scope-a", fraction: 0.8 },
  ],
  contextSwitchCostPct: 10,
};

async function main() {
const baseline = await buildSavedScenarioBaseline(baselineSource);
const reordered = structuredClone(baselineSource);
reordered.scopes.reverse();
reordered.allocations.reverse();
const reorderedBaseline = await buildSavedScenarioBaseline(reordered);
assert.deepEqual(reorderedBaseline, baseline, "semantic collection ordering must not make a baseline stale");
assert.deepEqual(compareSavedScenarioBaseline(baseline, reorderedBaseline), { state: "current", stale: false, differences: [] });
const clientJsonBaseline = await buildSavedScenarioBaseline(JSON.parse(JSON.stringify(baselineSource)));
assert.deepEqual(clientJsonBaseline, baseline, "server Date/object inputs and the fetched client JSON shape must fingerprint identically");

const sameStartDay = structuredClone(baselineSource);
sameStartDay.startDate = new Date("2026-10-07T23:59:59.999Z");
assert.deepEqual(
  await buildSavedScenarioBaseline(sameStartDay),
  baseline,
  "forecast start instants on the same UTC calendar day must not create freshness noise",
);

const nextStartDay = structuredClone(baselineSource);
nextStartDay.startDate = new Date("2026-10-08T00:00:00.000Z");
const nextStartDayResult = compareSavedScenarioBaseline(baseline, await buildSavedScenarioBaseline(nextStartDay));
assert.equal(nextStartDayResult.state, "stale", "advancing the forecast start day must stale dated Scenario timing");
assert.ok(nextStartDayResult.differences.some((difference) => difference.kind === "portfolio_inputs_changed"));

const unstaffed = structuredClone(baselineSource);
unstaffed.scopes[0].teamCapacity = 0;
unstaffed.people[0].fte = 0;
unstaffed.people[0].active = false;
assert.match((await buildSavedScenarioBaseline(unstaffed)).fingerprint, /^sha256:/, "honest zero-capacity Reality must remain fingerprintable");

const executionDrift = structuredClone(baselineSource);
executionDrift.scopes[1].items[0].state = "In Progress";
const driftedBaseline = await buildSavedScenarioBaseline(executionDrift);
const drift = compareSavedScenarioBaseline(baseline, driftedBaseline);
assert.equal(drift.state, "stale", "Linear status drift must be visible even without a Scope revision bump");
assert.ok(drift.differences.some((difference) => difference.kind === "portfolio_inputs_changed"));

const knowledgeDrift = structuredClone(baselineSource);
knowledgeDrift.scopes[1].currentContextSnapshotId = "snapshot-a-2";
assert.equal(compareSavedScenarioBaseline(baseline, await buildSavedScenarioBaseline(knowledgeDrift)).state, "stale");

// Remaining X and Reality's aggregate coverage can be unchanged while a
// Scenario excluding X relies on completed D. Removing D must invalidate it.
const completedSource = structuredClone(baselineSource);
completedSource.scopes[0].completedWork = [{ id: "DONE-D" }, { id: "DONE-E" }];
const completedBaseline = await buildSavedScenarioBaseline(completedSource);
const canceledSource = structuredClone(completedSource);
canceledSource.scopes[0].completedWork = [{ id: "DONE-E" }];
assert.equal(compareSavedScenarioBaseline(completedBaseline, await buildSavedScenarioBaseline(canceledSource)).state, "stale", "completed-to-canceled/absent transition changes Scenario coverage even with identical open work/revisions");
const reorderedCompleted = structuredClone(completedSource);
reorderedCompleted.scopes[0].completedWork!.reverse();
assert.deepEqual(await buildSavedScenarioBaseline(reorderedCompleted), completedBaseline);
const metadataOnly = structuredClone(completedSource);
Object.assign(metadataOnly.scopes[0].completedWork![0], { label: "Renamed display title", completedAt: "2026-10-09" });
assert.deepEqual(await buildSavedScenarioBaseline(metadataOnly), completedBaseline, "completed identity matters, incidental metadata does not");

const revisionDrift = structuredClone(baselineSource);
revisionDrift.scopes[1].realityState.realityRevision += 1;
const revisionResult = compareSavedScenarioBaseline(baseline, await buildSavedScenarioBaseline(revisionDrift));
assert.equal(revisionResult.state, "stale");
assert.ok(revisionResult.differences.some((difference) => difference.kind === "scope_revision_changed"));

// Staleness is metadata about reopening, never a transform of the saved JSON.
assert.deepEqual(encodeSavedScenario(decodeSavedScenario(encoded)), encoded);

console.log("saved-scenario-proof: exact wire codec, validation, phased/static capacity, native estimates, Scope drafts/proposals, calendar-day forecast epoch, stable baseline fingerprint, and stale-without-rebase checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
