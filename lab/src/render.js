// ONE PAINTER, SO THE COMPARISON IS ABOUT SPACE.
//
// Every prototype that owns a canvas draws through this. Same palette, same
// radii, same edge weights, same selection treatment. If one prototype looks
// better than another it is because the nodes are in better places, which is
// the only thing this bake-off is allowed to conclude.

import { colorOf, PALETTE } from "./harness.js";

const EDGE_COLOR = {
  semantic: "rgba(88,166,204,0.42)",
  temporal: "rgba(230,237,243,0.30)",
  provenance: "rgba(88,166,204,0.13)",
  contextual: "rgba(120,132,144,0.10)",
  null: "rgba(0,0,0,0)",
};

export function drawScene(ctx, { nodes, edges, cam, size, selected, neighbours, hovered, regions, dpr = 1 }) {
  const { w, h } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.k, cam.k);
  ctx.translate(-cam.x, -cam.y);

  // Region halos, where a prototype supplies them: the visible answer to
  // "did the semantic territory survive the physics".
  if (regions) {
    for (const rg of regions) {
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.fillStyle = rg.tint ?? "rgba(120,132,144,0.05)";
      ctx.fill();
      ctx.strokeStyle = "rgba(120,132,144,0.22)";
      ctx.lineWidth = 1 / cam.k;
      ctx.stroke();
    }
  }

  const dim = selected != null;
  const pos = nodes;
  ctx.lineCap = "round";
  for (const e of edges) {
    const a = e._s, b = e._t;
    if (!a || !b) continue;
    const lit = dim && (neighbours?.has(e.source) || neighbours?.has(e.target));
    const base = EDGE_COLOR[e.cls ?? "null"] ?? EDGE_COLOR.null;
    if (dim && !lit && e.cls !== "semantic" && e.cls !== "temporal") continue;
    ctx.strokeStyle = lit ? "rgba(88,166,204,0.85)" : dim ? "rgba(120,132,144,0.07)" : base;
    ctx.lineWidth = (lit ? 1.5 : e.cls === "provenance" ? 0.5 : 0.9) / cam.k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // A gentle arc rather than a chord: 480 straight lines through one
    // centre is a starburst, and every engine here can bend a line.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    ctx.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, b.x, b.y);
    ctx.stroke();
  }

  for (const n of pos) {
    const r = n.rad ?? n.r ?? 4;
    const isSel = n.id === selected;
    const near = neighbours?.has(n.id);
    const alpha = !dim || isSel || near ? 1 : 0.22;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n._color ?? colorOf(n);
    ctx.fill();
    if (isSel || n.id === hovered) {
      ctx.strokeStyle = PALETTE.text;
      ctx.lineWidth = 2 / cam.k;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Hit-test in world space. Topmost = smallest, so a passage inside a hub's
    disc is still reachable. */
export function pick(nodes, wx, wy) {
  let best = null;
  let bestR = Infinity;
  for (const n of nodes) {
    const r = (n.rad ?? n.r ?? 4) + 3;
    if (Math.hypot(n.x - wx, n.y - wy) <= r && r < bestR) { best = n; bestR = r; }
  }
  return best;
}
