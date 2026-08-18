// THE PROJECT TIME MACHINE — fifteen states and one run.
//
// The arc: the present, entering memory, quiet time, a note struck, several
// struck together, a forecast belief moving, the state it left behind,
// dragged back, inspected, and returned to Live Now — then the same thing
// at eight projects, with motion reduced, and with Event Intake open to
// show that possibility stays outside memory.
//
//   node scripts/timeline-project-time-machine-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";

const out = process.argv[2] ?? "/tmp/timeline-time-machine";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const DAY = 86400000;
const db = new PrismaClient();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n, clip) => { await p.screenshot({ path: `${out}/${n}.png`, ...(clip ? { clip } : {}) }); console.log(`shot ${n}`); };
const settle = (ms = 800) => p.waitForTimeout(ms);
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const park = async () => { await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6); await settle(380); };
const open = async (page = p) => {
  await page.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await page.waitForTimeout(2600);
};
const transportClip = async () => {
  const t = await box('[data-shoot="transport"]');
  return { x: 0, y: t.y - 4, width: VIEWPORT.width, height: t.height + 8 };
};
const scrubTo = async (frac) => {
  const f = await box('[data-shoot="time-field"]');
  const y = f.y + 26;
  await p.mouse.move(f.x + f.width * frac, y);
  await p.mouse.down();
  await p.mouse.move(f.x + f.width * frac, y, { steps: 2 });
  await p.mouse.up();
  await settle(700);
  await park();
};
/** Park the playhead exactly ON a stored moment, using the transport's own
    event stepping. Converting a date to an x is wrong here: the field is
    ZOOMED, so a fraction of the field is a fraction of the VIEW window, not
    of the project's whole range — aiming that way lands somewhere plausible
    and not where it was asked for. Stepping asks the product to go to the
    next real event, which is exact and view-independent. */
const stepTo = async (targetT) => {
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(520);
  for (let i = 0; i < 220; i++) {
    const d = await p.evaluate(() =>
      (document.querySelector('[data-shoot="playhead-date"]')?.textContent ?? "").trim());
    if (new Date(`${d} UTC`).getTime() >= targetT) return true;
    await p.locator('[data-shoot="next-event"]').click();
    await settle(70);
  }
  return false;
};

