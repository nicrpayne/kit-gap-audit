// PROTOTYPE A — ANTV G6 5, HYBRID.
//
// The hypothesis worth testing here is NOT "is G6 a nice library". It is:
// Signal's hardest layout problem is GROUPS — keep 24 commitments together,
// inside the Hermes sector, without hand-shelving them — and G6 is the only
// candidate that ships a first-class combo layout. `ComboCombined` runs an
// outer layout over the combos and an inner layout inside each one, which is
// precisely the two-level structure prototype B had to hand-build.
//
// So this wires Signal's own aggregates in as combos, asks G6 for the
// hybrid, and reports what that buys and what it costs.

import { Graph } from "@antv/g6";
import { loadGraph, colorOf, makeMeter, importanceOf, radiusOf, overlapStats, spacingStats, occupancy, crossings, displacement, sectorFidelity } from "./harness.js";

const data = await loadGraph();
const importance = importanceOf(data);

// Signal's aggregates ARE the combos. G6 is told what the groups are; it
// never discovers them, so no semantics are reinterpreted.
const comboOf = new Map();
for (const a of data.aggregates) {
  for (const m of a.members) comboOf.set(m, a.id);
  if (a.hub) comboOf.set(a.hub, a.id);
}
// Everything ungrouped falls back to its semantic region, so the outer
// layout still has Signal's territories to work with.
// `region:`, not `lane:` — G6 5 keeps NODES AND COMBOS IN ONE ID NAMESPACE,
// and Signal's graph already contains real nodes called `lane:decisions`.
// Reusing the id throws "Node already exists" at render. Worth knowing
// before an adoption: an engine that owns the id space is an engine that can
// collide with canonical ids, which Signal is not allowed to renumber.
const laneCombo = (n) => (n.slice === "core" ? undefined : `region:${n.lane ?? "misc"}`);

const combos = [
  ...data.aggregates.map((a) => ({ id: a.id, data: { label: a.label, count: a.count } })),
  ...data.clusters.map((c) => ({ id: `region:${c}`, data: { label: c } })),
];

const nodes = data.nodes.map((n) => ({
  id: n.id,
  combo: comboOf.get(n.id) ?? laneCombo(n),
  data: { ...n, rad: radiusOf(n, importance), color: colorOf(n) },
}));
const edges = data.edges
  .filter((e) => e.cls === "semantic" || e.cls === "temporal" || e.cls === "provenance")
  .map((e) => ({ id: e.id, source: e.source, target: e.target, data: { cls: e.cls } }));

const EDGE_STROKE = { semantic: "#58a6cc", temporal: "#e6edf3", provenance: "#2b4a5c" };

// G6 5 wants a DIV and creates its own canvas inside it. Handed the id of
// the harness's shared <canvas> it appends into an element that cannot have
// children, reports perfectly good positions, and draws nothing — silently.
const host = document.createElement("div");
host.style.cssText = "position:absolute;inset:0";
document.body.insertBefore(host, document.getElementById("hud"));
document.getElementById("c").style.display = "none";

const graph = new Graph({
  container: host,
  autoResize: true,
  data: { nodes, edges, combos },
  // Signal's palette, not G6's. The brief is explicit that we are not
  // evaluating styling, so every prototype paints the same.
  node: {
    style: {
      size: (d) => (d.data.rad ?? 5) * 2,
      fill: (d) => d.data.color,
      stroke: "transparent",
      lineWidth: 0,
      labelText: "",
    },
  },
  edge: {
    style: {
      stroke: (d) => EDGE_STROKE[d.data.cls] ?? "#243039",
      lineWidth: (d) => (d.data.cls === "provenance" ? 0.4 : 0.8),
      strokeOpacity: (d) => (d.data.cls === "provenance" ? 0.16 : 0.4),
      endArrow: false,
    },
  },
  combo: {
    type: "circle",
    style: {
      fill: "rgba(120,132,144,0.05)",
      stroke: "rgba(120,132,144,0.24)",
      lineWidth: 1,
      labelText: "",
      padding: 6,
    },
  },
  layout: {
    // THE HYBRID THE BRIEF ASKS FOR: combos placed by a force layout over the
    // group graph, members packed by concentric inside each combo, collision
    // on so cells do not overlap.
    type: "combo-combined",
    comboPadding: 8,
    nodeSize: (d) => (d.data?.rad ?? 5) * 2 + 5,
    spacing: 6,
    outerLayout: { type: "force", preventOverlap: true, nodeSpacing: 14, linkDistance: 90 },
    innerLayout: { type: "concentric", sortBy: "id", nodeSize: 12, preventOverlap: true },
  },
  behaviors: ["drag-canvas", "zoom-canvas", "drag-element", "click-select", "hover-activate"],
  background: "#0a0d10",
});

let settleMs = null;
const t0 = performance.now();
await graph.render();
settleMs = performance.now() - t0;

/** G6 owns the positions; the harness's metrics need plain {id,x,y,rad}. */
function snap() {
  const d = graph.getData();
  return d.nodes.map((n) => {
    const p = graph.getElementPosition(n.id);
    const src = data.nodes.find((x) => x.id === n.id);
    return { id: n.id, x: p[0], y: p[1], rad: n.data.rad, lane: src?.lane, slice: src?.slice, kind: src?.kind };
  });
}

const meter = makeMeter();
window.__lab = {
  name: "A · AntV G6 combo-combined",
  ready: () => settleMs != null,
  settleMs: () => settleMs,
  alpha: () => 0,
  positions: () => new Map(snap().map((n) => [n.id, { x: n.x, y: n.y }])),
  nodes: snap,
  fit: () => graph.fitView(),
  select: (id) => {
    if (!id) return graph.setElementState({}, false);
    graph.setElementState(id, "selected");
    graph.focusElement?.(id);
  },
  setMode: (m) => {
    // G6's alternates over the SAME node ids, animated by the library.
    const L = {
      rings: { type: "combo-combined", comboPadding: 8, outerLayout: { type: "force", preventOverlap: true, nodeSpacing: 14 }, innerLayout: { type: "concentric", preventOverlap: true } },
      force: { type: "d3-force", preventOverlap: true, nodeSize: 12, link: { distance: 60 } },
      circle: { type: "concentric", preventOverlap: true, nodeSize: 12 },
    }[m];
    // `setLayout` is not promise-returning in G6 5.1 despite the docs'
    // async examples; chaining .then() throws. Fire and forget, then relayout.
    if (!L) return;
    try { graph.setLayout(L); } catch (e) { /* keep the page alive */ }
    Promise.resolve(graph.layout()).catch(() => {});
  },
  setMass: () => {},
  mode: () => "rings",
  drawMs: () => 0,
  tickCost: () => 0,
  meter,
  metrics: () => {
    const ns = snap();
    // G6 lays out in its own coordinate space; sector fidelity is measured
    // against ITS centroid, which is the only fair comparison.
    const cx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
    const cy = ns.reduce((s, n) => s + n.y, 0) / ns.length;
    return {
      overlap: overlapStats(ns),
      spacing: spacingStats(ns),
      occupancy: occupancy(ns),
      crossings: crossings(ns, data.edges),
      sector: sectorFidelity(ns, data.clusters, { cx, cy }),
    };
  },
  displacement,
  reseat: async () => {
    settleMs = null;
    const s = performance.now();
    await graph.layout();
    settleMs = performance.now() - s;
  },
};

document.getElementById("mode").textContent = "COMBO-COMBINED — force over combos, concentric inside";
document.getElementById("meta").textContent = `${nodes.length} nodes · ${edges.length} edges · ${combos.length} combos`;
setTimeout(() => graph.fitView(), 200);
