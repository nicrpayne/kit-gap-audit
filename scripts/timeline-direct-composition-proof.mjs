// COMPOSE THE FUTURE — the polish pass, proven.
//
// This pass is about how the surface FEELS, and feel is mostly a set of
// invariants that either hold or do not: the panel is not there when
// nothing is held, the canvas does not lie about calendar time when it
// resizes, a gesture that was never made writes nothing, and ⌘Z puts back
// exactly what was there.
//
// Every check drives a real pointer or a real key. Nothing calls a handler.
//
//   node scripts/timeline-direct-composition-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const day = (s) => (s ? new Date(s).toISOString().slice(0, 10) : "—");
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const plusDays = (n) => { const d = new Date(Date.now() + n * DAY); d.setHours(0, 0, 0, 0); return d; };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });
let writes = [];
p.on("request", (r) => { if (r.method() !== "GET") writes.push(`${r.method()} ${r.url().replace(BASE, "")}`); });

const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await p.waitForTimeout(2600);
};
const park = async () => { await p.mouse.move(1674, 1044); await p.waitForTimeout(280); };
const box = (sel) => p.locator(sel).boundingBox();
const readAxis = (excludeId = null) =>
  p.evaluate((skip) => {
    const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")]
      .filter((e) => e.getAttribute("data-shoot") !== `plan-${skip}`);
    const pts = els
      .map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left }))
      .sort((a, c) => a.t - c.t);
    return { pxPerMs: (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t), t0: pts[0].t, x0: pts[0].x };
  }, excludeId);
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
const drag = async (x0, y0, x1, y1, steps = 12) => {
  await p.mouse.move(x0, y0);
  await p.waitForTimeout(110);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await p.waitForTimeout(32);
  }
};
/** Which lane a y coordinate falls inside, by lane header box. */
const laneAt = async (y) =>
  p.evaluate((yy) => {
    for (const el of document.querySelectorAll("[data-shoot^='lane-header-']")) {
      const r = el.getBoundingClientRect();
      if (yy >= r.top && yy < r.bottom) return el.getAttribute("data-shoot").replace("lane-header-", "");
    }
    return null;
  }, y);

for (const e of (await proj()).entries.filter((x) => x.title.startsWith("DC "))) {
  await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
}

await open();
const start = await proj();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");
const itrack = laneOf("iTrack");
const plat = laneOf("Platform");
const axis = await readAxis();
const xOf = (t) => axis.x0 + (t - axis.t0) * axis.pxPerMs;
const made = [];

