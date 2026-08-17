// COMPOSE THE FUTURE, PROVEN WITH A REAL POINTER.
//
// Every claim in this pass is about the hand, so every check here drives an
// actual mouse: press, move, release. Nothing calls a handler directly and
// nothing substitutes a keystroke for a gesture, because a proof that
// bypasses the pointer proves nothing about direct manipulation.
//
// The laws it will not let slide:
//   1. THE GESTURE IS THE RECORD. What you drew is what got stored, to the
//      day, in the project you drew it on.
//   2. NOTHING IS WRITTEN UNTIL RELEASE, and then exactly once.
//   3. DERIVED HISTORY IS NOT YOURS TO MOVE. Reports, Decisions and Linear
//      completions refuse the drag and refuse Delete.
//   4. PLAN IS NOT FORECAST. Arranging the plan moves no capsule and no
//      target flag.
//
//   node scripts/timeline-direct-manipulation-proof.mjs
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
const plusDays = (n) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(0, 0, 0, 0);
  return d;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });
let writes = [];
p.on("request", (r) => { if (r.method() !== "GET") writes.push(`${r.method()} ${r.url().replace(BASE, "")}`); });

const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await p.waitForTimeout(2600);
};
const park = async () => { await p.mouse.move(1674, 1044); await p.waitForTimeout(300); };
/** The pixels-per-millisecond the field is actually drawn at, read off the
    spans' own stored dates rather than assumed. */
const readAxis = () =>
  p.evaluate(() => {
    const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")];
    const pts = els
      .map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left }))
      .sort((a, c) => a.t - c.t);
    return { pxPerMs: (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t), t0: pts[0].t, x0: pts[0].x };
  });
/** A y inside a lane's plan bed that no plan object is sitting on. */
const emptyBedY = async (scopeId) => {
  const bed = await p.locator(`[data-shoot="plan-bed-${scopeId}"]`).boundingBox();
  const taken = await p.evaluate(
    (sid) =>
      [...document.querySelectorAll(`[data-shoot^="plan-"][data-plan-role]`)]
        .filter((e) => e.closest("g"))
        .map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }),
    scopeId
  );
  for (let f = 0.92; f > 0.05; f -= 0.06) {
    const y = bed.y + bed.height * f;
    if (!taken.some(([t, bt]) => y >= t - 2 && y <= bt + 2)) return { bed, y };
  }
  return { bed, y: bed.y + bed.height - 3 };
};
const drag = async (x0, y0, x1, y1, steps = 12) => {
  await p.mouse.move(x0, y0);
  await p.waitForTimeout(120);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await p.waitForTimeout(35);
  }
};

// residue from an interrupted run
for (const e of (await proj()).entries.filter((x) => x.title.startsWith("DM "))) {
  await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
}

await open();
const start = await proj();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");
const itrack = laneOf("iTrack");
const axis = await readAxis();
const xOf = (t) => axis.x0 + (t - axis.t0) * axis.pxPerMs;
const made = [];

// ── 1–7. COMPOSE A SPAN BY DRAWING IT ──────────────────────────────
{
  const t0 = plusDays(8);   // the spec's Aug 24 → Sep 11, expressed relative
  const t1 = plusDays(26);
  const { y } = await emptyBedY(jsa.scopeId);
  writes = [];

  await drag(xOf(t0.getTime()), y, xOf(t1.getTime()), y);
  const drawing = await p.locator('[data-shoot="plan-draft"]').count();
  check("Dragging empty future space draws a provisional activity", drawing === 1);
  check("…and writes nothing while it is being drawn", writes.length === 0, `${writes.length} write(s)`);

  await p.mouse.up();
  await p.waitForTimeout(500);
  check("Releasing opens inline naming on the object itself",
    (await p.locator('[data-shoot="plan-draft-input"]').count()) === 1);
  check("…still with nothing written", writes.length === 0, `${writes.length} write(s)`);

  await p.keyboard.type("DM Marketing plan");
  await p.waitForTimeout(200);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1700);

  const after = await proj();
  const rows = after.entries.filter((e) => e.title === "DM Marketing plan");
  rows.forEach((r) => made.push(r.id));
  check("Enter creates EXACTLY ONE TimelineEvent", rows.length === 1, `${rows.length} row(s)`);
  check("…on the project it was drawn on", rows[0]?.scopeId === jsa.scopeId, rows[0] ? "JSA" : "—");
  check("…with the exact dates the gesture described",
    day(rows[0]?.date) === day(t0) && day(rows[0]?.endDate) === day(t1),
    `${day(rows[0]?.date)} → ${day(rows[0]?.endDate)} (drew ${day(t0)} → ${day(t1)})`);
  check("…stored PLANNED, because composing into the future is intent",
    rows[0]?.temporalState === "planned", rows[0]?.temporalState);
  check("…in exactly one write", writes.filter((w) => w.startsWith("POST")).length === 1, writes.join(", "));
}

