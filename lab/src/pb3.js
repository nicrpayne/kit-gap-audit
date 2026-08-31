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
  .force("collide", d3.forceCollide((n) => collR(n)).strength(0.95).iterations(3))
  .force("bloom", forceBloom())
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
  // WHY COLLIDE IS RELAXED ON THE WAY HOME.
  //
  // Measured: a cell returns to the right place and the right size — shape
  // error max 10 units — with individual members up to 51 units out, because
  // two nodes crossing paths on the way back deflect each other into each
  // other's seats. That is a permutation, not a drift, and it is the thing
  // that loses within-cell identity.
  //
  // The rest layout being returned to is one the simulation itself produced
  // and is known to be overlap-free, so separation does not need to be
  // enforced ON THE WAY to it. Forces for what you prefer, projection for
  // what you guarantee: here the guarantee is the destination, and collide is
  // only in the way. It is restored the instant the return lands.
  const k = (P.collide ?? 0.95) * (returning ? 0.22 : 1);
  collideForce = d3.forceCollide((n) => collR(n)).strength(k).iterations(3);
  sim.force("collide", collideForce);
  lastInflate = -1;
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
  stepBloom();
  sim.tick();
  constrainSectors();
}

const SOLVE_TICKS = 600;
function solveEquilibrium() {
  // A bloom is interaction state; the resting world may not carry any of it,
  // or the determinism proof would be measuring whatever was selected last.
  bloom = null; bloomTween = null; penumbra = null; homing.clear();
  for (const n of nodes) n._inflate = 1;
  syncForces();
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

// ══ B3 · LOCAL BLOOM ═════════════════════════════════════════════════
//
// THE QUESTION: can selection PHYSICALLY CREATE a clear local world without
// destroying the global map?
//
// B2 answered everything except this. Its reheat released the neighbourhood
// and topped up alpha, and the neighbourhood moved 0.02–0.9 units — which is
// the same as the background moved. Nothing opened, because the layout was
// already at equilibrium and there was no slack to expand into. Selection
// changed what was BRIGHT, not what was WHERE.
//
// Three things have to be true at once for the answer to be yes:
//
//   THE LOCAL TOPOLOGY OPENS.  Not the selected node getting bigger — its
//     neighbours physically separating, far enough that you could put a name
//     on each one. That is a distance, and §10 measures it.
//   THE GLOBAL MAP HOLDS.  Spatial memory is the whole reason for anchored
//     force. If the field rearranges around a click, the map is gone.
//   THE RETURN IS EXACT.  Exit has to put the world back, bounded and
//     deterministic, or every selection costs the reader their place.
//
// The first two are in tension: opening needs room, and room has to come
// from somewhere. B2's pinning made the background immovable, so the local
// world had nowhere to expand. The resolution below is a THIRD RING —
//
//   LOCAL WORLD  released, pushed apart, seated by relationship role.
//   PENUMBRA     released, but homed to where it was. It yields to the
//                bloom and springs back. This is where the room comes from.
//   FIELD        pinned. Untouched. Not "moves a little" — fx/fy set.
//
// so the map is disturbed exactly as far as the eye can follow, and no
// further.

/** §2 — three strengths of the same physics, so feel can be seen. */
//
// WHAT THE CORPUS TURNED OUT TO BE, because it decides what a bloom can
// possibly mean here and it was not what I assumed:
//
//   A node's RELATIONSHIPS are almost never its SPATIAL NEIGHBOURS. Signal's
//   anchored layout seats a passage in the evidence sector and the Risk that
//   cites it in the Hermes sector, six hundred units away, on purpose. Across
//   all 407 objects the median bloom has ONE participant within reach, and
//   only twelve objects have four or more.
//
//   The CROWD, on the other hand, is everywhere. The median object has 26
//   other objects inside 60 world units and 59–84 inside its bloom's reach.
//   What a reader cannot do with this map is tell one passage from the
//   eighty-three packed around it.
//
// So "local bloom" cannot mean what it means in a free force layout, where
// related nodes are adjacent by construction and spreading the neighbourhood
// is the whole move. Here it has to mean two different things, and both are
// built and measured below:
//
//   CLEARING   the crowd steps back from the selection, always. This is what
//              actually creates a clear local world in this corpus, and it
//              applies to essentially every object.
//   OPENING    the related nodes that ARE near take banded seats. Real, and
//              genuinely good, on the objects shaped for it — a transcript
//              and its 26 passages — and a no-op on the rest. Reported as
//              such rather than demonstrated on the one node that flatters
//              it.
const BLOOMS = {
  calm:       { name: "CALM",       open: 0.16, clear: 0.22, inflate: 1.75, spacing: 15.5, ramp: 620, bandGap: 0.30, penumbra: 2.0, home: 0.16, exit: 560 },
  balanced:   { name: "BALANCED",   open: 0.26, clear: 0.38, inflate: 2.45, spacing: 18.5, ramp: 480, bandGap: 0.24, penumbra: 2.4, home: 0.22, exit: 460 },
  expressive: { name: "EXPRESSIVE", open: 0.38, clear: 0.58, inflate: 3.15, spacing: 22.0, ramp: 380, bandGap: 0.19, penumbra: 2.9, home: 0.30, exit: 400 },
};
/** §1 — which mechanism is under test. `a` inflation only, `b` seats only,
    `ab` both, `off` = B2's behaviour, for the honest before/after. */
// `clear` is listed because the first §1 table was not measuring what it
// said: the penumbra clearing ran in all three arms, so "A vs B vs A+B" was
// really "clear+A vs clear+B vs clear+A+B" and the clearing was getting no
// credit for the work it was doing. Five arms, one mechanism each.
const APPROACHES = new Set(["off", "clear", "a", "b", "ab"]);
let approach = APPROACHES.has(params.get("bloom") ?? "") ? params.get("bloom") : "ab";
let strength = BLOOMS[params.get("s") ?? ""] ? params.get("s") : "balanced";
let B = BLOOMS[strength];
/** Contextual `related_to` is 61 of 480 edges and says almost nothing about
    structure. §1: it does NOT participate by default. The flag exists so the
    claim can be tested rather than asserted. */
let bloomContextual = false;

const TAU = Math.PI * 2;
/** §3 — the ONLY ordering. A neighbour reachable by two kinds of edge takes
    the strongest one, and this is the strength order. It is Signal's own
    classification (`edgeFocusClass`), read off the export; nothing here
    invents a meaning for a relationship. */
const BAND_ORDER = ["semantic", "temporal", "provenance", "contextual"];
const BAND_RANK = new Map(BAND_ORDER.map((c, i) => [c, i]));

/** Every meaningful edge incident on a node, by the other end. */
const incident = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) {
  if (!e.cls) continue;
  if (incident.has(e.source)) incident.get(e.source).push([e.target, e.cls]);
  if (incident.has(e.target)) incident.get(e.target).push([e.source, e.cls]);
}

