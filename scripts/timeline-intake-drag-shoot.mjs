// EVENT INTAKE → REALITY — eighteen states.
//
// The arc of one gesture: material on a rack, lifted, carried, previewed,
// released, seated, undone, redone — then the same for a moment, a dateless
// piece that cannot go, and a project that had nothing until now.
//
//   node scripts/timeline-intake-drag-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";

const out = process.argv[2] ?? "/tmp/timeline-intake";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const db = new PrismaClient();

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
  await settle(2600);
  await park();
};
const openTray = async () => {
  if ((await p.locator('[data-shoot="event-intake"]').count()) === 0) {
    await p.locator('[data-shoot="event-intake-toggle"]').click();
    await settle(700);
  }
};
const laneMid = async (scopeId) => {
  const l = await box(`[data-shoot="lane-header-${scopeId}"]`);
  return l.y + l.height / 2;
};
const lift = async (candidateId) => {
  const card = await box(`[data-shoot="intake-${candidateId}"]`);
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  await p.mouse.move(card.x + 60, card.y - 34, { steps: 4 });
  await settle(220);
  return card;
};
const carryTo = async (from, x, y) => {
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(from.x + 60 + (x - from.x - 60) * (i / 10), from.y - 34 + (y - from.y + 34) * (i / 10));
  }
  await settle(300);
};
/** A crop around the tray, for the material close-ups. */
const trayClip = async () => {
  const t = await box('[data-shoot="event-intake"]');
  return { x: 60, y: t.y - 6, width: 1600, height: t.height + 12 };
};

// Put back anything an earlier run left on the score.
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  for (const c of await db.timelineEventCandidate.findMany({ where: { status: "accepted" } })) {
    const live = c.acceptedEventId
      ? await db.timelineEvent.findUnique({ where: { id: c.acceptedEventId }, select: { id: true } })
      : null;
    if (!live) {
      await db.timelineEventCandidate.update({ where: { id: c.id }, data: { status: "pending", acceptedEventId: null } });
    }
  }
}

await open();
const j = await proj();
const laneOf = (n) => j.lanes.find((l) => l.name === n) ?? j.lanes[0];
const jsa = laneOf("JSA");
const itrack = laneOf("iTrack");
const platform = laneOf("Platform");
const activity = j.candidates.find((c) => c.date && c.endDate);
const moment = j.candidates.find((c) => c.title === "Executive launch review");
const undated = j.candidates.find((c) => !c.date);

// ── 01. Live Now, intake closed ────────────────────────────────────
await shot("01-live-now-intake-closed");

// ── 02. the rack ───────────────────────────────────────────────────
await openTray();
await park();
await shot("02-event-intake-open");
await shot("02b-candidate-material", await trayClip());

// ── 03. a candidate selected, provenance shown ─────────────────────
await p.locator(`[data-shoot="intake-${activity.id}"]`).click();
await settle(1000);
await park();
await shot("03-candidate-provenance");
await p.keyboard.press("Escape");
await settle(700);

