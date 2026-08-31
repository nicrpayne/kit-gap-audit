// PROTOTYPE B — ANCHORED d3-FORCE.
//
// THE HYPOTHESIS: Signal's semantics already decide WHERE a node belongs —
// which sector, which radius, which neighbourhood. Today those are hard x/y
// seats, computed by a shelf-packer, and the result is unmistakably shelved.
// The bet is that turning exactly those three facts into SOFT forces keeps
// every semantic guarantee while letting collision and real relationships
// decide the last few units — "stable global topology, elastic local
// geometry", which is the brief's own target.
//
// WHAT IS A FORCE HERE, AND WHAT IS NOT:
//
//   forceRadial      the RING. A node's target radius is Signal's own, so
//                    the semantic bands survive; strength is what decides
//                    whether they read as rings or as suggestions.
//   sector           the TERRITORY. A custom force with no d3 equivalent: it
//                    does nothing while a node is inside its own wedge and
//                    pulls tangentially the moment it leaves. This is what
//                    makes "membership is position" survive physics.
//   forceX/forceY    the NEIGHBOURHOOD. Weak, toward the node's Signal seat.
//                    Not to reproduce the seat — at this strength it cannot —
//                    but so that a node's angular company stays its company.
//   forceCollide     the BREATHING ROOM, and the only strong force here.
//   forceLink        MEANING. Semantic and temporal at real strength,
//                    provenance weak (367 of 480 edges — at full strength it
//                    is the only thing the layout expresses), contextual and
//                    membership excluded entirely.
//   forceManyBody    a weak, distance-capped repulsion so dense regions open
//                    up locally without the field inflating globally.

import * as d3 from "d3-force";
import { loadGraph, makeCamera, boundsOf, makeMeter, colorOf, importanceOf, radiusOf, LINK_CLASSES, linkStrengthFor, pinRandom, overlapStats, spacingStats, occupancy, crossings, displacement, sectorFidelity } from "./harness.js";
import { drawScene, pick } from "./render.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
let size = { w: 0, h: 0 };

const data = await loadGraph();
const CLUSTERS = data.clusters;
const SECTOR = 360 / CLUSTERS.length;
const FIELD = data.field;
const RAD = Math.PI / 180;

const importance = importanceOf(data);
// Variable mass is a MODE, not a default: the test is whether it improves
// the cellular rhythm, so it has to be switchable with everything else held.
let variableMass = true;

const nodes = data.nodes.map((n) => ({
  ...n,
  // Every node starts at its exact Signal seat. Nothing is randomly placed,
  // which is half of why this is reproducible.
  x: n.x,
  y: n.y,
  seatX: n.x,
  seatY: n.y,
  targetR: n.radius,
  sector: n.lane ? CLUSTERS.indexOf(n.lane) : -1,
  rad: radiusOf(n, variableMass ? importance : null),
  _color: colorOf(n),
}));
const byId = new Map(nodes.map((n) => [n.id, n]));

const links = data.edges
  .filter((e) => LINK_CLASSES.has(e.cls) && byId.has(e.source) && byId.has(e.target))
  .map((e) => ({ ...e, source: e.source, target: e.target }));
const edges = data.edges.map((e) => ({ ...e, _s: byId.get(e.source), _t: byId.get(e.target) }));

/**
 * THE SECTOR FORCE. d3 has no equivalent, and it is the one force that makes
 * this prototype legal under Signal's laws: membership is stated by position,
 * so a node that drifts into the neighbouring wedge has silently changed what
 * it belongs to. Inside its wedge this does nothing at all — that is the
 * "elastic local geometry" half. Outside, it pulls back along the arc, hard
 * enough to be a wall and soft enough not to ring.
 */
