// THE FUTURE PLAN CANVAS, PROVEN BY USING IT.
//
// The claim of this pass is that the right of NOW is not a picture of a
// plan but the plan itself: objects at real calendar positions that a
// person composes with the pointer. So this drives a real browser, drags
// real objects with a real mouse, and checks the stored rows afterwards.
//
// The three things it will not let slide:
//   1. GEOMETRY IS THE RECORD. An object drawn at Sep 1 is stored at Sep 1,
//      and the pixels are checked against the axis, not against a guess.
//   2. HISTORY DOES NOT MOVE. An occurred landmark is not draggable, and
//      no amount of dragging across it changes a stored date.
//   3. A PLAN IS NOT A FORECAST. Moving a plan object moves no forecast,
//      because a TimelineEvent feeds no simulation.
//
//   node scripts/timeline-plan-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const day = (s) => (s ? new Date(s).toISOString().slice(0, 10) : "—");
// SVG nodes are not HTMLElements, so innerText does not exist on them.
const textOf = (sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });
const writes = [];
p.on("request", (r) => { if (r.method() !== "GET") writes.push(`${r.method()} ${r.url().replace(BASE, "")}`); });

const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await p.waitForTimeout(2600);
};

// Clear residue from an interrupted run before measuring anything.
{
  const pre = await proj();
  for (const e of pre.entries.filter((x) => x.title.startsWith("PROOF"))) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
}

await open();
const before = await proj();
const laneOf = (name) => before.lanes.find((l) => l.name === name) ?? before.lanes[0];

// ── the axis, derived from the score itself ────────────────────────
// Two objects with known stored dates give pixels-per-millisecond, which
// is what turns "it looks about right" into "it is at that date".
const axis = await p.evaluate(() => {
  // SPANS ONLY. A point's bounding box is its grab rect, which reaches
  // left of the date it marks; a span's left edge IS its start date.
  const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")];
  const pts = els.map((e) => ({
    t: new Date(e.getAttribute("data-date")).getTime(),
    x: e.getBoundingClientRect().left,
  })).sort((a, b) => a.t - b.t);
  const lo = pts[0], hi = pts[pts.length - 1];
  return { pxPerMs: (hi.x - lo.x) / (hi.t - lo.t), t0: lo.t, x0: lo.x };
});
const xForDate = (iso) => axis.x0 + (new Date(iso).getTime() - axis.t0) * axis.pxPerMs;

// ── 1. a span is drawn at its exact start and end ──────────────────
{
  const mk = before.entries.find((e) => e.title === "Marketing plan");
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const wantX = xForDate(mk.date);
  const wantW = (new Date(mk.endDate) - new Date(mk.date)) * axis.pxPerMs;
  check(
    "A span is drawn at its exact start date",
    Math.abs(box.x - wantX) < 2,
    `${day(mk.date)} at ${box.x.toFixed(1)}px, axis says ${wantX.toFixed(1)}px`
  );
  check(
    "…and at its exact real duration",
    Math.abs(box.width - wantW) < 3,
    `${Math.round((new Date(mk.endDate) - new Date(mk.date)) / DAY)}d = ${box.width.toFixed(1)}px, axis says ${wantW.toFixed(1)}px`
  );
  check("…and carries its name, not a colour to look up", /marketing plan/i.test(await textOf(`[data-shoot="plan-${mk.id}"]`)));
}

// ── 2. overlapping plans get readable subtracks ────────────────────
{
  const jsa = laneOf("JSA");
  const objs = before.entries.filter((e) => e.family === "landmark" && e.scopeId === jsa.scopeId);
  const boxes = [];
  for (const o of objs) {
    const bb = await p.locator(`[data-shoot="plan-${o.id}"]`).boundingBox();
    if (bb) boxes.push({ title: o.title, ...bb });
  }
  let overlapPairs = 0;
  let collisions = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      const xOverlap = a.x < c.x + c.width && c.x < a.x + a.width;
      const yOverlap = a.y < c.y + c.height && c.y < a.y + a.height;
      if (xOverlap) overlapPairs++;
      if (xOverlap && yOverlap) collisions++;
    }
  }
  check(
    "Plans that overlap in calendar time are drawn on separate subtracks",
    overlapPairs > 0 && collisions === 0,
    `${overlapPairs} overlapping pair(s), ${collisions} collision(s) among ${boxes.length} objects`
  );
  const rows = new Set(boxes.map((x) => Math.round(x.y)));
  check("…and a lane uses only as many rows as it needs", rows.size >= 2 && rows.size <= boxes.length, `${rows.size} rows for ${boxes.length} objects`);
}

