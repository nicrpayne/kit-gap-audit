// THE BAKE-OFF DRIVER — the same interactions, in the same order, against
// every prototype, with video.
//
// Nothing here is prototype-specific: each page exposes `window.__lab` and
// this file only ever talks to that. If a prototype cannot do something, it
// says so by not implementing it and the row reads "—" rather than being
// quietly skipped.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["p0", "pa", "pb", "pc"];
const OUT = process.env.OUT ?? "./out";
mkdirSync(`${OUT}/shots`, { recursive: true });
mkdirSync(`${OUT}/video`, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// MERGE, never overwrite: the battery is run in batches so no single run
// outlives its shell, and losing three prototypes' numbers to a fourth's
// re-run is not a result.
const RESULTS = `${OUT}/results.json`;
const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : {};

const settle = (p, ms) => p.waitForTimeout(ms);

async function waitReady(p, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(() => window.__lab?.ready?.() ?? false).catch(() => false)) return true;
    await p.waitForTimeout(200);
  }
  return false;
}

/** Frame stats around an interaction, measured in the page. */
async function frames(p, act) {
  await p.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const tick = (t) => { window.__f.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await act();
  return p.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    const ds = window.__f.slice(2).sort((a, b) => a - b);
    if (!ds.length) return null;
    return {
      median: +ds[Math.floor(ds.length / 2)].toFixed(1),
      p95: +ds[Math.floor(ds.length * 0.95)].toFixed(1),
      worst: +ds[ds.length - 1].toFixed(1),
      over50: ds.filter((d) => d > 50).length,
      n: ds.length,
    };
  });
}

const drag = (p, x = 700, y = 450) => async () => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 0; i < 28; i++) { await p.mouse.move(x + i * 8, y + Math.sin(i / 3) * 24); await p.waitForTimeout(12); }
  await p.mouse.up();
};
const wheel = (p) => async () => {
  await p.mouse.move(700, 450);
  for (let i = 0; i < 16; i++) { await p.mouse.wheel(0, -110); await p.waitForTimeout(26); }
};
const hover = (p) => async () => {
  for (let i = 0; i < 24; i++) { await p.mouse.move(480 + i * 14, 380 + Math.sin(i / 2) * 60); await p.waitForTimeout(18); }
};

/** A node of each kind that is actually on screen, so "select a Risk" means
    a Risk and not whatever happened to be first in the array. */
async function pickTargets(p) {
  return p.evaluate(() => {
    const ns = window.__lab.nodes();
    const find = (f) => ns.find(f)?.id ?? null;
    return {
      risk: find((n) => n.intelType === "risk"),
      decision: find((n) => n.intelType === "decision"),
      source: find((n) => n.kind === "transcript" || n.kind === "source"),
      passage: find((n) => n.kind === "passage"),
      hub: find((n) => (n.rad ?? 0) > 8 && n.kind !== "reality"),
    };
  });
}

