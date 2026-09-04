// AUDIT WORLD WIDGETS + INSPECTOR V1 — browser regression and evidence.
//
// This is presentation-only proof. It serves the existing in-memory Audit
// fixture through Playwright routing, performs no governed action, and writes
// screenshots/video beneath the requested artifact directory.
//
//   npx tsx scripts/audit-renderer-fixture.ts /tmp/audit-world-widgets-fixture.json
//   BASE_URL=http://localhost:3017 node scripts/audit-world-widgets-proof.mjs

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3017";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const FIXTURE = process.env.AUDIT_WIDGET_FIXTURE ?? "/tmp/audit-world-widgets-fixture.json";
const OUT = process.env.AUDIT_WIDGET_OUT ?? "artifacts/audit-world-widgets-inspector-v1";
const AFTER = `${OUT}/after`;
const VIDEO = `${OUT}/video`;

if (!existsSync(FIXTURE)) {
  throw new Error(`Missing ${FIXTURE}. Run the fixture command printed at the top of this file.`);
}
mkdirSync(AFTER, { recursive: true });
mkdirSync(VIDEO, { recursive: true });

const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
// The general fixture deliberately leaves package anchors empty. This proof
// adds a presentation-only anchor to its first passage so the source-anchor
// Inspector path can be exercised without changing any product contract.
const passages = payload.graph.nodes.filter((node) => node.attributes.kind === "passage");
for (const passage of passages) {
  passage.attributes.anchor = {
    charStart: 128,
    charEnd: 214,
    offsetUnit: "unicode_codepoint",
    quoteHash: "fixture-anchor-proof",
  };
}

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  const row = { name, ok: Boolean(ok), detail };
  rows.push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
});
await context.addCookies([
  {
    name: "kit_session",
    value: createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex"),
    domain: "localhost",
    path: "/",
  },
]);

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("404")) {
    pageErrors.push(`console: ${message.text()}`);
  }
});
await page.route("**/api/audit/graph*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
);
await page.route("**/api/audit/truth*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload.truth) })
);

