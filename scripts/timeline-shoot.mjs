// TIMELINE'S 24 STATES, plus the uncut A–K playback recording.
//
// One viewport throughout. The video is one continuous session with the
// pointer visible: the whole claim is that pressing play tells the story,
// so nothing may be cut around the playback.
//
//   node scripts/timeline-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-shoot";
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
const sel = async (id) => { await p.locator(`[data-shoot="event-${id}"]`).dispatchEvent("click"); await settle(800); };

await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
await settle(3000);

const proj = await (await fetch(`${BASE}/api/timeline`)).json();
const nowT = new Date(proj.now).getTime();
const first = (pred) => proj.entries.find(pred);
const laneIds = proj.lanes.map((l) => l.scopeId);

// ── 1. full Timeline at NOW ────────────────────────────────────────
await shot("01-timeline-at-now");
await shot("21-now-boundary");

// ── 2/3. historical playhead before the first Report ───────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1400);
await shot("02-playhead-before-first-report");

const ctxEntry = first((e) => e.kind === "context_observed");
if (ctxEntry) { await sel(ctxEntry.id); await shot("03-playhead-on-context-event"); await shot("23-inspector-context"); }

// ── 4/5. decision raised, report snapshot ──────────────────────────
const raised = first((e) => e.kind === "decision_raised");
if (raised) { await sel(raised.id); await shot("04-decision-raised-selected"); }

const reports = proj.entries.filter((e) => e.kind === "report");
if (reports[0]) { await sel(reports[0].id); await shot("05-report-snapshot-selected"); await shot("22-inspector-report"); }

// ── 6/7/8. forecast memory across three real Reports ───────────────
// Steps to whatever each stored Report actually said — later or earlier.
const laneWithSeries = laneIds.find((id) => (proj.snapshotsByScope[id] ?? []).length >= 3);
if (laneWithSeries) {
  const series = proj.snapshotsByScope[laneWithSeries];
  const scrubTo = async (iso) => {
    const box = await p.locator('[data-shoot="time-field"] > div:last-child').boundingBox();
    const view = await p.evaluate(() => ({ }));
    // scrub by clicking the field at the right x is fragile across zoom;
    // use the transport's next-event stepping instead, which is exact.
    return { box, view };
  };
  void scrubTo;
  // Step forward through events; capture at each Report boundary.
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  const seen = [];
  for (let i = 0; i < 60 && seen.length < 3; i++) {
    await p.locator('[data-shoot="next-event"]').click();
    await p.waitForTimeout(150);
    const v = await p.locator(`[data-shoot="memory-likely-${laneWithSeries}"]`).innerText().catch(() => null);
    if (v && (seen.length === 0 || v !== seen[seen.length - 1].v)) {
      seen.push({ v, i });
      await settle(500);
      await shot(`0${5 + seen.length}-forecast-memory-${seen.length}`);
    }
  }
  console.log("forecast memory captured:", seen.map((s) => s.v).join(" → "));
}

// ── 9/10. gate connected, decision decided ─────────────────────────
const gated = first((e) => e.kind === "decision_gated");
if (gated) { await sel(gated.id); await shot("09-decision-connected-to-delivery"); }
const decided = first((e) => e.kind === "decision_decided");
if (decided) { await sel(decided.id); await shot("10-decision-decided"); }

// ── 11. Linear completion ──────────────────────────────────────────
const work = first((e) => e.kind === "work_completed");
if (work) { await sel(work.id); await shot("11-linear-completion"); }

// ── 12/13/14. landmarks in each temporal state ─────────────────────
const occurredLm = first((e) => e.kind === "landmark" && e.temporalState === "occurred");
if (occurredLm) { await sel(occurredLm.id); await shot("12-manual-occurred-milestone"); }
const futureLm = first((e) => e.kind === "landmark" && e.temporalState === "planned" && new Date(e.date).getTime() > nowT);
if (futureLm) { await sel(futureLm.id); await shot("13-future-planned-milestone"); }
const overdueLm = first((e) => e.kind === "landmark" && e.detail?.overdue === true);
if (overdueLm) { await sel(overdueLm.id); await shot("14-overdue-planned-milestone"); }

