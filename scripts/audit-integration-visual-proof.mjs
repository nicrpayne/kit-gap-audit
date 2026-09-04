// Same-world visual comparison: truth-hardened base vs integrated Audit UX.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASELINE = process.env.BASELINE_URL ?? "http://localhost:3018";
const INTEGRATED = process.env.INTEGRATED_URL ?? "http://localhost:3017";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const OUT = process.env.AUDIT_WIDGET_OUT ?? "artifacts/audit-truth-inspector-integration-v1";
const session = createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex");

mkdirSync(`${OUT}/before`, { recursive: true });
mkdirSync(`${OUT}/after`, { recursive: true });

async function capture(browser, origin, side) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "kit_session", value: session, domain: "localhost", path: "/" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/audit/rubric*", async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("fixture", "production-mirror");
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });

  await page.goto(`${origin}/audit`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const frame = page.frameLocator('iframe[title="Signal Audit World"]');
  await frame.locator("#brain-canvas").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  const state = await frame.locator("body").evaluate(() => ({
    canonicalNodes: window.BrainCore.S.meta.canonicalNodes,
    canonicalEdges: window.BrainCore.S.meta.canonicalEdges,
    canvas: (() => {
      const rect = document.getElementById("brain-canvas").getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })(),
  }));
  await page.screenshot({ path: `${OUT}/${side}/01-current-world.png`, animations: "disabled" });

  const graphResponse = await page.request.get(`${origin}/api/audit/rubric?fixture=production-mirror&mode=graph`, {
    headers: { Authorization: `Bearer ${PASSWORD}` },
  });
  const graph = await graphResponse.json();
  const finding = graph.nodes.find(node => node.kind === "finding");
  if (!await frame.locator("#brain-search").isVisible()) {
    await frame.locator("#fab-menu").click();
  }
  await frame.locator("#brain-search").fill(finding.canonicalId);
  await frame.locator(`.res[data-path="${finding.id}"]`).click();
  await frame.locator("#brain-card").waitFor({ state: "visible" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${side}/02-selected-finding.png`, animations: "disabled" });
  const selected = await frame.locator("body").getAttribute("data-signal-selected-id");
  await context.close();
  return { ...state, selected: selected || finding.canonicalId, errors };
}

const browser = await chromium.launch({ headless: true });
const before = await capture(browser, BASELINE, "before");
const after = await capture(browser, INTEGRATED, "after");
await browser.close();

const screenshots = [
  "before/01-current-world.png",
  "before/02-selected-finding.png",
  "after/01-current-world.png",
  "after/02-selected-finding.png",
].map(file => ({
  file,
  sha256: createHash("sha256").update(readFileSync(`${OUT}/${file}`)).digest("hex"),
}));
const passed = [before, after].every(state =>
  state.canonicalNodes === 438
  && state.canonicalEdges === 543
  && state.canvas.width === 1348
  && state.canvas.height === 854
  && state.errors.length === 0
);
const report = { baseline: BASELINE, integrated: INTEGRATED, passed, before, after, screenshots };
writeFileSync(`${OUT}/visual-comparison.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exit(1);
