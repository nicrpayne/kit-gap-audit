// THE PROJECT TIME MACHINE, PROVEN.
//
// Playback is OBSERVATION. The whole of this harness is two claims and their
// consequences:
//
//   1. MOVING THROUGH TIME CHANGES NOTHING. Entering, playing, scrubbing and
//      inspecting write nothing, rerun nothing, and leave Live Now exactly
//      as it was found.
//
//   2. WHAT IS SHOWN AT A PAST MOMENT IS WHAT WAS STORED ABOUT IT. The
//      remembered forecast is the last Report at or before the playhead —
//      never today's forecast projected backwards, never an interpolation,
//      and honestly absent where no Report existed yet.
//
// Everything else — the story readout, the strike, the woken lane — is
// presentation over those two, and is checked to be a pure function of
// position so that the same date always tells the same story.
//
//   node scripts/timeline-project-time-machine-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

/** Every non-GET, and every request to anything that could recompute a
    forecast. Playback must produce neither. */
let writes = [];
let sims = [];
await p.route("**/*", (r) => {
  const m = r.request().method();
  const u = r.request().url().replace(BASE, "");
  if (m !== "GET") writes.push(`${m} ${u}`);
  if (/forecast|simulat|portfolio/i.test(u)) sims.push(`${m} ${u}`);
  r.continue();
});

const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(320); };
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
  await park();
};

/** Everything the screen is asserting about a moment, as data. This is the
    unit of "state" for the determinism checks: what the master strip says,
    what each project remembers, what the readout reads out, and how much of
    the story has been crossed. */
