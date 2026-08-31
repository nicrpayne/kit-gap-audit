// THE BAKE-OFF HARNESS — one measuring rig, four engines.
//
// The point of this file is that every prototype is judged on the SAME
// things, drawn the SAME way, and instrumented through the SAME interface.
// The brief's rule is explicit: we are comparing layout quality, physics,
// interaction and performance, NOT styling. So the palette, the node radii,
// the edge weights and the camera all live here, and each prototype supplies
// only the thing that makes it different — where the nodes end up and how
// they get there.

export const PALETTE = {
  bg: "#0a0d10",
  panel: "#11161b",
  text: "#e6edf3",
  soft: "#8b98a5",
  faint: "#4a5560",
  border: "#1e262e",
  signal: "#58a6cc",
  reality: "#3fd0d6",
  source: "#58a6cc",
  silver: "#b9c6cf",
  risk: "#e0806c",
  decision: "#a68ce0",
  dependency: "#e0b46c",
  commitment: "#6cd6a8",
  unknown: "#7c8ce0",
  observation: "#6b7278",
  climate: "#6b7278",
};

/** The functional colour Signal already uses, resolved to hex so every
    prototype paints identically without importing the app's CSS tokens. */
export function colorOf(n) {
  if (n.kind === "reality") return PALETTE.reality;
  if (n.kind === "intel") {
    const t = String(n.intelType ?? "").toLowerCase();
    if (t.includes("risk")) return PALETTE.risk;
    if (t.includes("decision")) return PALETTE.decision;
    if (t.includes("dependency")) return PALETTE.dependency;
    if (t.includes("commitment")) return PALETTE.commitment;
    if (t.includes("unknown")) return PALETTE.unknown;
    return PALETTE.observation;
  }
  if (n.kind === "passage") return PALETTE.silver;
  if (["source", "transcript", "notion_page", "figma_artifact"].includes(n.kind)) return PALETTE.source;
  if (n.kind === "lane") return PALETTE.faint;
  return PALETTE.soft;
}

/** Which relationships are worth a physical spring.
    §PROTOTYPE B: semantic, temporal, provenance where useful. Contextual
    (`related_to`, 61 of 480 here) and membership are excluded — they are
    bookkeeping, and letting them pull would drag the whole outer band into
    the middle. */
export const LINK_CLASSES = new Set(["semantic", "temporal", "provenance"]);
export function linkStrengthFor(e) {
  if (e.cls === "semantic") return 0.55;
  if (e.cls === "temporal") return 0.4;
  if (e.cls === "provenance") return 0.22; // 367 of 480; strong would dominate
  return 0;
}

/**
 * VARIABLE NODE MASS — visualization only.
 *
 * §VARIABLE NODE MASS TEST: from aggregate member count or display
 * importance, never raw degree, and never implying truth or confidence.
 * Nonlinear and capped, so a 59-member group is bigger than a 4-member one
 * without being fifteen times the area.
 */
export function radiusOf(n, importance) {
  const base = n.r ?? 5;
  if (!importance) return base;
  const imp = importance.get(n.id) ?? 0;
  // cube-root, capped at 1.9x. A hub reads as a hub; nothing becomes a moon.
  const k = Math.min(1.9, 1 + 0.55 * Math.cbrt(Math.max(0, imp)));
  return base * k;
}

/** Display importance = how many things this node holds or grounds.
    A source artifact's passages; an aggregate's members. NOT degree. */
export function importanceOf(data) {
  const imp = new Map();
  for (const a of data.aggregates) {
    if (a.hub) imp.set(a.hub, (imp.get(a.hub) ?? 0) + a.count);
  }
  return imp;
}

