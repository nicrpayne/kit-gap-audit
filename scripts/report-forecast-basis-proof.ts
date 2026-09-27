import assert from "node:assert/strict";
import {
  freezeCapabilityEstimate,
  freezeForecastBasis,
  freezeForecastCapacityBasis,
  replayFrozenForecast,
} from "../lib/reports/forecastBasis";
import { runPortfolioSimulation, type ScopeSimulationSpec } from "../lib/forecast/portfolio";
import { acceptCapabilityKnowledgeEstimate } from "../lib/scope/knowledgeEstimates";
import { normalizeReportJsonForPersistence } from "../lib/reports/persistenceNormalization";
import type { FrozenCapabilityEstimate } from "../lib/reports/forecastBasis";

function legacyEstimate(record: FrozenCapabilityEstimate) {
  const value = record.estimate;
  if ("version" in value && value.version === "accepted-capability-estimate.v2") {
    throw new Error("Expected the historical accepted fixture.");
  }
  return value;
}

// Synthetic control, not a claim about the actual refinement transcript.
const estimate = acceptCapabilityKnowledgeEstimate({
  id: "estimate-1", contextSnapshotId: "snapshot-A", capabilityId: "feature-1",
  rawEstimate: "Fractional developer days remaining", range: { low: 1 / 3, likely: 2 / 3, high: 4 / 3 },
  rawUnit: "developer_days", rawValues: [1 / 3, 2 / 3, 4 / 3], rawShape: "three_point",
  sourceWorkMeaning: "remaining", currentness: "current", supersedes: [], supersededBy: [],
  unit: "developer_days", basis: "remaining_capability", speaker: null, owner: null,
  observedAt: "2026-09-22", sourceRef: "synthetic-transcript", excerpt: "2–4 developer days remaining",
  evidenceRefs: ["exact-passage"], statement: "Synthetic feature estimate", confidence: null,
  passages: [{ id: "exact-passage", sourceRef: "synthetic-transcript", exactQuote: "2–4 developer days remaining", externalRef: null, sourceUrl: null, surroundingContext: null }],
}, "2026-09-23T12:00:00Z");
const specs: ScopeSimulationSpec[] = [{
  scopeId: "synthetic", items: [{ id: "knowledge-estimate:feature-1:estimate-1", label: "Feature", ...estimate.range }],
  gates: [], teamCapacity: 1, dependsOnScopeIds: ["upstream"], startDate: new Date("2026-09-26T00:00:00Z"), targetDate: new Date("2026-10-31T00:00:00Z"),
}, {
  scopeId: "upstream", items: [{ id: "UP-1", label: "Prerequisite", low: 4, likely: 6, high: 8 }],
  gates: [], teamCapacity: 1, dependsOnScopeIds: [], startDate: new Date("2026-09-26T00:00:00Z"), targetDate: null,
}];
const expected = runPortfolioSimulation(specs).get("synthetic")!;
const evidence = freezeCapabilityEstimate("synthetic", { id: "feature-1", name: "Feature", revision: 4 }, estimate, ["WORK-2", "WORK-1", "WORK-1"]);
const capacityInput = {
  namedRoster: [
    { id: "person-1", name: "Ada", fte: 1, externalCommitmentFte: 0.2, active: true },
    { id: "person-2", name: "Grace", fte: 0.5, externalCommitmentFte: 0.1, active: false },
  ],
  modeledAllocations: [
    { personId: "person-1", scopeId: "synthetic", fraction: 2 / 3 },
    { personId: "hire-1", scopeId: "upstream", fraction: 1 },
  ],
  contextSwitchCostPct: 12,
  hypotheticalHires: [
    { id: "hire-1", name: "Hypothetical hire 1", fte: 1, active: true, origin: "hypothetical-hire" as const },
  ],
  aggregateOverridesByScope: { synthetic: 1.75 },
};
const frozenCapacity = freezeForecastCapacityBasis(capacityInput);
const saved = freezeForecastBasis(specs, [evidence], capacityInput);
const immutableJson = JSON.stringify(saved);
const basisAtPersistence = structuredClone(saved);
const persistenceInput = { presentationMetric: 2 / 3, forecast: { basis: basisAtPersistence } };
const persisted = normalizeReportJsonForPersistence(persistenceInput);
assert.equal(persisted.presentationMetric, 0.666666667, "legacy presentation numbers retain nine-decimal normalization");
assert.deepEqual(persisted.forecast.basis, saved, "persistence normalization preserves the complete frozen forecast basis exactly");
assert.equal(persisted.forecast.basis.capacity?.modeledAllocations[0].fraction, 2 / 3);
assert.equal(legacyEstimate(persisted.forecast.basis.capabilityEstimates[0]).range?.low, 1 / 3);
assert.deepEqual(
  replayFrozenForecast(persisted.forecast.basis).get("synthetic")!.completionDaysSorted,
  expected.completionDaysSorted,
  "persistence normalization cannot move replay boundaries",
);
basisAtPersistence.capacity!.modeledAllocations[0].fraction = 0.25;
legacyEstimate(basisAtPersistence.capabilityEstimates[0]).range!.low = 0.25;
assert.equal(persisted.forecast.basis.capacity?.modeledAllocations[0].fraction, 2 / 3, "persisted basis is detached from later owner mutation");
assert.equal(legacyEstimate(persisted.forecast.basis.capabilityEstimates[0]).range?.low, 1 / 3);
assert.equal(replayFrozenForecast(saved).get("synthetic")!.likelyDate.toISOString(), expected.likelyDate.toISOString());
assert.deepEqual(replayFrozenForecast(saved).get("synthetic")!.completionDaysSorted, expected.completionDaysSorted);
estimate.excerpt = "Newer quote B";
estimate.range.likely = 100;
specs[0].teamCapacity = 8;
specs[1].items[0].high = 40;
capacityInput.namedRoster[0].name = "Changed later";
capacityInput.namedRoster[0].externalCommitmentFte = 0.7;
capacityInput.modeledAllocations[0].fraction = 0.1;
capacityInput.hypotheticalHires[0].fte = 4;
capacityInput.aggregateOverridesByScope.synthetic = 9;
assert.equal(JSON.stringify(saved), immutableJson, "later source/owner mutation cannot alter saved report basis");
assert.deepEqual(saved.capacity, frozenCapacity, "the report freezes the exact capacity input beside the simulation specs");
assert.deepEqual(saved.capacity?.namedRoster, [
  { id: "person-1", name: "Ada", fte: 1, externalCommitmentFte: 0.2, active: true },
  { id: "person-2", name: "Grace", fte: 0.5, externalCommitmentFte: 0.1, active: false },
]);
assert.deepEqual(saved.capacity?.modeledAllocations, [
  { personId: "person-1", scopeId: "synthetic", fraction: 2 / 3 },
  { personId: "hire-1", scopeId: "upstream", fraction: 1 },
]);
assert.deepEqual(saved.capacity?.hypotheticalHires, [
  { id: "hire-1", name: "Hypothetical hire 1", fte: 1, externalCommitmentFte: 0, active: true, origin: "hypothetical-hire" },
]);
assert.deepEqual(saved.capacity?.aggregateOverridesByScope, { synthetic: 1.75 });
assert.equal(saved.capacity?.contextSwitchCostPct, 12);
assert.equal(legacyEstimate(saved.capabilityEstimates[0]).contextSnapshotId, "snapshot-A");
assert.equal(legacyEstimate(saved.capabilityEstimates[0]).excerpt, "2–4 developer days remaining");
assert.deepEqual(saved.capabilityEstimates[0].replacedItemIds, ["WORK-1", "WORK-2"]);
assert.equal(new URL(saved.capabilityEstimates[0].auditHref!, "http://localhost").searchParams.get("select"), "passage:snapshot-A:exact-passage");
assert.throws(() => replayFrozenForecast({ ...saved, seed: 1 }), /original model version/);
const legacy = freezeForecastBasis(specs, [evidence]);
assert.equal(legacy.capacity, undefined, "capacity is additive so historical forecast-basis.v1 JSON remains valid");
console.log("PASS: forecast basis freezes and persists exact fractional replay inputs while presentation numbers retain legacy normalization.");
