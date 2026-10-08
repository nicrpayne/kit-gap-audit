import assert from "node:assert/strict";
import { buildCapacityPlanBaseline } from "../lib/scenario/capacityPlan";
import {
  compilePhasedCapacityPlan,
  createPhasedCapacityPlan,
  parsePhasedCapacityPlan,
  phasedCapacityLedger,
  validatePhasedCapacityPlan,
} from "../lib/scenario/phasedCapacity";
import {
  runPortfolioSimulation,
  runPortfolioTrials,
  UnfinishableCapacityScheduleError,
  type ScopeSimulationSpec,
} from "../lib/forecast/portfolio";
import { effortCompletionDay, type CapacityPhase } from "../lib/forecast/simulate";
import { toDateOnly } from "../lib/time/dateContract";

const start = new Date("2026-10-01T00:00:00.000Z");
const date = (value: string) => toDateOnly(value);
const item = (id: string, days: number) => ({ id, label: id, low: days, likely: days, high: days });
const scope = (scopeId: string, days: number, teamCapacity = 1, dependsOnScopeIds: string[] = []): ScopeSimulationSpec => ({
  scopeId,
  items: days > 0 ? [item(`${scopeId}-work`, days)] : [],
  gates: [],
  teamCapacity,
  dependsOnScopeIds,
  startDate: start,
  targetDate: null,
});

// A target with an unrelated inferred/static fallback is explicitly zero until
// the named person arrives. It waits five calendar days and takes two more;
// there is no legacy 1-FTE fallback during the zero-capacity opening.
const onePerson = [{ id: "pancho", name: "Pancho", fte: 1, externalCommitmentFte: 0, active: true }];
const oneAllocation = [{ personId: "pancho", scopeId: "offline", fraction: 1 }];
const oneBaseline = buildCapacityPlanBaseline({
  people: onePerson,
  allocations: oneAllocation,
  contextSwitchCostPct: 20,
  scopeRevisionById: { offline: 3, itrack: 8 },
});
const delayedPlan = createPhasedCapacityPlan({
  baseline: oneBaseline,
  transfers: [{
    id: "pancho-offline-to-itrack",
    personId: "pancho",
    fromScopeId: "offline",
    toScopeId: "itrack",
    fraction: 1,
    effectiveDate: date("2026-10-06"),
  }],
});
const delayedSpecs = compilePhasedCapacityPlan(
  delayedPlan,
  oneBaseline,
  [scope("offline", 2), scope("itrack", 2, 7, ["offline"])],
  start,
);
assert.deepEqual(delayedSpecs.find((spec) => spec.scopeId === "itrack")?.capacityPhases, [
  { startDay: 0, teamCapacity: 0 },
  { startDay: 5, teamCapacity: 1 },
]);
const delayedTrials = runPortfolioTrials(delayedSpecs, 10);
assert.deepEqual(delayedTrials.get("offline"), Array(10).fill(2));
assert.deepEqual(delayedTrials.get("itrack"), Array(10).fill(7));
assert(delayedTrials.get("itrack")!.every(Number.isFinite));

// Cross-scope dependencies still use the same trial-aligned parallel finish
// floor. A zero-work downstream Scope inherits iTrack's exact trial outcome.
const dependencySpecs = [
  ...delayedSpecs,
  scope("release", 0, 1, ["itrack"]),
];
const dependencyTrials = runPortfolioTrials(dependencySpecs, 50);
assert.deepEqual(dependencyTrials.get("release"), dependencyTrials.get("itrack"));

// A permanent drop to zero is allowed only when the complete estimate range
// can finish first. Six developer-days cannot fit into the five funded days;
// the engine throws instead of emitting Infinity or pretending Offline ended.
const unfundedSpecs = compilePhasedCapacityPlan(
  delayedPlan,
  oneBaseline,
  [scope("offline", 6), scope("itrack", 0, 7)],
  start,
);
assert.throws(
  () => runPortfolioSimulation(unfundedSpecs, 20),
  (error) => error instanceof UnfinishableCapacityScheduleError
    && /offline/i.test(error.message)
    && /no funded future capacity/i.test(error.message),
);

