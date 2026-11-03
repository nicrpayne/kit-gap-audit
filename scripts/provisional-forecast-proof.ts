import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { provisionalWorkCandidates, includeProvisionalWork } from "../lib/forecast/provisional";
import { buildPlanningBrief, renderPlanningBrief } from "../lib/reports/planningBrief";
import { encodeSavedScenario, decodeSavedScenario } from "../lib/scenario/saved";
import { scenarioWorkItems } from "../lib/scenario/workItems";
import { provisionalFixture, provisionalModel } from "./lib/provisional-fixture";

const checks: string[] = [];
function check(name: string, run: () => void) { run(); checks.push(name); }
const data = provisionalFixture(), scope = data.scopes[0], sid = scope.scopeId;
const empty = () => structuredClone(EMPTY_SCENARIO);
const unchanged = structuredClone(data);
const selected = includeProvisionalWork(data.scopes, sid, empty(), ["DEMO-2", "DEMO-3"]);

check("Candidates omit accepted work and explicit out/later; inclusion is idempotent per row", () => {
  assert.deepEqual(provisionalWorkCandidates(scope, empty()).map(item => item.id), ["DEMO-2", "DEMO-3"]);
  assert.deepEqual(scenarioWorkItems(scope, selected).map(item => item.id), ["DEMO-1", "DEMO-2", "DEMO-3"]);
  assert.equal(provisionalWorkCandidates(scope, selected).length, 0);
  assert.deepEqual(data, unchanged);
});
check("Explicit selection preserves all other levers and projects", () => {
  const state = empty(); state.estimateOverrideByItemId["OTHER-1"] = { low: 1, likely: 1, high: 2 }; state.excludedItemIds.add("DEMO-3");
  const next = includeProvisionalWork(data.scopes, sid, state, ["DEMO-2", "DEMO-2"]);
  assert.equal(next.includedItemIds.size, 1); assert.deepEqual(next.excludedItemIds, state.excludedItemIds);
  assert.deepEqual(next.estimateOverrideByItemId, state.estimateOverrideByItemId);
  assert.deepEqual(scenarioWorkItems(data.scopes[1], next).map(item => item.id), ["OTHER-1"]);
});
check("Empty, stale, outside and cross-project ownership selections are refused atomically", () => {
  for (const ids of [[], ["missing"], ["DEMO-4"], ["DEMO-1"]]) assert.throws(() => includeProvisionalWork(data.scopes, sid, empty(), ids));
  const duplicate = structuredClone(data); duplicate.scopes[1].executionItems.push(scope.executionItems[1]);
  assert.throws(() => includeProvisionalWork(duplicate.scopes, sid, empty(), ["DEMO-2"]), /more than one project/);
  assert.deepEqual(data, unchanged);
});
check("Unreviewed source outage and legacy all-work projects do not offer inclusion", () => {
  for (const state of ["unavailable", "not_configured"]) assert.equal(provisionalWorkCandidates({ ...scope, executionState: state }, empty()).length, 0);
  assert.equal(provisionalWorkCandidates(data.scopes[1], empty()).length, 0);
});
check("Reviewed capability boundaries are never offered again as new effort", () => {
  const revised = structuredClone(scope);
  revised.capabilities[0].workLinks.push({ id: "covered", externalId: "DEMO-2", provider: "linear", externalUrl: null, state: "active" });
  revised.forecastItems = [{ id: "aggregate", label: "Reviewed remaining feature estimate", low: 2, likely: 3, high: 4 }];
  assert.deepEqual(provisionalWorkCandidates(revised, empty()).map(item => item.id), ["DEMO-3"]);
  const next = includeProvisionalWork([revised], sid, empty(), ["DEMO-3"]);
  assert.deepEqual(scenarioWorkItems(revised, next).map(item => item.id), ["aggregate", "DEMO-3"]);
});
check("Scenario assumptions survive exact save/decode without touching Reality", () => {
  assert.deepEqual(decodeSavedScenario(encodeSavedScenario(selected)).includedItemIds, selected.includedItemIds);
  assert.equal(scope.forecastCoverage.census.unmappedExecutionIssueCount, 2);
});
check("Explicitly including work changes the model date, not an accuracy multiplier", () => {
  const reality = buildPlanningBrief(provisionalModel(data), sid), planning = buildPlanningBrief(provisionalModel(data, selected, true), sid);
  assert(reality.ready && planning.ready);
  assert(planning.brief.outcome.likelyDate > reality.brief.outcome.likelyDate);
  assert.equal(reality.brief.outcome.targetFrequency, null);
  assert.equal(planning.brief.outcome.targetFrequency, 100);
  assert.equal(planning.brief.coverage.unmappedExecutionIssueCount, 0);
  assert.equal(planning.brief.coverage.realityUnclassifiedCount, 2);
  assert.equal(planning.brief.status, "provisional");
  assert.match(planning.brief.notice, /not forecast accuracy/);
});
check("Pending, stale, failed and unavailable previews cannot export an old date", () => {
  for (const override of [
    { previewPending: true }, { simulationError: "stopped" }, { capacityPlanError: "stale" }, { error: "failed refresh" },
    { scenarioPreviewRefusal: { code: "stale_scenario_baseline" as const, message: "stale", action: "review", itemIds: [] } },
  ]) assert.equal(buildPlanningBrief({ ...provisionalModel(data, selected, true), ...override }, sid).ready, false);
  const model = provisionalModel(); model.coverageByScope.set(sid, { ...scope.forecastCoverage, state: "unavailable" });
  assert.equal(buildPlanningBrief(model, sid).ready, false);
});
check("Missing, recomputing dependency and zero-capacity inputs remain unavailable", () => {
  const model = provisionalModel(); model.data!.scopes[0].dependsOnScopeIds = ["missing"];
  assert.equal(buildPlanningBrief(model, sid).ready, false);
  const stale = provisionalModel(); stale.data!.scopes[0].realityState.status = "pending";
  assert.equal(buildPlanningBrief(stale, sid).ready, false);
  const zero = provisionalModel(); zero.data!.scopes[0].teamCapacity = 0; zero.data!.scopes[0].explicitTeamCapacity = 0;
  assert.equal(buildPlanningBrief(zero, sid).ready, false);
});
check("Empty modeled effort has no synthetic date even when source tickets exist", () => {
  const fixture = provisionalFixture(); fixture.scopes[0].forecastItems = []; fixture.scopes[0].items = [];
  assert.equal(buildPlanningBrief(provisionalModel(fixture), sid).ready, false);
});
check("Dependency coverage and evidence remain qualified in the captured brief", () => {
  const fixture = provisionalFixture(); fixture.scopes[1].dependsOnScopeIds = [sid];
  const captured = buildPlanningBrief(provisionalModel(fixture), fixture.scopes[1].scopeId); assert(captured.ready);
  assert.equal(captured.brief.inputs.length, 2); assert.equal(captured.brief.outcome.targetFrequency, null);
  assert(captured.brief.warnings.some(warning => warning.includes("not classified")));
});
check("Local HTML is self-contained, escaped, qualified and frozen", () => {
  const fixture = provisionalFixture(); fixture.scopes[0].name = '<script>alert("not executable")</script>';
  fixture.scopes[0].executionItems[0].quote = "Fictional exact quote: three days remaining.";
  const captured = buildPlanningBrief(provisionalModel(fixture), sid, "2026-10-27T10:00:00Z"); assert(captured.ready);
  const html = renderPlanningBrief(captured.brief);
  assert(!html.includes("<script>")); assert(html.includes("&lt;script&gt;"));
  assert.match(html, /Fictional exact quote: three days remaining/);
  assert.match(html, /not an access-controlled published site/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /Calendar.*calendar days/);
  assert.match(html, /not a task-level resource scheduler/);
  assert.equal(captured.brief.modelAssumptions.version, "forecast-assumptions.v1");
  fixture.scopes[0].forecastCoverage.census.unmappedExecutionIssueCount = 999;
  assert.equal(captured.brief.coverage.unmappedExecutionIssueCount, 2);
  assert.equal(captured.brief.inputs[0].coverage.census.unmappedExecutionIssueCount, 2);
});
check("Partially included work and unresolved choices never gain target likelihood", () => {
  const partial = includeProvisionalWork(data.scopes, sid, empty(), ["DEMO-2"]);
  const captured = buildPlanningBrief(provisionalModel(data, partial, true), sid); assert(captured.ready);
  assert.equal(captured.brief.outcome.targetFrequency, null);
  assert.equal(captured.brief.coverage.unmappedExecutionIssueCount, 1);
  assert.equal(captured.brief.estimateQuality.placeholderCount, 2);
  const unresolved = provisionalFixture(); unresolved.scopes[0].openShapeQuestions = [{ id: "choice", title: "Release boundary", status: "open", rationale: null }];
  const decision = buildPlanningBrief(provisionalModel(unresolved, selected, true), sid); assert(decision.ready);
  assert.equal(decision.brief.outcome.targetFrequency, null);
});
check("Captured capacity matches a combined staffing and membership Scenario", () => {
  const state = structuredClone(selected); state.capacityOverrideByScope[sid] = 2;
  const captured = buildPlanningBrief(provisionalModel(data, state, true), sid); assert(captured.ready);
  assert.equal(captured.brief.inputs[0].modeledCapacity, 2);
  assert.equal(captured.brief.scenario!.capacityOverrideByScope[sid], 2);
  const baseline = buildPlanningBrief(provisionalModel(data, selected, true), sid); assert(baseline.ready);
  assert(captured.brief.outcome.likelyDate < baseline.brief.outcome.likelyDate);
});
check("Malformed estimate ranges cannot escape in a planning brief", () => {
  const model = provisionalModel(); model.data!.scopes[0].forecastItems[0].low = -1;
  assert.equal(buildPlanningBrief(model, sid).ready, false);
});
check("Canonical server report gates remain intact", () => {
  assert.match(readFileSync("lib/reports/readModel.ts", "utf8"), /if \(!canUsePlanningForecast\(forecast.forecastCoverage\)\)/);
  assert.match(readFileSync("lib/reports/scenario.ts", "utf8"), /if \(!canUsePlanningForecast\(target.forecastCoverage\)\)/);
});
console.log(JSON.stringify({ passed: true, groups: checks.length, checks }, null, 2));
