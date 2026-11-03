import assert from "node:assert/strict";
import { CURRENT_WORK_POLICY, currentWorkBoundary } from "../lib/forecast/workBoundary";
import { canUsePlanningForecast, deliveryRelevantIssueIds, evaluateForecastCoverage, inheritDependencyCoverage } from "../lib/forecast/coverage";
import { buildForecastInputs } from "../lib/forecast/build";
import type { LinearIssueSummary } from "../lib/linear";
import { currentWorkFixture, provisionalModel } from "./lib/provisional-fixture";
import { EMPTY_SCENARIO } from "../lib/instrument/useProject";
import { scenarioWorkItems } from "../lib/scenario/workItems";
import { scenarioForecastCoverage } from "../lib/scenario/forecastCoverage";
import { buildPlanningBrief, renderPlanningBrief } from "../lib/reports/planningBrief";
import { reportScenarioCoverage } from "../lib/reports/scenarioCoverage";
import { forecastAssumptionSnapshot, presentForecastDeliveryClaim } from "../lib/forecast/claims";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { substituteCapabilityKnowledgeEstimates } from "../lib/scope/knowledgeEstimates";
import { freezeForecastBasis, replayFrozenForecast } from "../lib/reports/forecastBasis";
import { composeScopeFeatures } from "../lib/scope/features";
import { buildBriefRecipe } from "../lib/reports/composer";
import { savedReportHandoff } from "../lib/reports/savedHandoff";
import { recipientSnapshot } from "../lib/reports/recipientSnapshot";

const checks: string[] = [];
const check = (name: string, fn: () => void) => { fn(); checks.push(name); };
const data = currentWorkFixture(), scope = data.scopes[0], sid = scope.scopeId;
const empty = () => structuredClone(EMPTY_SCENARIO);
const evaluate = (overrides: Partial<Parameters<typeof evaluateForecastCoverage>[0]> = {}) => evaluateForecastCoverage({
  workPolicy: CURRENT_WORK_POLICY, executionState: "configured", issueIds: scope.executionItems.map(item => item.id),
  capabilities: scope.capabilities, hasModeledRemainingEffort: true, openShapeDecisionCount: 0, ...overrides,
});
const projection = (state = empty(), active = false) => buildPlanningBrief(provisionalModel(data, state, active), sid);

