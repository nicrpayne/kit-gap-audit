// THE VISUAL CONVERGENCE STATES, plus the uncut playback recording.
//
// Several of these states exist ONLY while the story is playing — an event
// mid-articulation, the ghost of the memory band it just left, the delta
// that states the movement. They cannot be posed; the script plays the
// project and photographs it as it happens.
//
//   node scripts/timeline-visual-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-visual";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT, recordVideo: { dir: out, size: VIEWPORT } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await p.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "fixed", width: "16px", height: "16px", borderRadius: "50%",
      border: "2px solid #ffffff", background: "rgba(255,255,255,0.28)",
      boxShadow: "0 0 10px rgba(0,0,0,0.9)", pointerEvents: "none",
      zIndex: "2147483647", transform: "translate(-50%,-50%)", left: "-100px", top: "-100px",
    });
    document.body.appendChild(d);
    addEventListener("pointermove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("pointerdown", () => { d.style.background = "rgba(155,140,250,0.85)"; }, true);
    addEventListener("pointerup", () => { d.style.background = "rgba(255,255,255,0.28)"; }, true);
  });
});

const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const settle = (ms = 900) => p.waitForTimeout(ms);

await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
await settle(3000);

const proj = await (await fetch(`${BASE}/api/timeline`)).json();
const nowT = new Date(proj.now).getTime();

// ── 1 / 8 / 19: at NOW, the seam, the transport ────────────────────
await shot("v01-timeline-at-now");
await shot("v08-now-boundary");
await p.locator('[data-shoot="transport"]').screenshot({ path: `${out}/v19-transport.png` });

// ── 2: the beginning, history not yet played ───────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1500);
await shot("v02-beginning-unplayed");

// ── 3 / 5 / 6 / 7: caught during the run ───────────────────────────
// Articulation, the first memory band, the step, and the ghost+delta all
// occur while playing; the loop watches for each and photographs it.
await p.locator('[data-shoot="play"]').click();
let gotArticulating = false, gotMemory = false, gotGhost = false;
for (let i = 0; i < 220; i++) {
  await p.waitForTimeout(120);
  if (!gotArticulating && (await p.locator('[data-shoot^="event-module-"]').count()) > 0) {
    await shot("v03-event-mid-articulation");
    gotArticulating = true;
  }
  if (!gotMemory && (await p.locator('[data-shoot="forecast-memory"]').count()) > 0) {
    await settle(260);
    await shot("v05-report-a-forecast-memory");
    gotMemory = true;
  }
  if (!gotGhost && (await p.locator('[data-shoot="forecast-memory-ghost"]').count()) > 0) {
    await shot("v06-report-b-remembered-future-moved");
    await shot("v07-old-memory-ghost-plus-new");
    gotGhost = true;
  }
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 8) break;
}
await settle(2200);
// ── 4: the same events, settled into crossed history ───────────────
await shot("v04-settled-into-crossed-history");
await shot("v16-four-lane-composition");

// ── 9 / 10: planned vs overdue ─────────────────────────────────────
const futureLm = proj.entries.find(
  (e) => e.kind === "landmark" && e.temporalState === "planned" && new Date(e.date).getTime() > nowT
);
if (futureLm) {
  await p.locator(`[data-shoot="event-${futureLm.id}"]`).dispatchEvent("click");
  await settle(900);
  await shot("v09-future-planned-landmark");
}
const overdueLm = proj.entries.find((e) => e.kind === "landmark" && e.detail?.overdue === true);
if (overdueLm) {
  await p.locator(`[data-shoot="event-${overdueLm.id}"]`).dispatchEvent("click");
  await settle(900);
  await shot("v10-overdue-planned-landmark");
}

// ── 11 / 12: candidate intake ──────────────────────────────────────
const dateless = proj.candidates.find((c) => !c.date);
if (dateless) {
  await p.locator('[data-shoot="event-intake-toggle"]').click();
  await settle(800);
  await shot("v11-candidate-intake");
  await p.locator(`[data-shoot="intake-${dateless.id}"]`).click();
  await settle(900);
  await shot("v12-dateless-candidate");
  await p.locator('[data-shoot="event-intake-toggle"]').click();
  await settle(600);
}

// ── 13 / 14 / 15: the three inspectors ─────────────────────────────
for (const [kind, name] of [
  ["report", "v13-inspector-report"],
  ["decision_raised", "v14-inspector-decision"],
  ["context_observed", "v15-inspector-context"],
]) {
  const e = proj.entries.find((x) => x.kind === kind);
  if (!e) continue;
  await p.locator(`[data-shoot="event-${e.id}"]`).dispatchEvent("click");
  await settle(950);
  await shot(name);
}

// ── 18: a quiet stretch ────────────────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1300);
await shot("v18-quiet-period");

// ── 17: eight lanes ────────────────────────────────────────────────
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const extra = [];
const laneCount = proj.lanes.length;
for (let i = laneCount; i < 8; i++) {
  const name = `Stress ${i + 1}`;
  const existing = await db.scope.findFirst({ where: { name } });
  extra.push((existing ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }))).id);
}
if (extra.length > 0) {
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  await p.locator('[data-shoot="play"]').click();
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(140);
    if ((await p.locator('[data-shoot^="event-module-"]').count()) > 0) break;
  }
  await shot("v17-eight-lane-stress");
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(700);
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2400);
}
await db.$disconnect();

// ── THE VIDEO: one uninterrupted run ───────────────────────────────
await p.locator('[data-shoot="to-beginning"]').hover();
await settle(600);
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1700);
await p.locator('[data-shoot="play"]').hover();
await settle(600);
await p.locator('[data-shoot="play"]').click();
for (let i = 0; i < 260; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 8) break;
}
await settle(2600);

// scrub by hand into the future, to a plan
{
  const host = await p.locator('[data-shoot="time-field"]').boundingBox();
  const head = await p.locator('[data-shoot="playhead"]').boundingBox();
  const y = host.y + host.height / 2;
  const fromX = head ? head.x : host.x + host.width * 0.45;
  const toX = host.x + host.width * 0.87;
  await p.mouse.move(fromX, y);
  await p.mouse.down();
  for (let i = 1; i <= 44; i++) {
    await p.mouse.move(fromX + ((toX - fromX) * i) / 44, y);
    await p.waitForTimeout(26);
  }
  await p.mouse.up();
  await settle(1600);
}
if (futureLm) {
  await p.locator(`[data-shoot="event-${futureLm.id}"]`).dispatchEvent("click");
  await settle(2400);
}
await p.locator('[data-shoot="to-now"]').hover();
await settle(600);
await p.locator('[data-shoot="to-now"]').click().catch(() => {});
await settle(2800);

await ctx.close();
await b.close();
console.log(`states + video → ${out}`);
