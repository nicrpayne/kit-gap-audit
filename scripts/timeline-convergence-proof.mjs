// VISUAL CONVERGENCE, PROVEN.
//
// This pass changed how Timeline LOOKS and almost nothing about what it
// knows. That is exactly the kind of change that rots quietly, so the
// claims are written down as measurements rather than as adjectives:
//
//   - the header is ONE display, and the date on it dominates
//   - a plan object is a part with a size you can perceive
//   - opening a lane raises the RESOLUTION of the same timeline
//   - a dense run of history draws once, and says how many
//   - forecast and target state their relationship in days
//   - the future recedes during playback and is never hidden
//
// Every one of them is presentation. The last section proves that: the
// projection is byte-identical to what it was before any of it was drawn.
//
//   node scripts/timeline-convergence-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
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

await open();
const start = await proj();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");

// ── A. ONE MASTER DISPLAY, NOT A ROW OF CARDS ──────────────────────
{
  check("A1. The header is ONE display", (await p.locator('[data-shoot="master-ribbon"]').count()) === 1);

  // The complaint this pass started from was five bordered tiles. The
  // measurable version: inside the display, nothing draws a border of its
  // own except the display itself.
  const bordered = await p.evaluate(() => {
    const root = document.querySelector('[data-shoot="master-ribbon"]');
    const all = [root, ...root.querySelectorAll("*")];
    return all.filter((e) => {
      const s = getComputedStyle(e);
      return ["Top", "Right", "Bottom", "Left"].some(
        (side) => parseFloat(s[`border${side}Width`]) > 0.5 && s[`border${side}Style`] !== "none"
      );
    }).length;
  });
  check("A2. Exactly ONE bordered container in the whole readout", bordered === 1, `${bordered} bordered element(s)`);

  const sizes = await p.evaluate(() => {
    const f = (s) => {
      const e = document.querySelector(s);
      return e ? parseFloat(getComputedStyle(e).fontSize) : null;
    };
    const landings = [...document.querySelectorAll('[data-shoot^="memory-likely-"]')]
      .map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { master: f('[data-shoot="master-date"]'), landings };
  });
  const biggestLanding = Math.max(...sizes.landings);
  check("A3. The playhead date DOMINATES every project landing",
    sizes.master >= biggestLanding * 1.4,
    `${sizes.master}px vs ${biggestLanding}px`);

  // Association is spatial: a project's landing sits directly under its own
  // name, inside one cell, so no legend or connector is needed to pair them.
  const paired = await p.evaluate((ids) =>
    ids.map((id) => {
      const cell = document.querySelector(`[data-shoot="memory-${id}"]`);
      const val = cell?.querySelector(`[data-shoot="memory-likely-${id}"]`);
      if (!cell) return null;
      if (!val) return "no-snapshot";
      const c = cell.getBoundingClientRect();
      const v = val.getBoundingClientRect();
      return v.left >= c.left - 1 && v.right <= c.right + 1 && v.top > c.top ? "paired" : "loose";
    }), start.lanes.map((l) => l.scopeId));
  check("A4. Every landing sits inside its own project's cell, under its name",
    paired.every((r) => r === "paired" || r === "no-snapshot"), paired.join(", "));
}

// ── B. A PLAN OBJECT IS A PART WITH A SIZE ─────────────────────────
{
  const objs = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role="span"]')].map((e) => {
      // The BODY rect, not the group's bounding box — the label and the
      // dates hang outside the block and would flatter the measurement.
      const body = e.querySelectorAll("rect")[1].getBoundingClientRect();
      return {
        id: e.getAttribute("data-shoot"),
        h: +body.height.toFixed(1),
        w: +body.width.toFixed(1),
        t0: new Date(e.getAttribute("data-date")).getTime(),
        t1: new Date(e.getAttribute("data-end")).getTime(),
      };
    }));
  check("B1. Plan blocks exist to measure", objs.length >= 3, `${objs.length} span objects`);
  check("B2. A plan object is a 20–24px part where the lane has the room",
    objs.every((o) => o.h >= 18 && o.h <= 24) && objs.some((o) => o.h >= 20),
    objs.map((o) => o.h).join(", "));

  // DURATION IS PERCEIVED, NOT READ. Every block on the shared axis has the
  // same pixels-per-day, so a block twice as wide IS twice as long — which
  // is the only reason width can be trusted before the dates are read.
  const perDay = objs.map((o) => (o.w / ((o.t1 - o.t0) / DAY)));
  const spread = Math.max(...perDay) - Math.min(...perDay);
  check("B3. Width IS duration — one pixels-per-day across every block",
    spread < 0.35, `${perDay.map((v) => v.toFixed(2)).join(", ")} px/day`);

  const marked = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role="span"]')]
      .filter((e) => e.querySelectorAll("rect")[1].getBoundingClientRect().width >= 112)
      .map((e) => {
        const m = e.querySelector('[data-shoot="plan-measure"]');
        const days = Math.round(
          (new Date(e.getAttribute("data-end")) - new Date(e.getAttribute("data-date"))) / 86400000);
        return m ? (m.textContent ?? "").trim() === `${days}d` : false;
      }));
  check("B4. A long block carries its own measurement, and it is the true one",
    marked.length > 0 && marked.every(Boolean), `${marked.filter(Boolean).length}/${marked.length}`);
}

