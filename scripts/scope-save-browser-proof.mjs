import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {chromium, webkit} from 'playwright';

const base=process.env.SCOPE_SAVE_TEST_BASE ?? 'http://127.0.0.1:3207';
const local=['localhost','127.0.0.1'].includes(new URL(base).hostname);
assert(local || (process.env.SCOPE_SAVE_STAGING_PROOF==='1' && base==='https://kit-gap-audit-staging-cedd.up.railway.app'), 'Only loopback or explicit isolated staging fixtures; never production writes');
const password=process.env.SCOPE_SAVE_TEST_PASSWORD ?? (local?'signal-local-acceptance':null);assert(password);
const output=process.env.SCOPE_SAVE_TEST_OUTPUT;assert(output);
const engines=process.env.SCOPE_SAVE_TEST_ENGINE?[process.env.SCOPE_SAVE_TEST_ENGINE]:['chromium','webkit'];
for(const engine of engines){
  assert(['chromium','webkit'].includes(engine));
  const out=`${output}/${engine}`;mkdirSync(out,{recursive:true});
  const browser=await ({chromium,webkit}[engine]).launch(),context=await browser.newContext({viewport:{width:1440,height:900}});
  const auth=await context.request.post(base+'/api/login',{data:{password}});assert.equal(auth.status(),200);
  // Production-mode cookies are Secure; local HTTP needs the same auth cookie without Secure.
  if(local){const cookie=auth.headers()['set-cookie'].split(';')[0],i=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,i),value:cookie.slice(i+1),url:base,httpOnly:true,secure:false,sameSite:'Lax'}]);}
  const request=async(method,path,data)=>{const r=await context.request.fetch(base+path,{method,data,timeout:120000});const body=await r.json();assert(r.ok(),`${method} ${path}: ${r.status()} ${JSON.stringify(body)}`);return body;};
  const roots=await request('GET','/api/scopes');
  const boundary=local?{teamKey:'JSA',projectNames:['KIT JSA']}:roots.scopes.find(s=>s.id==='jsa-seed');assert(boundary);
  const {scope}=await request('POST','/api/scopes',{name:`QA scope-save ${engine} ${randomUUID()}`,teamKey:boundary.teamKey,projectNames:boundary.projectNames});
  const sid=scope.id,checks=[],errors=[],keys=[];
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  const sh=id=>page.locator(`[data-shoot="${id}"]`),panel=sh('resolve-scope-work');
  const mark=s=>{checks.push(s);console.log(`${engine}: ${s}`);};
  const caps=async()=>(await request('GET',`/api/scopes/${sid}/capabilities`)).capabilities;
  const model=async()=>(await request('GET','/api/instrument/project')).scopes.find(s=>s.scopeId===sid);
  const opened=async id=>{await page.getByRole('tab',{name:/Unresolved/}).click();await page.getByRole('button',{name:`Resolve ${id}`,exact:true}).click();await panel.waitFor();await panel.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));};
  const saved=async()=>{await panel.waitFor({state:'hidden'});await sh('scope-save-confirmation').waitFor();};
  let mode='normal',patches=0;
  try{
    await request('PATCH',`/api/scopes/${sid}`,{teamCapacity:2});
    const first=(await request('POST',`/api/scopes/${sid}/capabilities`,{name:'QA In-release feature',workItemIds:[],idempotencyKey:randomUUID()})).capability;
    const later=(await request('POST',`/api/scopes/${sid}/capabilities`,{name:'QA Later feature',status:'outside',workItemIds:[],idempotencyKey:randomUUID()})).capability;
    const initial=await model(),items=initial.executionItems;assert(items.length>=9);
    // Only intercept our own fixture writes. The real server still performs all successful saves.
    await page.route('**/api/capabilities/*',async route=>{
      const r=route.request();if(r.method()!=='PATCH')return route.continue();
      const body=r.postDataJSON();assert(keys.includes(body.idempotencyKey)||body.idempotencyKey);keys.push(body.idempotencyKey);patches++;
      if(mode==='fail'){mode='normal';return route.fulfill({status:503,json:{error:'Injected ambiguous failure'}});}
      if(mode==='lost'){mode='normal';const result=await route.fetch();assert.equal(result.status(),200);return route.abort('failed');}
      if(mode==='slow'){mode='normal';await new Promise(resolve=>setTimeout(resolve,6500));}
      return route.continue();
    });
    await page.route(`**/api/scopes/${sid}/capabilities`,async route=>{
      if(route.request().method()!=='POST'||mode!=='create-lost')return route.continue();
      mode='normal';const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');
    });
    await page.goto(`${base}/scope?project=${sid}`);await sh('resolve-unmapped-work').click();
    await page.getByRole('tab',{name:`Unresolved ${items.length}`,exact:true}).waitFor();
    assert.equal(await sh('commit-reconciled-scope').count(),0);
    await page.getByRole('button',{name:`Resolve ${items[0].id}`,exact:true}).focus();await page.keyboard.press('Enter');await panel.waitFor();
    assert(await panel.getByRole('button',{name:'Save ticket assignment'}).isDisabled());
    await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
    assert.equal((await caps()).reduce((n,c)=>n+c.workLinks.length,0),0);
    mark('readiness shortcut, accessible ticket list, blank choice disabled, keyboard/cancel preserve Reality');
    await opened(items[0].id);await panel.getByLabel('Assign ticket to').selectOption(first.id);await sh('ticket-assignment-preview').filter({hasText:'In this release'}).waitFor();
    await page.screenshot({path:`${out}/direct-assignment.png`});
    mode='slow';const beforePatches=patches;await panel.getByRole('button',{name:'Save ticket assignment'}).click();
    await panel.getByRole('button',{name:'Saving and checking…'}).waitFor();assert(await panel.getByLabel('Assign ticket to').isDisabled());
    await page.keyboard.press('Escape');await panel.waitFor();await saved();assert.equal(patches-beforePatches,1);
    assert((await caps()).find(c=>c.id===first.id).workLinks.some(l=>l.externalId===items[0].id));
    await page.getByRole('tab',{name:`Unresolved ${items.length-1}`,exact:true}).waitFor();
    mark('slow save locks draft/close, succeeds once, removes ticket and updates count without reload');
    await opened(items[1].id);await panel.getByLabel('Assign ticket to').selectOption(first.id);
    mode='fail';await panel.getByRole('button',{name:'Save ticket assignment'}).click();await panel.getByRole('alert').filter({hasText:'could not confirm'}).waitFor();
    assert.equal(await panel.getByLabel('Assign ticket to').inputValue(),first.id);
    const retryKey=keys.at(-1);await panel.getByRole('button',{name:'Save ticket assignment'}).click();await saved();assert.equal(keys.at(-1),retryKey);
    mark('failed save keeps choice and draft; retry uses the same save key');
    await opened(items[2].id);await panel.getByLabel('Assign ticket to').selectOption(first.id);
    mode='lost';await panel.getByRole('button',{name:'Save ticket assignment'}).click();await saved();
    await sh('scope-save-confirmation').filter({hasText:'confirmed'}).waitFor();
    const current=(await caps()).find(c=>c.id===first.id);assert.equal(current.revision,4);assert.equal(current.workLinks.length,3);assert.equal(current.events.length,4);
    mark('server commits but response disappears: receipt confirms save, exactly one event/revision');
    await opened(items[3].id);await panel.getByLabel('Assign ticket to').selectOption(later.id);await sh('ticket-assignment-preview').filter({hasText:'excluded'}).waitFor();await panel.getByRole('button',{name:'Save ticket assignment'}).click();await saved();
    assert.equal((await model()).forecastCoverage.census.outsideExecutionIssueCount,1);
    await opened(items[4].id);await panel.getByLabel('Assign ticket to').selectOption('new-in');await panel.getByLabel('New feature name').fill('QA Created feature');await panel.getByRole('button',{name:'Save ticket assignment'}).click();await saved();
    await opened(items[5].id);await panel.getByLabel('Assign ticket to').selectOption('new-out');await panel.getByLabel('New feature name').fill('QA Newly deferred');mode='create-lost';await panel.getByRole('button',{name:'Save ticket assignment'}).click();await saved();
    assert.equal((await caps()).filter(c=>c.name==='QA Newly deferred').length,1);
    const result=await model();assert.equal(result.forecastCoverage.census.outsideExecutionIssueCount,2);assert.equal(result.forecastCoverage.census.unmappedExecutionIssueCount,items.length-6);
    mark('existing out/later and new in/out features classify correctly; lost create response recovers without a duplicate');
    await page.reload();await sh('scope-product-shape-summary').filter({hasText:`${items.length-6} unresolved`}).waitFor();
    for(const size of [{width:1280,height:800},{width:1440,height:900}]){
      await page.setViewportSize(size);await opened(items[6].id);const box=await panel.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);
      await page.screenshot({path:`${out}/drawer-${size.width}.png`});await page.keyboard.press('Escape');
    }
    mark('reload retains saved classifications; drawer fits both desktop sizes');
    // Exercise the original feature editor too, including no overlapping detail shelf.
    await page.locator(`[data-capability="capability:${first.id}"]`).first().click();
    await page.getByRole('button',{name:'Edit accepted Reality',exact:true}).click();const edit=sh('edit-capability-reality');await edit.waitFor();
    assert.equal(await sh('feature-detail').count(),0);
    for(const item of items.slice(6,9))await edit.getByRole('button').filter({hasText:item.id}).click();
    mode='lost';
    await sh('save-capability-reality').click();await edit.waitFor({state:'hidden'});await sh('scope-save-confirmation').waitFor();
    const edited=(await caps()).find(c=>c.id===first.id);assert.equal(edited.workLinks.length,6);assert.equal(edited.revision,5);assert.equal(edited.events.length,5);
    mark('original three-ticket editor save survives response loss with one revision and no stacked drawers');
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/result.json`,JSON.stringify({passed:true,engine,base,scopeId:sid,checks,errors,localFaultInjection:true,productionDataChanged:false},null,2));
  }catch(error){await page.screenshot({path:`${out}/failure.png`});writeFileSync(`${out}/result.json`,JSON.stringify({passed:false,error:String(error),checks,errors,text:await page.locator('body').innerText()},null,2));throw error;}
  finally{
    await page.close();const cleanup=await request('DELETE',`/api/scopes/${sid}`);assert(cleanup.ok);
    writeFileSync(`${out}/cleanup.json`,JSON.stringify({removedOnlyOwnedFixture:sid,preexistingScopesPreserved:(await request('GET','/api/scopes')).scopes.length===roots.scopes.length}));
    await browser.close();
  }
}
