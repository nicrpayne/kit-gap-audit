import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { isCompletedIssue } from "../lib/linearIssueState";
import { deliveryRelevantIssueIds, evaluateForecastCoverage, inheritDependencyCoverage } from "../lib/forecast/coverage";
import { composeScopeFeatures, linkedWorkDone } from "../lib/scope/features";
import { scenarioForecastCoverage } from "../lib/scenario/forecastCoverage";
import { scenarioWorkItems } from "../lib/scenario/workItems";
import { makeSignalEstimate } from "../lib/scope/signalEstimates";
import { remainingEstimateConflict } from "../lib/scenario/remainingEstimates";
import { EMPTY_SCENARIO, type ProjectScope, type ScopeWorkItem } from "../lib/instrument/useProject";
import CapabilityTile from "../components/instrument/CapabilityTile";
import FeatureDetail from "../components/instrument/FeatureDetail";
import { presentForecastDeliveryClaim } from "../lib/forecast/claims";
import { deliveryNextAction } from "../lib/instrument/nextAction";
import { readProjectField } from "../lib/control-room/field";
import { readControlRoom } from "../lib/control-room/read";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import Inspector from "../components/control-room/Inspector";
import { forecastReadingForTime, historicalForecastReading, liveForecastReading } from "../lib/timeline/forecastTruth";
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
  assert(!project(sibling,exclusion).canonicalForecast);
  assert.equal(project(sibling,exclusion).census.mappedAcceptedCapabilityCount,1,"completed sibling still establishes the mapping");
  assert.equal(project(sibling,exclusion).state,"unavailable");
  assert(project(sibling,exclusion).reasons.some(r=>r.code==="no_remaining_release_work"));
  assert(!project({...sibling,completedWork:[]},exclusion).canonicalForecast,"last open ticket excluded means absent completed sibling now matters");
  assert(project({...sibling,completedWork:[]},exclusion).reasons.some(r=>r.code==="accepted_scope_mapping_missing_from_source"));
});
check("All-outside work and last-capability bypass cannot invent delivery or report eligibility", () => {
  const outside=evaluateForecastCoverage({...input,capabilities:[cap("later",["OPEN"],"outside")]});
  assert.equal(outside.label,"NO REMAINING WORK SELECTED");assert.equal(outside.state,"unavailable");
  assert.equal(outside.census.executionIssueCount,1);assert.equal(outside.census.outsideExecutionIssueCount,1);
  assert.equal(outside.census.modeledExecutionIssueCount,0);assert.equal(outside.census.unmappedExecutionIssueCount,0);
  assert(!outside.reasons.some(r=>r.code==="no_remaining_execution_work"),"source still has open work");
  const state=structuredClone(EMPTY_SCENARIO);state.bypassedFeatureIds.add(`capability:${capabilities[1].id}`);
  const result=project(scope,state);assert.equal(result.state,"unavailable");assert.equal(result.census.mappedAcceptedCapabilityCount,1);
  assert.equal(deliveryNextAction({scopeId:"fixture",coverage:result})?.label,"Review selected work in Scope");
  const claim=presentForecastDeliveryClaim({scopeName:"Fixture",coverage:result,likelyDate:"Oct 8, 2026",confidenceAtTarget:100});
  assert(!claim.exposesOutcome&&!claim.exposesProjectConfidence);
  assert(project(scope).canonicalForecast,"discard/restore returns the original remaining-work forecast");
  const report=readFileSync("components/ReportsPageClient.tsx","utf8");
  assert.match(report,/project\.coverageByScope\.get\(scopeId\)\?\.state === "unavailable"/);
});
check("Dependency closure inherits the repaired contract but keeps genuine blockers", () => {
  assert(inheritDependencyCoverage(coverage(),[{name:"upstream",coverage:coverage()}]).canonicalForecast);
  assert(!inheritDependencyCoverage(coverage(),[{name:"upstream",coverage:evaluateForecastCoverage({...input,openShapeDecisionCount:1})}]).canonicalForecast);
});
check("All-zero ranges use the same actual work as preview and cannot claim a date", () => {
  const state=structuredClone(EMPTY_SCENARIO);state.estimateOverrideByItemId.OPEN={low:0,likely:0,high:0};
  const before=structuredClone(scope);
  assert.equal(scenarioWorkItems(scope,state)[0].high,0);
  const zero=project(scope,state);
  assert.equal(zero.state,"unavailable");assert.equal(zero.label,"NO REMAINING EFFORT TO FORECAST");
  assert.equal(zero.census.modeledExecutionIssueCount,1,"open ticket is not secretly completed or excluded");
  assert.equal(deliveryNextAction({scopeId:scope.scopeId,coverage:zero})?.label,"Review estimates in Scope");
  assert(!presentForecastDeliveryClaim({scopeName:"Fixture",coverage:zero,likelyDate:"Oct 8, 2026",confidenceAtTarget:100}).exposesOutcome);
  const baseline=evaluateForecastCoverage({...input,hasModeledRemainingEffort:false});
  assert.equal(baseline.state,"unavailable","accepted all-zero inputs are also guarded");
  state.estimateOverrideByItemId.OPEN={low:0,likely:0,high:1};
  assert(project(scope,state).canonicalForecast,"a real positive uncertainty tail remains modeled");
  assert(project(scope).canonicalForecast,"discard restores the positive baseline");assert.deepEqual(scope,before);
  // A reviewed replacement must not disappear just because its covered
  // original ticket was set to zero in a legacy/recovery payload.
  const substituted={...scope,forecastItems:[{...item,id:"replacement",high:4}]};
  state.estimateOverrideByItemId.OPEN={low:0,likely:0,high:0};
  assert.equal(scenarioWorkItems(substituted,state)[0].high,4);
  assert(project(substituted,state).canonicalForecast);
});
check("Shared work projection preserves proposal inclusion, deselection and outside boundaries", () => {
  const second={...item,id:"SECOND"},extra={...item,id:"EXTRA"};
  const s={...scope,items:[item,second],forecastItems:[item,second],executionItems:[item,second,extra],capabilities:[cap("a",["OPEN","SECOND"]),cap("later",["EXTRA"],"outside")]};
  const before=structuredClone(s),state=structuredClone(EMPTY_SCENARIO);
  const selection={scopeId:s.scopeId,proposalId:"proof",itemId:"proposal",title:"Fixture",description:null,sourceCapabilityId:null,sourceAlreadyLinkedItemIds:[],targetCapabilityId:null,expectedRevision:null,itemIds:["EXTRA"],releaseStatus:"accepted"} as typeof state.scopeProposalSelections[number];
  state.scopeProposalSelections=[selection];
  assert.deepEqual(scenarioWorkItems(s,state).map(row=>row.id),["OPEN","SECOND","EXTRA"]);
  state.scopeProposalSelections=[{...selection,sourceCapabilityId:"a",sourceAlreadyLinkedItemIds:["OPEN","SECOND"],targetCapabilityId:"a",itemIds:["OPEN"]}];
  assert.deepEqual(scenarioWorkItems(s,state).map(row=>row.id),["OPEN"]);
  state.scopeProposalSelections=[{...selection,targetCapabilityId:"a",itemIds:["EXTRA"],releaseStatus:"outside"}];
  assert.deepEqual(scenarioWorkItems(s,state),[]);
  state.scopeProposalSelections=[];state.includedItemIds.add("OPEN");
  assert.deepEqual(scenarioWorkItems(s,state).map(row=>row.id),["OPEN","SECOND"],"already modeled work is not duplicated");
  state.bypassedFeatureIds.add("capability:a");
  assert.deepEqual(scenarioWorkItems(s,state),[]);
  assert.deepEqual(s,before);
});
check("Shared work projection rebuilds real reviewed estimates and safely refuses stale drafts", () => {
  const second={...item,id:"SECOND"};
  const card=cap("native",["OPEN","SECOND"]);
  const s={...scope,items:[item,second],forecastItems:[item,second],executionItems:[item,second],capabilities:[card]};
  const state=structuredClone(EMPTY_SCENARIO);
  state.remainingEstimateByCapabilityId={native:makeSignalEstimate("native",1,{alreadyDone:"Reusable upload exists",reuseFrom:"Fixture component",remainingWork:"Integrate and test",rationale:"Controlled estimate",evidenceReference:"Fixture only",asOfDate:"2026-10-08",reviewerDisplayName:"QA",range:{low:2,likely:4,high:6},coveredOpenItemIds:["OPEN"],additionalOpenItemIds:["SECOND"]},["OPEN","SECOND"],"completed-proof")};
  assert.equal(remainingEstimateConflict([s],state.remainingEstimateByCapabilityId),null);
  const rebuilt=scenarioWorkItems(s,state);
  assert.equal(rebuilt.length,2);assert.equal(rebuilt.reduce((sum,row)=>sum+row.likely,0),6);
  assert(!rebuilt.some(row=>row.id==="OPEN"));assert(project(s,state).canonicalForecast);
  const stale={...s,capabilities:[{...card,revision:2}]};
  assert(remainingEstimateConflict([stale],state.remainingEstimateByCapabilityId));
  assert.throws(()=>scenarioWorkItems(stale,state),/needs review/);
  assert.doesNotThrow(()=>project(stale,state),"coverage renders while shared preview shows its refusal");
  assert.equal(card.acceptedEstimate,null);
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
  const sim=sims.get(s.scopeId)!;
  const asOf=now.toISOString();
  assert.equal(liveForecastReading(s.scopeId,asOf,sim,target.toISOString(),asOf,"unavailable"),null,"embedded and full Timeline cannot render gate-only live forecast");
  const qualified=liveForecastReading(s.scopeId,asOf,sim,null,asOf,"modeled_subset");
  assert(qualified);assert.equal(qualified.confidenceAtTarget,null);
  const historical=historicalForecastReading({reportId:"old",scopeId:s.scopeId,generatedAt:asOf,earliestDate:"2026-10-10",likelyDate:"2026-10-13",latestDate:"2026-10-16",targetDate:"2026-10-31",confidenceAtTarget:70} as never);
  assert.equal(historical.likelyDate,"2026-10-13");assert.equal(historical.temporalRole,"historical");
  assert.equal(forecastReadingForTime(true,{...qualified,coverageState:"unavailable"},null),null);
  assert.match(readFileSync("components/TimelinePageClient.tsx","utf8"),/project\.coverageByScope\.get\(lane.scopeId\)\?\.state/);
});
console.log(JSON.stringify({passed:true,groups:checkNames.length,checks:checkNames},null,2));