/**
 * WHERE THE NEIGHBOURHOOD GOES WHEN IT OPENS.
 *
 * THE LAW, and it took a wrong version to find it: the bloom pushes a
 * neighbour OUTWARD FROM THE ANCHOR, NEVER INWARD.
 *
 * The first build seated every neighbour on a ring around the selected node.
 * It opened beautifully and it was wrong: a Risk's citations live in the
 * evidence sector six hundred units away, and gathering them around the Risk
 * teleports them out of the region the map says they are in. That is not a
 * local world, it is a local world built by destroying the global one — the
 * exact failure this tranche exists to avoid. A neighbour that is already far
 * enough away is already legible; it needs an edge drawn to it, not a new
 * address.
 *
 * So a bloom is a purely LOCAL event, and it has a reach:
 *
 *   RELATED AND NEAR    banded seats. These are the ones that open.
 *   UNRELATED AND NEAR  the penumbra: pushed aside, homed, springs back.
 *   RELATED AND FAR     lit, and left exactly where they are.
 *   FAR AND UNRELATED   pinned. Untouched.
 *
 * Within the reach the arrangement is by relationship role (§3): the classes
 * take angular bands in BAND_ORDER, arcs proportional to their populations,
 * separated by a gap so they read as three groups rather than one ring. A
 * node reachable by two kinds of edge takes the strongest. That ordering is
 * Signal's own `edgeFocusClass`, read off the export — nothing here invents a
 * meaning for a relationship.
 *
 * Radius follows from arc length rather than being chosen: every member is
 * given the same arc-distance `spacing` from its neighbour, so
 *
 *     R0 = (participants × spacing) / (2π × (1 − bandGap))
 *
 * A node with four neighbours opens a little and a node with a hundred opens
 * a lot, and THE SEPARATION BETWEEN MARKS IS THE SAME in both. That constant
 * is what §10 is really asking about, and deriving the radius from it makes
 * it a property of the design rather than a number that happened to come out
 * well. A band too populous for one row wraps into concentric rows at the
 * same spacing, so density stays uniform in both directions.
 *
 * Deterministic throughout: sorted by id, never by array order, so nothing
 * depends on how the export happened to be written out.
 */
/** How far past the seating ring a node can be and still take part. Beyond
    this the bloom does not reach it, which is what keeps the event local. */
const BLOOM_REACH = 2.4;

/**
 * HOW BIG A LOCAL WORLD IS ALLOWED TO GET.
 *
 * The packing law is honest but unbounded, and at 59 members it produced a
 * single ring of radius 228 — wider than the Risk, Commitment and Unknown
 * cells put together, overlapping all three, and no longer reading as
 * anything local. A bloom that swallows its neighbours has not created a
 * local world; it has become the world.
 *
 * So the ring is capped and the overflow wraps into concentric rows at the
 * same spacing. The Dev Standup's 26 passages (R0 100.7) are untouched; the
 * Observation cell's 59 become two rings instead of one enormous one, and the
 * spacing law — the thing §10 actually depends on — still holds inside each.
 */
const BLOOM_MAX_R = 124;

