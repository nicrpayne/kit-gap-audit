import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { provisionalFixture, provisionalModel } from "./lib/provisional-fixture";

const base = process.env.SIGNAL_PROOF_URL ?? "http://127.0.0.1:4397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only a disposable local test server is allowed");
const out = resolve(process.argv[2] ?? "../outputs/provisional-forecast-2026-10-27/browser");
mkdirSync(out, { recursive: true });
const results: unknown[] = [];

async function main() {
  for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const data = provisionalFixture(), scope = data.scopes[0];
    const sid = scope.scopeId;
    // This password is only for the explicitly isolated local process.
    const login = await context.request.post(`${base}/api/login`, { data: { password: "local-provisional-proof" } });
    assert.equal(login.status(), 200);
    if (engineName === "webkit") await context.addCookies((await context.cookies()).map(cookie => ({ ...cookie, secure: false })));
    const errors: string[] = [], unexpected: string[] = [], checks: string[] = [];
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") { unexpected.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: "No persistent writes allowed in this fixture" } }); }
      if (url.pathname === "/api/instrument/project") return route.fulfill({ json: data });
      if (url.pathname === "/api/version") return route.fulfill({ json: { shortCommit: "local-provisional-proof" } });
      if (url.pathname === "/api/scopes") return route.fulfill({ json: { scopes: data.scopes.map(row => ({ id: row.scopeId, name: row.name })) } });
      if (url.pathname === "/api/reports") return route.fulfill({ json: { reports: [] } });
      if (url.pathname === "/api/scenarios") return route.fulfill({ json: { scenarios: [] } });
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
      await page.goto(`${base}/forecast?project=${sid}`);
      await page.getByRole("button", { name: "Try including 2 unclassified tickets" }).waitFor();
      const realityDate = await dateReadout().innerText();
      assert.match(await counts().innerText(), /2 still unclassified/);
      checks.push("Reality view shows a qualified subset date and a useful next action");
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
      await page.getByText("SCENARIO PREVIEW REFUSED", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Download provisional brief", exact: true }).count(), 0);
      checks.push("Changed source inputs after reload refuse the stale Scenario instead of exporting old results");
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      checks.push("No browser errors and no persistent writes escaped the fixture");
      results.push({ engine: engineName, passed: true, checks, realityDate, scenarioDate });
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