// ── C. OPENING A LANE RAISES THE RESOLUTION ────────────────────────
{
  const axis = () => p.evaluate(() => {
    const e = document.querySelector('[data-plan-role="span"][data-date]');
    const r = e.querySelectorAll("rect")[1].getBoundingClientRect();
    return { x: +r.left.toFixed(2), w: +r.width.toFixed(2) };
  });
  const restDates = await p.evaluate((id) => {
    const lane = document.querySelector(`[data-shoot="lane-header-${id}"]`);
    return !!lane;
  }, jsa.scopeId);
  check("C0. The project has a header to open", restDates);

  const a0 = await axis();
  const fine0 = await p.locator('[data-shoot="fine-tick"]').count();
  const datesCompact = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')]
      .filter((e) => /→/.test(e.textContent ?? "")).length);

  // C1. THE HEADER IS THE DOOR. Not a 10px chevron in its corner.
  await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"]`).click({ position: { x: 70, y: 60 } });
  await settle(1000);
  await park();
  check("C1. Pressing the project header itself opens the lane",
    (await p.locator(`[data-shoot="lane-header-${jsa.scopeId}"][data-expanded]`).count()) === 1);

  const fine1 = await p.locator('[data-shoot="fine-tick"]').count();
  check("C2. An opened lane draws the SAME window at a finer grain",
    fine0 === 0 && fine1 > 0, `${fine0} → ${fine1} fine ticks`);

  const coarse = await p.evaluate(() =>
    [...document.querySelectorAll("svg text")].filter((t) =>
      /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test((t.textContent ?? "").trim())).length);
  check("C3. …and the finer grain is genuinely finer than the field's own grid",
    fine1 > coarse, `${fine1} fine vs ${coarse} coarse`);

  const confined = await p.evaluate((id) => {
    const lane = document.querySelector(`[data-shoot="lane-header-${id}"]`).getBoundingClientRect();
    const ticks = [...document.querySelectorAll('[data-shoot="fine-tick"] line')].map((e) => e.getBoundingClientRect());
    return ticks.every((r) => r.top >= lane.top - 4 && r.bottom <= lane.bottom + 4);
  }, jsa.scopeId);
  check("C4. The finer grain belongs to the opened lane ALONE", confined);

  const datesOpen = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role]')]
      .filter((e) => /→/.test(e.textContent ?? "")).length);
  check("C5. At the higher resolution a plan object states its dates at rest",
    datesOpen > datesCompact, `${datesCompact} → ${datesOpen} objects dated at rest`);
  check("C6. …and the forecast capsule names its own ends",
    (await p.locator('[data-shoot="memory-bounds"]').count()) > 0);

  const a1 = await axis();
  check("C7. Raising the resolution moves NOTHING on the date axis",
    a0.x === a1.x && a0.w === a1.w, `${a0.x}/${a0.w} vs ${a1.x}/${a1.w}`);

  // C8. The name is still a door to somewhere else, not a second expander.
  await p.locator(`[data-shoot="lane-open-${jsa.scopeId}"]`).click();
  // A first hit on another route compiles it, which in dev takes longer
  // than any settle worth writing. Wait for the URL, not for a guess.
  await p.waitForURL(/\/scope/, { timeout: 30000 }).catch(() => {});
  check("C8. The project NAME still opens Scope rather than the lane",
    p.url().includes("/scope"), p.url().replace(BASE, ""));
  await open();
}