function bloomSeats(anchorId, memberIds = null) {
  const a = byId.get(anchorId);
  if (!a) return null;

  // ── CLASSIFY ────────────────────────────────────────────────────────
  const cls = new Map();
  for (const [other, c] of incident.get(anchorId) ?? []) {
    if (other === anchorId) continue;
    if (c === "contextual" && !bloomContextual) continue;
    const prev = cls.get(other);
    if (prev == null || BAND_RANK.get(c) < BAND_RANK.get(prev)) cls.set(other, c);
  }
  if (memberIds) {
    // A GROUP bloom. The cell's own membership decides who takes part, and
    // each member keeps its real relationship class to the hub so the bands
    // stay truthful. A member with no direct edge is still a member — it
    // takes provenance rather than being dropped, because dropping it would
    // make the group bloom lie about the group's size.
    for (const id of memberIds) {
      if (id === anchorId || cls.has(id)) continue;
      cls.set(id, "provenance");
    }
  }
  const all = [...cls.keys()].filter((id) => byId.has(id));
  if (!all.length) return null;

  const distOf = (id) => { const n = byId.get(id); return Math.hypot(n.x - a.x, n.y - a.y); };
  const floorR = a.rad + B.spacing * 2.2;
  const ringFor = (k) => Math.min(BLOOM_MAX_R, Math.max(floorR, (k * B.spacing) / (TAU * (1 - B.bandGap))));

  // Reach depends on how many take part, and how many take part depends on
  // reach. Two passes settle it: size the ring on everyone, use that to find
  // who is actually near, then size it again on those. A third pass never
  // changes the answer because the set only shrinks.
  let R0 = ringFor(all.length);
  let near = all.filter((id) => distOf(id) < R0 * BLOOM_REACH);
  R0 = ringFor(Math.max(1, near.length));
  near = all.filter((id) => distOf(id) < R0 * BLOOM_REACH);
  if (!near.length) return { anchor: anchorId, seats: new Map(), R0, bands: [], far: all.length };

  // ── BAND ────────────────────────────────────────────────────────────
  const byBand = new Map();
  for (const id of near) {
    const c = cls.get(id);
    if (!byBand.has(c)) byBand.set(c, []);
    byBand.get(c).push(id);
  }
  // Within a band, order by CURRENT BEARING, not by id. Sorting by id would
  // shuffle marks across the anchor for no reason a reader could follow; by
  // bearing, every node takes the seat nearest to where it already was and
  // the opening reads as the crowd stepping back rather than reshuffling.
  // Ties break on id, so the result is still fully deterministic.
  const bearing = (id) => { const n = byId.get(id); return Math.atan2(n.y - a.y, n.x - a.x); };
  for (const list of byBand.values()) {
    list.sort((x, y) => bearing(x) - bearing(y) || (x < y ? -1 : x > y ? 1 : 0));
  }
  const bands = BAND_ORDER.filter((c) => byBand.has(c)).map((c) => ({ cls: c, ids: byBand.get(c) }));
  const total = near.length;

  // Bands start from the direction pointing AWAY from the field's centre, so
  // a bloom opens outward into empty ground rather than back through the
  // middle of the map. Reality has no outward and opens along +x — stated
  // rather than left to a NaN.
  const ox = a.x - FIELD.cx, oy = a.y - FIELD.cy;
  const base = Math.hypot(ox, oy) < 1e-6 ? 0 : Math.atan2(oy, ox);

  const gapEach = (TAU * B.bandGap) / bands.length;
  const seats = new Map();
  let cursor = base - TAU / 2 + gapEach / 2;
  for (const band of bands) {
    const arc = (band.ids.length / total) * TAU * (1 - B.bandGap);
    let placed = 0, row = 0;
    while (placed < band.ids.length) {
      const rowR = R0 + row * B.spacing;
      const cap = Math.max(1, Math.floor((arc * rowR) / B.spacing));
      const take = Math.min(cap, band.ids.length - placed);
      for (let i = 0; i < take; i++) {
        const id = band.ids[placed + i];
        const t = take === 1 ? 0.5 : (i + 0.5) / take;
        const ang = cursor + arc * t;
        const d = distOf(id);
        seats.set(id, {
          cls: band.cls,
          // OUTWARD ONLY. A node already beyond its row keeps its distance;
          // the bloom rearranges it in angle but never hauls it in.
          r: Math.max(rowR, d),
          ang,
          // How much of the bloom this node feels. Full at the anchor's
          // doorstep, nothing at the edge of reach — which is what makes the
          // disturbance fade out instead of ending at a hard circle.
          w: Math.max(0, Math.min(1, (R0 * BLOOM_REACH - d) / Math.max(1e-6, R0 * (BLOOM_REACH - 1)))),
        });
      }
      placed += take;
      row++;
      if (row > 40) break; // a corpus this shape does not exist; a guard, not a policy
    }
    cursor += arc + gapEach;
  }
  return {
    anchor: anchorId,
    seats,
    R0,
    bands: bands.map((b) => ({ cls: b.cls, n: b.ids.length })),
    far: all.length - near.length,
  };
}

/**
 * THE BLOOM STATE.
 *
 * `amount` ramps 0→1 on selection and 1→0 on exit, and EVERY term below is
 * multiplied by it, so there is no step change anywhere: no snap on entry, no
 * snap on release, and an interruption part-way through is just a different
 * target for the same continuous number.
 */
let bloom = null;      // { anchor, seats, amount, dir, t0, group }
let penumbra = null;   // Set<id> — released, homed, springs back
let homing = new Map(); // id → {x,y} rest positions to return to

/** Who yields. Everything inside the bloom's outer radius that is not part of
    the local world, is not pinned Reality, and is not in another cluster's
    sector far away. Kept deliberately generous: the room has to come from
    somewhere, and taking it from things you can see move is honest. */
function computePenumbra(anchorId, world, R) {
  const a = byId.get(anchorId);
  const out = new Set();
  if (!a) return out;
  const reach = R * B.penumbra;
  for (const n of nodes) {
    if (n.kind === "reality" || world.has(n.id)) continue;
    if (Math.hypot(n.x - a.x, n.y - a.y) < reach) out.add(n.id);
  }
  return out;
}

