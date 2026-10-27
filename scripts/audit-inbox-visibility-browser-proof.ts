import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { provisionalFixture } from "./lib/provisional-fixture";

// Real application UI, fictional intercepted data. No production host, source
// refresh, proposal disposition, or database writes are permitted.
const base = process.env.SIGNAL_PROOF_URL ?? "http://127.0.0.1:4397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = resolve(process.argv[2] ?? "../outputs/audit-inbox-visibility-2026-10-27/browser");
mkdirSync(out, { recursive: true });
const data = provisionalFixture();
const scopes = data.scopes.map(row => ({ id: row.scopeId, name: row.name }));
const sid = scopes[0].id, other = scopes[1].id;
const knowledge = {
  code: "current", label: "Knowledge synchronized", detail: "Fictional proof only", checkedAt: "2026-10-27T12:00:00Z",
  canRefresh: true, companion: null, lastPackageAt: "2026-10-27T12:00:00Z", lastAuditAt: "2026-10-27T12:00:00Z",
  evidenceObservedAt: { oldest: null, newest: null }, activeJob: null, latestRun: null,
};
const proposal = (scopeId: string, index: number) => ({
  id: `${scopeId}-${index}`, category: "decision", owner: "decisions", changeType: "add",
  title: `Fictional ${scopeId} choice ${index}`, summary: "A fictional release choice for display-only testing.",
  whyProposed: "Fictional source", currentState: {}, proposedState: { findingId: `finding-${scopeId}-${index}` },
  evidence: [{ id: "fictional-quote", excerpt: "We still need to agree the release boundary.", kind: "transcript", sourceRef: "fictional-transcript", observedAt: "2026-10-27T12:00:00Z" }],
  currentness: "current", retrievalBasis: "synthetic", retrievalConfidence: "strong", forecastEffect: null,
  relevanceClass: "project_local", relevanceReason: "Fictional proof", sourceKind: "knowledge", recommendedAction: "review",
  targetHref: null, completionRequirements: [], status: "pending", dispositionReason: null, canonicalObjectType: null,
  canonicalObjectId: null, acceptedAt: null, canReview: true, supersededByProposalId: null, reviewReason: null,
});
const results: unknown[] = [];

