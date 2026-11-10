import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { currentWorkFixture, provisionalFixture, provisionalModel } from "./lib/provisional-fixture";
import { summarizeSavedScenarioLevers, type SavedScenarioDetail } from "../lib/scenario/saved";

const base = process.env.SIGNAL_PROOF_URL ?? "http://127.0.0.1:4397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only a disposable local test server is allowed");
const out = resolve(process.argv[2] ?? "../outputs/provisional-forecast-2026-10-27/browser");
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
const currentWork = process.env.SIGNAL_PROOF_CURRENT_WORK === "1";

async function main() {
  for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const data = currentWork ? currentWorkFixture() : provisionalFixture(), scope = data.scopes[0];
    const sid = scope.scopeId;
    // This password is only for the explicitly isolated local process.
    const login = await context.request.post(`${base}/api/login`, { headers: { origin: new URL(base).origin }, data: { password: "local-provisional-proof" } });
    assert.equal(login.status(), 200);
    if (engineName === "webkit") await context.addCookies((await context.cookies()).map(cookie => ({ ...cookie, secure: false })));
    const errors: string[] = [], unexpected: string[] = [], checks: string[] = [];
    // Persistence is deliberately in-memory in this UI proof. Real DB retries
    // are covered separately; no save may fall through to a live service.
    let savedScenario: SavedScenarioDetail | null = null;
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/scenarios" && request.method() === "POST") {
        const body = request.postDataJSON();
        savedScenario = { id: "fictional-saved-scenario", name: body.name, payload: body.payload, baseline: body.baseline,
          revision: 1, status: "active", freshness: { state: "current", stale: false, differences: [] },
          levers: summarizeSavedScenarioLevers(body.payload), createdAt: data.startDate, updatedAt: data.startDate,
          archivedAt: null, archiveReason: null };
        return route.fulfill({ json: { scenario: savedScenario } });
      }
      if (url.pathname === "/api/scenarios/fictional-saved-scenario" && request.method() === "GET") return route.fulfill({ json: { scenario: savedScenario } });
      if (currentWork && request.method() === "POST" && /\/api\/scopes\/[^/]+\/proposal$/.test(url.pathname)) return route.fulfill({ json: { proposal: null } }); // Explicitly intercepted composition request; never reaches a DB.
      if (request.method() !== "GET") { unexpected.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: "No persistent writes allowed in this fixture" } }); }
      if (url.pathname === "/api/instrument/project") return route.fulfill({ json: data });
      if (currentWork && url.pathname === "/api/portfolio/inputs") return route.fulfill({ json: { ...data, reconciliations: [] } });
      if (url.pathname === "/api/version") return route.fulfill({ json: { shortCommit: "local-provisional-proof" } });
      if (url.pathname === "/api/scopes") return route.fulfill({ json: { scopes: data.scopes.map(row => ({ id: row.scopeId, name: row.name })) } });
      if (url.pathname === "/api/reports") return route.fulfill({ json: { reports: [] } });
      if (url.pathname === "/api/scenarios") return route.fulfill({ json: { scenarios: savedScenario ? [savedScenario] : [], freshnessWarning: null } });
      if (url.pathname === "/api/decisions") return route.fulfill({ json: { decisions: [], candidates: [], scopes: data.scopes.map(row => ({ id: row.scopeId, name: row.name, targetDate: row.targetDate })) } });
      if (url.pathname === "/api/audit/knowledge") return route.fulfill({ json: { knowledge: { lastPackageAt: null, evidenceObservedAt: { oldest: null, newest: null }, latestRun: null } } });
      if (url.pathname === "/api/timeline") return route.fulfill({ json: {
        lanes: data.scopes.map(({ scopeId, name, targetDate, dependsOnScopeIds }) => ({ scopeId, name, targetDate, dependsOnScopeIds })),
        entries: [], snapshotsByScope: {}, candidates: [], now: data.startDate,
        rangeStart: "2026-10-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z",
      } });
      if (url.pathname === "/api/forecast") {
        const source = data.scopes.find(row => row.scopeId === url.searchParams.get("scopeId"))!;
        return route.fulfill({ json: { ...provisionalModel(data).baseline!.get(source.scopeId), forecastSource: source.forecastSource, forecastCoverage: source.forecastCoverage } });
      }
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: "Unexpected request in fictional proof" } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
    const dateReadout = () => page.locator('[data-shoot="modeled-subset-outcome"] .i-readout');
    const counts = () => page.locator('[data-shoot="provisional-coverage-counts"]');
    try {
      if (currentWork) {
        await page.goto(`${base}/forecast?project=${sid}`);
        await counts().filter({ hasText: "2 ungrouped tickets included by assumption" }).waitFor();
        await page.waitForFunction(() => document.querySelector('[data-shoot="modeled-subset-outcome"] .i-readout')?.textContent !== "—");
        const realityDate = await dateReadout().innerText();
        assert.match(await counts().innerText(), /3 tickets modeled/);
        assert.match(await counts().innerText(), /1 classified out\/later/);
        assert.match(await page.locator('[data-shoot="modeled-subset-outcome"]').innerText(), /% of simulations meet it under these assumptions/);
        const ungrouped = page.locator('[data-shoot="ungrouped-planning-work"]');
        assert.equal(await ungrouped.getByRole("button").count(), 2);
        assert.doesNotMatch(await ungrouped.innerText(), /Later analytics/);
        assert.equal(await page.getByRole("button", { name: /Try including/ }).count(), 0);
        checks.push("A date and conditional target percentage appear immediately; both ungrouped tickets count and explicit out/later does not");
        await page.screenshot({ path: resolve(out, `${engineName}-current-work-1440.png`), fullPage: true });
        await ungrouped.getByRole("button", { name: "Try deferring Upload reuse integration" }).focus();
        await page.keyboard.press("Enter");
        await counts().filter({ hasText: "1 ungrouped tickets included by assumption" }).waitFor();
        await page.waitForFunction(() => !(Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Download provisional brief") as HTMLButtonElement)?.disabled);
        const scenarioDate = await dateReadout().innerText();
        assert.notEqual(scenarioDate, realityDate);
        assert.match(await counts().innerText(), /2 tickets modeled/);
        assert.match(await counts().innerText(), /Accepted Reality: 2 unclassified/);
        checks.push("Keyboard deferral changes the Scenario date and counts without reclassifying accepted Reality");

        await page.getByRole("link", { name: "Control Room", exact: true }).click();
        const planningLink = page.locator('[data-shoot="provisional-planning-link"]');
        await planningLink.filter({ hasText: "1 ungrouped, included by assumption" }).waitFor();
        assert((await planningLink.innerText()).includes(scenarioDate));
        assert.doesNotMatch(await page.locator('[data-shoot="cr-card-outcome"]').innerText(), /INCOMPLETE/);
        assert.match(await page.locator('[data-shoot="cr-card-outcome"]').innerText(), /%/);
        await page.screenshot({ path: resolve(out, `${engineName}-control-room-current-work.png`), fullPage: true });
        await planningLink.getByRole("link", { name: "Open provisional planning →" }).click();
        await counts().waitFor(); await page.reload();
        await dateReadout().filter({ hasText: scenarioDate }).waitFor();
        checks.push("Control Room uses the same Scenario date and percentage; navigation and reload retain the exact deferral");

        await page.getByRole("link", { name: "Portfolio", exact: true }).click();
        const channel = page.locator(`[data-shoot="channel-${sid}"]`);
        await channel.waitFor();
        await channel.locator('[data-shoot="channel-date"]').filter({ hasText: /\d/ }).waitFor();
        assert.equal(await channel.getAttribute("data-forecast-coverage"), "forecastable");
        assert.match(await channel.innerText(), /assumptions/);
        assert.doesNotMatch(await channel.innerText(), /unavailable/i);
        const inspector = page.getByRole("complementary", { name: new RegExp(`${scope.name} detail`) });
        assert.match(await inspector.innerText(), /100% by Nov 15/);
        assert.doesNotMatch(await inspector.innerText(), /Target confidence unavailable/);
        assert.match(await page.locator("body").innerText(), /Portfolio planning date/i);
        const bar = page.locator('[data-shoot="scenario-bar"]');
        await bar.getByText("Scenario · unsaved", { exact: true }).waitFor();
        await page.locator('[data-shoot="saved-scenarios-open"]').click();
        const library = page.getByRole("dialog", { name: "Saved Scenarios", exact: true });
        await library.getByLabel("Scenario name", { exact: true }).fill("Fictional saved label check");
        await library.getByRole("button", { name: "Save Scenario", exact: true }).click();
        await library.getByText(/Saved “Fictional saved label check”/).waitFor();
        await library.getByRole("button", { name: "Close Saved Scenarios" }).click();
        await bar.getByText("Scenario · saved", { exact: true }).waitFor();
        await page.reload();
        await bar.getByText("Scenario · saved", { exact: true }).waitFor();
        await page.locator('[data-shoot="saved-scenarios-open"]').filter({ hasText: " · saved" }).waitFor();
        await page.locator('[data-shoot="saved-scenarios-open"]').click();
        await library.getByRole("button", { name: "Pause Scenario · view Reality", exact: true }).click();
        await bar.getByText("Reality", { exact: true }).waitFor();
        await page.locator('[data-shoot="saved-scenarios-open"]').click();
        await library.getByRole("button", { name: "Open", exact: true }).click();
        await bar.getByText("Scenario · saved", { exact: true }).waitFor();
        await channel.locator('[data-shoot="channel-date"]').filter({ hasText: /\d/ }).waitFor();
        assert.doesNotMatch(await page.locator("body").innerText(), /Recalculating Scenario forecast/);
        checks.push("Portfolio and named library agree: new draft unsaved, saved/reloaded/reopened version saved, paused view Reality");
        await page.screenshot({ path: resolve(out, `${engineName}-portfolio.png`), fullPage: true });
        await page.getByRole("link", { name: "Forecast", exact: true }).click();
        await ungrouped.getByRole("button", { name: /^Try deferring/ }).click();
        await page.getByRole("link", { name: "Portfolio", exact: true }).click();
        await bar.getByText("Scenario · unsaved", { exact: true }).waitFor();
        await page.locator('[data-shoot="saved-scenarios-open"]').filter({ hasText: " · unsaved" }).waitFor();
        await page.reload();
        await bar.getByText("Scenario · unsaved", { exact: true }).waitFor();
        checks.push("Editing an active named Scenario marks both labels unsaved, including after reload");
        await page.locator('[data-shoot="saved-scenarios-open"]').click();
        await library.getByRole("button", { name: "Open", exact: true }).click();
        await library.getByRole("button", { name: "Replace draft", exact: true }).click();
        await bar.getByText("Scenario · saved", { exact: true }).waitFor();
        await page.goto(`${base}/scope?project=${sid}`);
        await page.locator('[data-shoot="scope-coverage-state"]').waitFor();
        assert.match(await page.locator('[data-shoot="scope-coverage-state"]').innerText(), /Planning forecast/i);
        assert.match(await page.locator('[data-shoot="master"]').innerText(), /planning date/i);
        await page.locator('[data-shoot="master"]').filter({ hasText: /Nov 3/i }).waitFor();
        assert.doesNotMatch(await page.locator('[data-shoot="master"]').innerText(), /Recalculating/i);
        await page.screenshot({ path: resolve(out, `${engineName}-scope.png`), fullPage: true });
        await page.getByRole("link", { name: "Timeline", exact: true }).first().click();
        await page.locator(`[data-shoot="memory-likely-${sid}"]`).waitFor();
        assert.doesNotMatch(await page.locator(`[data-shoot="memory-likely-${sid}"]`).innerText(), /Incomplete|Provisional/i);
        await page.getByRole("link", { name: "Decisions", exact: true }).click();
        await page.locator('[data-shoot="decision-status-strip"]').waitFor();
        assert.doesNotMatch(await page.locator('[data-shoot="decision-status-strip"]').innerText(), /not a full-project|incomplete/i);
        await page.getByRole("link", { name: "Forecast", exact: true }).click();
        await dateReadout().filter({ hasText: scenarioDate }).waitFor();
        checks.push("Portfolio, Scope, Timeline and Decisions retain usable planning dates and assumption labels, not an incomplete wall");

        const downloadJson = page.waitForEvent("download"); await page.getByRole("button", { name: "Download captured inputs (JSON)" }).click();
        const json = await downloadJson; const jsonPath = resolve(out, `${engineName}-planning.json`); await json.saveAs(jsonPath);
        const brief = JSON.parse(readFileSync(jsonPath, "utf8"));
        assert.equal(brief.inputs[0].items.length, 2);
        assert.deepEqual(brief.scenario.excludedItemIds, ["DEMO-2"]);
        assert.equal(brief.inputs[0].coverage.workPolicy, "eligible-current-work.v1");
        assert.deepEqual(brief.inputs[0].coverage.assumedIncludedIssueIds, ["DEMO-3"]);
        const downloadHtml = page.waitForEvent("download"); await page.getByRole("button", { name: "Download provisional brief", exact: true }).click();
        const html = await downloadHtml; const htmlPath = resolve(out, `${engineName}-planning.html`); await html.saveAs(htmlPath);
        const reportPage = await context.newPage(); await reportPage.setContent(readFileSync(htmlPath, "utf8"));
        assert.match(await reportPage.locator("body").innerText(), /current eligible work/i);
        await reportPage.getByText("Work, estimate basis and source quotes", { exact: true }).click();
        await reportPage.screenshot({ path: resolve(out, `${engineName}-export.png`), fullPage: true });
        await reportPage.close();
        checks.push("Downloaded HTML and JSON freeze the exact current-work policy, included IDs, estimates and Scenario assumptions");

        await page.setViewportSize({ width: 1024, height: 768 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        await page.screenshot({ path: resolve(out, `${engineName}-current-work-1024.png`), fullPage: true });
        checks.push("Controls remain reachable at 1440 and 1024 widths without horizontal overflow");
        await page.getByRole("link", { name: "Reviewed delivery reports →" }).click();
        await page.getByRole("button", { name: "Generate report", exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Generate report", exact: true }).isDisabled(), false);
        assert.equal(await page.getByRole("button", { name: "Resolve coverage to report", exact: true }).count(), 0);
        checks.push("Reports no longer blocks generation solely because current tickets are ungrouped; no report is saved by this intercepted browser fixture");
        await page.getByRole("link", { name: "Forecast", exact: true }).click();
        await page.getByRole("button", { name: "Restore Upload reuse integration" }).click();
        await counts().filter({ hasText: "2 ungrouped tickets included by assumption" }).waitFor();
        await dateReadout().filter({ hasText: realityDate }).waitFor();
        assert.equal(await dateReadout().innerText(), realityDate);
        checks.push("Restore reproduces the original current-work date without duplicate effort");
        await page.getByRole("button", { name: "Try deferring Upload reuse integration" }).click();
        await counts().filter({ hasText: "1 ungrouped tickets included by assumption" }).waitFor();
        scope.executionItems[1].high = 20;
        scope.realityState.realityRevision = 2; scope.realityState.computedRevision = 2;
        await page.reload(); await page.locator('[data-shoot="scenario-preview-refused"]').waitFor();
        assert.equal(await page.getByRole("button", { name: "Download provisional brief", exact: true }).count(), 0);
        checks.push("New source/revision inputs refuse a stale Scenario and stale export");
        assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
        checks.push("No browser errors, live API reads or persistent writes escaped the fictional test boundary");
        results.push({ engine: engineName, policy: "eligible-current-work.v1", passed: true, checks, realityDate, scenarioDate });
      } else {
      await page.goto(`${base}/forecast?project=${sid}`);
      await page.getByRole("button", { name: "Try including 2 unclassified tickets" }).waitFor();
      const realityDate = await dateReadout().innerText();
      assert.match(await counts().innerText(), /2 still unclassified/);
      checks.push("Reality view shows a qualified subset date and a useful next action");
      await page.getByRole("link", { name: "Control Room", exact: true }).click();
      const planningLink = page.locator('[data-shoot="provisional-planning-link"]');
      await planningLink.filter({ hasText: "2 still unclassified" }).waitFor();
      assert((await planningLink.innerText()).includes(realityDate));
      assert.equal(await page.locator('[data-shoot="cr-card-outcome-primary"]').innerText(), "Provisional");
      await page.screenshot({ path: resolve(out, `${engineName}-control-room-reality.png`), fullPage: true });
      await page.getByRole("link", { name: "Timeline", exact: true }).first().click();
      await page.locator(`[data-shoot="memory-likely-${sid}"]`).filter({ hasText: "Provisional" }).waitFor();
      assert.match(await page.locator(`[data-shoot="memory-detail-${sid}"]`).innerText(), /Selected work only/);
      await page.screenshot({ path: resolve(out, `${engineName}-timeline-reality.png`), fullPage: true });
      await page.getByRole("link", { name: "Control Room", exact: true }).click();
      await planningLink.filter({ hasText: "2 still unclassified" }).waitFor();
      await planningLink.getByRole("link", { name: "Open provisional planning →" }).click();
      await counts().waitFor();
      assert.equal(await dateReadout().innerText(), realityDate);
      checks.push("Control Room shows the same qualified date and counts with a direct Forecast handoff");
      checks.push("Timeline keeps the live subset qualified without changing historical snapshots");
      await page.getByRole("button", { name: "Try including 2 unclassified tickets" }).click();
      const chooser = page.getByRole("region", { name: "Choose provisional work" });
      assert.equal(await chooser.getByRole("checkbox").count(), 2);
      assert(!((await chooser.innerText()).includes("Later analytics")));
      await chooser.getByRole("checkbox").first().focus(); await page.keyboard.press("Space");
      assert.equal(await chooser.getByRole("checkbox").first().isChecked(), false);
      await page.screenshot({ path: resolve(out, `${engineName}-choose-work.png`), fullPage: true });
      await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await dateReadout().innerText(), realityDate);
      checks.push("Cancel does not change the model; out/later work is never offered");
      await page.getByRole("button", { name: "Try including 2 unclassified tickets" }).click();
      await chooser.getByRole("button", { name: "Include 2 tickets in Scenario" }).click();
      await page.waitForFunction(() => document.querySelector('[data-shoot="provisional-coverage-counts"]')?.textContent?.includes("0 still unclassified"));
      await page.getByRole("button", { name: "Download provisional brief", exact: true }).waitFor();
      await page.waitForFunction(() => !(Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Download provisional brief") as HTMLButtonElement)?.disabled);
      const scenarioDate = await dateReadout().innerText(); assert.notEqual(scenarioDate, realityDate);
      assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /2 tickets assumed in/);
      assert.match(await counts().innerText(), /Accepted Reality: 2 unclassified/);
      checks.push("Inclusion changes the actual date and counts without reclassifying Reality");
      await page.getByRole("link", { name: "Control Room", exact: true }).click();
      await planningLink.filter({ hasText: "0 still unclassified" }).waitFor();
      assert((await planningLink.innerText()).includes(scenarioDate));
      assert.match(await planningLink.innerText(), /accepted Reality is unchanged/);
      await page.getByText(/Accepted Reality still needs review:/).waitFor();
      assert.equal(await page.locator('[data-shoot="cr-card-outcome-second"]').innerText(), "100%");
      assert.match(await page.locator('[data-shoot="cr-card-outcome"]').innerText(), /Target frequency/);
      await page.screenshot({ path: resolve(out, `${engineName}-control-room-scenario.png`), fullPage: true });
      await planningLink.getByRole("link", { name: "Open provisional planning →" }).click();
      await counts().waitFor();
      await dateReadout().filter({ hasText: scenarioDate }).waitFor();
      assert.equal(await dateReadout().innerText(), scenarioDate);
      checks.push("Control Room follows Scenario changes and keeps the accepted-data distinction visible");

      const downloadJson = page.waitForEvent("download"); await page.getByRole("button", { name: "Download captured inputs (JSON)" }).click();
      const json = await downloadJson; const jsonPath = resolve(out, `${engineName}-planning.json`); await json.saveAs(jsonPath);
      const brief = JSON.parse(readFileSync(jsonPath, "utf8"));
      assert.equal(brief.status, "provisional"); assert.equal(brief.inputs[0].items.length, 3);
      assert.deepEqual(brief.scenario.includedItemIds, ["DEMO-2", "DEMO-3"]);
      const downloadHtml = page.waitForEvent("download"); await page.getByRole("button", { name: "Download provisional brief", exact: true }).click();
      const html = await downloadHtml; const htmlPath = resolve(out, `${engineName}-planning.html`); await html.saveAs(htmlPath);
      const reportPage = await context.newPage(); await reportPage.setContent(readFileSync(htmlPath, "utf8"));
      assert.match(await reportPage.locator("body").innerText(), /PROVISIONAL/);
      await reportPage.getByText("Work, estimate basis and source quotes", { exact: true }).click();
      await reportPage.screenshot({ path: resolve(out, `${engineName}-export.png`), fullPage: true });
      await reportPage.close();
      checks.push("Browser downloads actual HTML and JSON carrying the matching inputs and qualifications");
      await page.screenshot({ path: resolve(out, `${engineName}-scenario-1440.png`), fullPage: true });
      await page.setViewportSize({ width: 1024, height: 768 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: resolve(out, `${engineName}-scenario-1024.png`), fullPage: true });
      checks.push("1440 and 1024 layouts keep controls reachable without horizontal overflow");

      await page.getByRole("link", { name: "Reviewed delivery reports →" }).click();
      await page.getByRole("link", { name: "Open provisional planning →" }).waitFor();
      assert((await planningLink.innerText()).includes(scenarioDate));
      assert.match(await planningLink.innerText(), /0 still unclassified/);
      await page.getByText(/Scenario assumptions do not change report eligibility/).waitFor();
      assert.equal(await page.getByRole("button", { name: "Resolve coverage to report", exact: true }).isDisabled(), true);
      await page.getByRole("link", { name: "Open provisional planning →" }).click();
      await counts().waitFor(); assert.match(await counts().innerText(), /0 still unclassified/);
      await page.reload(); await counts().waitFor();
      await page.waitForFunction(() => document.querySelector('[data-shoot="modeled-subset-outcome"] .i-readout')?.textContent !== "—");
      assert.equal(await dateReadout().innerText(), scenarioDate);
      checks.push("Reports links back to provisional planning; navigation and reload retain exact assumptions");
      await page.locator('[data-shoot="scope-fictional-other"]').click();
      await counts().waitFor({ state: "hidden" });
      assert.equal(await page.locator('[data-shoot="provisional-coverage-counts"]').count(), 0);
      await page.locator(`[data-shoot="scope-${sid}"]`).click(); await counts().waitFor();
      assert.match(await counts().innerText(), /0 still unclassified/);
      checks.push("Switching projects does not apply these membership assumptions to another project");
      await page.getByText("2 tickets explicitly assumed in — ungrouped work", { exact: true }).click();
      await page.getByRole("button", { name: "Undo inclusion of Upload reuse integration" }).click();
      await page.waitForFunction(() => document.querySelector('[data-shoot="provisional-coverage-counts"]')?.textContent?.includes("1 still unclassified"));
      await page.locator('[data-shoot="discard"]').click();
      await page.waitForFunction(() => document.querySelector('[data-shoot="provisional-coverage-counts"]')?.textContent?.includes("2 still unclassified"));
      assert.equal(await dateReadout().innerText(), realityDate);
      checks.push("Undo removes only one inclusion; Back to Reality restores the original date and census");
      await page.getByRole("button", { name: "Try including 2 unclassified tickets" }).click();
      await chooser.getByRole("button", { name: "Include 2 tickets in Scenario" }).click();
      await counts().filter({ hasText: "0 still unclassified" }).waitFor();
      scope.executionItems[1].high = 20;
      scope.realityState.realityRevision = 2; scope.realityState.computedRevision = 2;
      await page.reload();
      await page.locator('[data-shoot="scenario-preview-refused"]').waitFor();
      assert.equal(await page.getByRole("button", { name: "Download provisional brief", exact: true }).count(), 0);
      checks.push("Changed source inputs after reload refuse the stale Scenario instead of exporting old results");
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      checks.push("No browser errors and no persistent writes escaped the fixture");
      results.push({ engine: engineName, passed: true, checks, realityDate, scenarioDate });
      }
    } catch (error) {
      await page.screenshot({ path: resolve(out, `${engineName}-failure.png`), fullPage: true });
      writeFileSync(resolve(out, "failure.json"), JSON.stringify({ engineName, checks, error: String(error), errors, unexpected, text: await page.locator("body").innerText() }, null, 2));
      throw error;
    } finally { await browser.close(); }
  }
  writeFileSync(resolve(out, "result.json"), JSON.stringify({ passed: true, boundary: "Local production build; fictional intercepted APIs; no live project writes, private publication or real-business forecast signoff", results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
