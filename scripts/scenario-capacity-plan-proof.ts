import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCapacityPlanBaseline,
  capacityAssumptionLedger,
  capacityPlanIsChanged,
  capacityPlanAffectedScopeIds,
  createCapacityScenarioPlan,
  parseCapacityScenarioPlan,
  resolveCapacityPlan,
  validateCapacityScenarioPlan,
} from "../lib/scenario/capacityPlan";
import { applyScenarioInputDelta, type ScenarioInputScope } from "../lib/scenario/inputDelta";
import { chipsFor } from "../components/instrument/ScenarioStrip";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { removeUnchangedCapacityAssumption } from "../lib/reports/scenarioRecovery";

const scopes: ScenarioInputScope[] = [
  {
    scopeId: "jsa",
    items: [{ id: "jsa-1", label: "JSA", low: 8, likely: 10, high: 12 }],
    gates: [],
    dependsOnScopeIds: [],
    explicitTeamCapacity: null,
    teamCapacity: 0.5,
    capacitySource: "allocations",
    startDate: new Date("2026-09-28T00:00:00.000Z"),
    targetDate: null,
  },
  {
    scopeId: "platform",
    items: [{ id: "platform-1", label: "Platform", low: 8, likely: 10, high: 12 }],
    gates: [],
    dependsOnScopeIds: [],
    explicitTeamCapacity: null,
    teamCapacity: 0.5,
    capacitySource: "allocations",
    startDate: new Date("2026-09-28T00:00:00.000Z"),
    targetDate: null,
  },
];

const people = [
  { id: "james", name: "James", fte: 1, externalCommitmentFte: 0.5, active: true },
  { id: "dana", name: "Dana", fte: 1, externalCommitmentFte: 0, active: true },
];
const allocations = [
  { personId: "james", scopeId: "jsa", fraction: 0.5 },
  { personId: "dana", scopeId: "platform", fraction: 0.5 },
];
const revisions = { jsa: 7, platform: 11 };
const baseline = buildCapacityPlanBaseline({ people, allocations, contextSwitchCostPct: 12, scopeRevisionById: revisions });

// A request beyond the finite workforce is retained as a shortfall and is
// never turned into a phantom Person or simulated FTE.
const shortfallPlan = createCapacityScenarioPlan({
  baseline,
  allocations,
  hypotheticalPeople: [],
  requiredByScope: { jsa: 0.5 },
  contextSwitchCostPct: 12,
});
const shortfallDelta = resolveCapacityPlan(shortfallPlan);
assert.deepEqual(shortfallDelta.hypotheticalPeople, []);
assert.equal(shortfallDelta.allocations.some((row) => row.personId.startsWith("required-")), false);
assert.equal(applyScenarioInputDelta(scopes, people, shortfallDelta).find((scope) => scope.scopeId === "jsa")?.teamCapacity, 0.5);
const shortfallLedger = capacityAssumptionLedger(shortfallPlan);
assert.equal(shortfallLedger.scenario.requiredFte, 0.5);
assert.equal(shortfallLedger.scenario.externalCommitmentFte, 0.5);
assert.equal(shortfallLedger.scenario.workforceFte, 2);
assert.equal(
  chipsFor({ ...EMPTY_SCENARIO, capacityPlan: shortfallPlan }, new Map([["jsa", "JSA"]]), 0, 0)
    .some((chip) => chip.label === "JSA requires 0.5 FTE unstaffed"),
  true,
  "the shared Scenario strip must disclose requested-but-unstaffed capacity",
);

// An explicit hypothetical hire is different: it is named in the plan and is
// the only capacity-plan operation allowed to increase the workforce.
const hirePlan = createCapacityScenarioPlan({
  baseline,
  allocations: [...allocations, { personId: "scenario-hire-1", scopeId: "jsa", fraction: 1 }],
  hypotheticalPeople: [{ id: "scenario-hire-1", name: "Hypothetical hire 1", fte: 0.5, active: true, origin: "hypothetical-hire" }],
  requiredByScope: {},
  contextSwitchCostPct: 12,
});
assert.equal(applyScenarioInputDelta(scopes, people, resolveCapacityPlan(hirePlan)).find((scope) => scope.scopeId === "jsa")?.teamCapacity, 1);
assert.equal(
  chipsFor({ ...EMPTY_SCENARIO, capacityPlan: hirePlan }, new Map([["jsa", "JSA"]]), 0, 0)
    .some((chip) => chip.label === "0.5 FTE explicit hypothetical hire"),
  true,
  "the shared Scenario strip must distinguish explicit hires from shortfalls",
);