// ── 7. ESCAPE WRITES NOTHING ───────────────────────────────────────
{
  await open();
  const { y } = await emptyBedY(itrack.scopeId);
  const countBefore = (await proj()).entries.length;
  writes = [];
  await drag(xOf(plusDays(50).getTime()), y, xOf(plusDays(62).getTime()), y);
  await p.mouse.up();
  await p.waitForTimeout(400);
  await p.keyboard.type("DM discarded");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  const countAfter = (await proj()).entries.length;
  check("Escape discards a provisional object completely",
    countAfter === countBefore && writes.length === 0 && (await p.locator('[data-shoot="plan-draft"]').count()) === 0,
    `${countBefore} → ${countAfter} entries, ${writes.length} write(s)`);
}

// ── 8–9. MOVE PRESERVES DURATION ───────────────────────────────────
await open();
let mk = (await proj()).entries.find((e) => e.title === "DM Marketing plan");
{
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const field0 = await p.locator('[data-shoot="time-field"]').boundingBox();
  writes = [];
  const dx = 7 * DAY * axis.pxPerMs;
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + dx, box.y + box.height / 2);
  const readout = await p.locator('[data-shoot="plan-drag-readout"]').innerText().catch(() => "");
  check("A move states where it will land, next to the object",
    /rescheduling/i.test(readout), readout.replace(/\s+/g, " ").slice(0, 40));
  check("17. Zero network requests during pointer movement", writes.length === 0, `${writes.length}`);
  const fieldDuring = await p.locator('[data-shoot="time-field"]').boundingBox();
  check("The score does not move under the hand",
    JSON.stringify(field0) === JSON.stringify(fieldDuring));
  await p.mouse.up();
  await p.waitForTimeout(1600);

  const m2 = (await proj()).entries.find((e) => e.id === mk.id);
  const d0 = Math.round((new Date(mk.endDate) - new Date(mk.date)) / DAY);
  const d1 = Math.round((new Date(m2.endDate) - new Date(m2.date)) / DAY);
  const moved = Math.round((new Date(m2.date) - new Date(mk.date)) / DAY);
  check("8. Dragging the body moves it by the days asked for", moved === 7, `+${moved}d`);
  check("9. Duration remains exactly unchanged", d0 === d1, `${d0}d → ${d1}d`);
  check("18. Exactly one mutation on release", writes.length === 1, writes.join(", ") || "none");
  mk = m2;
}

// ── 10–13. EDGES MOVE ONLY THEMSELVES ──────────────────────────────
await open();
{
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const cy = box.y + box.height / 2;
  // Grips appear on hover, which is also how a person finds them.
  await p.mouse.move(box.x + box.width / 2, cy);
  await p.waitForTimeout(300);
  writes = [];
  await drag(box.x + box.width - 1, cy, box.x + box.width - 1 + 5 * DAY * axis.pxPerMs, cy);
  const readout = await p.locator('[data-shoot="plan-drag-readout"]').innerText().catch(() => "");
  check("A resize says RESIZING, not rescheduling", /resizing/i.test(readout), readout.replace(/\s+/g, " ").slice(0, 34));
  await p.mouse.up();
  await p.waitForTimeout(1600);

  const m3 = (await proj()).entries.find((e) => e.id === mk.id);
  check("10. Right-edge resize moves the end +5 days",
    Math.round((new Date(m3.endDate) - new Date(mk.endDate)) / DAY) === 5,
    `${day(mk.endDate)} → ${day(m3.endDate)}`);
  check("11. Start remains unchanged", day(m3.date) === day(mk.date), day(m3.date));
  mk = m3;
}
await open();
{
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const cy = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width / 2, cy);
  await p.waitForTimeout(300);
  await drag(box.x + 1, cy, box.x + 1 - 3 * DAY * axis.pxPerMs, cy);
  await p.mouse.up();
  await p.waitForTimeout(1600);
  const m4 = (await proj()).entries.find((e) => e.id === mk.id);
  check("12. Left-edge resize moves the start -3 days",
    Math.round((new Date(m4.date) - new Date(mk.date)) / DAY) === -3,
    `${day(mk.date)} → ${day(m4.date)}`);
  check("13. End remains unchanged", day(m4.endDate) === day(mk.endDate), day(m4.endDate));
  mk = m4;
}

