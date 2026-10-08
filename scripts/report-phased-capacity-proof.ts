import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCapacityPlanBaseline, createCapacityScenarioPlan } from "../lib/scenario/capacityPlan";
import { compilePhasedCapacityPlan, createPhasedCapacityPlan } from "../lib/scenario/phasedCapacity";
import { runPortfolioSimulation, type ScopeSimulationSpec } from "../lib/forecast/portfolio";
import { freezeForecastBasis, replayFrozenForecast, type FrozenForecastBasisV1 } from "../lib/reports/forecastBasis";
import { countScenarioReportLevers } from "../lib/reports/scenarioConflicts";
import { parseScenarioReportSnapshot, SCENARIO_REPORT_VERSION } from "../lib/reports/scenarioSnapshot";
import { toDateOnly } from "../lib/time/dateContract";

const start = new Date("2026-10-01T00:00:00.000Z");
const people = [{ id: "pancho", name: "Pancho", fte: 1, externalCommitmentFte: 0, active: true }];
const allocations = [{ personId: "pancho", scopeId: "offline", fraction: 1 }];
const baseline = buildCapacityPlanBaseline({
  people,
  allocations,
  contextSwitchCostPct: 15,
  scopeRevisionById: { offline: 4, itrack: 9 },
});
const phasedCapacityPlan = createPhasedCapacityPlan({
  baseline,
  transfers: [{
    id: "pancho-offline-to-itrack",
    personId: "pancho",
    fromScopeId: "offline",
    toScopeId: "itrack",
    fraction: 1,
    effectiveDate: toDateOnly("2026-10-06"),
  }],
});
const scopes: ScopeSimulationSpec[] = [
  {
    scopeId: "offline",
    items: [{ id: "offline-work", label: "Offline work", low: 1, likely: 2, high: 3 }],
    gates: [], teamCapacity: 1, dependsOnScopeIds: [], startDate: start, targetDate: null,
  },
  {
    scopeId: "itrack",
    items: [{ id: "itrack-work", label: "iTrack work", low: 2, likely: 3, high: 5 }],
    gates: [{ id: "itrack-decision", label: "iTrack decision", low: 2, likely: 3, high: 4 }],
    teamCapacity: 4, dependsOnScopeIds: ["offline"], startDate: start, targetDate: null,
  },
];
const compiled = compilePhasedCapacityPlan(phasedCapacityPlan, baseline, scopes, start);
const direct = runPortfolioSimulation(compiled, 5_000);
const frozen = freezeForecastBasis(compiled, [], {
  namedRoster: people,
  modeledAllocations: allocations,
  contextSwitchCostPct: 15,
});
assert.deepEqual(frozen.scopes.find((scope) => scope.scopeId === "itrack")?.capacityPhases, [
  { startDay: 0, teamCapacity: 0 },
  { startDay: 5, teamCapacity: 1 },
]);
const serialized = JSON.parse(JSON.stringify(frozen)) as FrozenForecastBasisV1;
const replayed = replayFrozenForecast(serialized);
for (const scopeId of ["offline", "itrack"]) {
  assert.deepEqual(
    replayed.get(scopeId)?.completionDaysSorted,
    direct.get(scopeId)?.completionDaysSorted,
    `${scopeId} report replay must retain every dated capacity phase and deterministic trial`,
  );
}

const baseSnapshot = {
  version: SCENARIO_REPORT_VERSION,
  scenarioId: "phased-report-proof",
  baseRealityRevision: 9,
  excludedItemIds: [],
  includedItemIds: [],
  resolvedGateIds: [],
  excludedCapabilityIds: [],
  estimateOverrideByItemId: {},
  capacityOverrideByScope: {},
  capacityPlan: null,
  phasedCapacityPlan,
  contextSwitchCostPct: null,
  knowledgeEstimateByCapabilityId: {},
  capabilityStaffingById: {},
};
assert.deepEqual(parseScenarioReportSnapshot(baseSnapshot), baseSnapshot);
assert.throws(
  () => parseScenarioReportSnapshot({
    ...baseSnapshot,
    phasedCapacityPlan: { ...phasedCapacityPlan, completionTrigger: "offline" },
  }),
  /unsupported fields: completionTrigger/i,
  "nested phased staffing payloads fail closed instead of silently dropping future semantics",
);
assert.deepEqual(
  parseScenarioReportSnapshot({ ...baseSnapshot, computed: { scenarioLikelyDate: "invented" } }),
  baseSnapshot,
  "client-supplied computed claims are discarded; server replay owns results and provenance",
);
assert.equal(countScenarioReportLevers({
  excludedItemIds: [], includedItemIds: [], excludedCapabilityIds: [], resolvedGateIds: [],
  estimateOverrideIds: [], knowledgeCapabilityIds: [], staffingCapabilityIds: [], capacityOverrideScopeIds: [],
  hasCapacityPlan: false, hasPhasedCapacityPlan: true, contextSwitchCostPct: null,
}), 1);

const staticPlan = createCapacityScenarioPlan({
  baseline,
  allocations,
  hypotheticalPeople: [],
  requiredByScope: {},
  contextSwitchCostPct: 15,
});
for (const conflict of [
  { capacityPlan: staticPlan },
  { capacityOverrideByScope: { itrack: 1 } },
  { contextSwitchCostPct: 10 },
]) {
  assert.throws(
    () => parseScenarioReportSnapshot({ ...baseSnapshot, ...conflict }),
    /cannot be combined|Choose one capacity hypothesis/i,
  );
}

const serverSource = readFileSync(new URL("../lib/reports/scenario.ts", import.meta.url), "utf8");
assert.match(serverSource, /compilePhasedCapacityPlan\([\s\S]*currentCapacityBaseline[\s\S]*portfolio\.startDate/,
  "report replay must compile against the current exact baseline and canonical simulation date");
assert.match(serverSource, /UnfinishableCapacityScheduleError[\s\S]*Choose a later transfer date/,
  "an unfunded phase must fail as a reviewable report validation error");
assert.match(serverSource, /phasedTransferExplanations[\s\S]*owner-selected calendar date is a hypothesis[\s\S]*does not assert/,
  "canonical causal provenance must retain person, fraction/FTE, source, destination, date, and non-completion meaning");
assert.match(serverSource, /PHASED_CAPACITY_DATE_HYPOTHESIS[\s\S]*completion-trigger scheduling is not modeled/,
  "the saved canonical brief must disclose the explicit-date limitation");
assert.match(serverSource, /scenario\.phasedCapacityPlan\) \{[\s\S]*Keep the canonical Capacity block truthful about the current roster/,
  "future staffing must not be presented as current effective capacity");

console.log(JSON.stringify({ ok: true, cases: {
  strictSnapshotRoundTrip: true,
  mutualExclusion: true,
  leverCount: true,
  frozenPhaseReplay: true,
  gateThenPhaseReplay: true,
  namedDatedProvenance: true,
  noFalseCurrentCapacity: true,
  unfundedReportRefusal: true,
} }, null, 2));