/** Play until a predicate holds, then pause there. Returns whether it did. */
const playUntil = async (fn, tries = 60, poll = 260) => {
  await p.locator('[data-shoot="play"]').click();
  for (let i = 0; i < tries; i++) {
    await settle(poll);
    if (await p.evaluate(fn)) {
      // Pause and return IMMEDIATELY. Several of the things worth catching
      // are on a 2.4s fade; spending half of it settling produced frames of
      // the thing having just gone.
      await p.locator('[data-shoot="play"]').click().catch(() => {});
      return true;
    }
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  return false;
};

await open();
await park();
const start = await proj();
const span = new Date(start.rangeEnd).getTime() - new Date(start.rangeStart).getTime();
const fracOf = (t) => (t - new Date(start.rangeStart).getTime()) / span;
const nowT = new Date(start.now).getTime();

// ── 01. the present ─────────────────────────────────────────────────
await shot("01-live-now-resting");
await shot("01b-transport-at-rest", await transportClip());

// ── 02. entering memory ─────────────────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1000);
await park();
await shot("02-playback-just-entered");

// ── 03. a quiet stretch ─────────────────────────────────────────────
{
  // A date with nothing at it: the readout says so rather than showing the
  // last thing it happened to see.
  const occurred = start.entries
    .filter((e) => e.temporalState === "occurred" && new Date(e.date).getTime() <= nowT)
    .map((e) => new Date(e.date).getTime())
    .sort((a, b) => a - b);
  let gapAt = occurred[0];
  let widest = 0;
  for (let i = 1; i < occurred.length; i++) {
    const g = occurred[i] - occurred[i - 1];
    if (g > widest) { widest = g; gapAt = occurred[i - 1] + g / 2; }
  }
  await scrubTo(fracOf(gapAt));
  await shot("03-quiet-historical-moment");
  await shot("03b-quiet-transport", await transportClip());
  console.log(`03. widest quiet stretch ${Math.round(widest / DAY)}d, parked mid-gap`);
}

// ── 04–05. a note struck, and read out ──────────────────────────────
await open();
await p.locator('[data-shoot="to-beginning"]').click();
await settle(800);
{
  const got = await playUntil(() =>
    document.querySelectorAll('[data-shoot^="event-module-"][data-phase="articulating"]').length > 0 &&
    document.querySelectorAll('[data-shoot="strike-ring"]').length > 0);
  await shot("04-event-being-crossed");
  await shot("05-event-readout", await transportClip());
  console.log(`04. struck a note: ${got}`);
}

// ── 06. several at once ─────────────────────────────────────────────
{
  const byLaneT = new Map();
  for (const e of start.entries) {
    if (e.temporalState !== "occurred") continue;
    const t = new Date(e.date).getTime();
    if (t > nowT) continue;
    const k = `${e.scopeId}@${t}`;
    byLaneT.set(k, [...(byLaneT.get(k) ?? []), e]);
  }
  let best = null;
  for (const [k, list] of byLaneT) {
    if (list.length < 2) continue;
    const t = Number(k.split("@")[1]);
    if (!best || list.length > best.list.length) best = { t, list };
  }
  if (best) {
    await open();
    await stepTo(best.t);
    await p.locator('[data-shoot="prev-event"]').click();
    await settle(600);
    const got = await playUntil(() => document.querySelectorAll('[data-shoot^="event-group-"]').length > 0, 40, 150);
    await shot("06-grouped-crossing");
    const g = await box('[data-shoot^="event-group-"]').catch(() => null);
    if (g) await shot("06b-grouped-close", { x: Math.max(0, g.x - 40), y: Math.max(0, g.y - 20), width: 560, height: g.height + 60 });
    console.log(`06. grouped crossing (${best.list.length} at ${new Date(best.t).toISOString().slice(0, 10)}): ${got}`);
  }
}

// ── 07–09. a belief moving ──────────────────────────────────────────
{
  const scopeId = Object.keys(start.snapshotsByScope).find(
    (k) => (start.snapshotsByScope[k] ?? []).length >= 3
  );
  const series = start.snapshotsByScope[scopeId];
  // the report with the biggest stored movement — the most legible beat
  let pick = 1;
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(new Date(series[i].likelyDate) - new Date(series[i - 1].likelyDate));
    const best = Math.abs(new Date(series[pick].likelyDate) - new Date(series[pick - 1].likelyDate));
    if (d > best) pick = i;
  }
  const at = new Date(series[pick].generatedAt).getTime();

  await open();
  await stepTo(at);
  await p.locator('[data-shoot="prev-event"]').click();
  await settle(700);
  await park();
  await shot("07-forecast-memory-before");
  await shot("07b-strip-before", { x: 0, y: 0, width: VIEWPORT.width, height: 92 });

  // CROSS IT BY HAND, NOT BY RACING IT.
  //
  // The chip lives for 2.4s and fades out over the last quarter of that, so
  // detecting it during playback and then paying for a pause round-trip and
  // a retina screenshot reliably produced a frame of it having just gone.
  // Scrubbing over the Report boundary fires the same transition — the
  // effect watches the remembered snapshot, not the transport — and puts
  // the capture at a known point in its life instead of an unknown one.
  await p.locator('[data-shoot="next-event"]').click();
  await settle(420);
  const got = (await p.locator('[data-shoot="memory-delta"]').count()) > 0;
  await shot("08-forecast-memory-changing");
  const d = await box('[data-shoot="memory-delta"]').catch(() => null);
  if (d) await shot("08b-delta-close", { x: Math.max(0, d.x - 120), y: Math.max(0, d.y - 60), width: 900, height: 190 });
  console.log(`08. caught the transition: ${got} (${scopeId} report ${pick})`);

  await settle(2600);
  await park();
  await shot("09-historical-state-after");
  await shot("09b-strip-after", { x: 0, y: 0, width: VIEWPORT.width, height: 92 });
}

// ── 10. dragged backward ────────────────────────────────────────────
await scrubTo(0.18);
await shot("10-scrubbed-backward");

// ── 11. inspecting a historical moment ──────────────────────────────
{
  const work = start.entries.find((e) => e.temporalState === "occurred" && e.family === "work");
  await p.locator(`[data-shoot="event-${work.id}"]`).dispatchEvent("click");
  await settle(1100);
  await park();
  await shot("11-historical-inspector");
  const report = start.entries.find((e) => e.kind === "report");
  await p.keyboard.press("Escape");
  await settle(400);
  await p.locator(`[data-shoot="event-${report.id}"]`).dispatchEvent("click");
  await settle(1100);
  await park();
  await shot("11b-forecast-memory-inspector");
  await p.keyboard.press("Escape");
  await settle(500);
}

// ── 12. back to the present ─────────────────────────────────────────
await p.locator('[data-shoot="to-now"]').click();
await settle(1200);
{
  const plan = start.entries.find((e) => e.temporalState === "planned" && e.family === "landmark");
  await p.locator(`[data-shoot="plan-${plan.id}"]`).dispatchEvent("click").catch(() => {});
  await settle(1100);
  await park();
  await shot("12-live-inspector-after-return");
  await p.keyboard.press("Escape");
  await settle(500);
}

// ── 15. Event Intake during playback ────────────────────────────────
//
// Shot before the scratch projects exist, so the rack is the real one.
{
  await open();
  if ((await p.locator('[data-shoot="event-intake"]').count()) === 0) {
    await p.locator('[data-shoot="event-intake-toggle"]').click();
    await settle(700);
  }
  await scrubTo(0.26);
  await shot("15-intake-during-playback");
  const inHistory = await p.locator('[data-shoot^="candidate-"]').count();
  console.log(`15. candidates drawn into the remembered state: ${inHistory}`);
}