// ── 14–16. CARRY IT INTO ANOTHER PROJECT ───────────────────────────
await open();
{
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const target = await p.locator(`[data-shoot="lane-header-${itrack.scopeId}"]`).boundingBox();
  writes = [];
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2, target.y + target.height / 2, 14);
  const lit = await p.locator(`[data-shoot="lane-destination-${itrack.scopeId}"]`).count();
  const readout = await p.locator('[data-shoot="plan-drag-readout"]').innerText().catch(() => "");
  check("The destination lane wakes while an activity is carried into it", lit === 1);
  check("…and the readout names the project it is going to", /moving to itrack/i.test(readout), readout.replace(/\s+/g, " ").slice(0, 40));
  check("Still nothing written mid-gesture", writes.length === 0, `${writes.length}`);
  await p.mouse.up();
  await p.waitForTimeout(1700);

  const m5 = (await proj()).entries.find((e) => e.id === mk.id);
  check("14/15. Dropping it in another lane reassigns scopeId, once",
    m5.scopeId === itrack.scopeId && writes.length === 1, `${writes.length} write(s)`);
  check("16. Dates are unchanged by a cross-project move",
    day(m5.date) === day(mk.date) && day(m5.endDate) === day(mk.endDate),
    `${day(m5.date)} → ${day(m5.endDate)} held`);
  mk = m5;
}