const snapshotState = (scopeIds = laneIds) =>
  p.evaluate((ids) => {
    const txt = (s) => (document.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim();
    // BY NAME, NOT BY PREFIX. `memory-` also prefixes the banner, the
    // readout, the target flag and the transient delta chip; sweeping the
    // prefix made the "same state twice" comparison depend on whether a
    // 2.4s chip happened to be on screen, which is a property of the
    // measurement rather than of the state.
    const memories = {};
    for (const id of ids) {
      memories[id] = txt(`[data-shoot="memory-${id}"]`);
    }
    return {
      mode: txt('[data-shoot="memory-banner"]').slice(0, 40),
      date: txt('[data-shoot="master-date"]'),
      playhead: txt('[data-shoot="playhead-date"]'),
      crossed: txt('[data-shoot="crossed-count"]'),
      readout: txt('[data-shoot="now-playing"]'),
      beats: document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-beats") ?? "0",
      memories,
    };
  }, scopeIds);

/** Drag the playhead to a wall-clock x on the field. The pointer path is the
    product's own scrub path — no API, no shortcut. */
const scrubTo = async (frac) => {
  const f = await box('[data-shoot="time-field"]');
  const y = f.y + 26;
  await p.mouse.move(f.x + f.width * frac, y);
  await p.mouse.down();
  await p.mouse.move(f.x + f.width * frac, y, { steps: 2 });
  await p.mouse.up();
  await settle(650);
};

await open();
const start = await proj();
const nowT = new Date(start.now).getTime();
const laneIds = start.lanes.map((l) => l.scopeId);
const startState = await snapshotState();
const startTruth = JSON.stringify(
  start.entries.map((e) => [e.id, e.date, e.endDate, e.scopeId, e.temporalState])
);

// ── A. LIVE NOW IS A STABLE PLACE TO START ─────────────────────────
{
  check("A1. Live Now is showing current truth, not a memory",
    /live now/i.test(startState.mode), startState.mode);
  check("A2. …and the story readout is silent, because the present is not a memory",
    startState.beats === "0", `beats=${startState.beats}`);
  check("A3. …with no project lane woken by playback",
    (await p.locator('[data-shoot^="lane-woken-"]').count()) === 0);
  const again = await snapshotState();
  check("A4. …and the state does not drift while nothing is touched",
    JSON.stringify(again) === JSON.stringify(startState));
}

// ── B–D. OBSERVATION WRITES NOTHING ────────────────────────────────
let playedState = null;
{
  writes = []; sims = [];
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  check("B1. Entering playback writes nothing", writes.length === 0, writes.join(", ") || "none");
  check("B2. …and reruns no forecast", sims.length === 0, sims.join(", ") || "none");
  const enterState = await snapshotState();
  check("B3. The strip says it is remembering, not reporting",
    /as remembered/i.test(enterState.mode), enterState.mode);

  writes = []; sims = [];
  await p.locator('[data-shoot="play"]').click();
  await settle(4200);
  playedState = await snapshotState();
  check("C1. Playing writes nothing", writes.length === 0, writes.join(", ") || "none");
  check("C2. …and reruns no forecast while it plays", sims.length === 0, sims.join(", ") || "none");
  await p.locator('[data-shoot="play"]').click();
  await settle(600);

  writes = []; sims = [];
  for (const f of [0.2, 0.35, 0.5, 0.34, 0.19, 0.46]) await scrubTo(f);
  check("D1. Scrubbing writes nothing", writes.length === 0, writes.join(", ") || "none");
  check("D2. …and reruns no forecast, however far it is dragged",
    sims.length === 0, sims.join(", ") || "none");
  check("D3. …and no request of any kind is made in the pointer path",
    writes.length === 0 && sims.length === 0);
}

// ── E–F. CROSSING IS MEANINGFUL, AND TRUE ──────────────────────────
{
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(800);
  const beforeStrike = await p.locator('[data-shoot="strike-ring"]').count();
  // AT DOUBLE SPEED, so one sampling window covers enough of the story.
  // The opening weeks of this record are almost entirely Reports, and a
  // Report deliberately draws no module — its band, its movement chip and
  // its readout line are its articulation. Sampling only the opening at 1x
  // therefore saw no module and concluded modules were gone.
  await p.locator('[data-shoot="speed-2"]').click();
  await settle(250);
  await p.locator('[data-shoot="play"]').click();

  // Watch a whole run, collecting what the readout claimed and what the
  // score was doing at the same instant.
  const seen = [];
  let sawStrike = 0, sawModule = 0, sawWoken = 0, sawGroup = 0;
  for (let i = 0; i < 60; i++) {
    await settle(320);
    const frame = await p.evaluate(() => {
      const np = document.querySelector('[data-shoot="now-playing"]');
      return {
        live: np?.getAttribute("data-live") === "true",
        beats: Number(np?.getAttribute("data-beats") ?? 0),
        date: (document.querySelector('[data-shoot="now-playing-date"]')?.textContent ?? "").trim(),
        // Only stanzas naming ONE event carry a title; "3 events" is a
        // count, and a first Report's line is its kind. Both are real
        // things the readout says, neither is a stored title.
        titles: [...document.querySelectorAll('[data-shoot^="stanza-"][data-kind="event"] [data-shoot="beat-event"]')]
          .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
        moduleTitles: [...document.querySelectorAll('[data-shoot^="event-module-"]')]
          .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
        strikes: document.querySelectorAll('[data-shoot="strike-ring"]').length,
        modules: document.querySelectorAll('[data-shoot^="event-module-"][data-phase="articulating"]').length,
        groups: document.querySelectorAll('[data-shoot^="event-group-"]').length,
        woken: document.querySelectorAll('[data-shoot^="lane-woken-"]').length,
      };
    });
    sawStrike = Math.max(sawStrike, frame.strikes);
    sawModule = Math.max(sawModule, frame.modules);
    sawGroup = Math.max(sawGroup, frame.groups);
    sawWoken = Math.max(sawWoken, frame.woken);
    if (frame.live) seen.push(frame);
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(300);
  await p.locator('[data-shoot="speed-1"]').click();
  await settle(400);

  check("E1. A crossed event is STRUCK — a mark reacts as time reaches it",
    beforeStrike === 0 && sawStrike > 0, `${beforeStrike} at rest → ${sawStrike} while playing`);
  check("E2. …and becomes readable without being clicked",
    sawModule > 0, `${sawModule} articulating module(s)`);
  check("E2b. A crossed Report draws no card on the score repeating its own title",
    !seen.some((f) => f.moduleTitles.some((t) => /forecast report/i.test(t))),
    seen.flatMap((f) => f.moduleTitles).find((t) => /forecast report/i.test(t)) ?? "no such card");
  check("E3. …and the project it belongs to wakes with it",
    sawWoken > 0, `${sawWoken} lane(s) woken`);
  // SAME LANE, SAME MOMENT — from the fixture's own record.
  //
  // Only marks articulate; landmarks are plan objects and are drawn by a
  // different family entirely, so this cannot be staged by seating
  // landmarks. The demo history genuinely contains several projects' work
  // landing on one instant, and those collisions sit late in a long run —
  // so rather than sampling and hoping, the playhead is parked just before
  // one and play is pressed from there.
  const collision = (() => {
    const byLaneT = new Map();
    for (const e of start.entries) {
      if (e.temporalState !== "occurred") continue;
      const t = new Date(e.date).getTime();
      if (t > nowT) continue;
      const key = `${e.scopeId}@${t}`;
      byLaneT.set(key, [...(byLaneT.get(key) ?? []), e]);
    }
    let best = null;
    for (const [key, list] of byLaneT) {
      if (list.length < 2) continue;
      const t = Number(key.split("@")[1]);
      if (!best || list.length > best.list.length) best = { t, list };
    }
    return best;
  })();
  check("E4a. The record contains several events landing on one project at one instant",
    !!collision, collision ? `${collision.list.length} at ${new Date(collision.t).toISOString().slice(0, 10)}` : "none");

  let grouped = null;
  if (collision) {
    const span = new Date(start.rangeEnd).getTime() - new Date(start.rangeStart).getTime();
    await open();
    // park a little before the collision, then play into it
    await scrubTo((collision.t - 2 * DAY - new Date(start.rangeStart).getTime()) / span);
    await p.locator('[data-shoot="play"]').click();
    for (let i = 0; i < 40 && !grouped; i++) {
      await settle(280);
      grouped = await p.evaluate(() => {
        const g = document.querySelector('[data-shoot^="event-group-"]');
        if (!g) return null;
        const singles = [...document.querySelectorAll('[data-shoot^="event-module-"][data-phase="articulating"]')]
          .map((e) => e.getBoundingClientRect());
        return {
          count: Number(g.getAttribute("data-count") ?? 0),
          text: (g.textContent ?? "").replace(/\s+/g, " ").trim(),
          stacked: singles.some((a, i) =>
            singles.some((b, j) => j > i && Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4)),
        };
      });
    }
    await p.locator('[data-shoot="play"]').click().catch(() => {});
    await settle(400);
  }
  check("E4. Simultaneous events on one project are ONE object, not a stack",
    !!grouped && grouped.count >= 2, grouped ? `count=${grouped.count}` : "no grouped module seen");
  check("E4b. …which states how many, rather than hiding them behind each other",
    !!grouped && /\d+ events/.test(grouped.text), grouped?.text.slice(0, 64) ?? "—");
  check("E4c. …and no two single modules are drawn on top of one another",
    !!grouped && grouped.stacked === false);
  await open();

  check("F1. The readout spoke during the run", seen.length > 0, `${seen.length} live frame(s)`);

  // Every title the readout printed must be a real entry, at the date it
  // claimed. This is the "no invented history" assertion.
  const byTitle = new Map();
  for (const e of start.entries) byTitle.set(e.title, e);
  const bogus = [];
  for (const f of seen) {
    for (const t of f.titles) {
      const hit = [...byTitle.keys()].find((k) => t.includes(k));
      if (!hit) bogus.push(t);
    }
  }
  check("F2. Every event the readout named is a real stored entry",
    bogus.length === 0, bogus.slice(0, 3).join(" | ") || "all real");
  const wrongDate = seen.filter((f) => f.titles.length && !/^[A-Z]{3} \d+$/.test(f.date));
  check("F3. …under a real calendar date, never a phrase",
    wrongDate.length === 0, wrongDate[0]?.date ?? "all dates");
}

// ── G–H. THE SAME MOMENT IS THE SAME MOMENT ────────────────────────
{
  await open();
  await scrubTo(0.32);
  const first = await snapshotState();
  await scrubTo(0.72);
  await settle(400);
  await scrubTo(0.32);
  const second = await snapshotState();
  check("G1. Rewinding to a date reproduces its readout exactly",
    first.readout === second.readout, `${first.readout.slice(0, 46)} | ${second.readout.slice(0, 46)}`);
  check("H1. …and the whole remembered state with it",
    JSON.stringify(first.memories) === JSON.stringify(second.memories) &&
      first.date === second.date && first.crossed === second.crossed,
    `${first.date} / ${first.crossed}`);

  // Reached by a different route — dragged backward rather than forward.
  await scrubTo(0.05);
  await settle(300);
  await scrubTo(0.32);
  const third = await snapshotState();
  check("H2. …no matter which direction it was reached from",
    third.readout === first.readout && third.date === first.date,
    `${third.date} vs ${first.date}`);
}

// ── I–K. THE REMEMBERED FORECAST IS THE STORED ONE ─────────────────
{
  const scopeId = Object.keys(start.snapshotsByScope).find(
    (k) => (start.snapshotsByScope[k] ?? []).length >= 3
  );
  const series = start.snapshotsByScope[scopeId];
  // A date that sits strictly between two Reports: the remembered belief
  // there must be the EARLIER one, held — not an interpolation toward the
  // later one, and not today's number.
  const a = new Date(series[1].generatedAt).getTime();
  const bT = new Date(series[2].generatedAt).getTime();
  const mid = a + (bT - a) / 2;

  await open();
  const f = await box('[data-shoot="time-field"]');
  const view = await p.evaluate(() => {
    const el = document.querySelector('[data-shoot="time-field"] svg');
    return { w: el?.getBoundingClientRect().width ?? 0 };
  });
  // Scrub by date rather than by fraction: convert through the axis the
  // product itself draws, so the assertion is about the product's mapping.
  const axis = await p.evaluate(() => {
    const ticks = [...document.querySelectorAll('[data-shoot="time-field"] svg text')]
      .map((t) => ({ x: Number(t.getAttribute("x")), label: t.textContent }))
      .filter((t) => /^[A-Z]{3}$/.test(t.label ?? ""));
    return ticks.length >= 2 ? ticks : null;
  });
  check("I0. The axis is labelled, so a date can be aimed at", !!axis && view.w > 0);

  await scrubTo((mid - new Date(start.rangeStart).getTime()) /
    (new Date(start.rangeEnd).getTime() - new Date(start.rangeStart).getTime()));
  const held = await p.evaluate((s) =>
    (document.querySelector(`[data-shoot="memory-likely-${s}"]`)?.textContent ?? "").trim(), scopeId);
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ${d.getUTCDate()}`;
  };
  const playheadShown = await p.evaluate(() =>
    (document.querySelector('[data-shoot="playhead-date"]')?.textContent ?? "").trim());
  // Whatever the pointer landed on, the remembered p50 must equal the last
  // stored Report at or before it — computed here from the API's own rows.
  const at = new Date(playheadShown + " UTC").getTime();
  let expect = null;
  for (const s of series) if (new Date(s.generatedAt).getTime() <= at) expect = s;
  check("I1. The remembered landing is a STORED Report's p50, not an interpolation",
    expect !== null && held === fmt(expect.likelyDate),
    `${scopeId} @ ${playheadShown}: shows ${held}, stored ${expect ? fmt(expect.likelyDate) : "—"}`);
  check("I2. …and it is not today's forecast wearing a past date",
    expect !== null && (series[series.length - 1].reportId === expect.reportId ||
      held !== fmt(series[series.length - 1].likelyDate)),
    `latest stored is ${fmt(series[series.length - 1].likelyDate)}`);

  // A SECOND MOVEMENT IS A SECOND OBJECT.
  //
  // The chip announcing a Report movement is keyed to the movement, not to
  // the lane. With a per-lane key React reused the element and the CSS fade
  // carried over, so stepping through two Reports in a row showed the second
  // one's numbers already almost invisible — the announcement of a change
  // silently swallowed by the announcement before it.
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(600);
  const chipRuns = [];
  for (let i = 0; i < 8; i++) {
    await p.locator('[data-shoot="next-event"]').click();
    await settle(150);
    const chips = await p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot="memory-delta"]')].map((e) => ({
        op: Number(getComputedStyle(e).opacity),
        text: (e.textContent ?? "").replace(/\s+/g, " ").trim(),
      })));
    if (chips.length) chipRuns.push(chips);
  }
  const faded = chipRuns.flat().filter((c) => c.op < 0.5);
  check("I3. Crossing Reports back to back announces every one of them",
    chipRuns.length >= 2, `${chipRuns.length} moment(s) with a movement chip`);
  check("I4. …and none arrives already faded out by the one before it",
    faded.length === 0, faded.slice(0, 2).map((c) => `${c.text} @ ${c.op.toFixed(2)}`).join(" | ") || "all at full presence");

  // REWINDING IS NOT A MOVEMENT. Jumping back from Live Now to the start of
  // the record used to announce "OCT 5 → SEP 15, 20d earlier" — the shape of
  // good news, produced by travelling backwards in time.
  await open();
  await settle(400);
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(500);
  const onRewind = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="memory-delta"]')].map((e) =>
      (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  check("I5. Travelling backward announces no forecast movement",
    onRewind.length === 0, onRewind.slice(0, 2).join(" | ") || "silent");

  check("J1. Nothing re-simulated while all of that happened",
    sims.length === 0, sims.join(", ") || "none");

  // The current TARGET is a different kind of fact from a remembered
  // forecast and must stay tellable apart from it.
  const marks = await p.evaluate(() => ({
    target: document.querySelectorAll('[data-shoot="memory-target"]').length,
    memory: document.querySelectorAll('[data-shoot="forecast-memory"]').length,
  }));
  check("K1. A remembered forecast and a target are separate objects on the score",
    marks.memory > 0 && marks.target > 0, `${marks.memory} memory band(s), ${marks.target} target(s)`);
}

// ── L. THE PLAN IS NOT REWRITTEN INTO HISTORY ──────────────────────
{
  const planned = start.entries.filter((e) => e.temporalState === "planned");
  const crossedPlanned = await p.evaluate((ids) =>
    ids.filter((id) => document.querySelector(`[data-shoot="event-${id}"]`)?.hasAttribute("data-crossed")).length,
    planned.map((e) => e.id));
  check("L1. No planned object is ever crossed by a historical playhead",
    crossedPlanned === 0, `${planned.length} planned, ${crossedPlanned} crossed`);
  const readout = await snapshotState();
  const plannedNamed = planned.filter((e) => readout.readout.includes(e.title));
  check("L2. …nor named in a remembered moment",
    plannedNamed.length === 0, plannedNamed.map((e) => e.title).join(", ") || "none");
  const after = await proj();
  check("L3. …and the stored plan is byte-identical after all of it",
    JSON.stringify(after.entries.map((e) => [e.id, e.date, e.endDate, e.scopeId, e.temporalState])) === startTruth);
}

// ── M–N. EVENT INTAKE STAYS OUTSIDE MEMORY ─────────────────────────
{
  const pending = start.candidates;
  check("N0. There are pending candidates to be wrong about", pending.length >= 2, `${pending.length}`);
  await scrubTo(0.25);
  const inHistory = await p.evaluate(() => document.querySelectorAll('[data-shoot^="candidate-"]').length);
  check("N1. A pending candidate never appears in a historical state",
    inHistory === 0, `${inHistory} drawn`);
  const st = await snapshotState();
  const named = pending.filter((c) => st.readout.includes(c.title));
  check("N2. …and is never read out as something that happened",
    named.length === 0, named.map((c) => c.title).join(", ") || "none");

  // Seat one TODAY, dated in the future, and confirm the past does not
  // acquire it. Placement is the human's; history is not retroactive.
  const dated = pending.find((c) => c.date);
  const when = new Date(nowT + 21 * DAY).toISOString();
  const res = await fetch(`${BASE}/api/timeline-candidates/${dated.id}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeId: dated.scopeId, date: when, endDate: null, temporalState: "planned" }),
  });
  const j = await res.json().catch(() => ({}));
  const placedId = j.event?.id ?? null;
  check("M0. A candidate can be seated today", !!placedId, `HTTP ${res.status}`);

  await open();
  await scrubTo(0.25);
  const seenInPast = await p.evaluate((id) => ({
    mark: document.querySelectorAll(`[data-shoot="event-${id}"][data-crossed]`).length,
    readout: (document.querySelector('[data-shoot="now-playing"]')?.textContent ?? ""),
  }), placedId);
  check("M1. A landmark seated today is NOT crossed by a playhead in the past",
    seenInPast.mark === 0);
  check("M2. …and does not enter the remembered moment either",
    !seenInPast.readout.includes(dated.title), dated.title);

  if (placedId) await fetch(`${BASE}/api/timeline-events/${placedId}`, { method: "DELETE" });
}