// A blocking gate happens before project work. Capacity which leaves during
// that wait cannot be spent retroactively: a six-day gate starts work after a
// day-five drop to zero, so the schedule is visibly impossible.
assert.throws(
  () => runPortfolioTrials([{
    ...scope("gated-drop", 2),
    gates: [{ id: "blocking", label: "Blocking decision", low: 0, likely: 0, high: 6 }],
    capacityPhases: [{ startDay: 0, teamCapacity: 1 }, { startDay: 5, teamCapacity: 0 }],
  }], 0),
  (error) => error instanceof UnfinishableCapacityScheduleError && /no funded future capacity/i.test(error.message),
);

// A zero opening and a blocking gate both advance the absolute start. Work
// begins at the later of the decision release and the first funded phase.
for (const [gateDays, expectedCompletion] of [[3, 7], [7, 9]] as const) {
  const gated = runPortfolioTrials([{
    ...scope(`gated-arrival-${gateDays}`, 2),
    gates: [{ id: "blocking", label: "Blocking decision", low: gateDays, likely: gateDays, high: gateDays }],
    capacityPhases: [{ startDay: 0, teamCapacity: 0 }, { startDay: 5, teamCapacity: 1 }],
  }], 10);
  assert.deepEqual(gated.get(`gated-arrival-${gateDays}`), Array(10).fill(expectedCompletion));
}

// Starting inside a funded phase consumes only the capacity still available
// before the next change, then continues at the new rate.
const gatedMidPhase = runPortfolioTrials([{
  ...scope("gated-mid-phase", 3),
  gates: [{ id: "blocking", label: "Blocking decision", low: 3, likely: 3, high: 3 }],
  capacityPhases: [{ startDay: 0, teamCapacity: 1 }, { startDay: 5, teamCapacity: 0.5 }],
}], 10);
assert.deepEqual(gatedMidPhase.get("gated-mid-phase"), Array(10).fill(7));

// Two independent named moves on one date are atomic, conserve every physical
// FTE and outside commitment, and charge the existing switch-cost formula.
const people = [
  { id: "pancho", name: "Pancho", fte: 1, externalCommitmentFte: 0, active: true },
  { id: "dana", name: "Dana", fte: 1, externalCommitmentFte: 0, active: true },
  { id: "rui", name: "Rui", fte: 1, externalCommitmentFte: 0.2, active: true },
];
const allocations = [
  { personId: "pancho", scopeId: "offline", fraction: 1 },
  { personId: "dana", scopeId: "jsa", fraction: 1 },
  { personId: "rui", scopeId: "jsa", fraction: 0.4 },
  { personId: "rui", scopeId: "itrack", fraction: 0.4 },
];
const baseline = buildCapacityPlanBaseline({
  people,
  allocations,
  contextSwitchCostPct: 20,
  scopeRevisionById: { offline: 3, jsa: 5, itrack: 8 },
});
const multipleMoves = createPhasedCapacityPlan({
  baseline,
  transfers: [
    { id: "pancho-half", personId: "pancho", fromScopeId: "offline", toScopeId: "itrack", fraction: 0.5, effectiveDate: date("2026-10-06") },
    { id: "dana-half", personId: "dana", fromScopeId: "jsa", toScopeId: "offline", fraction: 0.5, effectiveDate: date("2026-10-06") },
    { id: "pancho-rest", personId: "pancho", fromScopeId: "offline", toScopeId: "itrack", fraction: 0.5, effectiveDate: date("2026-10-11") },
  ],
});
const ledger = phasedCapacityLedger(multipleMoves);
assert.equal(ledger.length, 3);
for (const phase of ledger) {
  assert.equal(phase.workforceFte, 3);
  assert.equal(phase.trackedAllocationFte, 2.8);
  assert.equal(phase.externalCommitmentFte, 0.2);
  assert.equal(phase.freeFte, 0);
}
assert.equal(ledger[0].effectiveDate, null);
assert.equal(ledger[1].effectiveDate, date("2026-10-06"));
assert.equal(ledger[1].rawByScope.offline, 1);
assert.equal(ledger[1].effectiveByScope.offline, 0.8);
assert.equal(ledger[1].rawByScope.itrack, 0.9);
assert(Math.abs(ledger[1].effectiveByScope.itrack - 0.72) < 1e-12);
assert(ledger[1].effectiveFte < ledger[0].effectiveFte, "split people lose effectiveness, never physical FTE");

