// Focused, read-only regression proof for the Audit Inspector dock side.
// It compares the production base and candidate against the same 438/543
// mirror, then checks laptop viewport geometry without changing Rubric data.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BEFORE = process.env.BASELINE_URL ?? "http://localhost:3018";
const AFTER = process.env.CANDIDATE_URL ?? "http://localhost:3017";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const OUT = process.env.AUDIT_DOCK_OUT ?? "artifacts/audit-inspector-left-dock";
const session = createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex");
const viewports = [1024, 1180, 1280, 1440];
const checks = [];
let failures = 0;

mkdirSync(`${OUT}/before`, { recursive: true });
mkdirSync(`${OUT}/after`, { recursive: true });

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function overlap(a, b) {
  return Math.max(a.left, b.left) < Math.min(a.right, b.right)
    && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
}

function cameraNear(a, b, tolerance = 4) {
  const left = String(a).split(",").map(Number);
  const right = String(b).split(",").map(Number);
  return left.length === 3 && right.length === 3
    && Math.abs(left[0] - right[0]) <= tolerance
    && Math.abs(left[1] - right[1]) <= tolerance
    && Math.abs(left[2] - right[2]) <= 0.005;
}

async function openAudit(browser, origin, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "kit_session", value: session, domain: "localhost", path: "/" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
  });
  await page.route("**/api/audit/rubric*", async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("fixture", "production-mirror");
    const response = await route.fetch({ url: url.toString() });
    try {
      await route.fulfill({ response });
    } catch (error) {
      if (!String(error).includes("Route is already handled")) throw error;
    }
  });
  await page.goto(`${origin}/audit?fixture=production-mirror`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const frame = page.frameLocator('iframe[title="Signal Audit World"]');
  await frame.locator("#brain-canvas").waitFor({ timeout: 30_000 });
  await frame.locator("#signal-inspector-overview").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(650);
  return { context, page, frame, errors };
}

async function rect(locator) {
  return locator.evaluate(element => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  });
}

async function interactionSequence(browser, origin, side) {
  const { context, page, frame, errors } = await openAudit(browser, origin, 1440);
  const graph = await (await page.request.get(`${origin}/api/audit/rubric?fixture=production-mirror&mode=graph`, {
    headers: { Authorization: `Bearer ${PASSWORD}` },
  })).json();
  const finding = graph.nodes.find(node => node.kind === "finding" && (graph.meta.traceByNode[node.id] || []).length > 0);
  const routeIds = new Set(graph.meta.traceByNode[finding.id].flatMap(edge => [edge.s, edge.t]));
  const connection = finding.connections.find(item => routeIds.has(item.transportId));
  const body = frame.locator("body");
  const camera = () => body.getAttribute("data-signal-camera-state");

  await page.screenshot({ path: `${OUT}/${side}/01-overview.png`, animations: "disabled" });
  await frame.locator("#brain-search").fill(finding.canonicalId);
  await frame.locator(`.res[data-path="${finding.id}"]`).click();
  await frame.locator("#brain-card").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  const selectedCamera = await camera();
  await frame.locator('#brain-card [data-act="trace"]').click();
  await page.waitForTimeout(250);
  const traceCamera = await camera();
  const traceActive = await body.getAttribute("data-signal-trace-active");
  await page.screenshot({ path: `${OUT}/${side}/02-selection-trace.png`, animations: "disabled" });
  await frame.locator(`#brain-card .nrow[data-id="${connection.transportId}"]`).click();
  await page.waitForTimeout(650);
  const connectionCamera = await camera();
  const connectedSelection = await body.getAttribute("data-signal-selected-id");
  const connectedTrace = await body.getAttribute("data-signal-trace-active");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const afterEscape = {
    selection: await body.getAttribute("data-signal-selected-id"),
    trace: await body.getAttribute("data-signal-trace-active"),
    overview: await frame.locator("#signal-inspector-overview").isVisible(),
    card: await frame.locator("#brain-card").isVisible(),
  };
  await context.close();
  return { selectedCamera, traceCamera, traceActive, connectionCamera, connectedSelection, connectedTrace, afterEscape, errors };
}

const browser = await chromium.launch({ headless: true });
const baseline = await interactionSequence(browser, BEFORE, "before");
const candidate = await interactionSequence(browser, AFTER, "after");

check("interaction state matches production base",
  candidate.traceActive === baseline.traceActive
    && candidate.connectedSelection === baseline.connectedSelection
    && candidate.connectedTrace === baseline.connectedTrace
    && JSON.stringify(candidate.afterEscape) === JSON.stringify(baseline.afterEscape)
    && candidate.errors.length === 0 && baseline.errors.length === 0);
check("camera sequence matches production base within four-world-unit settled-render tolerance",
  cameraNear(candidate.selectedCamera, baseline.selectedCamera)
    && cameraNear(candidate.traceCamera, baseline.traceCamera)
    && cameraNear(candidate.connectionCamera, baseline.connectionCamera),
  `${JSON.stringify(baseline)} → ${JSON.stringify(candidate)}`);
check("Trace remains active while Inspector is open", candidate.traceActive === "true" && candidate.connectedTrace === "true");
check("connected selection updates Inspector", Boolean(candidate.connectedSelection));
check("Escape contract is unchanged", JSON.stringify(candidate.afterEscape) === JSON.stringify(baseline.afterEscape), JSON.stringify(candidate.afterEscape));

for (const width of viewports) {
  const { context, frame, errors } = await openAudit(browser, AFTER, width);
  const inspector = await rect(frame.locator("#signal-inspector-overview"));
  const canvas = await rect(frame.locator("#brain-canvas"));
  const menu = await rect(frame.locator("#fab-menu"));
  const legend = await rect(frame.locator("#fab-legend"));
  const search = await rect(frame.locator("#signal-search-widget"));
  const inner = await frame.locator("body").evaluate(() => ({ width: innerWidth, height: innerHeight }));

  check(`${width}px Inspector is left-docked`, Math.abs(inspector.left - 12) < 1 && inspector.right < inner.width / 2, JSON.stringify(inspector));
  check(`${width}px world geometry remains full-canvas`, Math.abs(canvas.width - inner.width) < 1 && Math.abs(canvas.height - inner.height) < 1, `${canvas.width}×${canvas.height}`);
  check(`${width}px essential controls remain clear`, !overlap(inspector, menu) && !overlap(inspector, legend) && !overlap(inspector, search));

  await frame.locator("#fab-menu").click();
  check(`${width}px Menu remains operable over dock`, await frame.locator("#brain-panel").isVisible());
  await frame.locator("#fab-menu").click();
  await frame.locator("#fab-legend").click();
  check(`${width}px Legend remains operable over dock`, await frame.locator("#brain-legend").isVisible());
  check(`${width}px browser console is clean`, errors.length === 0, errors.join(" | "));
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/proof.json`, JSON.stringify({ baseline: BEFORE, candidate: AFTER, checks, failures, baselineSequence: baseline, candidateSequence: candidate }, null, 2));
console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exit(1);