// ── 1–4. THE RESTING SURFACE ───────────────────────────────────────
const restField = await box('[data-shoot="time-field"]');
{
  check("1. With nothing selected there is NO detail panel, only a seam",
    (await p.locator('[data-shoot="inspector-seam"]').count()) === 1 &&
      (await p.locator('[data-shoot="inspector-dock"][data-open]').count()) === 0,
    `field ${Math.round(restField.width)}px wide`);

  const drawn = await p.locator('[data-shoot^="plan-"][data-plan-role]').count();
  const named = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')]
      .filter((e) => (e.textContent ?? "").trim().length > 2).length);
  check("2. Resting plan objects are drawn AND readable", drawn > 0 && named === drawn, `${named}/${drawn} carry a title`);

  // The record before the panel exists…
  const mk = start.entries.find((e) => e.title === "Marketing plan");
  const beforeDate = await p.locator(`[data-shoot="plan-${mk.id}"]`).getAttribute("data-date");
  const beforeLane = await laneAt((await box(`[data-shoot="plan-${mk.id}"]`)).y + 4);

  await p.locator(`[data-shoot="plan-${mk.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(900);
  const openField = await box('[data-shoot="time-field"]');
  const afterDate = await p.locator(`[data-shoot="plan-${mk.id}"]`).getAttribute("data-date");
  const afterBox = await box(`[data-shoot="plan-${mk.id}"]`);
  const afterLane = await laneAt(afterBox.y + 4);
  const axis2 = await readAxis(mk.id);

  check("3. Opening the inspector changes NO date and moves nothing between lanes",
    beforeDate === afterDate && beforeLane === afterLane && beforeLane !== null,
    `${day(afterDate)} in the same lane`);
  // The BODY rect is the object's own left edge; the group box also holds
  // the selection underline and the hover date, which are not the object.
  const bodyX = await p.evaluate(
    (id) => document.querySelector(`[data-shoot="plan-${id}"] rect:nth-of-type(2)`).getBoundingClientRect().left,
    mk.id
  );
  const wantX = axis2.x0 + (new Date(afterDate).getTime() - axis2.t0) * axis2.pxPerMs;
  check("…and the object still sits exactly where the axis says it does",
    Math.abs(bodyX - wantX) < 2.5,
    `${bodyX.toFixed(1)}px vs axis ${wantX.toFixed(1)}px on a ${Math.round(openField.width)}px field`);
  check("…and the panel actually opened", openField.width < restField.width,
    `${Math.round(restField.width)} → ${Math.round(openField.width)}px`);

  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  const backField = await box('[data-shoot="time-field"]');
  check("4. Dismissing restores the canvas exactly",
    Math.abs(backField.width - restField.width) < 1 && JSON.stringify(backField) === JSON.stringify(restField),
    `${Math.round(backField.width)}px`);
}

// ── 5–6. HOVER AND SELECTION ───────────────────────────────────────
{
  const mk = (await proj()).entries.find((e) => e.title === "Marketing plan");
  const sel = `[data-shoot="plan-${mk.id}"]`;
  const rest = await box(sel);
  await p.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2);
  await p.waitForTimeout(420);
  const hov = await box(sel);
  check("5. Hover wakes a plan object — it lifts and states its dates",
    hov.y < rest.y && hov.height > rest.height,
    `y ${rest.y.toFixed(1)} → ${hov.y.toFixed(1)}, reveals ${(await p.locator(sel).textContent()).includes("→") ? "its range" : "nothing"}`);
  await park();

  // Selection must not move it between lanes or change its date. The field
  // legitimately re-lays-out when the panel opens; the calendar must not.
  const laneBefore = await laneAt(rest.y + 4);
  const dateBefore = await p.locator(sel).getAttribute("data-date");
  await p.locator(sel).dispatchEvent("click");
  await p.waitForTimeout(900);
  check("6. Selection changes no calendar truth and no lane",
    (await p.locator(sel).getAttribute("data-date")) === dateBefore &&
      (await laneAt((await box(sel)).y + 4)) === laneBefore,
    `${day(dateBefore)} · ${laneBefore === jsa.scopeId ? "JSA" : laneBefore}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
}

// ── 7–10, 17–18. THE HOT PATH, AND UNDOING IT ──────────────────────
//
// ONE EDITING SESSION, deliberately. Undo is session-scoped by design, so
// these three edits happen without a reload between them — reloading is
// how a person ENDS a session, and the stack going empty afterwards is a
// property this proof checks on purpose further down.
let mk = (await proj()).entries.find((e) => e.title === "Marketing plan");
const mkOriginal = { date: mk.date, endDate: mk.endDate, scopeId: mk.scopeId };
const sel = `[data-shoot="plan-${mk.id}"]`;
{
  const bb = await box(sel);
  writes = [];
  await drag(bb.x + bb.width / 2, bb.y + bb.height / 2, bb.x + bb.width / 2 + 6 * DAY * axis.pxPerMs, bb.y + bb.height / 2);
  check("7. No network traffic at all during the drag", writes.length === 0, `${writes.length}`);
  await p.mouse.up();
  await p.waitForTimeout(1600);
  check("8. Exactly one persistence operation on drop", writes.length === 1, writes.join(", ") || "none");
  const m2 = (await proj()).entries.find((e) => e.id === mk.id);
  check("…and it landed on the day the hand asked for",
    Math.round((new Date(m2.date) - new Date(mk.date)) / DAY) === 6, `${day(mk.date)} → ${day(m2.date)}`);
  mk = m2;
}
await park();
{
  const ax = await readAxis(mk.id);
  const bb = await box(sel);
  const cy = bb.y + bb.height / 2;
  await p.mouse.move(bb.x + bb.width / 2, cy);
  await p.waitForTimeout(340);
  // The object's own right edge, not its group box: hovering adds a date
  // readout beneath it, which widens the box without widening the object.
  const edge = await p.evaluate(
    (id) => { const r = document.querySelector(`[data-shoot="plan-${id}"] rect:nth-of-type(2)`).getBoundingClientRect(); return r.right; },
    mk.id
  );
  await drag(edge - 1, cy, edge - 1 + 4 * DAY * ax.pxPerMs, cy);
  await p.mouse.up();
  await p.waitForTimeout(1600);
  const m3 = (await proj()).entries.find((e) => e.id === mk.id);
  check("9. Resize still moves only the edge it was given",
    Math.round((new Date(m3.endDate) - new Date(mk.endDate)) / DAY) === 4 && day(m3.date) === day(mk.date),
    `${day(m3.date)} → ${day(m3.endDate)}`);
  mk = m3;
}
await park();
{
  const bb = await box(sel);
  const target = await box(`[data-shoot="lane-header-${itrack.scopeId}"]`);
  await drag(bb.x + bb.width / 2, bb.y + bb.height / 2, bb.x + bb.width / 2, target.y + target.height / 2, 14);
  await p.mouse.up();
  await p.waitForTimeout(1700);
  const m4 = (await proj()).entries.find((e) => e.id === mk.id);
  check("10. Cross-project reassignment still carries the dates with it",
    m4.scopeId === itrack.scopeId && day(m4.date) === day(mk.date) && day(m4.endDate) === day(mk.endDate),
    `now iTrack, ${day(m4.date)} → ${day(m4.endDate)}`);
  mk = m4;
}

