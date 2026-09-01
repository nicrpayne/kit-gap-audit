// THE RUBRIC ENGINE, IN A BROWSER — ACCEPTANCE EVIDENCE.
//
// The success condition for this pass is not "tests pass". It is whether a
// person looking at the field says yes, that is the Rubric-class experience.
// So this produces the evidence a person judges, across the whole matrix, and
// deliberately captures the unflattering states too.
//
//   1  Fit, both layouts
//   2  hover / focus
//   3  selected Risk
//   4  selected source artifact
//   5  dense evidence
//   6  Trace
//   7  Rings → Constellations, sampled through the morph
//   8  Constellations → Rings, sampled through the morph
//   9  rapid pan and zoom
//  10  Rubric gesture stress — zoom and pan through the one interaction path
//
// Plus recordings, frame timings, and the semantic guards that must survive
// all of it.
//
//   npx tsx scripts/audit-renderer-fixture.ts /tmp/signal-renderer-graph.json
//   node scripts/audit-rubric-shoot.mjs /tmp/rubric-shots

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { createHash } from "crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const GRAPH = process.env.RENDERER_GRAPH ?? "/tmp/signal-renderer-graph.json";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const out = process.argv[2] ?? "/tmp/rubric-shots";
mkdirSync(out, { recursive: true });
mkdirSync(`${out}/video`, { recursive: true });

if (!existsSync(GRAPH)) {
  console.error(`No fixture payload at ${GRAPH}.`);
  console.error(`Run: npx tsx scripts/audit-renderer-fixture.ts ${GRAPH}`);
  process.exit(2);
}
const PAYLOAD = readFileSync(GRAPH, "utf8");
const COOKIE = createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex");
const VIEWPORT = { width: 1440, height: 900 };

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};
const measured = {};
const fmt = (n) => (typeof n === "number" ? n.toFixed(1) : String(n));

const browser = await chromium.launch({ executablePath: CHROME });

