import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit, type BrowserContext, type Page } from "playwright";

const baseURL = (process.env.SIGNAL_PROOF_URL ?? "https://kit-gap-audit-staging-cedd.up.railway.app").replace(/\/$/, "");
const password = process.env.APP_PASSWORD;
const out = resolve(process.env.SIGNAL_SCOPE_V2_OUTPUT_DIR ?? "artifacts/staging-scope-v2-repair/after");

function trackProposalRequests(context: BrowserContext, requests: string[]) {
  context.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.includes("/proposal")) requests.push(`${request.method()} ${pathname}`);
  });
}

async function login(context: BrowserContext) {
  assert.ok(password, "APP_PASSWORD is required");
  const response = await context.request.post(`${baseURL}/api/login`, { data: { password } });
  assert.equal(response.status(), 200, "staging login should succeed");
}

async function openScope(page: Page) {
  await page.goto(`${baseURL}/scope`, { waitUntil: "networkidle" });
  await page.locator('[data-shoot^="reconciliation-"]').first().waitFor();
  await page.locator('[data-shoot="candidate-scroll-region"] [data-proposal-item]').first().waitFor();
}

async function openActionableCandidate(page: Page) {
  const ids = await page.locator('[data-shoot="candidate-scroll-region"] [data-proposal-item]').evaluateAll((elements) => elements.map((element) => element.getAttribute("data-proposal-item")).filter(Boolean) as string[]);
  for (const id of ids) {
    await page.locator(`[data-proposal-item="${id}"]`).click();
    const focus = page.locator('[data-shoot="reconciliation-focus"]');
    await focus.waitFor();
    const stage = focus.locator('[data-shoot="stage-focused-proposal"]');
    if (await stage.isEnabled()) return { id, stage };
    await focus.getByRole("button", { name: "Close" }).click();
  }
  throw new Error("No manually actionable reconciliation candidate was available");
}