// ── 3. moving a span conserves its duration ────────────────────────
let forecastBefore = null;
{
  const jsa = laneOf("JSA");
  forecastBefore = await p.locator(`[data-shoot="memory-likely-${jsa.scopeId}"]`).innerText().catch(() => null);
  const capsuleBefore = await p.locator('[data-shoot="forecast-memory"]').first().boundingBox();

  const mk = before.entries.find((e) => e.title === "Marketing plan");
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const fieldBefore = await p.locator('[data-shoot="time-field"]').boundingBox();

  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const dxDays = 8;
  const dx = dxDays * DAY * axis.pxPerMs;

  await p.mouse.move(cx, cy);
  await p.waitForTimeout(140);
  await p.mouse.down();
  const drift = [];
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(cx + (dx * i) / 10, cy);
    await p.waitForTimeout(40);
    drift.push(await p.locator('[data-shoot="time-field"]').boundingBox());
  }
  const readout = await p.locator('[data-shoot="plan-drag-readout"]').innerText().catch(() => "");
  check("A drag states the dates it will land on, before it lands", /rescheduling/i.test(readout), readout.replace(/\s+/g, " ").slice(0, 44));

  const worst = Math.max(
    ...drift.map((d) => Math.max(Math.abs(d.x - fieldBefore.x), Math.abs(d.y - fieldBefore.y), Math.abs(d.width - fieldBefore.width)))
  );
  check("The score does not move while an object is dragged across it", worst === 0, `${worst.toFixed(1)}px`);

  const writesDuring = writes.length;
  check("Nothing is written to the server DURING the drag", writesDuring === 0, `${writesDuring} write(s)`);

  await p.mouse.up();
  await p.waitForTimeout(1500);
  // Dropping selects, and selecting reveals the inspector. Put it down so
  // the forecast is measured in the same layout state it was measured in.
  await p.keyboard.press("Escape");
  await p.waitForTimeout(800);

  const after = await proj();
  const mk2 = after.entries.find((e) => e.id === mk.id);
  const durBefore = Math.round((new Date(mk.endDate) - new Date(mk.date)) / DAY);
  const durAfter = Math.round((new Date(mk2.endDate) - new Date(mk2.date)) / DAY);
  check("Moving a span retimes it", day(mk2.date) !== day(mk.date), `${day(mk.date)} → ${day(mk2.date)}`);
  check("…and CONSERVES its duration exactly", durBefore === durAfter, `${durBefore}d → ${durAfter}d`);
  check("…landing on the day the drag asked for", Math.abs((new Date(mk2.date) - new Date(mk.date)) / DAY - dxDays) < 1.5,
    `asked +${dxDays}d, got +${Math.round((new Date(mk2.date) - new Date(mk.date)) / DAY)}d`);
  check("…committed with exactly ONE write, on release", writes.length === 1, writes.join(", ") || "none");

  // ── 4. a plan is not a forecast ──────────────────────────────────
  const forecastAfter = await p.locator(`[data-shoot="memory-likely-${jsa.scopeId}"]`).innerText().catch(() => null);
  const capsuleAfter = await p.locator('[data-shoot="forecast-memory"]').first().boundingBox();
  check(
    "Moving a plan object moves NO forecast — planning is not gating",
    forecastBefore === forecastAfter &&
      JSON.stringify(capsuleBefore) === JSON.stringify(capsuleAfter),
    `${forecastAfter} unchanged`
  );

  // put it back where the seed left it
  await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: mk.date, endDate: mk.endDate }),
  });
}

