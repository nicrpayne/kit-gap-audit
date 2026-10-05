import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import type { ProjectPayload } from '../lib/instrument/useProject';
import type { CompiledScopeProposalItem } from '../lib/scope/proposal';
import { evaluateForecastCoverage } from '../lib/forecast/coverage';

// Usage: tsx scripts/forecast-scenario-browser-proof.ts <captured-input-dir> <output-dir>
// The captured input directory contains production-chromium/{instrument,proposal}.json.
// All API calls are intercepted. This proof must never point at a live environment.
const source=resolve(process.argv[2]);
const out=resolve(process.argv[3]);
const base=process.env.SIGNAL_PROOF_URL??'http://127.0.0.1:3313';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
mkdirSync(out,{recursive:true,mode:0o700});
const read=(file:string)=>JSON.parse(readFileSync(resolve(source,file),'utf8'));
const original=read('production-chromium/instrument.json') as ProjectPayload;
const proposalBody=read('production-chromium/proposal.json') as {proposal:{scopeId:string;items:(CompiledScopeProposalItem & {id:string})[]}};
const sid=proposalBody.proposal.scopeId;
const selected=proposalBody.proposal.items.find(i=>i.title==='iTrack notification engine')!;
assert.equal(selected.workItemIds.length,7);
const results: {label:string;passed:boolean;checks:string[];baselineDate:string;scenarioDate:string}[]=[];

