// CURRENT AUDIT WORLD + ACCEPTED INSPECTOR/WIDGETS — browser regression.
//
// The active /audit route is the protected Rubric-powered world, not the
// retired AuditInstrument fixture surface. This proof routes that real surface
// to the checked-in 438/543 production-shaped mirror and a read-only captured
// truth response. It performs no governed write.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3017";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const OUT = process.env.AUDIT_WIDGET_OUT ?? "artifacts/audit-truth-inspector-integration-v1";
const TRUTH_CAPTURE = process.env.AUDIT_TRUTH_CAPTURE ?? "artifacts/rubric-production-parity/production-jsa-truth.json";
const AFTER = `${OUT}/after`;
const VIDEO = `${OUT}/video`;

if (!existsSync(TRUTH_CAPTURE)) {
  throw new Error(`Missing read-only truth capture: ${TRUTH_CAPTURE}`);
}
mkdirSync(AFTER, { recursive: true });
mkdirSync(VIDEO, { recursive: true });

const mirrorResponse = await fetch(`${BASE}/api/audit/rubric?fixture=production-mirror&mode=graph`, {
  headers: { Authorization: `Bearer ${PASSWORD}` },
});
if (!mirrorResponse.ok) throw new Error(`Could not load production-shaped mirror: ${mirrorResponse.status}`);
const mirror = await mirrorResponse.json();
const truth = JSON.parse(readFileSync(TRUTH_CAPTURE, "utf8"));
const traceableFinding = mirror.nodes.find(node =>
  node.kind === "finding" && (mirror.meta.traceByNode[node.id] || []).length > 0
);
if (!traceableFinding) throw new Error("The current mirror has no traceable Finding.");
// The checked-in mirror deliberately redacts canonical production IDs. Preserve
// the captured Truth shape while replacing the one browser-reviewed Finding
// with a non-sensitive mirror identity and copy.
const reviewId = traceableFinding.canonicalId.replace(/^finding:/, "");
const capturedFinding = truth.model.findings[0];
const capturedProvenance = truth.provenance[capturedFinding.id];
truth.model = {
  ...truth.model,
  findings: [{
    ...capturedFinding,
    id: reviewId,
    title: traceableFinding.label,
    quote: "Redacted production-shaped evidence passage.",
    rationale: "Governed review proof using the redacted 438/543 current-world mirror.",
    owner: null,
    blocks: "Redacted current-world milestone",
    matchedIssues: [],
  }],
};
truth.provenance = {
  [reviewId]: {
    ...capturedProvenance,
    findingId: reviewId,
    quote: "Redacted production-shaped evidence passage.",
    snapshot: capturedProvenance?.snapshot ? {
      ...capturedProvenance.snapshot,
      id: "mirror:snapshot:redacted",
      packageId: "mirror-package-redacted",
    } : null,
    passages: (capturedProvenance?.passages || []).slice(0, 1).map(passage => ({
      ...passage,
      evidenceId: "mirror:evidence:redacted",
      excerpt: "Redacted production-shaped evidence passage used only for interaction proof.",
      sourceRef: "mirror://source/redacted",
      externalRef: "mirror://source/redacted#passage",
      registrationId: "mirror:registration:redacted",
    })),
    source: null,
    matchedIssues: [],
    unresolvedRefs: [],
  },
};
const trace = mirror.meta.traceByNode[traceableFinding.id];
const traceIds = new Set(trace.flatMap(edge => [edge.s, edge.t]));
const routeConnection = (traceableFinding.connections || []).find(connection => traceIds.has(connection.transportId));
if (!routeConnection) throw new Error("The traceable Finding exposes no connected route row.");
const routeTarget = mirror.nodes.find(node => node.id === routeConnection.transportId);
const anchoredPassage = mirror.nodes.find(node =>
  node.kind === "passage"
  && (node.connections || []).some(connection => connection.rel === "extracted_from")
);
if (!anchoredPassage) throw new Error("The current mirror has no source-linked passage.");
const sourceConnection = anchoredPassage.connections.find(connection => connection.rel === "extracted_from");

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
await context.addCookies([{
  name: "kit_session",
  value: createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex"),
  domain: "localhost",
  path: "/",
}]);

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
  if (message.type() === "error" && !message.text().includes("404")) pageErrors.push(`console: ${message.text()}`);
});