/** §1 APPROACH A — temporary collision-radius inflation.
    d3's forceCollide caches radii at initialize(), so a live accessor is not
    enough; the force is re-initialized whenever the inflation has moved far
    enough to matter. That is O(n) and happens a few dozen times per bloom,
    not per tick. */
let collideForce = null;
let lastInflate = -1;
function collR(n) { return (footprint(n) + 2.2) * (n._inflate ?? 1); }
/** True while the world is on its way back to a rest layout it already held.
    That layout is known to be overlap-free, which is what licenses the
    collide relaxation below. */
let returning = false;

function syncInflation(force = false) {
  const amt = bloom ? bloom.amount : 0;
  if (!force && Math.abs(amt - lastInflate) < 0.02) return;
  lastInflate = amt;
  const useA = approach === "a" || approach === "ab";
  for (const n of nodes) n._inflate = 1;
  if (useA && bloom) {
    // In the combination the seats have ALREADY separated the local world, so
    // full inflation on top of them is a second, redundant shove: measured on
    // the source with eight passages it moved members 111 units to buy 22
    // units of clearance, worse on both counts than either mechanism alone.
    // Inflation's job in `ab` is only to guarantee no overlap survives.
    const strengthK = approach === "ab" ? 0.5 : 1;
    const k = 1 + (B.inflate - 1) * amt * strengthK;
    for (const id of bloom.seats.keys()) { const n = byId.get(id); if (n) n._inflate = k; }
    const an = byId.get(bloom.anchor); if (an) an._inflate = k;
  }
  collideForce.initialize(nodes, sim.randomSource());
}

/** §1 APPROACH B — an explicit outward seating force from the anchor.
    Not a repulsion: a spring toward a COMPUTED SEAT, which is what lets the
    opening settle at a chosen distance instead of running away, and what
    makes §3's angular bands possible at all. */
function forceBloom() {
  let ns;
  function force(alpha) {
    if (!bloom) return;
    const useB = approach === "b" || approach === "ab";
    const amt = bloom.amount;
    const a = byId.get(bloom.anchor);
    if (useB && amt > 0.001 && a) {
      const k = B.open * amt;
      for (const [id, seat] of bloom.seats) {
        const n = byId.get(id);
        if (!n || n.fx != null || n.dragging) continue;
        // Seats are polar and read against the LIVE anchor, so dragging the
        // selected node carries its whole world instead of tearing it off.
        // `seat.w` fades the effect to nothing at the edge of reach.
        const sx = a.x + Math.cos(seat.ang) * seat.r;
        const sy = a.y + Math.sin(seat.ang) * seat.r;
        const kw = k * seat.w;
        n.vx += (sx - n.x) * kw;
        n.vy += (sy - n.y) * kw;
      }
    }

    // THE PENUMBRA'S OUTWARD PUSH — where the room comes from.
    //
    // Inflation alone cannot open a crowd that has nowhere to go, and a seat
    // force alone would have the local world push through its unrelated
    // neighbours rather than past them. So everything near the anchor that
    // is NOT part of the local world is pushed radially outward, hardest at
    // the centre and to nothing at the edge, and homed the whole time — it
    // yields, and it comes back. This is the difference between a bloom that
    // makes room and one that just makes overlap.
    if (approach !== "off" && amt > 0.001 && a && penumbra && penumbra.size) {
      const reach = bloom.R0 * BLOOM_REACH;
      const k = B.clear * amt;
      const want = bloom.clearR;
      for (const id of penumbra) {
        const n = byId.get(id);
        if (!n || n.fx != null || n.dragging) continue;
        const dx = n.x - a.x, dy = n.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d >= want) continue;
        // Hardest at the centre, nothing at the edge of reach, and it stops
        // AT the clear radius rather than pushing on — so the disturbance has
        // a shape a reader can predict and a size that does not depend on how
        // long you leave the selection up.
        const w = Math.max(0, 1 - d / reach);
        const push = ((want - d) / d) * k * w;
        n.vx += dx * push;
        n.vy += dy * push;
      }
    }
    // THE PENUMBRA'S RETURN SPRING. Runs whenever anything is homed —
    // during the bloom (so yielding is bounded) and during the exit (so the
    // return is bounded). This is the term that makes §8 a guarantee rather
    // than a hope.
    if (homing.size) {
      // TWO DIFFERENT SPRINGS WEARING ONE NAME, and conflating them cost a
      // 60-unit return error on the 59-member Observation cell.
      //
      //   WHILE OPEN   a slack leash that bounds the yield without fighting
      //                the clearing it exists to bound. Scaled by alpha,
      //                because it is only ever a correction.
      //   WHILE CLOSING  the thing that actually lands the return, and it
      //                may NOT depend on alpha: the exit happens when the
      //                simulation is coldest, so an alpha-scaled spring is at
      //                its weakest exactly when it has the furthest to pull.
      //                A 242-unit excursion with a 0.079 spring does not get
      //                home inside the window, and what the measurement then
      //                reports is not "the return is imprecise" but "the
      //                return had not finished".
      const closing = !bloom || bloom.amount < 0.999;
      const kh = closing
        ? B.home * 1.7 * (bloom ? 1 - bloom.amount : 1)
        : B.home * Math.max(alpha, 0.06) * 6 * 0.08;
      for (const [id, rest] of homing) {
        const n = byId.get(id);
        if (!n || n.fx != null || n.dragging) continue;
        n.vx += (rest.x - n.x) * kh;
        n.vy += (rest.y - n.y) * kh;
      }
    }
  }
  force.initialize = (_) => { ns = _; };
  return force;
}

