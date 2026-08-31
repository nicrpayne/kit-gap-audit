// THE B3 BATTERY.
//
// Everything the brief asks to be measured, on the real JSA corpus, through
// the one `window.__lab` interface. Nothing here inspects the prototype's
// internals or recomputes physics of its own: if a number is not exposed by
// the page it is not reported, because a measurement the page cannot make is
// a measurement nobody can check.
//
//   node b3run.mjs                    everything
//   node b3run.mjs 1 4 8              only those sections
//   OUT=./b3out node b3run.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:4400";
const OUT = process.env.OUT ?? "./b3out";
const ONLY = new Set(process.argv.slice(2));
const want = (n) => ONLY.size === 0 || ONLY.has(String(n));
mkdirSync(`${OUT}/shots`, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
await page.goto(`${BASE}/pb3.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
if (!(await page.evaluate(() => window.__lab?.ready?.()))) {
  console.log("pb3 never reported ready");
  await browser.close();
  process.exit(1);
}

// §10 is run at more than one strength: whether a bloom is labellable is
// exactly the question the three strengths differ on.
if (process.env.S) await page.evaluate((k) => window.__lab.strength(k), process.env.S);
await page.evaluate(() => {
  // The in-page twin of `quiet()`: several measurements run entirely inside
  // one evaluate and need the same "is it still moving" answer without a
  // round trip per poll.
  window.__quiet = async (maxMs = 12000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      const b = window.__lab.busy();
      if (b.settled && b.alpha < 0.02) return true;
      await new Promise((r) => setTimeout(r, 90));
    }
    return false;
  };
});

// MERGE, never overwrite. The battery is run in slices — §1 alone is ten
// subjects times five approaches with a wait for quiescence between each —
// so a later slice must not delete an earlier one's numbers.
const PRIOR = existsSync(`${OUT}/results.json`) ? JSON.parse(readFileSync(`${OUT}/results.json`, "utf8")) : {};
const R = { ...PRIOR, errors: errs };
const say = (...a) => console.log(...a);
const n1 = (x) => (x == null ? "—" : (+x).toFixed(1));
const n2 = (x) => (x == null ? "—" : (+x).toFixed(2));
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

/** Reset to the deterministic rest world. Every section starts from the same
    place, so no section can inherit another's transient. */
async function rest() {
  await page.evaluate(() => { window.__lab.select(null); });
  await quiet();
  await page.evaluate(() => window.__lab.fit());
  await page.waitForTimeout(400);
}

/** WAIT FOR THE WORLD TO ACTUALLY BE STILL, rather than for a number of
    milliseconds that was right for the shortest case. The return window is
    sized to how far things travelled, so a fixed sleep starts the next
    measurement inside the last one's return and reports that as drift — which
    is precisely the error the first §4 run made. */
async function quiet(maxMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const b = await page.evaluate(() => window.__lab.busy());
    if (b.settled && b.alpha < 0.02) return true;
    await page.waitForTimeout(120);
  }
  return false;
}

/** THE SUBJECTS. Resolved from the corpus by shape, never hard-coded by id,
    so the battery still names the right things if the package is re-seeded. */
const SUBJECTS = await page.evaluate(() => {
  const ns = window.__lab.nodes();
  const gs = window.__lab.groups();
  const lab = (n) => String(n.label ?? "");
  const findG = (re) => gs.find((g) => re.test(String(g.label)));
  const findN = (f) => ns.find(f);
  const byType = (t) => ns.filter((n) => n.intelType === t);
  const crowd = (a, R) => ns.filter((n) => n !== a && Math.hypot(n.x - a.x, n.y - a.y) < R).length;
  // The most-connected transcript, source and passage — "JSA-shaped" means
  // the shapes this package actually contains.
  const rank = (arr) => arr.map((n) => ({ n, p: window.__lab.preview(n.id).seats })).sort((a, b) => b.p - a.p);
  const topTranscript = rank(ns.filter((n) => n.kind === "transcript"))[0]?.n;
  const topSource = rank(ns.filter((n) => n.kind === "source"))[0]?.n;
  const pick = (n, why) => (n ? { id: n.id, kind: n.kind, type: n.intelType ?? null, label: lab(n).slice(0, 46), why, crowd: crowd(n, 90) } : null);
  return {
    nodes: [
      pick(byType("risk")[0], "Risk — the object the audit exists for"),
      pick(byType("decision")[0], "Decision"),
      pick(byType("dependency")[0], "Dependency"),
      pick(byType("commitment")[0], "Commitment"),
      pick(rank(byType("observation"))[0]?.n, "Observation — the most connected one"),
      pick(topTranscript, "Transcript — the most connected one"),
      pick(topSource, "Source — the most connected one"),
      pick(rank(ns.filter((n) => n.kind === "passage"))[0]?.n, "Passage"),
      pick(findN((n) => n.kind === "work"), "Work item"),
      pick(findN((n) => n.kind === "reality"), "Reality — the field's own centre"),
    ].filter(Boolean),
    groups: [
      findG(/^Risk$/i),
      findG(/^Observation$/i),
      gs.filter((g) => g.id.startsWith("agg:src:")).sort((a, b) => b.count - a.count)[0],
      findG(/Lucas Sync/i),
      findG(/Dev Standup/i),
      findG(/Notif/i),
    ].filter(Boolean).map((g) => ({ id: g.id, label: String(g.label).slice(0, 44), count: g.count })),
    transcripts: ns
      .filter((n) => n.kind === "transcript" || n.kind === "source")
      .map((n) => ({ id: n.id, label: lab(n).slice(0, 44), seats: window.__lab.preview(n.id).seats }))
      .sort((a, b) => b.seats - a.seats),
  };
});

R.subjects = SUBJECTS;
say(`\n${"═".repeat(78)}\nB3 · LOCAL BLOOM — the JSA corpus, 407 objects\n${"═".repeat(78)}`);
say("\nSUBJECTS");
for (const s of SUBJECTS.nodes) say(`  ${pad(s.kind, 11)} ${pad(s.type ?? "", 13)} crowd@90 ${num(s.crowd, 3)}  ${s.label}`);
say("\nGROUPS");
for (const g of SUBJECTS.groups) say(`  ${num(g.count, 3)}  ${g.label}`);

/**
 * ONE SELECTION, FULLY MEASURED. Returns the four states the brief asks each
 * acceptance test to capture, with the numbers taken at each.
 */
async function measureSelect(id, opts = {}) {
  return page.evaluate(
    async ([id, groupId]) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const snap = () => new Map([...window.__lab.positions()].map(([k, v]) => [k, { x: v.x, y: v.y }]));
      const moved = (a, b, ids) => {
        let s = 0, mx = 0, n = 0;
        for (const i of ids) {
          const p = a.get(i), q = b.get(i);
          if (!p || !q) continue;
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          s += d; mx = Math.max(mx, d); n++;
        }
        return n ? { mean: +(s / n).toFixed(2), max: +mx.toFixed(2), n } : { mean: null, max: null, n: 0 };
      };

      const rest = snap();
      const before = window.__lab.clearance(id);

      const t0 = performance.now();
      if (groupId) window.__lab.selectGroup(groupId);
      else window.__lab.select(id);
      // BLOOM — sampled mid-ramp, which is where a click either feels
      // acknowledged or does not.
      await sleep(140);
      const atBloom = { clear: window.__lab.clearance(id), bloom: window.__lab.bloom(), t: +(performance.now() - t0).toFixed(0) };

      await window.__quiet();
      const settledPos = snap();
      const ring = window.__lab.rings();
      const settled = {
        clear: window.__lab.clearance(id),
        bloom: window.__lab.bloom(),
        spread: window.__lab.spread(),
        labelRoom: window.__lab.labelRoom(),
        overlap: window.__lab.localOverlap(),
        local: moved(rest, settledPos, ring.local),
        penumbra: moved(rest, settledPos, ring.penumbra),
        field: moved(rest, settledPos, ring.field),
      };

      window.__lab.select(null);
      await window.__quiet();
      const exitPos = snap();
      const exit = {
        all: moved(rest, exitPos, [...rest.keys()]),
        local: moved(rest, exitPos, ring.local),
        penumbra: moved(rest, exitPos, ring.penumbra),
        field: moved(rest, exitPos, ring.field),
        clear: window.__lab.clearance(id),
      };
      return { id, before, atBloom, settled, exit };
    },
    [id, opts.groupId ?? null]
  );
}

// ══ §1 — DOES THE TOPOLOGY OPEN, AND BY WHICH MECHANISM ═══════════════
if (want(1)) {
  say(`\n${"─".repeat(78)}\n§1  LOCAL BLOOM FORCE — clearing vs A (inflation) vs B (outward seats) vs A+B\n${"─".repeat(78)}`);
  R.s1 = {};
  for (const subj of SUBJECTS.nodes) {
    R.s1[subj.id] = {};
    say(`\n  ${subj.kind.toUpperCase()}${subj.type ? " · " + subj.type : ""} — ${subj.label}`);
    say(`  ${pad("approach", 9)} ${pad("clear before→after", 21)} ${pad("local moved", 20)} ${pad("penumbra", 18)} ${pad("field", 18)} overlap`);
    for (const a of ["off", "clear", "a", "b", "ab"]) {
      await rest();
      await page.evaluate((x) => window.__lab.approach(x), a);
      const m = await measureSelect(subj.id);
      R.s1[subj.id][a] = m;
      const gain = m.settled.clear && m.before ? m.settled.clear.clear - m.before.clear : null;
      say(
        `  ${pad(a, 9)} ${pad(`${n1(m.before?.clear)} → ${n1(m.settled.clear?.clear)}  ${gain == null ? "" : (gain >= 0 ? "+" : "") + n1(gain)}`, 21)}` +
          ` ${pad(`mean ${n2(m.settled.local.mean)} max ${n2(m.settled.local.max)} n${m.settled.local.n}`, 20)}` +
          ` ${pad(`mean ${n2(m.settled.penumbra.mean)} n${m.settled.penumbra.n}`, 18)}` +
          ` ${pad(`mean ${n2(m.settled.field.mean)} max ${n2(m.settled.field.max)}`, 18)}` +
          ` ${m.settled.overlap ? m.settled.overlap.pairs : "—"}`
      );
    }
  }
  await page.evaluate(() => window.__lab.approach("ab"));
}

// ══ §2 — THREE STRENGTHS ══════════════════════════════════════════════
if (want(2)) {
  say(`\n${"─".repeat(78)}\n§2  BLOOM STRENGTH — calm / balanced / expressive\n${"─".repeat(78)}`);
  R.s2 = {};
  const subj = SUBJECTS.nodes.find((s) => s.kind === "transcript") ?? SUBJECTS.nodes[0];
  const subj2 = SUBJECTS.nodes.find((s) => s.type === "risk") ?? SUBJECTS.nodes[1];
  say(`  measured on:  ${subj.label}   and   ${subj2.label}\n`);
  say(`  ${pad("strength", 12)} ${pad("subject", 10)} ${pad("clear before→after", 20)} ${pad("label room px (min/med)", 24)} ${pad("penumbra", 16)} field`);
  for (const st of ["calm", "balanced", "expressive"]) {
    R.s2[st] = {};
    for (const [tag, s] of [["dense", subj], ["sparse", subj2]]) {
      await rest();
      await page.evaluate((x) => window.__lab.strength(x), st);
      const m = await measureSelect(s.id);
      R.s2[st][tag] = m;
      const lr = m.settled.labelRoom;
      say(
        `  ${pad(st, 12)} ${pad(tag, 10)} ${pad(`${n1(m.before?.clear)} → ${n1(m.settled.clear?.clear)}`, 20)}` +
          ` ${pad(lr ? `${n1(lr.min)} / ${n1(lr.median)}  (n${lr.n})` : "—", 24)}` +
          ` ${pad(`mean ${n2(m.settled.penumbra.mean)}`, 16)} mean ${n2(m.settled.field.mean)}`
      );
    }
  }
  await page.evaluate(() => window.__lab.strength("balanced"));
}

// ══ §3 — BLOOM FOLLOWS RELATIONSHIP ROLE ══════════════════════════════
if (want(3)) {
  say(`\n${"─".repeat(78)}\n§3  RELATIONSHIP ROLE — are the bands real, and are they separable?\n${"─".repeat(78)}`);
  R.s3 = [];
  for (const subj of SUBJECTS.nodes) {
    await rest();
    const r = await page.evaluate(async (id) => {
      window.__lab.select(id);
      await new Promise((r) => setTimeout(r, 2400));
      const b = window.__lab.bloom();
      if (!b) return null;
      // The angular extent each class actually occupies once the physics has
      // settled — measured from live positions, not from the seat plan, so a
      // band that failed to hold reports as a band that failed to hold.
      const a = window.__lab.nodes().find((n) => n.id === id);
      const ring = window.__lab.rings();
      const ns = new Map(window.__lab.nodes().map((n) => [n.id, n]));
      const spans = {};
      for (const cls of ["semantic", "temporal", "provenance", "contextual"]) spans[cls] = [];
      const seats = window.__lab.bloomSeats?.(id);
      void seats; void ring;
      return { bands: b.bands, R0: b.R0, clearR: b.clearR, seats: b.seats, far: b.far, anchor: { x: a.x, y: a.y } };
    }, subj.id);
    if (!r) { say(`  ${pad(subj.kind, 11)} ${pad(subj.label, 46)} no participants within reach`); continue; }
    R.s3.push({ id: subj.id, ...r });
    const bands = r.bands.map((b) => `${b.cls}:${b.n}`).join(" · ") || "—";
    say(`  ${pad(subj.kind, 11)} ${pad(subj.label, 46)} R0 ${num(n1(r.R0), 6)}  seats ${num(r.seats, 3)}  far ${num(r.far, 3)}  ${bands}`);
  }
}

// ══ §4/§5 — GROUP AND SOURCE BLOOM ════════════════════════════════════
if (want(4)) {
  say(`\n${"─".repeat(78)}\n§4/§5  GROUP AND SOURCE BLOOM\n${"─".repeat(78)}`);
  say(`  ${pad("group", 40)} ${pad("n", 4)} ${pad("clear before→after", 20)} ${pad("members moved", 22)} field`);
  R.s4 = {};
  for (const g of SUBJECTS.groups) {
    await rest();
    const m = await page.evaluate(async (gid) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const snap = () => new Map([...window.__lab.positions()].map(([k, v]) => [k, { x: v.x, y: v.y }]));
      const rest = snap();
      const before0 = window.__lab.clearance(null);
      void before0;
      const g = window.__lab.selectGroup(gid);
      if (!g) return null;
      const before = window.__lab.clearance(g.anchor);
      await window.__quiet();
      const after = snap();
      const ring = window.__lab.rings();
      const moved = (ids) => {
        let s = 0, mx = 0, n = 0;
        for (const i of ids) {
          const p = rest.get(i), q = after.get(i);
          if (!p || !q) continue;
          const d = Math.hypot(p.x - q.x, p.y - q.y); s += d; mx = Math.max(mx, d); n++;
        }
        return n ? { mean: +(s / n).toFixed(2), max: +mx.toFixed(2), n } : { mean: null, max: null, n: 0 };
      };
      const out = {
        g, before, clear: window.__lab.clearance(g.anchor), bloom: window.__lab.bloom(),
        labelRoom: window.__lab.labelRoom(), overlap: window.__lab.localOverlap(),
        local: moved(ring.local), penumbra: moved(ring.penumbra), field: moved(ring.field),
      };
      window.__lab.select(null);
      await window.__quiet();
      const back = snap();
      // IDENTITY vs SHAPE. A cell that comes back to the same place and the
      // same size, with its members in each other's seats, has preserved the
      // global map and lost only within-cell identity. Those are different
      // failures and one number cannot tell them apart, so both are taken:
      // `identity` is per-node, `shape` asks how far each rest position is
      // from the NEAREST returned node regardless of which one it is.
      const ids = [...rest.keys()];
      let s = 0, mx = 0, n = 0;
      for (const [i, p] of rest) { const q = back.get(i); if (!q) continue; const d = Math.hypot(p.x - q.x, p.y - q.y); s += d; mx = Math.max(mx, d); n++; }
      const pts = ids.map((i) => back.get(i)).filter(Boolean);
      let ss = 0, sm = 0, sn = 0;
      for (const [, p] of rest) {
        let best = Infinity;
        for (const q of pts) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < best) best = d; }
        ss += best; sm = Math.max(sm, best); sn++;
      }
      out.returnErr = { mean: +(s / n).toFixed(3), max: +mx.toFixed(3), n };
      out.shapeErr = { mean: +(ss / sn).toFixed(3), max: +sm.toFixed(3), n: sn };
      return out;
    }, g.id);
    if (!m) { say(`  ${pad(g.label, 40)} could not be opened`); continue; }
    R.s4[g.id] = m;
    say(
      `  ${pad(g.label, 40)} ${num(g.count, 4)} ${pad(`${n1(m.before?.clear)} → ${n1(m.clear?.clear)}`, 20)}` +
        ` ${pad(`mean ${n2(m.local.mean)} max ${n2(m.local.max)} n${m.local.n}`, 22)} mean ${n2(m.field.mean)}` +
        `   return id ${n2(m.returnErr?.mean)}/${n2(m.returnErr?.max)}  shape ${n2(m.shapeErr?.mean)}/${n2(m.shapeErr?.max)}`
    );
  }
}

// ══ §7 — FOCUS TRANSFER AT SPEED ══════════════════════════════════════
if (want(7)) {
  say(`\n${"─".repeat(78)}\n§7  FOCUS TRANSFER — Risk → Passage → Source → Decision at fast intervals\n${"─".repeat(78)}`);
  R.s7 = {};
  const chain = ["risk", "passage", "source", "decision"]
    .map((k) => SUBJECTS.nodes.find((s) => s.type === k || s.kind === k))
    .filter(Boolean);
  say(`  chain: ${chain.map((c) => c.type ?? c.kind).join(" → ")}`);
  for (const gap of [180, 400, 900]) {
    await rest();
    const r = await page.evaluate(
      async ([ids, gap]) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const snap = () => new Map([...window.__lab.positions()].map(([k, v]) => [k, { x: v.x, y: v.y }]));
        const rest = snap();
        // Was anything ever brought to a stop? A retarget that zeroes velocity
        // reads as three animations instead of one movement.
        let zeroFrames = 0, samples = 0, maxSpeed = 0;
        const watch = setInterval(() => {
          const ns = window.__lab.nodes();
          let moving = 0, top = 0;
          for (const n of ns) { const s = Math.hypot(n.vx ?? 0, n.vy ?? 0); if (s > 0.01) moving++; top = Math.max(top, s); }
          samples++; if (moving === 0) zeroFrames++;
          maxSpeed = Math.max(maxSpeed, top);
        }, 40);
        const frames = [];
        let last = performance.now();
        const raf = (t) => { frames.push(t - last); last = t; window.__r = requestAnimationFrame(raf); };
        window.__r = requestAnimationFrame(raf);
        for (const id of ids) { window.__lab.select(id, { silent: true }); await sleep(gap); }
        await window.__quiet();
        cancelAnimationFrame(window.__r);
        clearInterval(watch);
        const after = snap();
        window.__lab.select(null);
        await window.__quiet();
        const back = snap();
        const err = (m) => { let s = 0, mx = 0, n = 0; for (const [i, p] of rest) { const q = m.get(i); if (!q) continue; const d = Math.hypot(p.x - q.x, p.y - q.y); s += d; mx = Math.max(mx, d); n++; } return { mean: +(s / n).toFixed(3), max: +mx.toFixed(3) }; };
        const ds = frames.slice(3).sort((a, b) => a - b);
        return {
          gap, zeroFrames, samples, maxSpeed: +maxSpeed.toFixed(2),
          duringChain: err(after), afterExit: err(back),
          frame: ds.length ? { median: +ds[Math.floor(ds.length / 2)].toFixed(1), p95: +ds[Math.floor(ds.length * 0.95)].toFixed(1), over50: ds.filter((d) => d > 50).length, n: ds.length } : null,
        };
      },
      [chain.map((c) => c.id), gap]
    );
    R.s7[gap] = r;
    say(
      `  gap ${num(gap, 4)}ms  came to a stop mid-chain: ${r.zeroFrames}/${r.samples} samples · peak speed ${n2(r.maxSpeed)}` +
        `  ·  displacement during ${n2(r.duringChain.mean)}/${n2(r.duringChain.max)}  after exit ${n2(r.afterExit.mean)}/${n2(r.afterExit.max)}` +
        `  ·  frame ${r.frame?.median}ms p95 ${r.frame?.p95} >50ms ${r.frame?.over50}/${r.frame?.n}`
    );
  }
}

// ══ §8 — EXIT AND RETURN ══════════════════════════════════════════════
if (want(8)) {
  say(`\n${"─".repeat(78)}\n§8  EXIT AND RETURN — deterministic and bounded, against a do-nothing control\n${"─".repeat(78)}`);
  R.s8 = {};
  const subj = SUBJECTS.nodes.find((s) => s.kind === "transcript") ?? SUBJECTS.nodes[0];
  say(`  subject: ${subj.label}`);
  say(`  B2 keeps the resting simulation LIVE at alpha 0.02, so the world drifts a`);
  say(`  little whether or not anything is selected. The control measures exactly`);
  say(`  that, over the same elapsed time, so the return error can be read against`);
  say(`  the floor it actually has instead of against zero.\n`);
  await rest();
  const r = await page.evaluate(async (id) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const snap = () => new Map([...window.__lab.positions()].map(([k, v]) => [k, { x: v.x, y: v.y }]));
    const err = (a, b) => {
      let s = 0, mx = 0, n = 0, worst = null;
      for (const [i, p] of a) { const q = b.get(i); if (!q) continue; const d = Math.hypot(p.x - q.x, p.y - q.y); s += d; if (d > mx) { mx = d; worst = i; } n++; }
      return { mean: +(s / n).toFixed(3), max: +mx.toFixed(3), worst };
    };
    // Nearest-returned-point error: does the SHAPE come back even when
    // identity does not?
    const shape = (a, b) => {
      const pts = [...b.values()];
      let s = 0, mx = 0, n = 0;
      for (const [, p] of a) {
        let best = Infinity;
        for (const q of pts) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < best) best = d; }
        s += best; mx = Math.max(mx, best); n++;
      }
      return { mean: +(s / n).toFixed(3), max: +mx.toFixed(3) };
    };

    // ── CONTROL: the same elapsed time, nothing selected ──────────────
    const rest0 = snap();
    const control = [];
    let prev = rest0, t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      await sleep(7000);
      const now = snap();
      control.push({ i: i + 1, fromRest0: err(rest0, now), fromPrev: err(prev, now) });
      prev = now;
    }
    const controlMs = Math.round((performance.now() - t0) / 5);

    // ── TEST: five identical select → exit cycles ─────────────────────
    await sleep(1200);
    const rest1 = snap();
    const cycles = [];
    prev = rest1; t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      window.__lab.select(id);
      await window.__quiet();
      window.__lab.select(null);
      await window.__quiet();
      const now = snap();
      cycles.push({ i: i + 1, fromRest0: err(rest1, now), fromPrev: err(prev, now), shape: shape(rest1, now) });
      prev = now;
    }
    const cycleMs = Math.round((performance.now() - t0) / 5);
    const kindOf = (id) => window.__lab.nodes().find((n) => n.id === id)?.kind ?? "?";
    return { control, controlMs, cycles, cycleMs, worstKinds: cycles.map((c) => kindOf(c.fromRest0.worst)) };
  }, subj.id);
  R.s8 = r;
  say(`  CONTROL — no selection at all, ${r.controlMs} ms per step`);
  say(`  ${pad("step", 7)} ${pad("vs the original rest world", 32)} vs the previous step`);
  for (const c of r.control)
    say(`  ${pad(c.i, 7)} ${pad(`mean ${n2(c.fromRest0.mean)}   max ${n2(c.fromRest0.max)}`, 32)} mean ${n2(c.fromPrev.mean)}   max ${n2(c.fromPrev.max)}`);
  say(`\n  TEST — select → exit, ${r.cycleMs} ms per cycle`);
  say(`  ${pad("cycle", 7)} ${pad("vs the original rest world", 32)} ${pad("vs the previous cycle", 30)} shape (nearest point)`);
  for (const c of r.cycles)
    say(`  ${pad(c.i, 7)} ${pad(`mean ${n2(c.fromRest0.mean)}   max ${n2(c.fromRest0.max)}`, 32)} ${pad(`mean ${n2(c.fromPrev.mean)}   max ${n2(c.fromPrev.max)}`, 30)} mean ${n2(c.shape.mean)}   max ${n2(c.shape.max)}`);
  say(`  worst-offender kinds: ${r.worstKinds.join(", ")}`);
}

// ══ §9 — RINGS vs CONSTELLATIONS ══════════════════════════════════════
if (want(9)) {
  say(`\n${"─".repeat(78)}\n§9  RINGS vs CONSTELLATIONS — does the bloom mean the same thing in both?\n${"─".repeat(78)}`);
  R.s9 = {};
  const subj = SUBJECTS.nodes.find((s) => s.kind === "transcript") ?? SUBJECTS.nodes[0];
  for (const m of ["rings", "constellations"]) {
    await page.evaluate((x) => window.__lab.setMode(x), m);
    await page.waitForTimeout(4200);
    await page.evaluate(() => window.__lab.fit());
    await page.waitForTimeout(500);
    const r = await measureSelect(subj.id);
    R.s9[m] = r;
    say(
      `  ${pad(m, 16)} clear ${pad(`${n1(r.before?.clear)} → ${n1(r.settled.clear?.clear)}`, 18)}` +
        ` seats ${num(r.settled.bloom?.seats ?? 0, 3)} R0 ${num(n1(r.settled.bloom?.R0), 6)}` +
        `  local mean ${pad(n2(r.settled.local.mean), 7)} field mean ${pad(n2(r.settled.field.mean), 7)}` +
        ` label room min ${n1(r.settled.labelRoom?.min)} med ${n1(r.settled.labelRoom?.median)}`
    );
  }
  await page.evaluate(() => window.__lab.setMode("rings"));
  await page.waitForTimeout(4200);
}

// ══ §6 — BLOOM AND CAMERA ═════════════════════════════════════════════
if (want(6)) {
  say(`\n${"─".repeat(78)}\n§6  BLOOM AND CAMERA — one move, sized to the bloom, cancelled by a hand\n${"─".repeat(78)}`);
  R.s6 = {};
  // One of each SHAPE, not the first four in the list — which were all intel
  // and all had empty blooms, so the camera was only ever asked the easy
  // question.
  const camSubjects = ["transcript", "source", "passage", "intel", "reality"]
    .map((k) => SUBJECTS.nodes.find((s) => s.kind === k))
    .filter(Boolean);
  for (const subj of camSubjects) {
    await rest();
    const r = await page.evaluate(async (id) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Sample the camera every 60 ms. ONE move means one contiguous run of
      // change; a camera chasing the physics shows up as several.
      const cams = [];
      const t0 = performance.now();
      const iv = setInterval(() => {
        const c = window.__lab.camera();
        cams.push({ t: performance.now() - t0, ...c });
      }, 60);
      window.__lab.select(id);
      await window.__quiet();
      clearInterval(iv);
      // How many separate stretches of camera motion were there?
      let runs = 0, moving = false;
      for (let i = 1; i < cams.length; i++) {
        const d = Math.hypot(cams[i].x - cams[i - 1].x, cams[i].y - cams[i - 1].y) + Math.abs(cams[i].k - cams[i - 1].k) * 400;
        const m = d > 0.35;
        if (m && !moving) runs++;
        moving = m;
      }
      const last = cams[cams.length - 1];
      const first = cams[0];
      // Is the settled bloom actually inside the frame the camera chose?
      const b = window.__lab.bloom();
      const onScreen = window.__lab.localOnScreen(id);
      return {
        runs,
        moved: +(Math.hypot(last.x - first.x, last.y - first.y)).toFixed(1),
        zoom: `${first.k.toFixed(2)} → ${last.k.toFixed(2)}`,
        settleMs: Math.round(cams.length ? cams[cams.length - 1].t : 0),
        onScreen, bloom: b,
      };
    }, subj.id);
    R.s6[subj.id] = r;
    say(
      `  ${pad(subj.kind, 11)} ${pad(subj.label, 44)} camera moves ${r.runs}  pan ${num(r.moved, 6)}  zoom ${r.zoom}` +
        `   local world on screen ${r.onScreen.inside}/${r.onScreen.total}  worst margin ${n1(r.onScreen.worstMargin)}px`
    );
  }
  // A hand on the canvas must cancel the camera outright.
  await rest();
  const cancel = await page.evaluate(async (id) => {
    window.__lab.select(id);
    await new Promise((r) => setTimeout(r, 60));
    const before = window.__lab.camera();
    window.__lab.nudge(40, 0);            // stands in for a drag
    await new Promise((r) => setTimeout(r, 700));
    const after = window.__lab.camera();
    return { tweenAlive: window.__lab.busy().camera, dx: +(after.x - before.x).toFixed(1) };
  }, SUBJECTS.nodes.find((s) => s.kind === "transcript").id);
  R.s6.cancel = cancel;
  say(`  hand input during the camera move: tween still running afterwards = ${cancel.tweenAlive}  (pan applied ${cancel.dx})`);
}

// ══ §10 — LABEL READINESS ═════════════════════════════════════════════
if (want(10)) {
  say(`\n${"─".repeat(78)}\n§10  SELECTED-NEIGHBOUR LABEL READINESS — screen-space separation, CSS px\n${"─".repeat(78)}`);
  say(`  A 10 px label needs roughly 12 px of vertical clearance to sit beside its`);
  say(`  mark without touching the next one. The median says whether the arrangement`);
  say(`  is generally labellable; the MINIMUM says whether any given label collides,`);
  say(`  and it is the number that decides the feature.\n`);
  R.s10 = {};
  const subs = [...SUBJECTS.nodes.map((n) => ({ ...n, sel: "node" })), ...SUBJECTS.groups.map((g) => ({ ...g, kind: "group", sel: "group" }))];
  say(`  strength: ${await page.evaluate(() => window.__lab.strength())}\n`);
  say(`  ${pad("subject", 46)} ${pad("n", 4)} ${pad("min", 8)} ${pad("p10", 8)} ${pad("median", 8)} ${pad("max", 9)} labellable`);
  for (const s of subs) {
    await rest();
    const r = await page.evaluate(
      async ([id, sel]) => {
        if (sel === "group") { const g = window.__lab.selectGroup(id); if (!g) return null; }
        else window.__lab.select(id);
        await window.__quiet();
        return { room: window.__lab.labelRoom(), bloom: window.__lab.bloom() };
      },
      [s.id, s.sel]
    );
    if (!r?.room) { say(`  ${pad(String(s.label).slice(0, 44), 46)} ${pad("—", 4)} no local world to label`); continue; }
    R.s10[s.id] = r;
    const ok = r.room.p10 >= 12;
    say(
      `  ${pad(String(s.label).slice(0, 44), 46)} ${num(r.room.n, 4)} ${pad(n1(r.room.min), 8)} ${pad(n1(r.room.p10), 8)} ${pad(n1(r.room.median), 8)} ${pad(n1(r.room.max), 9)} ${ok ? "yes" : "not at 10px"}`
    );
  }
  await rest();
}

// ══ PERFORMANCE ═══════════════════════════════════════════════════════
if (want(12)) {
  say(`\n${"─".repeat(78)}\nPERFORMANCE — 60 fps target through open, hold, transfer and exit\n${"─".repeat(78)}`);
  R.perf = {};
  const dense = SUBJECTS.nodes.find((s) => s.kind === "transcript");
  const other = SUBJECTS.nodes.find((s) => s.kind === "source");
  const phases = [
    ["bloom open", async () => { await page.evaluate((i) => window.__lab.select(i), dense.id); await page.waitForTimeout(1400); }],
    ["bloom hold", async () => { await page.waitForTimeout(1800); }],
    ["transfer", async () => { await page.evaluate((i) => window.__lab.select(i), other.id); await page.waitForTimeout(1600); }],
    ["exit", async () => { await page.evaluate(() => window.__lab.select(null)); await page.waitForTimeout(2200); }],
    ["pan while bloomed", async () => {
      await page.evaluate((i) => window.__lab.select(i), dense.id);
      await page.waitForTimeout(900);
      await page.mouse.move(700, 450); await page.mouse.down();
      for (let i = 0; i < 26; i++) { await page.mouse.move(700 + i * 8, 450 + Math.sin(i / 3) * 22); await page.waitForTimeout(12); }
      await page.mouse.up();
    }],
  ];
  await rest();
  say(`  ${pad("phase", 20)} ${pad("median", 9)} ${pad("p95", 8)} ${pad("worst", 8)} ${pad(">50ms", 8)} frames`);
  for (const [name, act] of phases) {
    await page.evaluate(() => {
      window.__f = []; let last = performance.now();
      const t = (x) => { window.__f.push(x - last); last = x; window.__raf = requestAnimationFrame(t); };
      window.__raf = requestAnimationFrame(t);
    });
    await act();
    const f = await page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      const d = window.__f.slice(2).sort((a, b) => a - b);
      if (!d.length) return null;
      return { median: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), worst: +d[d.length - 1].toFixed(1), over50: d.filter((x) => x > 50).length, n: d.length };
    });
    R.perf[name] = f;
    say(`  ${pad(name, 20)} ${pad(f?.median + "ms", 9)} ${pad(f?.p95 + "ms", 8)} ${pad(f?.worst + "ms", 8)} ${pad(f?.over50, 8)} ${f?.n}`);
  }
  R.perf.tickCost = await page.evaluate(() => window.__lab.tickCost());
  R.perf.drawMs = await page.evaluate(() => window.__lab.drawMs());
  say(`  simulation tick ${R.perf.tickCost} ms · draw ${R.perf.drawMs} ms · 407 nodes, 480 relationships`);
  await rest();
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 1));
say(`\nwrote ${OUT}/results.json`);
if (errs.length) say(`PAGE ERRORS: ${errs.slice(0, 3).join(" | ")}`);
await browser.close();