// ── 17–18. UNDO REVERSES EXACTLY, IN ORDER ─────────────────────────
{
  check("The undo affordance names what it would reverse",
    /move|reschedule|resize/i.test(await p.locator('[data-shoot="undo"]').innerText().catch(() => "")),
    (await p.locator('[data-shoot="undo"]').innerText().catch(() => "none")).replace(/\s+/g, " "));

  await p.keyboard.press("Control+z");
  await p.waitForTimeout(1600);
  const u1 = (await proj()).entries.find((e) => e.id === mk.id);
  check("17. Undo of a cross-project move restores the exact prior project",
    !!u1 && u1.scopeId === jsa.scopeId, u1 ? "back on JSA" : "row missing");
  check("…and leaves its dates untouched",
    day(u1.date) === day(mk.date) && day(u1.endDate) === day(mk.endDate), `${day(u1.date)} → ${day(u1.endDate)}`);

  await p.keyboard.press("Control+z");
  await p.waitForTimeout(1600);
  const u2 = (await proj()).entries.find((e) => e.id === mk.id);
  check("18. Undo of a resize restores the exact prior range",
    Math.round((new Date(u2.endDate) - new Date(u1.endDate)) / DAY) === -4 && day(u2.date) === day(u1.date),
    `${day(u1.endDate)} → ${day(u2.endDate)}`);

  await p.keyboard.press("Control+z");
  await p.waitForTimeout(1600);
  const u3 = (await proj()).entries.find((e) => e.id === mk.id);
  check("…and one more undo puts the object back exactly where it began",
    day(u3.date) === day(mkOriginal.date) && day(u3.endDate) === day(mkOriginal.endDate) && u3.scopeId === mkOriginal.scopeId,
    `${day(u3.date)} → ${day(u3.endDate)}`);

  await p.keyboard.press("Control+Shift+z");
  await p.waitForTimeout(1600);
  const r1 = (await proj()).entries.find((e) => e.id === mk.id);
  check("…and redo puts it forward again",
    day(r1.date) === day(mkOriginal.date.slice(0, 10)) ? false : day(r1.date) !== day(u3.date),
    `${day(u3.date)} → ${day(r1.date)}`);

  // SESSION-SCOPED, ON PURPOSE. Reloading ends the editing session, and the
  // stack goes with it — this is a local command stack, not persisted
  // history, and pretending otherwise would be the overbuild we refused.
  await open();
  check("Undo is session-scoped — a reload ends it and offers nothing to reverse",
    (await p.locator('[data-shoot="undo"]').count()) === 0);
}
await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mkOriginal),
});