/** The ramp. Driven off wall clock rather than tick count so the feel is the
    same whatever the frame rate, and clamped so an interruption re-aims a
    number already in flight. */
let bloomTween = null;
function rampBloom(to, ms) {
  bloomTween = { from: bloom ? bloom.amount : 0, to, t0: performance.now(), ms };
}
function stepBloom() {
  if (!bloomTween || !bloom) return;
  const t = Math.min(1, (performance.now() - bloomTween.t0) / bloomTween.ms);
  // easeOutCubic on the way open — fast commitment, soft arrival, which is
  // what makes a click feel acknowledged. Linear-ish on the way back.
  const e = bloomTween.to > bloomTween.from ? 1 - Math.pow(1 - t, 3) : t;
  bloom.amount = bloomTween.from + (bloomTween.to - bloomTween.from) * e;
  syncInflation();
  if (t >= 1) {
    bloomTween = null;
    if (bloom.amount <= 0.001) endBloom();
  }
}

function endBloom() {
  bloom = null;
  penumbra = null;
  syncInflation(true);
  // The homing springs stay on for one cooling window after the bloom is
  // gone, which is what actually lands the return. They are cleared by the
  // cool timer, not here.
}

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
  // DURING A RETURN, THE FIELD IS STILL THE FIELD.
  //
  // `select(null)` used to clear `neighbours` and free every node, which was
  // right in B2 — nothing had moved, so releasing cost nothing. With a bloom
  // it is a leak: the 220 nodes that never moved have nothing to return TO,
  // and freeing them into a return phase where collide is deliberately
  // relaxed let them drift. Measured, that was the whole of the 3.66-unit
  // "return error" attributed to the field, and it was my own doing.
  //
  // So while anything is homing, only the homing set is free. Everything else
  // holds the position it never left.
  const homeOnly = !neighbours && homing.size > 0;
  for (const n of nodes) {
    if (n.kind === "reality" || n.dragging) continue;
    const free = homeOnly
      ? homing.has(n.id)
      : !neighbours || neighbours.has(n.id) || penumbra?.has(n.id) || homing.has(n.id);
    if (free) { n.fx = null; n.fy = null; }
    else { n.fx = n.x; n.fy = n.y; }
  }
}

function select(id, opts = {}) {
  if (coolTimer) { clearTimeout(coolTimer); coolTimer = null; }
  const prev = bloom;
  selected = id;
  neighbours = id ? localWorld(id) : null;

  if (id && approach !== "off") {
    const seats = bloomSeats(id, opts.members ?? null);
    if (seats) {
      // §7 FOCUS TRANSFER. Everything the OUTGOING bloom moved and the
      // incoming one does not claim becomes homed — it is already in flight,
      // so it is redirected home rather than stopped. Nothing is zeroed and
      // no position is written, which is what keeps a fast A→B→C sequence
      // continuous instead of three separate animations fighting.
      if (prev) {
        for (const oid of prev.seats.keys()) {
          if (!seats.seats.has(oid) && oid !== id && !homing.has(oid)) {
            const r = restOf.get(oid);
            if (r) homing.set(oid, r);
          }
        }
      }
      // Remember where the world was BEFORE this bloom touched it. Recorded
      // once per node, never overwritten, so a chain of selections all return
      // to the same rest world rather than to each other's transients.
      for (const nid of seats.seats.keys()) rememberRest(nid);
      if (neighbours) for (const nid of neighbours) rememberRest(nid);
      const world = new Set([id, ...seats.seats.keys()]);
      penumbra = computePenumbra(id, world, seats.R0);
      for (const nid of penumbra) {
        rememberRest(nid);
        homing.set(nid, restOf.get(nid));
      }
      // Retarget, never restart: an interrupted bloom keeps its current
      // amount as the new ramp's starting point.
      if (returning) { returning = false; syncForces(); }
      const carry = prev ? prev.amount : 0;
      // HOW MUCH ROOM THE SELECTION GETS. Outside the seating ring by one
      // spacing, so the seated neighbours are inside the clearing rather than
      // being pushed out of it by the crowd they displaced.
      const an = byId.get(id);
      const clearR = Math.max(an.rad + B.spacing * 2.6, seats.R0 + B.spacing * (seats.seats.size ? 1.35 : 0.9));
      bloom = { anchor: id, seats: seats.seats, R0: seats.R0, clearR, bands: seats.bands, far: seats.far, amount: carry, group: opts.members ? (opts.groupId ?? null) : null };
      rampBloom(1, B.ramp * (1 - carry * 0.45));
      syncInflation(true);
    } else {
      // A node with no meaningful relationships has no local world to open,
      // and pretending otherwise by inflating it alone would be exactly the
      // "just scale the selected node" the brief rules out.
      if (prev) closeBloom();
    }
  } else if (!id || approach === "off") {
    closeBloom();
  }

  // After closeBloom, so the homing set exists when pinning reads it.
  applyPinning();
  // TOP UP, NEVER RESET. `sim.alpha(x)` where x is below the current alpha
  // would slow a run in progress; Math.max keeps momentum.
  sim.alpha(Math.max(sim.alpha(), V.reheat)).restart();
  if (id) {
    coolTimer = setTimeout(() => {
      // B2 released the pins after one cooling window so the world could
      // finish settling. With a bloom pushing outward that release let the
      // field drift for as long as the selection was held — small, but the
      // promise is that the map does not move, and "small" is not "does not".
      // While a bloom is open the field stays pinned; release is the exit's
      // job, not the timer's.
      if (!bloom) applyPinningRelease();
      coolTimer = null;
    }, V.cool);
  } else if (homing.size === 0) {
    // B2 released everything the moment a selection was dropped, which was
    // right when nothing had moved. With a return in progress it undoes the
    // pinning applied three lines above and hands the whole field to a
    // simulation whose collide is deliberately relaxed. Measured: the 220
    // nodes that held EXACTLY still for the entire bloom — mean 0.000, max
    // 0.000 — came out of the exit 3.75 units out. The release belongs to the
    // home timer, once the return has landed.
    applyPinningRelease();
  }
  if (!opts.silent) frameSelection(id);
  needsDraw();
}