async function main(){
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]] as const){
 for(const variant of ['free','held','fully-classified'] as const){
  const held=variant==='held',full=variant==='fully-classified';
  const payload=structuredClone(original);
  payload.startDate='2026-10-05T00:00:00.000Z';
  const scope=payload.scopes.find(s=>s.scopeId===sid)!;
  scope.gates=[];scope.dependsOnScopeIds=held?['proof-platform']:[];
  scope.teamCapacity=1;scope.explicitTeamCapacity=1;scope.capacitySource='explicit';
  // Keep the actual incomplete coverage and missing named-capacity boundary.
  // Fixed ranges isolate input/display coherence, not business estimates.
  scope.executionItems=scope.executionItems.map(i=>({...i,low:2,likely:2,high:2}));
  if(full){
    scope.executionItems=scope.executionItems.filter(i=>selected.workItemIds.includes(i.id));
    scope.openShapeQuestions=[];scope.capacityContract={...scope.capacityContract,reconciles:true};
    scope.forecastCoverage=evaluateForecastCoverage({executionState:scope.executionState,issueIds:scope.executionItems.map(i=>i.id),capabilities:scope.capabilities,openShapeDecisionCount:0});
  }
  const initialCount=full?7:45,scenarioCount=full?0:39;
  if(held){
    const platform=structuredClone(scope);platform.scopeId='proof-platform';platform.name='Proof platform';platform.dependsOnScopeIds=[];platform.capabilities=[];platform.openShapeQuestions=[];
    platform.items=[{...scope.executionItems[0],id:'PROOF-P1',label:'Controlled dependency',low:50,likely:50,high:50}];platform.executionItems=platform.items;platform.forecastItems=platform.items;platform.capacityContract={...scope.capacityContract,reconciles:true};
    platform.forecastCoverage={...scope.forecastCoverage,state:'forecastable',canonicalForecast:true,label:'CANONICAL DELIVERY FORECAST',reason:null,caveat:null,reasons:[]};
    payload.scopes.push(platform);
  }
  // Other projects remain available for project-isolation checks, but remove
  // their upstream graph so no unrelated fixture delay affects this case.
  for(const s of payload.scopes)if(s.scopeId!==sid)s.dependsOnScopeIds=[];
  const browser=await engine.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}});
  const errors:string[]=[],unexpected:string[]=[];const checks:string[]=[];
  await context.route('**/*',route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    if(url.pathname==='/api/instrument/project'&&r.method()==='GET')return route.fulfill({json:payload});
    if(url.pathname==='/api/version'&&r.method()==='GET')return route.fulfill({json:{shortCommit:'local-proof'}});
    if(url.pathname===`/api/scopes/${sid}/proposal`&&['GET','POST'].includes(r.method()))return route.fulfill({json:proposalBody});
    unexpected.push(`${r.method()} ${url.pathname}`);return route.fulfill({status:405,json:{error:'Read-only controlled browser proof'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const sh=(id:string)=>page.locator(`[data-shoot="${id}"]`);
  const label=`${name}-${variant}`;
  try{
    await page.goto(`${base}/forecast?project=${sid}`);await sh('forecast-modeled-subset').waitFor();
    const baselineDate=await sh('modeled-subset-outcome').locator('.i-readout').innerText();
    assert((await sh('forecast-coverage-reasons').innerText()).includes(`${initialCount} current execution`));
    await page.locator('a[href^="/scope"]').first().click();await page.waitForURL('**/scope*');
    await page.locator(`[data-proposal-item="${selected.id}"]`).click();const focus=sh('reconciliation-focus');await focus.waitFor();
    if(!full)await focus.getByRole('checkbox').first().uncheck();await sh('stage-focused-proposal').click();await focus.getByRole('button',{name:'Close',exact:true}).click();
    await sh('reconciliation-scenario-feedback').waitFor();
    assert((await page.locator('body').innerText()).includes(`${scenarioCount} unresolved`));checks.push(`Scope shows ${scenarioCount} unresolved after staging ${full?7:6} tickets`);
    await page.locator('a[href^="/forecast"]').first().click();await page.waitForURL('**/forecast*');await sh('forecast-modeled-subset').waitFor();
    const scenarioReason=full?'All current work is classified in this Scenario.':`${scenarioCount} current execution`;
    await sh('forecast-coverage-reasons').filter({hasText:scenarioReason}).waitFor();
    checks.push('Forecast matches Scenario coverage, not the accepted Reality baseline');
    await page.waitForFunction(()=>document.querySelector('[data-shoot="modeled-subset-outcome"] .i-readout')?.textContent?.startsWith('~'));
    const scenarioDate=await sh('modeled-subset-outcome').locator('.i-readout').innerText();
    assert.match(await sh('modeled-subset-outcome').innerText(),/SCENARIO/i);
    if(held){assert.equal(scenarioDate,baselineDate);assert.match(await sh('forecast-scenario-impact').innerText(),/Proof platform/);}
    else assert.notEqual(scenarioDate,baselineDate,'Free-running Scenario must change the actual modeled date');
    checks.push(held?'Declared dependency holds the date and is named':'Scenario date changes without a dependency floor');
    if(!full)assert.match(await page.locator('body').innerText(),/Named capacity has not been reconciled/);
    else assert.match(await page.locator('body').innerText(),/SCENARIO PREVIEW — ACCEPTED REALITY STILL INCOMPLETE/);
    assert.match(await page.locator('body').innerText(),/not.*delivery (forecast|claim)|not a project delivery forecast/i);
    assert.match(await sh('forecast-coverage-reasons').innerText(),/Accepted Reality remains incomplete; report publication still requires/);
    assert.match(await sh('forecast-coverage-reasons').innerText(),/Unestimated tickets retain provisional ranges/);
    checks.push('Scenario does not approve Reality, reports, or provisional estimates');
    await page.screenshot({path:resolve(out,label+'-scenario.png')});
    const other=payload.scopes.find(s=>s.scopeId!==sid)!;await sh(`scope-${other.scopeId}`).click();await page.waitForURL(new RegExp(`project=${other.scopeId}`));
    assert(!((await page.locator('body').innerText()).includes(scenarioReason)));await sh(`scope-${sid}`).click();await sh('forecast-coverage-reasons').filter({hasText:scenarioReason}).waitFor();checks.push('Project switching does not leak iTrack Scenario coverage');
    await sh('scenario-strip').locator('a[href^="/scope"]').click();await sh('reconciliation-scenario-feedback').waitFor();await page.locator(`[data-proposal-item="${selected.id}"]`).click();await focus.waitFor();assert.equal(await focus.getByRole('checkbox').first().isChecked(),full);await focus.getByRole('button',{name:'Close',exact:true}).click();
    await page.locator('a[href^="/forecast"]').first().click();await sh('forecast-coverage-reasons').filter({hasText:scenarioReason}).waitFor();await sh('discard').click();await sh('forecast-coverage-reasons').filter({hasText:`${initialCount} current execution`}).waitFor();assert.equal(await sh('modeled-subset-outcome').locator('.i-readout').innerText(),baselineDate);checks.push('Navigation retains the selection; discard restores Reality count and date');
    await page.locator('a[href^="/scope"]').first().click();await page.locator(`[data-proposal-item="${selected.id}"]`).click();await focus.waitFor();await sh('stage-focused-proposal').click();await focus.getByRole('button',{name:'Close',exact:true}).click();await sh('reconciliation-scenario-feedback').waitFor();await page.locator('a[href^="/forecast"]').first().click();await page.waitForURL('**/forecast*');await sh('forecast-modeled-subset').waitFor();await sh('scenario-strip').filter({hasText:'Scenario'}).waitFor();await page.reload();await sh('forecast-coverage-reasons').filter({hasText:`${initialCount} current execution`}).waitFor();assert.equal(await sh('modeled-subset-outcome').locator('.i-readout').innerText(),baselineDate);checks.push('Document reload returns to Reality per the existing session policy');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);checks.push('No write escaped the fixture and no browser errors');
    results.push({label,passed:true,checks,baselineDate,scenarioDate});
  }catch(error){await page.screenshot({path:resolve(out,label+'-failure.png')});writeFileSync(resolve(out,'failure.json'),JSON.stringify({label,checks,error:String(error),errors,unexpected,text:await page.locator('body').innerText()},null,2));throw error;}
  finally{await browser.close();}
 }
}
writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,boundary:'Local built UI, captured private read inputs with controlled ranges/dependency. API intercepted; no live writes or business forecast signoff.',results},null,2));console.log(JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