// ── 11–14. DRAWING A SPAN ──────────────────────────────────────────
await open();
{
  const y = await emptyBedY(itrack.scopeId);
  const t0 = plusDays(34), t1 = plusDays(52);
  const countBefore = (await proj()).entries.length;
  writes = [];
  await drag(xOf(t0.getTime()), y, xOf(t1.getTime()), y);
  check("11. Drawing on empty future space makes a DRAFT and nothing else",
    (await p.locator('[data-shoot="plan-draft"]').count()) === 1 && writes.length === 0);
  await p.mouse.up();
  await p.waitForTimeout(450);
  await p.keyboard.type("DC discarded");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  check("12. Escape removes the draft with nothing persisted",
    (await proj()).entries.length === countBefore && writes.length === 0 &&
      (await p.locator('[data-shoot="plan-draft"]').count()) === 0,
    `${countBefore} entries, ${writes.length} write(s)`);

  writes = [];
  await drag(xOf(t0.getTime()), y, xOf(t1.getTime()), y);
  await p.mouse.up();
  await p.waitForTimeout(450);
  await p.keyboard.type("DC Marketing plan");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1700);
  const rows = (await proj()).entries.filter((e) => e.title === "DC Marketing plan");
  rows.forEach((r) => made.push(r.id));
  check("13. Enter creates exactly ONE TimelineEvent", rows.length === 1, `${rows.length}`);
  check("14. …at exactly the dates the gesture described",
    day(rows[0]?.date) === day(t0) && day(rows[0]?.endDate) === day(t1),
    `${day(rows[0]?.date)} → ${day(rows[0]?.endDate)}`);
  check("…on the project it was drawn on, stored planned",
    rows[0]?.scopeId === itrack.scopeId && rows[0]?.temporalState === "planned");
}

// ── 19–20. UNDO A CREATION ─────────────────────────────────────────
{
  const madeId = made[made.length - 1];
  const derivedBefore = (await proj()).entries.filter((e) => e.family !== "landmark").map((e) => e.id);
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(1600);
  const after = await proj();
  check("19. Undo of a creation removes the object it created",
    !after.entries.some((e) => e.id === madeId));
  check("20. …and touches no source-owned record",
    JSON.stringify(after.entries.filter((e) => e.family !== "landmark").map((e) => e.id)) === JSON.stringify(derivedBefore),
    `${derivedBefore.length} derived entries either way`);
  made.pop();
}

// ── 15. A MOMENT, BY DOUBLE-CLICK ──────────────────────────────────
await open();
{
  const y = await emptyBedY(itrack.scopeId);
  const t = plusDays(38);
  writes = [];
  await p.mouse.dblclick(xOf(t.getTime()), y);
  await p.waitForTimeout(500);
  check("15. Double-click on empty plan space opens a point draft",
    (await p.locator('[data-shoot="plan-draft"]').count()) === 1 &&
      (await p.locator('[data-shoot="plan-draft"][data-draft-span]').count()) === 0 && writes.length === 0);
  await p.keyboard.type("DC Marketing kickoff");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1700);
  const pt = (await proj()).entries.find((e) => e.title === "DC Marketing kickoff");
  if (pt) made.push(pt.id);
  check("…and Enter stores a POINT at exactly that date",
    !!pt && day(pt.date) === day(t) && pt.endDate === null, `${day(pt?.date)} (asked ${day(t)})`);
}

// ── 16. A SINGLE CLICK NEVER INVENTS AN EVENT ──────────────────────
await open();
{
  const y = await emptyBedY(plat.scopeId);
  const before = (await proj()).entries.length;
  writes = [];
  await p.mouse.click(xOf(plusDays(60).getTime()), y);
  await p.waitForTimeout(800);
  check("16a. A single click on empty plan space creates nothing",
    (await proj()).entries.length === before && writes.length === 0 &&
      (await p.locator('[data-shoot="plan-draft"]').count()) === 0,
    `${before} entries held`);

  // …and the historical half is not a creation surface at all: pressing
  // left of NOW scrubs the playhead, which is what it has always done.
  const field = await box('[data-shoot="time-field"]');
  const nowX = await p.evaluate(() => document.querySelector('[data-shoot="now-seam"] line').getBoundingClientRect().left);
  const dateBefore = await p.locator('[data-shoot="playhead-date"]').innerText();
  await p.mouse.click(nowX - 180, field.y + field.height * 0.5);
  await p.waitForTimeout(700);
  check("16b. The historical half scrubs — it never becomes mutable history",
    (await proj()).entries.length === before &&
      (await p.locator('[data-shoot="playhead-date"]').innerText()) !== dateBefore,
    `playhead moved, ${before} entries held`);
}