for (const page of PAGES) {
 try {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: `${OUT}/video/${page}`, size: { width: 1400, height: 900 } },
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  const R = { page, errors: errs };

  await p.goto(`http://localhost:4400/${page}.html`, { waitUntil: "networkidle" });
  const ok = await waitReady(p);
  R.ready = ok;
  if (!ok) { R.note = "never reported ready"; results[page] = R; await ctx.close(); continue; }
  await settle(p, 1400);

  R.name = await p.evaluate(() => window.__lab.name);
  R.settleMs = Math.round(await p.evaluate(() => window.__lab.settleMs() ?? 0));
  await p.evaluate(() => window.__lab.fit());
  await settle(p, 700);
  await p.screenshot({ path: `${OUT}/shots/${page}-1-fit.png` });

  // ── SPATIAL QUALITY AT REST ───────────────────────────────────────
  R.metrics = await p.evaluate(() => window.__lab.metrics());
  const restPositions = await p.evaluate(() => [...window.__lab.positions()]);

  // ── POST-SETTLEMENT DRIFT ─────────────────────────────────────────
  // "How much does the graph move after apparent settlement" — the number
  // that decides whether a layout feels finished or merely slow.
  await settle(p, 2500);
  R.driftAfterSettle = await p.evaluate((before) => window.__lab.displacement(new Map(before), window.__lab.positions()), restPositions);

  // ── INTERACTION ───────────────────────────────────────────────────
  R.perf = {};
  R.perf.pan = await frames(p, drag(p));
  await p.evaluate(() => window.__lab.fit());
  await settle(p, 500);
  R.perf.zoom = await frames(p, wheel(p));
  await p.evaluate(() => window.__lab.fit());
  await settle(p, 500);
  R.perf.hover = await frames(p, hover(p));

  // ── LOCAL REHEATING, PER KIND ─────────────────────────────────────
  const targets = await pickTargets(p);
  R.targets = targets;
  R.reheat = {};
  for (const [kind, id] of Object.entries(targets)) {
    if (!id) { R.reheat[kind] = null; continue; }
    const before = await p.evaluate(() => [...window.__lab.positions()]);
    const f = await frames(p, async () => {
      await p.evaluate((i) => window.__lab.select(i), id);
      await p.waitForTimeout(1600);
    });
    const after = await p.evaluate(() => [...window.__lab.positions()]);
    // How far did the WHOLE field move, and how far did the selection move
    // from its own anchor? The first must be small (no global explosion),
    // the second small too (stays near its semantic seat).
    const moved = await p.evaluate(
      ([b, a, i]) => {
        const B = new Map(b), A = new Map(a);
        const all = window.__lab.displacement(B, A);
        const s = B.get(i) && A.get(i) ? Math.hypot(B.get(i).x - A.get(i).x, B.get(i).y - A.get(i).y) : null;
        return { field: all, selected: s == null ? null : +s.toFixed(2) };
      },
      [before, after, id]
    );
    R.reheat[kind] = { frames: f, ...moved };
    if (kind === "risk") await p.screenshot({ path: `${OUT}/shots/${page}-2-selected-risk.png` });
    if (kind === "source") await p.screenshot({ path: `${OUT}/shots/${page}-3-selected-source.png` });
    await p.evaluate(() => window.__lab.select(null));
    await p.waitForTimeout(900);
  }
  // Release: does it come back to a recognisable silhouette?
  await settle(p, 1500);
  R.afterRelease = await p.evaluate((before) => window.__lab.displacement(new Map(before), window.__lab.positions()), restPositions);

  // ── MORPH: RINGS → FORCE → RINGS ──────────────────────────────────
  const canMorph = await p.evaluate(() => {
    const src = String(window.__lab.setMode);
    return !/^\(\)\s*=>\s*\{\s*\}$/.test(src.replace(/\s+/g, " ").trim());
  });
  R.canMorph = canMorph;
  if (canMorph) {
    const before = await p.evaluate(() => [...window.__lab.positions()]);
    R.perf.morph = await frames(p, async () => {
      await p.evaluate(() => window.__lab.setMode("force"));
      await p.waitForTimeout(3200);
    });
    await p.evaluate(() => window.__lab.fit());
    await settle(p, 600);
    await p.screenshot({ path: `${OUT}/shots/${page}-4-force-mode.png` });
    await p.evaluate(() => window.__lab.setMode("circle"));
    await settle(p, 3000);
    await p.evaluate(() => window.__lab.fit());
    await settle(p, 500);
    await p.screenshot({ path: `${OUT}/shots/${page}-5-circle-mode.png` });
    await p.evaluate(() => window.__lab.setMode("rings"));
    await settle(p, 3400);
    await p.evaluate(() => window.__lab.fit());
    await settle(p, 700);
    await p.screenshot({ path: `${OUT}/shots/${page}-6-back-to-rings.png` });
    // SPATIAL MEMORY across the round trip: did the world come back?
    R.morphReturn = await p.evaluate((b) => window.__lab.displacement(new Map(b), window.__lab.positions()), before);
  }

  // ── SPATIAL MEMORY ACROSS A RELOAD ────────────────────────────────
  const firstRun = await p.evaluate(() => [...window.__lab.positions()]);
  await p.reload({ waitUntil: "networkidle" });
  await waitReady(p);
  await settle(p, 2200);
  R.reloadDrift = await p.evaluate((b) => window.__lab.displacement(new Map(b), window.__lab.positions()), firstRun);

  R.errors = errs.slice(0, 3);
  results[page] = R;
  console.log(`${page.padEnd(3)} settle ${String(R.settleMs).padStart(5)}ms · pan ${R.perf.pan?.median}ms · overlap ${R.metrics.overlap.pairs} · sector ${R.metrics.sector.inside}/${R.metrics.sector.checked} · reload drift ${R.reloadDrift.mean}`);
  await ctx.close();
 } catch (e) {
  // A prototype that falls over is a RESULT, not a reason to lose the run.
  results[page] = { ...(results[page] ?? { page }), crashed: String(e.message ?? e).split("\n")[0].slice(0, 160) };
  console.log(`${page.padEnd(3)} CRASHED — ${results[page].crashed}`);
 }
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log(`\nwrote ${OUT}/results.json`);
await browser.close();
