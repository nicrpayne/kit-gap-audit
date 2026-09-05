import assert from "node:assert/strict";
import { buildForecastInputs } from "../lib/forecast/build";
import { contextualHref } from "../lib/shell/context";
import { ALL_DESTINATIONS } from "../lib/shell/mode";
import { forecastActive, gateTarget, openNotGating, type DecisionRow } from "../lib/decisions/model";
import { capacityForecastContract } from "../lib/capacity/contract";
import { readChannel, readMaster } from "../lib/capacity/workforce";
import { resolveCapacity } from "../lib/capacity/resolve";
import { forecastReadingForTime, liveForecastReading } from "../lib/timeline/forecastTruth";
import type { ForecastSnapshot } from "../lib/timeline/entries";
import type { LinearIssueSummary } from "../lib/linear";
import type { SimulationResult } from "../lib/forecast/simulate";

const issue = (
  identifier: string,
  estimate: number,
  parentIdentifier: string | null = null
): LinearIssueSummary => ({
  identifier,
  title: identifier,
  description: null,
  state: "Todo",
  stateType: "unstarted",
  estimate,
  assignee: "Nic",
  labels: [],
  completedAt: null,
  parentIdentifier,
  parentTitle: parentIdentifier,
  projectName: "Truth Contract",
});

const finding = {
  id: "finding-open",
  type: "missing_work",
  title: "Unrepresented obligation",
  status: "open",
  blocking: false,
  estimateHint: "3 days",
};

// 1. FINDING -> REALITY: visible in the Audit-owned fixture, absent from
// Forecast until canonical Linear work represents it; represented once.
const openOnly = buildForecastInputs([], [finding], 1);
assert.equal(openOnly.items.length, 0);
assert.equal(openOnly.unticketedFindingCount, 1);
const represented = buildForecastInputs(
  [issue("SIG-101", 3)],
  [{ ...finding, status: "ticketed" }],
  1
);
assert.deepEqual(represented.items.map((i) => i.id), ["SIG-101"]);
assert.equal(represented.items.reduce((n, i) => n + i.likely, 0), 3);

// Secondary issue: exact production-shaped proof. 17 raw rows = 44d;
// SOF-810 is represented by child SOF-487, so executable leaf total = 41d.
const platformRows = [
  issue("SOF-810", 3),
  issue("SOF-487", 3, "SOF-810"),
  ...Array.from({ length: 14 }, (_, i) => issue(`SOF-F${i + 1}`, 2)),
  issue("SOF-F15", 10),
];
assert.equal(platformRows.length, 17);
assert.equal(platformRows.reduce((n, i) => n + (i.estimate ?? 0), 0), 44);
const platformInputs = buildForecastInputs(platformRows, [], 4);
assert.equal(platformInputs.items.reduce((n, i) => n + i.likely, 0), 41);
assert(!platformInputs.items.some((i) => i.id === "SOF-810"));
assert(platformInputs.items.some((i) => i.id === "SOF-487"));

// 2. ROUTE MATRIX: project, selected canonical object and explicit scenario
// survive every shell destination. Explicit target project always wins.
const current = new URLSearchParams("project=kit-construct&select=decision%3Ad-1&scenario=pivot-a");
const routeMatrix = ALL_DESTINATIONS
  .filter((d, i, all) => all.findIndex((x) => x.href === d.href) === i)
  .map((d) => ({ route: d.href, href: contextualHref(d.href, current) }));
for (const row of routeMatrix) {
  const url = new URL(row.href, "https://signal.test");
  assert.equal(url.searchParams.get("project"), "kit-construct", row.route);
  assert.equal(url.searchParams.get("select"), "decision:d-1", row.route);
  assert.equal(url.searchParams.get("scenario"), "pivot-a", row.route);
}
assert.equal(
  new URL(contextualHref("/forecast?project=jsa", current), "https://signal.test").searchParams.get("project"),
  "jsa"
);

// 3. DECISIONGATE: home project deliberately differs from target project.
const gatedDecision: DecisionRow = {
  id: "decision-pivot",
  scopeId: "jsa",
  title: "When should the team pivot?",
  status: "open",
  owner: "Nic",
  rationale: null,
  neededBy: null,
  options: [],
  chosenOption: null,
  resolution: null,
  decidedAt: null,
  dismissReason: null,
  relatedIssues: [],
  sourceFindingId: null,
  sourceClaimKey: null,
  createdAt: "2026-09-04T00:00:00.000Z",
  scope: { id: "jsa", name: "JSA", targetDate: null },
  evidence: [],
  gate: {
    id: "gate-pivot",
    decisionId: "decision-pivot",
    targetScopeId: "kit-construct",
    targetScope: { id: "kit-construct", name: "KIT Construct", targetDate: null },
    dependency: "KIT Construct staffing waits on the pivot call",
    evidenceForGate: "Named staffing plan",
    low: 1,
    likely: 2,
    high: 4,
    serial: true,
    provenance: "manual",
  },
};
assert.equal(gateTarget(gatedDecision)?.id, "kit-construct");
assert.equal(gateTarget(gatedDecision)?.name, "KIT Construct");
assert(forecastActive(gatedDecision));
const ungated: DecisionRow = { ...gatedDecision, id: "decision-open", gate: null };
assert(openNotGating(ungated));
assert(!forecastActive(ungated));

