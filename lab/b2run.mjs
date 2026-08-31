// B2 — THE REFERENCE TASKS, MEASURED AND RECORDED.
//
// §16's ten rhythms, in order, against each variant, with video. Every
// number in §17 comes from this file so the three variants are compared on
// identical work.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

const OUT = process.env.OUT ?? "./b2out";
const VARIANTS = process.argv.slice(2).length ? process.argv.slice(2) : ["a", "b", "c"];
mkdirSync(`${OUT}/shots`, { recursive: true });
mkdirSync(`${OUT}/video`, { recursive: true });
const RES = `${OUT}/results.json`;
const results = existsSync(RES) ? JSON.parse(readFileSync(RES, "utf8")) : {};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function frames(p, act) {
  await p.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const t = (x) => { window.__f.push(x - last); last = x; window.__raf = requestAnimationFrame(t); };
    window.__raf = requestAnimationFrame(t);
  });
  await act();
  return p.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    const d = window.__f.slice(2).sort((a, b) => a - b);
    if (!d.length) return null;
    return { median: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), over50: d.filter((x) => x > 50).length, n: d.length };
  });
}
const pos = (p) => p.evaluate(() => [...window.__lab.positions()]);
const disp = (p, before, ids) =>
  p.evaluate(([b, only]) => {
    const B = new Map(b);
    const A = window.__lab.positions();
    const ds = [];
    for (const [id, q] of B) {
      if (only && !only.includes(id)) continue;
      const r = A.get(id);
      if (r) ds.push(Math.hypot(q.x - r.x, q.y - r.y));
    }
    ds.sort((x, y) => x - y);
    return { n: ds.length, mean: +((ds.reduce((s, x) => s + x, 0) / (ds.length || 1)).toFixed(2)), p95: +(ds[Math.floor(ds.length * 0.95)] ?? 0).toFixed(2), max: +(ds[ds.length - 1] ?? 0).toFixed(2) };
  }, [before, ids ?? null]);

function quality(p) {
  return p.evaluate(() => {
    const ns = window.__lab.nodes();
    let pairs = 0, worst = 0;
    const d = [];
    for (let i = 0; i < ns.length; i++) {
      let min = Infinity;
      for (let j = 0; j < ns.length; j++) {
        if (i === j) continue;
        const dd = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y);
        if (dd < min) min = dd;
        if (j > i) {
          const pen = ns[i].rad + ns[j].rad - dd;
          if (pen > 0.5) { pairs++; worst = Math.max(worst, pen); }
        }
      }
      if (Number.isFinite(min)) d.push(min);
    }
    d.sort((a, b) => a - b);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ns) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const cells = 48, grid = new Set();
    const w = maxX - minX || 1, h = maxY - minY || 1;
    for (const n of ns) grid.add(Math.floor(((n.y - minY) / h) * (cells - 1)) * cells + Math.floor(((n.x - minX) / w) * (cells - 1)));
    // sector fidelity against Signal's own geography
    const CL = window.__labData?.clusters;
    return {
      overlap: { pairs, worst: +worst.toFixed(2) },
      spacing: { min: +d[0].toFixed(2), p10: +d[Math.floor(d.length * 0.1)].toFixed(2), median: +d[Math.floor(d.length / 2)].toFixed(2) },
      occupancy: { pct: +((grid.size / (cells * cells)) * 100).toFixed(1), extent: `${Math.round(w)}×${Math.round(h)}` },
      groups: window.__lab.groupSeparation(),
    };
  });
}

