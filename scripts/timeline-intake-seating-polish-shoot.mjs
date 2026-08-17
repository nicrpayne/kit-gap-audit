// POSSIBILITY → REALITY — eighteen states.
//
// The same arc as the intake shoot, framed on the seam this pass is about:
// a score with nothing borrowed on it, a suggestion asked for and answered,
// a piece carried across and SEATED — after which it is ordinary Reality and
// the only trace of where it came from is a sentence in the inspector.
//
//   node scripts/timeline-intake-seating-polish-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";

const out = process.argv[2] ?? "/tmp/timeline-seating";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const DAY = 86400000;
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
  await settle(240);
  return card;
};
const carryTo = async (from, x, y) => {
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(from.x + 60 + (x - from.x - 60) * (i / 10), from.y - 34 + (y - from.y + 34) * (i / 10));
  }
  await settle(320);
};
/** A band around one project, for the does-it-belong-here close-ups. */
const laneClip = async (scopeId) => {
  const l = await box(`[data-shoot="lane-header-${scopeId}"]`);
  return { x: 50, y: Math.max(0, l.y - 8), width: 1600, height: l.height + 16 };
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
const start = await proj();
const jsa = start.lanes.find((l) => l.name === "JSA") ?? start.lanes[0];
const activity = start.candidates.find((c) => c.date && c.endDate);
const undated = start.candidates.find((c) => !c.date);
const field = await box('[data-shoot="time-field"]');

// ── 01. the score at rest: five candidates exist, none of them here ─
await openTray();
await park();
await shot("01-rest-nothing-borrowed");

// ── 02–03. asking where it would go ─────────────────────────────────
await p.locator(`[data-shoot="intake-${activity.id}"]`).hover();
await settle(900);
await shot("02-suggestion-on-demand");
await shot("02b-suggestion-close", await laneClip(activity.scopeId));

await p.locator(`[data-shoot="intake-${activity.id}"]`).click();
await settle(1000);
await park();
await shot("03-candidate-inspector");
await p.keyboard.press("Escape");
await settle(700);

// ── 04–07. carried across and seated ────────────────────────────────
let placedId = null;
{
  await openTray();
  const card = await lift(activity.id);
  await carryTo(card, field.x + field.width * 0.42, card.y - 120);
  await shot("04-in-the-hand");

  await carryTo(card, field.x + field.width * 0.64, await laneMid(jsa.scopeId));
  await shot("05-preview-on-the-lane");
  await shot("05b-preview-close", await laneClip(jsa.scopeId));

  await p.mouse.up();
  await settle(2500);
  await shot("06-seated");
  await p.keyboard.press("Escape");
  await park();
  await settle(700);

  placedId = (await proj()).entries.find((e) => e.title === activity.title && e.family === "landmark")?.id ?? null;
  // THE WHOLE POINT OF THE PASS. Same lane, same row pitch, same material —
  // whichever of these began as a machine reading is not visible from here.
  await shot("07-beside-native-objects", await laneClip(jsa.scopeId));
}

// ── 08–09. it behaves like anything else on the score ────────────────
{
  const o = await box(`[data-shoot="plan-${placedId}"]`);
  await p.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  await settle(700);
  await shot("08-seated-hover", await laneClip(jsa.scopeId));
  await p.locator(`[data-shoot="plan-${placedId}"]`).dispatchEvent("click");
  await settle(1100);
  await park();
  await shot("09-seated-inspector");
  const dock = await box('[data-shoot="inspector-dock"]');
  await shot("09b-origin-and-placement", { x: dock.x, y: dock.y, width: dock.width, height: dock.height });
}

// ── 10–11. undo returns the piece, redo reseats it ──────────────────
{
  await p.keyboard.press("Escape");
  await settle(500);
  await p.keyboard.press("Control+z");
  await settle(2200);
  await openTray();
  await park();
  await shot("10-undo-returns-it");

  await p.keyboard.press("Control+Shift+z");
  await settle(2400);
  await p.keyboard.press("Escape");
  await park();
  await shot("11-redo-reseats-it");

  // leave the score clean for the dateless case
  const again = (await proj()).entries.find((e) => e.title === activity.title && e.family === "landmark");
  if (again) await fetch(`${BASE}/api/timeline-events/${again.id}`, { method: "DELETE" });
}

// ── 12–13. a supplied date is not a supplied project ────────────────
{
  await open();
  await openTray();
  await p.locator(`[data-shoot="intake-${undated.id}"]`).click();
  await settle(1000);
  await park();
  await shot("12-dateless-before-timing");

  const when = new Date(Date.now() + 24 * DAY);
  when.setUTCHours(0, 0, 0, 0);
  await p.locator('[data-shoot="candidate-date"]').fill(when.toISOString().slice(0, 10));
  await settle(500);
  await p.locator('[data-shoot="accept-candidate"]').click();
  await settle(1600);
  await park();
  // Nothing was placed, nothing was accepted, and the card names a DATE and
  // no project — the suggestion is still waiting for a human to agree to it.
  await shot("13-timing-set-project-still-open");
  const tray = await box('[data-shoot="event-intake"]');
  await shot("13b-card-names-no-project", { x: 50, y: tray.y - 6, width: 1600, height: tray.height + 12 });
  const row = await db.timelineEventCandidate.findUnique({ where: { id: undated.id } });
  console.log(`13. stored candidate after typing a date → status=${row.status} date=${row.date} scopeId=${row.scopeId}`);
  await p.keyboard.press("Escape");
  await settle(600);
}

// ── 14–15. a dormant project is still a place to put something ──────
const extra = [];
try {
  const name = "Ops handover";
  const ex = await db.scope.findFirst({ where: { name } });
  const row = ex ?? (await db.scope.create({ data: { name, teamKey: "OPS" } }));
  if (!ex) extra.push(row.id);

  await open();
  await openTray();
  const cur = await proj();
  const piece = cur.candidates.find((c) => c.date && c.endDate) ?? cur.candidates.find((c) => c.date);
  const rail = await box(`[data-shoot="lane-header-${row.id}"]`);
  const card = await lift(piece.id);
  await carryTo(card, field.x + field.width * 0.56, rail.y + rail.height / 2);
  await shot("14-dormant-targeted");
  await shot("14b-rail-as-target", { x: 50, y: Math.max(0, rail.y - 30), width: 1600, height: 110 });
  await p.mouse.up();
  await settle(2600);
  await p.keyboard.press("Escape");
  await park();
  await shot("15-dormant-woken");

  // ── 16. the producer, said out loud ───────────────────────────────
  {
    const placed = (await proj()).entries.find((e) => e.scopeId === row.id && e.family === "landmark");
    await p.locator(`[data-shoot="plan-${placed.id}"]`).dispatchEvent("click");
    await settle(1100);
    await park();
    const dock = await box('[data-shoot="inspector-dock"]');
    await shot("16-producer-said-out-loud", { x: dock.x, y: dock.y, width: dock.width, height: dock.height });
    const stored = await db.timelineEvent.findUnique({ where: { id: placed.id }, select: { sourceLabel: true } });
    const drawn = await p.evaluate(() =>
      (document.querySelector('[data-shoot="inspector-dock"]')?.textContent ?? "").replace(/\s+/g, " "));
    console.log(`16. STORED  → ${JSON.stringify(stored.sourceLabel)}`);
    console.log(`16. DRAWN   → ${/From\s*(.*?)\s*Evidence/.exec(drawn)?.[1] ?? drawn.slice(0, 120)}`);
    await p.keyboard.press("Escape");
    await settle(600);
  }

  // ── 17. eight projects, everything above still true ───────────────
  for (let i = cur.lanes.length + 1; i < 8; i++) {
    const n = `Stress ${i + 1}`;
    const e2 = await db.scope.findFirst({ where: { name: n } });
    const r2 = e2 ?? (await db.scope.create({ data: { name: n, teamKey: "SOF" } }));
    if (!e2) extra.push(r2.id);
  }
  await open();
  await openTray();
  await park();
  await shot("17-eight-project-density");
} finally {
  for (const id of extra) {
    const cur = await proj().catch(() => null);
    for (const e of (cur?.entries ?? []).filter((x) => x.scopeId === id && x.family === "landmark")) {
      await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
    }
    await db.scope.delete({ where: { id } }).catch(() => {});
  }
}

// ── 18. history, played back, with nothing borrowed in it ───────────
await open();
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1000);
await p.locator('[data-shoot="play"]').click();
await settle(2600);
await p.locator('[data-shoot="play"]').click();
await settle(700);
await park();
await shot("18-historical-playback");

// leave the rack as we found it
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  const back = await proj();
  console.log(`rack restored → ${back.candidates.length} candidate(s) pending (started with ${start.candidates.length})`);
}

await b.close();
await db.$disconnect();
console.log(`\n${out}`);
