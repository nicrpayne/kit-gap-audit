// PROTOTYPE C — REACT-FORCE-GRAPH-2D.
//
// The question this one answers is narrow and worth answering: how much
// responsiveness, collision, dragging and camera do we get essentially FREE
// from a mature Canvas+d3 integration, and what does accepting its opinions
// cost?
//
// The same anchored-force policy is applied where its API allows: Signal
// seats as initial positions, meaningful relationships only, collision on,
// custom node painting so the comparison stays about space rather than style.
import React from "react";
import { createRoot } from "react-dom/client";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3-force";
import { loadGraph, colorOf, makeMeter, importanceOf, radiusOf, LINK_CLASSES, overlapStats, spacingStats, occupancy, crossings, displacement, sectorFidelity } from "./harness.js";

const data = await loadGraph();
const importance = importanceOf(data);
const nodes = data.nodes.map((n) => ({ ...n, rad: radiusOf(n, importance), _color: colorOf(n) }));
const byId = new Map(nodes.map((n) => [n.id, n]));
const links = data.edges.filter((e) => LINK_CLASSES.has(e.cls) && byId.has(e.source) && byId.has(e.target)).map((e) => ({ ...e }));

const host = document.createElement("div");
host.style.cssText = "position:absolute;inset:0";
document.body.appendChild(host);
document.getElementById("c").style.display = "none";

let fg = null;
let settleMs = null;
const t0 = performance.now();

function App() {
  const ref = React.useRef();
  React.useEffect(() => {
    fg = ref.current;
    if (!fg) return;
    // The library's own d3 forces, steered to Signal's policy.
    fg.d3Force("charge").strength(-26).distanceMax(90);
    fg.d3Force("link").distance((l) => (l.cls === "provenance" ? 26 : 46)).strength((l) => (l.cls === "semantic" ? 0.55 : l.cls === "temporal" ? 0.4 : 0.22));
    fg.d3Force("collide", d3.forceCollide((n) => n.rad + 2.5).strength(0.9).iterations(2));
    fg.d3Force("radial", d3.forceRadial((n) => n.radius, data.field.cx, data.field.cy).strength(0.35));
    fg.d3Force("x", d3.forceX((n) => n.seatX ?? n.x).strength(0.05));
    fg.d3Force("y", d3.forceY((n) => n.seatY ?? n.y).strength(0.05));
  }, []);
  return React.createElement(ForceGraph2D, {
    ref,
    graphData: { nodes, links },
    backgroundColor: "#0a0d10",
    cooldownTime: 6000,
    d3AlphaDecay: 0.022,
    d3VelocityDecay: 0.42,
    warmupTicks: 0,
    nodeRelSize: 1,
    nodeVal: (n) => n.rad,
    linkColor: (l) => (l.cls === "semantic" ? "rgba(88,166,204,0.42)" : l.cls === "temporal" ? "rgba(230,237,243,0.30)" : "rgba(88,166,204,0.13)"),
    linkWidth: (l) => (l.cls === "provenance" ? 0.4 : 0.9),
    nodeCanvasObject: (n, ctx) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.rad, 0, Math.PI * 2);
      ctx.fillStyle = n._color;
      ctx.fill();
    },
    nodePointerAreaPaint: (n, color, ctx) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.rad + 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    },
    onEngineStop: () => { if (settleMs == null) settleMs = performance.now() - t0; },
  });
}
createRoot(host).render(React.createElement(App));

const meter = makeMeter();
window.__lab = {
  name: "C · react-force-graph-2d",
  ready: () => settleMs != null,
  settleMs: () => settleMs,
  alpha: () => 0,
  positions: () => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  nodes: () => nodes,
  fit: () => fg?.zoomToFit(400, 40),
  select: (id) => { if (id) fg?.centerAt(byId.get(id)?.x, byId.get(id)?.y, 400); },
  setMode: () => {},
  setMass: () => {},
  mode: () => "force",
  drawMs: () => 0,
  tickCost: () => 0,
  meter,
  reheat: () => fg?.d3ReheatSimulation(),
  metrics: () => ({ overlap: overlapStats(nodes), spacing: spacingStats(nodes), occupancy: occupancy(nodes), crossings: crossings(nodes, data.edges), sector: sectorFidelity(nodes, data.clusters, data.field) }),
  displacement,
  reseat: () => { for (const n of nodes) { n.x = n.seatX ?? n.x; n.y = n.seatY ?? n.y; n.vx = 0; n.vy = 0; } settleMs = null; fg?.d3ReheatSimulation(); },
};
document.getElementById("hud").style.zIndex = 3;
document.getElementById("mode").textContent = "FORCE — library defaults, steered to Signal's policy";
document.getElementById("meta").textContent = `${nodes.length} nodes · ${links.length} springs · Canvas`;