for (const v of VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: `${OUT}/video/b2-${v}`, size: { width: 1400, height: 900 } } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 130)));
  const R = { variant: v };

  await p.goto(`http://localhost:4400/pb2.html?v=${v}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1800);
  R.name = await p.evaluate(() => window.__lab.name);
  R.settleMs = Math.round(await p.evaluate(() => window.__lab.settleMs()));
  R.tickCost = await p.evaluate(() => window.__lab.tickCost());

  // 1. CALM RINGS WHOLE-WORLD
  await p.evaluate(() => window.__lab.fit());
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/shots/b2${v}-01-rings.png` });
  R.rings = await quality(p);
  const ringsRest = await pos(p);
  await p.waitForTimeout(2200);
  R.driftAfterSettle = await disp(p, ringsRest);

  const targets = await p.evaluate(() => {
    const ns = window.__lab.nodes();
    const f = (fn) => ns.find(fn)?.id ?? null;
    return {
      risk: f((n) => n.intelType === "risk"),
      decision: f((n) => n.intelType === "decision"),
      source: f((n) => n.kind === "transcript"),
      passage: f((n) => n.kind === "passage"),
      hub: f((n) => n.rad > 7 && n.kind !== "reality"),
    };
  });
  R.targets = targets;

  // 2. HOVER A POPULATION — must be nearly free
  R.hover = await frames(p, async () => {
    for (let i = 0; i < 26; i++) { await p.mouse.move(430 + i * 16, 330 + Math.sin(i / 2) * 80); await p.waitForTimeout(16); }
  });
  R.hoverLatency = await p.evaluate((id) => {
    const t0 = performance.now();
    window.__lab.hover(id);
    return +(performance.now() - t0).toFixed(3);
  }, targets.risk);

  // 3/4. SELECT A POPULATION → LOCAL BLOOM
  R.reheat = {};
  for (const [kind, id] of Object.entries(targets)) {
    if (!id) { R.reheat[kind] = null; continue; }
    const before = await pos(p);
    const nb = await p.evaluate((i) => { window.__lab.select(i); return null; }, id);
    const f = await frames(p, () => p.waitForTimeout(1500));
    const local = await p.evaluate((i) => {
      const ns = window.__lab.nodes();
      const sel = ns.find((n) => n.id === i);
      return { sel: sel ? [sel.x, sel.y] : null };
    }, id);
    // Background = every node that is NOT pinned-released. Approximated by
    // "everything outside the selection's group", which is what a reader
    // perceives as background.
    const split = await p.evaluate(([b, i]) => {
      const B = new Map(b);
      const A = window.__lab.positions();
      const ns = window.__lab.nodes();
      const gs = window.__lab.groups();
      const sel = ns.find((n) => n.id === i);
      let selMove = 0;
      const near = [], far = [];
      for (const [id, q] of B) {
        const r = A.get(id);
        if (!r) continue;
        const d = Math.hypot(q.x - r.x, q.y - r.y);
        if (id === i) { selMove = d; continue; }
        // "near" = within 140 world units of the selection at rest
        const dist = sel ? Math.hypot(q.x - sel.x, q.y - sel.y) : 1e9;
        (dist < 140 ? near : far).push(d);
      }
      const mean = (a) => +(a.reduce((s, x) => s + x, 0) / (a.length || 1)).toFixed(2);
      const mx = (a) => +Math.max(0, ...a).toFixed(2);
      return { selected: +selMove.toFixed(2), neighbourMean: mean(near), neighbourMax: mx(near), backgroundMean: mean(far), backgroundMax: mx(far), nNear: near.length, nFar: far.length };
    }, [before, id]);
    R.reheat[kind] = { frames: f, ...split };
    if (kind === "risk") await p.screenshot({ path: `${OUT}/shots/b2${v}-02-selected-risk.png` });
    if (kind === "source") await p.screenshot({ path: `${OUT}/shots/b2${v}-03-selected-source.png` });
    await p.evaluate(() => window.__lab.select(null));
    await p.waitForTimeout(1000);
  }
  R.afterRelease = await disp(p, ringsRest);

  // 6/9. TRANSFER, THEN RAPID RETARGETING MID-MOTION
  const chain = [targets.risk, targets.decision, targets.source, targets.passage].filter(Boolean);
  R.retarget = await frames(p, async () => {
    for (const id of chain) {
      await p.evaluate((i) => window.__lab.select(i), id);
      await p.waitForTimeout(220); // deliberately BEFORE the previous settles
    }
    await p.waitForTimeout(1200);
  });
  // Continuity: a redirect must never zero velocity. Sampled mid-chain.
  R.retargetContinuity = await p.evaluate(async (ids) => {
    const speed = () => {
      const ns = window.__lab.nodes();
      let s = 0, n = 0;
      for (const x of ns) if (x.fx == null && Number.isFinite(x.vx)) { s += Math.hypot(x.vx, x.vy); n++; }
      return +(s / (n || 1)).toFixed(4);
    };
    const out = [];
    for (const i of ids) {
      window.__lab.select(i);
      await new Promise((r) => setTimeout(r, 120));
      out.push(speed());
    }
    return { speeds: out, anyZero: out.some((x) => x === 0) };
  }, chain);
  await p.screenshot({ path: `${OUT}/shots/b2${v}-04-retarget.png` });
  await p.evaluate(() => window.__lab.select(null));
  await p.waitForTimeout(1200);

  // 8. RINGS → CONSTELLATIONS → RINGS
  const beforeMorph = await pos(p);
  R.morph = await frames(p, async () => {
    await p.evaluate(() => window.__lab.setMode("constellations"));
    await p.waitForTimeout(5200);
  });
  await p.evaluate(() => window.__lab.fit());
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/shots/b2${v}-05-constellations.png` });
  R.constellations = await quality(p);
  await p.evaluate(() => window.__lab.setMode("rings"));
  await p.waitForTimeout(5200);
  await p.evaluate(() => window.__lab.fit());
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/shots/b2${v}-06-back-to-rings.png` });
  R.morphRoundTrip = await disp(p, beforeMorph);

  // 10. DRAG / RELEASE
  const dragPt = await p.evaluate((id) => {
    const ns = window.__lab.nodes();
    const n = ns.find((x) => x.id === id);
    return n ? { x: n.x, y: n.y } : null;
  }, targets.hub);
  if (dragPt) {
    const before = await pos(p);
    R.drag = await frames(p, async () => {
      const box = await p.locator("#c").boundingBox();
      await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
      await p.mouse.down();
      for (let i = 0; i < 22; i++) { await p.mouse.move(box.x + box.width * 0.4 + i * 7, box.y + box.height * 0.45 - i * 4); await p.waitForTimeout(14); }
      await p.mouse.up();
      await p.waitForTimeout(1400);
    });
    await p.screenshot({ path: `${OUT}/shots/b2${v}-07-after-drag.png` });
    R.dragSettle = await disp(p, before);
  }

  // 7. RETURN TO WHOLE
  await p.evaluate(() => { window.__lab.select(null); window.__lab.fit(); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/shots/b2${v}-08-return.png` });
  R.pan = await frames(p, async () => {
    const box = await p.locator("#c").boundingBox();
    await p.mouse.move(box.x + 500, box.y + 420);
    await p.mouse.down();
    for (let i = 0; i < 26; i++) { await p.mouse.move(box.x + 500 + i * 8, box.y + 420 + Math.sin(i / 3) * 22); await p.waitForTimeout(12); }
    await p.mouse.up();
  });

  R.errors = errs.slice(0, 3);
  results[`b2-${v}`] = R;
  writeFileSync(RES, JSON.stringify(results, null, 1));
  console.log(
    `b2-${v}  settle ${R.settleMs}ms · tick ${R.tickCost}ms · overlap ${R.rings.overlap.pairs}/${R.constellations?.overlap.pairs} · ` +
      `cellGap ${R.rings.groups.minGap}/${R.constellations?.groups.minGap} · bg move ${R.reheat.risk?.backgroundMean} · ` +
      `retarget zero-velocity ${R.retargetContinuity.anyZero} · morph rt ${R.morphRoundTrip.mean}`
  );
  await ctx.close();
}
console.log(`\nwrote ${RES}`);
await browser.close();