// ── CAMERA ───────────────────────────────────────────────────────────
//
// One camera for every prototype that draws its own canvas, so pan/zoom
// latency is a property of the engine's redraw rather than of four different
// camera implementations.
export function makeCamera(canvas, onChange) {
  const cam = { x: 0, y: 0, k: 1 };
  let drag = null;
  const world = (ev) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left - r.width / 2) / cam.k + cam.x,
      y: (ev.clientY - r.top - r.height / 2) / cam.k + cam.y,
    };
  };
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const before = world(ev);
    cam.k = Math.max(0.15, Math.min(8, cam.k * Math.pow(1.0016, -ev.deltaY)));
    const after = world(ev);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    onChange?.();
  }, { passive: false });
  canvas.addEventListener("pointerdown", (ev) => {
    drag = { sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y, w: world(ev), moved: false };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3) drag.moved = true;
    if (!drag.node) {
      cam.x = drag.cx - (ev.clientX - drag.sx) / cam.k;
      cam.y = drag.cy - (ev.clientY - drag.sy) / cam.k;
      onChange?.();
    }
  });
  canvas.addEventListener("pointerup", (ev) => {
    canvas.releasePointerCapture(ev.pointerId);
    drag = null;
  });
  cam.fit = (bounds, vp, margin = 0.1) => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    cam.k = Math.min(vp.w / (w * (1 + margin * 2)), vp.h / (h * (1 + margin * 2)));
    cam.x = (bounds.minX + bounds.maxX) / 2;
    cam.y = (bounds.minY + bounds.maxY) / 2;
    onChange?.();
  };
  cam.worldOf = world;
  return cam;
}

export function boundsOf(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - (n.rad ?? n.r ?? 4));
    minY = Math.min(minY, n.y - (n.rad ?? n.r ?? 4));
    maxX = Math.max(maxX, n.x + (n.rad ?? n.r ?? 4));
    maxY = Math.max(maxY, n.y + (n.rad ?? n.r ?? 4));
  }
  return { minX, minY, maxX, maxY };
}

// ── DETERMINISM ──────────────────────────────────────────────────────
//
// d3-force is deterministic in its integrator but NOT in `forceCollide`,
// which calls Math.random() to jiggle coincident points apart, and not in
// its own initial placement when a node has no x/y. Both are replaced here
// with a seeded generator so "the same graph returns to the same world" is a
// property we can actually assert rather than hope for.
//
// This is a real finding, not a workaround: any engine adopted has to be
// pinned this way or spatial memory is luck.
export function seedRandom(seed = 0x5f3759df) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export function pinRandom(seed) {
  const rng = seedRandom(seed);
  const real = Math.random;
  Math.random = rng;
  return () => { Math.random = real; };
}

// ── MEASUREMENT ──────────────────────────────────────────────────────
//
// Everything the bake-off asks for, gathered the same way in every
// prototype: frame cost, settle time, post-settle drift, occupancy,
// crowding, edge crossings.
export function makeMeter() {
  const frames = [];
  let last = performance.now();
  let raf = null;
  return {
    start() {
      frames.length = 0;
      last = performance.now();
      const tick = (t) => { frames.push(t - last); last = t; raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      const ds = frames.slice(2).sort((a, b) => a - b);
      if (!ds.length) return { n: 0 };
      return {
        n: ds.length,
        median: +ds[Math.floor(ds.length / 2)].toFixed(1),
        p95: +ds[Math.floor(ds.length * 0.95)].toFixed(1),
        worst: +ds[ds.length - 1].toFixed(1),
        over50: ds.filter((d) => d > 50).length,
      };
    },
  };
}

/** How much of the frame the drawing actually costs, sampled. */
export function timed(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// ── SPATIAL QUALITY ──────────────────────────────────────────────────

/** Pairs whose drawn bodies intersect. The overlap/collision assessment. */
export function overlapStats(nodes) {
  let pairs = 0;
  let worst = 0;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      const ra = a.rad ?? a.r ?? 4, rb = b.rad ?? b.r ?? 4;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const pen = ra + rb - d;
      if (pen > 0.5) { pairs++; worst = Math.max(worst, pen); }
    }
  }
  return { pairs, worst: +worst.toFixed(2) };
}

