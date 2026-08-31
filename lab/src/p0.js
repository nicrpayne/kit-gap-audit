// PROTOTYPE 0 — CURRENT SIGNAL. The control.
//
// Signal's exact deterministic seats, replayed through the bake-off's own
// painter so that the ONLY difference between this and prototype B is where
// the nodes are. Nothing simulates; there is nothing to settle. That is the
// control's whole character and also, arguably, its whole problem.
import { loadGraph, makeCamera, boundsOf, makeMeter, colorOf, importanceOf, radiusOf, overlapStats, spacingStats, occupancy, crossings, displacement, sectorFidelity } from "./harness.js";
import { drawScene, pick } from "./render.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1);
let size = { w: 0, h: 0 };

const data = await loadGraph();
const importance = importanceOf(data);
const nodes = data.nodes.map((n) => ({ ...n, rad: n.r, _color: colorOf(n) }));
const byId = new Map(nodes.map((n) => [n.id, n]));
const edges = data.edges.map((e) => ({ ...e, _s: byId.get(e.source), _t: byId.get(e.target) }));
const regions = data.aggregates.map((a) => ({ x: a.x, y: a.y, r: a.discR, tint: "rgba(120,132,144,0.045)" }));

let selected = null, neighbours = null, hovered = null;
const cam = makeCamera(canvas, () => (dirty = true));
let dirty = true, lastDraw = 0;

function resize() {
  const r = canvas.getBoundingClientRect();
  size = { w: r.width, h: r.height };
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  dirty = true;
}
window.addEventListener("resize", resize); resize();
function frame() {
  if (dirty) { const t0 = performance.now(); drawScene(ctx, { nodes, edges, cam, size, selected, neighbours, hovered, regions, dpr }); lastDraw = performance.now() - t0; dirty = false; }
  requestAnimationFrame(frame);
}
frame();
canvas.addEventListener("pointermove", (ev) => { const w = cam.worldOf(ev); const h = pick(nodes, w.x, w.y); const id = h?.id ?? null; if (id !== hovered) { hovered = id; dirty = true; } });
function neighbourhoodOf(id) {
  const out = new Set([id]);
  for (const e of data.edges) { if (e.cls === null || e.cls === "contextual") continue; if (e.source === id) out.add(e.target); else if (e.target === id) out.add(e.source); }
  return out;
}
function select(id) { selected = id; neighbours = id ? neighbourhoodOf(id) : null; dirty = true; }
canvas.addEventListener("click", (ev) => { const w = cam.worldOf(ev); const h = pick(nodes, w.x, w.y); select(h ? (h.id === selected ? null : h.id) : null); });

window.__lab = {
  name: "0 · current Signal",
  ready: () => true,
  settleMs: () => 0,
  alpha: () => 0,
  positions: () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  nodes: () => nodes,
  fit: () => cam.fit(boundsOf(nodes), size),
  select,
  setMode: () => {},
  setMass: () => {},
  mode: () => "rings",
  drawMs: () => +lastDraw.toFixed(2),
  tickCost: () => 0,
  meter: makeMeter(),
  metrics: () => ({ overlap: overlapStats(nodes), spacing: spacingStats(nodes), occupancy: occupancy(nodes), crossings: crossings(nodes, data.edges), sector: sectorFidelity(nodes, data.clusters, data.field) }),
  displacement,
  reseat: () => {},
};
document.getElementById("mode").textContent = "RINGS — deterministic shelf-packed seats";
document.getElementById("meta").textContent = `${nodes.length} nodes · ${data.edges.length} relationships · no simulation`;
setTimeout(() => cam.fit(boundsOf(nodes), size), 60);
