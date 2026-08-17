// SEMANTIC POLISH — fifteen states.
//
// Ordered as the interaction hierarchy this pass was built to protect:
// default is calm, hover explains, select acts, opening a project resolves,
// play narrates.
//
//   node scripts/timeline-semantic-polish-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-semantic-polish";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };

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
/** A crop centred on a tie, wide enough to hold the capsule and the flag. */
const tieClip = async (wantLate) => {
  const t = await p.evaluate((late) => {
    const all = [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')];
    const pick = all.find((e) => (late ? e.hasAttribute("data-late") : !e.hasAttribute("data-late"))) ?? all[0];
    const r = pick.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, lane: pick.closest("g[data-shoot^='forecast-memory']") ? 1 : 0 };
  }, wantLate);
  return {
    x: Math.max(0, t.x - 240),
    y: Math.max(0, t.y - 86),
    width: Math.min(820, VIEWPORT.width - Math.max(0, t.x - 240)),
    height: 150,
  };
};

await open();
const j = await proj();
const laneOf = (n) => j.lanes.find((l) => l.name === n) ?? j.lanes[0];
const jsa = laneOf("JSA");

// ── 01. four projects, resting ──────────────────────────────────────
await shot("01-four-projects-resting");

// ── 03–04. the history cluster ──────────────────────────────────────
{
  // The cluster whose lane also holds a muted mark we can point into, so
  // frames 03 and 04 are the same crop of the same run.
  const cl = await p.locator('[data-shoot^="history-cluster-"]').first().boundingBox();
  const clip = { x: Math.max(0, cl.x - 190), y: Math.max(0, cl.y - 62), width: 480, height: 134 };
  await shot("03-history-cluster-rest", clip);
  const at = await p.evaluate(() => {
    const m = document.querySelector("[data-muted]");
    const r = m.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  await p.mouse.move(at[0] - 60, at[1] - 50);
  await settle(200);
  await p.mouse.move(at[0], at[1]);
  await settle(800);
  await shot("04-history-cluster-hovered", clip);
  await park();
}

// ── 05–06. the plan object ──────────────────────────────────────────
const mk = j.entries.find((e) => e.title === "Marketing plan");
const sel = `[data-shoot="plan-${mk.id}"]`;
{
  const r = await box(sel);
  const clip = { x: Math.max(0, r.x - 90), y: Math.max(0, r.y - 54), width: 660, height: 150 };
  await shot("05-plan-object-rest", clip);
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await settle(650);
  await shot("06-plan-object-hover", clip);
  await park();
}

// ── 07–10. forecast against target, compact then resolved ───────────
await shot("07-forecast-clear-compact", await tieClip(false));
await shot("09-forecast-late-compact", await tieClip(true));
{
  // Hover the project that is CLEAR of its target, then the late one.
  const clearLane = await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')]
      .find((e) => !e.hasAttribute("data-late"));
    const r = t.getBoundingClientRect();
    const lanes = [...document.querySelectorAll("[data-shoot^='lane-header-']")];
    const hit = lanes.find((l) => {
      const q = l.getBoundingClientRect();
      return r.top >= q.top && r.top <= q.bottom;
    });
    return hit?.getAttribute("data-shoot").replace("lane-header-", "") ?? null;
  });
  if (clearLane) {
    await p.locator(`[data-shoot="lane-header-${clearLane}"]`).hover();
    await settle(700);
    await shot("08-forecast-clear-resolved", await tieClip(false));
    await park();
  }
  const lateLane = await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')]
      .find((e) => e.hasAttribute("data-late"));
    const r = t.getBoundingClientRect();
    const lanes = [...document.querySelectorAll("[data-shoot^='lane-header-']")];
    const hit = lanes.find((l) => {
      const q = l.getBoundingClientRect();
      return r.top >= q.top && r.top <= q.bottom;
    });
    return hit?.getAttribute("data-shoot").replace("lane-header-", "") ?? null;
  });
  if (lateLane) {
    await p.locator(`[data-shoot="lane-header-${lateLane}"]`).hover();
    await settle(700);
    await shot("10-forecast-late-resolved", await tieClip(true));
    await park();
  }
}

// ── 13. an active project opened ────────────────────────────────────
{
  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).click({ position: { x: 70, y: 55 } });
  await settle(1100);
  await park();
  await shot("13-active-project-opened");
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await settle(800);
}

// ── 14–15. playback, then Live Now ──────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(900);
await p.locator('[data-shoot="play"]').click();
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(110);
  if ((await p.locator('[data-shoot^="event-module-"]').count()) >= 2) break;
}
await shot("14-playback-mid-history");
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await settle(1700);
await park();
await shot("15-back-at-live-now");

// ── 02, 11, 12. eight projects, dormant rails, one woken ────────────
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
    await shot("02-eight-projects-resting");
    const rails = await p.evaluate(() =>
      [...document.querySelectorAll("[data-shoot^='lane-header-'][data-dormant]")].map((e) => {
        const r = e.getBoundingClientRect();
        return { id: e.getAttribute("data-shoot").replace("lane-header-", ""), y: r.top, h: r.height };
      }));
    if (rails.length) {
      const top = rails[0].y - 14;
      await shot("11-dormant-projects", {
        x: 60, y: Math.max(0, top),
        width: 1600,
        height: Math.min(VIEWPORT.height - Math.max(0, top), rails.length * rails[0].h + 28),
      });
      const hb = await box(`[data-shoot="lane-header-${rails[0].id}"]`);
      await p.locator(`[data-shoot="lane-header-${rails[0].id}"]`)
        .click({ position: { x: 70, y: Math.round(hb.height / 2) } });
      await settle(1100);
      await park();
      await shot("12-dormant-project-opened");
    }
  } finally {
    for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }
}

await b.close();
console.log(`\nframes in ${out}`);