// 4. TIMELINE: at NOW, the Nov 25 live Forecast wins. In history, the Sep 1
// Report snapshot wins. Missing live data never falls back to old memory.
const liveResult: SimulationResult = {
  earliestDate: new Date("2026-11-20T00:00:00.000Z"),
  likelyDate: new Date("2026-11-25T00:00:00.000Z"),
  latestDate: new Date("2026-12-02T00:00:00.000Z"),
  confidenceAtTarget: 61,
  remainingEffortDays: { low: 10, likely: 20, high: 35 },
  decisionDelayDays: { low: 0, likely: 0, high: 0 },
  completionDaysSorted: [77, 82, 89],
  percentiles: { p10: 77, p50: 82, p70: 85, p85: 88, p90: 89 },
};
const report: ForecastSnapshot = {
  reportId: "report-1",
  scopeId: "kit-construct",
  generatedAt: "2026-08-20T00:00:00.000Z",
  earliestDate: "2026-08-25T00:00:00.000Z",
  likelyDate: "2026-09-01T00:00:00.000Z",
  latestDate: "2026-09-08T00:00:00.000Z",
  targetDate: null,
  confidenceAtTarget: null,
  likelyDateDeltaDays: null,
  shippedCount: 0,
  blockingCount: 0,
  resolvedSinceLastCount: 0,
  summaryMarkdown: "Historical memory",
};
const live = liveForecastReading("kit-construct", "2026-09-04T00:00:00.000Z", liveResult, null);
assert.equal(forecastReadingForTime(true, live, report)?.likelyDate, "2026-11-25T00:00:00.000Z");
assert.equal(forecastReadingForTime(true, live, report)?.temporalRole, "live");
assert.equal(forecastReadingForTime(false, live, report)?.likelyDate, "2026-09-01T00:00:00.000Z");
assert.equal(forecastReadingForTime(false, live, report)?.temporalRole, "historical");
assert.equal(forecastReadingForTime(true, null, report), null);

// 5. CAPACITY: named raw FTE is conserved and Forecast consumes the exact
// effective value after the shared context-switch formula.
const people = [
  { id: "alice", name: "Alice", fte: 1, active: true },
  { id: "bob", name: "Bob", fte: 0.8, active: true },
];
const allocations = [
  { personId: "alice", scopeId: "jsa", fraction: 0.5 },
  { personId: "alice", scopeId: "kit-construct", fraction: 0.5 },
  { personId: "bob", scopeId: "jsa", fraction: 1 },
];
const jsaCapacity = resolveCapacity("jsa", people, allocations, 10);
assert.equal(jsaCapacity.source, "allocations");
assert.equal(jsaCapacity.capacity, 1.25);
const jsaChannel = readChannel({ people, allocations }, "jsa", 10);
assert.equal(jsaChannel.raw, 1.3);
assert.equal(jsaChannel.effective, 1.25);
const kitChannel = readChannel({ people, allocations }, "kit-construct", 10);
assert.equal(kitChannel.raw, 0.5);
assert.equal(kitChannel.effective, 0.45);
const master = readMaster({ people, allocations }, ["jsa", "kit-construct"], 10);
assert.equal(master.workforce, 1.8);
assert.equal(master.allocated, 1.8);
assert.equal(master.effective, 1.7);
const capacityContract = capacityForecastContract(
  "jsa", people, allocations, 10, jsaCapacity.capacity!, "allocations"
);
assert(capacityContract.reconciles);
assert.equal(capacityContract.forecastEffectiveFte, capacityContract.namedEffectiveFte);

const result = {
  fixture: "truth-contract-project-world-v1",
  canonicalOwners: {
    finding: "Audit/Finding",
    work: "Linear issue selected by Scope",
    decisionGateTarget: "DecisionGate.targetScopeId",
    capacity: "Person + Allocation + PortfolioSettings.contextSwitchCostPct",
    liveForecast: "Forecast simulation read model",
    historicalForecast: "immutable Report snapshot",
    dependency: "Scope.dependsOnScopeIds",
    milestone: "TimelineEvent",
  },
  assertions: {
    openFindingForecastItems: openOnly.items.length,
    representedFindingForecastItems: represented.items.length,
    routeCount: routeMatrix.length,
    gateTarget: gateTarget(gatedDecision)?.id,
    ungatedOpenForecastActive: forecastActive(ungated),
    liveLikely: forecastReadingForTime(true, live, report)?.likelyDate,
    historicalLikely: forecastReadingForTime(false, live, report)?.likelyDate,
    workforceFte: master.workforce,
    namedRawFte: master.allocated,
    effectiveFte: master.effective,
    forecastFte: capacityContract.forecastEffectiveFte,
    platformRawLikelyDays: 44,
    platformExecutableLikelyDays: 41,
  },
};

console.log(JSON.stringify(result, null, 2));

