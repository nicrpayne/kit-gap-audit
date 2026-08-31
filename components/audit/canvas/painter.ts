// THE CANVAS PAINTER.
//
// Takes the scene that lib/audit/visualScene.ts produced and puts it on a 2D
// context. It decides NOTHING about the product: not what is selected, not
// what a Finding means, not which sixty names fit. Every question of that
// kind was already answered upstream. This file only knows how to paint.
//
// ── THE FOUR MECHANICS THIS EXISTS TO GET ──────────────────────────────
//
// A canvas is not automatically better than SVG at 427 nodes — the SVG
// renderer is well inside its comfort zone and says so. What a canvas can do
// that the DOM cannot is these, and they are the whole reason for the slice:
//
//   BATCHING      427 nodes and 119 web paths become tens of draw calls
//                 instead of hundreds of elements. Strokes that share a
//                 colour, a width and a dash are one path and one stroke.
//
//   SPRITES       a real radial falloff, rasterised once and blitted. The
//                 SVG deliberately approximates a glow with three concentric
//                 strokes because a per-element filter is a rasterisation
//                 surface it cannot afford. A canvas can have the smooth
//                 version and pay once. See ./sprites.
//
//   ONE BLUR      optical depth costs the SVG one filter surface PER
//                 SOFTENED ELEMENT — measured there at 44% of a Trace's
//                 frame budget. Here the softened content is painted into a
//                 single offscreen layer and blurred once on composite, so
//                 the cost is one rasterisation whatever the population.
//
//   CULLING       what is off screen is not painted, and does not cost a
//                 clip either. A hidden DOM element still costs its clip.
//
// ── WHAT IT MUST NOT DO ────────────────────────────────────────────────
//
// It must not imply facts that do not exist. Signal's edge grammar is carried
// verbatim: the dash says WHOSE claim a relationship is and focus never
// overrides it; a stored relation gets no travelling dash, no flow, no
// direction it did not earn. Motion is reserved for an active Trace and for
// the selection's own pulse, and both stop under reduced motion.

import type {
  AuditScene,
  AuditVisualEdge,
  AuditVisualNode,
} from "@/lib/audit/visualScene";
import { WEB_STRAND_COLOR } from "@/lib/audit/visualScene";
import { FIELD } from "@/lib/audit/graphLayout";
import { DEPTH_BLUR_PX } from "../graphTokens";
import { TokenPalette } from "./paintTokens";
import { SpriteCache, withAlpha } from "./sprites";
import { nodeShapePath, shapeBodyTint, shapeIsOutline, arrowHeadPath } from "./shapes";

export interface PaintCamera {
  x: number;
  y: number;
  k: number;
}

export interface PaintInput {
  ctx: CanvasRenderingContext2D;
  scene: AuditScene;
  camera: PaintCamera;
  viewport: { w: number; h: number };
  dpr: number;
  palette: TokenPalette;
  sprites: SpriteCache;
  paths: PathCache;
  /** Someone who asked their system for less motion has asked this
      instrument too. Kills the pulse; never kills contrast. */
  reducedMotion: boolean;
  /** Milliseconds, for the one animated thing on the field. */
  time: number;
  sweepAngle: number | null;
  /** The font stack the surrounding document is using, so canvas text is the
      same text the SVG drew. */
  fontFamily: string;
  clusterLabels: {
    cluster: string;
    x: number;
    y: number;
    label: string;
    latent: number;
    /** Anchor the name inward — the sector is on the left half of the field. */
    flip: boolean;
    /** Whether this cluster is expanded, so the toggle reads "collapse". */
    open: boolean;
    /** A lane nothing is supplying is drawn in the faint grey the field
        already uses for that fact. */
    supplied: boolean;
  }[];
}

export interface PaintStats {
  /** Draw calls issued — the number batching is trying to hold down. */
  calls: number;
  nodesPainted: number;
  nodesCulled: number;
  edgesPainted: number;
  webPathsPainted: number;
  labelsPainted: number;
  spritesHeld: number;
  /** Whether the softened layer was needed this frame. */
  softLayer: boolean;
}

/**
 * PATH2D, BUILT ONCE.
 *
 * Edge and web geometry is WORLD SPACE and does not move with the camera —
 * the same law the SVG renderer states, for the same reason. So a Path2D per
 * curve can be built once and reused across every frame of every pan and
 * zoom; only the transform changes.
 *
 * Keyed by the path string itself rather than by an id, so a geometry change
 * is automatically a different entry and there is no invalidation to get
 * wrong. Bounded, oldest-first, for the same reason the sprite cache is.
 */
export class PathCache {
  private readonly map = new Map<string, Path2D>();
  private readonly max: number;

  constructor(max = 4000) {
    this.max = max;
  }

