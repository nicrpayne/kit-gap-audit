import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

/** Called only inside the guarded disposable report DB proof. No API mocking. */
export async function proveReportWorkflowInBrowser(scopeId: string, fixture: { rollupCapabilityId: string; optionalCapabilityId: string; excludedItemId: string }) {
  assert.equal(process.env.REPORTS_DB_PROOF, "1");
  assert.equal(process.env.SIGNAL_REPORT_BROWSER_PROOF, "1");
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1");
  assert.match(database.pathname, /^\/signal_t0_test_\d+$/);
  assert.equal(process.env.KIT_DEV_FIXTURES, "1");
  assert(!process.env.LINEAR_API_KEY);
  const base = "http://127.0.0.1:4321";
  const output = resolve("../signal-acceptance-2026-09-25/repair-execution/saved-pair-browser");
  await mkdir(output, { recursive: true });
  try {
    await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(800) });
    throw new Error("Refusing to use occupied browser-proof port 4321");
  } catch (error) {
    if (error instanceof Error && /occupied/.test(error.message)) throw error;
  }
  const serverMode = process.env.SIGNAL_REPORT_PRODUCTION_SERVER === "1" ? "start" : "dev";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", serverMode, "--hostname", "127.0.0.1", "--port", "4321"], {
    env: { ...process.env, APP_PASSWORD: "signal-local-only", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => { serverLog += String(chunk); });
  server.stderr.on("data", (chunk) => { serverLog += String(chunk); });
  const browser = await chromium.launch({ headless: true });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`Local server exited: ${serverLog}`);
      try { ready = (await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(ready, "local server became ready");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    assert.equal((await context.request.post(`${base}/api/login`, { data: { password: "signal-local-only" } })).status(), 200);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${base}/portfolio?project=${scopeId}`);
    const fader = page.locator(`[data-shoot="fader-${scopeId}"]`);
    await fader.waitFor();
    assert.equal(Number(await fader.getAttribute("aria-valuenow")), 1);
    await fader.focus();
    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForFunction((id) => Number(document.querySelector(`[data-shoot="fader-${id}"]`)?.getAttribute("aria-valuenow")) < 1, scopeId);
    const scenarioFte = Number(await fader.getAttribute("aria-valuenow"));
    assert(scenarioFte > 0 && scenarioFte < 1);
    await page.screenshot({ path: `${output}/01-capacity-scenario.png`, fullPage: true });
    // Use the actual rail links: full page reload would deliberately reset the private Scenario.
    await page.locator('a[href^="/scope"]').first().click();
    await page.waitForURL(/\/scope/);
    await page.getByText("Scope composer", { exact: false }).first().waitFor();
    assert.match(await page.locator("body").innerText(), /scenario/i);
    await page.locator(`[data-capability="capability:${fixture.optionalCapabilityId}"]`).click();
    await page.locator('[data-shoot="detail-toggle"]').click();
    await page.getByRole("button", { name: "Keep hypothetical", exact: true }).click();
    const detail = page.locator('[data-shoot="feature-detail"]');
    if (await detail.isVisible()) await detail.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator(`[data-capability="capability:${fixture.rollupCapabilityId}"]`).click();
    await page.locator('[data-shoot="mode-estimate"]').click();
    await page.locator('[data-shoot="tune-estimate"]').first().click();
    await page.getByLabel("Ticket estimate low").fill("1");
    await page.getByLabel("Ticket estimate likely").fill("2");
    await page.getByLabel("Ticket estimate high").fill("3");
    await page.getByRole("button", { name: "Apply ticket estimate to Scenario", exact: true }).click();
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await page.screenshot({ path: `${output}/02-scope-scenario.png`, fullPage: true });
    await page.locator('a[href^="/forecast"]').first().click();
    await page.waitForURL(/\/forecast/);
    await page.screenshot({ path: `${output}/03-forecast-scenario.png`, fullPage: true });
    await page.locator('a[href^="/reports"]').first().click();
    await page.waitForURL(/\/reports/);
    const generate = page.getByRole("button", { name: "Generate Reality + Scenario", exact: true });
    await generate.waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "Generate Reality + Scenario" && !button.disabled));
    const post = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/reports" && response.request().method() === "POST");
    await generate.click();
    const response = await post;
    const saved = await response.json();
    await writeFile(`${output}/response.json`, JSON.stringify(saved, null, 2));
    assert.equal(response.status(), 200, JSON.stringify(saved));
    assert.equal(saved.reality.brief.movable.capacity.value.forecastEffectiveFte, 1);
    assert.equal(saved.scenario.brief.movable.capacity.value.forecastEffectiveFte, scenarioFte,
      "the persisted Scenario uses the exact capacity selected on the call");
    assert.equal(saved.scenario.brief.movable.capacity.value.availability, "available");
    assert.equal(saved.scenario.brief.movable.capacity.value.namedRawFte, scenarioFte);
    assert.equal(saved.scenario.brief.movable.capacity.value.namedEffectiveFte, scenarioFte);
    assert.equal(saved.scenario.brief.movable.scope.value.executableItemCount, 10);
    assert.equal(saved.scenario.brief.movable.scope.value.simulationItemCount, 9);
    const scenarioDate = Date.parse(`${saved.scenario.brief.headline.likelyWindow.value.likely}T00:00:00.000Z`);
    for (const option of saved.scenario.brief.movable.scenarioOptions.value) {
      assert.equal(Math.round((Date.parse(`${option.likelyDate}T00:00:00.000Z`) - scenarioDate) / 86_400_000), option.deltaDays);
    }
    assert.notDeepEqual(saved.scenario.brief.movable.scenarioOptions.value, saved.reality.brief.movable.scenarioOptions.value);
    assert.match(saved.scenario.report.summaryMarkdown, /9 simulated estimate-basis items/);
    assert.match(saved.scenario.report.summaryMarkdown, /10 tracked source tickets/);
    assert.match(saved.scenario.report.summaryMarkdown, /0\.5 effective Forecast FTE/);
    assert.doesNotMatch(saved.scenario.report.summaryMarkdown, /Named Capacity unavailable/i);
    assert.equal(saved.reality.brief.identity.comparisonId, saved.scenario.brief.identity.comparisonId);
    assert.equal(saved.reality.brief.identity.generatedAt, saved.scenario.brief.identity.generatedAt);
    assert(saved.scenario.report.scenarioSnapshot.excludedCapabilityIds.includes(fixture.optionalCapabilityId));
    assert(saved.scenario.report.scenarioSnapshot.excludedItemIds.includes(fixture.excludedItemId));
    assert(Object.values(saved.scenario.report.scenarioSnapshot.estimateOverrideByItemId as Record<string, { low: number; likely: number; high: number }>).some((value) => value.low === 1 && value.likely === 2 && value.high === 3),
      "the combined estimate lever is frozen alongside scope and capacity");
    assert.notDeepEqual(saved.reality.brief.headline.likelyWindow.value, saved.scenario.brief.headline.likelyWindow.value,
      "changing capacity moves the saved forecast");
    await page.getByRole("region", { name: "Reality versus Scenario comparison" }).waitFor();
    await page.screenshot({ path: `${output}/04-persisted-comparison.png`, fullPage: true });
    // Return values are discovered from the actual API response, never guessed URLs/IDs.
    const halves = [saved.reality, saved.scenario];
    for (let index = 0; index < halves.length; index++) {
      const half = halves[index];
      assert(half?.report?.id, `paired response has report id: ${JSON.stringify(Object.keys(saved))}`);
      const print = await context.newPage();
      const printResponse = await print.goto(`${base}/reports/${encodeURIComponent(half.report.id)}/print`, { waitUntil: "networkidle" });
      assert.equal(printResponse?.status(), 200);
      await print.evaluate(() => document.fonts.ready);
      assert.match(await print.locator("body").innerText(), /four to eight developer days/);
      const mode = index === 0 ? "reality" : "scenario";
      await print.pdf({ path: `${output}/${mode}.pdf`, format: "A4", printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }, displayHeaderFooter: true,
        headerTemplate: '<div style="font-size:8px;width:100%;text-align:center">SYNTHETIC LOCAL PROJECT - saved report acceptance test</div>',
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
      await print.close();
    }
    await page.locator('a[href^="/portfolio"]').first().click();
    await fader.waitFor();
    assert.equal(Number(await fader.getAttribute("aria-valuenow")), scenarioFte, "capacity survived Scope, Forecast, Reports and back");
    await page.reload();
    await fader.waitFor();
    assert.equal(Number(await fader.getAttribute("aria-valuenow")), 1, "reload returns accepted Reality");
    assert.deepEqual(pageErrors, []);
    if (process.env.SIGNAL_SCOPE_BROWSER_PROOF === "1") {
      const proof = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/scope-v2-browser-proof.ts"], {
        env: { ...process.env, SIGNAL_PROOF_URL: base, SIGNAL_PROOF_PASSWORD: "signal-local-only" }, stdio: "inherit",
      });
      const code = await new Promise<number | null>((resolve, reject) => { proof.once("error", reject); proof.once("exit", resolve); });
      assert.equal(code, 0, "the read-fixture Scope review browser proof also passes");
    }
    await writeFile(`${output}/proof.json`, JSON.stringify({ ok: true, serverMode, scenarioFte, pageErrors, localSyntheticOnly: true, productionAccepted: false, scopeFixtureBrowserIncluded: process.env.SIGNAL_SCOPE_BROWSER_PROOF === "1" }, null, 2));
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined);
      await writeFile(`${output}/failure.txt`, await page.locator("body").innerText().catch(() => "unavailable"));
    }
    throw error;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve();
      const timer = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000);
      server.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    await writeFile(`${output}/server.log`, serverLog);
  }
}