/** §8 EXIT. The bloom ramps back to zero and everything it moved is homed to
    the position it held before the first bloom touched it. The homing springs
    outlive the ramp by one exit window — that overhang is what turns "close
    to where it was" into a bounded return. */
function closeBloom() {
  if (bloom) {
    for (const id of bloom.seats.keys()) { const r = restOf.get(id); if (r) homing.set(id, r); }
    // The local world is `localWorld()` — incident neighbours PLUS the
    // selection's own cell — and it is wider than the set that got seats. The
    // unseated remainder was released for the whole bloom and, until this
    // line, was never asked to come back.
    if (neighbours) for (const id of neighbours) { const r = restOf.get(id); if (r) homing.set(id, r); }
    rampBloom(0, B.exit);
    returning = true;
    syncForces();
  } else {
    endBloom();
  }
  if (homeTimer) clearTimeout(homeTimer);
  homeTimer = setTimeout(() => {
    homing.clear();
    // The rest world is re-captured on the next bloom rather than kept
    // forever. Keeping it would make every future return aim at a layout
    // that no longer exists after a morph or a drag; re-capturing means the
    // measured return error is cumulative and honest.
    restOf.clear();
    homeTimer = null;
    returning = false;
    syncForces();
    applyPinningRelease();
    needsDraw();
    // Sized to the excursion, not fixed: a cell that travelled 242 units
    // needs longer to land than one that travelled 8, and a constant window
    // silently truncates the big ones.
  }, B.exit + V.cool + Math.min(2600, homeSpan() * 6));
}
let homeTimer = null;
/** The furthest anything currently has to travel to get home, in world units.
    Used only to size the return window. */
function homeSpan() {
  let m = 0;
  for (const [id, r] of homing) {
    const n = byId.get(id);
    if (n) m = Math.max(m, Math.hypot(n.x - r.x, n.y - r.y));
  }
  return m;
}

