// B2 — ANCHORED FORCE, TUNED FOR EXPERIENCE.
//
// The bake-off settled the architecture. This one exists to answer whether it
// can FEEL like the reference, judged against the two states the reference
// actually has:
//
//   RINGS   members distributed along concentric arc-lines around an empty
//           core, each population owning a contiguous radial band. Calm,
//           legible, obviously a map.
//   FORCE   separated organic cells scattered like organelles, each one
//           internally packed, with most of the frame black.
//
// Signal keeps every semantic: graphology ids, type, trust, provenance,
// source membership, aggregates, the Reality boundary and the anchor
// computation. d3 is given exactly six jobs — local relaxation, collision,
// group cohesion, meaningful links, velocity, reheating — and nothing else.

import * as d3 from "d3-force";
import { loadGraph, makeCamera, boundsOf, seedRandom } from "./harness.js";

// ── 1. DETERMINISM, BEFORE ANYTHING ELSE ─────────────────────────────
//
// The previous run's "reload drift 7.6 mean / 45.2 max" measured the distance
// between where a node settled on run 1 and where the SAME node settled after
// a reload with the same inputs. It should have been zero and was not,
// because d3-force reaches for ambient Math.random in two places: the initial
// phyllotaxis placement of nodes that arrive without x/y (not our case, every
// node starts at its Signal seat) and `jiggle()` inside forceCollide and
// forceManyBody, which separates coincident points.
//
// So the generator is replaced process-wide with a seeded xorshift BEFORE any
// force is constructed, and re-seeded to the same value on every fresh
// simulation. Nothing here consults Math.random again after that.
const SEED = 0x5EED_1A11;
let rng = seedRandom(SEED);
// Belt: nothing in the page may reach for the ambient generator.
Math.random = () => rng();

// AND BRACES — this is the one that actually mattered.
//
// d3-force 3 does NOT call Math.random. Every force receives a generator
// through `initialize(nodes, random)`, and that generator is
// `simulation.randomSource()`, which defaults to a STATEFUL linear
// congruential generator owned by the simulation. It is never reset between
// runs, so consecutive solves continue the same stream and land in different
// places — measured back-to-back at 13.56 world units on the first pair and
// 0.03 once warm, which is exactly the signature of a shared stream rather
// than of float noise.
//
// Overriding Math.random did nothing about it. The fix is to give the
// simulation OUR generator and re-seed that generator at the head of every
// solve, so run N and run N+1 consume identical numbers in identical order.
let simRng = seedRandom(SEED ^ 0x9E3779B9);
const randomSource = () => simRng();
function reseedRandom() {
  rng = seedRandom(SEED);
  simRng = seedRandom(SEED ^ 0x9E3779B9);
}

const params = new URLSearchParams(location.search);
const VARIANT = (params.get("v") ?? "b").toLowerCase();

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
let size = { w: 0, h: 0 };

const data = await loadGraph();
const CLUSTERS = data.clusters;
const SECTOR = 360 / CLUSTERS.length;
const FIELD = data.field;
const RAD = Math.PI / 180;

// ── SIGNAL'S OWN VISUAL LANGUAGE ─────────────────────────────────────
//
// §12: the bake-off deliberately normalised styling; B2 has to be judged
// emotionally, so these are Signal's tokens resolved to hex.
const C = {
  bg: "#080b0e",
  reality: "#3fd0d6",
  signal: "#58a6cc",
  text: "#e6edf3",
  soft: "#8b98a5",
  faint: "#3d4750",
  risk: "#e8836b",
  decision: "#a98ce8",
  dependency: "#e8b96b",
  commitment: "#63d9a6",
  unknown: "#7d8ce8",
  observation: "#79838c",
  silver: "#c3ced6",
  source: "#58a6cc",
};
function colorOf(n) {
  if (n.kind === "reality") return C.reality;
  if (n.kind === "intel") {
    const t = String(n.intelType ?? "").toLowerCase();
    if (t.includes("risk")) return C.risk;
    if (t.includes("decision")) return C.decision;
    if (t.includes("dependency")) return C.dependency;
    if (t.includes("commitment")) return C.commitment;
    if (t.includes("unknown")) return C.unknown;
    return C.observation;
  }
  if (n.kind === "passage") return C.silver;
  if (["source", "transcript", "notion_page", "figma_artifact"].includes(n.kind)) return C.source;
  if (n.kind === "lane") return C.faint;
  return C.soft;
}
/** Trust on the stroke, exactly as Signal states it: attested is solid,
    anything external is dashed and hollow-ish. */
const isExternal = (n) => n.kind === "intel";

