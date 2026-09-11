import assert from "node:assert/strict";
import { evaluateForecastCoverage } from "../lib/forecast/coverage";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { composeScopeFeatures } from "../lib/scope/features";
import { partitionProductShape, type ShapeCapability } from "../lib/scope/productShape";
import type { ScopeWorkItem } from "../lib/forecast/compute";

const startDate = new Date("2026-09-11T00:00:00.000Z");
const targetDate = new Date("2026-10-31T00:00:00.000Z");
const ranges = [
  [1.4, 2, 3.2], [2.1, 3, 4.8], [1.4, 2, 3.2], [1, 3, 7],
  [1.4, 2, 3.2], [1, 3, 7], [1, 3, 7], [1, 3, 7],
  [1.4, 2, 3.2], [1, 3, 7], [1, 3, 7], [1, 3, 7],
  [1, 3, 7], [1, 3, 7], [0.7, 1, 1.6], [1.4, 2, 3.2],
] as const;

const platformItems = ranges.map(([low, likely, high], index) => ({
  id: `SOF-${index + 1}`,
  label: `Production-shaped Platform item ${index + 1}`,
  low,
  likely,
  high,
}));
const simulation = runPortfolioSimulation([
  {
    scopeId: "platform",
    items: platformItems,
    gates: [],
    teamCapacity: 5,
    dependsOnScopeIds: [],
    startDate,
    targetDate: null,
  },
  {
    scopeId: "itrack",
    items: [],
    gates: [{ id: "test", label: "Test", low: 1, likely: 4, high: 10 }],
    teamCapacity: 1,
    dependsOnScopeIds: ["platform"],
    startDate,
    targetDate,
  },
]);
const iTrackSimulation = simulation.get("itrack")!;
assert.equal(iTrackSimulation.likelyDate.toISOString().slice(0, 10), "2026-09-21");
assert.equal(iTrackSimulation.earliestDate.toISOString().slice(0, 10), "2026-09-20");
assert.equal(iTrackSimulation.latestDate.toISOString().slice(0, 10), "2026-09-22");
assert.equal(iTrackSimulation.confidenceAtTarget, 100);
assert.deepEqual(iTrackSimulation.remainingEffortDays, { low: 0, likely: 0, high: 0 });
assert.deepEqual(iTrackSimulation.decisionDelayDays, { low: 1, likely: 4, high: 10 });

const iTrackCoverage = evaluateForecastCoverage({
  executionState: "configured",
  issueIds: [],
  capabilities: [{ status: "provision_only", workLinks: [] }],
  openShapeDecisionCount: 4,
});
assert.equal(iTrackCoverage.state, "modeled_subset");
assert.equal(iTrackCoverage.canonicalForecast, false);
assert.ok(iTrackCoverage.reasons.some((reason) => reason.code === "execution_source_empty"));
assert.ok(iTrackCoverage.reasons.some((reason) => reason.code === "shape_decisions_open"));

const platformCoverage = evaluateForecastCoverage({
  executionState: "configured",
  issueIds: platformItems.map((item) => item.id),
  capabilities: [],
  openShapeDecisionCount: 0,
});
assert.equal(platformCoverage.state, "forecastable");

const capabilities: ShapeCapability[] = [
  { id: "accepted-mapped", name: "Accepted mapped", description: null, status: "accepted", workLinks: [{ id: "link-1", provider: "linear", externalId: "SOF-1", externalUrl: null, state: "active" }] },
  { id: "accepted-unmapped", name: "Accepted without work", description: null, status: "accepted", workLinks: [] },
  { id: "deferred", name: "Later", description: null, status: "deferred", workLinks: [] },
];
const item = (id: string): ScopeWorkItem => ({
  id,
  label: id,
  low: 1,
  likely: 2,
  high: 3,
  estimateSource: "points",
  kind: "ticket",
  state: "Todo",
  assignee: null,
  points: 2,
  quote: null,
  rationale: null,
  parentIdentifier: null,
  parentTitle: null,
  projectName: "Proof",
});
const composition = composeScopeFeatures(
  [item("SOF-1"), item("SOF-2")],
  [],
  capabilities,
  1,
  new Set(),
  {},
  [],
);
const mapped = composition.features.find((feature) => feature.id === "capability:accepted-mapped");
const unmappedAccepted = composition.features.find((feature) => feature.id === "capability:accepted-unmapped");
const noCapability = composition.features.find((feature) => feature.id === "__unmapped__");
assert.equal(mapped?.source, "canonical");
assert.deepEqual(mapped?.items.map((work) => work.id), ["SOF-1"]);
assert.equal(unmappedAccepted?.items.length, 0);
assert.equal(unmappedAccepted?.range.high, 0, "no mapping creates no fake distribution");
assert.deepEqual(noCapability?.items.map((work) => work.id), ["SOF-2"]);
assert.deepEqual(partitionProductShape(capabilities).outsideRelease.map((capability) => capability.id), ["deferred"]);

console.log(JSON.stringify({
  ok: true,
  productionShapedReproduction: {
    likelyDate: "2026-09-21",
    window: ["2026-09-20", "2026-09-22"],
    rawSubsetConfidenceAtTarget: 100,
    iTrackExecutionItems: 0,
    inheritedPlatformItems: 16,
    gate: { low: 1, likely: 4, high: 10 },
  },
  coverage: {
    iTrack: iTrackCoverage.state,
    platform: platformCoverage.state,
    canonicalConfidenceExposedForITrack: iTrackCoverage.canonicalForecast,
  },
  composer: {
    acceptedMapped: mapped?.items.length,
    acceptedUnmapped: unmappedAccepted?.items.length,
    noCapabilityYet: noCapability?.items.length,
    outsideRelease: 1,
  },
}, null, 2));