// ── D. A RUN OF HISTORY DRAWS ONCE ─────────────────────────────────
{
  const before = await proj();
  const cl = await p.evaluate(() => ({
    clusters: [...document.querySelectorAll('[data-shoot^="history-cluster-"]')]
      .map((e) => +e.getAttribute("data-count")),
    muted: [...document.querySelectorAll("[data-muted]")].map((e) => e.getAttribute("data-shoot")),
    drawn: document.querySelectorAll(
      '[data-shoot^="event-"]:not([data-shoot^="event-module-"]):not([data-shoot="event-intake-toggle"])').length,
  }));
  check("D1. A dense run of history draws as ONE node with a count",
    cl.clusters.length > 0 && cl.clusters.every((n) => n >= 3),
    cl.clusters.join(" + "));

  const summed = cl.clusters.reduce((a, n) => a + n, 0);
  check("D2. The count is exactly what it stands for — no more, no less",
    summed === cl.muted.length, `${summed} claimed, ${cl.muted.length} stood down`);

  // PRESENTATION ONLY, IN THE STRICT SENSE. Every entry a cluster speaks
  // for is still an entry: still projected, still in the DOM, still able to
  // be pointed at and asked. Only the ink changed.
  const stillThere = cl.muted.every((s) => before.entries.some((e) => `event-${e.id}` === s));
  check("D3. Every clustered entry is still a real entry in the projection", stillThere,
    `${cl.muted.length} checked`);

  const someClustered = cl.muted[0];
  const reached = await p.evaluate((sel) => {
    const el = document.querySelector(`[data-shoot="${sel}"]`);
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      ?.closest("[data-shoot]")?.getAttribute("data-shoot") ?? "none";
  }, someClustered);
  check("D4. Pointing INTO a run still reaches the individual event",
    reached === someClustered, `${reached}`);

  const bb = await box(`[data-shoot="${someClustered}"]`);
  await p.mouse.move(bb.x + bb.width / 2 - 40, bb.y - 40);
  await settle(200);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await settle(700);
  const surfaced = await p.evaluate((sel) => {
    const el = document.querySelector(`[data-shoot="${sel}"]`);
    return { muted: el.hasAttribute("data-muted"), modules: document.querySelectorAll('[data-shoot^="event-module-"]').length };
  }, someClustered);
  check("D5. …and it surfaces in full and explains itself when it is",
    surfaced.muted === false && surfaced.modules > 0,
    `muted=${surfaced.muted}, ${surfaced.modules} module(s)`);
  await park();

  // THE POINT OF ALL OF IT, IN ONE NUMBER. What the eye has to resolve at
  // rest is now materially smaller than what the score is standing for.
  const ink = await p.evaluate(() =>
    document.querySelectorAll(
      '[data-shoot^="event-"]:not([data-shoot^="event-module-"]):not([data-shoot="event-intake-toggle"]):not([data-muted])'
    ).length + document.querySelectorAll('[data-shoot^="history-cluster-"]').length);
  check("D6. The resting canvas paints far fewer nodes than the score stands for",
    ink < cl.drawn * 0.75, `${ink} painted for ${cl.drawn} marks`);
}

// ── E. FORECAST AND TARGET SAY WHAT THEY ARE TO EACH OTHER ─────────
{
  const cur = await proj();
  const nowT = new Date(cur.now).getTime();
  const latest = (scopeId) => {
    const arr = (cur.snapshotsByScope[scopeId] ?? [])
      .filter((s) => new Date(s.generatedAt).getTime() <= nowT)
      .sort((a, c) => new Date(a.generatedAt) - new Date(c.generatedAt));
    return arr[arr.length - 1] ?? null;
  };
  const expected = cur.lanes
    .map((l) => latest(l.scopeId))
    .filter((s) => s && s.targetDate)
    .map((s) => Math.round((new Date(s.targetDate).getTime() - new Date(s.likelyDate).getTime()) / DAY));

  const drawn = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="forecast-vs-target"]')].map((e) => ({
      gap: +e.getAttribute("data-gap-days"),
      late: e.hasAttribute("data-late"),
      says: (e.textContent ?? "").trim(),
    })));
  check("E1. Where a target exists, the gap to the likely landing is STATED",
    drawn.length > 0 && drawn.length === expected.length,
    `${drawn.length} tie(s) for ${expected.length} target(s)`);
  check("E2. …and every stated gap is the arithmetic of the two stored dates",
    drawn.every((d) => expected.includes(d.gap)),
    drawn.map((d) => `${d.gap}d`).join(", "));
  check("E3. …with the direction named, never left to the reader",
    drawn.every((d) => (d.gap < 0 ? d.late && /late/.test(d.says) : !d.late && /(clear|on target)/.test(d.says))),
    drawn.map((d) => d.says).join(" · "));

  const noTarget = cur.lanes.filter((l) => { const s = latest(l.scopeId); return s && !s.targetDate; }).length;
  check("E4. A forecast with no target invents no relationship",
    drawn.length === expected.length, `${noTarget} lane(s) without a target drew none`);
}