// ── 04–07. lifted, carried, previewed ──────────────────────────────
const field = await box('[data-shoot="time-field"]');
{
  await openTray();
  const card = await lift(activity.id);
  // Over the lane-header column, which is chrome rather than score — so the
  // piece is genuinely in flight with nowhere yet to land, which is the state
  // this frame is for.
  const headers = await box(`[data-shoot="lane-header-${jsa.scopeId}"]`);
  await p.mouse.move(headers.x + headers.width * 0.55, headers.y + headers.height / 2, { steps: 6 });
  await settle(320);
  await shot("04-activity-lifted");
  await shot("04b-in-hand", {
    x: Math.max(0, headers.x - 20), y: Math.max(0, headers.y - 40), width: 640, height: 220,
  });

  await carryTo(card, field.x + field.width * 0.55, await laneMid(jsa.scopeId));
  await shot("05-hovering-jsa");
  const jsaY = await laneMid(jsa.scopeId);
  await shot("05b-placement-preview", {
    x: Math.max(0, field.x + field.width * 0.42), y: Math.max(0, jsaY - 90), width: 700, height: 200,
  });

  await p.mouse.move(field.x + field.width * 0.7, await laneMid(itrack.scopeId));
  await settle(320);
  await shot("06-hovering-itrack-later-date");

  await p.mouse.move(field.x + field.width * 0.62, await laneMid(jsa.scopeId));
  await settle(320);
  await shot("07-valid-drop-preview");

  // ── 08–09. released: candidate material becomes Reality ──────────
  await p.mouse.up();
  await settle(2400);
  await park();
  await shot("08-seated-reality-object");
  const placed = (await proj()).entries.find((e) => e.title === activity.title && e.family === "landmark");
  await shot("08b-candidate-became-reality", {
    x: Math.max(0, field.x + field.width * 0.42), y: Math.max(0, (await laneMid(jsa.scopeId)) - 90), width: 700, height: 200,
  });
  await p.locator(`[data-shoot="plan-${placed.id}"]`).dispatchEvent("click");
  await settle(1100);
  await park();
  await shot("09-inspector-after-placement");
  await shot("09b-origin-preserved", await (async () => {
    const d = await box('[data-shoot="inspector-dock"]');
    return { x: d.x, y: d.y, width: d.width, height: Math.min(d.height, 900) };
  })());

  // ── 10–11. undo, redo ───────────────────────────────────────────
  await p.keyboard.press("Escape");
  await settle(500);
  await p.keyboard.press("Control+z");
  await settle(2500);
  await openTray();
  await park();
  await shot("10-undo-back-on-the-rack");
  await shot("10b-restored", await trayClip());
  await p.keyboard.press("Control+Shift+z");
  await settle(2500);
  await park();
  await shot("11-redo-seated-again");
}

// ── 12. a dated moment being placed ────────────────────────────────
{
  await open();
  await openTray();
  const card = await lift(moment.id);
  await carryTo(card, field.x + field.width * 0.5, await laneMid(platform.scopeId));
  await shot("12-moment-being-placed");
  await p.mouse.up();
  await settle(2300);
  await park();
}

// ── 13. the dateless piece ─────────────────────────────────────────
{
  await open();
  await openTray();
  await p.locator(`[data-shoot="intake-${undated.id}"]`).click();
  await settle(1000);
  await park();
  await shot("13-dateless-candidate");
  await p.keyboard.press("Escape");
  await settle(600);
}

// ── 14–15. a dormant project targeted, then woken by a placement ───
{
  const extra = [];
  try {
    const name = "Ops handover";
    const ex = await db.scope.findFirst({ where: { name } });
    const row = ex ?? (await db.scope.create({ data: { name, teamKey: "OPS" } }));
    if (!ex) extra.push(row.id);

    await open();
    await openTray();
    const cur = await proj();
    const piece = cur.candidates.find((c) => c.date);
    const rail = await box(`[data-shoot="lane-header-${row.id}"]`);
    const card = await lift(piece.id);
    await carryTo(card, field.x + field.width * 0.56, rail.y + rail.height / 2);
    await shot("14-dormant-project-targeted");
    await shot("14b-rail-as-target", { x: 60, y: Math.max(0, rail.y - 30), width: 1600, height: 110 });
    await p.mouse.up();
    await settle(2500);
    await park();
    await shot("15-dormant-project-woken");

    // ── 16. eight-project density, after all of it ────────────────
    for (let i = cur.lanes.length + 1; i < 8; i++) {
      const n = `Stress ${i + 1}`;
      const e2 = await db.scope.findFirst({ where: { name: n } });
      const r2 = e2 ?? (await db.scope.create({ data: { name: n, teamKey: "SOF" } }));
      if (!e2) extra.push(r2.id);
    }
    await open();
    await shot("16-eight-project-density");
  } finally {
    for (const id of extra) {
      const cur = await proj().catch(() => null);
      for (const e of (cur?.entries ?? []).filter((x) => x.scopeId === id && x.family === "landmark")) {
        await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
      }
      await db.scope.delete({ where: { id } }).catch(() => {});
    }
  }
}

// ── 17–18. playback before the placement date, then Live Now ───────
await open();
await p.locator('[data-shoot="to-beginning"]').click();
await settle(900);
await p.locator('[data-shoot="play"]').click();
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(110);
  if ((await p.locator('[data-shoot^="event-module-"]').count()) >= 2) break;
}
await shot("17-playback-before-placement");
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await settle(1700);
await park();
await shot("18-back-at-live-now");

// leave the world as it was found
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
}

await db.$disconnect();
await b.close();
console.log(`\nframes in ${out}`);