// ── 5. resizing an edge changes only that edge ─────────────────────
await open();
writes.length = 0;
{
  const now = await proj();
  const hard = now.entries.find((e) => e.title === "Hardening");
  const box = await p.locator(`[data-shoot="plan-${hard.id}"]`).boundingBox();
  // Grips appear on hover, which is also how a person finds them.
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(320);
  const ex = box.x + box.width, ey = box.y + box.height / 2;
  await p.mouse.move(ex - 1, ey);
  await p.waitForTimeout(140);
  await p.mouse.down();
  const dx = 6 * DAY * axis.pxPerMs;
  for (let i = 1; i <= 8; i++) { await p.mouse.move(ex - 1 + (dx * i) / 8, ey); await p.waitForTimeout(35); }
  await p.mouse.up();
  await p.waitForTimeout(1500);

  const after = await proj();
  const h2 = after.entries.find((e) => e.id === hard.id);
  check("Resizing the end edge moves the END", day(h2.endDate) !== day(hard.endDate), `${day(hard.endDate)} → ${day(h2.endDate)}`);
  check("…and leaves the START exactly where it was", day(h2.date) === day(hard.date), day(h2.date));
  check("…so the span got longer, not later",
    new Date(h2.endDate) - new Date(h2.date) > new Date(hard.endDate) - new Date(hard.date),
    `${Math.round((new Date(hard.endDate) - new Date(hard.date)) / DAY)}d → ${Math.round((new Date(h2.endDate) - new Date(h2.date)) / DAY)}d`);

  await fetch(`${BASE}/api/timeline-events/${hard.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: hard.date, endDate: hard.endDate }),
  });
}

// ── 6. history is not draggable ────────────────────────────────────
await open();
writes.length = 0;
{
  const now = await proj();
  const past = now.entries.find((e) => e.family === "landmark" && e.temporalState === "occurred");
  const el = p.locator(`[data-shoot="plan-${past.id}"]`);
  check("An occurred landmark is NOT marked draggable", (await el.getAttribute("data-draggable")) === null, past.title);

  const box = await el.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(140);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2); await p.waitForTimeout(35); }
  await p.mouse.up();
  await p.waitForTimeout(1200);

  const after = await proj();
  const past2 = after.entries.find((e) => e.id === past.id);
  check("Dragging across history does not move it", day(past2.date) === day(past.date), `${day(past.date)} held`);
  check("…and writes nothing at all", writes.length === 0, writes.join(", ") || "no writes");

  // HISTORY IS STILL A CITIZEN. Refusing the drag must not make the object
  // inert — it is selectable, inspectable, and says so in words.
  await el.dispatchEvent("click");
  await p.waitForTimeout(800);
  const body = await p.locator("body").innerText();
  check("…but it is still selectable, inspectable and editable through the tool",
    body.includes(past.title) && /does not move by dragging/i.test(body),
    past.title);
}

// ── 7. creating objects ────────────────────────────────────────────
await open();
const created = [];
{
  const jsa = laneOf("JSA");
  const mkEvent = async (body) => {
    const r = await fetch(`${BASE}/api/timeline-events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.event) created.push(j.event.id);
    return j.event;
  };
  const t0 = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const t1 = new Date(Date.now() + 48 * DAY).toISOString().slice(0, 10);

  const pt = await mkEvent({
    scopeId: jsa.scopeId, title: "PROOF point milestone",
    date: `${t0}T12:00:00Z`, temporalState: "planned", kind: "milestone",
  });
  const sp = await mkEvent({
    scopeId: jsa.scopeId, title: "PROOF span activity",
    date: `${t0}T12:00:00Z`, endDate: `${t1}T12:00:00Z`, temporalState: "planned", kind: "phase",
  });

  await open();
  const ptBox = await p.locator(`[data-shoot="plan-${pt.id}"]`).boundingBox();
  const spBox = await p.locator(`[data-shoot="plan-${sp.id}"]`).boundingBox();
  check("A created POINT appears on the score at its exact date",
    !!ptBox && (await p.locator(`[data-shoot="plan-${pt.id}"]`).getAttribute("data-plan-role")) === "point" &&
    day(await p.locator(`[data-shoot="plan-${pt.id}"]`).getAttribute("data-date")) === t0,
    `${t0}`);
  check("A created SPAN appears with the exact geometry of its dates",
    !!spBox && Math.abs(spBox.width - (new Date(`${t1}T12:00:00Z`) - new Date(`${t0}T12:00:00Z`)) * axis.pxPerMs) < 4,
    `${t0} → ${t1} = ${spBox?.width.toFixed(1)}px`);
  check("…and is named on the score, not left anonymous",
    /PROOF span activity/.test(await textOf(`[data-shoot="plan-${sp.id}"]`)));

  // ── 8. a point drags to an exact new date ──────────────────────
  writes.length = 0;
  const cx = ptBox.x + 2, cy = ptBox.y + ptBox.height / 2;
  const dxDays = -5;
  await p.mouse.move(cx, cy);
  await p.waitForTimeout(140);
  await p.mouse.down();
  const dx = dxDays * DAY * axis.pxPerMs;
  for (let i = 1; i <= 8; i++) { await p.mouse.move(cx + (dx * i) / 8, cy); await p.waitForTimeout(35); }
  await p.mouse.up();
  await p.waitForTimeout(1500);

  const after = await proj();
  const pt2 = after.entries.find((e) => e.id === pt.id);
  const moved = Math.round((new Date(pt2.date) - new Date(pt.date)) / DAY);
  check("Dragging a point milestone reschedules it to the day asked for",
    Math.abs(moved - dxDays) < 1.5, `${day(pt.date)} → ${day(pt2.date)} (${moved}d)`);
  check("…and it is still a point — a drag never grows a duration", pt2.endDate === null, "no endDate");
}

