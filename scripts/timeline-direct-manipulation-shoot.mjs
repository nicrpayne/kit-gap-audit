// COMPOSING THE FUTURE, IN TWELVE STATES.
//
// The order is the order a person meets the surface: the calm resting
// canvas, then depth, then every gesture that changes it, then the two
// densities it has to survive.
//
//   node scripts/timeline-direct-manipulation-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-dm-shoot";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const DAY = 86400000;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: VIEWPORT })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`shot ${n}`); };
const settle = (ms = 900) => p.waitForTimeout(ms);
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2700);
};
const park = async () => { await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6); await settle(450); };
const readAxis = () =>
  p.evaluate(() => {
    const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")];
    const pts = els.map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left })).sort((a, c) => a.t - c.t);
    return { pxPerMs: (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t), t0: pts[0].t, x0: pts[0].x };
  });
const drag = async (x0, y0, x1, y1, steps = 12) => {
  await p.mouse.move(x0, y0);
  await settle(120);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await p.waitForTimeout(35);
  }
};
const emptyBedY = async (scopeId) => {
  const bed = await p.locator(`[data-shoot="plan-bed-${scopeId}"]`).boundingBox();
  const taken = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')].map((e) => {
      const r = e.getBoundingClientRect();
      return [r.top, r.bottom];
    }));
  for (let f = 0.92; f > 0.05; f -= 0.06) {
    const y = bed.y + bed.height * f;
    if (!taken.some(([t, bt]) => y >= t - 2 && y <= bt + 2)) return y;
  }
  return bed.y + bed.height - 3;
};

await open();
const j = await proj();
const laneOf = (n) => j.lanes.find((l) => l.name === n) ?? j.lanes[0];
const jsa = laneOf("JSA");
const plat = laneOf("Platform");
const itrack = laneOf("iTrack");
const axis = await readAxis();
const xOf = (t) => axis.x0 + (t - axis.t0) * axis.pxPerMs;

// ── 1. the calm resting canvas ─────────────────────────────────────
await shot("01-resting-canvas");

// ── 2. JSA opened, overlapping activity visible ────────────────────
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(900);
await park();
await shot("02-lane-opened-overlap");
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(700);

// ── 3–4. drawing a span, then naming it ────────────────────────────
{
  const y = await emptyBedY(itrack.scopeId);
  const t0 = new Date(Date.now() + 36 * DAY); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(Date.now() + 58 * DAY); t1.setHours(0, 0, 0, 0);
  await drag(xOf(t0.getTime()), y, xOf(t1.getTime()), y);
  await settle(300);
  await shot("03-drawing-a-span");
  await p.mouse.up();
  await settle(500);
  await p.keyboard.type("Marketing plan");
  await settle(400);
  await shot("04-inline-naming");
  await p.keyboard.press("Escape");
  await settle(600);
}

// ── 5. an existing plan mid-horizontal drag ────────────────────────
const mk = (await proj()).entries.find((e) => e.title === "Marketing plan");
{
  await open();
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + 9 * DAY * axis.pxPerMs, box.y + box.height / 2);
  await settle(400);
  await shot("05-mid-horizontal-drag");
  await p.keyboard.press("Escape");
  await p.mouse.up();
  await settle(1400);
  await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: mk.date, endDate: mk.endDate }),
  });
}

// ── 6. carried into another project ────────────────────────────────
{
  await open();
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const target = await p.locator(`[data-shoot="lane-header-${itrack.scopeId}"]`).boundingBox();
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2, target.y + target.height / 2, 14);
  await settle(400);
  await shot("06-mid-project-reassignment");
  await p.mouse.up();
  await settle(1500);
  await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeId: jsa.scopeId, date: mk.date, endDate: mk.endDate }),
  });
}

// ── 7. right-edge resize ───────────────────────────────────────────
{
  await open();
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const cy = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width / 2, cy);
  await settle(320);
  await drag(box.x + box.width - 1, cy, box.x + box.width - 1 + 8 * DAY * axis.pxPerMs, cy);
  await settle(400);
  await shot("07-right-edge-resize");
  await p.mouse.up();
  await settle(1400);
  await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: mk.date, endDate: mk.endDate }),
  });
}

// ── 8. a point event ───────────────────────────────────────────────
{
  await open();
  const pin = (await proj()).entries.find((e) => e.title === "App Store submission");
  const box = await p.locator(`[data-shoot="plan-${pin.id}"]`).boundingBox();
  await p.mouse.move(box.x + 3, box.y + box.height / 2);
  await settle(700);
  await shot("08-point-event");
}

// ── 9. plan, Forecast and target in one lane ───────────────────────
{
  await p.locator(`[data-shoot="lane-expand-${plat.scopeId}"]`).click();
  await settle(900);
  await park();
  await shot("09-plan-forecast-target");
  await p.locator(`[data-shoot="lane-expand-${plat.scopeId}"]`).click();
  await settle(600);
}

// ── 12. a selected plan object, with the inspector ─────────────────
{
  await open();
  await p.locator(`[data-shoot="plan-${mk.id}"]`).dispatchEvent("click");
  await settle(1000);
  await park();
  await shot("12-selected-plan-and-inspector");
}

// ── 10–11. both densities ──────────────────────────────────────────
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
  await shot("10-eight-lanes-compact");
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await settle(900);
  await park();
  await shot("11-eight-lanes-one-opened");
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

await b.close();
console.log(`\nframes in ${out}`);