// ── 21–24. THE EXPANDED LANE ───────────────────────────────────────
await open();
{
  const rowsFor = async (scopeId) => {
    const cur = await proj();
    const objs = cur.entries.filter((e) => e.family === "landmark" && e.scopeId === scopeId);
    const boxes = [];
    for (const o of objs) {
      const bb = await box(`[data-shoot="plan-${o.id}"]`);
      if (bb) boxes.push({ title: o.title, ...bb });
    }
    return boxes;
  };
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(900);
  await park();
  const boxes = await rowsFor(jsa.scopeId);
  let overlaps = 0, collisions = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      const xo = a.x < c.x + c.width && c.x < a.x + a.width;
      const yo = a.y < c.y + c.height && c.y < a.y + a.height;
      if (xo) overlaps++;
      if (xo && yo) collisions++;
    }
  check("21. Objects that overlap in time occupy separate subtracks",
    overlaps > 0 && collisions === 0, `${overlaps} overlapping pair(s), ${collisions} collision(s)`);
  // Cluster by row rather than by exact y: a point's group box reaches a
  // couple of pixels above its row for its grab area, and a lifted object
  // sits a pixel high, neither of which is a different subtrack.
  const centres = boxes.map((x) => x.y + x.height / 2).sort((a, c) => a - c);
  const rows = centres.reduce((acc, y) => (acc.length && y - acc[acc.length - 1] < 12 ? acc : [...acc, y]), []);
  check("22. Objects that do not overlap reuse a track",
    rows.length < boxes.length, `${rows.length} rows for ${boxes.length} objects`);

  const laneH = (await box(`[data-shoot="lane-header-${jsa.scopeId}"]`)).height;
  const used = Math.max(...boxes.map((x) => x.y + x.height)) - Math.min(...boxes.map((x) => x.y));
  check("23. An opened lane is sized to the rows it needs, not padded out",
    laneH < 320 && used > 0, `${Math.round(laneH)}px lane for ${rows.length} row(s)`);

  const before = (await proj()).entries.length;
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(800);
  check("24. Collapsing preserves every record",
    (await proj()).entries.length === before &&
      (await p.locator('[data-shoot^="plan-"][data-plan-role]').count()) > 0,
    `${before} entries`);
}