// ── 5. DISPLAY IMPORTANCE — deterministic, bounded, navigation-only ──
//
// §5: derived from relation richness, NOT raw degree, and explicitly not a
// claim about truth, confidence or business priority. It answers "how much
// display authority does this thing have when you are navigating", which is
// the only question a radius is allowed to answer.
//
// related_to and membership contribute nothing. Provenance counts, but at a
// third — 367 of 480 edges are provenance, and at full weight every passage
// would outrank every decision.
const WEIGHT = { semantic: 1.0, temporal: 0.8, provenance: 0.34, contextual: 0, null: 0 };
function computeImportance() {
  const imp = new Map(data.nodes.map((n) => [n.id, 0]));
  const groupOfNode = new Map();
  for (const a of data.aggregates) {
    for (const m of a.members) groupOfNode.set(m, a.id);
    if (a.hub) groupOfNode.set(a.hub, a.id);
  }
  for (const e of data.edges) {
    const w = WEIGHT[String(e.cls)] ?? 0;
    if (!w) continue;
    imp.set(e.source, (imp.get(e.source) ?? 0) + w);
    imp.set(e.target, (imp.get(e.target) ?? 0) + w);
    // CROSS-GROUP REACH counts double: a node that connects two populations
    // is doing navigational work a node with the same degree inside one cell
    // is not.
    const ga = groupOfNode.get(e.source), gb = groupOfNode.get(e.target);
    if (ga && gb && ga !== gb) {
      imp.set(e.source, imp.get(e.source) + w);
      imp.set(e.target, imp.get(e.target) + w);
    }
  }
  // A source artifact carries its passages; an aggregate hub carries its
  // members. Both are display authority in the plainest sense — they stand
  // for things you would otherwise have to find one at a time.
  for (const a of data.aggregates) if (a.hub) imp.set(a.hub, (imp.get(a.hub) ?? 0) + a.count * 0.5);
  return imp;
}
const IMPORTANCE = computeImportance();

/** Nonlinear and capped, so nothing becomes a moon. cbrt keeps a 60-member
    hub about twice a leaf, not fifteen times it. */
function radiusOf(n, variable = true) {
  const base = n.kind === "reality" ? n.r : Math.max(3.2, n.r * 0.62);
  if (!variable) return base;
  const k = Math.min(2.1, 1 + 0.42 * Math.cbrt(IMPORTANCE.get(n.id) ?? 0));
  return n.kind === "reality" ? base : base * k;
}

// ── THE MODEL ────────────────────────────────────────────────────────
let variableMass = true;

const nodes = data.nodes.map((n) => ({
  ...n,
  x: n.x, y: n.y,
  seatX: n.x, seatY: n.y,
  targetR: n.radius,
  seatAngle: n.angle,
  sector: n.lane ? CLUSTERS.indexOf(n.lane) : -1,
  rad: radiusOf(n, variableMass),
  _color: colorOf(n),
  _ext: isExternal(n),
  // §6: collision uses the REAL visual footprint. `labelPad` is the hook the
  // cartographic label engine will fill later; it is summed here already so
  // the API does not change when that branch lands.
  glowPad: 1.6,
  labelPad: 0,
}));
const byId = new Map(nodes.map((n) => [n.id, n]));
const footprint = (n) => n.rad + n.glowPad + n.labelPad;

const LINKABLE = new Set(["semantic", "temporal", "provenance"]);
const links = data.edges
  .filter((e) => LINKABLE.has(e.cls) && byId.has(e.source) && byId.has(e.target))
  .map((e) => ({ ...e }));
const edges = data.edges.map((e) => ({ ...e, _s: byId.get(e.source), _t: byId.get(e.target) }));

// Adjacency over MEANINGFUL relationships only — used by hover, focus and
// reheating, so all three agree about what "near" means.
const adj = new Map(nodes.map((n) => [n.id, new Set()]));
for (const e of links) { adj.get(e.source).add(e.target); adj.get(e.target).add(e.source); }

// Groups: Signal's own aggregates, plus one catch-all per region so every
// node belongs to a cell and the FORCE state has no orphan dust.
const GROUPS = new Map();
const groupOf = new Map();
for (const a of data.aggregates) {
  const ids = new Set(a.members);
  if (a.hub) ids.add(a.hub);
  GROUPS.set(a.id, { id: a.id, ids, cx: a.x, cy: a.y, count: a.count, tint: null, label: a.label, sector: CLUSTERS.indexOf(a.cluster) });
  for (const id of ids) groupOf.set(id, a.id);
}
for (const n of nodes) {
  if (groupOf.has(n.id) || n.slice === "core" || !n.lane) continue;
  const gid = `region:${n.lane}`;
  if (!GROUPS.has(gid)) GROUPS.set(gid, { id: gid, ids: new Set(), cx: n.x, cy: n.y, count: 0, label: n.lane, sector: CLUSTERS.indexOf(n.lane) });
  const g = GROUPS.get(gid);
  g.ids.add(n.id); g.count++;
  groupOf.set(n.id, gid);
}
/** A source aggregate's label in the export is its raw `ke://` ref. On a
    field that is an unreadable 80-character URI; Signal already humanises
    these in the inspector, so the same rule applies here. */
function humanLabel(raw) {
  const t = String(raw ?? "");
  if (!t.startsWith("ke://")) return t;
  const tail = t.split("/").pop() ?? t;
  const m = tail.match(/^(\d{4}-\d{2}-\d{2})[_-](.*)$/);
  const name = (m ? m[2] : tail).replace(/[-_]+/g, " ").replace(/^KE /i, "");
  return m ? `${m[1]} · ${name}` : name;
}
for (const g of GROUPS.values()) {
  const first = [...g.ids].map((i) => byId.get(i)).find(Boolean);
  g.tint = first ? first._color : C.soft;
  g.label = humanLabel(g.label);
}

