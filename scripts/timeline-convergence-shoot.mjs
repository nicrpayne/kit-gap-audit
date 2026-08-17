// VISUAL CONVERGENCE — twenty-two states.
//
// Ordered the way the surface is met: the quiet whole, then the master
// display, then the objects on the canvas close up, then what opening a
// project buys, then the two things the score is really arguing about
// (what happened, and whether we land in time), then density.
//
//   node scripts/timeline-convergence-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-convergence";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const DAY = 86400000;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n, clip) => { await p.screenshot({ path: `${out}/${n}.png`, ...(clip ? { clip } : {}) }); console.log(`shot ${n}`); };
const settle = (ms = 900) => p.waitForTimeout(ms);
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const park = async () => { await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6); await settle(400); };
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2700);
  await park();
};
/** A crop around an element, with room to see what it sits in. */
const around = async (sel, pad = 40) => {
  const r = await box(sel);
  return {
    x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad),
    width: Math.min(VIEWPORT.width - Math.max(0, r.x - pad), r.width + pad * 2),
    height: Math.min(VIEWPORT.height - Math.max(0, r.y - pad), r.height + pad * 2),
  };
};

await open();
const j = await proj();
const laneOf = (n) => j.lanes.find((l) => l.name === n) ?? j.lanes[0];
const jsa = laneOf("JSA");
const plat = laneOf("Platform");
const itrack = laneOf("iTrack");

// ── 01–03. THE WHOLE, AND THE DISPLAY ──────────────────────────────
await shot("01-resting-canvas");
await shot("02-master-display", { x: 0, y: 0, width: VIEWPORT.width, height: 92 });

await p.locator(`[data-shoot="memory-${plat.scopeId}"]`).hover();
await settle(700);
await shot("03-readout-woken", { x: 0, y: 0, width: VIEWPORT.width, height: 92 });
await park();

// ── 04–06. THE PLAN OBJECT AS A PART ───────────────────────────────
const mk = j.entries.find((e) => e.title === "Marketing plan");
const sel = `[data-shoot="plan-${mk.id}"]`;
await shot("04-plan-objects-at-rest", { x: 900, y: 170, width: 780, height: 130 });
{
  const r = await box(sel);
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await settle(650);
  await shot("05-plan-object-held", await around(sel, 56));
}
await p.locator(sel).dispatchEvent("click");
await settle(1000);
await park();
await shot("06-selected-with-inspector");

// ── 07. THE SEAM ───────────────────────────────────────────────────
await p.keyboard.press("Escape");
await settle(800);
await shot("07-inspector-seam", await around('[data-shoot="inspector-seam"]', 30));

// ── 08–09. A RUN OF HISTORY ────────────────────────────────────────
{
  const cluster = await p.locator('[data-shoot^="history-cluster-"]').first();
  const r = await cluster.boundingBox();
  const clip = { x: Math.max(0, r.x - 150), y: Math.max(0, r.y - 60), width: 420, height: 130 };
  await shot("08-history-clustered", clip);
  const target = await p.evaluate(() => {
    const m = document.querySelector("[data-muted]");
    const q = m.getBoundingClientRect();
    return [q.left + q.width / 2, q.top + q.height / 2];
  });
  await p.mouse.move(target[0] - 60, target[1] - 50);
  await settle(200);
  await p.mouse.move(target[0], target[1]);
  await settle(800);
  await shot("09-pointing-into-a-run", clip);
  await park();
}

// ── 10–13. THE SECOND RESOLUTION ───────────────────────────────────
{
  const compact = await around(`[data-shoot="lane-header-${jsa.scopeId}"]`, 8);
  await shot("10-project-compact", { x: 60, y: compact.y, width: 1600, height: compact.height });
  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).click({ position: { x: 70, y: 60 } });
  await settle(1100);
  await park();
  await shot("11-project-opened-full");
  const opened = await around(`[data-shoot="lane-header-${jsa.scopeId}"]`, 8);
  await shot("12-project-opened", { x: 60, y: opened.y, width: 1600, height: Math.min(430, opened.height) });
  await shot("13-opened-plan-detail", { x: 700, y: opened.y + 40, width: 700, height: 210 });
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await settle(900);
  await park();
}