async function main() {
  assert.ok(password, "APP_PASSWORD is required");
  mkdirSync(out, { recursive: true });
  const requests: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  trackProposalRequests(context, requests);
  await login(context);
  const page = await context.newPage();
  await openScope(page);

  const region = page.locator('[data-shoot="candidate-scroll-region"]');
  const firstCandidate = region.locator('[data-proposal-item]').first();
  const geometry = await region.evaluate((element) => {
    const row = element.querySelector<HTMLElement>("[data-proposal-item]");
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      rowHeight: row?.getBoundingClientRect().height ?? 0,
    };
  });
  assert.ok(geometry.clientHeight >= geometry.rowHeight, `at least one complete candidate must be visible at 1440x900: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.scrollHeight > geometry.clientHeight, "the real candidate list should expose a pointer-scroll range");
  await page.screenshot({ path: resolve(out, "01-candidate-path-1440x900.png") });

  await region.hover();
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(150);
  const pointerScrollTop = await region.evaluate((element) => element.scrollTop);
  assert.ok(pointerScrollTop > 0, "pointer scrolling should move the real candidate list");
  await region.evaluate((element) => { element.scrollTop = 0; });
  await region.focus();
  await page.keyboard.press("Tab");
  assert.equal(await firstCandidate.evaluate((element) => document.activeElement === element), true, "the first real candidate should be keyboard reachable");

  const bulk = page.locator('[data-shoot="stage-aligned"]');
  const bulkLabel = (await bulk.innerText()).trim();
  const eligibleCount = Number(bulkLabel.match(/Stage (\d+) aligned/i)?.[1] ?? -1);
  assert.ok(eligibleCount >= 0, `bulk action should expose an eligible count: ${bulkLabel}`);
  if (eligibleCount === 0) {
    assert.equal(await bulk.isDisabled(), true);
    assert.match(await page.locator('[data-shoot="bulk-stage-explanation"]').innerText(), /No candidates qualify|already staged/i);
  } else {
    assert.equal(await bulk.isEnabled(), true);
  }

  const manual = await openActionableCandidate(page);
  await manual.stage.click();
  const focus = page.locator('[data-shoot="reconciliation-focus"]');
  await focus.getByRole("button", { name: "Close" }).click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Scenario[\s\S]*1 intelligence proposal staged[\s\S]*Back to Reality/i);
  assert.match(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').innerText(), /Scenario[\s\S]*1 reviewed change staged[\s\S]*Reality is unchanged/i);
  assert.match(await page.locator(`[data-proposal-item="${manual.id}"]`).innerText(), /staged/i);
  await page.screenshot({ path: resolve(out, "02-manual-staging-visible-1440x900.png") });

  await page.locator('[data-shoot="discard"]').click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0);

  const unstage = await openActionableCandidate(page);
  await unstage.stage.click();
  const unstageButton = page.locator('[data-shoot="reconciliation-focus"] [data-shoot="stage-focused-proposal"]');
  await unstageButton.getByText("Unstage change", { exact: true }).click();
  await page.locator('[data-shoot="reconciliation-focus"]').getByRole("button", { name: "Close" }).click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);

  const reloadCandidate = await openActionableCandidate(page);
  await reloadCandidate.stage.click();
  await page.locator('[data-shoot="reconciliation-focus"]').getByRole("button", { name: "Close" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-shoot="candidate-scroll-region"] [data-proposal-item]').first().waitFor();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0, "reload must preserve Reality and discard the browser-local Scenario");

  const isolatedCandidate = await openActionableCandidate(page);
  await isolatedCandidate.stage.click();
  await page.locator('[data-shoot="reconciliation-focus"]').getByRole("button", { name: "Close" }).click();
  const isolatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  trackProposalRequests(isolatedContext, requests);
  await login(isolatedContext);
  const isolatedPage = await isolatedContext.newPage();
  await openScope(isolatedPage);
  assert.match(await isolatedPage.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await isolatedPage.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0, "an independent browser must not inherit another browser's Scenario");
  await isolatedContext.close();
  await page.locator('[data-shoot="discard"]').click();

  const safari = await webkit.launch({ headless: true });
  const safariContext = await safari.newContext({ viewport: { width: 1728, height: 1117 }, colorScheme: "dark" });
  trackProposalRequests(safariContext, requests);
  await login(safariContext);
  const safariPage = await safariContext.newPage();
  await openScope(safariPage);
  const safariRegion = safariPage.locator('[data-shoot="candidate-scroll-region"]');
  assert.equal(await safariRegion.locator('[data-proposal-item]').first().isVisible(), true);
  await safariRegion.hover();
  await safariPage.mouse.wheel(0, 360);
  await safariPage.waitForTimeout(150);
  const safariScrollTop = await safariRegion.evaluate((element) => element.scrollTop);
  assert.ok(safariScrollTop > 0, "WebKit/Safari-like pointer scrolling should move the candidate list");
  await safariPage.screenshot({ path: resolve(out, "03-safari-wide-1728x1117.png") });
  await safari.close();

  const proposalCommitRequests = requests.filter((request) => request.endsWith("/proposal/commit"));
  assert.deepEqual(proposalCommitRequests, [], "staging verification must never commit a proposal");
  const result = {
    ok: true,
    baseURL,
    viewport: "1440x900",
    safariLikeViewport: "1728x1117",
    candidateCount: await page.locator('[data-shoot="candidate-scroll-region"] [data-proposal-item]').count(),
    geometry,
    pointerScrollTop,
    safariScrollTop,
    keyboardCandidateAccess: true,
    bulkEligibleCount: eligibleCount,
    zeroEligibleDisabledWithReason: eligibleCount === 0,
    manualStage: true,
    unstage: true,
    backToReality: true,
    reloadRealityPersistence: true,
    independentBrowserIsolation: true,
    proposalCommitRequests: proposalCommitRequests.length,
    proposalRequests: [...new Set(requests)],
  };
  writeFileSync(resolve(out, "proof.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

void main();