const donorPlan = createCapacityScenarioPlan({
  baseline,
  allocations: [
    { personId: "james", scopeId: "jsa", fraction: 0.5 },
    { personId: "dana", scopeId: "platform", fraction: 0.25 },
    { personId: "dana", scopeId: "jsa", fraction: 0.25 },
  ],
  hypotheticalPeople: [],
  requiredByScope: {},
  contextSwitchCostPct: 12,
});
assert.deepEqual(capacityPlanAffectedScopeIds(donorPlan), ["jsa", "platform"]);
assert.equal(donorPlan.allocations.filter((row) => row.personId === "dana").reduce((total, row) => total + row.fraction, 0), 0.5);

// JSON navigation/report round-trip is exact and includes external commitments,
// every scope revision, scenario allocations, hires, shortfalls, and switch cost.
const roundTrip = parseCapacityScenarioPlan(JSON.parse(JSON.stringify(hirePlan)));
assert.deepEqual(roundTrip, hirePlan);
assert.equal(roundTrip.baselineFingerprint.people.find((person) => person.id === "james")?.externalCommitmentFte, 0.5);
assert.deepEqual(roundTrip.baselineFingerprint.scopeRevisionById, revisions);
assert.deepEqual(
  applyScenarioInputDelta(scopes, people, resolveCapacityPlan(roundTrip)),
  applyScenarioInputDelta(scopes, people, resolveCapacityPlan(hirePlan)),
  "Portfolio/Forecast preview and JSON report replay must resolve the same exact input delta",
);

// Capacity composes with other Scenario levers instead of replacing them.
// Here the same replay both applies the explicit hire and consumes a Scope
// edit that removed Platform's work item.
const multiLeverSpecs = applyScenarioInputDelta(
  scopes.map((scope) => scope.scopeId === "platform" ? { ...scope, items: [] } : scope),
  people,
  resolveCapacityPlan(roundTrip),
);
assert.equal(multiLeverSpecs.find((scope) => scope.scopeId === "jsa")?.teamCapacity, 1);
assert.deepEqual(multiLeverSpecs.find((scope) => scope.scopeId === "platform")?.items, []);

// Removing the last named allocation is explicit zero, never a Forecast
// no-op that resurrects the baseline. Reject the plan before publication.
const noOpAllocationPlan = createCapacityScenarioPlan({
  baseline,
  allocations: [{ personId: "dana", scopeId: "jsa", fraction: 0.5 }],
  hypotheticalPeople: [],
  requiredByScope: {},
  contextSwitchCostPct: 12,
});
assert.equal(capacityPlanIsChanged(noOpAllocationPlan), true);
assert.deepEqual(
  applyScenarioInputDelta(scopes, people, resolveCapacityPlan(noOpAllocationPlan)).map((scope) => scope.teamCapacity),
  [0.5, 0],
);
assert.equal(validateCapacityScenarioPlan(noOpAllocationPlan, baseline).ok, false, "an emptied named project must be refused");

// The report blocker offers an explicit, surgical recovery. It removes only
// the no-op Capacity assumption and its compatibility fields; independent
// Scope, estimate, decision, and capability-staffing levers stay staged.
const multiLeverScenario = {
  ...EMPTY_SCENARIO,
  capacityPlan: noOpAllocationPlan,
  capacityOverrideByScope: { jsa: 0.5 },
  contextSwitchCostPct: 12,
  excludedItemIds: new Set(["scope-out"]),
  includedItemIds: new Set(["scope-in"]),
  resolvedGateIds: new Set(["decision-gate"]),
  estimateOverrideByItemId: { ticket: { low: 2, likely: 3, high: 5 } },
  knowledgeEstimateByCapabilityId: { capability: { estimateId: "estimate-1", contextSnapshotId: "snapshot-1", low: 8, likely: 13, high: 21 } },
  capabilityStaffingById: { capability: { contributors: [{ personId: "dana", name: "Dana", fte: 0.5 }] } },
  bypassedFeatureIds: new Set(["capability-out"]),
  includedCapabilityIds: new Set(["capability-in"]),
  draftFeatures: [{ id: "draft", name: "Draft capability", intent: "Test preservation", itemIds: ["scope-in"] }],
  acceptedCandidateIds: new Set(["candidate"]),
  scopeProposalSelections: [{
    scopeId: "jsa",
    proposalId: "proposal",
    itemId: "scope-in",
    title: "Move item",
    description: null,
    sourceCapabilityId: null,
    sourceAlreadyLinkedItemIds: [],
    targetCapabilityId: "capability-in",
    expectedRevision: 2,
    itemIds: ["scope-in"],
    releaseStatus: "accepted" as const,
  }],
};
const recoveredScenario = removeUnchangedCapacityAssumption(multiLeverScenario);
assert.equal(recoveredScenario.capacityPlan, null);
assert.deepEqual(recoveredScenario.capacityOverrideByScope, {});
assert.equal(recoveredScenario.contextSwitchCostPct, null);
assert.deepEqual(recoveredScenario, {
  ...multiLeverScenario,
  capacityPlan: null,
  capacityOverrideByScope: {},
  contextSwitchCostPct: null,
}, "capacity recovery must preserve every independent Scenario lever");
assert.deepEqual(
  removeUnchangedCapacityAssumption({ ...EMPTY_SCENARIO, capacityPlan: noOpAllocationPlan }),
  EMPTY_SCENARIO,
  "removing a capacity-only no-op returns the session to Reality",
);
const reportsClientSource = readFileSync(new URL("../components/ReportsPageClient.tsx", import.meta.url), "utf8");
assert.match(reportsClientSource, /forecast ignores it and a report must not claim it changed the result/);
assert.match(reportsClientSource, /onClick=\{\(\) => project\.setScenario\(removeUnchangedCapacityAssumption\)\}[\s\S]*Remove unchanged capacity assumption/);

