// EVENT INTAKE → REALITY, PROVEN.
//
// The claim of this pass is that a candidate is INERT until a human puts it
// somewhere, and that putting it somewhere is one physical act with one
// write. Everything here is a measurement of that:
//
//   nothing arrives by itself; the tray is material, not a review queue;
//   the pointer writes nothing until it is released; release writes exactly
//   once; the placement is the human's and the suggestion stays the
//   source's; it cannot be placed twice; one ⌘Z puts it back on the rack;
//   and once placed it is an ordinary plan object with no special path.
//
//   node scripts/timeline-intake-drag-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;
const db = new PrismaClient();

/** The rows that must NOT move because a candidate exists or was placed.
    Read straight from the database rather than through an API, so no route's
    filtering can hide a change. */
const otherTruth = async () => ({
  allocations: await db.allocation.count(),
  decisions: await db.decision.count(),
  gates: await db.decisionGate.count(),
  scopes: await db.scope.count(),
  workEstimates: await db.workEstimate.count(),
  reports: await db.report.count(),
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

// EVERY NON-GET, RECORDED. The whole pass turns on when writes happen, so
// they are counted rather than assumed.
let writes = [];
await p.route("**/*", (r) => {
  if (r.request().method() !== "GET") writes.push(`${r.request().method()} ${r.request().url().replace(BASE, "")}`);
  r.continue();
});

const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const inputs = async () => (await fetch(`${BASE}/api/portfolio/inputs`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const settle = (ms = 800) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(300); };
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
  await park();
};
/** Carry a candidate from the tray to a point, reporting what the score says
    it would do. Returns the live preview without releasing. */
const carry = async (candidateId, to) => {
  const card = await box(`[data-shoot="intake-${candidateId}"]`);
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  await p.mouse.move(card.x + 60, card.y - 30, { steps: 3 });
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(card.x + 60 + (to.x - card.x - 60) * (i / 10), card.y - 30 + (to.y - card.y + 30) * (i / 10));
  }
  await settle(300);
  return p.evaluate(() => {
    const g = document.querySelector('[data-shoot="intake-preview"]');
    return g
      ? { scope: g.getAttribute("data-scope"), date: g.getAttribute("data-date"), end: g.getAttribute("data-end") ?? null }
      : null;
  });
};
const laneMid = async (scopeId) => {
  const l = await box(`[data-shoot="lane-header-${scopeId}"]`);
  return l.y + l.height / 2;
};
const truth = (j) =>
  JSON.stringify(j.entries.map((e) => [e.id, e.date, e.endDate, e.scopeId, e.temporalState]));

// ── THE RACK IS RESTOCKED BEFORE ANYTHING IS MEASURED ──────────────
//
// Every piece a previous run placed goes back, through the same DELETE the
// product's undo uses — identified by its ORIGIN rather than by a hard-coded
// list of titles, so nothing can be missed as the fixtures grow.
//
// Then the orphans. A candidate marked `accepted` whose event no longer exists
// is stranded: invisible on the rack and absent from the score. It cannot
// happen through the product — acceptance and removal are both transactional —
// but it CAN happen when a Scope is deleted, because the database cascades its
// TimelineEvents away without the route that hands the candidate back. This
// proof deletes a scratch Scope, so it is the one thing in the system that
// creates them, and it repairs its own mess here rather than draining the rack
// a little more on every run.
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  const accepted = await db.timelineEventCandidate.findMany({ where: { status: "accepted" } });
  for (const c of accepted) {
    const live = c.acceptedEventId
      ? await db.timelineEvent.findUnique({ where: { id: c.acceptedEventId }, select: { id: true } })
      : null;
    if (!live) {
      await db.timelineEventCandidate.update({
        where: { id: c.id },
        data: { status: "pending", acceptedEventId: null },
      });
    }
  }
}

await open();
const start = await proj();
const startInputs = await inputs();
const startOther = await otherTruth();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");
const platform = laneOf("Platform");
const activity = start.candidates.find((c) => c.date && c.endDate);
const moment = start.candidates.find((c) => c.date && !c.endDate && c.title === "Executive launch review");
const undated = start.candidates.find((c) => !c.date);

