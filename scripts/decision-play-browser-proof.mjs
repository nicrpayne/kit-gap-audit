import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

// Synthetic browser inputs only. Never forward a mutation to the target.
const base = process.env.DECISION_BASE ?? 'http://127.0.0.1:3207';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert(local || base === 'https://kit-gap-audit-staging-cedd.up.railway.app');
const password = process.env.DECISION_PASSWORD ?? (local ? 'signal-local-acceptance' : null);
const out = process.env.DECISION_OUTPUT; assert(out && password);
const fixtures = JSON.parse(readFileSync(process.env.DECISION_FIXTURES, 'utf8'));
const template = fixtures['/api/instrument/project'];
const scopes = ['qa-a', 'qa-b'].map((id, i) => ({ id, name: `QA ${i ? 'Beta' : 'Alpha'}`, targetDate: null }));
const row = (id, scopeId, title, extra = {}) => ({ id, scopeId, title, status: 'open', readinessRole: 'reference', updatedAt: '2026-10-06T12:00:00.000Z',
  createdAt: '2026-10-01T12:00:00.000Z', owner: null, rationale: null, neededBy: null, options: [], chosenOption: null, resolution: null, decidedAt: null,
  dismissReason: null, relatedIssues: [], sourceFindingId: null, sourceClaimKey: null, gate: null,
  evidence: [{ id: `ev-${id}`, kind: 'context_package', excerpt: 'The team agreed to this convention in refinement.', contextSnapshotId: 'qa-snapshot', evidenceItemId: 'qa-quote', externalRef: 'fixture://conversation#quote', sourceLabel: 'Fictional QA conversation' }],
  scope: scopes.find(s => s.id === scopeId), ...extra });
const decisions = [row('qa-open', 'qa-a', 'QA review the convention'), row('qa-gated', 'qa-a', 'QA approval waits seven days', { readinessRole: 'release_scope',
  gate: { id: 'qa-gate', decisionId: 'qa-gated', targetScopeId: 'qa-a', dependency: 'Release waits for approval', evidenceForGate: 'Fictional acceptance fixture', low: 7, likely: 7, high: 7, serial: true, provenance: 'manual', targetScope: scopes[0] } }),
  row('qa-history', 'qa-a', 'QA settled historical agreement', { status: 'decided', resolution: 'Already adopted', decidedAt: '2026-10-01T12:00:00.000Z' }),
  row('qa-other', 'qa-b', 'QA other project question')];
const clear = { state: 'forecastable', canonicalForecast: true, label: 'CANONICAL DELIVERY FORECAST', reason: null, caveat: null, reasons: [], census: {
  executionIssueCount: 1, modeledExecutionIssueCount: 1, outsideExecutionIssueCount: 0, unmappedExecutionIssueCount: 0, acceptedCapabilityCount: 1, mappedAcceptedCapabilityCount: 1, openShapeDecisionCount: 0, incompleteDependencyCount: 0 } };