// ── 2. THE SEMANTIC INVARIANT, WITHOUT A SNAP ────────────────────────
//
// The previous prototype projected position after integration. That is exact
// and it VISIBLY TICKS at the boundary: a node arriving with tangential speed
// is teleported onto the wedge line and its velocity is discarded, which
// reads as a small hard stop.
//
// This is the same guarantee delivered as a continuous response. Three parts:
//
//   1. A soft restoring force inside a margin band before the boundary, so
//      most nodes never reach it and are turned gently.
//   2. At the boundary, the RADIAL velocity component is preserved and only
//      the outward-tangential component is removed — the node keeps sliding
//      along the wall instead of stopping dead.
//   3. The positional correction is applied as a fraction per tick rather
//      than in one step, so even a fast arrival resolves over ~3 frames.
//
// The invariant stays exact because the correction fraction is 1 whenever the
// overshoot exceeds a hard cap. Inside that cap it is smooth; past it, it is
// a wall.
const BOUNDARY_MARGIN = 4.0;   // degrees of soft response before the edge
const BOUNDARY_SOFT = 0.55;    // fraction of the correction applied per tick
const BOUNDARY_HARD = 2.5;     // degrees past the edge that force full snap

function sectorGeom(n) {
  const dx = n.x - FIELD.cx, dy = n.y - FIELD.cy;
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx) / RAD;
  const base = -90 + n.sector * SECTOR;
  const d = ((a - base + 540) % 360) - 180;
  return { r, a, base, d, half: SECTOR / 2 - 0.6 };
}