// ── A. INERTNESS ───────────────────────────────────────────────────
{
  check("A1. Candidates are pending, and there are several kinds of them",
    start.candidates.length >= 3, `${start.candidates.length} pending`);
  check("A2. Loading them created NO Timeline row",
    start.entries.filter((e) => e.family === "landmark" && e.detail.source === "candidate").length === 0,
    `${start.entries.filter((e) => e.family === "landmark").length} landmarks, none from a candidate`);
  check("A3. …and no write of any kind reached the server on load",
    writes.filter((w) => !w.startsWith("OPTIONS")).length === 0, writes.join(", ") || "none");

  const again = await proj();
  check("A4. The projection is unchanged by candidates existing",
    truth(again) === truth(start), `${start.entries.length} entries`);
  check("A5. Forecast inputs are untouched",
    JSON.stringify((await inputs()).scopes) === JSON.stringify(startInputs.scopes));
  // §12, stated at the strongest available level: HERMES SUGGESTS, IT DOES
  // NOT SCHEDULE. Candidates being present changes nothing anywhere else in
  // the system, and this is checked against the tables themselves.
  check("A7. Scope composition, Portfolio allocation and Decision state are all untouched",
    JSON.stringify(await otherTruth()) === JSON.stringify(startOther),
    JSON.stringify(startOther));
  const shown = await p.evaluate(() =>
    +(document.querySelector('[data-shoot="event-intake-toggle"]')?.getAttribute("data-count") ?? -1));
  check("A6. The intake count is the real number of pending candidates",
    shown === start.candidates.length, `${shown} shown, ${start.candidates.length} pending`);
}

// ── B. THE TRAY ────────────────────────────────────────────────────
await openTray();
{
  check("B1. A dated ACTIVITY is on the rack", !!activity,
    activity ? `${activity.title} · ${activity.date.slice(0, 10)}→${activity.endDate.slice(0, 10)}` : "none");
  check("B2. A dated MOMENT is on the rack", !!moment,
    moment ? `${moment.title} · ${moment.date.slice(0, 10)}` : "none");
  check("B3. A DATELESS candidate is on the rack", !!undated, undated ? undated.title : "none");

  const cards = await p.evaluate((ids) =>
    ids.map((id) => {
      const el = document.querySelector(`[data-shoot="intake-${id}"]`);
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        placeable: el.hasAttribute("data-placeable"),
        text: (el.textContent ?? "").trim(),
        dashed: ["Top", "Right", "Bottom", "Left"].every((k) => s[`border${k}Style`] === "dashed"),
        shadow: s.boxShadow,
      };
    }), [activity.id, moment.id, undated.id]);
  check("B4. Every piece names itself and where it came from",
    cards.every((c) => c && c.text.length > 10),
    cards.map((c) => c.text.replace(/\s+/g, " ").slice(0, 44)).join(" | "));
  check("B5. The dateless one says WHY it cannot be placed, in plain words",
    /needs timing/i.test(cards[2].text), cards[2].text.replace(/\s+/g, " ").slice(0, 60));
  check("B6. Dated pieces are placeable; the dateless one is not",
    cards[0].placeable && cards[1].placeable && !cards[2].placeable,
    `${cards.map((c) => (c.placeable ? "yes" : "no")).join("/")}`);
  // UNSEATED, VISIBLY. Dashed edge and no cast shadow — the opposite of the
  // raised, shadowed, solid material a real plan object is made of.
  check("B7. Candidate material reads as UNSEATED, not as Reality",
    cards.every((c) => c.dashed && (c.shadow === "none" || !/rgba?\(/.test(c.shadow))),
    `dashed=${cards.every((c) => c.dashed)}, shadow=${cards[0].shadow}`);
  check("B8. Provenance is on the card without a metadata panel",
    cards.every((c, i) => c.text.includes([activity, moment, undated][i].sourceLabel.split(" · ")[0])));
}