async function open({ layout = "rings", video = false } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: video ? 1 : 2,
    ...(video ? { recordVideo: { dir: `${out}/video`, size: VIEWPORT } } : {}),
  });
  await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("404")) errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.route("**/api/audit/graph*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: PAYLOAD })
  );
  await page.route("**/api/audit/truth*", (r) =>
    r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"absent"}' })
  );
  await page.goto(`${BASE}/audit?renderer=canvas&layout=${layout}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector('[data-shoot="signal-graph"]', { timeout: 20000 });
  await page.waitForTimeout(2600);
  await installProbe(page);
  return { ctx, page, errors };
}

async function installProbe(page) {
  await page.evaluate(() => {
    if (window.__frameProbe) return;
    const probe = { deltas: [], sampling: false, last: 0, longTasks: [] };
    const tick = (t) => {
      if (probe.sampling) {
        if (probe.last) probe.deltas.push(t - probe.last);
        probe.last = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((l) => {
        if (probe.sampling) for (const e of l.getEntries()) probe.longTasks.push(e.duration);
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* long tasks unavailable — frame deltas still carry the story */
    }
    window.__frameProbe = probe;
  });
}

const startSample = (page) =>
  page.evaluate(() => {
    const p = window.__frameProbe;
    p.deltas = [];
    p.longTasks = [];
    p.last = 0;
    p.sampling = true;
  });

const stopSample = (page) =>
  page.evaluate(() => {
    const p = window.__frameProbe;
    p.sampling = false;
    const d = [...p.deltas].sort((a, b) => a - b);
    const q = (f) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * f))] : 0);
    const paint = [...(window.__signalCanvas?.frames ?? [])].sort((a, b) => a - b);
    return {
      frames: d.length,
      median: q(0.5),
      p95: q(0.95),
      worst: d.length ? d[d.length - 1] : 0,
      over50: d.filter((x) => x > 50).length,
      longTasks: p.longTasks.length,
      paintMedian: paint.length ? paint[Math.floor(paint.length / 2)] : null,
    };
  });

/**
 * THIS MACHINE'S OWN FLOOR.
 *
 * A canvas frame cannot be presented faster than the browser can composite
 * the canvas, and on a software rasteriser that is a function of backing-store
 * AREA and nothing else. Measured here: a loop that draws a 4×4 rectangle and
 * waits for the next frame costs 167ms at 2880×1800 and 30ms at 1440×900, on
 * the same build, with the painter itself at 1.7ms in both.
 *
 * So a raw frame time says almost nothing about the renderer on this box. The
 * floor is measured first and every frame figure is reported against it —
 * which makes the numbers portable to a machine with a GPU, where the floor
 * is one display interval.
 */
async function compositorFloor(page) {
  return page.evaluate(async () => {
    const c = document.querySelector('[data-renderer="canvas"] canvas');
    if (!c) return null;
    const g = c.getContext("2d");
    const d = [];
    let last = 0;
    for (let i = 0; i < 24; i++) {
      g.fillStyle = "rgba(0,0,0,0.001)";
      g.fillRect(0, 0, 4, 4);
      const t = await new Promise((r) => requestAnimationFrame(r));
      if (last) d.push(t - last);
      last = t;
    }
    d.sort((a, b) => a - b);
    return d[Math.floor(d.length / 2)] ?? null;
  });
}

const box = async (page) => page.locator('[data-shoot="graph-viewport"]').boundingBox();
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-shoot="graph-viewport"]');
    const g = document.querySelector('[data-shoot="signal-graph"]');
    const app = document.querySelector('[role="application"]');
    const opened = [...document.querySelectorAll('[data-opened="true"]')]
      .map((n) => (n.getAttribute("data-shoot") ?? "").replace(/^node-/, ""))
      .sort();
    const focusables = root
      ? [...root.querySelectorAll('[tabindex]:not([tabindex="-1"])')].filter(
          (el) => el.tagName !== "INPUT" && !el.closest('[data-shoot="graph-search"]')
        )
      : [];
    return {
      layout: g?.getAttribute("data-layout") ?? null,
      camera: g?.getAttribute("data-camera") ?? null,
      zoom: g?.getAttribute("data-zoom") ?? null,
      openedIds: opened,
      ariaLabel: app?.getAttribute("aria-label") ?? null,
      focusable: focusables.length,
      named: focusables.filter((t) => ((t.getAttribute("aria-label") ?? t.textContent) ?? "").trim()).length,
      stats: window.__signalCanvas?.stats ?? null,
    };
  });

const selectedId = (page) =>
  page.evaluate(() => {
    const pressed = document.querySelector('[aria-pressed="true"][data-shoot^="node-"]');
    return pressed ? pressed.getAttribute("data-shoot").replace(/^node-/, "") : null;
  });

async function search(page, q) {
  const input = page.locator('[data-shoot="graph-search"]').first();
  await input.click();
  await input.fill("");
  await input.type(q, { delay: 8 });
  await page.waitForTimeout(520);
  const first = page.locator('[data-shoot="search-result"]').first();
  if (!(await first.count())) return null;
  await first.click();
  await page.waitForTimeout(760);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(360);
  return selectedId(page);
}

console.log(`\n══ RUBRIC ENGINE — ACCEPTANCE ═════════════════════════════`);

// ─────────────────────────────────────────────────────────────────────
//  THE MATRIX
// ─────────────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await open({ layout: "rings" });
  const b = await box(page);
  const c = centre(b);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

  measured.floor = await compositorFloor(page);
  // 1 · FIT, RINGS
  measured.rings = await state(page);
  await shot("01-rings-fit");

  // 2 · HOVER / FOCUS
  await startSample(page);
  for (let i = 0; i < 80; i++) {
    await page.mouse.move(c.x - 220 + (i % 30) * 15, c.y - 60 + Math.sin(i / 3) * 40);
    if (i % 6 === 5) await page.waitForTimeout(16);
  }
  measured.hover = await stopSample(page);
  await page.mouse.move(c.x - 40, c.y - 90);
  await page.waitForTimeout(420);
  await shot("02-hover");

  // 3 · SELECTED RISK
  const risk = await search(page, "risk");
  measured.risk = { ...(await state(page)), selected: risk };
  await shot("03-selected-risk");

  // 6 · TRACE — on the claim whose inspector offers it
  const solo = page.locator('[data-shoot="intel-solo"], [data-shoot="inspector-evidence-solo"]').first();
  if (await solo.count()) {
    await startSample(page);
    await solo.click();
    await page.waitForTimeout(1300);
    measured.trace = await stopSample(page);
    measured.traceState = await state(page);
    await shot("06-trace");
    await solo.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 4 · SELECTED SOURCE ARTIFACT
  const source = await search(page, "standup");
  measured.source = { ...(await state(page)), selected: source };
  await shot("04-selected-source");

  // 5 · DENSE EVIDENCE
  await page.keyboard.press("Escape");
  await page.mouse.move(c.x - 120, c.y - 140);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -110);
  await page.waitForTimeout(900);
  measured.dense = await state(page);
  await shot("05-dense-evidence");

  // 9 · RAPID ZOOM, THEN RAPID PAN
  await page.mouse.move(c.x, c.y);
  await startSample(page);
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, i % 2 === 0 ? -120 : 100);
    if (i % 5 === 4) await page.waitForTimeout(16);
  }
  measured.zoom = await stopSample(page);

  await startSample(page);
  await page.mouse.move(c.x + 260, c.y + 200);
  await page.mouse.down();
  for (let i = 0; i < 90; i++) {
    await page.mouse.move(c.x + 260 + Math.sin(i / 4) * 240, c.y + 200 + Math.cos(i / 5) * 160);
    if (i % 6 === 5) await page.waitForTimeout(16);
  }
  await page.mouse.up();
  measured.pan = await stopSample(page);
  await shot("09-after-pan-zoom");

  measured.errorsRings = errors;
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────
//  THE MORPH, SAMPLED IN BOTH DIRECTIONS
// ─────────────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await open({ layout: "rings" });
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const toConst = page.locator('[data-shoot="layout-constellations"]');
  const toRings = page.locator('[data-shoot="layout-rings"]');

  // 7 · RINGS → CONSTELLATIONS
  await shot("07-morph-a-0-rings");
  await startSample(page);
  await toConst.click();
  for (const [i, ms] of [120, 160, 200, 260].entries()) {
    await page.waitForTimeout(ms);
    await shot(`07-morph-a-${i + 1}`);
  }
  await page.waitForTimeout(1400);
  measured.morphIn = await stopSample(page);
  measured.constellations = await state(page);
  await shot("07-morph-a-5-constellations");

  // 8 · CONSTELLATIONS → RINGS
  await startSample(page);
  await toRings.click();
  for (const [i, ms] of [120, 160, 200, 260].entries()) {
    await page.waitForTimeout(ms);
    await shot(`08-morph-b-${i + 1}`);
  }
  await page.waitForTimeout(1400);
  measured.morphOut = await stopSample(page);
  await shot("08-morph-b-5-rings");
  measured.afterMorph = await state(page);

  measured.errorsMorph = errors;
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────
//  10 · RUBRIC GESTURE STRESS — one camera, one pointer contract
// ─────────────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await open({ layout: "constellations" });
  const b = await box(page);
  const c = centre(b);
  await page.screenshot({ path: `${out}/10-rubric-gesture-rest.png` });

  await page.mouse.move(c.x - 150, c.y - 100);
  await startSample(page);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -90);
    if (i % 5 === 4) await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
  const zoomIn = await stopSample(page);
  await page.screenshot({ path: `${out}/10-rubric-gesture-zoomed.png` });

  await startSample(page);
  await page.mouse.down();
  for (let i = 0; i < 70; i++) {
    await page.mouse.move(c.x - 150 + Math.sin(i / 4) * 220, c.y - 100 + Math.cos(i / 5) * 150);
    if (i % 6 === 5) await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const pan = await stopSample(page);

  const zoomRange = await page.evaluate(() => {
    const el = document.querySelector('[data-shoot="signal-graph"]');
    return el?.getAttribute("data-zoom") ?? null;
  });
  measured.rubricGestures = { zoomIn, pan, zoomRange, errors };
  await page.screenshot({ path: `${out}/10-rubric-gesture-panned.png` });
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────
//  RECORDINGS — one continuous gesture per layout
// ─────────────────────────────────────────────────────────────────────
console.log(`\n── RECORDINGS ─────────────────────────────────────────────`);
const videos = {};
for (const layout of ["rings", "constellations"]) {
  const { ctx, page } = await open({ layout, video: true });
  const b = await box(page);
  const c = centre(b);
  for (let i = 0; i < 26; i++) await page.mouse.move(c.x - 200 + i * 14, c.y - 60 + Math.sin(i / 4) * 40);
  await page.mouse.click(c.x - 40, c.y - 90);
  await page.waitForTimeout(800);
  // and the morph, which is the thing a still cannot carry
  await page
    .locator(layout === "rings" ? '[data-shoot="layout-constellations"]' : '[data-shoot="layout-rings"]')
    .click();
  await page.waitForTimeout(1500);
  await page.mouse.move(c.x - 120, c.y - 120);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(500);
  await page.mouse.down();
  for (let i = 0; i < 28; i++)
    await page.mouse.move(c.x - 120 + Math.sin(i / 5) * 200, c.y - 120 + Math.cos(i / 6) * 130);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const v = page.video();
  await ctx.close();
  videos[layout] = v ? await v.path() : null;
  console.log(`  ${layout}: ${videos[layout] ?? "no video"}`);
}

// ─────────────────────────────────────────────────────────────────────
//  WHAT MUST STILL BE TRUE
// ─────────────────────────────────────────────────────────────────────
console.log(`\n── SEMANTICS SURVIVE THE ENGINE ───────────────────────────`);
{
  const r = measured.rings;
  const k = measured.constellations;
  check("Rings is the default layout", r.layout === "rings", `${r.layout}`);
  check("the layout switch reaches Constellations", k.layout === "constellations", `${k.layout}`);
  check("and switches back", measured.afterMorph.layout === "rings");
  check(
    "both layouts disclose exactly the same objects",
    JSON.stringify(r.openedIds) === JSON.stringify(k.openedIds),
    `${r.openedIds.length} objects`
  );
  check(
    "no node identity is lost across the morph",
    JSON.stringify(measured.afterMorph.openedIds) === JSON.stringify(r.openedIds),
    `${measured.afterMorph.openedIds.length} back`
  );
  check("search resolves to a canonical id (risk)", !!measured.risk.selected, `${measured.risk.selected}`);
  check("search resolves to a canonical id (source)", !!measured.source.selected, `${measured.source.selected}`);
  check("Trace ran", !!measured.trace);
  check(
    "the accessible mirror survives the engine",
    k.focusable > 0 && k.named === k.focusable,
    `${k.named}/${k.focusable} named`
  );
  check("the application role and label are present", !!k.ariaLabel, k.ariaLabel);
  check(
    "the label names the layout the reader is in",
    (k.ariaLabel ?? "").includes("constellations"),
    "so a screen reader is told which arrangement it is describing"
  );
  const errs = [...(measured.errorsRings ?? []), ...(measured.errorsMorph ?? [])];
  check("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
}

console.log(`\n── PERFORMANCE ────────────────────────────────────────────`);
const rows = [
  ["hover", "hover"],
  ["rapid zoom", "zoom"],
  ["rapid pan", "pan"],
  ["Trace", "trace"],
  ["morph in", "morphIn"],
  ["morph out", "morphOut"],
];
console.log(
  `  ${"gesture".padEnd(13)}${"median".padStart(8)}${"p95".padStart(8)}${"worst".padStart(8)}${">50ms".padStart(7)}${"paint".padStart(9)}`
);
for (const [label, key] of rows) {
  const m = measured[key];
  if (!m) continue;
  console.log(
    `  ${label.padEnd(13)}${fmt(m.median).padStart(8)}${fmt(m.p95).padStart(8)}${fmt(m.worst).padStart(8)}${String(m.over50).padStart(7)}${(m.paintMedian == null ? "n/a" : fmt(m.paintMedian) + "ms").padStart(9)}`
  );
}

const s = measured.constellations.stats;
if (s) {
  console.log(
    `\n  field cost: ${s.calls} draw calls · ${s.nodesPainted} painted · ${s.nodesBatched} batched · ${s.nodesCulled} culled · ${s.edgesPainted} edges in ${s.edgeBatches} batches · ${s.spritesHeld} sprites`
  );
}

console.log(`\n── RUBRIC GESTURES ────────────────────────────────────────`);
{
  const m = measured.rubricGestures;
  if (m) {
  console.log(
    `  zoom median ${fmt(m.zoomIn.median)}ms p95 ${fmt(m.zoomIn.p95)}ms  ·  pan median ${fmt(m.pan.median)}ms p95 ${fmt(m.pan.p95)}ms  ·  tier after zoom: ${m.zoomRange}`
  );
    check("Rubric gestures: no errors", m.errors.length === 0, m.errors.slice(0, 1).join(""));
  }
}

console.log(`\n── BUDGETS ────────────────────────────────────────────────`);
const FRAME = 1000 / 60;
const floor = measured.floor ?? FRAME;
console.log(
  `  this machine's compositor floor: ${fmt(floor)}ms per canvas frame (${(floor / FRAME).toFixed(1)}× a display interval)`
);
console.log(
  `  ${floor > FRAME * 1.5 ? "  → software rasteriser: frame CADENCE below is bound by canvas area, not by this code" : "  → GPU-composited: frame cadence is meaningful as an absolute number"}`
);