  get(d: string): Path2D {
    const hit = this.map.get(d);
    if (hit) return hit;
    const p = new Path2D(d);
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(d, p);
    return p;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** A world-space rectangle, with slack, for culling. */
function worldBounds(camera: PaintCamera, vp: { w: number; h: number }, slackPx: number) {
  const hw = vp.w / 2 / camera.k;
  const hh = vp.h / 2 / camera.k;
  const s = slackPx / camera.k;
  return { x0: camera.x - hw - s, y0: camera.y - hh - s, x1: camera.x + hw + s, y1: camera.y + hh + s };
}

/**
 * ONE FRAME.
 *
 * The order is the SVG's own z-order, because the reading of the field
 * depends on it: ground, then structure, then the web, then the aggregate
 * layer, then relationships, then Reality, then the objects, then the words.
 */
export function paintScene(input: PaintInput): PaintStats {
  const { ctx, scene, camera, viewport, dpr, palette, sprites, paths, fontFamily } = input;
  const k = camera.k;
  const stats: PaintStats = {
    calls: 0,
    nodesPainted: 0,
    nodesCulled: 0,
    edgesPainted: 0,
    webPathsPainted: 0,
    labelsPainted: 0,
    spritesHeld: 0,
    softLayer: false,
  };

  const W = Math.max(1, Math.round(viewport.w * dpr));
  const H = Math.max(1, Math.round(viewport.h * dpr));

  // ── GROUND ───────────────────────────────────────────────────────────
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  paintGround(ctx, W, H, palette);
  stats.calls += 2;

  const toWorld = () => {
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (viewport.w / 2 - camera.x * k), dpr * (viewport.h / 2 - camera.y * k));
  };
  const toScreen = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const bounds = worldBounds(camera, viewport, 120);

  toWorld();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ── STRUCTURE ────────────────────────────────────────────────────────
  paintStructure(ctx, scene, palette, k, stats);

  // ── THE AUDIT SWEEP ──────────────────────────────────────────────────
  if (input.sweepAngle != null) paintSweep(ctx, input.sweepAngle, palette, k, stats);

  // ── THE CALM-STATE WEB ───────────────────────────────────────────────
  if (scene.webOpacity > 0.01) paintWeb(ctx, scene, palette, paths, k, stats);

  // ── AGGREGATE LAYER ──────────────────────────────────────────────────
  if (scene.aggShellOpacity > 0.01) paintAggregates(ctx, scene, palette, paths, k, stats);
  paintSelectedAggregateOutline(ctx, scene, palette, k, stats);

  // ── RELATIONSHIPS ────────────────────────────────────────────────────
  paintEdges(ctx, scene, palette, paths, k, bounds, stats);

  // ── REALITY ──────────────────────────────────────────────────────────
  paintReality(ctx, scene, palette, sprites, k, stats);

  // ── THE OBJECTS ──────────────────────────────────────────────────────
  //
  // TWO PASSES, AND THE SPLIT IS THE POINT. Everything the reader is being
  // asked to READ is painted sharp, straight onto the frame. Everything that
  // has been pushed back is painted into one offscreen layer and blurred ONCE
  // on composite — the mechanic the SVG cannot have, because a CSS filter is
  // per element and four hundred of them is four hundred surfaces.
  const soft: AuditVisualNode[] = [];
  const sharp: AuditVisualNode[] = [];
  for (const n of scene.nodes) {
    if (n.kind === "reality") continue; // drawn above, as the hero
    if (n.opacity < 0.012) continue;
    const rr = Math.max(n.r, n.latentR) + 26 / k;
    if (n.x + rr < bounds.x0 || n.x - rr > bounds.x1 || n.y + rr < bounds.y0 || n.y - rr > bounds.y1) {
      stats.nodesCulled++;
      continue;
    }
    (n.depth > 0 ? soft : sharp).push(n);
  }

  if (soft.length > 0) {
    stats.softLayer = true;
    const layer = acquireLayer(W, H);
    if (layer) {
      const lc = layer.getContext("2d")!;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, W, H);
      lc.setTransform(dpr * k, 0, 0, dpr * k, dpr * (viewport.w / 2 - camera.x * k), dpr * (viewport.h / 2 - camera.y * k));
      lc.lineCap = "round";
      lc.lineJoin = "round";
      for (const n of soft) paintNode(lc, n, palette, sprites, k, input, stats);
      // ONE BLUR, FOR THE WHOLE LAYER.
      toScreen();
      ctx.filter = `blur(${DEPTH_BLUR_PX[1]}px)`;
      ctx.drawImage(layer, 0, 0, W, H, 0, 0, viewport.w, viewport.h);
      ctx.filter = "none";
      stats.calls += 2;
      toWorld();
    } else {
      // No offscreen available (a context that refused one): paint them
      // sharp rather than not at all. Losing the softening costs hierarchy;
      // losing the nodes costs the map.
      for (const n of soft) paintNode(ctx, n, palette, sprites, k, input, stats);
    }
  }
  for (const n of sharp) paintNode(ctx, n, palette, sprites, k, input, stats);

