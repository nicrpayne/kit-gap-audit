import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildForecastInputs, type WorkEstimateLike } from "../lib/forecast/build";
import type { LinearIssueSummary } from "../lib/linear";
import { evaluateForecastCoverage } from "../lib/forecast/coverage";
import { presentForecastDeliveryClaim } from "../lib/forecast/claims";
import { buildCapacityPlanBaseline, createCapacityScenarioPlan, validateCapacityScenarioPlan, resolveCapacityPlan } from "../lib/scenario/capacityPlan";
import { applyScenarioInputDelta, type ScenarioInputScope } from "../lib/scenario/inputDelta";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import DecisionCircuit, { type CircuitNode } from "../components/decisions/DecisionCircuit";

// tsx's preserve-JSX runner uses the classic transform; Next uses its own.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const issue: LinearIssueSummary = {
  identifier: "QA-1", title: "Accepted work", description: null, url: "https://example.invalid/QA-1",
  state: "In Progress", stateType: "started", estimate: 8, assignee: null,
  labels: [], completedAt: null, updatedAt: "2026-09-29", parentIdentifier: null, parentTitle: null, projectName: "QA",
};
const estimate: WorkEstimateLike = { externalId: "QA-1", contentHash: "fresh", lowDays: 100, likelyDays: 100, highDays: 100, relevance: "unrelated", rationale: "Synthetic relevance opinion", flags: [] };
const acceptedIssueIds = new Set([issue.identifier]);
for (const relevance of ["unrelated", "core"]) {
  const result = buildForecastInputs([issue], [], 1, { acceptedIssueIds, estimates: new Map([[issue.identifier, { ...estimate, relevance }]]), hashFor: () => "fresh" });
  assert.deepEqual(result.items.map((item) => item.id), ["QA-1"]);
  assert.equal(result.items[0].likely, 100, "relevance cannot erase accepted effort");
  assert.equal(result.ai.unrelatedExcluded.length, 0);
}
const stale = buildForecastInputs([issue], [], 1, { acceptedIssueIds, estimates: new Map([[issue.identifier, estimate]]), hashFor: () => "changed" });
assert.equal(stale.items[0].likely, 8, "stale estimates still fall back without dropping membership");
assert.equal(buildForecastInputs([issue], [], 1, { estimates: new Map([[issue.identifier, estimate]]) }).items.length, 0, "legacy ungoverned relevance behavior is unchanged");
console.log("PASS accepted membership survives unrelated/core/stale estimate transitions");

const people = ["a", "b"].map((id) => ({ id, name: id, fte: 1, active: true }));
const allocations = people.map((person) => ({ personId: person.id, scopeId: person.id, fraction: 1 }));
const baseline = buildCapacityPlanBaseline({ people, allocations, contextSwitchCostPct: 0, scopeRevisionById: { a: 1, b: 1 } });
const scopes: ScenarioInputScope[] = ["a", "b"].map((scopeId) => ({ scopeId, items: [{ id: scopeId, label: scopeId, low: 10, likely: 10, high: 10 }], gates: [], dependsOnScopeIds: [], explicitTeamCapacity: null, teamCapacity: 1, capacitySource: "allocations", startDate: new Date("2026-09-29T00:00:00Z"), targetDate: null }));
for (const fraction of [0, 0.5, 1]) {
  const next = [{ personId: "a", scopeId: "a", fraction }, { personId: "a", scopeId: "b", fraction: 1 - fraction }, allocations[1]];
  const plan = createCapacityScenarioPlan({ baseline, allocations: next, hypotheticalPeople: [], requiredByScope: {}, contextSwitchCostPct: 0 });
  const validation = validateCapacityScenarioPlan(plan, baseline);
  const specs = applyScenarioInputDelta(scopes, people, resolveCapacityPlan(plan));
  assert.equal(specs.reduce((sum, spec) => sum + spec.teamCapacity, 0), 2, "simulation cannot invent a third FTE");
  if (fraction === 0) {
    assert(!validation.ok);
    assert.match(validation.reason, /last named capacity/);
    assert.equal(specs[0].teamCapacity, 0);
    assert.throws(() => runPortfolioSimulation(specs, 20), /no capacity/);
  } else {
    assert(validation.ok);
    assert.equal(runPortfolioSimulation(specs, 20).get("a")!.percentiles.p50, 10 / fraction);
  }
}
const unstaffedLegacy = applyScenarioInputDelta([{ ...scopes[0], capacitySource: "inferred" }], [], { allocations: [], hypotheticalPeople: [], contextSwitchCostPct: 0 });
assert.equal(unstaffedLegacy[0].teamCapacity, 1, "missing inferred capacity remains distinct from emptied named capacity");
console.log("PASS last-person transfer refused; zero preserved; partial transfers conserve capacity");

const complete = evaluateForecastCoverage({ executionState: "configured", issueIds: ["QA-1"], capabilities: [{ status: "accepted", workLinks: [{ externalId: "QA-1", state: "active" }] }], openShapeDecisionCount: 0 });
const incomplete = evaluateForecastCoverage({ executionState: "configured", issueIds: ["QA-1", "QA-2"], capabilities: [{ status: "accepted", workLinks: [{ externalId: "QA-1", state: "active" }] }], openShapeDecisionCount: 3 });
const node = (coverage: typeof complete): CircuitNode => ({ id: "a", name: "JSA", likely: new Date("2026-11-25"), targetDate: null, gateCount: 0, claim: presentForecastDeliveryClaim({ scopeName: "JSA", coverage, likelyDate: "Nov 25" }) });
const render = (origin: CircuitNode, downstream: CircuitNode[] = []) => renderToStaticMarkup(<DecisionCircuit startDate={new Date("2026-09-29")} origin={origin} downstream={downstream} gates={[]} assumedGateIds={new Set()} selectedId={null} onSelect={() => {}} onAssume={() => {}} />);
const partialHtml = render(node(incomplete));
assert.match(partialHtml, /FORECAST INCOMPLETE/);
assert.match(partialHtml, /Modeled subset ~Nov 25/);
assert.match(partialHtml, /not a full-project delivery forecast/i);
assert.doesNotMatch(partialHtml, /Delivery path open/);
assert.match(partialHtml, /No modeled delay gates/);
const completeHtml = render(node(complete), [{ ...node(incomplete), id: "b" }]);
assert.match(completeHtml, /Likely Nov 25/);
assert.match(completeHtml, /Modeled subset ~Nov 25/, "downstream retains its own coverage qualification");
console.log("PASS rendered Decisions circuit qualifies incomplete origin/downstream and retains complete outcomes");