await page.route("**/api/audit/rubric*", async route => {
  const url = new URL(route.request().url());
  url.searchParams.set("fixture", "production-mirror");
  const response = await route.fetch({ url: url.toString() });
  await route.fulfill({ response });
});
await page.route("**/api/audit/truth*", route =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(truth) })
);

await page.goto(`${BASE}/audit`, { waitUntil: "domcontentloaded", timeout: 30_000 });
const frame = page.frameLocator('iframe[title="Signal Audit World"]');
await frame.locator("#brain-canvas").waitFor({ timeout: 30_000 });
await frame.locator("#signal-inspector-overview").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1_500);

await frame.locator("#brain-canvas").evaluate(canvas => { canvas.dataset.proofMount = "original"; });
await frame.locator("body").evaluate(body => {
  window.__auditWidgetObservers = { resize: 0 };
  const resize = new ResizeObserver(() => window.__auditWidgetObservers.resize++);
  resize.observe(document.documentElement);
  window.__auditWidgetResizeObserver = resize;
  body.dataset.proofReady = "true";
});

const body = frame.locator("body");
const camera = () => body.getAttribute("data-signal-camera-state");
const selected = () => body.getAttribute("data-signal-selected-id");
const settle = (ms = 500) => page.waitForTimeout(ms);
const shot = name => page.screenshot({ path: `${AFTER}/${name}.png`, animations: "disabled" });

check("01 current world census is 438 canonical objects", mirror.meta.canonicalNodes === 438, String(mirror.meta.canonicalNodes));
check("02 current world census is 543 canonical relationships", mirror.meta.canonicalEdges === 543, String(mirror.meta.canonicalEdges));
check("03 old 427/439 fixture is not acceptance authority", mirror.meta.canonicalNodes !== 427 && mirror.meta.canonicalEdges !== 439);
check("04 Project Overview Inspector renders by default", await frame.locator("#signal-inspector-overview").isVisible());
check("05 Rubric canvas still owns the full world", await frame.locator("#brain-canvas").evaluate(canvas => {
  const rect = canvas.getBoundingClientRect();
  return Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1;
}));
await shot("01-current-world-overview");

const cameraBeforeStress = await camera();
for (let index = 0; index < 100; index++) {
  await frame.locator("#signal-overview-close").click({ force: true });
  await frame.locator("#signal-inspector-reopen").click({ force: true });
}
check("06 Inspector closes and reopens 100x", await frame.locator("#signal-inspector-overview").isVisible(), "100 cycles");
check("07 Inspector cycling preserves exact camera", (await camera()) === cameraBeforeStress, `${cameraBeforeStress} → ${await camera()}`);
check("08 Inspector cycling never remounts Rubric", await frame.locator("#brain-canvas").getAttribute("data-proof-mount") === "original");

async function selectBySearch(node) {
  const input = frame.locator("#brain-search");
  await input.fill(node.canonicalId);
  const result = frame.locator(`.res[data-path="${node.id}"]`);
  await result.waitFor({ timeout: 10_000 });
  await result.click({ force: true });
  await frame.locator("#brain-card").waitFor({ state: "visible" });
  await settle(900);
}

await selectBySearch(traceableFinding);
check("09 Search lands in the floating Inspector", (await selected()) === traceableFinding.canonicalId && await frame.locator("#brain-card").isVisible(), await selected() ?? "none");
check("10 Inspector width stays within 340–392px", await frame.locator("#brain-card").evaluate(card => {
  const width = card.getBoundingClientRect().width;
  return width >= 340 && width <= 392.5;
}));

await frame.locator('#brain-card [data-act="trace"]').click({ force: true });
await settle(500);
check("11 Trace remains visible with Inspector open", await body.getAttribute("data-signal-trace-active") === "true" && await frame.locator(".signal-trace-badge").isVisible());
const connectedRow = frame.locator(`#brain-card .nrow[data-id="${routeConnection.transportId}"]`);
check("12 trace exposes a connected canonical selection", await connectedRow.count() === 1, routeConnection.transportId);
await connectedRow.click({ force: true });
await settle(700);
check("13 connected selection updates Inspector without ending Trace", (await selected()) === routeTarget.canonicalId && await body.getAttribute("data-signal-trace-active") === "true", await selected() ?? "none");
await shot("02-trace-with-inspector");