// A same-date chain cannot be order-dependent or funded by capacity that only
// arrives later in the same atomic transaction.
assert.throws(() => createPhasedCapacityPlan({
  baseline: oneBaseline,
  transfers: [
    { id: "in", personId: "pancho", fromScopeId: "offline", toScopeId: "itrack", fraction: 1, effectiveDate: date("2026-10-06") },
    { id: "out", personId: "pancho", fromScopeId: "itrack", toScopeId: "offline", fraction: 1, effectiveDate: date("2026-10-06") },
  ],
}), /only 0\.00.*available/i);

// Exact baseline staleness is inherited from Capacity plans. A label-only
// change remains harmless; an allocation/revision input change is refused.
const relabelled = buildCapacityPlanBaseline({
  people: onePerson.map((person) => ({ ...person, name: "P. Example" })),
  allocations: oneAllocation,
  contextSwitchCostPct: 20,
  scopeRevisionById: { offline: 3, itrack: 8 },
});
assert.deepEqual(validatePhasedCapacityPlan(delayedPlan, relabelled), { ok: true });
const stale = buildCapacityPlanBaseline({
  people: onePerson,
  allocations: oneAllocation,
  contextSwitchCostPct: 20,
  scopeRevisionById: { offline: 4, itrack: 8 },
});
const staleValidation = validatePhasedCapacityPlan(delayedPlan, stale);
assert.equal(staleValidation.ok, false);
assert.match(staleValidation.ok ? "" : staleValidation.reason, /Reality changed/i);
assert.throws(
  () => compilePhasedCapacityPlan(delayedPlan, stale, [scope("offline", 2), scope("itrack", 2)], start),
  /Reality changed/i,
);

// No date is inferred from work completion (or from the clock). The parser
// requires an owner-selected DateOnly and explicitly rejects trigger shapes.
assert.throws(() => parsePhasedCapacityPlan({
  ...delayedPlan,
  transfers: [{ ...delayedPlan.transfers[0], effectiveDate: undefined, afterCompletionOfScopeId: "offline" }],
}), /explicit date hypothesis|Completion-trigger scheduling is not supported/i);
assert.throws(
  () => parsePhasedCapacityPlan({ ...delayedPlan, unsupportedMode: "completion-trigger" }),
  /unsupported fields: unsupportedMode/i,
);
assert.throws(
  () => parsePhasedCapacityPlan({
    ...delayedPlan,
    transfers: [{ ...delayedPlan.transfers[0], unreviewedClaim: "Offline complete" }],
  }),
  /unsupported fields: unreviewedClaim/i,
);