check("Ungrouped current work counts; deferral is respected without accepting Scope", () => {
  assert.deepEqual(scope.forecastItems.map(item => item.id), ["DEMO-1", "DEMO-2", "DEMO-3"]);
  assert.deepEqual(scope.forecastCoverage.assumedIncludedIssueIds, ["DEMO-2", "DEMO-3"]);
  assert.equal(scope.forecastCoverage.census.modeledExecutionIssueCount, 3);
  assert.equal(scope.forecastCoverage.census.outsideExecutionIssueCount, 1);
  assert.equal(scope.capabilities.length, 2); assert.equal(scope.forecastCoverage.canonicalForecast, false);
  assert(canUsePlanningForecast(scope.forecastCoverage));
});
check("Adding an unmapped ticket adds work immediately; mapping it later preserves all samples", () => {
  const next = structuredClone(data), s = next.scopes[0];
  s.executionItems.push({ ...s.executionItems[0], id: "DEMO-NEW", label: "New work" });
  const regroup = () => {
    const boundary = currentWorkBoundary(s.executionItems.map(item => item.id), s.capabilities);
    s.items = s.executionItems.filter(item => boundary.includedIds.includes(item.id)); s.forecastItems = s.items;
  };
  regroup(); const added = provisionalModel(next).baseline!.get(sid)!;
  assert(added.likelyDate > provisionalModel(data).baseline!.get(sid)!.likelyDate);
  s.capabilities[0].workLinks.push({ ...s.capabilities[0].workLinks[0], externalId: "DEMO-NEW" });
  regroup(); assert.deepEqual(provisionalModel(next).baseline!.get(sid)!.completionDaysSorted, added.completionDaysSorted);
});
check("Empty accepted shape and open choices do not erase current work", () => {
  const c = evaluate({ capabilities: [], openShapeDecisionCount: 4 });
  assert(canUsePlanningForecast(c)); assert.equal(c.census.modeledExecutionIssueCount, 4);
  assert.equal(c.census.unmappedExecutionIssueCount, 4); assert.equal(c.canonicalForecast, false);
});
check("Leaf selection precedes Scope filtering; terminal and excluded triage work do not count", () => {
  const row = (identifier: string, extra = {}) => ({ identifier, title: identifier, description: null, estimate: 42,
    completedAt: null, canceledAt: null, stateType: "started", assignee: null, parentIdentifier: null, ...extra }) as LinearIssueSummary;
  const issues = [row("P"), row("C", {parentIdentifier:"P"}), row("D", {stateType:"completed"}), row("X", {stateType:"canceled"}), row("T", {stateType:"triage"}), row("L")];
  const ids = deliveryRelevantIssueIds(issues, false); assert.deepEqual(ids, ["C", "L"]);
  const boundary = currentWorkBoundary(ids, [{status:"outside",workLinks:[{externalId:"C",state:"active"}]}]);
  const built = buildForecastInputs(issues.filter(issue => boundary.includedIds.includes(issue.identifier)), [], 1, {acceptedIssueIds:new Set(boundary.includedIds)});
  assert.deepEqual(built.items.map(item => item.id), ["L"]);
  assert.deepEqual([built.items[0].low,built.items[0].likely,built.items[0].high], [1,3,7], "42 story points must not become 42 days");
});
check("Conflicting in/out links do not silently re-add deferred work", () => {
  const caps = [...scope.capabilities, {...scope.capabilities[0], status:"outside"}];
  assert(!currentWorkBoundary(scope.executionItems.map(item=>item.id),caps).includedIds.includes("DEMO-1"));
  assert(!canUsePlanningForecast(evaluate({capabilities:caps})));
});
check("Old subset snapshots keep the old interpretation", () => {
  const old = evaluate({workPolicy:undefined}); assert.equal(old.state,"modeled_subset");
  assert.equal(old.census.modeledExecutionIssueCount,1); assert(!canUsePlanningForecast(old));
});
check("Unavailable, stale, empty, all-deferred and zero-effort models never claim ready", () => {
  for (const executionState of ["not_configured","unavailable","stale"]) assert(!canUsePlanningForecast(evaluate({executionState})));
  assert.equal(evaluate({issueIds:[],capabilities:[],hasModeledRemainingEffort:false}).state,"unavailable");
  assert.equal(evaluate({hasModeledRemainingEffort:false}).state,"unavailable");
  assert.equal(evaluate({capabilities:[{status:"outside",workLinks:scope.executionItems.map(item=>({externalId:item.id,state:"active"}))}]}).state,"unavailable");
  assert(!canUsePlanningForecast(evaluate({capabilities:[{...scope.capabilities[0],estimateReviewRequired:true},scope.capabilities[1]]})));
});
check("Planning date and target frequency are available with explicit limits", () => {
  const p = projection(); assert(p.ready); assert.notEqual(p.brief.outcome.targetFrequency,null);
  assert.equal(p.brief.inputs[0].items.length,3); assert.equal(p.brief.inputs[0].assumedIncludedTickets.length,2);
  assert.match(renderPlanningBrief(p.brief),/not a calibrated real-world probability/);
  assert.match(p.brief.outcome.basis,/Unknown future work is not included/);
  const claim = presentForecastDeliveryClaim({scopeName:scope.name,coverage:scope.forecastCoverage,likelyDate:"Nov 5",targetDate:"Nov 15",confidenceAtTarget:70});
  assert(claim.exposesProjectConfidence); assert.match(claim.detail!,/assumed in/);
});
check("Deferring an ungrouped ticket changes the date, restore returns exact baseline", () => {
  const state = empty(); state.excludedItemIds.add("DEMO-2");
  const p = projection(state,true); const before = projection(); assert(p.ready && before.ready);
  assert(p.brief.outcome.likelyDate < before.brief.outcome.likelyDate);
  assert.equal(p.brief.coverage.modeledExecutionIssueCount,2); assert.equal(p.brief.coverage.outsideExecutionIssueCount,2);
  state.excludedItemIds.delete("DEMO-2"); assert.deepEqual(scenarioWorkItems(scope,state),scope.forecastItems);
  assert.equal(scope.forecastCoverage.census.unmappedExecutionIssueCount,2);
});
check("Scenario mapping organizes work without duplicating it", () => {
  const state = empty(); state.scopeProposalSelections = [{scopeId:sid,proposalId:"test",itemId:"new-cap",title:"Group",description:null,sourceCapabilityId:null,sourceAlreadyLinkedItemIds:[],targetCapabilityId:null,expectedRevision:null,itemIds:["DEMO-2"],releaseStatus:"accepted"}];
  assert.deepEqual(scenarioWorkItems(scope,state),scope.forecastItems);
  const c = scenarioForecastCoverage(data.scopes,state,true).get(sid)!;
  assert.equal(c.census.unmappedExecutionIssueCount,1); assert.equal(c.census.modeledExecutionIssueCount,3);
});
check("Reviewed aggregate replaces only covered work, even when mapping is staged", () => {
  const s = structuredClone(scope);
  s.forecastItems = substituteCapabilityKnowledgeEstimates(s.items,[{capabilityId:"Capture",capabilityName:"Capture",estimateId:"review",contextSnapshotId:"snap",range:{low:1,likely:2,high:3},replacedItemIds:["DEMO-1"],authority:"reviewed"}]);
  const state = empty(); state.includedItemIds.add("DEMO-1");
  const items = scenarioWorkItems(s,state);
  assert.equal(items.length,3); assert(!items.some(item=>item.id==="DEMO-1"));
  assert(items.some(item=>item.id==="DEMO-2"));
});
check("Scope composition totals include ungrouped work", () => {
  const composition = composeScopeFeatures(scope.items,[],scope.capabilities,1,new Set(),{},[],new Set(),{},{},new Date(data.startDate),null,new Set(scope.forecastItems.map(item=>item.id)));
  assert.equal(composition.engaged.flatMap(feature=>feature.items).length,3);
});
check("Saved Scenario coverage equals live coverage and freezes the actual exclusion", () => {
  const state=empty();state.excludedItemIds.add("DEMO-2");
  const live=scenarioForecastCoverage(data.scopes,state,true);
  const saved=reportScenarioCoverage(data.scopes,data.scopes.map(row=>({scopeId:row.scopeId,items:scenarioWorkItems(row,state)})),{excludedItemIds:["DEMO-2"],includedItemIds:[],excludedCapabilityIds:[]},[]);
  assert.deepEqual(saved.get(sid),live.get(sid));
});
check("Dependency assumptions propagate; unavailable dependency still refuses", () => {
  const own=evaluate(); const planning=inheritDependencyCoverage(own,[{name:"upstream",coverage:evaluate({capabilities:[]})}]);
  assert(canUsePlanningForecast(planning));assert.equal(planning.census.incompleteDependencyCount,1);
  assert.equal(inheritDependencyCoverage(own,[{name:"upstream",coverage:evaluate({executionState:"unavailable"})}]).state,"unavailable");
});
check("Reports freeze membership and replay the same dates; later source changes cannot rewrite it", () => {
  const owner=healthyOwnerFixture();owner.forecast.coverage=structuredClone(scope.forecastCoverage);owner.forecast.assumptions=forecastAssumptionSnapshot(owner.forecast.coverage);
  const brief=assembleDecisionBrief(owner);const frozen=JSON.stringify(brief.forecast);
  owner.forecast.coverage.assumedIncludedIssueIds!.push("LATER"); assert.equal(JSON.stringify(brief.forecast),frozen);
  assert.match(brief.forecast!.assumptions!.items.find(item=>item.id==="remaining_work")!.detail,/DEMO-2, DEMO-3/);
  const recipe=buildBriefRecipe("delivery-leadership","weekly-update",brief);
  const recipient=recipientSnapshot(savedReportHandoff([{id:"conditional-report",mode:"reality",briefSnapshot:brief,briefRecipe:recipe}],"conditional-report",false));
  assert.match(recipient.reports[0].sourceWarnings.join(" "),/Planning forecast under captured assumptions/);
  assert.match(recipient.reports[0].assumptions.map(item=>item.detail).join(" "),/DEMO-2, DEMO-3/);
  assert.equal(recipient.reports[0].targetFrequency,brief.headline.confidenceAtTarget.value);
  assert(!JSON.stringify(recipient).includes("LATER"),"recipient handoff uses the saved snapshot, never current owner changes");
  const specs=data.scopes.map(row=>({scopeId:row.scopeId,items:row.forecastItems,gates:row.gates,teamCapacity:row.teamCapacity,dependsOnScopeIds:row.dependsOnScopeIds,startDate:new Date(data.startDate),targetDate:row.targetDate?new Date(row.targetDate):null}));
  assert.deepEqual(replayFrozenForecast(freezeForecastBasis(specs,[])).get(sid)!.completionDaysSorted,provisionalModel(data).baseline!.get(sid)!.completionDaysSorted);
});
check("Zero capacity and recomputing data refuse export instead of inventing confidence", () => {
  const model=provisionalModel(data);model.data=structuredClone(data);model.data.scopes[0].realityState.status="pending";
  assert.equal(buildPlanningBrief(model,sid).ready,false);
  model.data.scopes[0].realityState.status="current";model.data.scopes[0].teamCapacity=0;model.data.scopes[0].explicitTeamCapacity=0;model.data.scopes[0].capacitySource="allocations";
  model.data.allocations = model.data.allocations.filter(allocation => allocation.scopeId !== sid);
  assert.equal(buildPlanningBrief(model,sid).ready,false);
});
console.log(JSON.stringify({status:"pass",checks},null,2));
