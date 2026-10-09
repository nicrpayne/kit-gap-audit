import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { isCompletedIssue } from "../lib/linearIssueState";
import { deliveryRelevantIssueIds, evaluateForecastCoverage, inheritDependencyCoverage } from "../lib/forecast/coverage";
import { composeScopeFeatures, linkedWorkDone } from "../lib/scope/features";
import { scenarioForecastCoverage } from "../lib/scenario/forecastCoverage";
import { EMPTY_SCENARIO, type ProjectScope, type ScopeWorkItem } from "../lib/instrument/useProject";
import CapabilityTile from "../components/instrument/CapabilityTile";
import FeatureDetail from "../components/instrument/FeatureDetail";
import { presentForecastDeliveryClaim } from "../lib/forecast/claims";
import { deliveryNextAction } from "../lib/instrument/nextAction";
import { readProjectField } from "../lib/control-room/field";
import { readControlRoom } from "../lib/control-room/read";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import Inspector from "../components/control-room/Inspector";
import type { ProjectPayload } from "../lib/instrument/useProject";
// tsx's classic JSX transform for imported Next client components.
(globalThis as unknown as {React:typeof React}).React=React;

const checkNames: string[] = [];
const check = (name: string, run: () => void) => { run(); checkNames.push(name); };
const cap = (id: string, ids: string[], status = "accepted"): ProjectScope["capabilities"][number] => ({
  id, name: id, status, revision: 1, sortOrder: 0, description: null, updatedAt: "2026-10-08", workLinkCount: ids.length,
  provenance: null, events: [], knowledgeEstimates: [], acceptedEstimate: null, estimateReview: null,
  workLinks: ids.map(externalId => ({ id: `link:${id}:${externalId}`, provider: "linear", externalId, state: "active", externalUrl: null })),
});
const item: ScopeWorkItem = { id: "OPEN", label: "Remaining work", low: 1, likely: 2, high: 3, kind: "ticket", estimateSource: "issue_placeholder", state: "Todo", assignee: null, points: null, quote: null, rationale: null, parentIdentifier: null, parentTitle: null, projectName: "Fixture" };
const done = ["DONE-1", "DONE-2"].map(id => ({ id, label: id, parentIdentifier: null, parentTitle: null, completedAt: "2026-10-07" }));
const capabilities = [cap("Photo fixture", done.map(x => x.id)), cap("Remaining fixture", [item.id])];
const input = { executionState: "configured", issueIds: [item.id], completedIssueIds: done.map(x => x.id), capabilities, openShapeDecisionCount: 0 };
const coverage = () => evaluateForecastCoverage(input);
const scope = { scopeId: "fixture", name: "Fixture", items: [item], executionItems: [item], completedWork: done, capabilities, dependsOnScopeIds: [], executionState: "configured", openShapeQuestions: [], forecastCoverage: coverage() } as unknown as ProjectScope;
const project = (s = scope, scenario = structuredClone(EMPTY_SCENARIO)) => scenarioForecastCoverage([s], scenario, true).get(s.scopeId)!;