/** Part 1 — a spring inside the margin band, so the wall is rarely reached. */
function forceSectorSoft() {
  let ns;
  function force(alpha) {
    const strength = P.sectorSoft ?? 0;
    if (strength <= 0) return;
    for (const n of ns) {
      if (n.sector < 0 || n.slice === "core" || n.fx != null) continue;
      const g = sectorGeom(n);
      const inner = g.half - BOUNDARY_MARGIN;
      if (Math.abs(g.d) <= inner) continue;
      const t = (Math.abs(g.d) - inner) / BOUNDARY_MARGIN;
      const want = (g.base + Math.sign(g.d) * inner) * RAD;
      const tx = FIELD.cx + Math.cos(want) * g.r;
      const ty = FIELD.cy + Math.sin(want) * g.r;
      const k = strength * alpha * Math.min(1, t) ** 2;
      n.vx += (tx - n.x) * k;
      n.vy += (ty - n.y) * k;
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

/** Parts 2 and 3 — the continuous constraint, run after integration. */
/**
 * WHERE MEMBERSHIP IS STATED DEPENDS ON THE STATE, and this is the insight
 * that unlocked the reference's look.
 *
 * In RINGS, position IS the claim: a node in the Evidence wedge is in
 * Evidence, so the wedge is a hard invariant and the constraint runs.
 *
 * In CONSTELLATIONS the claim is carried by the CELL — its enclosure, its
 * colour, its name and its count are all right there — so the wedge has
 * nothing left to say, and enforcing it is what was crushing five Hermes
 * populations into one narrow vertical stack of bands. Released, they become
 * five separate cells, which is both what the reference does and what
 * Signal's own aggregate model already asserts.
 *
 * Membership is never weakened. It moves from being stated by a sector to
 * being stated by a labelled, counted, coloured cell.
 */
let sectorInvariant = true;
function constrainSectors() {
  if (!sectorInvariant) return;
  for (const n of nodes) {
    if (n.sector < 0 || n.slice === "core" || n.kind === "reality") continue;
    const g = sectorGeom(n);
    if (g.r < 1e-6 || Math.abs(g.d) <= g.half) continue;
    const over = Math.abs(g.d) - g.half;
    const want = (g.base + Math.sign(g.d) * g.half) * RAD;
    const tx = FIELD.cx + Math.cos(want) * g.r;
    const ty = FIELD.cy + Math.sin(want) * g.r;
    // Full correction past the hard cap; a fraction inside it.
    const f = over >= BOUNDARY_HARD ? 1 : BOUNDARY_SOFT;
    n.x += (tx - n.x) * f;
    n.y += (ty - n.y) * f;
    // Keep the component that slides along the wall (radial, here), drop only
    // the one pushing through it.
    const ux = Math.cos(want), uy = Math.sin(want);          // radial unit
    const px = -uy, py = ux;                                  // tangential unit
    const vt = n.vx * px + n.vy * py;
    const vr = n.vx * ux + n.vy * uy;
    const outward = Math.sign(g.d) * vt > 0;
    n.vx = ux * vr + (outward ? 0 : px * vt);
    n.vy = uy * vr + (outward ? 0 : py * vt);
  }
}

// ── 3. THE GROUP FORCE ───────────────────────────────────────────────
//
// The first anchored run dissolved Signal's typed groups; this is the fix,
// and it is what makes the reference look the way it does. Three terms:
//
//   COHESION   members toward their cell's live centroid.
//   SEPARATION cell centroids push each other apart to a distance derived
//              from both counts, which is what creates NEGATIVE SPACE. The
//              push is applied to the centroid and distributed to members, so
//              a cell moves as a body rather than being torn.
//   CONTAINMENT a member that strays far outside its own cell radius is
//              pulled back harder than cohesion alone would, which is what
//              stops two adjacent cells from trading members and smearing
//              into bands.
const groupList = [...GROUPS.values()];
function cellRadius(g) { return 5.5 + 3.4 * Math.sqrt(Math.max(1, g.count)); }

/**
 * WHERE EACH CELL WANTS TO BE, IN CONSTELLATIONS.
 *
 * Separation alone could not get there, and the reason is worth recording:
 * the force acts on centroids proportionally to alpha, and five Hermes
 * populations start with their centroids about twenty units apart inside one
 * wedge. Moving them two hundred units apart needs more impulse than a
 * decaying alpha has left to give, so they stayed a stack of coloured bands
 * no matter how hard separation was turned up.
 *
 * So the cells get a DETERMINISTIC TARGET ARRANGEMENT to fall toward — a
 * golden-angle spiral, largest first, with the step scaled by the radii of
 * the cells already placed. Same corpus, same arrangement, forever; no
 * randomness, no relayout, no teleport. Physics still does the last word:
 * members keep their own offsets, collide still separates them, and the pull
 * is a force like any other, so the transition is continuous and can be
 * interrupted at any point.
 *
 * This is the constellation equivalent of Signal's own wedge packer — the
 * arrangement is computed, the settling is physical.
 */
const GOLDEN = 137.5077640500378 * (Math.PI / 180);
function computeCellTargets() {
  const ordered = [...groupList].filter((g) => g.ids.size).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  let r = 0;
  ordered.forEach((g, i) => {
    const rad = cellRadius(g);
    // Step outward by enough to clear what is already placed, plus the gap.
    r += (rad * GAP) / Math.max(1, Math.sqrt(i + 1)) + 26;
    const a = i * GOLDEN;
    g.tx = FIELD.cx + Math.cos(a) * r;
    g.ty = FIELD.cy + Math.sin(a) * r;
  });
}
// NOT CALLED HERE. `GAP` is declared below and the variant that sets it is
// chosen below that, so computing targets at this point read an
// uninitialised binding and produced NaN coordinates for every cell — which
// then propagated to all 392 nodes the moment cellPull engaged. It is called
// once, after the variant is resolved.

function forceGroups() {
  // Reads P live: the morph changes strengths, never force identity.
  let ns;
  function force(alpha) {
    for (const g of groupList) { g.sx = 0; g.sy = 0; g.n = 0; }
    for (const n of ns) {
      const g = GROUPS.get(groupOf.get(n.id));
      if (!g) continue;
      g.sx += n.x; g.sy += n.y; g.n++;
    }
    for (const g of groupList) if (g.n) { g.cx = g.sx / g.n; g.cy = g.sy / g.n; g.r = cellRadius(g); }

    const { cohesion = 0, separation = 0, containment = 0, cellPull = 0 } = P;
    const kc = cohesion * alpha;
    const kk = containment * alpha;
    for (const n of ns) {
      if (n.fx != null) continue;
      const g = GROUPS.get(groupOf.get(n.id));
      if (!g || !g.n) continue;
      const dx = g.cx - n.x, dy = g.cy - n.y;
      n.vx += dx * kc;
      n.vy += dy * kc;
      const d = Math.hypot(dx, dy);
      if (d > g.r) {
        const pull = ((d - g.r) / d) * kk;
        n.vx += dx * pull;
        n.vy += dy * pull;
      }
    }

    // Pull each cell BODILY toward its deterministic target: the same
    // impulse on every member, so the cell translates without being torn and
    // every internal relationship keeps its shape.
    if (cellPull > 0) {
      for (const g of groupList) {
        if (!g.n || g.tx == null) continue;
        const dx = g.tx - g.cx, dy = g.ty - g.cy;
        const k = cellPull * alpha;
        for (const id of g.ids) {
          const n = byId.get(id);
          if (!n || n.fx != null) continue;
          n.vx += dx * k;
          n.vy += dy * k;
        }
      }
    }

    if (separation <= 0) return;
    const live = groupList.filter((g) => g.n);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        const d = Math.hypot(dx, dy) || 1e-6;
        const want = (a.r + b.r) * GAP;
        if (d >= want) continue;
        const push = ((want - d) / d) * separation * alpha * 0.5;
        const fx = dx * push, fy = dy * push;
        for (const n of ns) {
          if (n.fx != null) continue;
          const gid = groupOf.get(n.id);
          if (gid === a.id) { n.vx -= fx; n.vy -= fy; }
          else if (gid === b.id) { n.vx += fx; n.vy += fy; }
        }
      }
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

// ── 4. NEGATIVE SPACE ────────────────────────────────────────────────
//
// §4: do not maximise packing. GAP is the single dial that decides how much
// black there is between cells — the reference sits somewhere near 1.5, where
// each population has an unmistakable silhouette and the frame is mostly
// empty.
let GAP = 1.5;

// ── VARIANTS ─────────────────────────────────────────────────────────
//
// §18: three tunings of the same physics, so feel can be SEEN rather than
// inferred from parameter tables.
const VARIANTS = {
  a: { name: "B2-A · rigid / calm",   velocityDecay: 0.62, alphaDecay: 0.030, chargeK: 0.7, gap: 1.35, reheat: 0.30, cool: 1100 },
  b: { name: "B2-B · balanced",       velocityDecay: 0.45, alphaDecay: 0.022, chargeK: 1.0, gap: 1.50, reheat: 0.45, cool: 1500 },
  c: { name: "B2-C · elastic / alive", velocityDecay: 0.30, alphaDecay: 0.014, chargeK: 1.35, gap: 1.68, reheat: 0.62, cool: 2100 },
};
const V = VARIANTS[VARIANT] ?? VARIANTS.b;
GAP = V.gap;
// Now that the variant has set the gap, the cells know where they are going.
computeCellTargets();

// ── 9/10. THE TWO STATES, AND THE LAB-ONLY THIRD ─────────────────────
const MODES = {
  rings: {
    radial: 0.62, anchorXY: 0.10, angle: 0.30, sectorSoft: 0.8,
    cohesion: 0.05, separation: 0.10, containment: 0.02, cellPull: 0.0,
    link: 0.22, charge: -6, collide: 0.92,
    label: "RINGS — semantic manifold",
  },
  constellations: {
    // No sector force at all: the cell carries the membership claim here.
    // Separation is the dominant term, because negative space between cells
    // is the single thing that most distinguishes the reference from a
    // hairball.
    radial: 0.0, anchorXY: 0.0, angle: 0.0, sectorSoft: 0.0,
    cohesion: 0.30, separation: 0.9, containment: 0.22, cellPull: 0.26,
    link: 0.35, charge: -10, collide: 1.0,
    label: "CONSTELLATIONS — organic cells",
  },
  free: {
    radial: 0.0, anchorXY: 0.0, angle: 0.0, sectorSoft: 0.0,
    cohesion: 0.14, separation: 0.6, containment: 0.05, cellPull: 0.0,
    link: 1.0, charge: -42, collide: 1.0,
    label: "FREE — lab only, semantics released",
  },
};
let mode = "rings";
let P = { ...MODES.rings };
/** Morph target — force strengths are eased toward this every tick, which is
    what makes the transition continuous rather than a relayout. */
let target = { ...MODES.rings };

/** RINGS wants members ON ring lines, the way the reference does — discrete
    concentric arcs rather than a smear across a band. Quantising the radial
    target to a lane spacing does that with no extra force. */
const RING_STEP = 15;
const ringRadius = (n) => (n.slice === "core" ? 0 : Math.round(n.targetR / RING_STEP) * RING_STEP);

function angleForce() {
  let ns;
  function force(alpha) {
    const strength = P.angle ?? 0;
    if (strength <= 0) return;
    for (const n of ns) {
      if (n.slice === "core" || n.fx != null) continue;
      const g = sectorGeom(n);
      if (g.r < 1e-6) continue;
      const want = n.seatAngle * RAD;
      const tx = FIELD.cx + Math.cos(want) * g.r;
      const ty = FIELD.cy + Math.sin(want) * g.r;
      const k = strength * alpha;
      n.vx += (tx - n.x) * k;
      n.vy += (ty - n.y) * k;
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

const sim = d3
  .forceSimulation(nodes)
  .force("radial", d3.forceRadial((n) => (mode === "rings" ? ringRadius(n) : n.targetR), FIELD.cx, FIELD.cy).strength(() => P.radial))
  .force("angle", angleForce())
  .force("sectorSoft", forceSectorSoft())
  .force("groups", forceGroups())
  .force("ax", d3.forceX((n) => n.seatX).strength(() => P.anchorXY))
  .force("ay", d3.forceY((n) => n.seatY).strength(() => P.anchorXY))
  .force("charge", d3.forceManyBody().strength(() => P.charge * V.chargeK).distanceMax(120))
  .force("collide", d3.forceCollide((n) => footprint(n) + 2.2).strength(0.95).iterations(3))
  .force("link", d3.forceLink(links).id((n) => n.id)
    .distance((e) => (e.cls === "provenance" ? 24 : 52))
    .strength((e) => (e.cls === "semantic" ? 0.55 : e.cls === "temporal" ? 0.4 : 0.16) * P.link))
  .alphaDecay(V.alphaDecay)
  .velocityDecay(V.velocityDecay)
  // Injected BEFORE any force is added below would be ideal; d3 re-runs
  // every force's initialize when the source changes, so setting it here is
  // equivalent and keeps the chain readable.
  .randomSource(randomSource);

/** Rebuild the two closure-parameterised forces whenever their strengths
    change. Everything else reads P through an accessor and needs no rebuild. */
function syncForces() {
  // Only collide needs rebuilding, because its strength is the one d3 force
  // that refuses an accessor. Everything else reads P live, so the morph
  // never touches force identity — rebuilding forces sixty times a second
  // re-ran d3's initialize on every tick and churned the seeded stream.
  sim.force("collide", d3.forceCollide((n) => footprint(n) + 2.2).strength(P.collide ?? 0.95).iterations(3));
}
syncForces();

for (const n of nodes) if (n.kind === "reality") { n.fx = FIELD.cx; n.fy = FIELD.cy; }

// ── DETERMINISM, PART TWO: THE EQUILIBRIUM IS SOLVED, NOT RACED ──────
//
// Seeding Math.random was necessary and not sufficient. Measured on ten
// fresh in-page runs it still diverged by up to 14 world units, for two
// reasons that only show up when you actually run the experiment:
//
//   1. `forceSimulation()` starts its own animation-frame timer immediately.
//      Any manual `sim.tick()` therefore INTERLEAVES with an unknown number
//      of timer ticks, and the count depends on wall clock. Two runs of "the
//      same 900 ticks" are not the same simulation.
//   2. `simulation.tick()` does NOT dispatch the "tick" event. The sector
//      constraint was registered as a tick listener, so during a manual solve
//      it never ran at all — the timer path and the manual path were
//      obeying different physics.
//
// So the resting layout is now SOLVED, headless, with the timer stopped and
// the constraint called explicitly, for a fixed tick count. That equilibrium
// is the world Signal remembers; the live simulation starts from it and is
// only ever used for interaction. Deterministic where it must be, alive
// where it should be.
sim.stop();

/** One integration step plus the constraint — the only stepping function.
    The live timer calls the same pair through its tick listener. */
function stepOnce() {
  sim.tick();
  constrainSectors();
}

const SOLVE_TICKS = 600;
function solveEquilibrium() {
  reseedRandom();
  // Re-assigning the source makes d3 re-initialize every force against the
  // freshly seeded stream. Without this the forces keep the closure they
  // captured at construction and the reseed is invisible to them.
  sim.randomSource(randomSource);
  for (const n of nodes) {
    n.x = n.seatX; n.y = n.seatY; n.vx = 0; n.vy = 0;
    if (n.kind !== "reality") { n.fx = null; n.fy = null; }
  }
  sim.alpha(1).alphaTarget(0);
  for (let i = 0; i < SOLVE_TICKS; i++) stepOnce();
  return nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
}

// ── MORPH: EASE THE PARAMETERS, NOT THE POSITIONS ────────────────────
let morphing = false;
sim.on("tick.morph", () => {
  if (!morphing) return;
  let done = true;
  for (const k of Object.keys(target)) {
    if (k === "label") continue;
    const d = target[k] - P[k];
    if (Math.abs(d) > 1e-4) { P[k] += d * 0.07; done = false; }
    else P[k] = target[k];
  }
  syncForces();
  if (done) { morphing = false; }
});

// ── 7/8. FOCUS, LOCAL REHEATING, AND CONTINUOUS RETARGETING ──────────
//
// §7: the local world relaxes, everything else stays put. Pinning the
// background is what makes "no global explosion" an invariant rather than a
// hope, and it is also what makes the reheat cheap — d3 skips fixed nodes'
// integration entirely.
//
// §8: retargeting must REDIRECT motion, never restart it. So selecting B
// while A is still settling does NOT stop the simulation and does not reset
// alpha to 1: it recomputes which nodes are pinned, releases the new
// neighbourhood WITH ITS CURRENT VELOCITY INTACT, and tops alpha up to the
// reheat floor only if it has fallen below it. Nothing is ever zeroed, so
// existing motion bends toward the new configuration instead of stopping.
let selected = null;
let neighbours = null;
let hovered = null;
let coolTimer = null;

function localWorld(id) {
  const out = new Set([id]);
  for (const nb of adj.get(id) ?? []) out.add(nb);
  // ...plus the selection's own group context, which is what makes a cell
  // "bloom" rather than a lone node drifting out of a static crowd.
  const gid = groupOf.get(id);
  if (gid) for (const m of GROUPS.get(gid).ids) out.add(m);
  return out;
}

function applyPinning() {
  for (const n of nodes) {
    if (n.kind === "reality" || n.dragging) continue;
    if (!neighbours || neighbours.has(n.id)) { n.fx = null; n.fy = null; }
    else { n.fx = n.x; n.fy = n.y; }
  }
}

function select(id, opts = {}) {
  if (coolTimer) { clearTimeout(coolTimer); coolTimer = null; }
  selected = id;
  neighbours = id ? localWorld(id) : null;
  applyPinning();
  // TOP UP, NEVER RESET. `sim.alpha(x)` where x is below the current alpha
  // would slow a run in progress; Math.max keeps momentum.
  sim.alpha(Math.max(sim.alpha(), V.reheat)).restart();
  if (id) {
    coolTimer = setTimeout(() => {
      neighbours && applyPinningRelease();
      coolTimer = null;
    }, V.cool);
  } else {
    applyPinningRelease();
  }
  if (!opts.silent) frameSelection(id);
  needsDraw();
}
function applyPinningRelease() {
  for (const n of nodes) if (n.kind !== "reality" && !n.dragging) { n.fx = null; n.fy = null; }
}

// ── 13. CAMERA / PHYSICS COORDINATION ────────────────────────────────
//
// §13: the camera must not chase the physics. It makes ONE minimum useful
// composition adjustment when a selection lands, then leaves the simulation
// to settle underneath it — and any hand input cancels it outright.
let camTween = null;
const cam = makeCamera(canvas, () => { camTween = null; needsDraw(); });

function frameSelection(id) {
  if (!id) return;
  const n = byId.get(id);
  if (!n) return;
  const g = GROUPS.get(groupOf.get(id));
  const members = g ? [...g.ids].map((i) => byId.get(i)).filter(Boolean) : [n];
  const b = boundsOf(members.concat(n));
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const wantK = Math.min(2.6, Math.min(size.w / (w * 2.6), size.h / (h * 2.6)));
  // MINIMUM USEFUL: if the local world is already legible and on screen, do
  // nothing at all. The reference never re-frames when it does not need to.
  const sx = (n.x - cam.x) * cam.k, sy = (n.y - cam.y) * cam.k;
  const onScreen = Math.abs(sx) < size.w * 0.34 && Math.abs(sy) < size.h * 0.34;
  const legible = w * cam.k > size.w * 0.18;
  if (onScreen && legible) return;
  camTween = { fx: cam.x, fy: cam.y, fk: cam.k, tx: (b.minX + b.maxX) / 2, ty: (b.minY + b.maxY) / 2, tk: Math.max(cam.k, wantK), t0: performance.now(), ms: 520 };
}
function stepCamera() {
  if (!camTween) return;
  const t = Math.min(1, (performance.now() - camTween.t0) / camTween.ms);
  const e = 1 - Math.pow(1 - t, 3);
  cam.x = camTween.fx + (camTween.tx - camTween.fx) * e;
  cam.y = camTween.fy + (camTween.ty - camTween.fy) * e;
  cam.k = camTween.fk + (camTween.tk - camTween.fk) * e;
  if (t >= 1) camTween = null;
  needsDraw();
}

// ── 15. DIRECT MANIPULATION ──────────────────────────────────────────
//
// §15: drag must feel physical and must NOT rewrite semantic position. The
// node is pinned to the pointer while held; on release it is unpinned and the
// anchors pull it home. Its group stretches because cohesion and containment
// are still running on the neighbours.
let dragNode = null;
canvas.addEventListener("pointerdown", (ev) => {
  const w = cam.worldOf(ev);
  const hit = pickAt(w.x, w.y);
  if (!hit || hit.kind === "reality") return;
  dragNode = hit;
  hit.dragging = true;
  neighbours = localWorld(hit.id);
  applyPinning();
  sim.alpha(Math.max(sim.alpha(), 0.5)).restart();
});
canvas.addEventListener("pointermove", (ev) => {
  if (dragNode) {
    const w = cam.worldOf(ev);
    dragNode.fx = w.x; dragNode.fy = w.y;
    sim.alpha(Math.max(sim.alpha(), 0.35));
    needsDraw();
    return;
  }
  const w = cam.worldOf(ev);
  const hit = pickAt(w.x, w.y);
  const id = hit?.id ?? null;
  // ── 14. HOVER IS FREE ──────────────────────────────────────────────
  // No reheat, no alpha touch, no force change: hover only changes what is
  // painted, so its cost is one redraw.
  if (id !== hovered) { hovered = id; needsDraw(); }
});
addEventListener("pointerup", () => {
  if (!dragNode) return;
  dragNode.dragging = false;
  dragNode.fx = null; dragNode.fy = null;
  dragNode = null;
  sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
});

function pickAt(wx, wy) {
  let best = null, bestR = Infinity;
  for (const n of nodes) {
    const r = n.rad + 4;
    if (Math.hypot(n.x - wx, n.y - wy) <= r && r < bestR) { best = n; bestR = r; }
  }
  return best;
}
canvas.addEventListener("click", (ev) => {
  const w = cam.worldOf(ev);
  const hit = pickAt(w.x, w.y);
  select(hit ? (hit.id === selected ? null : hit.id) : null);
});

// ── 11. EDGE LIFE ────────────────────────────────────────────────────
//
// Edges are recomputed from live node positions every frame, so they stay
// continuously attached through any movement. Curvature is derived from a
// stable hash of the edge id, so parallel relationships between the same two
// regions fan instead of stacking — and the fan does not shimmer, because the
// hash never changes.
const curveOf = new Map(edges.map((e) => {
  let h = 0;
  for (let i = 0; i < e.id.length; i++) h = (h * 31 + e.id.charCodeAt(i)) | 0;
  return [e.id, ((h % 100) / 100 - 0.5) * 0.22];
}));
const EDGE_REST = { semantic: "rgba(88,166,204,0.30)", temporal: "rgba(230,237,243,0.22)", provenance: "rgba(88,166,204,0.085)", contextual: "rgba(120,132,144,0.05)" };

// ── RENDER ───────────────────────────────────────────────────────────
let dirty = true, lastDraw = 0;
const needsDraw = () => { dirty = true; };
sim.on("tick", () => { constrainSectors(); needsDraw(); });

function resize() {
  const r = canvas.getBoundingClientRect();
  size = { w: r.width, h: r.height };
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  needsDraw();
}
addEventListener("resize", resize); resize();

function draw() {
  const t0 = performance.now();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.translate(size.w / 2, size.h / 2);
  ctx.scale(cam.k, cam.k);
  ctx.translate(-cam.x, -cam.y);

  // Cell halos — the reference's soft region wash, and the thing that makes
  // negative space read as structure rather than as absence.
  for (const g of groupList) {
    if (!g.n || g.count < 4) continue;
    const grad = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.r * 1.25);
    grad.addColorStop(0, hexA(g.tint, 0.10));
    grad.addColorStop(1, hexA(g.tint, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r * 1.25, 0, Math.PI * 2); ctx.fill();
  }

  const dim = selected != null;
  ctx.lineCap = "round";
  for (const e of edges) {
    const a = e._s, b = e._t;
    if (!a || !b) continue;
    const incidentHover = hovered && (e.source === hovered || e.target === hovered);
    const inFocus = dim && neighbours && neighbours.has(e.source) && neighbours.has(e.target);
    if (!e.cls) continue;
    if (dim && !inFocus && e.cls === "provenance") continue;
    if (e.cls === "contextual" && !incidentHover && !inFocus) continue;
    ctx.strokeStyle = incidentHover ? "rgba(88,166,204,0.9)" : inFocus ? "rgba(88,166,204,0.6)" : dim ? "rgba(120,132,144,0.05)" : EDGE_REST[e.cls];
    ctx.lineWidth = (incidentHover ? 1.6 : inFocus ? 1.2 : e.cls === "provenance" ? 0.5 : 0.85) / cam.k;
    const c = curveOf.get(e.id) ?? 0;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx - dy * c, my + dx * c, b.x, b.y);
    ctx.stroke();
  }

  for (const n of nodes) {
    const isSel = n.id === selected;
    const near = neighbours?.has(n.id);
    const hot = n.id === hovered;
    ctx.globalAlpha = !dim || isSel || near ? 1 : 0.2;
    if (isSel || hot) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.rad + 6 / cam.k, 0, Math.PI * 2);
      ctx.fillStyle = hexA(n._color, isSel ? 0.3 : 0.16); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(n.x, n.y, n.rad, 0, Math.PI * 2);
    if (n._ext) {
      // Trust on the stroke: external intelligence is hollow with a broken
      // edge, exactly as Signal states it.
      ctx.fillStyle = hexA(n._color, 0.24);
      ctx.fill();
      ctx.setLineDash([2 / cam.k, 2 / cam.k]);
      ctx.strokeStyle = n._color; ctx.lineWidth = 1.1 / cam.k; ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = n._color; ctx.fill();
    }
    if (isSel) { ctx.strokeStyle = C.text; ctx.lineWidth = 1.8 / cam.k; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // Cell names, the way the reference labels its departments.
  ctx.textAlign = "center";
  // Named in count order, and only where the name will not land on another —
  // the reference labels its departments and nothing else, which is what
  // keeps the frame quiet.
  const named = [];
  for (const g of [...groupList].sort((a, b) => b.count - a.count)) {
    if (!g.n || g.count < 4) continue;
    const sx = (g.cx - cam.x) * cam.k, sy = (g.cy + g.r) * 1 - cam.y;
    if (named.some((q) => Math.abs(q.x - g.cx) < 150 / cam.k && Math.abs(q.y - g.cy) < 26 / cam.k)) continue;
    named.push({ x: g.cx, y: g.cy });
    const label = String(g.label).toUpperCase().slice(0, 30);
    ctx.font = `${Math.max(7.5, 10 / cam.k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = hexA(g.tint, dim ? 0.3 : 0.72);
    ctx.fillText(label, g.cx, g.cy + g.r + 14 / cam.k);
    ctx.fillStyle = hexA(g.tint, dim ? 0.18 : 0.4);
    ctx.font = `${Math.max(6.5, 8.5 / cam.k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(String(g.count), g.cx, g.cy + g.r + 24 / cam.k);
  }
  ctx.restore();
  lastDraw = performance.now() - t0;
}
function hexA(hex, a) {
  if (!hex?.startsWith("#")) return `rgba(120,132,144,${a})`;
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
function frame() {
  stepCamera();
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}
frame();

// ── MODES ────────────────────────────────────────────────────────────
function setMode(next) {
  const M = MODES[next] ?? MODES[next === "force" ? "constellations" : "rings"];
  if (!M) return;
  mode = next === "force" ? "constellations" : next;
  sectorInvariant = mode === "rings";
  target = { ...M };
  morphing = true;
  applyPinningRelease();
  neighbours = null; selected = null;
  sim.alpha(Math.max(sim.alpha(), 0.75)).restart();
  document.getElementById("mode").textContent = M.label;
}

function setMass(on) {
  variableMass = on;
  for (const n of nodes) n.rad = radiusOf(n, on);
  syncForces();
  sim.alpha(Math.max(sim.alpha(), 0.4)).restart();
  needsDraw();
}

// ── INSTRUMENTATION ──────────────────────────────────────────────────
let settleMs = null;
let settleStart = performance.now();
sim.on("tick.measure", () => { if (settleMs == null && sim.alpha() < 0.02) settleMs = performance.now() - settleStart; });

function groupSeparation() {
  const live = groupList.filter((g) => g.n && g.count >= 4);
  let min = Infinity, sum = 0, n = 0;
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const d = Math.hypot(live[i].cx - live[j].cx, live[i].cy - live[j].cy) - live[i].r - live[j].r;
      min = Math.min(min, d); sum += d; n++;
    }
  return { cells: live.length, minGap: +min.toFixed(1), meanGap: +(sum / (n || 1)).toFixed(1) };
}

window.__lab = {
  name: V.name,
  variant: VARIANT,
  ready: () => settleMs != null,
  settleMs: () => settleMs,
  alpha: () => sim.alpha(),
  positions: () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  nodes: () => nodes,
  groups: () => groupList.map((g) => ({ id: g.id, label: g.label, count: g.count, cx: g.cx, cy: g.cy, r: g.r })),
  fit: () => { camTween = null; cam.fit(boundsOf(nodes), size, 0.08); },
  select,
  hover: (id) => { hovered = id; needsDraw(); },
  setMode,
  setMass,
  mode: () => mode,
  drawMs: () => +lastDraw.toFixed(2),
  groupSeparation,
  tickCost: () => {
    const a = sim.alpha();
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) sim.tick();
    const c = (performance.now() - t0) / 20;
    sim.alpha(a);
    return +c.toFixed(3);
  },
  /** A FRESH, IDENTICAL RUN — the determinism proof's unit of work. */
  rerun: () => {
    sim.stop();
    selected = null; neighbours = null; hovered = null; morphing = false;
    mode = "rings"; P = { ...MODES.rings }; target = { ...MODES.rings };
    syncForces();
    const t0 = performance.now();
    solveEquilibrium();
    settleMs = performance.now() - t0;
    needsDraw();
  },
  /** The solve IS the settle; nothing further is required and nothing may be
      raced against it. Kept for the driver's vocabulary. */
  settleNow: () => sim.alpha(),
  /** Hand the live simulation back after a solve, for interaction. */
  goLive: () => { sim.alpha(0.02).restart(); },
};

{
  const t0 = performance.now();
  solveEquilibrium();
  settleMs = performance.now() - t0;
  // Live only after the equilibrium exists, so what a reader first sees is
  // the deterministic world rather than a settling animation.
  sim.alpha(0.02).restart();
  needsDraw();
}

document.getElementById("mode").textContent = MODES.rings.label;
document.getElementById("meta").textContent =
  `${V.name} · ${nodes.length} nodes · ${data.edges.length} relationships · ${groupList.length} cells · seed ${SEED.toString(16)}`;
setTimeout(() => window.__lab.fit(), 80);