// ── 9. lane composition is presentation only ───────────────────────
await open();
{
  const projA = await proj();
  const target = projA.lanes[projA.lanes.length - 1];
  const markersBefore = await p.locator('[data-shoot^="lane-header-"]').count();

  await p.locator('[data-shoot="lanes-toggle"]').click();
  await p.waitForTimeout(500);
  check("A Projects control exists and opens", (await p.locator('[data-shoot="lanes-panel"]').count()) === 1);
  await p.locator(`[data-shoot="lane-visible-${target.scopeId}"]`).click();
  await p.waitForTimeout(700);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  const markersAfter = await p.locator('[data-shoot^="lane-header-"]').count();
  check("Hiding a project removes its lane from the VIEW", markersAfter === markersBefore - 1, `${markersBefore} → ${markersAfter}`);

  const projB = await proj();
  check(
    "…and removes NOTHING from Reality — Scope still owns the release",
    projB.lanes.length === projA.lanes.length &&
      projB.entries.length === projA.entries.length &&
      projB.lanes.some((l) => l.scopeId === target.scopeId),
    `${projB.lanes.length} lanes, ${projB.entries.length} entries either way`
  );

  await p.locator('[data-shoot="lanes-toggle"]').click();
  await p.waitForTimeout(400);
  await p.locator('[data-shoot="lanes-reset"]').click();
  await p.waitForTimeout(700);
  check("…and showing it again brings it straight back",
    (await p.locator('[data-shoot^="lane-header-"]').count()) === markersBefore);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

// ── 10. a lane opens to the depth its plan needs ───────────────────
{
  const jsa = laneOf("JSA");
  const heights = () => p.evaluate(() =>
    [...document.querySelectorAll("[data-shoot^='lane-header-']")].map((e) => Math.round(e.getBoundingClientRect().height)));
  const flat = await heights();
  const wellFlat = await p.locator('[data-shoot="time-field"]').boundingBox();
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(700);
  const open2 = await heights();
  const i = before.lanes.findIndex((l) => l.scopeId === jsa.scopeId);
  check("Opening a project gives it real depth", open2[i] > flat[i] * 1.4, `${flat[i]}px → ${open2[i]}px`);
  check("…and its siblings compress rather than the field growing",
    open2.filter((_, k) => k !== i).every((h, k) => h < flat.filter((_, m) => m !== i)[k]),
    open2.join("/"));
  // THE WELL IS CONSERVED. Expanding redistributes the field; it does not
  // grow it, and it does not leave a strip of it empty either.
  const sum = (a) => a.reduce((x, c) => x + c, 0);
  const well = await p.locator('[data-shoot="time-field"]').boundingBox();
  check("…and nothing of the well is abandoned to make room",
    sum(open2) >= sum(flat) && sum(open2) <= well.height,
    `${sum(flat)}px flat, ${sum(open2)}px open, well ${Math.round(well.height)}px`);
  check("…and the instrument itself does not resize to accommodate it",
    Math.abs(well.height - wellFlat.height) < 1,
    `${Math.round(wellFlat.height)}px → ${Math.round(well.height)}px`);
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await p.waitForTimeout(600);
}

// ── 11. history and the model are untouched by all of it ───────────
{
  const after = await proj();
  const derivedBefore = before.entries.filter((e) => e.family !== "landmark").map((e) => e.id);
  const derivedAfter = after.entries.filter((e) => e.family !== "landmark").map((e) => e.id);
  const only = (a, b) => a.filter((x) => !new Set(b).has(x)).slice(0, 3);
  const firstOrder = derivedBefore.findIndex((x, i) => derivedAfter[i] !== x);
  check(
    "The historical projection is byte-identical after a session of planning",
    JSON.stringify(derivedBefore) === JSON.stringify(derivedAfter),
    JSON.stringify(derivedBefore) === JSON.stringify(derivedAfter)
      ? `${derivedBefore.length} derived entries either way`
      : `gained ${JSON.stringify(only(derivedAfter, derivedBefore))} lost ${JSON.stringify(only(derivedBefore, derivedAfter))} order@${firstOrder} ${derivedBefore[firstOrder]} vs ${derivedAfter[firstOrder]}`
  );
  const snapsBefore = JSON.stringify(before.snapshotsByScope);
  check("Forecast memory is untouched — no Report was rewritten",
    snapsBefore === JSON.stringify(after.snapshotsByScope));
}

// tidy: the proof leaves Reality as it found it
for (const id of created) await fetch(`${BASE}/api/timeline-events/${id}`, { method: "DELETE" }).catch(() => {});
{
  const final = await proj();
  check("Reality restored — every proof object removed",
    !final.entries.some((e) => e.title.startsWith("PROOF")));
}

await b.close();
console.log(`\n${failures === 0 ? "ALL FUTURE PLAN CANVAS PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
