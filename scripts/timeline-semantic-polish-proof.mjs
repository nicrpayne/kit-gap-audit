// SEMANTIC POLISH, PROVEN.
//
// This pass removed the last places where the surface asked to be decoded.
// Everything in it is presentation, and presentation is exactly what rots
// silently — so each claim is a measurement rather than an adjective:
//
//   the history cluster is ONE object, not a glyph with a number parked
//   beside it; a plan object's geometry is untouched by how it is painted;
//   the forecast/target arithmetic is identical whether it is being shown or
//   not; a project with no story gets a rail instead of a room, and opening
//   it gives the room back; and the master display refuses to shrink its own
//   type past the point of being readable.
//
//   node scripts/timeline-semantic-polish-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const settle = (ms = 800) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(350); };
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
  await park();
};
/** Every plan object's drawn geometry AND the dates it claims. The pair is
    the point: presentation may change the first only if it changes neither
    the second nor the mapping between them. */
const planGeometry = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')]
      .map((e) => {
        const r = e.querySelectorAll("rect")[e.getAttribute("data-plan-role") === "span" ? 1 : 0].getBoundingClientRect();
        return {
          id: e.getAttribute("data-shoot"),
          x: +r.left.toFixed(2),
          w: +r.width.toFixed(2),
          date: e.getAttribute("data-date"),
          end: e.getAttribute("data-end"),
        };
      })
      .sort((a, c) => a.id.localeCompare(c.id)));
/** The projection, reduced to the facts presentation must never touch. */
const truth = (j) =>
  JSON.stringify({
    entries: j.entries.map((e) => [e.id, e.date, e.endDate, e.scopeId, e.temporalState]),
    lanes: j.lanes.map((l) => l.scopeId),
    snaps: Object.entries(j.snapshotsByScope).map(([k, v]) => [k, v.map((s) => [s.reportId, s.likelyDate, s.targetDate])]),
  });

await open();
const start = await proj();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");

// ── A. THE CLUSTER IS ONE OBJECT ───────────────────────────────────
{
  const cl = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="history-cluster-"]')].map((e) => {
      const cap = e.querySelector('[data-shoot="cluster-capsule"]');
      const digits = [...e.querySelectorAll("text")];
      const outside = digits.filter((t) => !cap.contains(t)).length;
      const capBox = cap.getBoundingClientRect();
      const inside = digits.every((t) => {
        const r = t.getBoundingClientRect();
        return r.left >= capBox.left - 1 && r.right <= capBox.right + 1;
      });
      return {
        count: +e.getAttribute("data-count"),
        capsules: e.querySelectorAll('[data-shoot="cluster-capsule"]').length,
        texts: digits.length,
        outside,
        inside,
        w: capBox.width,
        cx: capBox.left + capBox.width / 2,
        // Two capsules only read as one number if they are side by side on
        // the SAME score line. Grouping by lane is the whole point — the
        // first version of this compared a Platform cluster against a JSA
        // one and measured a negative gap between two rows.
        lane: Math.round(capBox.top),
      };
    }));
  check("A1. A dense run of history exists to draw", cl.length > 0, `${cl.length} cluster(s): ${cl.map((c) => c.count).join(", ")}`);
  check("A2. Each cluster is ONE capsule carrying its own count",
    cl.every((c) => c.capsules === 1 && c.texts === 1 && c.outside === 0 && c.inside),
    cl.map((c) => `${c.texts} label/${c.outside} loose`).join(" · "));

  // NO AMBIGUOUS "4 38". Two capsules closer together than one capsule is
  // wide put their numbers side by side and the pair reads as one value.
  const gaps = [];
  for (const lane of new Set(cl.map((c) => c.lane))) {
    const row = cl.filter((c) => c.lane === lane).sort((a, c) => a.cx - c.cx);
    for (let i = 1; i < row.length; i++) {
      gaps.push(row[i].cx - row[i - 1].cx - (row[i].w + row[i - 1].w) / 2);
    }
  }
  check("A3. No two counts on one lane sit close enough to read as one number",
    gaps.every((g) => g > 20),
    gaps.length ? gaps.map((g) => `${Math.round(g)}px`).join(", ") : "one cluster per lane");

  check("A4. …and the cluster stays understated at rest",
    await p.evaluate(() => {
      const r = document.querySelector('[data-shoot="cluster-capsule"] rect');
      return parseFloat(r.getAttribute("opacity")) <= 0.8;
    }));
}