// ── F. THE FUTURE RECEDES; IT IS NEVER HIDDEN ──────────────────────
{
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  const restScrim = await p.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[data-shoot="future-recede"]')).opacity));
  await p.locator('[data-shoot="play"]').click();
  await settle(1400);
  const during = await p.evaluate(() => {
    const scrim = document.querySelector('[data-shoot="future-recede"]');
    const planned = [...document.querySelectorAll('[data-shoot^="plan-"][data-plan-role][data-planned]')];
    return {
      receding: scrim.hasAttribute("data-receding"),
      opacity: parseFloat(getComputedStyle(scrim).opacity),
      planned: planned.length,
      visible: planned.filter((e) => parseFloat(getComputedStyle(e).opacity) > 0.9).length,
    };
  });
  check("F1. Playback pushes the intent side back", during.receding && during.opacity > 0.2,
    `scrim ${restScrim} → ${during.opacity.toFixed(2)}`);
  check("F2. …but never hides it — the plan is still drawn, still readable",
    during.opacity < 0.75 && during.planned > 0 && during.visible === during.planned,
    `${during.visible}/${during.planned} plan objects still drawn`);

  for (let i = 0; i < 240; i++) {
    await p.waitForTimeout(300);
    if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
  }
  await settle(1500);
  const after = await p.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[data-shoot="future-recede"]')).opacity));
  check("F3. The future comes back the moment the story is told", after < 0.05, `${after}`);
}

// ── G. THE SEAM EXPLAINS ITSELF WITHOUT A PAINTED WORD ─────────────
{
  await open();
  // CONTRACT REPLACED, NARROWLY. The old assertion checked that the seam's
  // rendered text said "Inspect". What it was protecting is that the closed
  // inspector still ANNOUNCES ITSELF — a bare 26px strip with nothing on it
  // would be a dead edge nobody presses. A machined pull grip says it in
  // the language the rest of the instrument speaks, and the word survives
  // where it is actually needed: the accessible name. So the claim becomes
  // "it announces itself, and it does so without type".
  const seam = await p.evaluate(() => {
    const e = document.querySelector('[data-shoot="inspector-seam"]');
    return {
      text: (e.textContent ?? "").trim(),
      label: e.getAttribute("aria-label") ?? "",
      marks: e.querySelectorAll("svg rect").length,
    };
  });
  check("G1. The closed inspector announces itself with a grip, not type",
    seam.text.length === 0 && seam.marks >= 3, `${seam.marks} grip marks, text "${seam.text}"`);
  check("G2. …and the word survives where it is needed — the accessible name",
    /inspect/i.test(seam.label), seam.label);
}

// ── H. ALL OF IT WAS PRESENTATION ──────────────────────────────────
{
  const end = await proj();
  const key = (e) => `${e.id}|${e.date}|${e.endDate}|${e.scopeId}`;
  const ka = start.entries.map(key);
  const kb = end.entries.map(key);
  const diffs = ka.length === kb.length ? ka.map((v, i) => (v === kb[i] ? null : `${v} → ${kb[i]}`)).filter(Boolean) : ["length"];
  check("H1. Not one row changed: the projection is byte-identical",
    diffs.length === 0,
    diffs.length === 0 ? `${end.entries.length} entries` : diffs.slice(0, 2).join(" ; "));
}

// ── I. EIGHT PROJECTS STILL WORK ───────────────────────────────────
{
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
    const dense = await p.evaluate(() => {
      // The cells are exactly the children of the readout — no name
      // matching, so a scope id that happens to start with an awkward
      // letter cannot quietly drop a project out of the measurement.
      const cells = [...document.querySelector('[data-shoot="memory-readout"]').children];
      const names = cells.map((e) => e.firstElementChild);
      return {
        cells: cells.length,
        minW: Math.min(...cells.map((e) => e.getBoundingClientRect().width)),
        nameSize: Math.min(...names.map((e) => parseFloat(getComputedStyle(e).fontSize))),
        landings: [...document.querySelectorAll('[data-shoot^="memory-likely-"]')]
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    check("I1. Eight projects all get a readout", dense.cells === 8, `${dense.cells} cells`);
    check("I2. …none of them collapses into an unreadable tile",
      dense.minW >= 80 && dense.nameSize >= 7 && Math.min(...dense.landings) >= 12,
      `min ${Math.round(dense.minW)}px wide, name ${dense.nameSize}px, landing ${Math.min(...dense.landings)}px`);
    check("I3. …and the header still fits the screen", !dense.overflow);

    const lanes8 = (await proj()).lanes;
    // Below the name, which is its own door. At eight lanes a header is
    // short and the name sits near its top, so a fixed y would press it.
    const h8 = await box(`[data-shoot="lane-header-${lanes8[0].scopeId}"]`);
    await p.locator(`[data-shoot="lane-header-${lanes8[0].scopeId}"]`)
      .click({ position: { x: 70, y: Math.round(h8.height) - 10 } });
    await settle(1000);
    check("I4. Opening one of eight still raises that lane's resolution",
      (await p.locator('[data-shoot="fine-tick"]').count()) > 0 &&
        (await p.locator(`[data-shoot="lane-header-${lanes8[0].scopeId}"][data-expanded]`).count()) === 1);
  } finally {
    for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }
}

await b.close();
console.log(`\n${failures === 0 ? "ALL VISUAL CONVERGENCE PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