// ── 13. eight projects ──────────────────────────────────────────────
const extra = [];
try {
  const cur = await proj();
  for (let i = cur.lanes.length; i < 8; i++) {
    const n = `Stress ${i + 1}`;
    const ex = await db.scope.findFirst({ where: { name: n } });
    const row = ex ?? (await db.scope.create({ data: { name: n, teamKey: "SOF" } }));
    if (!ex) extra.push(row.id);
  }
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  await playUntil(() => document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-live") === "true", 40);
  await shot("13-eight-project-playback");
  await shot("13b-eight-project-transport", await transportClip());
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
}

// ── 14. reduced motion ──────────────────────────────────────────────
{
  const rc = await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const rp = await rc.newPage();
  await open(rp);
  await rp.locator('[data-shoot="to-beginning"]').click();
  await rp.waitForTimeout(900);
  await rp.locator('[data-shoot="play"]').click();
  for (let i = 0; i < 40; i++) {
    await rp.waitForTimeout(260);
    if (await rp.evaluate(() => document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-live") === "true")) break;
  }
  await rp.screenshot({ path: `${out}/14-reduced-motion.png` });
  console.log("shot 14-reduced-motion");
  await rp.locator('[data-shoot="play"]').click().catch(() => {});
  await rc.close();
}

// ── 16–18. FREEZE REVIEW: pause, a quiet stretch under way, and the
//          same moment reached from both directions ──────────────────
{
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(700);
  await p.locator('[data-shoot="speed-2"]').click();
  await settle(250);
  await p.locator('[data-shoot="play"]').click();
  let caught = false;
  for (let i = 0; i < 70 && !caught; i++) {
    await settle(200);
    if (await p.evaluate(() =>
      document.querySelectorAll('[data-shoot^="event-module-"][data-phase="articulating"]').length > 0)) {
      await p.locator('[data-shoot="play"]').click();
      caught = true;
    }
  }
  await settle(300);
  await shot("16-paused-on-a-struck-event");
  await shot("16b-paused-transport", await transportClip());
  console.log(`16. paused holding a struck event: ${caught}`);
  await p.locator('[data-shoot="speed-1"]').click();
  await settle(300);

  // the widest quiet stretch, WHILE PLAYING — the transport's time bar is
  // the thing that has to be moving
  const ts = [...new Set(start.entries
    .filter((e) => e.temporalState === "occurred" && new Date(e.date).getTime() <= nowT)
    .map((e) => new Date(e.date).getTime()))].sort((a, b) => a - b);
  let gapAt = ts[0], widest = 0;
  for (let i = 1; i < ts.length; i++) {
    const g = ts[i] - ts[i - 1];
    if (g > widest) { widest = g; gapAt = ts[i - 1]; }
  }
  await open();
  await stepTo(gapAt);
  await p.locator('[data-shoot="play"]').click();
  // The holding window is short — an articulation lasts 2.1s and the pacing
  // crosses even the widest gap in about 1.7s — so the transport CROP is
  // taken first: it is a fraction of the cost of a full retina frame, and it
  // is the part of the picture this state is about.
  const clip = await transportClip();
  let held = false;
  for (let i = 0; i < 90 && !held; i++) {
    await settle(100);
    held = await p.evaluate(() =>
      document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-holding") === "true");
    if (held) await shot("17b-quiet-transport", clip);
  }
  if (!held) await shot("17b-quiet-transport", clip);
  await shot("17-quiet-stretch-under-way");
  console.log(`17. holding through the ${Math.round(widest / DAY)}d gap: ${held}`);
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(400);

  // the same moment, reached forwards and backwards
  await open();
  await scrubTo(0.34);
  await shot("18a-scrub-forward-to-moment", await transportClip());
  const fwd = await p.evaluate(() =>
    (document.querySelector('[data-shoot="now-playing"]')?.textContent ?? "").replace(/\s+/g, " ").trim());
  await scrubTo(0.62);
  await settle(300);
  await scrubTo(0.34);
  await shot("18b-scrub-back-to-moment", await transportClip());
  const back = await p.evaluate(() =>
    (document.querySelector('[data-shoot="now-playing"]')?.textContent ?? "").replace(/\s+/g, " ").trim());
  console.log(`18. same moment both directions: ${fwd === back}`);
}

// ── ONE FULL RUN, RECORDED ──────────────────────────────────────────
{
  const vctx = await b.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: `${out}/video`, size: VIEWPORT },
  });
  const vp = await vctx.newPage();
  await open(vp);
  await vp.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6);
  await vp.waitForTimeout(600);
  await vp.locator('[data-shoot="to-beginning"]').click();
  await vp.waitForTimeout(1000);
  await vp.locator('[data-shoot="play"]').click();
  // the whole story, then a beat at Live Now
  for (let i = 0; i < 150; i++) {
    await vp.waitForTimeout(300);
    const atNow = await vp.evaluate(() =>
      /at now/i.test(document.querySelector('[data-shoot="playhead-readout"]')?.textContent ?? ""));
    if (atNow) break;
  }
  await vp.waitForTimeout(2200);
  await vctx.close();
  console.log(`video → ${out}/video`);
}

await b.close();
await db.$disconnect();
console.log(`\n${out}`);
