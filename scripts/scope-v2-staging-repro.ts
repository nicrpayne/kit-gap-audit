import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseURL = (process.env.SIGNAL_PROOF_URL ?? "https://kit-gap-audit-staging-cedd.up.railway.app").replace(/\/$/, "");
const password = process.env.APP_PASSWORD;
const out = resolve(process.env.SIGNAL_SCOPE_V2_OUTPUT_DIR ?? "artifacts/staging-scope-v2-repair/before");

async function main() {
  assert.ok(password, "APP_PASSWORD is required");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));

  const login = await page.request.post(`${baseURL}/api/login`, { data: { password } });
  assert.equal(login.status(), 200, "staging login should succeed");

  await page.goto(`${baseURL}/scope`, { waitUntil: "networkidle" });
  const panel = page.locator('[data-shoot^="reconciliation-"]').first();
  await panel.waitFor({ state: "visible" });
  const candidate = panel.locator('[data-shoot="proposal-card"]').first();
  const action = panel.getByRole("button", { name: /Stage aligned/i });
  await action.waitFor({ state: "visible" });

  const before = await panel.evaluate((element) => {
  const scrolling = element.querySelector<HTMLElement>('[data-shoot="candidate-scroll-region"]')
    ?? Array.from(element.querySelectorAll<HTMLElement>("div")).find((node) => getComputedStyle(node).overflowY === "auto")
    ?? null;
  const row = element.querySelector<HTMLElement>('[data-shoot="proposal-card"]');
  const panelRect = element.getBoundingClientRect();
  const rowRect = row?.getBoundingClientRect() ?? null;
  return {
    panel: { top: panelRect.top, bottom: panelRect.bottom, height: panelRect.height },
    row: rowRect ? { top: rowRect.top, bottom: rowRect.bottom, height: rowRect.height } : null,
    scroll: scrolling ? {
      top: scrolling.getBoundingClientRect().top,
      bottom: scrolling.getBoundingClientRect().bottom,
      clientHeight: scrolling.clientHeight,
      scrollHeight: scrolling.scrollHeight,
      scrollTop: scrolling.scrollTop,
    } : null,
  };
  });

  await page.screenshot({ path: resolve(out, "01-original-clipped-1440x900.png") });
  const scenarioBefore = await page.locator('[data-shoot="scenario-strip"]').innerText();
  await action.click();
  await page.waitForTimeout(250);
  const scenarioAfter = await page.locator('[data-shoot="scenario-strip"]').innerText();
  const stagedRows = await panel.getByText("staged", { exact: true }).count();
  await page.screenshot({ path: resolve(out, "02-original-stage-aligned-no-op.png") });

  const result = {
  baseURL,
  viewport: "1440x900",
  candidateCount: await panel.locator('[data-shoot="proposal-card"]').count(),
  firstCandidateVisible: await candidate.isVisible().catch(() => false),
  stageAlignedEnabled: await action.isEnabled(),
  scenarioChanged: scenarioBefore !== scenarioAfter,
  stagedRows,
  geometry: before,
  proposalCommitRequests: requests.filter((request) => request === "POST /api/scopes/jsa-seed/proposal/commit").length,
  requests: [...new Set(requests.filter((request) => request.includes("/proposal")))],
  };

  writeFileSync(resolve(out, "reproduction.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

void main();