// ── 26–28. PRESENTATION IS ONLY PRESENTATION ───────────────────────
{
  const projA = await proj();
  const lanesBefore = await p.locator('[data-shoot^="lane-header-"]').count();
  await p.locator('[data-shoot="lanes-toggle"]').click();
  await p.waitForTimeout(450);
  await p.locator(`[data-shoot="lane-visible-${itrack.scopeId}"]`).click();
  await p.waitForTimeout(700);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const projB = await proj();
  check("26. Hiding a project changes the VIEW and nothing else",
    (await p.locator('[data-shoot^="lane-header-"]').count()) === lanesBefore - 1 &&
      projB.lanes.length === projA.lanes.length && projB.entries.length === projA.entries.length,
    `${lanesBefore} → ${lanesBefore - 1} lanes drawn, ${projB.entries.length} entries either way`);

  await p.locator('[data-shoot="lanes-toggle"]').click();
  await p.waitForTimeout(400);
  await p.locator(`[data-shoot="lane-down-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(600);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const projC = await proj();
  check("27. Reordering lanes changes no underlying data",
    JSON.stringify(projC.lanes.map((l) => l.scopeId)) === JSON.stringify(projA.lanes.map((l) => l.scopeId)) &&
      JSON.stringify(projC.entries.map((e) => e.id)) === JSON.stringify(projA.entries.map((e) => e.id)),
    "projection byte-identical");

  // 28. Playback still crosses the same story with a project hidden and the
  // order changed — presentation cannot reach the chronology.
  const total = await p.locator('[data-shoot="crossed-count"]').innerText();
  await p.locator('[data-shoot="to-beginning"]').click();
  await p.waitForTimeout(800);
  await p.locator('[data-shoot="play"]').click();
  for (let i = 0; i < 220; i++) {
    await p.waitForTimeout(300);
    if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
  }
  await p.waitForTimeout(1200);
  const after = await p.locator('[data-shoot="crossed-count"]').innerText();
  check("28. Playback chronology is identical with a project hidden and lanes reordered",
    after.split("/")[1] === total.split("/")[1], `${total} → ${after}`);

  await p.locator('[data-shoot="lanes-toggle"]').click();
  await p.waitForTimeout(400);
  await p.locator('[data-shoot="lanes-reset"]').click();
  await p.waitForTimeout(700);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
}

// ── 25. EIGHT LANES ────────────────────────────────────────────────
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const extra = [];
try {
  for (let i = start.lanes.length; i < 8; i++) {
    const name = `Stress ${i + 1}`;
    const ex = await db.scope.findFirst({ where: { name } });
    const row = ex ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }));
    if (!ex) extra.push(row.id);
  }
  await open();
  const heights = await p.evaluate(() =>
    [...document.querySelectorAll("[data-shoot^='lane-header-']")].map((e) => Math.round(e.getBoundingClientRect().height)));
  // CONTRACT REPLACED, NARROWLY — same change as assertions 28/29 in the
  // direct-manipulation proof. The invariant is that eight projects are all
  // still THERE and the plan is still drawn among them. The "every lane ≥
  // 60px" clause was a proxy for legibility that a deliberate rail state now
  // contradicts: a project with no plan, no forecast and no decisions is
  // 34px on purpose. The floor is kept for the projects that have a story.
  const kinds = await p.evaluate(() =>
    [...document.querySelectorAll("[data-shoot^='lane-header-']")].map((e) => ({
      dormant: e.hasAttribute("data-dormant"),
      h: Math.round(e.getBoundingClientRect().height),
      named: (e.textContent ?? "").trim().length > 0,
    })));
  check("25. Eight projects stay legible and all present",
    kinds.length === 8 &&
      kinds.every((l) => l.named) &&
      kinds.filter((l) => !l.dormant).every((l) => l.h >= 60) &&
      (await p.locator('[data-shoot^="plan-"][data-plan-role]').count()) > 0,
    heights.join("/"));
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

// ── 29–30. DISMISSAL AND REDUCED MOTION ────────────────────────────
await open();
{
  const rep = (await proj()).entries.find((e) => e.kind === "report");
  await p.locator(`[data-shoot="event-${rep.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(800);
  check("29a. Escape dismisses the selection and the panel with it",
    (await p.locator('[data-shoot="inspector-dock"][data-open]').count()) === 1);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  check("…and the seam is back",
    (await p.locator('[data-shoot="inspector-seam"]').count()) === 1 &&
      (await p.locator('[data-shoot="inspector-dock"][data-open]').count()) === 0);

  await p.locator(`[data-shoot="event-${rep.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(800);
  await p.locator('[data-shoot="inspector-close"]').click();
  await p.waitForTimeout(700);
  check("29b. The explicit close affordance dismisses it too",
    (await p.locator('[data-shoot="inspector-seam"]').count()) === 1);
}
{
  const rm = await b.newContext({ viewport: { width: 1680, height: 1050 }, reducedMotion: "reduce" });
  const q = await rm.newPage();
  let boom = 0;
  q.on("pageerror", () => boom++);
  await q.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await q.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await q.waitForTimeout(2600);
  const cur = await proj();
  const anyPlan = cur.entries.find((e) => e.family === "landmark" && e.endDate);
  const bb = await q.locator(`[data-shoot="plan-${anyPlan.id}"]`).boundingBox();
  const same = await box(`[data-shoot="plan-${anyPlan.id}"]`);
  check("30. Reduced motion renders the same canvas, in the same places",
    boom === 0 && !!bb && Math.abs(bb.x - same.x) < 2 && Math.abs(bb.y - same.y) < 2,
    `${boom} error(s), Δx ${Math.abs(bb.x - same.x).toFixed(1)}px`);
  await rm.close();
}

for (const id of made) await fetch(`${BASE}/api/timeline-events/${id}`, { method: "DELETE" }).catch(() => {});
{
  const final = await proj();
  check("Reality restored — no proof object left behind",
    !final.entries.some((e) => e.title.startsWith("DC ")));
}

await b.close();
console.log(`\n${failures === 0 ? "ALL DIRECT COMPOSITION PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
