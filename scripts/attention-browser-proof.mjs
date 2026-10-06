import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

// All interactions use intercepted, explicitly synthetic inputs. Never save,
// refresh sources, generate a report, or change accepted data on a live host.
const base = process.env.ATTENTION_BASE ?? 'http://127.0.0.1:3207';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert(local || base === 'https://kit-gap-audit-staging-cedd.up.railway.app');
const password = process.env.ATTENTION_PASSWORD ?? (local ? 'signal-local-acceptance' : null);
const out = process.env.ATTENTION_OUTPUT; assert(out && password);
mkdirSync(out, { recursive: true });
let fixtures;
if (process.env.ATTENTION_FIXTURES) fixtures = JSON.parse(readFileSync(process.env.ATTENTION_FIXTURES, 'utf8'));
else {
  assert(local, 'Capture fixtures only from isolated local database'); fixtures = {};
  const get = async path => { const r = await fetch(base + path, { headers: { authorization: `Bearer ${password}` } }); assert(r.ok, path); return r.json(); };
  for (const path of ['/api/instrument/project', '/api/portfolio/inputs', '/api/scopes', '/api/timeline', '/api/decisions', '/api/capacity/roster']) fixtures[path] = await get(path);
  const sid = fixtures['/api/instrument/project'].scopes[0].scopeId;
  fixtures['/api/audit/graph'] = await get(`/api/audit/graph?scope=${sid}&slice=detail`);
  fixtures['/api/audit/truth'] = await get(`/api/audit/truth?scope=${sid}`);
  fixtures['/api/audit/rubric'] = await get(`/api/audit/rubric?scope=${sid}`);
  fixtures['/api/audit/rubric-context'] = await get(`/api/audit/rubric?scope=${sid}&mode=context`);
  writeFileSync(`${out}/fixtures.json`, JSON.stringify(fixtures), { mode: 0o600 });
}
const sid = fixtures['/api/instrument/project'].scopes[0].scopeId;
const original = fixtures['/api/instrument/project'].scopes[0];
const clear = { state: 'forecastable', canonicalForecast: true, label: 'CANONICAL DELIVERY FORECAST', reason: null, caveat: null, reasons: [], census: { executionIssueCount: original.executionItems.length, modeledExecutionIssueCount: original.executionItems.length, outsideExecutionIssueCount: 0, unmappedExecutionIssueCount: 0, acceptedCapabilityCount: 1, mappedAcceptedCapabilityCount: 1, openShapeDecisionCount: 0, incompleteDependencyCount: 0 } };
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const dir = `${out}/${name}`; mkdirSync(dir, { recursive: true });
  const browser = await engine.launch(); const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const auth = await context.request.post(base + '/api/login', { data: { password } }); assert.equal(auth.status(), 200);
  if (local) { const cookie = auth.headers()['set-cookie'].split(';')[0], i = cookie.indexOf('='); await context.addCookies([{ name: cookie.slice(0, i), value: cookie.slice(i+1), url: base, httpOnly: true, secure: false, sameSite: 'Lax' }]); }
  const runtime = await (await context.request.get(base + '/api/version')).json();
  if (process.env.CANDIDATE_COMMIT) assert.equal(runtime.commit, process.env.CANDIDATE_COMMIT);
  let mode = 'unmapped', auditMode = 'current', failedRead = false;
  const writes = [], unknown = [], checks = [], errors = [];
  const coverage = () => {
    const c = structuredClone(clear);
    if (mode === 'unmapped') { c.census.unmappedExecutionIssueCount = 1; c.census.modeledExecutionIssueCount--; c.reasons = [{ code: 'execution_work_unmapped', count: 1, label: '1 ticket needs classification' }]; }
    if (mode === 'decisions') { c.census.openShapeDecisionCount = 1; c.reasons = [{ code: 'shape_decisions_open', count: 1, label: '1 product-scope Decision remains open' }]; }
    if (mode === 'source') c.reasons = [{ code: 'execution_source_stale', count: 1, label: 'Execution data needs refreshing' }];
    if (c.reasons.length) { c.canonicalForecast = false; c.state = 'modeled_subset'; c.label = 'FORECAST INCOMPLETE'; c.reason = c.reasons[0].label; }
    return c;
  };
  const project = () => {
    const p = structuredClone(fixtures['/api/instrument/project']);
    for (const s of p.scopes) {
      s.forecastCoverage = coverage(); s.capacityContract.reconciles = mode !== 'capacity';
      s.capacityContract.status = mode === 'capacity' ? 'aggregate_unreconciled' : 'named_exact';
      s.gates = []; s.dependsOnScopeIds = []; s.openShapeQuestions = [];
      s.capabilities = [{ ...s.capabilities[0], id: 'attention-feature', name: 'QA feature', status: 'accepted', estimateReview: null,
        workLinks: s.executionItems.slice(mode === 'unmapped' ? 1 : 0).map(i => ({ id: `link-${i.id}`, externalId: i.id, state: 'active', externalSystem: 'linear' })) }];
    }
    return p;
  };
  const knowledge = () => ({ code: auditMode === 'pending' ? 'current' : auditMode === 'new' ? 'new_available' : auditMode, label: `Knowledge · ${auditMode}`, detail: 'Synthetic browser-proof status', checkedAt: new Date().toISOString(), canRefresh: !['offline'].includes(auditMode), companion: null, lastPackageAt: null, lastAuditAt: null, evidenceObservedAt: { oldest: null, newest: null }, activeJob: null, latestRun: null });
  await context.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/audit/rubric' && new URL(req.url()).searchParams.get('mode') === 'context') return route.fulfill({ json: fixtures['/api/audit/rubric-context'] });
    // Scope composes a derived suggestion via POST on mount. Return an empty
    // synthetic suggestion here; never forward it to the server.
    if (path.endsWith('/proposal')) return route.fulfill({ json: { proposal: null } });
    if (req.method() !== 'GET') { writes.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Read-only attention proof' } }); }
    if (path === '/api/instrument/project') return route.fulfill(failedRead ? { status: 503, json: { error: 'Injected temporary read failure' } } : { json: project() });
    if (path === '/api/portfolio/inputs') return route.fulfill({ json: { ...structuredClone(fixtures[path]), ...project() } });
    if (path === '/api/forecast') return route.fulfill({ json: { likelyDate: '2026-11-01', confidenceAtTarget: null, forecastSource: { asOf: new Date().toISOString() }, forecastCoverage: coverage() } });
    if (path === '/api/decisions') return route.fulfill({ json: { ...fixtures[path], candidates: [], decisions: mode === 'decisions' ? [{ id: 'attention-decision', scopeId: sid, title: 'QA release boundary choice', status: 'open', owner: null, rationale: null, neededBy: null, options: [], chosenOption: null, resolution: null, decidedAt: null, dismissReason: null, relatedIssues: [], sourceFindingId: null, sourceClaimKey: null, createdAt: '2026-10-01T12:00:00Z', gate: null, evidence: [], scope: { id: sid, name: original.name, targetDate: null } }] : [] } });
    if (path === '/api/timeline') return route.fulfill({ json: { ...fixtures[path], candidates: [{ id: 'attention-event', scopeId: sid, title: 'QA proposed launch review', date: '2026-10-31', endDate: null, kind: 'milestone', sourceLabel: 'Synthetic proof', excerpts: ['Proposed date, not accepted'], evidenceRefs: [], contextSnapshotId: null, status: 'pending' }] } });
    if (path === '/api/reports') return route.fulfill({ json: { reports: [] } });
    if (path.endsWith('/proposal')) return route.fulfill({ json: { proposal: null } });
    if (path === '/api/audit/knowledge') return route.fulfill({ json: { knowledge: knowledge() } });
    if (path === '/api/audit/changes') return route.fulfill({ json: { knowledge: knowledge(), counts: { scope: auditMode === 'pending' ? 1 : 0 }, total: auditMode === 'pending' ? 1 : 0, sourceHealth: { hermes: 'current', linear: 'current', linearDetail: 'Synthetic', notion: 'current', figma: 'current', companion: 'online', lastPackageAt: null, lastAuditAt: null }, readiness: { ready: false, label: 'Review delivery inputs', blockers: [{ code: 'scope', label: 'Resolve one ticket', targetHref: `/scope?project=${sid}` }] }, baseline: { seeded: 0, available: true }, proposals: auditMode === 'pending' ? [{ id: 'attention-proposal', category: 'scope', owner: 'scope', changeType: 'add', title: 'QA source proposal', summary: 'Review this source before accepting anything', whyProposed: 'Synthetic proof', currentState: {}, proposedState: {}, evidence: [], currentness: 'current', retrievalBasis: 'synthetic', retrievalConfidence: 'high', forecastEffect: null, relevanceClass: 'project_local', relevanceReason: 'Synthetic', sourceKind: 'knowledge', recommendedAction: 'review', targetHref: `/scope?project=${sid}`, completionRequirements: [], status: 'pending', dispositionReason: null, canonicalObjectType: null, canonicalObjectId: null, acceptedAt: null }] : [] } });
    if (fixtures[path]) return route.fulfill({ json: fixtures[path] });
    if (path === '/api/version') return route.fulfill({ json: runtime });
    unknown.push(path); return route.fulfill({ json: {} });
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
  const sh = id => page.locator(`[data-shoot="${id}"]`);
  const visit = async route => {
    // Let Next's link prefetch finish before replacing the whole document;
    // WebKit reports aborted in-flight RSC prefetches as access-control errors.
    await page.mouse.move(0, 0);
    await page.waitForLoadState('networkidle');
    await page.goto(`${base}/${route}?project=${sid}`);
    await sh('attention-motion').waitFor();
    await page.waitForLoadState('networkidle');
  };
  const mark = s => { checks.push(s); console.log(`${name}: ${s}`); };
  try {
    await visit('scope'); const card = sh('scope-coverage-state'); await sh('resolve-unmapped-work').waitFor();
    assert.equal(await card.getAttribute('data-attention'), 'required');
    await page.mouse.move(0, 0);
    assert.equal(await card.evaluate(el => getComputedStyle(el).animationName), 'signal-action-glow');
    assert.equal(await card.evaluate(el => getComputedStyle(el).animationDuration), '4.8s');
    await page.screenshot({ path: `${dir}/scope-next-step.png` });
    await sh('resolve-unmapped-work').focus(); await page.keyboard.press('Enter');
    await page.getByRole('tab', { name: 'Unresolved 1', exact: true }).waitFor();
    await page.getByRole('button', { name: `Resolve ${original.executionItems[0].id}`, exact: true }).waitFor();
    mark('Scope gentle outline opens the correct unresolved list by keyboard');
    await page.getByRole('button', { name: 'Pause action glow', exact: true }).click();
    assert.equal(await card.evaluate(el => getComputedStyle(el).animationName), 'none');
    await visit('forecast'); await sh('next-step').waitFor();
    assert.equal(await sh('next-step').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await sh('next-step').locator('a').getAttribute('href'), `/scope?project=${sid}`);
    await page.reload(); await page.getByRole('button', { name: 'Resume action glow', exact: true }).click();
    mark('Pause persists across navigation/reload; guidance and project-specific links remain');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: /Action glow is static/ }).waitFor();
    assert.equal(await sh('next-step').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await sh('next-step').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await sh('next-step').evaluate(el => getComputedStyle(el).display), 'none');
    await page.emulateMedia({ media: 'screen' }); mark('Reduced-motion keeps static cues; printing hides operational guidance');
    mode = 'decisions'; await visit('forecast'); await page.getByRole('link', { name: /Review open Decisions/ }).click();
    await page.getByRole('button', { name: /Open decision/ }).click();
    await page.getByText('QA release boundary choice', { exact: true }).first().waitFor();
    await page.waitForURL(url => (url.searchParams.get('select') ?? '').includes('attention-decision'));
    await page.screenshot({ path: `${dir}/decision-review.png` }); mark('Forecast routes to Decisions; next step selects the actual open choice without accepting');
    await visit('reports'); await sh('next-step').waitFor();
    assert.equal(await sh('next-step').locator('a').getAttribute('href'), `/decisions?project=${sid}`);
    assert(await page.getByRole('button', { name: 'Resolve coverage to report', exact: true }).isDisabled());
    assert.equal(await page.getByRole('button', { name: 'Resolve coverage to report', exact: true }).getAttribute('data-attention'), null);
    await page.screenshot({ path: `${dir}/reports-blocker.png` }); mark('Reports highlights the fix, not its disabled Generate button');
    mode = 'capacity'; await visit('portfolio'); await page.getByRole('button', { name: /Review actual team/ }).click();
    await page.getByText('Reconcile the complete named roster', { exact: true }).waitFor(); mark('Capacity next step opens team review, without saving');
    mode = 'unmapped'; await visit('orbit'); await sh('next-step').waitFor(); assert.equal(await sh('next-step').locator('a').getAttribute('href'), `/scope?project=${sid}`);
    await page.screenshot({ path: `${dir}/dependencies-next-step.png` });
    await visit('control-room'); await sh('next-step').waitFor(); assert((await sh('next-step').innerText()).includes(original.name));
    await page.screenshot({ path: `${dir}/control-room-next-step.png` }); mark('Dependencies and Control Room name the real blocker and preserve project context');
    await visit('timeline'); const intake = page.getByRole('button', { name: 'Review 1 suggested Timeline events' }); await intake.waitFor(); assert.equal(await intake.getAttribute('data-attention'), 'review');
    await intake.click(); await sh('intake-attention-event').waitFor(); assert.equal(await intake.getAttribute('data-attention'), null); mark('Timeline next action opens proposed events, without placing them');
    auditMode = 'pending'; await visit('audit'); await sh('audit-change-inbox').waitFor();
    const review = page.getByRole('link', { name: 'Review in Scope →', exact: true }); await review.waitFor(); assert.equal(await review.getAttribute('data-attention'), 'review');
    await page.screenshot({ path: `${dir}/audit-review.png` }); mark('Audit highlights review of source proposals, never Accept or Reject');
    auditMode = 'new'; await visit('audit'); await sh('audit-refresh-primary').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-shoot="audit-refresh-primary"]')?.getAttribute('data-attention') === 'review');
    auditMode = 'offline'; await visit('audit'); await page.getByRole('button', { name: /Check source connection/ }).click(); await sh('audit-change-inbox').waitFor();
    assert(await sh('audit-refresh-primary').isDisabled()); assert.equal(await sh('audit-refresh-primary').getAttribute('data-attention'), null); mark('New source information cues refresh; offline source directs to connection review');
    mode = 'clear'; auditMode = 'current'; await visit('forecast'); await page.waitForSelector('[data-shoot="forecast-modeled-subset"]', { state: 'detached' });
    assert.equal(await sh('next-step').count(), 0); await visit('scope'); await card.waitFor(); assert.equal(await card.getAttribute('data-attention'), null);
    await visit('reports'); const generate = page.getByRole('button', { name: 'Generate report', exact: true });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Generate report' && b.dataset.attention === 'review'));
    assert(!await generate.isDisabled()); mark('Resolved inputs remove blocker cues; empty ready Reports highlights Generate');
    failedRead = true; await visit('forecast'); await page.getByRole('button', { name: /Retry loading/ }).waitFor();
    failedRead = false; await page.getByRole('button', { name: /Retry loading/ }).click(); await page.waitForSelector('[data-shoot="next-step"]', { state: 'detached' }); mark('Read failure has a working safe Retry action');
    mode = 'unmapped'; await page.setViewportSize({ width: 1024, height: 768 }); await visit('scope'); await sh('resolve-unmapped-work').waitFor();
    const box = await sh('resolve-unmapped-work').boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 768);
    await page.screenshot({ path: `${dir}/scope-1024.png` }); mark('Primary Scope action remains visible at minimum supported laptop width');
    assert.deepEqual(writes, [], 'No persistent API actions allowed'); assert.deepEqual(errors, [], 'No browser exceptions');
    writeFileSync(`${dir}/result.json`, JSON.stringify({ passed: true, runtime, checks, writes, unknown, errors, boundary: 'Synthetic intercepted browser inputs. No real business acceptance or report generation.' }, null, 2));
  } catch (error) { await page.screenshot({ path: `${dir}/failure.png` }); writeFileSync(`${dir}/result.json`, JSON.stringify({ passed: false, checks, writes, unknown, errors, error: String(error) }, null, 2)); throw error; }
  finally { await context.close(); await browser.close(); }
}