// ── B. EVERY CONSTITUENT REMAINS INTERACTABLE ──────────────────────
{
  const cl = await p.evaluate(() => ({
    summed: [...document.querySelectorAll('[data-shoot^="history-cluster-"]')]
      .reduce((n, e) => n + +e.getAttribute("data-count"), 0),
    muted: [...document.querySelectorAll("[data-muted]")].map((e) => e.getAttribute("data-shoot")),
  }));
  check("B1. The count is exactly what stood down for it",
    cl.summed === cl.muted.length, `${cl.summed} claimed, ${cl.muted.length} muted`);

  // Every one of them. Not a sample: a single unreachable event is a lie
  // about the whole mechanism.
  const reach = await p.evaluate((sels) =>
    sels.map((s) => {
      const el = document.querySelector(`[data-shoot="${s}"]`);
      if (!el) return "missing";
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        ?.closest("[data-shoot]")?.getAttribute("data-shoot") ?? "none";
    }), cl.muted);
  // WHAT IS ACTUALLY ACHIEVABLE, STATED EXACTLY.
  //
  // Forty-seven events inside sixty pixels cannot each own a distinct pixel
  // column, so "every mark owns its own centre" is only true down to the
  // limit of the axis itself. Two events drawn at the SAME pixel are one
  // pixel; whichever answers is the honest answer, and there is no geometry
  // that fixes it short of zooming in — which the surface already offers.
  //
  // So the claim is: pointing at a clustered mark reaches THAT mark, or the
  // one standing on the same pixel. Anything looser would hide the real
  // failure this caught — a 2px minimum grab cell that reached past the
  // midpoint and handed a mark's centre to a neighbour a full pixel away.
  const xs = await p.evaluate((sels) => {
    const at = {};
    for (const s of sels) {
      const el = document.querySelector(`[data-shoot="${s}"]`);
      if (el) at[s] = el.getBoundingClientRect();
    }
    return Object.fromEntries(Object.entries(at).map(([k, r]) => [k, r.left + r.width / 2]));
  }, cl.muted);
  const own = reach.filter((r, i) => {
    const want = cl.muted[i];
    if (r === want) return true;
    // A co-located twin: same lane, within a pixel of the same x.
    return r in xs && Math.abs(xs[r] - xs[want]) <= 1.2;
  }).length;
  check("B2. EVERY clustered event is reached by pointing at it, to the limit of the axis",
    own === cl.muted.length, `${own}/${cl.muted.length}`);

  const one = cl.muted[0];
  const bb = await box(`[data-shoot="${one}"]`);
  await p.mouse.move(bb.x + bb.width / 2 - 50, bb.y - 45);
  await settle(180);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await settle(700);
  const woke = await p.evaluate((s) => ({
    muted: document.querySelector(`[data-shoot="${s}"]`).hasAttribute("data-muted"),
    modules: document.querySelectorAll('[data-shoot^="event-module-"]').length,
  }), one);
  check("B3. Pointing into a run wakes the event and it explains itself",
    !woke.muted && woke.modules > 0, `muted=${woke.muted}, ${woke.modules} module(s)`);
  await park();
}

// ── C. CLUSTERING CHANGES NO DATA ──────────────────────────────────
check("C1. The projection is untouched by how history is drawn",
  truth(await proj()) === truth(start), `${start.entries.length} entries`);

