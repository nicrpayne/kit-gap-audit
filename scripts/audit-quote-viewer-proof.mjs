import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const host = readFileSync('public/audit-rubric-phase2/phase2-host.js', 'utf8');
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<input id="brain-search"><div id="brain-results"></div>
      <div id="brain-card" style="display:block"><div class="card-actions"><button class="act" data-act="view">View here</button></div></div>
      <div id="brain-viewer"><div class="v-title"></div><div class="v-path"></div><button class="v-close">Close</button><div class="v-body"></div></div>`);
    const passage = { id: 'passage:frozen-A:quote-1', canonicalId: 'passage:frozen-A:quote-1', kind: 'passage', sourceRef: 'ke://source/transcript/2026-09-22_KE-Refinement', attributes: { excerpt: 'We have <three> days left.\n<script>throw new Error("injected")</script>', surroundingContext: 'This is remaining work, not total effort.' }, connections: [] };
    await page.evaluate(n => {
      window.BrainCore = { S: { sel: n, byId: new Map([[n.id, n]]), meta: {}, cam: { x: 0, y: 0, k: 1 } }, toast() {}, select() {} };
    }, passage);
    await page.addScriptTag({ content: host });
    await page.getByText('View here', { exact: true }).click();
    const viewer = page.locator('#brain-viewer');
    assert.equal(await viewer.locator('blockquote').textContent(), passage.attributes.excerpt);
    assert((await viewer.innerText()).includes('2026-09-22'));
    assert((await viewer.innerText()).includes('KE Refinement'));
    assert((await viewer.innerText()).includes(passage.sourceRef));
    assert((await viewer.innerText()).includes(passage.attributes.surroundingContext));
    assert.equal(await viewer.locator('script').count(), 0, 'Quote content is inert text');
    assert.equal(await viewer.getByRole('link').count(), 0, 'Do not invent a browser link for ke://');
    await viewer.locator('summary').click();
    assert((await viewer.innerText()).includes(passage.canonicalId));
    await page.evaluate(() => { window.BrainCore.S.sel = { id: 'different', canonicalId: 'different', kind: 'intel' }; document.body.appendChild(document.createElement('i')); });
    assert.equal(await viewer.locator('.v-path').innerText(), passage.sourceRef, 'Background selection must not relabel the captured quote');
    await page.evaluate(() => { window.BrainCore.S.sel = { id: 'passage:B:quote-1', canonicalId: 'passage:B:quote-1', kind: 'passage', sourceRef: 'source:undated', sourceResolver: 'javascript:alert(1)', attributes: { excerpt: 'A different exact quote.' }, connections: [] }; });
    await page.getByText('View here', { exact: true }).click();
    assert.equal(await viewer.locator('blockquote').innerText(), 'A different exact quote.');
    assert((await viewer.innerText()).includes('Conversation date not supplied'));
    assert((await viewer.innerText()).includes('full conversation text was not supplied'));
    assert(!(await viewer.innerText()).includes('2026-09-22'), 'No previous-quote metadata leaks');
    assert.equal(await viewer.getByRole('link').count(), 0, 'Unsafe source schemes are refused');
    await page.evaluate(() => { window.BrainCore.S.sel.sourceResolver = 'https://example.test/conversation#quote-1'; });
    await page.getByText('View here', { exact: true }).click();
    assert.equal(await viewer.getByRole('link', { name: 'Open original source' }).getAttribute('href'), 'https://example.test/conversation#quote-1');
    assert.equal(await viewer.getByRole('link').getAttribute('rel'), 'noopener noreferrer');
    await page.evaluate(() => { window.BrainCore.S.sel = { id: 'passage:C:quote-1', canonicalId: 'passage:C:quote-1', kind: 'passage', sourceRef: 'ke://source/transcript/2026-08-18-Harbor-Sync.txt', attributes: { excerpt: 'An older statement, recently retrieved.', sourceDate: '2026-08-17', observedAt: '2026-10-08', anchor: { charStart: 0, charEnd: 27, offsetUnit: 'unicode_code_points', quoteHash: 'producer-hash' } }, connections: [] }; });
    await page.getByText('View here', { exact: true }).click();
    assert((await viewer.innerText()).includes('Source date supplied with quote: 2026-08-17'));
    assert(!(await viewer.innerText()).includes('Conversation date in source reference: 2026-08-18'), 'Explicit source date takes precedence over filename');
    assert(!(await viewer.innerText()).includes('2026-10-08'), 'Retrieval date never becomes conversation date');
    await viewer.locator('summary').click();
    assert((await viewer.innerText()).includes('"charStart": 0'));
    assert((await viewer.innerText()).includes('producer-hash'));
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine}: exact safe quote, readable conversation/date/reference, frozen identity, context and missing-data honesty, safe original link`);
  } finally { await browser.close(); }
}