// ── 14–15. FORECAST AGAINST TARGET ─────────────────────────────────
{
  const ties = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')].map((e) => {
      const r = e.getBoundingClientRect();
      return { gap: +e.getAttribute("data-gap-days"), x: r.left, y: r.top, w: r.width };
    }));
  const clear = ties.find((t) => t.gap >= 0) ?? ties[0];
  const late = ties.find((t) => t.gap < 0) ?? ties[0];
  await shot("14-forecast-clear-of-target",
    { x: Math.max(0, clear.x - 210), y: Math.max(0, clear.y - 78), width: Math.min(760, VIEWPORT.width - Math.max(0, clear.x - 210)), height: 130 });
  await shot("15-forecast-late-against-target",
    { x: Math.max(0, late.x - 210), y: Math.max(0, late.y - 78), width: Math.min(760, VIEWPORT.width - Math.max(0, late.x - 210)), height: 130 });
}

// ── 16–18. PLAYBACK ────────────────────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(900);
await p.locator('[data-shoot="play"]').click();
await settle(1600);
await shot("16-playback-future-receded");
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(110);
  if ((await p.locator('[data-shoot^="event-module-"]').count()) >= 2) break;
}
await shot("17-playback-mid-story");
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await settle(1700);
await park();
await shot("18-back-at-live-now");

// ── 19–21. COMPOSING, STILL ────────────────────────────────────────
await open();
{
  const axis = await p.evaluate(() => {
    const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")];
    const pts = els.map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left }))
      .sort((a, c) => a.t - c.t);
    return { pxPerMs: (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t), t0: pts[0].t, x0: pts[0].x };
  });
  const xOf = (t) => axis.x0 + (t - axis.t0) * axis.pxPerMs;
  const bed = await box(`[data-shoot="plan-bed-${itrack.scopeId}"]`);
  const taken = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')].map((e) => {
      const r = e.getBoundingClientRect(); return [r.top, r.bottom];
    }));
  let y = bed.y + bed.height - 6;
  for (let f = 0.9; f > 0.05; f -= 0.06) {
    const c = bed.y + bed.height * f;
    if (!taken.some(([t, bt]) => c >= t - 2 && c <= bt + 2)) { y = c; break; }
  }
  const t0 = new Date(Date.now() + 30 * DAY); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(Date.now() + 51 * DAY); t1.setHours(0, 0, 0, 0);
  await p.mouse.move(xOf(t0.getTime()), y);
  await settle(140);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(xOf(t0.getTime()) + ((xOf(t1.getTime()) - xOf(t0.getTime())) * i) / 12, y);
    await p.waitForTimeout(30);
  }
  await settle(320);
  await shot("19-drawing-a-span");
  await p.mouse.up();
  await settle(450);
  await p.keyboard.type("Pilot readiness");
  await settle(400);
  await shot("20-inline-naming");
  await p.keyboard.press("Enter");
  await settle(1900);
  await p.keyboard.press("Escape");
  await settle(600);
  await park();
  await shot("21-composed-object-seated");
  for (const e of (await proj()).entries.filter((x) => x.title === "Pilot readiness")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
}

// ── 22. EIGHT PROJECTS ─────────────────────────────────────────────
{
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const extra = [];
  try {
    for (let i = j.lanes.length; i < 8; i++) {
      const name = `Stress ${i + 1}`;
      const ex = await db.scope.findFirst({ where: { name } });
      const row = ex ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }));
      if (!ex) extra.push(row.id);
    }
    await open();
    await shot("22-eight-projects");
  } finally {
    for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }
}

await b.close();
console.log(`\nframes in ${out}`);
