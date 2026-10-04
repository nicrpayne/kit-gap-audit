import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import type { ProjectPayload } from '../lib/instrument/useProject';
import type { CompiledScopeProposal } from '../lib/scope/proposal';

// Browser replay of private, captured READ responses; all API and external
// traffic is intercepted. This proves the UI, not production persistence.
const dir = resolve(process.argv[2]);
const base = process.env.SIGNAL_PROOF_URL ?? 'http://127.0.0.1:3312';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Loopback only');
const read = (name: string) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const payload = read('instrument.json') as ProjectPayload;
const original = JSON.stringify(payload);
const scope = payload.scopes.find(s => s.name === 'iTrack')!;
const compiled = read('itrack-proposal-after.json') as CompiledScopeProposal;
const proposal = {
  ...compiled, id: 'local-matching-replay', scopeId: scope.scopeId, status: 'active',
  generatedAt: '2026-10-04T12:00:00Z', stale: false,
  items: compiled.items.map(i => ({ ...i, id: i.candidateKey, status: 'suggested' })),
};
const notification = proposal.items.find(i => i.title === 'iTrack notification engine')!;
assert.equal(notification.workItemIds.length, 7);
const out = resolve(dir, 'browser');
mkdirSync(out, { recursive: true, mode: 0o700 });
async function main() {
const results = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]] as const) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const writes: string[] = [], mockedProposalRequests: string[] = [], unexpected: string[] = [], errors: string[] = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin) {
      unexpected.push(`External ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === `/api/scopes/${scope.scopeId}/proposal` && ['GET', 'POST'].includes(request.method())) {
      mockedProposalRequests.push(request.method());
      return route.fulfill({ json: { proposal, stale: false } });
    }
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Read-only browser proof' } });
    }
    if (url.pathname === '/api/instrument/project') return route.fulfill({ json: payload });
    if (url.pathname === '/api/version') return route.fulfill({ json: { sha: 'local-2.5-proof', shortSha: 'local-2.5' } });
    unexpected.push(`GET ${url.pathname}`);
    return route.fulfill({ status: 404, json: { error: 'Not part of captured fixture' } });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const checks: string[] = [];
  const check = (label: string) => checks.push(label);
  try {
    await page.goto(`${base}/scope?project=${scope.scopeId}`);
    await page.locator('[data-shoot="reconciliation-workspace"]').waitFor();
    await page.getByLabel('Find reconciliation candidate').waitFor();
    assert.match(await page.locator('[data-shoot="other-project-context-note"]').innerText(), /8 other-project source records kept in Audit/);
    assert.equal(await page.locator('[data-shoot="stage-aligned"]').isEnabled(), false);
    check('Foreign-project filtering is disclosed; unsupported bulk staging stays disabled');
    await page.getByRole('tab', { name: 'Work 45', exact: true }).click();
    assert.equal(await page.locator('[data-shoot="execution-work-finder"] > div').count(), 45);
    check('All 45 current executable tickets remain available');
    await page.getByRole('tab', { name: /^Review / }).click();
    const search = page.getByLabel('Find reconciliation candidate');
    await search.fill('SOF-837');
    assert.equal(await page.locator('[data-shoot="proposal-card"]').count(), 1);
    assert.match(await page.locator('[data-shoot="proposal-card"]').innerText(), /Light \/ Dark mode review/);
    check('Search finds Light/Dark under its own feature, not JSA approvals');
    await search.fill('');
    await page.locator(`[data-proposal-item="${notification.id}"]`).click();
    const focus = page.locator('[data-shoot="reconciliation-focus"]');
    await focus.waitFor();
    assert.equal(await focus.getByRole('checkbox').count(), 7);
    assert.match(await focus.innerText(), /SOF-952 · iTrack notification engine/);
    assert.match(await focus.innerText(), /0 matched references/);
    assert.match(await focus.innerText(), /Matched does not mean recently confirmed/);
    check('Notification parent and seven children inspect correctly, without invented evidence');
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(out, `${name}-notification-review.png`) });
    await focus.getByRole('checkbox').first().uncheck();
    assert.match(await focus.innerText(), /6 of 7 Linear items selected/);
    await focus.locator('[data-shoot="stage-focused-proposal"]').click();
    await focus.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('[data-shoot="reconciliation-scenario-feedback"]').waitFor();
    assert.match(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').innerText(), /1 reviewed change staged. Reality is unchanged/);
    check('Ticket-level selection stages a reversible local Scenario');
    await page.locator('a[href^="/forecast"]').first().click();
    await page.waitForURL('**/forecast*');
    await page.locator('[data-shoot="forecast-modeled-subset"], [data-shoot="forecast-unavailable"]').waitFor();
    assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /1 intelligence proposal staged/);
    check('Forecast retains the Scenario and keeps incomplete coverage qualified');
    await page.locator('[data-shoot="scenario-strip"] a[href^="/scope"]').click();
    await page.waitForURL('**/scope*');
    await page.locator('[data-shoot="reconciliation-scenario-feedback"]').waitFor();
    await page.locator(`[data-proposal-item="${notification.id}"]`).click();
    await focus.waitFor();
    assert.equal(await focus.getByRole('checkbox').first().isChecked(), false);
    assert.match(await focus.innerText(), /6 selected items included in the active Scope Scenario/);
    check('Scope round trip preserves the exact six-ticket selection');
    await focus.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(out, `${name}-scenario.png`) });
    await page.locator('[data-shoot="discard"]').click();
    await page.locator('[data-shoot="reconciliation-scenario-feedback"]').waitFor({ state: 'detached' });
    assert.equal(JSON.stringify(payload), original);
    check('Back to Reality clears the Scenario without mutating accepted inputs');
    await page.setViewportSize({ width: 1280, height: 800 });
    // Scope deliberately keeps a 620px deck inside an outer scroll region.
    // At short heights, use the actual wheel path rather than requiring the
    // entire deck and its explanatory footer to fit above the fold.
    await page.mouse.move(500, 500);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(350);
    const geometry = await page.evaluate(() => {
      const selectors = ['[data-shoot="stage-aligned"]', '[data-shoot="commit-reconciled-scope"]', '[data-shoot="other-project-context-note"]'];
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        controls: selectors.map(s => { const r = document.querySelector(s)!.getBoundingClientRect(); return { s, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }) };
    });
    assert(geometry.scrollWidth <= geometry.width, 'No horizontal overflow');
    assert(geometry.controls.every(r => r.top >= 0 && r.bottom <= geometry.height && r.left >= 0 && r.right <= geometry.width), 'Footer actions and disclosure are reachable by scrolling');
    await page.screenshot({ path: resolve(out, `${name}-compact.png`) });
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-shoot="scope-workspace-scroll"]').evaluate(el => el.scrollTop), 0);
    check('1280×800 footer and source disclosure are reachable; scrolling back restores the release heading');
    assert.deepEqual(writes, []);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    check('No accepted-data writes, external requests, unexpected reads or browser errors; proposal POST is mocked');
    results.push({ browser: name, status: 'PASS', checks, geometry, mockedProposalRequests });
  } catch (error) {
    await page.screenshot({ path: resolve(out, `${name}-failure.png`) });
    writeFileSync(resolve(out, `${name}-failure.json`), JSON.stringify({ checks, writes, unexpected, errors, error: String(error), text: await page.locator('body').innerText() }, null, 2), { mode: 0o600 });
    throw error;
  } finally { await browser.close(); }
}
const report = { status: 'PASS', boundary: 'Local built UI with captured production read models and locally recompiled proposals. No database persistence or live-report signoff.', results };
writeFileSync(resolve(out, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