// ── D–E. PLAN OBJECT GEOMETRY SURVIVES ITS OWN PAINT ───────────────
const restGeom = await planGeometry();
{
  check("D1. Plan objects are drawn to measure", restGeom.length > 0, `${restGeom.length} objects`);
  // px-per-day, from the objects themselves. If material changes had moved
  // any edge, this would no longer be one number.
  const spans = restGeom.filter((o) => o.end);
  const perDay = spans.map((o) => o.w / ((new Date(o.end) - new Date(o.date)) / DAY));
  check("D2. Width is still exactly duration — one px/day across the score",
    Math.max(...perDay) - Math.min(...perDay) < 0.35,
    `${perDay.map((v) => v.toFixed(2)).join(", ")}`);

  const target = spans[0];
  const bb = await box(`[data-shoot="${target.id}"]`);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await settle(600);
  const hovered = await planGeometry();
  await p.locator(`[data-shoot="${target.id}"]`).dispatchEvent("click");
  await settle(900);
  const held = await planGeometry();
  await p.keyboard.press("Escape");
  await settle(600);
  await park();

  const dates = (g) => JSON.stringify(g.map((o) => [o.id, o.date, o.end]));
  check("E1. Hovering an object changes no date anywhere on the score",
    dates(hovered) === dates(restGeom));
  check("E2. Holding one changes no date either",
    dates(held) === dates(restGeom));
  const xOf = (g, id) => g.find((o) => o.id === id);
  check("E3. Waking an object's material does not move it by a pixel",
    xOf(hovered, target.id).x === xOf(restGeom, target.id).x &&
      xOf(hovered, target.id).w === xOf(restGeom, target.id).w,
    `${xOf(restGeom, target.id).x} → ${xOf(hovered, target.id).x}`);

  // HOLDING ONE OPENS THE PANEL, AND THE PANEL NARROWS THE FIELD — so the
  // object DOES move, and it must: it is pinned to a date on an axis that
  // just got shorter. The invariant is not that the pixel stays put, it is
  // that the object stays on its date and the axis stays uniform. A drift
  // bug would show up here as one object out of step with the others.
  const perDayOf = (g) =>
    g.filter((o) => o.end).map((o) => o.w / ((new Date(o.end) - new Date(o.date)) / DAY));
  const held1 = perDayOf(held);
  check("E4. Holding one rescales the whole axis together, drifting nothing",
    Math.max(...held1) - Math.min(...held1) < 0.35 &&
      xOf(held, target.id).date === xOf(restGeom, target.id).date,
    `${held1.map((v) => v.toFixed(2)).join(", ")} px/day`);
}

// ── F. FORECAST/TARGET DISCLOSURE IS DISCLOSURE ONLY ───────────────
{
  const read = () =>
    p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')].map((e) => ({
        gap: +e.getAttribute("data-gap-days"),
        late: e.hasAttribute("data-late"),
        text: (e.textContent ?? "").trim(),
      })).sort((a, c) => a.gap - c.gap));

  const rest = await read();
  const restBounds = await p.locator('[data-shoot="memory-bounds"]').count();
  check("F1. At rest the relationship is drawn but not narrated",
    rest.length > 0 && rest.every((t) => t.text === "") && restBounds === 0,
    `${rest.length} tie(s), ${restBounds} bound label(s), gaps ${rest.map((t) => t.gap).join("/")}`);

  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).hover();
  await settle(700);
  const hov = await read();
  check("F2. Pointing at a project states its gap in words",
    hov.some((t) => /\d+d (clear|late)|on target/.test(t.text)),
    hov.map((t) => t.text || "—").join(" · "));
  check("F3. …and the arithmetic is byte-identical to what was already drawn",
    JSON.stringify(rest.map((t) => [t.gap, t.late])) === JSON.stringify(hov.map((t) => [t.gap, t.late])),
    rest.map((t) => `${t.gap}d`).join(", "));

  // Against the stored dates, not against itself.
  const cur = await proj();
  const nowT = new Date(cur.now).getTime();
  const expected = cur.lanes
    .map((l) => {
      const arr = (cur.snapshotsByScope[l.scopeId] ?? [])
        .filter((s) => new Date(s.generatedAt).getTime() <= nowT)
        .sort((a, c) => new Date(a.generatedAt) - new Date(c.generatedAt));
      return arr[arr.length - 1] ?? null;
    })
    .filter((s) => s && s.targetDate)
    .map((s) => Math.round((new Date(s.targetDate).getTime() - new Date(s.likelyDate).getTime()) / DAY))
    .sort((a, c) => a - c);
  check("F4. …and both agree with the two dates the Report stored",
    JSON.stringify(hov.map((t) => t.gap).sort((a, c) => a - c)) === JSON.stringify(expected),
    expected.join(", "));
  await park();
}