// WHAT IS ACTUALLY THIS RENDERER'S TO ANSWER FOR.
for (const [label, key] of rows) {
  const m = measured[key];
  if (!m || m.paintMedian == null) continue;
  check(
    `${label}: the painter stays under 8ms`,
    m.paintMedian < 8,
    `${fmt(m.paintMedian)}ms per frame`
  );
}

// AND THE CADENCE, MEASURED AGAINST THE FLOOR RATHER THAN AGAINST 60fps.
//
// A MORPH IS ALLOWED TO COST MORE, and only a morph. Every other continuous
// animation on this field — the Ring spin, the selection pulse, the Trace
// comets — is governed: where a canvas frame is expensive they switch off and
// the field is still rather than slow. A transition cannot do that, because a
// layout change that does not animate is not a morph, it is a cut. So it runs
// at whatever the machine can present, and is budgeted accordingly.
for (const [label, key] of rows) {
  const m = measured[key];
  if (!m) continue;
  const isMorph = key.startsWith("morph");
  check(
    `${label}: within ${isMorph ? 5 : 2} compositor frames of this machine's floor`,
    m.median <= floor * (isMorph ? 5 : 2) + 2,
    `${fmt(m.median)}ms vs floor ${fmt(floor)}ms (${(m.median / floor).toFixed(1)}×)`
  );
}

writeFileSync(`${out}/measurements.json`, JSON.stringify({ measured, videos, viewport: VIEWPORT }, null, 2));
console.log(`\nshots + measurements → ${out}`);
console.log(`───────────────────────────────────────────────────────────`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  await browser.close();
  process.exit(1);
}
console.log(`all checks passed`);
await browser.close();