await selectBySearch(anchoredPassage);
check("14 source-linked passage selects canonically", (await selected()) === anchoredPassage.canonicalId, anchoredPassage.canonicalId);
const sourceRow = frame.locator(`#brain-card .nrow[data-id="${sourceConnection.transportId}"]`);
check("15 passage exposes its canonical source relationship", await sourceRow.count() === 1, sourceConnection.transportId);
await sourceRow.click({ force: true });
await settle(500);
check("16 source relationship navigation updates Inspector", (await selected()) === mirror.nodes.find(node => node.id === sourceConnection.transportId)?.canonicalId, await selected() ?? "none");

await frame.locator("#fab-menu").click({ force: true });
for (const layout of ["rings", "circle", "hex", "force"]) {
  await frame.locator(`#seg-layout button[data-v="${layout}"]`).click({ force: true });
  await settle(350);
  check(`17-${layout} current Rubric ${layout} behavior remains available`, await frame.locator("body").evaluate((_, value) => window.BrainCore.S.st.layout === value, layout));
}
check("18 layout changes retain Inspector selection", Boolean(await selected()) && await frame.locator("#brain-card").isVisible());

const cameraBeforeOverview = await camera();
await page.locator('[data-shoot="project-overview"]').click({ force: true });
await frame.locator("#signal-inspector-overview").waitFor({ state: "visible" });
await settle(250);
check("19 project/context handoff opens Overview in place", (await selected()) === "" && await frame.locator("#signal-inspector-overview").isVisible());
check("20 project/context handoff preserves exact camera", (await camera()) === cameraBeforeOverview, `${cameraBeforeOverview} → ${await camera()}`);
check("21 project/context handoff never remounts Rubric", await frame.locator("#brain-canvas").getAttribute("data-proof-mount") === "original");

await selectBySearch(traceableFinding);
const cameraBeforeReview = await camera();
const selectionBeforeReview = await selected();
await frame.locator('#brain-card [data-act="view"]').click({ force: true });
await page.locator('[data-shoot="finding-review-sheet"]').waitFor({ timeout: 10_000 });
check("22 Review finding opens the governed second-level side sheet", await page.locator('[data-review-variant="sheet"]').count() === 1);
await shot("03-governed-review-sheet");
await page.locator('[data-shoot="close-full-review"]').click({ force: true });
await page.locator('[data-shoot="finding-review-sheet"]').waitFor({ state: "detached" });
check("23 review close restores exact camera", (await camera()) === cameraBeforeReview, `${cameraBeforeReview} → ${await camera()}`);
check("24 review close restores exact selection", (await selected()) === selectionBeforeReview, await selected() ?? "none");
check("25 review handoff never remounts Rubric", await frame.locator("#brain-canvas").getAttribute("data-proof-mount") === "original");

if (!await frame.locator("#brain-panel").isVisible()) await frame.locator("#fab-menu").click({ force: true });
await frame.locator("#fab-legend").click({ force: true });
check("26 Menu/Search/Legend/Inspector form the active widget family", await frame.locator("#brain-panel").isVisible() && await frame.locator("#signal-search-widget").isVisible() && await frame.locator("#brain-legend").isVisible() && await frame.locator("#brain-card").isVisible());
check("27 Run Audit remains in the parent Signal shell", await page.locator('button:has-text("Run Audit")').count() === 1);
await shot("04-widget-family-current-world");

for (let index = 0; index < 180; index++) {
  await page.mouse.move(130 + (index * 43) % 900, 100 + (index * 67) % 700);
}
await page.setViewportSize({ width: 1439, height: 900 });
await page.setViewportSize({ width: 1440, height: 900 });
await settle(600);
const observerState = await frame.locator("body").evaluate(() => ({
  resize: window.__auditWidgetObservers?.resize || 0,
  core: Boolean(window.BrainCore?.S?.nodes?.length),
  canvas: Boolean(document.getElementById("brain-canvas")),
}));
check("28 hover/observer stress has no browser crash", pageErrors.length === 0 && observerState.core && observerState.canvas, pageErrors.join(" | "));
check("29 ResizeObserver remained live", observerState.resize > 0, JSON.stringify(observerState));
check("30 final world remains the current 438/543 corpus", await frame.locator("body").evaluate(() => window.BrainCore.S.meta.canonicalNodes === 438 && window.BrainCore.S.meta.canonicalEdges === 543));

const video = page.video();
await page.close();
await context.close();
const videoPath = video ? await video.path() : null;
await browser.close();

const report = {
  baseUrl: BASE,
  currentWorld: { canonicalNodes: mirror.meta.canonicalNodes, canonicalEdges: mirror.meta.canonicalEdges },
  truthCapture: TRUTH_CAPTURE,
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