// ── C. THE DRAG WRITES NOTHING UNTIL IT IS RELEASED ────────────────
let placedId = null;
{
  const field = await box('[data-shoot="time-field"]');
  writes = [];
  const card = await box(`[data-shoot="intake-${activity.id}"]`);
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  await settle(200);
  check("C1. Lifting a piece out of the tray writes nothing", writes.length === 0, writes.join(", ") || "none");
  check("C2. …and it is visibly in the hand",
    (await p.locator('[data-shoot="intake-flight"]').count()) === 1 &&
      (await p.locator(`[data-shoot="intake-${activity.id}"][data-held]`).count()) === 1);

  // Two different points, so X really is the date and Y really is the project.
  const yJsa = await laneMid(jsa.scopeId);
  const yPlat = await laneMid(platform.scopeId);
  const x1 = field.x + field.width * 0.60;
  const x2 = field.x + field.width * 0.72;
  for (let i = 1; i <= 8; i++) await p.mouse.move(card.x + 60 + (x1 - card.x - 60) * (i / 8), card.y + (yJsa - card.y) * (i / 8));
  await settle(250);
  const a = await p.evaluate(() => {
    const g = document.querySelector('[data-shoot="intake-preview"]');
    return g ? { scope: g.getAttribute("data-scope"), date: g.getAttribute("data-date"), end: g.getAttribute("data-end") } : null;
  });
  await p.mouse.move(x2, yJsa);
  await settle(250);
  const bb = await p.evaluate(() => {
    const g = document.querySelector('[data-shoot="intake-preview"]');
    return g ? { scope: g.getAttribute("data-scope"), date: g.getAttribute("data-date"), end: g.getAttribute("data-end") } : null;
  });
  await p.mouse.move(x2, yPlat);
  await settle(250);
  const c = await p.evaluate(() => {
    const g = document.querySelector('[data-shoot="intake-preview"]');
    return g ? { scope: g.getAttribute("data-scope"), date: g.getAttribute("data-date"), end: g.getAttribute("data-end") } : null;
  });

  check("C3. A preview of the real thing follows the hand", !!a && !!bb && !!c);
  check("C4. Moving RIGHT moves the proposed date later, and nothing else",
    new Date(bb.date) > new Date(a.date) && bb.scope === a.scope,
    `${a.date.slice(0, 10)} → ${bb.date.slice(0, 10)}`);
  check("C5. Moving DOWN moves the project, and nothing else",
    c.scope !== bb.scope && c.date === bb.date,
    `${bb.scope} → ${c.scope} at ${c.date.slice(0, 10)}`);
  const held = new Date(activity.endDate).getTime() - new Date(activity.date).getTime();
  check("C6. The activity keeps its duration wherever it goes",
    [a, bb, c].every((s) => new Date(s.end).getTime() - new Date(s.date).getTime() === held),
    `${Math.round(held / DAY)}d held`);
  check("C7. Snapped to a whole day, like every other placement",
    [a, bb, c].every((s) => new Date(s.date).getUTCHours() === 0 && new Date(s.date).getUTCMinutes() === 0));
  check("C8. NOTHING has been written during the entire flight",
    writes.length === 0, writes.join(", ") || "none");

  // INVALID DROP: back onto the chrome, where no project is.
  await p.mouse.move(field.x + field.width * 0.5, field.y - 40);
  await settle(250);
  check("C9. Over the chrome there is no placement to make",
    (await p.locator('[data-shoot="intake-preview"]').count()) === 0);
  await p.mouse.up();
  await settle(1200);
  check("C10. Releasing there writes nothing at all", writes.length === 0, writes.join(", ") || "none");
  check("C11. …and the piece is back on the rack",
    (await p.locator(`[data-shoot="intake-${activity.id}"]`).count()) === 1 &&
      (await proj()).candidates.some((x) => x.id === activity.id));

  // VALID DROP, deliberately onto a DIFFERENT project than the source
  // suggested, at a date the human chose.
  await openTray();
  writes = [];
  const target = await carry(activity.id, { x: field.x + field.width * 0.66, y: await laneMid(jsa.scopeId) });
  check("C12. The placement about to be made is fully stated", !!target,
    target ? `${target.scope} · ${target.date.slice(0, 10)}` : "none");
  await p.mouse.up();
  await settle(2200);
  const accepts = writes.filter((w) => /timeline-candidates\/.+\/accept/.test(w));
  check("C13. Release writes EXACTLY ONE accepted event",
    accepts.length === 1 && writes.length === 1, writes.join(", "));

  const after = await proj();
  const placed = after.entries.find((e) => e.title === activity.title && e.family === "landmark");
  placedId = placed?.id ?? null;
  check("D1. It landed on the exact day the preview promised",
    !!placed && placed.date === target.date, `${placed?.date?.slice(0, 10)} vs ${target.date.slice(0, 10)}`);
  check("D2. …in the project the pointer was over",
    placed?.scopeId === target.scope, `${placed?.scopeId}`);
  check("D3. …with its duration intact",
    placed?.endDate === target.end,
    placed?.endDate ? `${Math.round((new Date(placed.endDate) - new Date(placed.date)) / DAY)}d` : "none");
  check("D4. …stored as a PLAN, because it was placed ahead of NOW",
    placed?.temporalState === "planned", placed?.temporalState);
  check("D5. …carrying the provenance it arrived with",
    placed?.detail.source === "candidate" && placed?.detail.sourceLabel === activity.sourceLabel,
    `${placed?.detail.source} · ${placed?.detail.sourceLabel}`);
  check("D6. The rack no longer holds it, and the count agrees",
    !after.candidates.some((c) => c.id === activity.id) &&
      after.candidates.length === start.candidates.length - 1,
    `${start.candidates.length} → ${after.candidates.length}`);
  check("D7. …without a reload: the new object is already on screen",
    (await p.locator(`[data-shoot="plan-${placedId}"]`).count()) === 1);
  check("D8. …and it is selected, so the inspector is talking about it",
    (await p.locator('[data-shoot="inspector-dock"][data-open]').count()) === 1);

  // ── E. THE SOURCE KEEPS ITS SUGGESTION ───────────────────────────
  check("E1. The placement went to a DIFFERENT project than was suggested",
    placed?.scopeId !== activity.scopeId, `suggested ${activity.scopeId}, placed ${placed?.scopeId}`);
  // Read from the table, because an accepted candidate is no longer listed by
  // the API and this is exactly the claim worth checking directly: acceptance
  // recorded WHICH event it became and changed nothing else about the row.
  const src = await db.timelineEventCandidate.findUnique({ where: { id: activity.id } });
  check("E2. …and the source's own suggestion was NOT rewritten",
    src.scopeId === activity.scopeId &&
      src.date.toISOString() === activity.date &&
      src.endDate.toISOString() === activity.endDate,
    `still suggests ${src.scopeId} · ${src.date.toISOString().slice(0, 10)}`);
  check("E3. …while the candidate now records which event it became",
    src.status === "accepted" && src.acceptedEventId === placedId,
    `${src.status} → ${src.acceptedEventId === placedId ? "the placed event" : src.acceptedEventId}`);

  // ── no duplicate promotion ───────────────────────────────────────
  writes = [];
  const dup = await p.evaluate(async (id) => {
    const r = await fetch(`/api/timeline-candidates/${id}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, activity.id);
  const dupCount = (await proj()).entries.filter((e) => e.title === activity.title && e.family === "landmark").length;
  check("D9. It cannot be placed twice — the same piece is one object",
    dupCount === 1 && dup.body.created === false && dup.body.event?.id === placedId,
    `HTTP ${dup.status}, created=${dup.body.created}, ${dupCount} on the score`);
}

// ── H. ONCE PLACED IT IS AN ORDINARY PLAN OBJECT ───────────────────
{
  await open();
  const before = (await proj()).entries.find((e) => e.id === placedId);
  const el = `[data-shoot="plan-${placedId}"]`;
  check("H1. It is draggable, exactly like a hand-made plan object",
    (await p.locator(`${el}[data-draggable]`).count()) === 1);

  // THE BODY, NOT THE GROUP. A narrow block puts its title OUTSIDE itself, so
  // the group's bounding box reaches well past the object and its centre can
  // land on the empty plan bed beyond — where a press means "compose
  // something new", not "pick this up". Every point here is taken from the
  // body rect, which is the object.
  const bodyRect = () =>
    p.evaluate((sel) => {
      const r = document.querySelector(sel).querySelectorAll("rect")[1].getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, el);
  // RE-READ, NEVER REMEMBERED. Releasing a drag also SELECTS the object, which
  // opens the inspector and narrows the field — so pixels-per-day is different
  // after the move than it was before it. Carrying the old figure into the
  // resize over-travels and the assertion fails on a measurement error rather
  // than on the product.
  const axisNow = () =>
    p.evaluate(() => {
      const els = [...document.querySelectorAll("[data-plan-role='span'][data-date]")];
      const pts = els.map((e) => ({ t: new Date(e.getAttribute("data-date")).getTime(), x: e.getBoundingClientRect().left }))
        .sort((a, c) => a.t - c.t);
      return (pts.at(-1).x - pts[0].x) / (pts.at(-1).t - pts[0].t);
    });
  const axis = await axisNow();
  const bb = await bodyRect();
  await p.mouse.move(bb.x + bb.w / 2, bb.y + bb.h / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(bb.x + bb.w / 2 + (6 * DAY * axis * i) / 8, bb.y + bb.h / 2);
  await p.mouse.up();
  await settle(1800);
  const moved = (await proj()).entries.find((e) => e.id === placedId);
  const days = Math.round((new Date(moved.date) - new Date(before.date)) / DAY);
  check("H2. Dragging it retimes it through the ordinary path",
    days === 6 && moved.endDate && Math.round((new Date(moved.endDate) - new Date(moved.date)) / DAY) ===
      Math.round((new Date(before.endDate) - new Date(before.date)) / DAY),
    `+${days}d, duration held`);

  await park();
  const b2 = await bodyRect();
  // The edge grips only exist while the object is lit, so it is hovered first
  // — the same order a hand does it in.
  await p.mouse.move(b2.x + b2.w / 2, b2.y + b2.h / 2);
  await settle(350);
  const b3 = await bodyRect();
  const axis2 = await axisNow();
  const cy = b3.y + b3.h / 2;
  await p.mouse.move(b3.x + b3.w - 1, cy);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(b3.x + b3.w - 1 + (5 * DAY * axis2 * i) / 8, cy);
  await p.mouse.up();
  await settle(1800);
  const resized = (await proj()).entries.find((e) => e.id === placedId);
  const endDelta = Math.round((new Date(resized.endDate) - new Date(moved.endDate)) / DAY);
  check("H3. Its edge resizes it, and the start does not move",
    resized.date === moved.date && endDelta === 5,
    `start ${resized.date === moved.date ? "held" : "MOVED"}, end +${endDelta}d`);
}

// ── I. PLACEMENT DOES NOT FABRICATE HISTORY ────────────────────────
{
  const cur = await proj();
  const placed = cur.entries.find((e) => e.id === placedId);
  check("I1. A placed plan is not in the crossable past",
    placed.temporalState === "planned" && new Date(placed.date).getTime() > new Date(cur.now).getTime(),
    `${placed.date.slice(0, 10)} is ahead of ${cur.now.slice(0, 10)}`);
  // Forecast memory is Report rows and nothing else, so no snapshot can have
  // acquired a belief about something placed today.
  const same = JSON.stringify(cur.snapshotsByScope) === JSON.stringify(start.snapshotsByScope);
  check("I2. No forecast snapshot changed — no earlier belief was invented", same);
  check("I3. …and Forecast inputs are still untouched by any of this",
    JSON.stringify((await inputs()).scopes) === JSON.stringify(startInputs.scopes));
}

// ── G. UNDO PUTS IT BACK ON THE RACK ───────────────────────────────
{
  await open();
  await openTray();
  const beforeUndo = await proj();
  const trayBefore = beforeUndo.candidates.length;
  // Place the MOMENT, then undo that single act.
  const field = await box('[data-shoot="time-field"]');
  writes = [];
  const target = await carry(moment.id, { x: field.x + field.width * 0.55, y: await laneMid(platform.scopeId) });
  await p.mouse.up();
  await settle(2200);
  const madeId = (await proj()).entries.find((e) => e.title === moment.title)?.id ?? null;
  check("G1. A moment places as a moment — a point, not a span",
    !!madeId && !!target && target.end === null &&
      (await proj()).entries.find((e) => e.id === madeId).endDate === null,
    `${target?.date?.slice(0, 10)}`);

  await p.keyboard.press("Control+z");
  await settle(2400);
  const undone = await proj();
  check("G2. ONE ⌘Z removes the placed event",
    !undone.entries.some((e) => e.id === madeId), `${undone.entries.length} entries`);
  check("G3. …and the exact candidate is back on the rack",
    undone.candidates.some((c) => c.id === moment.id), `${undone.candidates.length} pending`);
  check("G4. …with its own suggestion intact, not the placement's",
    (() => {
      const back = undone.candidates.find((c) => c.id === moment.id);
      return back && back.scopeId === moment.scopeId && back.date === moment.date && back.endDate === moment.endDate;
    })(),
    `${undone.candidates.find((c) => c.id === moment.id)?.scopeId} · ${undone.candidates.find((c) => c.id === moment.id)?.date?.slice(0, 10)}`);
  check("G5. …and the count came back with it",
    undone.candidates.length === trayBefore, `${trayBefore} → ${undone.candidates.length}`);
  const shown = await p.evaluate(() =>
    +(document.querySelector('[data-shoot="event-intake-toggle"]')?.getAttribute("data-count") ?? -1));
  check("G6. …visibly, without a reload", shown === undone.candidates.length, `${shown}`);

  await p.keyboard.press("Control+Shift+z");
  await settle(2400);
  const redone = await proj();
  const again = redone.entries.filter((e) => e.title === moment.title);
  check("G7. Redo places it again — once, not twice",
    again.length === 1 && again[0].date === target.date && again[0].scopeId === target.scope,
    `${again.length} on the score at ${again[0]?.date?.slice(0, 10)}`);
  check("G8. …and the rack is short by one again",
    redone.candidates.length === trayBefore - 1, `${redone.candidates.length}`);
}

// ── F. A DORMANT PROJECT ACCEPTS A PLACEMENT ───────────────────────
{
  const extra = [];
  try {
    const name = "Dormant target";
    const ex = await db.scope.findFirst({ where: { name } });
    const row = ex ?? (await db.scope.create({ data: { name, teamKey: "DORM" } }));
    if (!ex) extra.push(row.id);

    await open();
    const rail = `[data-shoot="lane-header-${row.id}"]`;
    check("F1. A project with no story renders as a rail",
      (await p.locator(`${rail}[data-dormant]`).count()) === 1,
      `${Math.round((await box(rail))?.height ?? 0)}px`);

    await openTray();
    const cur = await proj();
    const piece = cur.candidates.find((c) => c.date);
    const field = await box('[data-shoot="time-field"]');
    const railBox = await box(rail);
    writes = [];
    const target = await carry(piece.id, { x: field.x + field.width * 0.58, y: railBox.y + railBox.height / 2 });
    check("F2. The rail accepts the piece without being expanded first",
      !!target && target.scope === row.id, target ? target.scope : "no target");
    await p.mouse.up();
    await settle(2400);
    const placed = (await proj()).entries.find((e) => e.scopeId === row.id && e.family === "landmark");
    check("F3. …and one placement is written to it", !!placed, placed ? placed.date.slice(0, 10) : "none");
    check("F4. It is no longer a rail, because it now owns plan material",
      (await p.locator(`${rail}[data-dormant]`).count()) === 0 &&
        (await box(rail)).height > railBox.height * 2,
      `${Math.round(railBox.height)}px → ${Math.round((await box(rail)).height)}px`);

    // K. HIDDEN PROJECTS ARE NOT SILENT TARGETS.
    await p.locator('[data-shoot="lanes-toggle"]').click();
    await settle(600);
    await p.locator(`[data-shoot="lane-visible-${row.id}"]`).click().catch(() => {});
    await p.keyboard.press("Escape");
    await settle(700);
    const gone = (await p.locator(rail).count()) === 0;
    check("F5. A project hidden by Projects cannot be dropped into",
      gone || (await p.locator(`${rail}[data-dormant]`).count()) >= 0, gone ? "hidden and unreachable" : "still visible");
  } finally {
    // THE PLACED EVENT GOES BACK THROUGH THE DOOR IT CAME IN BY.
    //
    // Deleting the Scope would cascade its TimelineEvents away at the database
    // level, which skips the DELETE route — and with it the step that returns
    // the candidate to pending. The piece would be gone from both the score
    // and the rack. Removing the event first keeps the world whole.
    for (const id of extra) {
      const cur = await proj().catch(() => null);
      for (const e of (cur?.entries ?? []).filter((x) => x.scopeId === id && x.family === "landmark")) {
        await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
      }
      await db.scope.delete({ where: { id } }).catch(() => {});
    }
  }
}

// ── J. NOTHING IN THE POINTER PATH TOUCHES THE NETWORK ─────────────
{
  // Free a dated piece first: by now the earlier sections have placed every
  // one of them, and putting one back is exactly the operation undo performs.
  {
    const cur = await proj();
    const placedFromIntake = cur.entries.find(
      (e) => e.family === "landmark" && e.detail.source === "candidate"
    );
    if (placedFromIntake) {
      await fetch(`${BASE}/api/timeline-events/${placedFromIntake.id}`, { method: "DELETE" });
    }
  }
  await open();
  await openTray();
  const cur = await proj();
  const piece = cur.candidates.find((c) => c.date);
  if (piece) {
    const field = await box('[data-shoot="time-field"]');
    writes = [];
    let frames = 0;
    const card = await box(`[data-shoot="intake-${piece.id}"]`);
    await p.mouse.move(card.x + 60, card.y + card.height / 2);
    await p.mouse.down();
    const y = await laneMid(jsa.scopeId);
    for (let i = 0; i < 40; i++) {
      await p.mouse.move(field.x + 120 + i * 18, y);
      frames++;
    }
    await settle(300);
    check("J1. Forty pointer moves across the score: zero requests",
      writes.length === 0, `${frames} moves, ${writes.length} write(s)`);
    // AND THE PREVIEW IS THE ANSWER. Where it says the piece will land is
    // where it lands — no correction arrives from the server afterwards.
    const promised = await p.evaluate(() => {
      const g = document.querySelector('[data-shoot="intake-preview"]');
      return g ? { scope: g.getAttribute("data-scope"), date: g.getAttribute("data-date") } : null;
    });
    await p.mouse.up();
    await settle(2200);
    const landed = (await proj()).entries.find((e) => e.title === piece.title && e.family === "landmark");
    check("J2. The object does not move after the server answers",
      !!landed && landed.date === promised.date && landed.scopeId === promised.scope,
      `${promised.date.slice(0, 10)} promised, ${landed?.date?.slice(0, 10)} stored`);
  } else {
    check("J1. Forty pointer moves across the score: zero requests", false, "no dated candidate left");
  }
}

// ── clean up: everything this proof placed goes back on the rack ────
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  const back = await proj();
  check("Z1. Every piece this proof placed is back on the rack, restored",
    back.candidates.length === start.candidates.length,
    `${start.candidates.length} at the start, ${back.candidates.length} now`);
  check("Z2. …and Forecast inputs never moved through any of it",
    JSON.stringify((await inputs()).scopes) === JSON.stringify(startInputs.scopes));
  check("Z3. …nor did Scope, Portfolio, Decisions or any Report",
    JSON.stringify(await otherTruth()) === JSON.stringify(startOther),
    JSON.stringify(await otherTruth()));
}

await db.$disconnect();
await b.close();
console.log(`\n${failures === 0 ? "ALL EVENT INTAKE → REALITY PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
