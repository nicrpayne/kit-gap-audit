import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { getScopedIssues } from "../lib/linear";
import { isCompletedIssue } from "../lib/linearIssueState";
import { deliveryRelevantIssueIds } from "../lib/forecast/coverage";
import { buildPortfolioInputs, readForecastCoverage } from "../lib/forecast/compute";
import { scenarioForecastCoverage } from "../lib/scenario/forecastCoverage";
import { EMPTY_SCENARIO, type ProjectScope } from "../lib/instrument/useProject";

const url=new URL(process.env.DATABASE_URL??"file:///missing");
assert(process.env.SCOPE_SAVE_DB_PROOF==="1"&&url.hostname==="127.0.0.1"&&url.port==="55434"&&url.username==="signal_t0_local"&&url.pathname==="/signal_t0_test_1008","Dedicated disposable proof DB only");
process.env.KIT_DEV_FIXTURES="1"; delete process.env.LINEAR_API_KEY;
const ids:string[]=[];
async function main(){
  try {
    const scope=await prisma.scope.create({data:{name:`Completed mapping fixture ${randomUUID()}`,teamKey:"PLAT",projectNames:["KIT Platform"],teamCapacity:1,executionState:"configured"}}); ids.push(scope.id);
    const issues=await getScopedIssues(scope),completed=issues.filter(isCompletedIssue).map(i=>i.identifier),remaining=deliveryRelevantIssueIds(issues);
    assert(completed.length&&remaining.length);
    const create=(name:string,work:string[])=>prisma.capability.create({data:{scopeId:scope.id,name,status:"accepted",provenance:{source:"fixture"},workLinks:{create:work.map(externalId=>({provider:"linear",externalId,state:"active",provenance:{source:"fixture"}}))}}});
    const done=await create("Completed photos fixture",completed); await create("Remaining fixture",remaining);
    const before=await prisma.capability.findMany({where:{scopeId:scope.id},include:{workLinks:true}});
    const reality=await readForecastCoverage(scope); assert(reality.canonicalForecast); assert.equal(reality.census.mappedAcceptedCapabilityCount,2);
    const payload=(await buildPortfolioInputs()).scopes.find(s=>s.scopeId===scope.id)!;
    assert.deepEqual(payload.completedWork.map(i=>i.id).sort(),completed.sort());
    assert(payload.items.every(i=>!completed.includes(i.id))); assert(payload.forecastItems.every(i=>!completed.includes(i.id)));
    assert.equal(payload.executionItems.length,remaining.length);
    assert.deepEqual(scenarioForecastCoverage([payload as unknown as ProjectScope],structuredClone(EMPTY_SCENARIO),true).get(scope.id),reality);
    assert.deepEqual(await prisma.capability.findMany({where:{scopeId:scope.id},include:{workLinks:true}}),before,"read repairs do not rewrite business data");
    await prisma.capabilityWorkLink.create({data:{capabilityId:done.id,provider:"linear",externalId:"ABSENT",state:"active",provenance:{source:"fixture"}}});
    const missing=await readForecastCoverage(scope); assert(!missing.canonicalForecast); assert(missing.reasons.some(r=>r.code==="accepted_scope_mapping_missing_from_source"));
    const completedScope=await prisma.scope.create({data:{name:`All-done fixture ${randomUUID()}`,teamKey:"PH2",teamCapacity:1,executionState:"configured"}});ids.push(completedScope.id);
    await prisma.capability.create({data:{scopeId:completedScope.id,name:"Done fixture",status:"accepted",provenance:{source:"fixture"},workLinks:{create:[{provider:"linear",externalId:"PH2-100",state:"active",provenance:{source:"fixture"}}]}}});
    const allDone=await readForecastCoverage(completedScope);assert.equal(allDone.label,"NO REMAINING WORK TO FORECAST");assert(!allDone.canonicalForecast);assert.equal(allDone.census.mappedAcceptedCapabilityCount,1);
    console.log("PASS actual DB→source→forecast→portfolio→Scenario: completed mappings retained, zero added effort, exact read preservation, absent link refusal, all-done no invented release date");
  } finally {await prisma.scope.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