// Optional phased inputs do not perturb the established static model. Empty
// plans leave specs untouched; an equivalent constant schedule consumes the
// exact same identity-keyed random samples and produces the same trial array.
const randomSpec: ScopeSimulationSpec = {
  ...scope("unaffected", 0, 2),
  items: [{ id: "risk", label: "risk", low: 2, likely: 5, high: 11 }],
  gates: [{ id: "gate", label: "gate", low: 1, likely: 2, high: 4 }],
};
const staticTrials = runPortfolioTrials([randomSpec], 1_000).get("unaffected")!;
const scheduledTrials = runPortfolioTrials([{ ...randomSpec, capacityPhases: [{ startDay: 0, teamCapacity: 2 }] }], 1_000).get("unaffected")!;
assert.deepEqual(scheduledTrials, staticTrials);
const emptyPlan = createPhasedCapacityPlan({ baseline, transfers: [] });
const untouchedSpecs = [scope("offline", 1), scope("jsa", 1), scope("itrack", 1)];
const compiledEmpty = compilePhasedCapacityPlan(emptyPlan, baseline, untouchedSpecs, start);
assert.deepEqual(compiledEmpty, untouchedSpecs);
assert.strictEqual(compiledEmpty[0], untouchedSpecs[0]);

// Deterministic property exercise over real piecewise schedules: completion
// consumes exactly the capacity available in each calendar interval, more
// capacity never makes the same effort later, and a zero opening never acts
// like the legacy 1-FTE fallback.
let randomState = 0x9e3779b9;
const random = () => {
  randomState = Math.imul(randomState ^ (randomState >>> 16), 0x21f0aaad);
  randomState = Math.imul(randomState ^ (randomState >>> 15), 0x735a2d97);
  randomState ^= randomState >>> 15;
  return (randomState >>> 0) / 4_294_967_296;
};
for (let caseIndex = 0; caseIndex < 250; caseIndex += 1) {
  const phases: CapacityPhase[] = [{ startDay: 0, teamCapacity: caseIndex % 3 === 0 ? 0 : random() * 1.5 }];
  let startDay = 0;
  const phaseCount = 2 + Math.floor(random() * 5);
  for (let phaseIndex = 1; phaseIndex < phaseCount; phaseIndex += 1) {
    startDay += 1 + Math.floor(random() * 8);
    phases.push({ startDay, teamCapacity: random() * 2.5 });
  }
  // A positive tail makes every finite effort finishable.
  phases[phases.length - 1].teamCapacity = 0.1 + random() * 2.4;
  const effort = 0.05 + random() * 80;
  const workStart = random() * (startDay + 6);
  const completion = effortCompletionDay(effort, phases[0].teamCapacity, phases, workStart);
  assert(Number.isFinite(completion));
  assert(completion >= workStart);

  let delivered = 0;
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    const phaseEnd = phases[phaseIndex + 1]?.startDay ?? completion;
    const segmentStart = Math.max(workStart, phase.startDay);
    const elapsed = Math.max(0, Math.min(completion, phaseEnd) - segmentStart);
    delivered += elapsed * phase.teamCapacity;
    if (completion <= phaseEnd) break;
  }
  assert(Math.abs(delivered - effort) < 1e-8, `case ${caseIndex} must conserve developer-days`);

  const scaled = phases.map((phase) => ({ ...phase, teamCapacity: phase.teamCapacity * 1.5 }));
  assert(effortCompletionDay(effort, scaled[0].teamCapacity, scaled, workStart) <= completion + 1e-10);
  if (phases[0].teamCapacity === 0) {
    assert(completion >= Math.max(workStart, phases[1].startDay), `case ${caseIndex} must wait through its zero-capacity opening`);
  }
}

console.log(JSON.stringify({
  ok: true,
  cases: {
    explicitDateOnly: true,
    delayedZeroToPositive: true,
    permanentDropFailsVisibly: true,
    gateWaitPrecedesPhasedWork: true,
    zeroOpeningAndGateUseLaterStart: true,
    midPhaseGateUsesRemainingWindow: true,
    sameDateMovesAtomic: true,
    workforceAndOutsideCommitmentsConserved: true,
    contextSwitchCostApplied: true,
    staleBaselineRefused: true,
    staticResultsUnchanged: true,
    dependencyTrialsRemainAligned: true,
    calendarDayOffsets: true,
    strictUnknownFieldRefusal: true,
    randomizedPiecewiseCapacityProperties: 250,
  },
}, null, 2));