const root = page.locator("[data-selected-id]");
const camera = () => root.getAttribute("data-camera-state");
const selected = () => root.getAttribute("data-selected-id");
const settle = (ms = 450) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${AFTER}/${name}.png`, animations: "disabled" });

await page.goto(`${BASE}/audit?renderer=canvas&layout=rings`, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await page.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30_000 });
await settle(1_500);
await page.evaluate(() => {
  const graph = document.querySelector('[data-shoot="signal-graph"]');
  if (graph instanceof HTMLElement) graph.dataset.proofMount = "original";
  window.__auditWidgetObservers = { resize: 0, long: 0 };
  const host = document.querySelector('[data-shoot="graph-viewport"]');
  const resize = new ResizeObserver(() => window.__auditWidgetObservers.resize++);
  if (host) resize.observe(host);
  window.__auditWidgetResizeObserver = resize;
  try {
    const long = new PerformanceObserver((list) => {
      window.__auditWidgetObservers.long += list.getEntries().length;
    });
    long.observe({ entryTypes: ["longtask"] });
    window.__auditWidgetLongObserver = long;
  } catch {
    // Safari/WebKit may not expose longtask. ResizeObserver still proves the
    // observer path survives the hover storm below.
  }
});

check("01 world and default Project Overview Inspector render", await page.locator('[data-shoot="inspector-overview"]').count() === 1);
check("02 world occupies the full host behind the dock", await page.evaluate(() => {
  const world = document.querySelector('[data-shoot="graph-viewport"]')?.getBoundingClientRect();
  const host = document.querySelector('[data-shoot="audit-world-host"]')?.getBoundingClientRect();
  return Boolean(world && host && Math.abs(world.width - host.width) < 1 && Math.abs(world.height - host.height) < 1);
}));

// Close/reopen 100 times. The renderer node is marked above; retaining the
// mark proves React never remounted it, while the camera data proves the
// overlay never wrote to Rubric's viewport.
const cameraBeforeDockStress = await camera();
for (let i = 0; i < 100; i++) {
  await page.locator('[data-shoot="inspector-close"]').click({ force: true });
  await page.locator('[data-shoot="inspector-reopen"]').click({ force: true });
}
check("03 Inspector closes and reopens 100x", await page.locator('[data-shoot="inspector"]').count() === 1, "100 cycles");
check("04 Inspector cycling does not change camera", (await camera()) === cameraBeforeDockStress, String(await camera()));
check("05 Inspector cycling does not remount the world", await page.getAttribute('[data-shoot="signal-graph"]', "data-proof-mount") === "original");

// Canonical Finding selection into the Inspector.
await page.locator('[data-shoot="overview-finding"]').first().click({ force: true });
await page.waitForSelector('[data-shoot="inspector-finding"]');
await settle(700);
const findingId = await selected();
check("06 selection opens the canonical Inspector", findingId?.startsWith("finding:") && await page.locator('[data-shoot="inspector-finding"]').count() === 1, findingId ?? "none");
await shot("02-finding-inspector");

// Search is another selection source and must end at the same dock grammar.
await page.keyboard.press("Escape");
await page.locator('[data-shoot="graph-search"]').fill("Docufy callback");
await page.waitForSelector('[data-shoot="search-results"] button');
await page.locator('[data-shoot="search-results"] button').first().click({ force: true });
await settle(700);
check(
  "07 Search result lands in Inspector",
  Boolean(await selected()) &&
    (await page.locator('[data-shoot="inspector-finding"], [data-shoot="graph-inspector"]').count()) === 1,
  await selected() ?? "none"
);

// Choose the deterministic offline finding and run Trace while the dock stays
// readable. The route's promoted passage/source buttons become available in
// the canvas accessibility mirror.
await page.locator('[data-shoot="graph-search"]').fill("Offline capture has no ticket");
await page.waitForSelector('[data-shoot="search-results"] button');
await page.locator('[data-shoot="search-results"] button').first().click({ force: true });
await settle(650);
await page.locator('[data-shoot="inspector-evidence-solo"]').click({ force: true });
await settle(900);
check("08 Trace is visible with Inspector", await page.locator('[data-shoot="trace-active-badge"]').count() === 1 && await page.locator('[data-shoot="inspector"]').count() === 1);
check("09 Trace route is complete and framed", await root.getAttribute("data-trace-complete") === "true" && await page.evaluate(() => (window.__signalCanvas?.geometry?.traceEndpointsOffscreen ?? 1) === 0));
await shot("03-trace-with-inspector");

const passageButton = page.locator('[data-shoot="node-passage:snap-jsa-1:ke-ev-0088"]');
check("10 Trace exposes a connected passage", await passageButton.count() === 1);
await passageButton.evaluate((button) => button.click());
await page.waitForFunction(() => document.querySelector('[data-selected-id]')?.getAttribute("data-selected-id")?.startsWith("passage:"));
await settle(250);
const passageId = await selected();
check("11 connected-node navigation updates Inspector without ending Trace", passageId?.startsWith("passage:") && await page.locator('[data-shoot="trace-active-badge"]').count() === 1, passageId ?? "none");

await page.locator('[data-shoot="inspector-technical"] summary').click({ force: true });
check("12 source anchor is inspectable", await page.getByText("Anchored in the source", { exact: true }).count() === 1 && await page.getByText("fixture-anchor-proof", { exact: true }).count() === 1);

const sourceConnection = page.locator('[data-shoot="connection-extracted_from"]').first();
check("13 passage exposes its source connection", await sourceConnection.count() === 1);
if (await sourceConnection.count()) {
  await sourceConnection.click({ force: true });
  await settle(300);
  check("14 source navigation keeps Trace live", /^(source|transcript):/.test((await selected()) ?? "") && await page.locator('[data-shoot="trace-active-badge"]').count() === 1, await selected() ?? "none");
}

// Layout is a world menu, not a competing dashboard column.
await page.locator('[data-shoot="world-menu-toggle"]').click({ force: true });
await page.locator('[data-shoot="layout-constellations"]').click({ force: true });
await settle(900);
check("15 layout switches with Inspector and Trace intact", await page.getAttribute('[data-shoot="signal-graph"]', "data-layout") === "constellations" && await page.locator('[data-shoot="inspector"]').count() === 1 && await page.locator('[data-shoot="trace-active-badge"]').count() === 1);
await page.locator('[data-shoot="layout-rings"]').click({ force: true });
await settle(800);

// Direct pan/zoom must continue to work under the floating dock.
const cameraBeforeHand = await camera();
await page.mouse.move(520, 450);
await page.mouse.wheel(0, -420);
await settle(250);
const cameraAfterZoom = await camera();
await page.mouse.move(520, 450);
await page.mouse.down();
await page.mouse.move(585, 495, { steps: 5 });
await page.mouse.up();
await settle(250);
const cameraAfterPan = await camera();
check("16 wheel zoom works with Inspector open", cameraAfterZoom !== cameraBeforeHand, `${cameraBeforeHand} → ${cameraAfterZoom}`);
check("17 pan works with Inspector open", cameraAfterPan !== cameraAfterZoom, `${cameraAfterZoom} → ${cameraAfterPan}`);
check("18 pan/zoom keep Inspector selection", await page.locator('[data-shoot="inspector"]').count() === 1 && Boolean(await selected()));

// Return to a Finding, then enter/exit second-level governed review. The
// camera and canonical selection must be byte-for-byte the same afterwards.
await page.locator('[data-shoot="graph-search"]').fill("");
await page.locator('[data-shoot="graph-search"]').fill("Offline capture has no ticket");
await page.waitForSelector('[data-shoot="search-results"] button');
await page.locator('[data-shoot="search-results"] button').first().click({ force: true });
await settle(700);
const cameraBeforeReview = await camera();
const selectionBeforeReview = await selected();
await page.locator('[data-shoot="open-full-review"]').click({ force: true });
await page.waitForSelector('[data-shoot="finding-review-sheet"]');
check("19 deep review is a side sheet, not the default surface", await page.locator('[data-review-variant="sheet"]').count() === 1 && await page.locator('[data-shoot="inspector"]').count() === 0);
await shot("04-deep-review-sheet");
await page.locator('[data-shoot="close-full-review"]').click({ force: true });
await page.waitForSelector('[data-shoot="inspector"]');
check("20 review close restores the same camera", (await camera()) === cameraBeforeReview, `${cameraBeforeReview} → ${await camera()}`);
check("21 review close restores the same selection", (await selected()) === selectionBeforeReview, await selected() ?? "none");

// Widget chrome evidence.
if (await page.locator('[data-shoot="world-menu-panel"]').count()) {
  await page.locator('[data-shoot="world-menu-toggle"]').click({ force: true });
}
await page.locator('[data-shoot="legend-toggle"]').click({ force: true });
await page.locator('[data-shoot="world-menu-toggle"]').click({ force: true });
check("22 Menu and Legend are collapsible Signal widgets", await page.locator('[data-shoot="legend-panel"]').count() === 1 && await page.locator('[data-shoot="world-menu-panel"]').count() === 1);
await shot("05-menu-legend-widget-family");

// Hover/observer crash regression: cross the moving field repeatedly while
// both observers are live, then verify the app and canvas loop still answer.
for (let i = 0; i < 140; i++) {
  await page.mouse.move(170 + (i * 37) % 760, 150 + (i * 61) % 630);
}
await page.setViewportSize({ width: 1439, height: 900 });
await page.setViewportSize({ width: 1440, height: 900 });
await settle(500);
const observerState = await page.evaluate(() => ({
  counters: window.__auditWidgetObservers,
  canvas: Boolean(window.__signalCanvas?.stats),
}));
check("23 hover/observer stress has no browser crash", pageErrors.length === 0 && observerState.canvas, pageErrors.join(" | "));
check("24 ResizeObserver remained live", observerState.counters?.resize > 0, JSON.stringify(observerState.counters));

await shot("06-final-world-state");
const video = page.video();
await page.close();
await context.close();
const videoPath = video ? await video.path() : null;
await browser.close();

const report = {
  baseUrl: BASE,
  fixture: FIXTURE,
  checks: rows.length,
  failures,
  pageErrors,
  videoPath,
  results: rows,
};
writeFileSync(`${OUT}/browser-regression.json`, JSON.stringify(report, null, 2));
console.log(`\n${rows.length - failures}/${rows.length} checks passed`);
if (videoPath) console.log(`video ${videoPath}`);
if (failures) process.exit(1);