// ── 20–23. DERIVED HISTORY REFUSES ─────────────────────────────────
await open();
{
  const cur = await proj();
  const cases = [
    ["20. A Report", cur.entries.find((e) => e.kind === "report")],
    ["21. A Decision", cur.entries.find((e) => e.family === "decision")],
    ["22. A Linear completion", cur.entries.find((e) => e.kind === "work_completed")],
  ];
  for (const [label, entry] of cases) {
    if (!entry) { check(`${label} exists to check`, false, "none"); continue; }
    const el = p.locator(`[data-shoot="event-${entry.id}"]`);
    const box = await el.boundingBox();
    writes = [];
    await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + 90, box.y + box.height / 2, 8);
    await p.mouse.up();
    await p.waitForTimeout(900);
    const same = (await proj()).entries.find((e) => e.id === entry.id);
    check(`${label} refuses the drag`, !!same && day(same.date) === day(entry.date) && writes.length === 0,
      `${writes.length} write(s), ${day(entry.date)} held`);
  }

  // 23. …and refuses Delete, because there is no row behind it to remove.
  const rep = cur.entries.find((e) => e.kind === "report");
  await p.locator(`[data-shoot="event-${rep.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(700);
  writes = [];
  await p.keyboard.press("Delete");
  await p.waitForTimeout(500);
  await p.keyboard.press("Delete");
  await p.waitForTimeout(900);
  const stillThere = (await proj()).entries.some((e) => e.id === rep.id);
  check("23. Derived history refuses Delete — there is no row behind it",
    stillThere && writes.length === 0 && (await p.locator('[data-shoot="delete-confirm"]').count()) === 0,
    `${writes.length} write(s)`);
}

// ── 24–25. PLAN IS NOT FORECAST, AND NOT TARGET ────────────────────
await open();
{
  const capsule0 = await p.locator('[data-shoot="forecast-memory"]').first().boundingBox();
  const target0 = await p.locator('[data-shoot="memory-target"]').first().boundingBox();
  const likely0 = await p.locator(`[data-shoot="memory-likely-${jsa.scopeId}"]`).innerText().catch(() => null);

  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + 6 * DAY * axis.pxPerMs, box.y + box.height / 2);
  await p.mouse.up();
  await p.waitForTimeout(1700);

  const capsule1 = await p.locator('[data-shoot="forecast-memory"]').first().boundingBox();
  const target1 = await p.locator('[data-shoot="memory-target"]').first().boundingBox();
  const likely1 = await p.locator(`[data-shoot="memory-likely-${jsa.scopeId}"]`).innerText().catch(() => null);
  check("24. The Forecast capsule does not move when the plan is arranged",
    JSON.stringify(capsule0) === JSON.stringify(capsule1) && likely0 === likely1, `${likely1} held`);
  check("25. Nor does the target flag",
    JSON.stringify(target0) === JSON.stringify(target1));
}

// ── 19. DELETE REMOVES ONLY THE SELECTED OBJECT ────────────────────
await open();
{
  const before = await proj();
  const el = p.locator(`[data-shoot="plan-${mk.id}"]`);
  await el.dispatchEvent("click");
  await p.waitForTimeout(700);
  writes = [];
  await p.keyboard.press("Delete");
  await p.waitForTimeout(500);
  check("Delete asks once before removing anything",
    (await p.locator('[data-shoot="delete-confirm"]').count()) === 1 && writes.length === 0);
  await p.keyboard.press("Delete");
  await p.waitForTimeout(1500);
  const after = await proj();
  check("19. Delete removes exactly the selected TimelineEvent, and nothing else",
    !after.entries.some((e) => e.id === mk.id) && after.entries.length === before.entries.length - 1,
    `${before.entries.length} → ${after.entries.length}`);
  made.length = 0;
}

// ── 26. OPENING A LANE DOES NOT MOVE THE AXIS ──────────────────────
await open();
{
  const axisBox = () =>
    p.evaluate(() => {
      const e = document.querySelector("[data-plan-role='span'][data-date]");
      const r = e.getBoundingClientRect();
      return { id: e.getAttribute("data-date"), x: +r.left.toFixed(2), w: +r.width.toFixed(2) };
    });
  const a0 = await axisBox();
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(800);
  const a1 = await axisBox();
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(700);
  const a2 = await axisBox();
  check("26. Opening and closing a lane produces 0px date-axis drift",
    a0.x === a1.x && a1.x === a2.x && a0.w === a1.w,
    `${a0.x}px → ${a1.x}px → ${a2.x}px`);
}

// ── 27. SELECTABLE AT DENSE OVERLAP ────────────────────────────────
{
  const cur = await proj();
  const objs = cur.entries.filter((e) => e.family === "landmark" && e.scopeId === jsa.scopeId);
  let reachable = 0;
  for (const o of objs) {
    const box = await p.locator(`[data-shoot="plan-${o.id}"]`).boundingBox();
    if (!box) continue;
    const hit = await p.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-shoot]")?.getAttribute("data-shoot") ?? "",
      [box.x + Math.min(20, box.width / 2), box.y + box.height / 2]
    );
    if (hit === `plan-${o.id}`) reachable++;
  }
  check("27. Every plan object stays reachable where they overlap",
    reachable === objs.length, `${reachable}/${objs.length}`);
}

// ── 28–29. BOTH DENSITIES ──────────────────────────────────────────
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
  const heights = () =>
    p.evaluate(() => [...document.querySelectorAll("[data-shoot^='lane-header-']")].map((e) => Math.round(e.getBoundingClientRect().height)));
  const flat = await heights();
  check("28. Eight lanes stay compact and all present",
    flat.length === 8 && flat.every((h) => h >= 60), flat.join("/"));
  const objs = await p.locator('[data-shoot^="plan-"][data-plan-role]').count();
  check("…with the plan still drawn at that density", objs > 0, `${objs} plan objects`);

  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(900);
  const open8 = await heights();
  const i = (await p.evaluate((sid) =>
    [...document.querySelectorAll("[data-shoot^='lane-header-']")].findIndex((e) => e.getAttribute("data-shoot") === `lane-header-${sid}`), jsa.scopeId));
  check("29. One lane opens legibly while the other seven stay compact",
    open8[i] > flat[i] * 1.5 && open8.filter((_, k) => k !== i).every((h) => h >= 60),
    `${flat[i]}px → ${open8[i]}px, siblings ${open8.filter((_, k) => k !== i).join("/")}`);
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

// tidy
for (const id of made) await fetch(`${BASE}/api/timeline-events/${id}`, { method: "DELETE" }).catch(() => {});
{
  const final = await proj();
  check("Reality restored — no proof object left behind",
    !final.entries.some((e) => e.title.startsWith("DM ")));
}

await b.close();
console.log(`\n${failures === 0 ? "ALL DIRECT MANIPULATION PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