  // ── THE WORDS ────────────────────────────────────────────────────────
  //
  // IN SCREEN SPACE, DELIBERATELY. Text drawn under a scaled transform is
  // rasterised at a scaled font size and hinted for the wrong grid; drawn at
  // its true device size it is as crisp as the DOM's own. It is also the only
  // layer whose cost does not fall with zoom, which is why the plan upstream
  // caps it at sixty.
  toScreen();
  paintLabels(ctx, scene, palette, camera, viewport, fontFamily, input, stats);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  stats.spritesHeld = sprites.size;
  return stats;
}

// ── GROUND ─────────────────────────────────────────────────────────────
//
// FOG, AND WHY IT IS NOT DECORATION. The field is a radial arrangement around
// one centre, and a flat ground gives the eye no cue about where that centre
// is until it has read the rings. A very slight lift toward the middle and a
// fall at the corners does the same job a vignette does in a photograph: it
// says where to look first, before anything has been identified.
//
// Kept well under the contrast of the faintest real mark, so it can never be
// mistaken for content.
function paintGround(ctx: CanvasRenderingContext2D, W: number, H: number, palette: TokenPalette): void {
  ctx.fillStyle = palette.css("var(--i-void)");
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.max(W, H) * 0.72;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const bg = palette.css("var(--i-bg)");
  g.addColorStop(0, withAlpha(bg, 0.55));
  g.addColorStop(0.55, withAlpha(bg, 0.22));
  g.addColorStop(1, withAlpha(bg, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function paintStructure(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  k: number,
  stats: PaintStats
): void {
  const s = scene.structure;
  ctx.strokeStyle = palette.css("var(--i-text-soft)");
  ctx.lineWidth = 1 / k;

  // BATCHED BY MATERIAL, not by ring. Solid guides are one path and one
  // stroke; each dash pattern is one more. Five rings become two calls.
  const byMaterial = new Map<string, { path: Path2D; dash: number[]; opacity: number }>();
  for (const ring of s.rings) {
    const dash = ring.dash ? [ring.dash[0] / k, ring.dash[1] / k] : [];
    const key = `${dash.join(",")}|${ring.opacity}`;
    let b = byMaterial.get(key);
    if (!b) byMaterial.set(key, (b = { path: new Path2D(), dash, opacity: ring.opacity }));
    b.path.moveTo(s.cx + ring.r, s.cy);
    b.path.arc(s.cx, s.cy, ring.r, 0, Math.PI * 2);
  }
  for (const b of byMaterial.values()) {
    ctx.globalAlpha = s.opacity * b.opacity;
    ctx.setLineDash(b.dash);
    ctx.stroke(b.path);
    stats.calls++;
  }

  // And every sector gutter in one more.
  ctx.setLineDash([]);
  ctx.globalAlpha = s.opacity * 0.5;
  const sectors = new Path2D();
  for (const g of s.sectors) {
    sectors.moveTo(g.x1, g.y1);
    sectors.lineTo(g.x2, g.y2);
  }
  ctx.stroke(sectors);
  stats.calls++;
  ctx.globalAlpha = 1;
}

function paintSweep(
  ctx: CanvasRenderingContext2D,
  angle: number,
  palette: TokenPalette,
  k: number,
  stats: PaintStats
): void {
  const signal = palette.css("var(--i-signal)");
  ctx.save();
  ctx.translate(FIELD.cx, FIELD.cy);
  ctx.rotate((angle * Math.PI) / 180);
  for (let i = 0; i < 6; i++) {
    const from = (-(i + 1) * 8 * Math.PI) / 180;
    const to = (-i * 8 * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, FIELD.edgeR, from, to);
    ctx.closePath();
    ctx.fillStyle = withAlpha(signal, 0.09 * (1 - i / 6));
    ctx.fill();
    stats.calls++;
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(FIELD.edgeR, 0);
  ctx.strokeStyle = withAlpha(signal, 0.8);
  ctx.lineWidth = 1.6 / k;
  ctx.stroke();
  ctx.restore();
  stats.calls++;
}

/**
 * THE CALM-STATE WEB, IN A HANDFUL OF DRAW CALLS.
 *
 * 119 paths at rest. In the DOM that is 119 elements, each clipped and
 * stroked every frame — measured there as the single most expensive thing the
 * field draws at close zoom, and the reason the layer is dropped entirely at
 * the evidence tier.
 *
 * Here they are grouped by the only three things that vary — colour, width
 * and dash — and each group is one Path2D and one stroke. The sheaves are two
 * calls; the strands are at most eight.
 */
function paintWeb(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  paths: PathCache,
  k: number,
  stats: PaintStats
): void {
  const base = scene.webOpacity;

  // Sheaves: one fan per source artifact, two authorships.
  ctx.globalAlpha = base * scene.sheafOpacity;
  ctx.lineWidth = 0.55 / k; // non-scaling in the SVG; a device fact either way
  ctx.setLineDash([]);
  const byKind = new Map<string, Path2D>();
  for (const sh of scene.web.sheaves) {
    const color = sh.kind === "extraction" ? "var(--i-source)" : "var(--i-slate)";
    let p = byKind.get(color);
    if (!p) byKind.set(color, (p = new Path2D()));
    p.addPath(paths.get(sh.d));
    stats.webPathsPainted++;
  }
  for (const [color, p] of byKind) {
    ctx.strokeStyle = palette.css(color);
    ctx.stroke(p);
    stats.calls++;
  }

  // Strands: a real relationship each, so they may be read.
  ctx.globalAlpha = base * scene.strandOpacity;
  const batches = new Map<string, { path: Path2D; color: string; width: number; dash: number[]; alpha: number }>();
  for (const st of scene.web.strands) {
    if (scene.suppressedWebEdges.has(st.id)) continue;
    const color = WEB_STRAND_COLOR[st.cls];
    const width = (st.cls === "semantic" || st.cls === "temporal" ? 1 : 0.85) / k;
    const dash =
      st.basis === "external" ? [2.2 / k, 2.6 / k] : st.basis === "inferred" ? [4 / k, 4 / k] : [];
    // A temporal strand reaching into superseded history is quieter than one
    // between two live things — a property of the relationship.
    const alpha = st.current ? 1 : 0.6;
    const key = `${color}|${width.toFixed(4)}|${dash.join(",")}|${alpha}`;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { path: new Path2D(), color, width, dash, alpha }));
    b.path.addPath(paths.get(st.d));
    stats.webPathsPainted++;
  }
  const strandBase = ctx.globalAlpha;
  for (const b of batches.values()) {
    ctx.globalAlpha = strandBase * b.alpha;
    ctx.strokeStyle = palette.css(b.color);
    ctx.lineWidth = b.width;
    ctx.setLineDash(b.dash);
    ctx.stroke(b.path);
    stats.calls++;
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function paintAggregates(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  paths: PathCache,
  k: number,
  stats: PaintStats
): void {
  // Bundles, under the shells. Weight goes as the square root of the count.
  for (const bn of scene.bundles) {
    ctx.globalAlpha = bn.opacity * 0.3;
    ctx.strokeStyle = palette.css(WEB_STRAND_COLOR[bn.cls]);
    ctx.lineWidth = Math.min(4, 0.7 + Math.sqrt(bn.count) * 0.5) / k;
    ctx.setLineDash([]);
    ctx.stroke(paths.get(bn.d));
    stats.calls++;
  }

  // Shells. A group is one shape with a count at the tier where naming all N
  // would be a wall of text over the region it is describing.
  //
  // THE SHELL IS THE CLICK TARGET FOR ITS GROUP — see ./hitTest, which seats
  // it in the index at exactly this radius.
  ctx.setLineDash([]);
  for (const agg of scene.aggregates) {
    if (agg.opacity <= 0.01) continue;
    const tint = palette.css(agg.tint ?? "var(--i-text-soft)");
    ctx.globalAlpha = agg.opacity;
    ctx.beginPath();
    ctx.arc(agg.x, agg.y, agg.discR, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(tint, agg.selected ? 0.17 : 0.09);
    ctx.fill();
    ctx.globalAlpha = agg.opacity * (agg.selected ? 0.85 : 0.34);
    ctx.strokeStyle = tint;
    ctx.lineWidth = (agg.selected ? 2 : 1) / k;
    ctx.stroke();
    stats.calls += 2;
  }
  ctx.globalAlpha = 1;
}

function paintSelectedAggregateOutline(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  k: number,
  stats: PaintStats
): void {
  const agg = scene.aggregates.find((a) => a.selected);
  if (!agg) return;
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = palette.css(agg.tint ?? "var(--i-text-soft)");
  ctx.lineWidth = 1.4 / k;
  ctx.setLineDash([5 / k, 5 / k]);
  ctx.beginPath();
  ctx.arc(agg.x, agg.y, agg.discR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  stats.calls++;
}

/**
 * RELATIONSHIPS.
 *
 * TWO CHANNELS, TWO QUESTIONS, AND THEY MUST NOT SHARE ONE.
 *
 * The dash says WHOSE claim it is: solid is Signal's own attested record, a
 * wide dash is Signal's own inference, a fine broken stitch is somebody
 * else's. Focus never overrides it. The colour, weight and head say what KIND
 * of relationship it is, and only once the edge has woken.
 *
 * NOTHING TRAVELS. There is no marching dash and no flow animation on a
 * stored relation, because a moving line reads as live data and Signal must
 * not imply a fact it does not hold.
 */
function paintEdges(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  paths: PathCache,
  k: number,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  stats: PaintStats
): void {
  const visible: AuditVisualEdge[] = [];
  for (const e of scene.edges) {
    if (!e.visible) continue;
    // Cull by the segment's own box. An edge bows toward the centre, so the
    // box is grown by the bow rather than taken as the chord exactly.
    const x0 = Math.min(e.source.x, e.target.x) - e.chord * 0.3;
    const x1 = Math.max(e.source.x, e.target.x) + e.chord * 0.3;
    const y0 = Math.min(e.source.y, e.target.y) - e.chord * 0.3;
    const y1 = Math.max(e.source.y, e.target.y) + e.chord * 0.3;
    if (x1 < bounds.x0 || x0 > bounds.x1 || y1 < bounds.y0 || y0 > bounds.y1) continue;
    visible.push(e);
  }

  // A LUMINOUS UNDERLAY ON THE PROVENANCE ROUTE, first and as one batch:
  // object → passage → source has to read as one continuous route.
  const underlay = new Path2D();
  let underlayAlpha = 0;
  for (const e of visible) {
    if (!e.filament || e.woken == null) continue;
    underlay.addPath(paths.get(e.d));
    underlayAlpha = Math.max(underlayAlpha, e.opacity * 0.22);
  }
  if (underlayAlpha > 0) {
    ctx.globalAlpha = underlayAlpha;
    ctx.strokeStyle = palette.css("var(--i-source)");
    ctx.lineWidth = 5 / k;
    ctx.setLineDash([]);
    ctx.stroke(underlay);
    stats.calls++;
  }

  // The strokes themselves, batched by everything that varies.
  const batches = new Map<
    string,
    { path: Path2D; color: string; width: number; dash: number[]; alpha: number }
  >();
  for (const e of visible) {
    const width = e.weight / k;
    const dash = e.dash ? [e.dash[0] / k, e.dash[1] / k] : [];
    const alpha = Math.round(e.opacity * 50) / 50;
    const key = `${e.strokeColor}|${width.toFixed(4)}|${dash.join(",")}|${alpha}`;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { path: new Path2D(), color: e.strokeColor, width, dash, alpha }));
    b.path.addPath(paths.get(e.d));
    stats.edgesPainted++;
  }
  for (const b of batches.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.strokeStyle = palette.css(b.color);
    ctx.lineWidth = b.width;
    ctx.setLineDash(b.dash);
    ctx.stroke(b.path);
    stats.calls++;
  }
  ctx.setLineDash([]);

  // Arrowheads, batched by colour. Never dashed — a head is a mark, not a
  // claim about trust.
  const heads = new Map<string, { path: Path2D; alpha: number }>();
  for (const e of visible) {
    if (!e.head) continue;
    const key = `${e.strokeColor}|${Math.round(e.opacity * 50) / 50}`;
    let h = heads.get(key);
    if (!h) heads.set(key, (h = { path: new Path2D(), alpha: Math.round(e.opacity * 50) / 50 }));
    h.path.addPath(arrowHeadPath(e.target.x, e.target.y, e.tangent, k, e.target.r, e.head.double));
  }
  ctx.lineWidth = 1.5 / k;
  for (const [key, h] of heads) {
    ctx.globalAlpha = h.alpha;
    ctx.strokeStyle = palette.css(key.split("|")[0]);
    ctx.stroke(h.path);
    stats.calls++;
  }
  ctx.globalAlpha = 1;
}

function paintReality(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  sprites: SpriteCache,
  k: number,
  stats: PaintStats
): void {
  const core = scene.nodes.find((n) => n.kind === "reality");
  if (!core) return;
  const cs = scene.coreScale;
  const signal = palette.css("var(--i-signal)");

  // THE ORB. Where the SVG uses a fixed gradient definition, this is the
  // cached sprite — the same falloff, rasterised once.
  const glowR = (FIELD.coreR + 46) * cs;
  const got = sprites.get("orb", signal, glowR * k);
  if (got) {
    const r = got.radius / k;
    ctx.drawImage(got.sprite, core.x - r, core.y - r, r * 2, r * 2);
    stats.calls++;
  }

  ctx.setLineDash([]);
  for (let i = 0; i < 3; i++) {
    const r = (FIELD.coreR + 12 + i * 14) * cs;
    ctx.globalAlpha = 0.18 + i * 0.12;
    ctx.strokeStyle = signal;
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.arc(core.x, core.y, r, 0, Math.PI * 2);
    ctx.stroke();
    stats.calls++;
  }

  ctx.globalAlpha = 0.94;
  ctx.fillStyle = palette.css("var(--i-void)");
  ctx.beginPath();
  ctx.arc(core.x, core.y, FIELD.coreR * cs, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = signal;
  ctx.lineWidth = 1.7 / k;
  ctx.stroke();
  ctx.globalAlpha = 1;
  stats.calls += 2;
}

/**
 * ONE NODE, IN ITS THREE DEGREES OF PRESENCE.
 *
 * latent  a real node at its real seat, drawn as a mark. No name, no edges.
 * formed  its actual shape and size.
 * named   formed, and carrying its label (drawn later, in screen space).
 *
 * The glow ladder is the SVG's, with the concentric strokes replaced by the
 * sprite they were approximating:
 *
 *   SELECTED   a corona. Unmistakable from across the field at any zoom.
 *   HOVERED    a single ring — PRESELECTION authority, so a dense field is
 *              explorable by sweeping rather than by clicking forty times.
 *   NEIGHBOUR  a soft ring on whatever the selection reached.
 */
function paintNode(
  ctx: CanvasRenderingContext2D,
  n: AuditVisualNode,
  palette: TokenPalette,
  sprites: SpriteCache,
  k: number,
  input: PaintInput,
  stats: PaintStats
): void {
  const color = palette.css(n.color);
  ctx.globalAlpha = n.opacity;
  ctx.setLineDash([]);

  if (n.identity === "latent") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.latentR, 0, Math.PI * 2);
    ctx.fill();
    stats.calls++;
    stats.nodesPainted++;
    ctx.globalAlpha = 1;
    return;
  }

  const grown = n.selected ? n.r * 1.35 : n.hovered ? n.r * 1.15 : n.r;
  const stroke = 1.4 / k;

  // ── FUNCTIONAL GLOW ──────────────────────────────────────────────────
  if (n.selected) {
    // A PULSE, AND THE ONLY ANIMATED THING ON A RESTING FIELD. It says "this
    // one" without spending a hue, and it stops dead under reduced motion.
    const pulse = input.reducedMotion ? 1 : 1 + 0.06 * Math.sin(input.time / 420);
    const radiusPx = (grown + 23 / k) * k * pulse;
    const got = sprites.get("corona", color, radiusPx);
    if (got) {
      const r = got.radius / k;
      ctx.drawImage(got.sprite, n.x - r, n.y - r, r * 2, r * 2);
      stats.calls++;
    }
  } else if (n.hovered) {
    const got = sprites.get("corona", color, (grown + 10 / k) * k);
    if (got) {
      const r = got.radius / k;
      ctx.globalAlpha = n.opacity * 0.7;
      ctx.drawImage(got.sprite, n.x - r, n.y - r, r * 2, r * 2);
      ctx.globalAlpha = n.opacity;
      stats.calls++;
    }
  } else if (n.rank != null && n.rank !== "contextual") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 / k;
    ctx.globalAlpha = n.opacity * (n.rank === "provenance" ? 0.16 : 0.26);
    ctx.beginPath();
    ctx.arc(n.x, n.y, grown + 7 / k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = n.opacity;
    stats.calls++;
  }

  // Halo: selection, search match, or the sweep passing over.
  if (n.selected || n.matched || n.swept) {
    ctx.strokeStyle = color;
    ctx.lineWidth = (n.selected ? 1.5 : 1) / k;
    ctx.globalAlpha = n.opacity * (n.selected ? 0.75 : 0.4);
    ctx.beginPath();
    ctx.arc(n.x, n.y, grown + 7 / k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = n.opacity;
    stats.calls++;
  }

  // ── THE BODY ─────────────────────────────────────────────────────────
  const geo = nodeShapePath(n.shape, n.x, n.y, grown);
  if (shapeIsOutline(n.shape)) {
    const tint = shapeBodyTint(n.shape, n.hollow);
    ctx.fillStyle = tint > 0 ? palette.css(`color-mix(in srgb, ${n.color} ${tint}%, var(--i-void))`) : palette.css("var(--i-void)");
    ctx.fill(geo.path);
    ctx.strokeStyle = color;
    ctx.lineWidth = n.shape === "disc" ? stroke * 1.2 : stroke;
    // AN EXTERNAL CLAIM'S STROKE DOES NOT CLOSE. The same grammar the
    // external edges use, sized in screen units so it survives at 4.6 units.
    if (n.shape === "shard") ctx.setLineDash([2.4 / k, 1.8 / k]);
    ctx.stroke(geo.path);
    ctx.setLineDash([]);
    stats.calls += 2;
  } else {
    ctx.fillStyle = color;
    ctx.fill(geo.path);
    stats.calls++;
  }

  if (geo.detail) {
    ctx.globalAlpha = n.opacity * geo.detailAlpha;
    if (geo.detailFilled) {
      ctx.fillStyle = color;
      ctx.fill(geo.detail);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = n.shape === "page" ? stroke * 0.8 : stroke;
      ctx.stroke(geo.detail);
    }
    stats.calls++;
  }

  ctx.globalAlpha = 1;
  stats.nodesPainted++;
}

// ── THE WORDS ──────────────────────────────────────────────────────────

function paintLabels(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  palette: TokenPalette,
  camera: PaintCamera,
  vp: { w: number; h: number },
  fontFamily: string,
  input: PaintInput,
  stats: PaintStats
): void {
  const toScreen = (x: number, y: number) => ({
    x: (x - camera.x) * camera.k + vp.w / 2,
    y: (y - camera.y) * camera.k + vp.h / 2,
  });

  ctx.textBaseline = "middle";
  ctx.setLineDash([]);

  // Band names, on the one axis no cluster puck occupies.
  if (scene.structure.showBandNames) {
    ctx.globalAlpha = scene.structure.bandLabelOpacity;
    ctx.fillStyle = palette.css("var(--i-text-soft)");
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "right";
    const a = (-22.5 * Math.PI) / 180;
    for (const b of scene.structure.bands) {
      const p = toScreen(
        scene.structure.cx + Math.cos(a) * (b.r - 8),
        scene.structure.cy + Math.sin(a) * (b.r - 8)
      );
      if (p.x < -80 || p.x > vp.w + 80 || p.y < -40 || p.y > vp.h + 40) continue;
      ctx.fillText(b.label.toUpperCase(), p.x, p.y);
      stats.calls++;
    }
  }

  // Bundle counts — a thickness is an impression and a count is a fact.
  for (const bn of scene.bundles) {
    if (bn.count <= 2 || !bn.mid) continue;
    const p = toScreen(bn.mid.x, bn.mid.y);
    if (p.x < 0 || p.x > vp.w || p.y < 0 || p.y > vp.h) continue;
    ctx.globalAlpha = bn.opacity * 0.85;
    ctx.font = `9px ${fontFamily}`;
    ctx.textAlign = "center";
    strokeThenFill(ctx, String(bn.count), p.x, p.y, palette.css(WEB_STRAND_COLOR[bn.cls]), palette.css("var(--i-bg)"), 3);
    stats.calls += 2;
  }

  // Cluster names — always legible, at every zoom. They are the map's legend,
  // anchored away from the centre so they do not run back across the field.
  for (const c of input.clusterLabels) {
    const p = toScreen(c.x, c.y);
    if (p.x < -220 || p.x > vp.w + 220 || p.y < -60 || p.y > vp.h + 60) continue;
    // A cluster name is never removed, but it is text, and text on a dimmed
    // field is the thing that keeps pulling the eye.
    ctx.globalAlpha = scene.focus || scene.dimClusterLabels ? 0.34 : 1;
    ctx.textAlign = c.flip ? "right" : "left";
    ctx.font = `13px ${fontFamily}`;
    ctx.fillStyle = palette.css(c.supplied ? "var(--i-text)" : "var(--i-text-faint)");
    ctx.fillText(c.label.toUpperCase(), p.x, p.y);
    stats.calls++;
    if (c.latent > 0 || c.open) {
      ctx.font = `10.5px ${fontFamily}`;
      ctx.fillStyle = palette.css("var(--i-text-faint)");
      ctx.fillText(c.open ? "− collapse" : `+ ${c.latent}`, p.x, p.y + 15);
      stats.calls++;
    }
    stats.labelsPainted++;
  }

  // Aggregate names and counts.
  //
  // A TYPE group is a region and carries its name, outward unless outward is
  // off the screen. A SOURCE group is a hub and does not — its artifact is a
  // real node in the middle of it and labels itself. Either way the COUNT is
  // printed, because a shell without one is a blob.
  for (const agg of scene.aggregates) {
    if (agg.opacity <= 0.01) continue;
    const tint = palette.css(agg.tint ?? "var(--i-text-soft)");
    const halo = palette.css("var(--i-bg)");
    const off = agg.discR * camera.k + 7;
    const anchorX = agg.named ? agg.x + (agg.labelFlip ? -off / camera.k : off / camera.k) : agg.x;
    const p = toScreen(anchorX, agg.y);
    if (p.x < -220 || p.x > vp.w + 220 || p.y < -60 || p.y > vp.h + 60) continue;
    ctx.globalAlpha = agg.opacity;
    if (agg.named) {
      ctx.textAlign = agg.labelFlip ? "right" : "left";
      ctx.font = `11px ${fontFamily}`;
      strokeThenFill(ctx, agg.label.toUpperCase(), p.x, p.y, palette.css("var(--i-text)"), halo, 3);
      ctx.font = `10px ${fontFamily}`;
      strokeThenFill(ctx, String(agg.count), p.x, p.y + 13, tint, halo, 3);
      stats.calls += 4;
    } else {
      ctx.textAlign = "center";
      ctx.font = `10px ${fontFamily}`;
      strokeThenFill(ctx, String(agg.count), p.x, p.y, tint, halo, 3);
      stats.calls += 2;
    }
    stats.labelsPainted++;
  }

  // Edge verbs. Only woken edges, only where the word will be legible, and
  // never on the contextual hairline.
  for (const e of scene.edges) {
    if (!e.visible || !e.showVerb) continue;
    const p = toScreen(e.anchor.x, e.anchor.y);
    if (p.x < -60 || p.x > vp.w + 60 || p.y < -30 || p.y > vp.h + 30) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((e.anchor.angle * Math.PI) / 180);
    ctx.globalAlpha = Math.max(e.opacity, 0.88);
    ctx.textAlign = "center";
    ctx.font = `9px ${fontFamily}`;
    const fill = e.filament
      ? "var(--i-source)"
      : e.woken === "temporal"
        ? "var(--i-text)"
        : "var(--i-signal)";
    strokeThenFill(ctx, e.verb, 0, 0, palette.css(fill), palette.css("var(--i-bg)"), 3);
    ctx.restore();
    stats.calls += 2;
    stats.labelsPainted++;
  }

  // Node names.
  for (const n of scene.nodes) {
    // Reality prints its own two words below, as the hero. Labelling it here
    // as well printed the name twice, a few pixels apart.
    if (!n.labelled || n.kind === "reality") continue;
    const p = toScreen(n.x, n.y);
    if (p.x < -200 || p.x > vp.w + 200 || p.y < -40 || p.y > vp.h + 40) continue;
    const grown = n.selected ? n.r * 1.35 : n.hovered ? n.r * 1.15 : n.r;
    const leftHalf = n.labelInward ? n.x >= FIELD.cx : n.x < FIELD.cx;
    const dx = (grown * camera.k + 6) * (leftHalf ? -1 : 1);
    ctx.globalAlpha = n.opacity;
    ctx.textAlign = leftHalf ? "right" : "left";
    ctx.font = `${n.kind === "work" || n.kind === "passage" ? 9.5 : 11}px ${fontFamily}`;
    ctx.fillStyle = palette.css(
      n.selected || n.hovered || n.rank != null ? "var(--i-text)" : "var(--i-text-soft)"
    );
    ctx.fillText(truncateLabel(n.label, n.kind === "finding" ? 34 : n.kind === "passage" ? 40 : 30), p.x + dx, p.y + 3.5);
    stats.calls++;
    stats.labelsPainted++;
  }

  // Reality's own two words.
  const core = scene.nodes.find((n) => n.kind === "reality");
  if (core) {
    const p = toScreen(core.x, core.y);
    const cs = scene.coreScale;
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = `${Math.min(10, 14 * cs * camera.k)}px ${fontFamily}`;
    ctx.fillStyle = palette.css("var(--i-signal)");
    ctx.fillText("ACCEPTED", p.x, p.y - 6 * cs * camera.k);
    ctx.font = `${Math.min(17, 24 * cs * camera.k)}px ${fontFamily}`;
    ctx.fillStyle = palette.css("var(--i-text)");
    ctx.fillText("Reality", p.x, p.y + 12 * cs * camera.k);
    stats.calls += 2;
  }

  ctx.globalAlpha = 1;
}

/** A word over a dark field needs its own ground, or it reads as a smudge
    wherever a stroke passes behind it. The SVG uses `paint-order: stroke`;
    this is the same effect. */
function strokeThenFill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  halo: string,
  width: number
): void {
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * Trim a label to fit, KEEPING THE END WHEN THE END IS WHAT DISTINGUISHES IT.
 *
 * A source artifact's label is its ref, and the producer's refs are URIs.
 * Cut from the front and thirty transcripts all read the same. Transcribed
 * from the SVG renderer's own `truncate`, so both painters cut identically.
 */
export function truncateLabel(s: string, n: number): string {
  if (s.length <= n) return s;
  const pathShaped = s.includes("://") || s.split("/").length > 2;
  return pathShaped ? `…${s.slice(s.length - (n - 1))}` : `${s.slice(0, n - 1)}…`;
}

// ── THE OFFSCREEN LAYER ────────────────────────────────────────────────
//
// One canvas, reused. Allocating a full-viewport canvas per frame is a
// per-frame GC pause; this keeps exactly one and resizes it only when the
// viewport does.
let layerCanvas: HTMLCanvasElement | null = null;

function acquireLayer(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!layerCanvas) layerCanvas = document.createElement("canvas");
  if (layerCanvas.width !== w || layerCanvas.height !== h) {
    layerCanvas.width = w;
    layerCanvas.height = h;
  }
  return layerCanvas;
}

/** Released when the painter unmounts, so a closed instrument is not holding
    a viewport-sized bitmap. */
export function releaseLayer(): void {
  layerCanvas = null;
}