// ── G. OPENING A PROJECT REVEALS THE RICHER DETAIL ─────────────────
const axisBefore = await planGeometry();
{
  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).click({ position: { x: 70, y: 55 } });
  await settle(1100);
  await park();
  const opened = await p.evaluate(() => ({
    expanded: document.querySelectorAll('[data-shoot^="lane-header-"][data-expanded]').length,
    fine: document.querySelectorAll('[data-shoot="fine-tick"]').length,
    bounds: document.querySelectorAll('[data-shoot="memory-bounds"]').length,
    confident: [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')]
      .some((e) => /% confident/.test(e.textContent ?? "")),
    dated: [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')]
      .filter((e) => /→/.test(e.textContent ?? "")).length,
  }));
  check("G1. Opening a project raises the temporal grain",
    opened.expanded === 1 && opened.fine > 0, `${opened.fine} fine ticks`);
  check("G2. …and brings the richer forecast/target detail with it",
    opened.bounds > 0 && opened.confident, `${opened.bounds} bound label(s), confidence ${opened.confident}`);
  check("G3. …and the plan states its exact dates at rest", opened.dated > 0, `${opened.dated} object(s)`);
}

// ── P. PRESENTATION NEVER MOVES THE DATE AXIS ──────────────────────
{
  const axisOpen = await planGeometry();
  const common = axisOpen.filter((o) => axisBefore.some((q) => q.id === o.id));
  const same = common.every((o) => {
    const q = axisBefore.find((r) => r.id === o.id);
    return q.x === o.x && q.w === o.w && q.date === o.date && q.end === o.end;
  });
  check("P1. Opening a lane moves no object's x, width or date",
    same && common.length > 0, `${common.length} object(s) compared`);
}

// ── H–K. DORMANT LANES ─────────────────────────────────────────────
{
  await open();
  const activeBefore = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="lane-header-"]')].map((e) => ({
      id: e.getAttribute("data-shoot").replace("lane-header-", ""),
      dormant: e.hasAttribute("data-dormant"),
      h: Math.round(e.getBoundingClientRect().height),
    })));
  check("J1. A project with a real story is NEVER collapsed",
    activeBefore.length > 0 && activeBefore.every((l) => !l.dormant),
    activeBefore.map((l) => `${l.id.slice(0, 8)} ${l.h}px`).join(", "));

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
    const eight = await proj();
    await open();
    const lanes = await p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot^="lane-header-"]')].map((e) => ({
        id: e.getAttribute("data-shoot").replace("lane-header-", ""),
        dormant: e.hasAttribute("data-dormant"),
        h: Math.round(e.getBoundingClientRect().height),
        named: (e.textContent ?? "").trim().length > 0,
      })));
    const rails = lanes.filter((l) => l.dormant);
    const rooms = lanes.filter((l) => !l.dormant);
    check("H1. A project with nothing to show gets a rail, not a room",
      rails.length === 4 && rooms.length === 4,
      `${rails.length} rail(s) at ${rails[0]?.h}px, ${rooms.length} lane(s) at ${rooms[0]?.h}px`);
    check("H2. …a rail is a fraction of a lane, and still says its name",
      rails.every((l) => l.h < rooms[0].h / 2 && l.named));
    check("H3. …and the projects that do have a story keep their depth",
      rooms.every((l) => l.h >= 120), rooms.map((l) => `${l.h}px`).join(", "));
    check("K1. Collapsing to rails changed nothing in the projection",
      truth(await proj()) === truth(eight), `${eight.entries.length} entries`);

    // I. A rail opens, and opening it gives back everything a lane has.
    const s5 = eight.lanes.find((l) => l.name === "Stress 5");
    const hb = await box(`[data-shoot="lane-header-${s5.scopeId}"]`);
    await p.locator(`[data-shoot="lane-header-${s5.scopeId}"]`)
      .click({ position: { x: 70, y: Math.round(hb.height / 2) } });
    await settle(1100);
    const after = await p.evaluate((id) => {
      const el = document.querySelector(`[data-shoot="lane-header-${id}"]`);
      return {
        dormant: el.hasAttribute("data-dormant"),
        expanded: el.hasAttribute("data-expanded"),
        h: Math.round(el.getBoundingClientRect().height),
        bed: document.querySelectorAll(`[data-shoot="plan-bed-${id}"]`).length,
        fine: document.querySelectorAll('[data-shoot="fine-tick"]').length,
      };
    }, s5.scopeId);
    check("I1. Asking for a dormant project wakes it fully",
      !after.dormant && after.expanded && after.h > 100, `${hb.height}px → ${after.h}px`);
    check("I2. …with its composing surface and its finer grain",
      after.bed === 1 && after.fine > 0, `${after.bed} bed, ${after.fine} fine ticks`);
    check("K2. Waking a project changed nothing in the projection",
      truth(await proj()) === truth(eight));

    // ── L–N. THE MASTER DISPLAY AT EIGHT ──────────────────────────
    await open();
    const strip = await p.evaluate(() => {
      const readout = document.querySelector('[data-shoot="memory-readout"]');
      const cells = [...readout.children];
      return {
        display: document.querySelectorAll('[data-shoot="master-ribbon"]').length,
        readouts: document.querySelectorAll('[data-shoot="memory-readout"]').length,
        cells: cells.length,
        minW: Math.min(...cells.map((e) => e.getBoundingClientRect().width)),
        rows: new Set(cells.map((e) => Math.round(e.getBoundingClientRect().top))).size,
        names: Math.min(...cells.map((e) => parseFloat(getComputedStyle(e.firstElementChild).fontSize))),
        landings: [...document.querySelectorAll('[data-shoot^="memory-likely-"]')]
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
        scrolls: readout.scrollWidth > readout.clientWidth,
        more: document.querySelectorAll('[data-shoot="memory-readout-more"]').length,
        bordered: [readout, ...readout.querySelectorAll("*")].filter((e) => {
          const s = getComputedStyle(e);
          return ["Top", "Right", "Bottom", "Left"].some(
            (k) => parseFloat(s[`border${k}Width`]) > 0.5 && s[`border${k}Style`] !== "none");
        }).length,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    check("L1. Eight projects produce NO page-level horizontal overflow",
      strip.pageOverflow <= 0, `${strip.pageOverflow}px`);
    check("M1. No project cell shrinks below the readable floor",
      strip.minW >= 127, `narrowest ${Math.round(strip.minW)}px`);
    check("M2. …and the type never goes below its floor either",
      strip.names >= 7.5 && Math.min(...strip.landings) >= 13,
      `name ${strip.names}px, landing ${Math.min(...strip.landings)}px`);
    check("M3. Past the floor the readout scrolls, and says so",
      !strip.scrolls || strip.more === 1, `scrolls=${strip.scrolls}, cue=${strip.more}`);
    check("N1. It is still ONE shared display, on one baseline",
      strip.display === 1 && strip.readouts === 1 && strip.rows === 1 && strip.bordered === 0,
      `${strip.cells} cells, ${strip.rows} row, ${strip.bordered} bordered`);
  } finally {
    for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }
}

// ── O. THE OPENED PROJECT STILL GETS FINER TIME ────────────────────
{
  await open();
  const before = await p.locator('[data-shoot="fine-tick"]').count();
  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).click({ position: { x: 70, y: 55 } });
  await settle(1000);
  const after = await p.locator('[data-shoot="fine-tick"]').count();
  const coarse = await p.evaluate(() =>
    [...document.querySelectorAll("svg text")].filter((t) =>
      /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test((t.textContent ?? "").trim())).length);
  check("O1. An opened project still receives a finer grain than the field",
    before === 0 && after > coarse, `${before} → ${after} fine vs ${coarse} coarse`);
}

// ── the whole pass, one last time ──────────────────────────────────
check("Z1. Nothing in this pass wrote to the projection",
  truth(await proj()) === truth(start), `${start.entries.length} entries in and out`);

await b.close();
console.log(`\n${failures === 0 ? "ALL SEMANTIC POLISH PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