check("Completion uses source status/timestamp, never display name or cancellation", () => {
  for (const issue of [{stateType:"completed"},{completedAt:"2026-10-07"}]) assert(isCompletedIssue(issue));
  for (const issue of [{stateType:"started"},{stateType:"canceled",completedAt:"2026-10-07"},{stateType:"duplicate",completedAt:"2026-10-07"},{stateType:"completed",canceledAt:"2026-10-08"}]) assert(!isCompletedIssue(issue));
  assert(!isCompletedIssue({state:"Done"} as never));
});
check("Completed mappings count as mapped capabilities, never remaining work/effort", () => {
  assert.equal(coverage().canonicalForecast, true);
  assert.equal(coverage().census.mappedAcceptedCapabilityCount, 2);
  assert.equal(coverage().census.executionIssueCount, 1);
  assert.equal(coverage().census.modeledExecutionIssueCount, 1);
  assert.equal(coverage().census.unmappedExecutionIssueCount, 0);
  assert.equal(evaluateForecastCoverage({...input, completedIssueIds: []}).canonicalForecast, false);
});
check("Missing links, one done plus absent, canceled-only and detached links stay blocked", () => {
  for (const c of [cap("absent",["MISSING"]),cap("mixed",["DONE-1","MISSING"]),cap("canceled",["CANCELED"]),cap("empty",[])]) {
    assert.equal(evaluateForecastCoverage({...input,capabilities:[c,capabilities[1]]}).canonicalForecast,false);
  }
  const detached = cap("detached",["DONE-1"]); detached.workLinks[0].state="detached";
  assert.equal(evaluateForecastCoverage({...input,capabilities:[detached,capabilities[1]]}).canonicalForecast,false);
});
check("Unclassified leaves, source health, decisions and estimate review are not cleared", () => {
  assert.equal(evaluateForecastCoverage({...input,issueIds:[item.id,"NEW"]}).census.unmappedExecutionIssueCount,1);
  for(const executionState of ["stale","unavailable","not_configured"]) assert(!evaluateForecastCoverage({...input,executionState}).canonicalForecast);
  assert(!evaluateForecastCoverage({...input,openShapeDecisionCount:1}).canonicalForecast);
  assert(!evaluateForecastCoverage({...input,capabilities:[{...capabilities[0],estimateReviewRequired:true},capabilities[1]]}).canonicalForecast);
});
check("Completed source is distinct from empty, but cannot invent a completed release/date", () => {
  const complete=evaluateForecastCoverage({...input,issueIds:[],capabilities:[capabilities[0]]});
  assert.equal(complete.census.mappedAcceptedCapabilityCount,1); assert.equal(complete.canonicalForecast,false);
  assert.equal(complete.label,"NO REMAINING WORK TO FORECAST");
  assert.equal(complete.state,"unavailable");
  assert.deepEqual(complete.reasons.map(r=>r.code),["no_remaining_execution_work"]);
  const empty=evaluateForecastCoverage({...input,issueIds:[],completedIssueIds:[],capabilities:[]});
  assert.deepEqual(empty.reasons.map(r=>r.code),["execution_source_empty"]);
  assert.equal(deliveryNextAction({scopeId:"fixture",coverage:complete})?.label,"Review completed work in Scope");
  const claim=presentForecastDeliveryClaim({scopeName:"Fixture",coverage:complete,likelyDate:"Oct 8, 2026",targetDate:"Oct 31, 2026",confidenceAtTarget:100});
  assert(!JSON.stringify(claim).includes("Oct 8"));
  assert(!JSON.stringify(claim).includes("100"));
  const report=readFileSync("components/ReportsPageClient.tsx","utf8");
  assert.match(report,/live\.coverageState === "unavailable" \? `\$\{live\.coverageLabel\} · no delivery date claimed`/);
});
check("Parent/leaf and triage boundary remains unchanged; done cannot classify open children", () => {
  const issues=[{identifier:"PARENT",completedAt:null},{identifier:"CHILD",parentIdentifier:"PARENT",completedAt:null},{identifier:"TRIAGE",stateType:"triage",completedAt:null},{identifier:"DONE",stateType:"completed",completedAt:null}];
  assert.deepEqual(deliveryRelevantIssueIds(issues,false),["CHILD"]);
  const c=evaluateForecastCoverage({...input,issueIds:["CHILD"],completedIssueIds:["PARENT"],capabilities:[cap("parent",["PARENT"])]});
  assert.equal(c.census.unmappedExecutionIssueCount,1); assert(!c.canonicalForecast);
});
check("Scenario capacity-only, bypass, reopening and reset use the same completion boundary", () => {
  const before=structuredClone(scope),scenario=structuredClone(EMPTY_SCENARIO);
  scenario.capacityOverrideByScope.fixture=2;
  assert.deepEqual(project(scope,scenario),coverage());
  scenario.bypassedFeatureIds.add(`capability:${capabilities[0].id}`);
  assert.equal(project(scope,scenario).census.acceptedCapabilityCount,1);
  assert.equal(project(scope).census.mappedAcceptedCapabilityCount,2);
  const reopened={...scope,completedWork:done.slice(1),executionItems:[item,{...item,id:"DONE-1"}]};
  assert.equal(project(reopened).census.modeledExecutionIssueCount,2);
  assert.deepEqual(scope,before);
  assert.equal(scenarioForecastCoverage([scope],scenario,false).get(scope.scopeId),scope.forecastCoverage);
  const sibling={...scope,capabilities:[cap("mixed",["OPEN","DONE-1"])]};
  const exclusion=structuredClone(EMPTY_SCENARIO);exclusion.excludedItemIds.add("OPEN");
  assert(project(sibling,exclusion).canonicalForecast);
  assert(!project({...sibling,completedWork:[]},exclusion).canonicalForecast,"last open ticket excluded means absent completed sibling now matters");
});
check("Dependency closure inherits the repaired contract but keeps genuine blockers", () => {
  assert(inheritDependencyCoverage(coverage(),[{name:"upstream",coverage:coverage()}]).canonicalForecast);
  assert(!inheritDependencyCoverage(coverage(),[{name:"upstream",coverage:evaluateForecastCoverage({...input,openShapeDecisionCount:1})}]).canonicalForecast);
});
check("Scope composition and rendered card/detail say done without claiming shipped", () => {
  const composition=composeScopeFeatures([item],done,capabilities,1,new Set(),{},[]);
  assert.equal(composition.loadDays,2);
  const f=composition.features.find(x=>x.canonicalCapability?.id===capabilities[0].id)!;
  assert(linkedWorkDone(f)); assert.equal(f.loadDays,0); assert.equal(f.items.length,0); assert.equal(f.done.length,2);
  const card=renderToStaticMarkup(<CapabilityTile feature={f} share={0} material="seated" maxSpread={1}/>);
  assert(card.includes("Linked work done")&&!card.includes("Mapping needed"));
  assert(card.includes("0d remaining in those tickets"));
  const noop=()=>{};
  const detail=renderToStaticMarkup(<FeatureDetail feature={f} onClose={noop} scopeId="fixture" scopeName="Fixture" capacity={1} releaseLoadDays={2} realityRange={null} maxSpread={1} onToggle={noop} onAccept={noop} onSetEstimate={noop} onClearEstimate={noop} onStageKnowledgeEstimate={noop} onClearKnowledgeEstimate={noop} onAcceptKnowledgeEstimate={noop} onClearAcceptedKnowledgeEstimate={noop} staffingOptions={[]} onSetCapabilityStaffing={noop} onClearCapabilityStaffing={noop} onEditReality={noop} onUnlinkReality={noop} onCommitDraft={noop}/>);
  assert(detail.includes("Linked work done")&&!detail.includes("Mapping needed"));
  assert(detail.includes("not confirmation that the feature has shipped"));
  assert(!linkedWorkDone({...f,canonicalCapability:cap("missing",["DONE-1","ABSENT"])}));
  assert(!linkedWorkDone({...f,acceptedKnowledgeReview:{status:"review_required",estimate:null,publishable:false,reviewRequiredReason:"Boundary changed"}}));
  assert(!linkedWorkDone({...f,done:[]}));
});
check("Unavailable Control Room dates/floors/comparisons are absent; gates and targets remain", () => {
  const now=new Date("2026-10-08T00:00:00Z"),target=new Date("2026-10-31T00:00:00Z");
  const complete=evaluateForecastCoverage({...input,issueIds:[],capabilities:[capabilities[0]]});
  const gates=[{id:"GATE",label:"Unresolved fixture gate",low:5,likely:5,high:5}];
  const s={...scope,items:[],executionItems:[],forecastItems:[],capabilities:[capabilities[0]],forecastCoverage:complete,targetDate:target.toISOString(),gates,teamCapacity:1,capacitySource:"explicit",explicitTeamCapacity:1,reportHistory:[],lastReport:null};
  const data={startDate:now.toISOString(),scopes:[s],people:[],allocations:[],contextSwitchCostPct:0,findings:[],sources:[],reports:[],forecastSource:{asOf:now.toISOString(),provider:"Linear",availability:"available"}} as unknown as ProjectPayload;
  const sims=runPortfolioSimulation([{scopeId:s.scopeId,items:[],gates,teamCapacity:1,dependsOnScopeIds:[],startDate:now,targetDate:target}],10);
  assert(sims.get(s.scopeId)!.likelyDate>now,"raw simulation deliberately has a gate-only date to refuse");
  const params={now,data,scenario:structuredClone(EMPTY_SCENARIO),scenarioActive:true,preview:sims,baseline:sims,floorByScope:sims,decisions:[]};
  const field=readProjectField(params);
  const lane=field.lanes[0];
  for(const key of ["p10","p50","p90","realityP50","floorDays","headroomDays","gapDays","confidence"] as const) assert.equal(lane[key],null,key);
  assert.equal(lane.gates.length,1); assert.notEqual(lane.targetDays,null);
  const reading=readControlRoom({...params,dataReceivedAt:now,refreshReceipts:[],entries:[],lanes:[],timelineCandidates:[],timelineRangeEnd:null});
  for(const key of ["likely","p10","p90","realityLikely","gapDays","spreadDays","confidence"] as const) assert.equal(reading.outcome[key],null,key);
  assert.deepEqual(reading.outcome.target,target);
  const inspector=renderToStaticMarkup(<Inspector field={field} reading={reading} selection={{kind:"lane",id:s.scopeId}} onSelect={()=>{}} scenarioActive/>);
  assert(!inspector.includes("Oct 13"),"inspector cannot display gate-only outcome as delivery");
});
console.log(JSON.stringify({passed:true,groups:checkNames.length,checks:checkNames},null,2));