/** The rest world — where every node sat before any bloom moved it. */
const restOf = new Map();
function rememberRest(id) {
  if (restOf.has(id)) return;
  const n = byId.get(id);
  if (n) restOf.set(id, { x: n.x, y: n.y });
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
  // §6 — FRAME THE BLOOM, NOT THE REST STATE. The seats are known the
  // instant the selection is made, so the camera can make its ONE move
  // against the world the bloom is about to become. Framing the pre-bloom
  // bounds and then watching the neighbourhood expand out of frame is
  // exactly the "camera chasing the physics" §13 of B2 ruled out.
  const box = members.concat(n);
  if (bloom && bloom.anchor === id) {
    for (const seat of bloom.seats.values()) {
      box.push({ x: n.x + Math.cos(seat.ang) * seat.r, y: n.y + Math.sin(seat.ang) * seat.r, rad: 4 });
    }
  }
  const b = boundsOf(box);
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
/** §3 — the same three colours the edges already use. A band is not given a
    colour of its own, because a band is not a new idea: it is the edges of
    one class, arranged. */
const BAND_COLOR = { semantic: "#58a6cc", temporal: "#e6edf3", provenance: "#2b6a84", contextual: "#6b7278" };
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

  // §3 — THE BANDS, DRAWN AS THE FAINTEST POSSIBLE ARC. Not decoration and
  // not a chart: the arc is exactly where the seats are, so what the reader
  // sees is the physics' own structure. It fades in with the bloom and is
  // gone at rest.
  if (bloom && bloom.amount > 0.02) {
    const a = byId.get(bloom.anchor);
    if (a) {
      let cursor = null;
      const seats = [...bloom.seats.values()];
      const byCls = new Map();
      for (const st of seats) {
        const e = byCls.get(st.cls) ?? { min: Infinity, max: -Infinity, r: 0, n: 0 };
        e.min = Math.min(e.min, st.ang); e.max = Math.max(e.max, st.ang);
        e.r = Math.max(e.r, st.r); e.n++;
        byCls.set(st.cls, e);
      }
      for (const [cls, e] of byCls) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, e.r + 7, e.min - 0.04, e.max + 0.04);
        ctx.strokeStyle = hexA(BAND_COLOR[cls] ?? C.soft, 0.20 * bloom.amount);
        ctx.lineWidth = 1 / cam.k;
        ctx.stroke();
      }
      void cursor;
    }
  }

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
  // The ramp is wall-clock, so it must advance even in a frame where the
  // simulation did not tick — otherwise a bloom that starts while alpha is
  // near zero opens in jumps.
  if (bloomTween) { stepBloom(); needsDraw(); }
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
  // The rest world about to be described no longer exists; homing at the old
  // positions would drag nodes back into the mode being left.
  bloom = null; bloomTween = null; penumbra = null; homing.clear(); restOf.clear();
  if (homeTimer) { clearTimeout(homeTimer); homeTimer = null; }
  syncInflation(true);
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

  // ── B3 CONTROLS ────────────────────────────────────────────────────
  approach: (a) => { if (a == null) return approach; approach = APPROACHES.has(a) ? a : approach; syncInflation(true); return approach; },
  strengths: () => Object.keys(BLOOMS),
  strength: (k) => {
    if (k == null) return strength;
    if (BLOOMS[k]) { strength = k; B = BLOOMS[k]; syncInflation(true); }
    return strength;
  },
  contextual: (on) => { if (on != null) bloomContextual = !!on; return bloomContextual; },

  /** §4/§5 — select a GROUP: Signal's own aggregate, opened around its hub.
      The hub is the anchor when the aggregate has one (a source and its
      passages); otherwise the member closest to the cell centroid stands in,
      because a cell has to open around something that is actually there. */
  selectGroup: (gid) => {
    const g = GROUPS.get(gid);
    if (!g) return null;
    const ids = [...g.ids];
    const agg = data.aggregates.find((a) => a.id === gid);
    let anchor = agg?.hub && byId.has(agg.hub) ? agg.hub : null;
    if (!anchor) {
      let best = null, bd = Infinity;
      for (const id of ids) {
        const n = byId.get(id); if (!n) continue;
        const d = Math.hypot(n.x - g.cx, n.y - g.cy);
        if (d < bd) { bd = d; best = id; }
      }
      anchor = best;
    }
    if (!anchor) return null;
    select(anchor, { members: ids.filter((i) => i !== anchor), groupId: gid });
    return { gid, anchor, count: g.count, label: g.label };
  },

  /** The camera, so §6 can ask whether it made ONE move rather than chased. */
  camera: () => ({ x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), k: +cam.k.toFixed(4) }),

  /** A hand on the canvas. §13 of B2 says any hand input cancels the camera
      outright; this is that input, without needing a synthetic pointer event
      to reach the right listener. */
  nudge: (dx, dy) => { camTween = null; cam.x -= dx / cam.k; cam.y -= dy / cam.k; needsDraw(); },

  /** Is the settled local world inside the frame the camera chose? Reported
      in CSS pixels of margin, negative meaning off screen. */
  localOnScreen: (id) => {
    const a = byId.get(id ?? selected ?? "");
    if (!a) return null;
    const ids = bloom && bloom.anchor === a.id ? [a.id, ...bloom.seats.keys()] : [a.id];
    let inside = 0, worst = Infinity;
    for (const i of ids) {
      const n = byId.get(i);
      if (!n) continue;
      const sx = (n.x - cam.x) * cam.k + size.w / 2;
      const sy = (n.y - cam.y) * cam.k + size.h / 2;
      const m = Math.min(sx, sy, size.w - sx, size.h - sy);
      if (m > 0) inside++;
      worst = Math.min(worst, m);
    }
    return { total: ids.length, inside, worstMargin: +worst.toFixed(1) };
  },

  /** Exactly which nodes the simulation is currently holding fixed. The
      difference between "should be pinned" and "is pinned" is where a field
      that promises not to move goes wrong, and it is not inferrable from
      positions. */
  pinned: () => nodes.filter((n) => n.fx != null).map((n) => n.id),

  /** IS ANYTHING STILL IN FLIGHT. A return window is now sized to the
      excursion — up to 4.5 seconds for a 59-member cell — so a driver that
      waits a fixed two seconds between measurements starts the next one on
      top of the last one's return and reports the contamination as drift.
      Asking is the fix; guessing a longer sleep is not. */
  busy: () => ({
    bloom: !!bloom,
    amount: bloom ? +bloom.amount.toFixed(3) : 0,
    ramping: !!bloomTween,
    homing: homing.size,
    camera: !!camTween,
    morphing,
    alpha: +sim.alpha().toFixed(4),
    returning,
    settled: !bloom && !bloomTween && homing.size === 0 && !camTween && !morphing && !returning,
  }),

  /** §3 over the WHOLE corpus: how often does a bloom actually contain more
      than one relationship class? "Semantic, temporal and provenance in
      distinguishable angular bands" is only a design if the corpus produces
      multi-class neighbourhoods; if it does not, the banding is correct and
      invisible, and saying so is the finding. */
  bandCensus: () => {
    const out = { total: 0, withSeats: 0, byBandCount: {}, classCombos: {}, multi: [] };
    for (const n of nodes) {
      out.total++;
      const s = bloomSeats(n.id);
      if (!s || !s.seats.size) continue;
      out.withSeats++;
      const k = s.bands.length;
      out.byBandCount[k] = (out.byBandCount[k] ?? 0) + 1;
      const combo = s.bands.map((b) => b.cls).join("+");
      out.classCombos[combo] = (out.classCombos[combo] ?? 0) + 1;
      if (k > 1) out.multi.push({ id: n.id, kind: n.kind, bands: s.bands });
    }
    return out;
  },

  /** What a bloom on this node WOULD contain, computed without running one.
      §1's honest denominator: a bloom is a local event, so how many of the
      407 objects in this corpus even have a crowded neighbourhood to open is
      a property of the corpus, not of the physics, and the answer has to be
      measured rather than demonstrated on a node that happens to look good. */
  preview: (id) => {
    const s = bloomSeats(id);
    if (!s) return { id, seats: 0, far: 0, bands: [] };
    const a = byId.get(id);
    let crowd = 0;
    const reach = s.R0 * 2.4;
    for (const n of nodes) if (n.id !== id && Math.hypot(n.x - a.x, n.y - a.y) < reach) crowd++;
    return { id, seats: s.seats.size, far: s.far, bands: s.bands, R0: +s.R0.toFixed(1), crowd };
  },

  /** What the bloom currently IS — the state a measurement needs to describe
      itself honestly rather than inferring from positions. */
  bloom: () => bloom && ({
    anchor: bloom.anchor,
    amount: +bloom.amount.toFixed(3),
    R0: +bloom.R0.toFixed(1),
    clearR: +bloom.clearR.toFixed(1),
    bands: bloom.bands,
    seats: bloom.seats.size,
    far: bloom.far ?? 0,
    penumbra: penumbra ? penumbra.size : 0,
    homing: homing.size,
    group: bloom.group,
  }),

  /** Every node's role in the current bloom, so a driver can partition its
      measurements the way the design does instead of guessing radii. */
  rings: () => {
    const local = bloom ? new Set([bloom.anchor, ...bloom.seats.keys()]) : new Set();
    const pen = new Set(penumbra ?? []);
    return {
      local: [...local],
      penumbra: [...pen].filter((id) => !local.has(id)),
      field: nodes.filter((n) => !local.has(n.id) && !pen.has(n.id)).map((n) => n.id),
    };
  },

  /** §10 — LABEL READINESS. Screen-space separation between the SELECTED
      node's own neighbours, which is the number that decides whether each of
      them could carry a name. Reported in CSS pixels at the live camera, not
      in world units, because a label is drawn in pixels. */
  labelRoom: () => {
    if (!bloom) return null;
    const pts = [];
    for (const id of bloom.seats.keys()) {
      const n = byId.get(id);
      if (n) pts.push({ id, x: (n.x - cam.x) * cam.k, y: (n.y - cam.y) * cam.k, r: n.rad * cam.k });
    }
    if (pts.length < 2) return { n: pts.length, min: null, median: null, p10: null };
    const ds = [];
    for (let i = 0; i < pts.length; i++) {
      let best = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) - pts[i].r - pts[j].r;
        best = Math.min(best, d);
      }
      ds.push(best);
    }
    ds.sort((a, b) => a - b);
    const q = (f) => +ds[Math.min(ds.length - 1, Math.floor(ds.length * f))].toFixed(2);
    return { n: pts.length, min: q(0), p10: q(0.10), median: q(0.5), max: +ds[ds.length - 1].toFixed(2) };
  },

  /** §1's real question, as one number: HOW MUCH CLEAR SPACE IS THERE AROUND
      THE SELECTION. Measured as the distance to the nearest object that is
      not part of its local world — before and after, the difference is the
      bloom. Works with no bloom running, which is what makes the before
      measurement possible. */
  clearance: (id) => {
    const a = byId.get(id ?? selected ?? "");
    if (!a) return null;
    const world = bloom && bloom.anchor === a.id ? new Set([a.id, ...bloom.seats.keys()]) : new Set([a.id]);
    let nearest = Infinity, nid = null, inRing = 0;
    for (const n of nodes) {
      if (world.has(n.id)) continue;
      const d = Math.hypot(n.x - a.x, n.y - a.y) - n.rad - a.rad;
      if (d < nearest) { nearest = d; nid = n.id; }
      if (d < 60) inRing++;
    }
    return { of: a.id, clear: +nearest.toFixed(2), nearest: nid, within60: inRing };
  },

  /** The bloom's own geometry in world units — how far the neighbourhood
      actually got from the anchor, which is §1's real question. */
  spread: () => {
    if (!bloom) return null;
    const a = byId.get(bloom.anchor);
    if (!a) return null;
    const ds = [];
    for (const id of bloom.seats.keys()) {
      const n = byId.get(id);
      if (n) ds.push(Math.hypot(n.x - a.x, n.y - a.y));
    }
    if (!ds.length) return null;
    ds.sort((x, y) => x - y);
    const mean = ds.reduce((p, c) => p + c, 0) / ds.length;
    return {
      n: ds.length,
      min: +ds[0].toFixed(1),
      median: +ds[Math.floor(ds.length / 2)].toFixed(1),
      mean: +mean.toFixed(1),
      max: +ds[ds.length - 1].toFixed(1),
      R0: +bloom.R0.toFixed(1),
    };
  },

  /** Pairwise overlap inside the local world only — the thing inflation is
      supposed to fix and the thing a seat force alone cannot promise. */
  localOverlap: () => {
    if (!bloom) return null;
    const ids = [bloom.anchor, ...bloom.seats.keys()];
    const ns = ids.map((i) => byId.get(i)).filter(Boolean);
    let pairs = 0, worst = 0;
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++) {
        const d = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y) - ns[i].rad - ns[j].rad;
        if (d < 0) { pairs++; worst = Math.min(worst, d); }
      }
    return { nodes: ns.length, pairs, worst: +worst.toFixed(2) };
  },

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
    if (homeTimer) { clearTimeout(homeTimer); homeTimer = null; }
    bloom = null; bloomTween = null; penumbra = null; homing.clear(); restOf.clear();
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