function project() {
  const p = structuredClone(template);
  p.startDate = '2026-10-06T00:00:00.000Z'; p.decisions = structuredClone(decisions); p.reports = []; p.findings = [];
  p.people = scopes.map(s => ({ id: `person-${s.id}`, name: `QA developer ${s.id}`, fte: 1, externalCommitmentFte: 0, active: true }));
  p.allocations = scopes.map(s => ({ personId: `person-${s.id}`, scopeId: s.id, fraction: 1 }));
  p.scopes = scopes.map(s => {
    const t = structuredClone(template.scopes[0]);
    const item = { ...t.items[0], id: `${s.id}-work`, label: 'QA remaining implementation', low: 10, likely: 10, high: 10, points: 10, estimateSource: 'points' };
    return { ...t, scopeId: s.id, name: s.name, dependsOnScopeIds: [], items: [item], forecastItems: [item], executionItems: [item], teamCapacity: 1,
      capacitySource: 'explicit', explicitTeamCapacity: 1, capacityBasis: { kind: 'explicit', value: 1 }, forecastCoverage: structuredClone(clear),
      forecastReadiness: { state: 'forecastable', reason: null }, openShapeQuestions: [],
      capacityContract: { ...t.capacityContract, scopeId: s.id, status: 'named_exact', reconciles: true, namedRawFte: 1, namedEffectiveFte: 1, workforceFte: 1 },
      capabilities: [{ ...t.capabilities[0], id: `${s.id}-cap`, name: 'QA deliverable', acceptedEstimate: null, estimateReview: null, knowledgeEstimates: [],
        workLinks: [{ id: `${s.id}-link`, externalId: item.id, provider: 'linear', state: 'active' }], events: [] }],
      gates: decisions.filter(d => d.gate?.targetScopeId === s.id).map(d => ({ id: d.gate.id, label: d.title, low: 7, likely: 7, high: 7 })) };
  });
  return p;
}
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const dir = `${out}/${name}`; mkdirSync(dir, { recursive: true });
  const browser = await engine.launch(); const context = await browser.newContext({ viewport: { width: 1600, height: 1150 } });
  const auth = await context.request.post(base + '/api/login', { data: { password } }); assert.equal(auth.status(), 200);
  if (local) { const cookie = auth.headers()['set-cookie'].split(';')[0], i = cookie.indexOf('='); await context.addCookies([{ name: cookie.slice(0, i), value: cookie.slice(i+1), url: base, httpOnly: true, secure: false, sameSite: 'Lax' }]); }
  const runtime = await (await context.request.get(base + '/api/version')).json();
  if (process.env.CANDIDATE_COMMIT) assert.equal(runtime.commit, process.env.CANDIDATE_COMMIT);
  const writes = [], errors = [], checks = [], unknown = [];
  await context.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/proposal')) return route.fulfill({ json: { proposal: null } });
    if (req.method() !== 'GET') { writes.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Synthetic proof refuses writes' } }); }
    if (path === '/api/instrument/project' || path === '/api/portfolio/inputs') return route.fulfill({ json: project() });
    if (path === '/api/decisions') return route.fulfill({ json: { decisions, scopes, candidates: [] } });
    if (path === '/api/scopes') return route.fulfill({ json: { scopes } });
    if (path === '/api/reports') return route.fulfill({ json: { reports: [] } });
    if (path === '/api/forecast') return route.fulfill({ json: { likelyDate: '2026-10-23', confidenceAtTarget: null, forecastSource: project().scopes[0].forecastSource, forecastCoverage: clear } });
    if (path === '/api/version') return route.fulfill({ json: runtime });
    if (fixtures[path]) return route.fulfill({ json: fixtures[path] });
    unknown.push(path); return route.fulfill({ json: {} });
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
  const sh = id => page.locator(`[data-shoot="${id}"]`);
  const mark = text => { checks.push(text); console.log(`${name}: ${text}`); };
  const fresh = async () => { await page.goto(`${base}/decisions?project=qa-a`); await sh('reality-date').waitFor(); };
  const nav = async route => { await page.locator(`a[href^="/${route}?"]`).first().click(); await page.waitForURL(u => u.pathname === '/' + route); };
  const drag = async (id, target) => {
    await page.getByText('What-if · not saved to Reality', {exact:true}).waitFor({state:'hidden'});
    const handle = page.getByTestId(`decision-drag-${id}`), zone = page.getByTestId(`decision-drop-${target}`);
    await handle.hover(); const a = await handle.boundingBox(); assert(a);
    await page.mouse.move(a.x+a.width/2, a.y+a.height/2); await page.mouse.down(); await page.mouse.move(a.x+a.width/2+12,a.y+a.height/2,{steps:4});
    await page.getByText('What-if · not saved to Reality', {exact:true}).waitFor();
    // Await the actual target's stable layout. FLIP and nested scrolling can
    // move a bay between reading a raw box and issuing a synthetic mouse move.
    await zone.locator('strong').first().hover();
    await page.waitForFunction(target => document.querySelector(`[data-testid="decision-drop-${target}"]`)?.getAttribute('data-drag-over') === 'true', target);
    await page.mouse.up();
    // dnd-kit suppresses the post-drop click for 50ms. Keep the next separate
    // human action outside that intentional click-through protection window.
    await page.waitForTimeout(70);
  };
  try {
    await fresh(); assert.equal(await page.getByText('QA other project question', { exact: true }).count(), 0);
    assert.equal(await page.getByTestId('decision-drag-qa-history').count(), 0);
    const baseline = await sh('reality-date').innerText();
    mark('Project-specific banks exclude other projects; settled history is not draggable');
    await drag('qa-open','gating'); await sh('connect-tool').waitFor();
    assert.equal(await sh('gate-low').inputValue(), ''); assert(await sh('gate-submit').isDisabled());
    const pending = page.getByTestId('pending-delay-card'), bloom = page.getByTestId('decision-bloom');
    await pending.waitFor(); assert.equal(await pending.getAttribute('data-decision-id'),'qa-open');
    assert.equal(await page.getByTestId('decision-drag-qa-open').count(),0,'The dropped card must leave its old bay while pending');
    const assertBloom = async (side) => {
      const a=await pending.boundingBox(), b=await bloom.boundingBox();assert(a&&b);
      const view=page.viewportSize();assert(b.x>=0&&b.y>=0&&b.x+b.width<=view.width+1&&b.y+b.height<=view.height+1,'Floating options stay inside the viewport');
      const submit=await sh('gate-submit').boundingBox();assert(submit&&submit.y>=b.y&&submit.y+submit.height<=b.y+b.height,'Confirm stays visible without scrolling');
      if(side==='right')assert(b.x>=a.x+a.width+10,'Options bloom to the right without covering their card');
      assert.equal(await pending.evaluate(el=>getComputedStyle(el).borderColor),await bloom.evaluate(el=>getComputedStyle(el).borderColor));
      assert(await bloom.evaluate(el=>el.contains(document.activeElement)),'Focus belongs to the floating dialog');
      assert.equal(await sh('reality-date').innerText(),baseline,'Unconfirmed drop must not affect the forecast');
      assert((await sh('circuit-node-qa-a').innerText()).includes(baseline),'Pending circuit and Reality date must agree');
    };
    await assertBloom('right'); await page.screenshot({path:`${dir}/pending-bloom.png`});
    await page.keyboard.press('Shift+Tab');await assertBloom('right');
    mark('Dropped card stays on the circuit; matching floating options, visible pending state, and keyboard focus; no forecast change');
    await page.keyboard.press('Escape'); await sh('connect-tool').waitFor({ state: 'hidden' });
    assert.equal(await pending.count(),0);
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='decision-drag-qa-open');
    assert.equal(await sh('reality-date').innerText(),baseline); mark('Drop opens explicit timing questions; no invented defaults; cancel preserves Reality');
    await drag('qa-open','gating'); await sh('gate-dependency').fill('The whole release waits for this approval.');
    await sh('gate-evidence').fill('Fictional seven-day delay supplied for QA.');
    for (const field of ['low','likely','high']) await sh(`gate-${field}`).fill('7');
    await sh('gate-high').fill('3'); await sh('gate-submit').click();
    assert(await pending.isVisible());assert(await bloom.isVisible());
    assert.equal(await sh('reality-date').innerText(),baseline);await sh('gate-high').fill('7');
    await sh('gate-submit').click(); await sh('connect-tool').waitFor({ state: 'hidden' });
    assert.equal(await pending.count(),0);
    await page.waitForFunction(() => document.querySelector('[data-shoot="scenario-consequence"]')?.textContent.includes('+7d'));
    const delayedDate = await sh('scenario-date').innerText();
    await page.screenshot({ path: `${dir}/dragged-blocking.png`, fullPage: true });
    mark('Pointer drag stages exactly seven serial delay days without a persistent write');
    await drag('qa-open','gating');await bloom.waitFor();assert.equal(await sh('gate-likely').inputValue(),'7');
    assert.equal(await sh('count-gating').innerText(),'2\ngating · subset of open');
    await page.getByRole('button',{name:'Cancel · put card back',exact:true}).click();await bloom.waitFor({state:'hidden'});
    assert.equal(await sh('scenario-date').innerText(),delayedDate);mark('Reopening and cancelling an existing hypothetical delay retains its prior gate and forecast');
    await nav('forecast'); await sh('central-date').waitFor();
    await page.waitForFunction(date => document.querySelector('[data-shoot="central-date"]')?.textContent.toLowerCase().includes(date.toLowerCase()), delayedDate);
    await sh('toggle-macros').click(); await page.getByRole('button', { name: 'QA review the convention', exact: true }).waitFor();
    assert.equal(await sh('macro-gate').count(),2);
    await page.screenshot({ path: `${dir}/shared-forecast.png` }); mark('Forecast retains the shared Scenario date AND both delay controls');
    await nav('portfolio'); await page.getByText('decision what-if', { exact: false }).first().waitFor();
    await nav('scope'); await page.getByText('decision what-if', { exact: false }).first().waitFor();
    await nav('reports'); const compare = page.getByRole('button', { name: 'Generate Reality + Scenario', exact: true });
    await compare.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Generate Reality + Scenario' && !b.disabled));
    await nav('decisions'); await sh('scenario-date').waitFor(); assert.equal(await sh('scenario-date').innerText(), delayedDate);
    mark('Shared what-if survives Portfolio, Scope, Reports and return to Decisions');
    await drag('qa-open','resolved'); await sh('scenario-resolved-qa-open').waitFor();
    await page.waitForFunction(expected => document.querySelector('[data-shoot="scenario-date"]')?.textContent === expected, baseline);
    mark('Assume resolved reconnects the hypothetical circuit and restores the baseline date');
    await drag('qa-open','open'); await sh('reality-date').waitFor();
    await drag('qa-gated','resolved'); await sh('scenario-resolved-qa-gated').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-shoot="scenario-consequence"]')?.textContent.includes('-7d'));
    await drag('qa-gated','gating'); await sh('reality-date').waitFor(); assert.equal(await sh('reality-date').innerText(), baseline);
    mark('Real gate can be hypothetically resolved then restored; no duplicate delay');
    await sh('filter-gating').click(); await page.getByTestId('decision-drop-open').waitFor({state:'hidden'});
    await page.getByTestId('decision-drag-qa-gated').focus();
    await page.keyboard.press('Space', {delay:100}); await page.keyboard.press('ArrowDown', {delay:100});
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('decision-drop-resolved'));
    await page.keyboard.press('Space'); await sh('scenario-resolved-qa-gated').waitFor();
    await sh('inspector-assume').click(); await sh('reality-date').waitFor();
    assert.equal(await sh('scenario-resolved-qa-gated').count(), 0);
    await sh('filter-all').click();
    mark('Keyboard skips hidden bays; the inspector reverses a drag without conflicting assumptions');
    const keyboard = page.getByTestId('decision-drag-qa-open'); await keyboard.focus();
    await page.keyboard.press('Space', { delay: 100 });
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('decision-drop-open'));
    await page.keyboard.press('ArrowDown', { delay: 100 });
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('decision-drop-resolved'));
    await page.keyboard.press('Space');
    await sh('scenario-resolved-qa-open').waitFor();
    await page.getByTestId('undo-decision-scenario').click(); await sh('reality-date').waitFor();
    await keyboard.focus(); await page.keyboard.press('Space', {delay:100}); await page.getByText('What-if · not saved to Reality', {exact:true}).waitFor(); await page.keyboard.press('ArrowDown', {delay:100}); await page.keyboard.press('Escape');
    await page.getByText('What-if · not saved to Reality', {exact:true}).waitFor({state:'hidden'});
    assert.equal(await sh('scenario-resolved-qa-open').count(),0); mark('Keyboard pick/drop and Escape cancellation work with equivalent Undo');
    await keyboard.click(); // handle alone does not accept or decide anything
    await sh('circuit-scope').selectOption('qa-b'); await page.getByText('QA other project question', { exact: true }).first().waitFor();
    assert.equal(await page.getByTestId('decision-drag-qa-open').count(),0);
    await sh('circuit-scope').selectOption('qa-a'); await drag('qa-open','resolved');
    await page.reload(); await sh('reality-date').waitFor(); assert.equal(await sh('scenario-resolved-qa-open').count(),0);
    mark('Project switch remains scoped; reload discards ephemeral experiments');
    await page.setViewportSize({width:1280,height:900});
    await drag('qa-open','gating');await bloom.waitFor();await assertBloom('right');
    await page.setViewportSize({width:1024,height:640});await page.waitForTimeout(150);await assertBloom();
    await page.screenshot({path:`${dir}/compact-bloom.png`});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await pending.evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await bloom.evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.keyboard.press('Escape');await bloom.waitFor({state:'hidden'});await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:1280,height:900});
    await drag('qa-open','gating');await bloom.waitFor();
    await page.getByTestId('decision-bloom-backdrop').click({position:{x:8,y:8}});await bloom.waitFor({state:'hidden'});
    mark('Floating options track resize, fit compact screens, respect reduced motion, and cancel through backdrop or Escape');
    await drag('qa-open','resolved'); await sh('scenario-resolved-qa-open').waitFor();
    await page.getByTestId('undo-decision-scenario').click(); await sh('reality-date').waitFor();
    await page.screenshot({path:`${dir}/compact.png`});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    assert.deepEqual(writes,[]); assert.deepEqual(errors,[]);
    mark('Compact desktop drag and Undo work without document overflow; zero JavaScript errors and zero mutation attempts');
    writeFileSync(`${dir}/result.json`,JSON.stringify({passed:true,runtime,checks,writes,errors,unknown,limit:'Synthetic UI coverage, not business-data acceptance'},null,2));
  } catch (error) { await page.screenshot({path:`${dir}/failure.png`,fullPage:true}); writeFileSync(`${dir}/failure.txt`,String(error)+'\n'+await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); }
}
