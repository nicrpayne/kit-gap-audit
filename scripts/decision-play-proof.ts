import assert from "node:assert/strict";
import { decisionSourceDisposition as source, blocksReleaseReadiness } from "../lib/decisions/sourceDisposition";
import { decisionScenarioBasis as basis, decisionScenarioGates as gates, decisionScenarioOpenCount as count, parseDecisionPlans, validateDecisionPlans, type DecisionScenarioInput } from "../lib/scenario/decisionPlan";
import { parseScenarioReportSnapshot } from "../lib/reports/scenarioSnapshot";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";

const checks: string[] = [];
function check(name: string, test: () => void) { test(); checks.push(name); }
check("Source lifecycle distinguishes recorded agreement from authored/inferred prose", () => {
  assert.equal(source({ sourceStatus: "decided", approvalBasis: "approved", resolution: "Approved release" }).status, "decided");
  for (const approvalBasis of [undefined, "asserted_by_author", "inferred", "unverified"]) assert.equal(source({ sourceStatus: "decided", approvalBasis }).status, "open");
  assert.equal(source({}, ["We agreed to discuss it later."]).status, "open");
  assert.equal(source({}, ["Call made: TASK. Status: DECIDED."]).status, "decided");
  assert.equal(source({ sourceStatus: "open" }, ["Historical Status: DECIDED."]).status, "open");
  assert.equal(source({ sourceStatus: "decided", approvalBasis: "approved", unresolvedContradiction: true }).status, "open");
});
check("Reference questions are not release blockers; unreviewed release relevance stays held", () => {
  assert.equal(blocksReleaseReadiness({ status: "open", readinessRole: "reference" }), false);
  for (const readinessRole of [undefined, "needs_review", "release_scope"]) assert(blocksReleaseReadiness({ status: "open", readinessRole }));
  assert.equal(blocksReleaseReadiness({ status: "decided" }), false);
});
const open: DecisionScenarioInput = { id: "choice-a", scopeId: "a", title: "QA release choice", status: "open", updatedAt: "2026-10-06T00:00:00.000Z", readinessRole: "release_scope", gate: null };
const delay = { targetScopeId: "a", dependency: "The entire release waits on this approval.", evidenceForGate: "Explicit synthetic planning assumption.", low: 7, likely: 7, high: 7 };
const gated: DecisionScenarioInput = { ...open, id: "choice-b", gate: { ...delay, id: "gate-b", serial: true } };
const inputs = [open, gated];
const before = structuredClone(inputs);
const add = { [open.id]: { basis: basis(open), state: "gating" as const, gate: delay } };
const resolve = { [gated.id]: { basis: basis(gated), state: "resolved" as const } };
check("Drag delay uses the exact supplied range and only its target project", () => {
  assert.equal(validateDecisionPlans(add, inputs, ["a", "b"]), null);
  assert.deepEqual(gates("a", [], inputs, add, []), [{ id: "scenario-decision:choice-a", label: open.title, low: 7, likely: 7, high: 7 }]);
  assert.deepEqual(gates("b", [], inputs, add, []), []);
  assert.deepEqual(inputs, before);
});
check("Resolved and open remove delay; only resolved settles the hypothetical release boundary", () => {
  const originalGates = [{ id: "gate-b", label: "Gate", low: 7, likely: 7, high: 7 }];
  assert.equal(gates("a", originalGates, inputs, resolve, []).length, 0);
  assert.equal(count("a", [], inputs, resolve), 0);
  assert.equal(count("a", [], inputs, { [gated.id]: { basis: basis(gated), state: "open" } }), 1);
  assert.equal(count("b", [], inputs, { [gated.id]: { basis: basis(gated), state: "open" } }), 0);
});
check("Ungated resolution saves no time; a seven-day gate changes the same shared simulation", () => {
  const simulate = (gs: ReturnType<typeof gates>) => runPortfolioSimulation([{ scopeId: "a", items: [{ id: "work", label: "Synthetic work", low: 9, likely: 9, high: 9 }], gates: gs, dependsOnScopeIds: [], teamCapacity: 3, startDate: new Date("2026-10-06"), targetDate: null }]).get("a")!;
  const base = simulate([]);
  assert.equal(simulate(gates("a", [], inputs, { [open.id]: { basis: basis(open), state: "resolved" } }, [])).likelyDate.getTime(), base.likelyDate.getTime());
  assert.equal((simulate(gates("a", [], inputs, add, [])).likelyDate.getTime() - base.likelyDate.getTime()) / 86_400_000, 7);
});
check("Stale, missing, settled, conflicting, and malformed assumptions fail closed", () => {
  assert.match(validateDecisionPlans(add, [{ ...open, status: "decided" }], ["a"])!, /changed/);
  assert.match(validateDecisionPlans(add, [{ ...open, updatedAt: "2026-10-07" }], ["a"])!, /changed/);
  assert.match(validateDecisionPlans(add, [], ["a"])!, /changed/);
  assert.match(validateDecisionPlans(add, inputs, [])!, /missing/);
  assert.match(validateDecisionPlans(resolve, inputs, ["a"], ["gate-b"])!, /Conflicting/);
  for (const value of [null, [], new Date(), { x: { state: "resolved" } }, { x: { ...add[open.id], extra: true } }, { x: { ...add[open.id], gate: { ...delay, likely: NaN } } }]) assert.throws(() => parseDecisionPlans(value));
});
check("Report snapshot retains all Decision assumptions and rejects unsupported inputs", () => {
  const snapshot = parseScenarioReportSnapshot({ version: "scenario-report.v2", scenarioId: "decision-play-proof", baseRealityRevision: 1, decisionPlans: add });
  assert.deepEqual(snapshot.decisionPlans, add);
  assert.throws(() => parseScenarioReportSnapshot({ ...snapshot, decisionPlans: { x: { ...add[open.id], state: "imaginary" } } }));
});
console.log(JSON.stringify({ passed: true, groups: checks.length, checks }, null, 2));