function forceSector(strength = 0.6, slack = 0.5) {
  let ns;
  function force(alpha) {
    for (const n of ns) {
      if (n.sector < 0 || n.slice === "core") continue;
      const dx = n.x - FIELD.cx, dy = n.y - FIELD.cy;
      const r = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx) / RAD;
      const base = -90 + n.sector * SECTOR;
      let d = ((a - base + 540) % 360) - 180;
      const half = SECTOR / 2 - slack;
      if (Math.abs(d) <= half) continue;
      const over = (Math.abs(d) - half) * Math.sign(d);
      // Move along the tangent by the angular overshoot, scaled by alpha.
      const want = (base + (half * Math.sign(d))) * RAD;
      const tx = FIELD.cx + Math.cos(want) * r;
      const ty = FIELD.cy + Math.sin(want) * r;
      const k = strength * alpha * Math.min(1, Math.abs(over) / 8);
      n.vx += (tx - n.x) * k;
      n.vy += (ty - n.y) * k;
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

/**
 * THE GROUP FORCE — the piece rings-plus-collision does not give you.
 *
 * Measured without it: sectors held, overlap went to zero, crossings fell
 * 30% — and Signal's typed groups DISSOLVED. Hermes holds risk, commitment,
 * unknown, observation and climate in ONE sector, so a sector constraint has
 * nothing to say about keeping the 24 commitments together. Coral, violet
 * and mint ended up interleaved, and "Observation 59" stopped being a thing
 * you could see.
 *
 * That is the single most important result of this bake-off: the reference's
 * cellular look is not rings plus collision, it is GROUPS. AntV G6 ships this
 * as ComboCombined; in d3 it is fifteen lines — pull each member toward its
 * group's live centroid, and push group centroids apart so the cells
 * separate rather than merge.
 *
 * Aggregates come straight from Signal's own `constellations()`, so group
 * membership is never reinterpreted by the physics: the engine is told what
 * the groups are, it does not discover them.
 */
function forceGroup(cohesion = 0.09, separation = 0.5) {
  let ns;
  const groups = new Map();
  for (const a of data.aggregates) {
    const ids = new Set(a.members);
    if (a.hub) ids.add(a.hub);
    groups.set(a.id, { ids, cx: a.x, cy: a.y, n: 0, count: a.count });
  }
  const groupOf = new Map();
  for (const [gid, g] of groups) for (const id of g.ids) groupOf.set(id, gid);

  function force(alpha) {
    // Live centroids — the cell follows its members rather than a stored seat.
    for (const g of groups.values()) { g.sx = 0; g.sy = 0; g.n = 0; }
    for (const n of ns) {
      const g = groups.get(groupOf.get(n.id));
      if (!g) continue;
      g.sx += n.x; g.sy += n.y; g.n++;
    }
    for (const g of groups.values()) if (g.n) { g.cx = g.sx / g.n; g.cy = g.sy / g.n; }

    // Cohesion: members toward their own cell.
    const k = cohesion * alpha;
    for (const n of ns) {
      const g = groups.get(groupOf.get(n.id));
      if (!g || !g.n) continue;
      n.vx += (g.cx - n.x) * k;
      n.vy += (g.cy - n.y) * k;
    }

    // Separation: cells push each other apart, so two populations in one
    // sector become two cells rather than one smear. Radius grows with
    // sqrt(count), matching the area a phyllotaxis disc of that size needs.
    const gs = [...groups.values()].filter((g) => g.n);
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j];
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        const d = Math.hypot(dx, dy) || 1e-6;
        const want = 7 * (Math.sqrt(a.count) + Math.sqrt(b.count));
        if (d >= want) continue;
        const push = ((want - d) / d) * separation * alpha * 0.5;
        const fx = dx * push, fy = dy * push;
        for (const n of ns) {
          const gid = groupOf.get(n.id);
          if (gid === undefined) continue;
          if (groups.get(gid) === a) { n.vx -= fx; n.vy -= fy; }
          else if (groups.get(gid) === b) { n.vx += fx; n.vy += fy; }
        }
      }
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

// ── THE THREE LAYOUTS, AS PARAMETER SETS ────────────────────────────
//
// §MULTI-LAYOUT MORPH TEST: RINGS → FORCE → RINGS with the same node
// identities, no remount, no teleport. They are the same simulation with
// different force strengths, which is why the morph can be continuous.
const MODES = {
  rings: { radial: 0.5, anchor: 0.08, sector: 0.9, link: 0.35, charge: -7, collide: 0.9, group: 0.14, label: "RINGS — semantic manifold" },
  force: { radial: 0.08, anchor: 0.01, sector: 0.35, link: 1.0, charge: -30, collide: 1.0, group: 0.05, label: "FORCE — constellations" },
  circle: { radial: 0.9, anchor: 0.0, sector: 0.95, link: 0.15, charge: -4, collide: 0.9, group: 0.02, label: "CIRCLE — one ring per region" },
};
let mode = "rings";
let P = MODES[mode];

const restore = pinRandom(0xC0FFEE);

const sim = d3
  .forceSimulation(nodes)
  .force("radial", d3.forceRadial((n) => (mode === "circle" ? circleRadius(n) : n.targetR), FIELD.cx, FIELD.cy).strength(() => P.radial))
  .force("sector", forceSector(P.sector))
  .force("group", forceGroup(MODES.rings.group))
  .force("ax", d3.forceX((n) => n.seatX).strength(() => P.anchor))
  .force("ay", d3.forceY((n) => n.seatY).strength(() => P.anchor))
  .force("charge", d3.forceManyBody().strength(() => P.charge).distanceMax(90))
  // A NUMBER, NOT AN ACCESSOR — and this is a real finding about d3-force
  // rather than a detail. `forceCollide.strength()` is the ONE force whose
  // strength must be a scalar; forceRadial, forceX/Y, forceManyBody and
  // forceLink all take accessors. Handing collide a function does not throw:
  // it multiplies by the function object, and 331 of 407 nodes silently
  // become NaN while the simulation reports a healthy cooling alpha. Nothing
  // in the type system or the console says a word.
  .force("collide", d3.forceCollide((n) => n.rad + 2.5).strength(MODES.rings.collide).iterations(2))
  .force(
    "link",
    d3
      .forceLink(links)
      .id((n) => n.id)
      .distance((e) => (e.cls === "provenance" ? 26 : 46))
      .strength((e) => linkStrengthFor(e) * P.link)
  )
  .alphaDecay(0.022)
  .velocityDecay(0.42);

/** CIRCLE mode: one ring per semantic region, all regions concentric on the
    same few radii, so the reader can compare populations by arc length. */
function circleRadius(n) {
  if (n.slice === "core") return 0;
  const order = ["evidence", "hermes", "linear", "decisions", "dependencies", "capacity", "notion", "figma"];
  const i = Math.max(0, order.indexOf(n.lane));
  return 120 + i * 74;
}

/**
 * AND THE PROJECTION STEP — the finding this prototype exists to produce.
 *
 * Measured with the sector FORCE alone, 64 of 392 nodes ended up outside
 * their own wedge, the worst by 10.6°. That is not a tuning failure, it is a
 * category error: a force expresses a PREFERENCE, and Signal's membership
 * law is an INVARIANT. "This object belongs to Evidence" cannot be
 * three-quarters true, and a layout that states membership by position
 * cannot express it with something a strong enough spring can overrule.
 *
 * So the wedge is enforced as a CONSTRAINT, applied after the integrator:
 * any node past its boundary is projected back onto it at the same radius.
 * Inside the wedge nothing happens at all, which leaves the elastic local
 * geometry entirely intact — the physics gets the whole interior, and the
 * boundary is not negotiable.
 *
 * This is the shape any adopted engine has to support: forces for what we
 * prefer, projection for what we guarantee.
 */
function projectSectors() {
  for (const n of nodes) {
    if (n.sector < 0 || n.slice === "core" || n.kind === "reality") continue;
    const dx = n.x - FIELD.cx, dy = n.y - FIELD.cy;
    const r = Math.hypot(dx, dy);
    if (r < 1e-6) continue;
    const a = Math.atan2(dy, dx) / RAD;
    const base = -90 + n.sector * SECTOR;
    const d = ((a - base + 540) % 360) - 180;
    const half = SECTOR / 2 - 0.4;
    if (Math.abs(d) <= half) continue;
    const want = (base + half * Math.sign(d)) * RAD;
    n.x = FIELD.cx + Math.cos(want) * r;
    n.y = FIELD.cy + Math.sin(want) * r;
    // Kill the tangential component so the node settles against the wall
    // rather than grinding along it.
    const nx = Math.cos(want), ny = Math.sin(want);
    const vr = n.vx * nx + n.vy * ny;
    n.vx = nx * vr;
    n.vy = ny * vr;
  }
}
sim.on("tick.project", projectSectors);

// Reality never moves. It is Signal's own belief and the field's origin.
for (const n of nodes) {
  if (n.kind === "reality") { n.fx = FIELD.cx; n.fy = FIELD.cy; }
}

// ── CAMERA / RENDER ─────────────────────────────────────────────────
let selected = null;
let neighbours = null;
let hovered = null;
const cam = makeCamera(canvas, () => needsDraw());
let dirty = true;
const needsDraw = () => { dirty = true; };
sim.on("tick", needsDraw);

function resize() {
  const r = canvas.getBoundingClientRect();
  size = { w: r.width, h: r.height };
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  needsDraw();
}
window.addEventListener("resize", resize);
resize();

let lastDraw = 0;
function frame() {
  if (dirty) {
    const t0 = performance.now();
    drawScene(ctx, { nodes, edges, cam, size, selected, neighbours, hovered, dpr });
    lastDraw = performance.now() - t0;
    dirty = false;
  }
  requestAnimationFrame(frame);
}
frame();

canvas.addEventListener("pointermove", (ev) => {
  const w = cam.worldOf(ev);
  const hit = pick(nodes, w.x, w.y);
  const id = hit?.id ?? null;
  if (id !== hovered) { hovered = id; needsDraw(); }
});

// ── LOCAL REHEATING ─────────────────────────────────────────────────
//
// §LOCAL REHEATING TEST. d3-force has one global alpha, so "relax a
// neighbourhood" has to be built: FIX everything outside the local world at
// its current position, release the neighbourhood, reheat, then unfix once
// it has cooled. The background is then stable by construction rather than
// by hoping the forces are too weak to move it — no global explosion is not
// a tuning outcome, it is an invariant.
let unfixTimer = null;
function neighbourhoodOf(id) {
  const out = new Set([id]);
  for (const e of links) {
    const s = typeof e.source === "object" ? e.source.id : e.source;
    const t = typeof e.target === "object" ? e.target.id : e.target;
    if (s === id) out.add(t);
    else if (t === id) out.add(s);
  }
  return out;
}
function select(id) {
  selected = id;
  neighbours = id ? neighbourhoodOf(id) : null;
  if (unfixTimer) { clearTimeout(unfixTimer); unfixTimer = null; }
  if (!id) {
    for (const n of nodes) if (n.kind !== "reality") { n.fx = null; n.fy = null; }
    needsDraw();
    return;
  }
  for (const n of nodes) {
    if (n.kind === "reality") continue;
    if (neighbours.has(n.id)) { n.fx = null; n.fy = null; }
    else { n.fx = n.x; n.fy = n.y; }
  }
  sim.alpha(0.55).restart();
  unfixTimer = setTimeout(() => {
    for (const n of nodes) if (n.kind !== "reality") { n.fx = null; n.fy = null; }
    unfixTimer = null;
  }, 1400);
  needsDraw();
}
canvas.addEventListener("click", (ev) => {
  const w = cam.worldOf(ev);
  const hit = pick(nodes, w.x, w.y);
  select(hit ? (hit.id === selected ? null : hit.id) : null);
});

// ── MORPH ───────────────────────────────────────────────────────────
//
// No remount and no teleport: the mode change rewrites force strengths and
// the SAME simulation carries every node to its new place. Trackability is
// then a property of the physics rather than of a tween.
function setMode(next) {
  mode = next;
  P = MODES[next];
  for (const n of nodes) if (n.kind !== "reality") { n.fx = null; n.fy = null; }
  sim.force("sector", forceSector(P.sector));
  sim.force("group", forceGroup(P.group));
  sim.force("collide", d3.forceCollide((n) => n.rad + 2.5).strength(P.collide).iterations(2));
  sim.alpha(0.9).restart();
  document.getElementById("mode").textContent = P.label;
}

function setMass(on) {
  variableMass = on;
  for (const n of nodes) n.rad = radiusOf(n, on ? importance : null);
  sim.force("collide", d3.forceCollide((n) => n.rad + 2.5).strength(P.collide).iterations(2));
  sim.alpha(0.5).restart();
  needsDraw();
}

// ── INSTRUMENTATION ─────────────────────────────────────────────────
const meter = makeMeter();
let settleStart = performance.now();
let settleMs = null;
let tickCosts = [];
sim.on("tick.measure", () => {
  if (settleMs == null && sim.alpha() < 0.02) settleMs = performance.now() - settleStart;
});
// Tick cost, sampled honestly: time one manual tick with the sim paused.
function sampleTickCost(n = 30) {
  const was = sim.alpha();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) sim.tick();
  const cost = (performance.now() - t0) / n;
  sim.alpha(was);
  return +cost.toFixed(3);
}

window.__lab = {
  name: "B · anchored d3-force",
  ready: () => settleMs != null,
  settleMs: () => settleMs,
  alpha: () => sim.alpha(),
  positions: () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  nodes: () => nodes,
  fit: () => cam.fit(boundsOf(nodes), size),
  select,
  setMode,
  setMass,
  mode: () => mode,
  drawMs: () => +lastDraw.toFixed(2),
  tickCost: () => sampleTickCost(),
  meter,
  metrics: () => ({
    overlap: overlapStats(nodes),
    spacing: spacingStats(nodes),
    occupancy: occupancy(nodes),
    crossings: crossings(nodes, data.edges),
    sector: sectorFidelity(nodes, CLUSTERS, FIELD),
  }),
  displacement,
  reseat: () => {
    // Fresh run from the same seeds, for the spatial-memory proof.
    for (const n of nodes) {
      n.x = n.seatX; n.y = n.seatY; n.vx = 0; n.vy = 0;
      if (n.kind !== "reality") { n.fx = null; n.fy = null; }
    }
    settleMs = null;
    settleStart = performance.now();
    sim.alpha(1).restart();
  },
};

document.getElementById("mode").textContent = P.label;
document.getElementById("meta").textContent = `${nodes.length} nodes · ${data.edges.length} relationships · ${links.length} springs`;
setTimeout(() => cam.fit(boundsOf(nodes), size), 60);