// ── 15/16/17. candidates ───────────────────────────────────────────
const datedCand = proj.candidates.find((c) => c.date);
if (datedCand) {
  await p.locator(`[data-shoot="candidate-${datedCand.id}"]`).dispatchEvent("click");
  await settle(800);
  await shot("15-dated-hermes-candidate");
  await shot("17-candidate-inspector-evidence");
}
const datelessCand = proj.candidates.find((c) => !c.date);
if (datelessCand) {
  await p.locator('[data-shoot="event-intake-toggle"]').click();
  await settle(700);
  await shot("16-dateless-event-intake");
  await p.locator(`[data-shoot="intake-${datelessCand.id}"]`).click();
  await settle(800);
  await shot("16b-dateless-candidate-selected");
}

// ── 18. the add-event tool ─────────────────────────────────────────
await p.locator('[data-shoot="add-event"]').click();
await settle(800);
await shot("18-manual-add-event-tool");
await p.keyboard.press("Escape");
await settle(600);

// ── 19. dependency view across projects ────────────────────────────
await p.locator('[data-shoot="scale-quarter"]').click();
await settle(1100);
await shot("19-multi-project-dependency-view");
await p.locator('[data-shoot="scale-month"]').click();
await settle(900);

// ── 20. a quiet stretch ────────────────────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1200);
await shot("20-quiet-period");

// ── 24. eight-lane stress ──────────────────────────────────────────
// Real extra Scopes, created and removed here, so the stress case is the
// instrument under real load rather than a mock.
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const extra = [];
for (let i = laneIds.length; i < 8; i++) {
  const name = `Stress ${i + 1}`;
  const existing = await db.scope.findFirst({ where: { name } });
  const row = existing ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }));
  extra.push(row.id);
}
if (extra.length > 0) {
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
  await shot("24-eight-lane-stress");
} else {
  console.log("stress: could not create extra scopes; capturing current lane count");
  await shot("24-eight-lane-stress");
}

// ── THE VIDEO: one continuous run, A–K ─────────────────────────────
await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
await settle(2600);

// A. start at NOW
await p.mouse.move(840, 520);
await settle(1500);
// B. jump to the beginning
await p.locator('[data-shoot="to-beginning"]').hover();
await settle(500);
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1600);
// C. PLAY
await p.locator('[data-shoot="play"]').hover();
await settle(500);
await p.locator('[data-shoot="play"]').click();
// D–H. let it run the whole way; it stops itself at NOW
for (let i = 0; i < 150; i++) {
  await p.waitForTimeout(400);
  const playing = await p.locator('[data-shoot="play"] rect').count();
  if (playing === 0 && i > 6) break;
}
await settle(2000);
// G. select a decision mid-story
if (raised) { await p.locator(`[data-shoot="event-${raised.id}"]`).dispatchEvent("click"); await settle(2200); }
// J. SCRUB by hand into the future, so the planned milestone is reached
// rather than merely selected — the point is that the playhead can go
// there and the plan is still visibly a plan.
{
  const field = await p.locator('[data-shoot="playhead"]').boundingBox();
  const host = await p.locator('[data-shoot="time-field"]').boundingBox();
  const y = host.y + host.height / 2;
  const fromX = field ? field.x : host.x + host.width * 0.4;
  const toX = host.x + host.width * 0.86;
  await p.mouse.move(fromX, y);
  await p.mouse.down();
  for (let i = 1; i <= 40; i++) {
    await p.mouse.move(fromX + ((toX - fromX) * i) / 40, y);
    await p.waitForTimeout(28);
  }
  await p.mouse.up();
  await settle(1500);
}
if (futureLm) {
  await p.locator(`[data-shoot="event-${futureLm.id}"]`).dispatchEvent("click");
  await settle(2400);
}
// K. return to NOW
await p.locator('[data-shoot="to-now"]').hover();
await settle(500);
await p.locator('[data-shoot="to-now"]').click().catch(() => {});
await settle(2600);

// tidy the stress scopes
for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
await db.$disconnect();

await ctx.close();
await b.close();
console.log(`shots + video → ${out}`);