assert.deepEqual(validateCapacityScenarioPlan(roundTrip, baseline), { ok: true });
assert.deepEqual(validateCapacityScenarioPlan(roundTrip, buildCapacityPlanBaseline({
  people: people.map((person) => person.id === "james" ? { ...person, name: "Relabelled James" } : person),
  allocations,
  contextSwitchCostPct: 12,
  scopeRevisionById: revisions,
})), { ok: true }, "a person label is not a capacity input");
for (const stale of [
  buildCapacityPlanBaseline({ people: people.map((person) => person.id === "james" ? { ...person, externalCommitmentFte: 0 } : person), allocations, contextSwitchCostPct: 12, scopeRevisionById: revisions }),
  buildCapacityPlanBaseline({ people, allocations: allocations.map((row) => row.personId === "dana" ? { ...row, fraction: 0.25 } : row), contextSwitchCostPct: 12, scopeRevisionById: revisions }),
  buildCapacityPlanBaseline({ people, allocations, contextSwitchCostPct: 8, scopeRevisionById: revisions }),
  buildCapacityPlanBaseline({ people, allocations, contextSwitchCostPct: 12, scopeRevisionById: { ...revisions, platform: 12 } }),
]) {
  const result = validateCapacityScenarioPlan(roundTrip, stale);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /Reality changed/i);
}

assert.throws(() => parseCapacityScenarioPlan({ ...hirePlan, allocations: [{ personId: "unknown", scopeId: "jsa", fraction: 1 }] }), /unknown person/i);
assert.throws(() => parseCapacityScenarioPlan({ ...hirePlan, allocations: [{ personId: "james", scopeId: "unknown", fraction: 0.5 }] }), /unknown project/i);
assert.throws(() => parseCapacityScenarioPlan({ ...hirePlan, allocations: [{ personId: "james", scopeId: "jsa", fraction: 1 }] }), /outside commitment|over-allocated/i);
assert.throws(() => parseCapacityScenarioPlan({ ...hirePlan, requiredByScope: { jsa: -0.5 } }), /shortfall/i);

// The server-owned report replay must treat the legacy aggregate fields as a
// derived compatibility projection, not as a second independently writable
// capacity model. Guard both missing/extra scope keys and the duplicated
// switch-cost field at the production seam.
const scenarioReportSource = readFileSync(new URL("../lib/reports/scenario.ts", import.meta.url), "utf8");
assert.match(scenarioReportSource, /projectionScopeIds[\s\S]*expected === undefined \|\| supplied === undefined/);
assert.match(scenarioReportSource, /expectedLegacySwitchCost[\s\S]*scenario\.contextSwitchCostPct !== expectedLegacySwitchCost/);
assert.match(scenarioReportSource, /!scenario\.capacityPlan && \(Object\.keys\(scenario\.capacityOverrideByScope\)\.length \|\| scenario\.contextSwitchCostPct !== null\)/);
assert.match(scenarioReportSource, /if \(!capacityChangesSimulation\)[\s\S]*does not change any simulated project input/);

console.log(JSON.stringify({ ok: true, cases: {
  outsideCommitmentConserved: true,
  shortfallNotSimulated: true,
  explicitHireSimulated: true,
  exactJsonRoundTrip: true,
  fullBaselineStaleness: true,
  invalidOwnerDataRejected: true,
  capacityAssumptionsVisible: true,
  reportProjectionIsDerived: true,
  noOpReportGuarded: true,
  capacityComposesWithOtherLevers: true,
} }, null, 2));