async function main() {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
    const browser = await engine.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const login = await context.request.post(`${base}/api/login`, { data: { password: "local-provisional-proof" } });
    assert.equal(login.status(), 200);
    if (name === "webkit") await context.addCookies((await context.cookies()).map(cookie => ({ ...cookie, secure: false })));
    const checks: string[] = [], writes: string[] = [], unknown: string[] = [], errors: string[] = [];
    let count = 1, reads = 0;
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      // Isolate the inbox; the existing graph engine is outside this proof.
      if (url.pathname === "/audit/rubric-phase3") return route.fulfill({ contentType: "text/html", body: `<!doctype html><body style="background:#090d10;color:#aaa;font:18px sans-serif;padding:320px 40px"><h1>Fictional Audit world</h1><p>No real project data.</p><output id="trace"></output><script>
        const scope = new URL(location.href).searchParams.get('scope');
        parent.postMessage({type:'signal-audit-world-ready',scope},location.origin);
        addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data.type==='signal-audit-set-context')parent.postMessage({type:'signal-audit-world-updated',scope:e.data.scope},location.origin);if(e.data.type==='signal-audit-trace-canonical')document.querySelector('#trace').textContent=e.data.canonicalId;});
      </script></body>` });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") { writes.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: "Writes forbidden" } }); }
      if (url.pathname === "/api/instrument/project") return route.fulfill({ json: data });
      if (url.pathname === "/api/version") return route.fulfill({ json: { shortCommit: "inbox-proof" } });
      if (url.pathname === "/api/scopes") return route.fulfill({ json: { scopes } });
      if (url.pathname === "/api/scenarios") return route.fulfill({ json: { scenarios: [] } });
      if (url.pathname === "/api/audit/rubric" && url.searchParams.get("mode") === "context") return route.fulfill({ json: { scopes, scope: scopes.find(row => row.id === url.searchParams.get("scope")) ?? scopes[0], audits: [] } });
      if (url.pathname === "/api/audit/knowledge") return route.fulfill({ json: { knowledge } });
      if (url.pathname === "/api/audit/changes") {
        reads++;
        const scopeId = url.searchParams.get("scopeId") ?? sid;
        return route.fulfill({ json: {
          knowledge, counts: { decision: count }, total: count, proposals: Array.from({ length: count }, (_, i) => proposal(scopeId, i + 1)),
          sourceHealth: { hermes: "current", linear: "current", linearDetail: "Fictional proof", notion: "current", figma: "current", companion: "online", lastPackageAt: null, lastAuditAt: null },
          readiness: { ready: false, label: "Review delivery inputs", blockers: [{ code: "decision", label: "Review the fictional choice", targetHref: `/decisions?project=${scopeId}` }] },
          baseline: { seeded: 0, available: true },
        } });
      }
      unknown.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: "Unexpected fixture request" } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    const panel = page.getByRole("complementary", { name: "Audit Change Inbox" });
    const review = page.getByRole("button", { name: /Review Audit changes/ });
    const hide = page.getByRole("button", { name: "Hide inbox", exact: true });
    const mark = (text: string) => { checks.push(text); console.log(`${name}: ${text}`); };
    const recheck = async () => {
      const previous = reads;
      await page.getByRole("button", { name: "Audit actions", exact: true }).click();
      await page.getByRole("button", { name: /Re-check current snapshot/ }).click();
      await review.filter({ hasText: String(count) }).waitFor();
      await page.waitForLoadState("networkidle");
      assert(reads > previous, "Snapshot recheck fetched new inbox data");
      await page.getByRole("button", { name: "Dismiss refresh notice" }).click();
    };
    try {
      await page.goto(`${base}/audit?project=${sid}`);
      await hide.waitFor(); await page.waitForLoadState("networkidle");
      await page.screenshot({ path: resolve(out, `${name}-open.png`), animations: "disabled" });
      await hide.click(); await panel.waitFor({ state: "detached" });
      assert.equal(await review.getAttribute("aria-expanded"), "false");
      assert(await review.evaluate(el => el === document.activeElement));
      assert.match(await review.innerText(), /1/);
      mark("Obvious Hide inbox closes the panel, returns focus, and keeps the pending count");
      count = 2; await recheck();
      assert.equal(await panel.count(), 0);
      mark("A refreshed inbox with additional findings stays hidden; count updates");
      await page.reload(); await review.filter({ hasText: "2" }).waitFor(); await page.waitForLoadState("networkidle");
      assert.equal(await panel.count(), 0);
      mark("Hidden state survives full reload in this tab");
      await review.click(); await hide.waitFor();
      assert.equal(await review.getAttribute("aria-expanded"), "true");
      await panel.getByRole("button", { name: /Fictional fictional-project choice 1/ }).click();
      await panel.getByRole("heading", { name: "Fictional fictional-project choice 1" }).waitFor();
      await hide.focus(); await page.keyboard.press("Escape"); await panel.waitFor({ state: "detached" });
      assert(await review.evaluate(el => el === document.activeElement));
      mark("Review Audit changes reopens unchanged findings; Escape closes and restores focus");
      await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(other);
      await hide.waitFor(); await panel.getByRole("button", { name: /Fictional fictional-other choice 1/ }).waitFor();
      await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(sid);
      await page.waitForLoadState("networkidle");
      assert.equal(await panel.count(), 0);
      mark("Hiding is project-specific and retained when switching back");
      await page.getByRole("button", { name: "Audit actions", exact: true }).click();
      await page.getByRole("button", { name: "Source health", exact: true }).click();
      await hide.waitFor(); await panel.getByText("SYNC IS NOT EVIDENCE AGE", { exact: true }).waitFor();
      await recheck();
      await panel.getByText("SYNC IS NOT EVIDENCE AGE", { exact: true }).waitFor();
      mark("Explicit Source health still opens; refresh does not hijack its selected tab");
      await page.getByRole("button", { name: "Audit actions", exact: true }).click();
      await page.getByRole("button", { name: "How to add evidence", exact: true }).click();
      await page.getByRole("dialog", { name: "How to add evidence" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "How to add evidence" }).waitFor({ state: "detached" });
      assert(await panel.isVisible());
      mark("Escape closes the foreground modal without also hiding the inbox");
      await panel.getByRole("button", { name: "Changes", exact: true }).click();
      await panel.getByRole("button", { name: /Fictional fictional-project choice 1/ }).click();
      await panel.getByRole("button", { name: "Trace in world", exact: true }).click();
      await panel.waitFor({ state: "detached" });
      await page.frameLocator('iframe[title="Signal Audit World"]').getByText(`finding-${sid}-1`, { exact: true }).waitFor();
      mark("Trace in world hides the inbox and preserves the canonical finding handoff");
      // Navigation away and back must not reopen the inbox.
      await page.goto(`${base}/login`); await page.goBack(); await review.waitFor(); await page.waitForLoadState("networkidle");
      assert.equal(await panel.count(), 0);
      await review.click(); await hide.waitFor();
      await page.setViewportSize({ width: 1024, height: 768 });
      const bounds = await hide.boundingBox(); assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1024 && bounds.y + bounds.height <= 768);
      await page.screenshot({ path: resolve(out, `${name}-1024.png`), animations: "disabled" });
      await hide.click(); await panel.waitFor({ state: "detached" });
      await page.screenshot({ path: resolve(out, `${name}-hidden.png`), animations: "disabled" });
      mark("Navigation preserves the preference; hide and reopen remain reachable at 1024px");
      // A deep link must prioritize evidence even when the inbox was reopened.
      await review.click(); await hide.waitFor();
      await page.goto(`${base}/audit?project=${sid}&select=finding:fictional-evidence`);
      await review.waitFor(); await page.waitForLoadState("networkidle"); assert.equal(await panel.count(), 0);
      await review.click(); await hide.waitFor();
      mark("Evidence deep links take priority while explicit inbox reopening remains available");
      // Simulate blocked browser storage without involving real credentials/data.
      await page.addInitScript(() => { Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Fixture storage denied", "SecurityError"); } }); });
      await page.goto(`${base}/audit?project=${sid}`); await hide.waitFor();
      await hide.click(); await panel.waitFor({ state: "detached" }); await recheck(); assert.equal(await panel.count(), 0);
      await review.click(); await hide.waitFor(); await hide.click();
      mark("Storage denial degrades safely: hide/reopen/refresh still work within the page");
      assert.deepEqual(writes, []); assert.deepEqual(unknown, []); assert.deepEqual(errors, []);
      mark("Zero persistent requests, unexpected APIs, or browser exceptions");
      results.push({ engine: name, passed: true, checks, writes, unknown, errors });
    } catch (error) {
      await page.screenshot({ path: resolve(out, `${name}-failure.png`) });
      results.push({ engine: name, passed: false, checks, writes, unknown, errors, error: String(error) }); throw error;
    } finally {
      writeFileSync(resolve(out, "result.json"), JSON.stringify({ boundary: "Local build, fictional intercepted API responses, isolated graph stub. Not deployment or business acceptance.", results }, null, 2));
      await context.close(); await browser.close();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
