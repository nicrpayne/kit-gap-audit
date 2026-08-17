// COMPOSE THE FUTURE — eighteen states.
//
// The order a person meets the surface: the quiet canvas, then what
// happens when they point at it, hold something, compose something,
// arrange it, change their mind, and finally play the whole thing.
//
//   node scripts/timeline-direct-composition-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-dc-shoot";
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
const box = (sel) => p.locator(sel).boundingBox();
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2700);
};
const park = async () => { await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6); await settle(400); };
const readAxis = (skip = null) =>
  p.evaluate((id) => {
    const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")]
      .filter((e) => e.getAttribute("data-shoot") !== `plan-${id}`);
    const pts = els.map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left }))
      .sort((a, c) => a.t - c.t);
    return { pxPerMs: (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t), t0: pts[0].t, x0: pts[0].x };
  }, skip);
const drag = async (x0, y0, x1, y1, steps = 12) => {
  await p.mouse.move(x0, y0);
  await settle(110);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await p.waitForTimeout(32);
  }
};
const emptyBedY = async (scopeId) => {
  const bed = await box(`[data-shoot="plan-bed-${scopeId}"]`);
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
const itrack = laneOf("iTrack");
let axis = await readAxis();
const xOf = (t) => axis.x0 + (t - axis.t0) * axis.pxPerMs;

// ── 01. the quiet canvas ───────────────────────────────────────────
await shot("01-resting-canvas");

// ── 02. hovering a plan object ─────────────────────────────────────
let mk = j.entries.find((e) => e.title === "Marketing plan");
const mkOriginal = { date: mk.date, endDate: mk.endDate, scopeId: mk.scopeId };
const sel = `[data-shoot="plan-${mk.id}"]`;
{
  const bb = await box(sel);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await settle(600);
  await shot("02-hovering-marketing-plan");
}

// ── 03. selected, inspector revealed ───────────────────────────────
await p.locator(sel).dispatchEvent("click");
await settle(1000);
await park();
await shot("03-selected-with-inspector");

// ── 04. dismissed, canvas returned ─────────────────────────────────
await p.keyboard.press("Escape");
await settle(800);
await shot("04-inspector-dismissed");

// ── 05. JSA opened, overlapping plan visible ───────────────────────
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(900);
await park();
await shot("05-jsa-expanded-overlap");
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(700);

// ── 06–08. composing directly on the field ─────────────────────────
{
  const y = await emptyBedY(itrack.scopeId);
  const t0 = new Date(Date.now() + 34 * DAY); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(Date.now() + 52 * DAY); t1.setHours(0, 0, 0, 0);
  await drag(xOf(t0.getTime()), y, xOf(t1.getTime()), y);
  await settle(350);
  await shot("06-drawing-a-span");
  await p.mouse.up();
  await settle(450);
  await p.keyboard.type("Launch readiness");
  await settle(400);
  await shot("07-inline-naming");
  await p.keyboard.press("Enter");
  await settle(1800);
  await p.keyboard.press("Escape");
  await settle(500);
  await park();
  await shot("08-new-span-placed");
}

// ── 09. resizing ───────────────────────────────────────────────────
{
  axis = await readAxis(mk.id);
  const bb = await box(sel);
  const cy = bb.y + bb.height / 2;
  await p.mouse.move(bb.x + bb.width / 2, cy);
  await settle(340);
  const edge = await p.evaluate(
    (id) => document.querySelector(`[data-shoot="plan-${id}"] rect:nth-of-type(2)`).getBoundingClientRect().right, mk.id);
  await drag(edge - 1, cy, edge - 1 + 7 * DAY * axis.pxPerMs, cy);
  await settle(350);
  await shot("09-resizing");
  await p.mouse.up();
  await settle(1600);
}

// ── 10. moving horizontally ────────────────────────────────────────
await park();
{
  axis = await readAxis(mk.id);
  const bb = await box(sel);
  await drag(bb.x + bb.width / 2, bb.y + bb.height / 2, bb.x + bb.width / 2 + 9 * DAY * axis.pxPerMs, bb.y + bb.height / 2);
  await settle(350);
  await shot("10-moving-horizontally");
  await p.mouse.up();
  await settle(1600);
}

// ── 11. carried into another project ───────────────────────────────
await park();
{
  const bb = await box(sel);
  const target = await box(`[data-shoot="lane-header-${itrack.scopeId}"]`);
  await drag(bb.x + bb.width / 2, bb.y + bb.height / 2, bb.x + bb.width / 2, target.y + target.height / 2, 14);
  await settle(350);
  await shot("11-cross-project-reassignment");
  await p.mouse.up();
  await settle(1700);
}

// ── 12. undone ─────────────────────────────────────────────────────
await park();
await p.keyboard.press("Control+z");
await settle(1700);
await p.keyboard.press("Control+z");
await settle(1700);
await p.keyboard.press("Control+z");
await settle(1700);
await park();
await shot("12-undo-restored");

// ── 13. a moment, by double-click ──────────────────────────────────
{
  const y = await emptyBedY(itrack.scopeId);
  const t = new Date(Date.now() + 60 * DAY); t.setHours(0, 0, 0, 0);
  await p.mouse.dblclick(xOf(t.getTime()), y);
  await settle(500);
  await p.keyboard.type("Marketing kickoff");
  await settle(400);
  await shot("13-point-event-creation");
  await p.keyboard.press("Escape");
  await settle(600);
}

// ── 14. project composition ────────────────────────────────────────
await open();
await p.locator('[data-shoot="lanes-toggle"]').click();
await settle(600);
await p.locator(`[data-shoot="lane-row-${jsa.scopeId}"]`).hover();
await settle(400);
await shot("14-projects-composition");
await p.keyboard.press("Escape");
await settle(500);

// ── 17–18. playback, then Live Now ─────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(900);
await p.locator('[data-shoot="play"]').click();
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(110);
  if ((await p.locator('[data-shoot^="event-module-"]').count()) >= 2) break;
}
await shot("17-during-playback");
for (let i = 0; i < 220; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await settle(1600);
await park();
await shot("18-live-now-final");

// tidy the objects this shoot composed
{
  const after = await proj();
  for (const e of after.entries.filter((x) => x.title === "Launch readiness" || x.title === "Marketing kickoff")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mkOriginal),
  });
}

// ── 15–16. both densities ──────────────────────────────────────────
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
  await shot("15-eight-lanes-compact");
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await settle(900);
  await park();
  await shot("16-eight-lanes-one-expanded");
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

await b.close();
console.log(`\nframes in ${out}`);