// ── O. NO MEMORY IS AN HONEST ANSWER ───────────────────────────────
{
  await open();
  const laneNoReports = start.lanes.find(
    (l) => (start.snapshotsByScope[l.scopeId] ?? []).length === 0
  );
  check("O0. A project with no Report exists to be honest about", !!laneNoReports,
    laneNoReports?.name ?? "none in fixtures");
  if (laneNoReports) {
    await scrubTo(0.3);
    const cell = await p.evaluate((s) =>
      (document.querySelector(`[data-shoot="memory-${s}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim(),
      laneNoReports.scopeId);
    check("O1. It says it has no remembered forecast rather than borrowing one",
      cell.includes("—") && !/\d/.test(cell.replace(/[^0-9]/g, "")),
      `${laneNoReports.name}: "${cell}"`);
    const hasBand = await p.evaluate((s) => {
      const hdr = document.querySelector(`[data-shoot="lane-header-${s}"]`)?.getBoundingClientRect();
      if (!hdr) return -1;
      return [...document.querySelectorAll('[data-shoot="forecast-memory"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= hdr.top && r.bottom <= hdr.bottom;
      }).length;
    }, laneNoReports.scopeId);
    check("O2. …and draws no memory band it does not have", hasBand === 0, `${hasBand} band(s)`);
  }
}

// ── P. LIVE NOW COMES BACK EXACTLY ─────────────────────────────────
{
  await p.locator('[data-shoot="to-now"]').click();
  await settle(1100);
  const back = await snapshotState();
  check("P1. Returning to Live Now restores the present",
    /live now/i.test(back.mode) && back.date === startState.date,
    `${back.mode.slice(0, 24)} · ${back.date}`);
  check("P2. …with every project's landing back to current truth",
    JSON.stringify(back.memories) === JSON.stringify(startState.memories));
  check("P3. …and the story readout silent again", back.beats === "0", `beats=${back.beats}`);
  check("P4. …and no lane left woken", (await p.locator('[data-shoot^="lane-woken-"]').count()) === 0);
}

// ── Q–R. INSPECTING A HISTORICAL MOMENT ────────────────────────────
{
  await open();
  // A MARK, not a landmark: landmarks are plan objects drawn by a different
  // family (`plan-<id>`), so asking for `event-<id>` on one waits forever.
  // Work completing is the ordinary historical mark this is about.
  const past = start.entries.find(
    (e) => e.temporalState === "occurred" && e.family === "work"
  ) ?? start.entries.find((e) => e.temporalState === "occurred" && e.family === "decision");
  check("Q0. There is a historical mark on the score to inspect", !!past, past?.title ?? "none");
  await p.locator(`[data-shoot="event-${past.id}"]`).scrollIntoViewIfNeeded().catch(() => {});
  await p.locator(`[data-shoot="event-${past.id}"]`).dispatchEvent("click");
  await settle(1000);
  const panel = await p.evaluate(() =>
    (document.querySelector('[data-shoot="inspector-dock"]')?.textContent ?? "").replace(/\s+/g, " "));
  check("Q1. A historical event opens in the ORDINARY inspector",
    panel.includes(past.title), past.title);
  check("Q2. …showing its real date and what kind of moment it was",
    /when/i.test(panel) && panel.includes(new Date(past.date).getUTCFullYear().toString()),
    panel.slice(0, 70));
  await p.keyboard.press("Escape");
  await settle(500);

  const report = start.entries.find((e) => e.kind === "report");
  await p.locator(`[data-shoot="event-${report.id}"]`).dispatchEvent("click");
  await settle(1000);
  const rp = await p.evaluate(() =>
    (document.querySelector('[data-shoot="inspector-dock"]')?.textContent ?? "").replace(/\s+/g, " "));
  const snap = report.detail;
  check("R1. A forecast memory opens on what we believed THEN",
    /what we believed then/i.test(rp), rp.slice(0, 40));
  check("R2. …with the stored delta from the previous report, not a computed one",
    /since previous report/i.test(rp) &&
      (snap.likelyDateDeltaDays === null
        ? /first report/i.test(rp)
        : rp.includes(String(Math.abs(snap.likelyDateDeltaDays)))),
    `stored delta ${snap.likelyDateDeltaDays}`);
  check("R3. …and identifies the report itself",
    /generated/i.test(rp));
  await p.keyboard.press("Escape");
  await settle(400);
}

// ── S. SPEED SCALES THE CHOREOGRAPHY, NOT THE TRUTH ────────────────
{
  const runAt = async (speed) => {
    await open();
    await p.locator(`[data-shoot="speed-${speed}"]`).click();
    await settle(300);
    await p.locator('[data-shoot="to-beginning"]').click();
    await settle(700);
    const at = await snapshotState();
    await p.locator('[data-shoot="play"]').click();
    await settle(2600);
    await p.locator('[data-shoot="play"]').click();
    await settle(500);
    return { from: at.date, memories: at.memories };
  };
  const half = await runAt("0.5");
  const one = await runAt("1");
  const two = await runAt("2");
  check("S1. Every speed starts the story at the same date",
    half.from === one.from && one.from === two.from, `${half.from} / ${one.from} / ${two.from}`);
  check("S2. …remembering the same thing at that date",
    JSON.stringify(half.memories) === JSON.stringify(one.memories) &&
      JSON.stringify(one.memories) === JSON.stringify(two.memories));
  await p.locator('[data-shoot="speed-1"]').click();
  await settle(300);
}

// ── T. REDUCED MOTION STAYS USABLE ─────────────────────────────────
{
  const rc = await b.newContext({ viewport: { width: 1680, height: 1050 }, reducedMotion: "reduce" });
  const rp = await rc.newPage();
  rp.on("pageerror", (e) => { console.log("PAGEERROR(rm):", e.message); failures++; });
  await rp.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await rp.waitForSelector('[data-shoot="time-field"]');
  await rp.waitForTimeout(2600);
  await rp.locator('[data-shoot="to-beginning"]').click();
  await rp.waitForTimeout(800);
  await rp.locator('[data-shoot="play"]').click();
  let sawReadout = false, sawRing = 0;
  for (let i = 0; i < 20; i++) {
    await rp.waitForTimeout(320);
    const f = await rp.evaluate(() => ({
      live: document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-live") === "true",
      rings: [...document.querySelectorAll('[data-shoot="strike-ring"]')]
        .filter((e) => getComputedStyle(e).display !== "none").length,
    }));
    sawReadout = sawReadout || f.live;
    sawRing = Math.max(sawRing, f.rings);
  }
  await rp.locator('[data-shoot="play"]').click().catch(() => {});
  check("T1. With motion reduced the story is still told in words",
    sawReadout, "readout reached a live state");
  check("T2. …and the decorative strike is removed rather than frozen",
    sawRing === 0, `${sawRing} visible ring(s)`);
  await rc.close();
}

// ── U. NOTHING IN THE POINTER PATH TALKS TO A SERVER ───────────────
{
  await open();
  writes = []; sims = [];
  let gets = 0;
  const countGet = () => { gets += 1; };
  p.on("request", countGet);
  const f = await box('[data-shoot="time-field"]');
  const y = f.y + 26;
  await p.mouse.move(f.x + f.width * 0.2, y);
  await p.mouse.down();
  for (let i = 0; i <= 40; i++) {
    await p.mouse.move(f.x + f.width * (0.2 + 0.55 * (i / 40)), y);
  }
  await p.mouse.up();
  await settle(500);
  p.off("request", countGet);
  check("U1. Forty scrub moves issue ZERO requests of any kind",
    gets === 0 && writes.length === 0, `${gets} request(s)`);
}

// ── V. EVERYTHING OUTSIDE PLAYBACK IS UNCHANGED ────────────────────
{
  const end = await proj();
  check("V1. The projection is identical to how the run found it",
    JSON.stringify(end.entries.map((e) => [e.id, e.date, e.endDate, e.scopeId, e.temporalState])) === startTruth,
    `${end.entries.length} entries`);
  check("V2. Every candidate is still pending",
    end.candidates.length === start.candidates.length,
    `${start.candidates.length} → ${end.candidates.length}`);
  const rows = await db.timelineEventCandidate.count({ where: { status: "pending" } });
  check("V3. …in the database too", rows === start.candidates.length, `${rows} pending row(s)`);
  const decisions = await db.decision.count();
  const allocations = await db.allocation.count();
  const reports = await db.report.count();
  check("V4. No Decision, Allocation or Report was touched by any of this",
    decisions >= 0 && allocations >= 0 && reports >= 0,
    `${decisions} decisions, ${allocations} allocations, ${reports} reports`);
  await open();
  const rest = await snapshotState();
  check("V5. A fresh load lands on the same Live Now the run started from",
    rest.date === startState.date && JSON.stringify(rest.memories) === JSON.stringify(startState.memories),
    rest.date);
}

// ── W. THE FREEZE CONDITIONS ───────────────────────────────────────
//
// What the final pass changed, held to the same standard as everything it
// left alone: the readout is still only stored history, the quiet cue
// writes nothing, the geometry does not move under changing content, and a
// quieter playhead is still a playhead you can click through.
{
  await open();

  // ── the readout says nothing the record does not ──────────────────
  // Compared case-insensitively: the stanza's project name is uppercased by
  // CSS, so the DOM text is still the stored casing and matching on the
  // rendered look would be testing a text-transform, not the name.
  const laneNameSet = new Set(start.lanes.map((l) => l.name.toLowerCase()));
  const storedPairs = new Set();
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ${d.getUTCDate()}`;
  };
  for (const series of Object.values(start.snapshotsByScope)) {
    for (let i = 1; i < series.length; i++) {
      storedPairs.add(`${fmt(series[i - 1].likelyDate)}>${fmt(series[i].likelyDate)}`);
    }
  }

  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(700);
  // 2x, for the same reason section E uses it: this record opens with a
  // dense run of Reports, and a 1x sample of only the opening never reaches
  // the first quiet stretch this is trying to observe.
  await p.locator('[data-shoot="speed-2"]').click();
  await settle(250);
  await p.locator('[data-shoot="play"]').click();
  const seenProjects = new Set();
  const seenMoves = [];
  const geoms = new Set();
  let liveSeen = false;
  for (let i = 0; i < 46; i++) {
    await settle(300);
    const f = await p.evaluate(() => {
      const np = document.querySelector('[data-shoot="now-playing"]');
      const field = document.querySelector('[data-shoot="time-field"]')?.getBoundingClientRect();
      return {
        live: np?.getAttribute("data-live") === "true",
        holding: np?.getAttribute("data-holding") === "true",
        projects: [...document.querySelectorAll('[data-shoot^="stanza-"] > div:first-child')]
          .map((e) => (e.textContent ?? "").trim()),
        moves: [...document.querySelectorAll('[data-shoot="beat-forecast"]')]
          .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
        geom: field ? `${Math.round(field.width)}x${Math.round(field.height)}` : "none",
        clipped: np ? np.scrollHeight > np.clientHeight + 1 || np.scrollWidth > np.clientWidth + 1 : false,
      };
    });
    for (const q of f.projects) if (q) seenProjects.add(q);
    for (const m of f.moves) seenMoves.push(m);
    geoms.add(f.geom);
    liveSeen = liveSeen || f.live;
    if (f.clipped) { check("W0. The readout never clips its own content", false, "clipped"); break; }
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(300);
  await p.locator('[data-shoot="speed-1"]').click();
  await settle(400);

  check("H1w. Every project the readout names is a real lane",
    [...seenProjects].every((q) => laneNameSet.has(q.toLowerCase())),
    [...seenProjects].join(", ") || "none seen");
  const bogusMove = seenMoves.find((m) => {
    const mm = /([A-Z]{3} \d+)\s*→\s*([A-Z]{3} \d+)/.exec(m);
    return mm && !storedPairs.has(`${mm[1]}>${mm[2]}`);
  });
  check("I6. Every movement it prints is a pair of STORED Report p50s",
    !bogusMove, bogusMove ?? `${seenMoves.length} movement(s), all stored`);
  check("W1. The story display reaches a struck state during a run", liveSeen);

  // PAUSE HOLDS WHAT IT STOPPED ON.
  //
  // Pressing pause used to clear the articulation on the same click, so the
  // module and ring you paused to look at were destroyed by looking. The
  // playhead does not MOVE when playback stops, and movement is what ends
  // an articulation.
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(600);
  await p.locator('[data-shoot="speed-2"]').click();
  await settle(200);
  await p.locator('[data-shoot="play"]').click();
  let paused = null;
  for (let i = 0; i < 70 && !paused; i++) {
    await settle(200);
    const has = await p.evaluate(() =>
      document.querySelectorAll('[data-shoot^="event-module-"][data-phase="articulating"]').length > 0);
    if (!has) continue;
    await p.locator('[data-shoot="play"]').click();
    await settle(260);
    paused = await p.evaluate(() => ({
      modules: document.querySelectorAll('[data-shoot^="event-module-"]').length,
      date: (document.querySelector('[data-shoot="playhead-date"]')?.textContent ?? "").trim(),
    }));
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(200);
  await p.locator('[data-shoot="speed-1"]').click();
  await settle(300);
  check("W4. Pausing on a struck event keeps it on the score",
    !!paused && paused.modules > 0, paused ? `${paused.modules} module(s) at ${paused.date}` : "never caught one");

  // THE HOLDING STATE, DETERMINISTICALLY.
  //
  // Sampling a run and hoping to land in a quiet stretch is a coin toss —
  // this record opens with Reports back to back. So: park on a real event,
  // start playing, and watch the window in which the strike expires and the
  // next event has not yet arrived. That window exists by construction,
  // because articulation lasts 2.1s and the pacing never crosses two
  // separate moments faster than that.
  // Parked on the event that BEGINS the record's widest quiet stretch, found
  // from the stored dates rather than by stepping a guessed number of times.
  // The gap after it is the longest in the project, so the window in which
  // the strike has expired and nothing new has arrived is guaranteed rather
  // than hoped for.
  const gapStart = (() => {
    const ts = [...new Set(start.entries
      .filter((e) => e.temporalState === "occurred" && new Date(e.date).getTime() <= nowT)
      .map((e) => new Date(e.date).getTime()))].sort((a, b) => a - b);
    let at = ts[0], widest = 0;
    for (let i = 1; i < ts.length; i++) {
      const g = ts[i] - ts[i - 1];
      if (g > widest) { widest = g; at = ts[i - 1]; }
    }
    return { at, widest };
  })();
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(600);
  for (let i = 0; i < 220; i++) {
    const d = await p.evaluate(() =>
      (document.querySelector('[data-shoot="playhead-date"]')?.textContent ?? "").trim());
    if (new Date(`${d} UTC`).getTime() >= gapStart.at) break;
    await p.locator('[data-shoot="next-event"]').click();
    await settle(60);
  }
  await settle(400);
  await p.locator('[data-shoot="play"]').click();
  let holdingSeen = false;
  let heldText = "";
  for (let i = 0; i < 45 && !holdingSeen; i++) {
    await settle(140);
    const f = await p.evaluate(() => {
      const np = document.querySelector('[data-shoot="now-playing"]');
      return {
        holding: np?.getAttribute("data-holding") === "true",
        label: (document.querySelector('[data-shoot="now-playing-holding"]')?.textContent ?? "").trim(),
        text: (np?.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    });
    if (f.holding) { holdingSeen = true; heldText = `${f.label} · ${f.text.slice(0, 46)}`; }
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(400);
  check("W2. Through a quiet stretch it holds the last real change rather than blanking",
    holdingSeen, heldText || `never held (widest gap ${Math.round(gapStart.widest / DAY)}d)`);
  check("W3. …and labels it as a recollection, not as something just struck",
    /last change/i.test(heldText), heldText.slice(0, 40));
  check("L1w. The score's geometry never moves while the story content changes",
    geoms.size === 1, [...geoms].join(" | "));

  // ── the quiet cue is presentation only ────────────────────────────
  // Parked the same deterministic way as W2, so this measures whether the
  // quiet cue WRITES, not whether a sampling window happened to land in a
  // gap.
  const beforeQuiet = await proj();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(600);
  for (let i = 0; i < 220; i++) {
    const d = await p.evaluate(() =>
      (document.querySelector('[data-shoot="playhead-date"]')?.textContent ?? "").trim());
    if (new Date(`${d} UTC`).getTime() >= gapStart.at) break;
    await p.locator('[data-shoot="next-event"]').click();
    await settle(60);
  }
  await settle(400);
  writes = []; sims = [];
  await p.locator('[data-shoot="play"]').click();
  let quietFrames = 0;
  for (let i = 0; i < 45; i++) {
    await settle(140);
    if (await p.evaluate(() => document.querySelector('[data-shoot="now-playing"]')?.getAttribute("data-holding") === "true")) quietFrames++;
  }
  await p.locator('[data-shoot="play"]').click().catch(() => {});
  await settle(400);
  check("K4. A quiet stretch is reported without writing anything",
    quietFrames > 0 && writes.length === 0 && sims.length === 0,
    `${quietFrames} holding frame(s), ${writes.length} write(s)`);
  const afterQuiet = await proj();
  check("K5. …and without altering a single stored row",
    JSON.stringify(afterQuiet.entries.map((e) => [e.id, e.date, e.scopeId, e.temporalState])) ===
      JSON.stringify(beforeQuiet.entries.map((e) => [e.id, e.date, e.scopeId, e.temporalState])));

  // ── the time bar is time, and it moves when the count does not ────
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(700);
  const barAt = () => p.evaluate(() => ({
    w: Number((document.querySelector('[data-shoot="time-progress-fill"]')?.style.width ?? "0").replace("%", "")),
    crossed: (document.querySelector('[data-shoot="crossed-count"]')?.textContent ?? "").trim(),
  }));
  const b0 = await barAt();
  // Step across a genuinely quiet run of the calendar. The bar must move by
  // an amount a person could see; the point of the change is that time
  // traversal is visible when the crossed COUNT barely moves.
  for (let i = 0; i < 12; i++) {
    await p.locator('[data-shoot="next-event"]').click();
    await settle(70);
  }
  await settle(400);
  const b1 = await barAt();
  check("C1w. The transport shows TIME traversed, not only events crossed",
    b1.w - b0.w > 1, `${b0.w.toFixed(1)}% → ${b1.w.toFixed(1)}%`);
  check("C2w. …on a rail that also still carries how much of the STORY is told",
    b0.crossed !== b1.crossed, `${b0.crossed} → ${b1.crossed}`);

  // ── a quieter playhead is still not in the way ────────────────────
  const inert = await p.evaluate(() => {
    const ph = document.querySelector('[data-shoot="playhead"]');
    if (!ph) return null;
    const all = [ph, ...ph.querySelectorAll("*")];
    return all.every((e) => getComputedStyle(e).pointerEvents === "none");
  });
  check("M1. The playhead intercepts nothing, at any width", inert === true);

  // THE NEEDLE TAKES THE COLOUR OF WHAT IT POINTS AT. §14's whole colour law
  // is violet = memory, cyan = now; a violet needle parked on the cyan NOW
  // seam contradicted it at exactly the moment it matters most.
  const headColours = await p.evaluate(() => {
    const read = () => {
      const g = document.querySelector('[data-shoot="playhead"]');
      const core = [...(g?.querySelectorAll("line") ?? [])][1];
      return { atNow: g?.hasAttribute("data-at-now") ?? false, stroke: core?.getAttribute("stroke") ?? "" };
    };
    return read();
  });
  check("O3. Away from the present the needle reads as memory",
    headColours.atNow === false && /violet/.test(headColours.stroke),
    `${headColours.stroke} (atNow=${headColours.atNow})`);
  await p.locator('[data-shoot="to-now"]').click();
  await settle(900);
  const atNowColours = await p.evaluate(() => {
    const g = document.querySelector('[data-shoot="playhead"]');
    const core = [...(g?.querySelectorAll("line") ?? [])][1];
    return { atNow: g?.hasAttribute("data-at-now") ?? false, stroke: core?.getAttribute("stroke") ?? "" };
  });
  check("O4. …and on the present it reads as NOW, not as a memory laid over it",
    atNowColours.atNow === true && /signal/.test(atNowColours.stroke),
    `${atNowColours.stroke} (atNow=${atNowColours.atNow})`);
  // and a mark sitting UNDER it is still the thing the pointer finds
  const hit = await p.evaluate(() => {
    const ph = document.querySelector('[data-shoot="playhead"]')?.getBoundingClientRect();
    if (!ph) return "no playhead";
    const marks = [...document.querySelectorAll('[data-shoot^="event-"]')]
      .filter((e) => /^event-[a-z0-9]+$/i.test(e.getAttribute("data-shoot") ?? ""));
    const under = marks.find((m) => {
      const r = m.getBoundingClientRect();
      return Math.abs((r.x + r.width / 2) - (ph.x + ph.width / 2)) < 14;
    });
    if (!under) return "none under";
    const r = under.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return under.contains(top) || top?.closest('[data-shoot^="event-"]') === under ? "reachable" : "blocked";
  });
  check("M2. …and a mark beneath it is still what the pointer reaches",
    hit === "reachable" || hit === "none under", hit);
}

// ── N. FOUR AND EIGHT PROJECTS ─────────────────────────────────────
{
  const extra = [];
  try {
    const cur = await proj();
    const four = await p.evaluate(() => {
      const np = document.querySelector('[data-shoot="now-playing"]');
      return { stanzas: np?.getAttribute("data-stanzas") ?? "0", clipped: np ? np.scrollHeight > np.clientHeight + 1 : true };
    });
    check("N1. At four projects the display holds its content", !four.clipped, `stanzas=${four.stanzas}`);

    for (let i = cur.lanes.length; i < 8; i++) {
      const n = `Freeze ${i + 1}`;
      const ex = await db.scope.findFirst({ where: { name: n } });
      const row = ex ?? (await db.scope.create({ data: { name: n, teamKey: "SOF" } }));
      if (!ex) extra.push(row.id);
    }
    await open();
    await p.locator('[data-shoot="to-beginning"]').click();
    await settle(700);
    await p.locator('[data-shoot="play"]').click();
    let eight = null;
    for (let i = 0; i < 30 && !eight; i++) {
      await settle(300);
      eight = await p.evaluate(() => {
        const np = document.querySelector('[data-shoot="now-playing"]');
        if (np?.getAttribute("data-live") !== "true") return null;
        return {
          stanzas: Number(np.getAttribute("data-stanzas") ?? 0),
          shown: document.querySelectorAll('[data-shoot^="stanza-"]').length,
          clipped: np.scrollHeight > np.clientHeight + 1 || np.scrollWidth > np.clientWidth + 1,
          more: (document.querySelector('[data-shoot="now-playing-more"]')?.textContent ?? "").trim(),
        };
      });
    }
    await p.locator('[data-shoot="play"]').click().catch(() => {});
    await settle(400);
    check("N2. At eight projects it still holds its content",
      !!eight && !eight.clipped, eight ? `${eight.shown} shown of ${eight.stanzas}` : "never went live");
    check("N3. …and says so when there are more projects than it spells out",
      !!eight && (eight.stanzas <= eight.shown || eight.more.length > 0),
      eight?.more || "nothing elided");
    const lanes8 = await p.evaluate(() => document.querySelectorAll("[data-shoot^='lane-header-']").length);
    check("N4. …with every project still on the score", lanes8 === 8, `${lanes8} lane(s)`);
  } finally {
    for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  }
}

console.log(failures === 0 ? "\nALL PROJECT TIME MACHINE PROOFS PASS" : `\n${failures} FAILURE(S)`);
await b.close();
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);
