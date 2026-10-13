import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { prisma } from "../lib/prisma";
import { getScopedIssues } from "../lib/linear";
import { isCompletedIssue } from "../lib/linearIssueState";
import { deliveryRelevantIssueIds } from "../lib/forecast/coverage";
import { buildPortfolioInputs, readForecastCoverage, computeForecast } from "../lib/forecast/compute";
import { scenarioForecastCoverage } from "../lib/scenario/forecastCoverage";
import { EMPTY_SCENARIO, type ProjectScope } from "../lib/instrument/useProject";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { makeSignalEstimate } from "../lib/scope/signalEstimates";

const url=new URL(process.env.DATABASE_URL??"file:///missing");
assert(process.env.SCOPE_SAVE_DB_PROOF==="1"&&url.hostname==="127.0.0.1"&&url.port==="55434"&&url.username==="signal_t0_local"&&["/signal_t0_test_1008","/signal_t0_test_1012"].includes(url.pathname),"Dedicated disposable proof DB only");
process.env.KIT_DEV_FIXTURES="1"; delete process.env.LINEAR_API_KEY;
const ids:string[]=[];
const personIds:string[]=[];
async function main(){
  try {
    const scope=await prisma.scope.create({data:{name:`Completed mapping fixture ${randomUUID()}`,teamKey:"PLAT",projectNames:["KIT Platform"],teamCapacity:1,executionState:"configured"}}); ids.push(scope.id);
    const issues=await getScopedIssues(scope),completed=issues.filter(isCompletedIssue).map(i=>i.identifier),remaining=deliveryRelevantIssueIds(issues);
    assert(completed.length&&remaining.length);
    const create=(name:string,work:string[])=>prisma.capability.create({data:{scopeId:scope.id,name,status:"accepted",provenance:{source:"fixture"},workLinks:{create:work.map(externalId=>({provider:"linear",externalId,state:"active",provenance:{source:"fixture"}}))}}});
    const done=await create("Completed photos fixture",completed); const open=await create("Remaining fixture",remaining);
    const before=await prisma.capability.findMany({where:{scopeId:scope.id},include:{workLinks:true}});
    const reality=await readForecastCoverage(scope); assert(reality.canonicalForecast); assert.equal(reality.census.mappedAcceptedCapabilityCount,2);
    const payload=(await buildPortfolioInputs()).scopes.find(s=>s.scopeId===scope.id)!;
    assert.deepEqual(payload.completedWork.map(i=>i.id).sort(),completed.sort());
    assert(payload.items.every(i=>!completed.includes(i.id))); assert(payload.forecastItems.every(i=>!completed.includes(i.id)));
    assert.equal(payload.executionItems.length,remaining.length);
    assert.deepEqual(scenarioForecastCoverage([payload as unknown as ProjectScope],structuredClone(EMPTY_SCENARIO),true).get(scope.id),reality);
    assert.deepEqual(await prisma.capability.findMany({where:{scopeId:scope.id},include:{workLinks:true}}),before,"read repairs do not rewrite business data");
    // Load the actual server report builder, stubbing only Next's build-time
    // marker. Source, database, Scenario transformation and refusal stay real.
    const runtime=Module as unknown as {_load(request:string,parent:unknown,isMain:boolean):unknown};
    const original=runtime._load;
    runtime._load=function(request,parent,isMain){return request==="server-only"?{}:original.call(this,request,parent,isMain);};
    const {buildScenarioDecisionBriefReadModel}=await import("../lib/reports/scenario").finally(()=>{runtime._load=original;});
    const reportCount=await prisma.report.count();
    const scenario={version:"scenario-report.v2",scenarioId:"completed-proof",baseRealityRevision:payload.realityState.realityRevision};
    for(const levers of [
      {excludedCapabilityIds:[open.id]},
      {excludedItemIds:remaining},
      {estimateOverrideByItemId:Object.fromEntries(remaining.map(id=>[id,{low:0,likely:0,high:0}]))},
    ]) await assert.rejects(buildScenarioDecisionBriefReadModel(scope,{...scenario,...levers}),/No remaining work is selected for this Scenario/);
    assert.equal(await prisma.report.count(),reportCount,"no fabricated empty-work report or partial pair saved");
    // Real report read models, not just a mocked renderer: a valid one-ticket
    // Reality and its harmless completed-card cut must not recommend removing
    // their final work as a dated acceleration. Both use the shared generator.
    const single=await prisma.scope.create({data:{name:`One-ticket report fixture ${randomUUID()}`,teamKey:"PLAT",projectNames:["KIT Platform"],teamCapacity:1,executionState:"configured"}});ids.push(single.id);
    const makeSingle=(name:string,status:string,work:string[])=>prisma.capability.create({data:{scopeId:single.id,name,status,provenance:{source:"fixture"},workLinks:{create:work.map(externalId=>({provider:"linear",externalId,state:"active",provenance:{source:"fixture"}}))}}});
    const singleOpen=await makeSingle("Only remaining feature","accepted",[remaining[0]]);
    const singleLater=await makeSingle("Later work","outside",remaining.slice(1));
    const singleDone=await makeSingle("Completed feature","accepted",completed);
    const person=await prisma.person.create({data:{name:`Report fixture person ${randomUUID()}`,fte:1}});personIds.push(person.id);
    await prisma.allocation.create({data:{personId:person.id,scopeId:single.id,fraction:1}});
    await prisma.capacityReconciliation.create({data:{scopeId:single.id,status:"named_exact",completenessConfirmed:true,legacySource:"fixture",namedRawFte:1,namedEffectiveFte:1,provenance:{source:"fixture"},history:[]}});
    const singleForecast=await computeForecast(single);
    assert(singleForecast.forecastCoverage.canonicalForecast);assert.equal(singleForecast.basis.scopes.find(s=>s.scopeId===single.id)?.items.length,1);
    assert.deepEqual(singleForecast.scenarios.map(option=>option.id),["capacity-plus-1","capacity-plus-2"]);
    const pairModel=await buildScenarioDecisionBriefReadModel(single,{version:"scenario-report.v2",scenarioId:"single-work-report-proof",baseRealityRevision:0,excludedCapabilityIds:[singleDone.id]});
    for(const brief of [pairModel.realityBrief,pairModel.brief]) {
      assert.deepEqual(brief.movable.scenarioOptions.value.map(option=>option.id),["capacity-plus-1","capacity-plus-2"]);
      assert.equal(brief.movable.scope.value.executableItemCount,1);
    }
    // Isolate the fixture's shared PLAT identifiers before ticket-level levers;
    // do not bypass the production duplicate-owner ambiguity guard.
    await prisma.scope.update({where:{id:scope.id},data:{executionState:"not_configured"}});
    const added=await buildScenarioDecisionBriefReadModel(single,{version:"scenario-report.v2",scenarioId:"zero-source-count-proof",baseRealityRevision:0,
      includedItemIds:remaining.slice(1),estimateOverrideByItemId:Object.fromEntries(remaining.slice(1).map(id=>[id,{low:0,likely:0,high:0}]))});
    assert.equal(added.realityBrief.movable.scope.value.executableItemCount,1);
    assert.equal(added.brief.movable.scope.value.executableItemCount,remaining.length,"zero-day added tickets still count as source work");
    assert.equal(added.brief.movable.scope.value.simulationItemCount,remaining.length);
    await prisma.capability.update({where:{id:singleLater.id},data:{status:"accepted"}});
    const combined=makeSignalEstimate(singleLater.id,1,{alreadyDone:"Fixture reuse exists",reuseFrom:"Fictional shared uploader",remainingWork:"Adapt and test the covered tickets",rationale:"Fixture operator estimate",evidenceReference:"Fixture only",asOfDate:"2026-10-08",reviewerDisplayName:"Fixture operator",range:{low:1,likely:2,high:3},coveredOpenItemIds:remaining.slice(1),additionalOpenItemIds:[]},remaining.slice(1),"count-aggregate-proof");
    const aggregate=await buildScenarioDecisionBriefReadModel(single,{version:"scenario-report.v2",scenarioId:"aggregate-source-count-proof",baseRealityRevision:0,
      excludedCapabilityIds:[singleOpen.id],remainingEstimateByCapabilityId:{[singleLater.id]:combined}});
    assert.equal(aggregate.realityBrief.movable.scope.value.executableItemCount,remaining.length);
    assert.equal(aggregate.brief.movable.scope.value.executableItemCount,remaining.length-1,"aggregate retains all distinct covered source tickets after a capability cut");
    assert.equal(aggregate.brief.movable.scope.value.simulationItemCount,1,"one aggregate is not an additional tracked ticket");
    assert.equal((await prisma.capability.findUniqueOrThrow({where:{id:singleLater.id}})).acceptedEstimate,null,"Scenario estimate never overwrites Reality");
    await prisma.scope.update({where:{id:scope.id},data:{executionState:"configured"}});
    assert.equal(await prisma.report.count(),reportCount,"read models do not rewrite historical reports");
    await prisma.capability.update({where:{id:open.id},data:{status:"outside"}});
    const allOutside=await readForecastCoverage(scope);assert.equal(allOutside.label,"NO REMAINING WORK SELECTED");
    assert.equal(allOutside.census.mappedAcceptedCapabilityCount,1);assert.equal(allOutside.census.outsideExecutionIssueCount,remaining.length);
    assert.equal(allOutside.census.executionIssueCount,remaining.length);assert.equal(allOutside.state,"unavailable");
    await prisma.capability.update({where:{id:open.id},data:{status:"accepted"}});
    await prisma.capabilityWorkLink.create({data:{capabilityId:done.id,provider:"linear",externalId:"ABSENT",state:"active",provenance:{source:"fixture"}}});
    const missing=await readForecastCoverage(scope); assert(!missing.canonicalForecast); assert(missing.reasons.some(r=>r.code==="accepted_scope_mapping_missing_from_source"));
    const completedScope=await prisma.scope.create({data:{name:`All-done fixture ${randomUUID()}`,teamKey:"PH2",teamCapacity:1,executionState:"configured"}});ids.push(completedScope.id);
    await prisma.capability.create({data:{scopeId:completedScope.id,name:"Done fixture",status:"accepted",provenance:{source:"fixture"},workLinks:{create:[{provider:"linear",externalId:"PH2-100",state:"active",provenance:{source:"fixture"}}]}}});
    const allDone=await readForecastCoverage(completedScope);assert.equal(allDone.label,"NO REMAINING WORK TO FORECAST");assert(!allDone.canonicalForecast);assert.equal(allDone.census.mappedAcceptedCapabilityCount,1);
    for(const scopeId of [scope.id,completedScope.id]) await prisma.capacityReconciliation.create({data:{scopeId,status:"named_exact",completenessConfirmed:true,legacySource:"fixture",namedRawFte:0,namedEffectiveFte:0,provenance:{source:"fixture"},history:[]}});
    const zeroInputs=await buildPortfolioInputs();
    for(const scopeId of [scope.id,completedScope.id]) {
      const row=zeroInputs.scopes.find(s=>s.scopeId===scopeId)!;
      assert.equal(row.teamCapacity,0);assert.equal(row.capacitySource,"allocations");assert(row.capacityContract.reconciles);
      const spec={scopeId,items:row.forecastItems,gates:row.gates,teamCapacity:row.teamCapacity,dependsOnScopeIds:[],startDate:new Date("2026-10-08"),targetDate:null};
      if(scopeId===scope.id) assert.throws(()=>runPortfolioSimulation([spec],10),/has work but no capacity/);
      else {runPortfolioSimulation([spec],10);assert.equal(row.forecastCoverage.state,"unavailable");}
    }
    console.log("PASS actual DB→source→forecast→portfolio→Scenario→report: completed mappings retained, zero added effort, exact read preservation, absent link refusal, all-done/all-outside no invented release date, actual report builder rejects empty capability/item/zero-estimate Scenarios; confirmed zero named capacity stays zero with empty/nonempty work");
  } finally {await prisma.scope.deleteMany({where:{id:{in:ids}}});await prisma.person.deleteMany({where:{id:{in:personIds}}});await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