/** Nearest-neighbour distances — "local breathing room". */
export function spacingStats(nodes) {
  const d = [];
  for (let i = 0; i < nodes.length; i++) {
    let min = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dd = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dd < min) min = dd;
    }
    if (Number.isFinite(min)) d.push(min);
  }
  d.sort((a, b) => a - b);
  return {
    min: +d[0].toFixed(2),
    p10: +d[Math.floor(d.length * 0.1)].toFixed(2),
    median: +d[Math.floor(d.length / 2)].toFixed(2),
    mean: +(d.reduce((s, x) => s + x, 0) / d.length).toFixed(2),
  };
}

/**
 * EMPTY SPACE. Occupancy on a coarse grid over the field's bounding box:
 * what fraction of cells hold at least one node. The reference uses negative
 * space well, and "fills every pixel" is the failure this measures.
 */
export function occupancy(nodes, cells = 48) {
  const b = boundsOf(nodes);
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  const grid = new Set();
  for (const n of nodes) {
    const cx = Math.min(cells - 1, Math.floor(((n.x - b.minX) / w) * cells));
    const cy = Math.min(cells - 1, Math.floor(((n.y - b.minY) / h) * cells));
    grid.add(cy * cells + cx);
  }
  return {
    occupied: grid.size,
    cells: cells * cells,
    pct: +((grid.size / (cells * cells)) * 100).toFixed(1),
    aspect: +(w / h).toFixed(2),
    extent: `${Math.round(w)}×${Math.round(h)}`,
  };
}

/** Straight-line edge crossings, sampled — the crowding number that most
    predicts whether a reader can follow a relationship. */
export function crossings(nodes, edges, sample = 900) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const segs = [];
  for (const e of edges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (a && b) segs.push([a.x, a.y, b.x, b.y]);
  }
  const use = segs.length > sample ? segs.filter((_, i) => i % Math.ceil(segs.length / sample) === 0) : segs;
  const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  let n = 0;
  for (let i = 0; i < use.length; i++) {
    for (let j = i + 1; j < use.length; j++) {
      const [a, b, c, d] = use[i], [p, q, r, s] = use[j];
      if (ccw(a, b, p, q, r, s) !== ccw(c, d, p, q, r, s) && ccw(a, b, c, d, p, q) !== ccw(a, b, c, d, r, s)) n++;
    }
  }
  return { crossings: n, of: use.length, scaled: Math.round(n * Math.pow(segs.length / (use.length || 1), 2)) };
}

/** Mean and max displacement between two position maps — spatial memory. */
export function displacement(before, after) {
  const ds = [];
  for (const [id, p] of before) {
    const q = after.get(id);
    if (q) ds.push(Math.hypot(p.x - q.x, p.y - q.y));
  }
  ds.sort((a, b) => a - b);
  return {
    n: ds.length,
    mean: +(ds.reduce((s, x) => s + x, 0) / (ds.length || 1)).toFixed(2),
    median: +(ds[Math.floor(ds.length / 2)] ?? 0).toFixed(2),
    p95: +(ds[Math.floor(ds.length * 0.95)] ?? 0).toFixed(2),
    max: +(ds[ds.length - 1] ?? 0).toFixed(2),
  };
}

/** Did a node stay inside the sector its semantics assign it to? */
export function sectorFidelity(nodes, clusters, field) {
  const SECTOR = 360 / clusters.length;
  let checked = 0, outside = 0, worst = 0;
  for (const n of nodes) {
    if (!n.lane || n.slice === "core") continue;
    const i = clusters.indexOf(n.lane);
    if (i < 0) continue;
    checked++;
    const base = -90 + i * SECTOR;
    const a = (Math.atan2(n.y - field.cy, n.x - field.cx) * 180) / Math.PI;
    let d = (((a - base + 540) % 360) - 180);
    if (Math.abs(d) > SECTOR / 2) { outside++; worst = Math.max(worst, Math.abs(d) - SECTOR / 2); }
  }
  return { checked, inside: checked - outside, outside, worstDeg: +worst.toFixed(1) };
}

export async function loadGraph() {
  const res = await fetch("./graph.json");
  return res.json();
}
