// THE RUBRIC-DERIVED PAINTER.
//
// ADAPTED FROM RUBRIC SECOND BRAIN:
//   `public/_core.js`     `loop()` lines 932-1069, `drawLabels()` 1071-1092
//   `public/index.html`   `underLayer()` 154-203, `drawLink()` 205-235,
//                         `midLayer()` 238-269, `drawNode()` 271-463,
//                         `drawSelection()` 476-484, `drawLabels()` 486-510
//
// Original work: Copyright (c) 2026 Jay E | RoboNuggets
// (https://skool.com/robonuggets), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/legalcode).
// Reference copy: lab/rubric-reference/second-brain/public/
//
// ── WHAT WAS TAKEN ─────────────────────────────────────────────────────
//
// The layer order, the fog, the cached-sprite material, the curved batched
// links, the focus wake, the pulsing selection, the culling and batching
// thresholds, and the label eligibility policy. Those are Rubric's, and they
// are what the field looks like.
//
// ── WHAT WAS NOT ───────────────────────────────────────────────────────
//
// Every Rubric MEANING. Its type vocabulary (router/agent/hub/app/routine/
// skill/dir/file), its department colours, its byte-size radii, its ambient
// comet flow, its filesystem semantics. Signal supplies all of that from its
// own model, and the replacements are named at each site.
//
// ── THE ONE RULE THAT OVERRIDES THE REFERENCE ──────────────────────────
//
// Rubric animates freely because nothing it draws is a claim. Signal's marks
// ARE claims, so ambient motion is rationed: a stored relationship never
// flows, never travels, never gains a direction it did not earn. Rubric's
// comet pool (`midLayer`, shipped at `flow: 0`) is used ONLY for an active
// Trace, where the motion is a thing the reader explicitly asked to watch.

import type { AuditScene, AuditVisualEdge, AuditVisualNode } from "@/lib/audit/visualScene";
import { WEB_STRAND_COLOR } from "@/lib/audit/visualScene";
import { FIELD } from "@/lib/audit/graphLayout";
import { DEPTH_BLUR_PX } from "../../graphTokens";
import { TokenPalette } from "../paintTokens";
import { nodeShapePath, shapeBodyTint, shapeIsOutline, arrowHeadPath } from "../shapes";
import { RubricSprites, linkCtrl, linkPoint, mix, rgba } from "./sprites2";
import { BackdropCache } from "./backdrop";

export interface PaintCamera {
  x: number;
  y: number;
  k: number;
}

/**
 * THE DIALS, AND WHERE EACH ONE COMES FROM.
 *
 * Rubric exposes these as sliders on a HUD. Signal states them as constants,
 * because physics and atmosphere tuning are not product controls — the
 * handoff's Slice 5 says to keep them out of production UI.
 */
export const SKIN = {
  /** Rubric shipped `fog: .75`. Fog radius: `110 + fog * 170`. */
  fog: 0.75,
  fogAlpha: 0.32,
  /** Rubric shipped `glow: .39`. Node glow radius: `r * (2.1 + glow * 2.6)`. */
  glow: 0.39,
  /** Rubric's dark-mode glow alpha multiplier. */
  glowAlpha: 0.62,
  /** Rubric's `st.link`, which scales ambient edge alpha. */
  link: 0.46,
  /** How luminous an orb's highlight is. Rubric dark mode: .55 for leaves,
      .45 for aggregates. */
  litLeaf: 0.55,
  litGroup: 0.45,
  /** Backdrop hex field. Rubric's is 1; Signal runs it quieter because the
      Audit field is denser than a filesystem and the grid competes. */
  backdropField: 1,
  backdropVignette: 0.4,
  /** Rubric batches nodes below this projected radius (`loop()` line 1027). */
  batchBelowPx: 4.2,
  /** Rubric sheds spokes below this zoom in dense mode (line 992). */
  shedBelowK: 0.9,
} as const;

export interface PaintInput {
  ctx: CanvasRenderingContext2D;
  scene: AuditScene;
  camera: PaintCamera;
  viewport: { w: number; h: number };
  dpr: number;
  palette: TokenPalette;
  sprites: RubricSprites;
  backdrop: BackdropCache;
  softLayer: SoftLayer;
  /** Identifies the current scene, so the depth layer knows when its pixels
      are stale. Anything else changing reuses the bitmap. */
  sceneKey: string;
  reducedMotion: boolean;
  /** Whether the spatial field has stopped moving. A depth layer can only be
      cached when the world under it is still. */
  settled: boolean;
  /**
   * Whether this machine can afford continuous canvas animation.
   *
   * One decision, applied to everything that would repaint the field forever:
   * the Ring spin, the selection pulse, and the Trace comets. Where a canvas
   * frame costs a display interval they all run; where it costs ten, none of
   * them do, and the field is still rather than slow. See the governor in
   * CanvasAuditRenderer for how the answer is reached.
   */
  ambient: boolean;
  /** Milliseconds. Rubric drives everything from an integer frame `tick`;
      Signal uses a clock so motion is display-rate independent. */
  time: number;
  sweepAngle: number | null;
  fontFamily: string;
  /** Live positions from the spatial field, or null to use the scene's own. */
  positions: Map<string, { x: number; y: number }> | null;
  /** The bounded silhouette the physics is using, or 0 in Rings. */
  boundR: number;
  clusterLabels: {
    cluster: string;
    x: number;
    y: number;
    label: string;
    latent: number;
    flip: boolean;
    open: boolean;
    supplied: boolean;
  }[];
  /** Nodes on an active Trace route, which is the one place motion is
      semantically earned. */
  traceEdges: Set<string> | null;
}

export interface PaintStats {
  calls: number;
  nodesPainted: number;
  nodesCulled: number;
  nodesBatched: number;
  edgesPainted: number;
  edgeBatches: number;
  labelsPainted: number;
  spritesHeld: number;
  softLayer: boolean;
  softBuilds: number;
}

// THE BAKED PATH CACHE IS GONE, and its absence is the point.
//
// The previous pass cached one Path2D per edge because "geometry is world
// space and does not move with the camera" — true then, and false now. A
// spatial engine moves nodes every frame, so every curve is rebuilt every
// frame from live endpoints. What replaces the cache is Rubric's own answer:
// batch by material into a handful of Path2Ds per frame, which costs less
// than the cache did and is always correct.

/** The depth layer, half resolution, blurred once. Kept from the previous
    pass — Rubric has no equivalent, and Signal's focus tiers need it. */
export class SoftLayer {
  private raw: HTMLCanvasElement | null = null;
  private blurred: HTMLCanvasElement | null = null;
  private key = "";
  private builds = 0;
  get stats() {
    return { builds: this.builds };
  }
  acquire(
    key: string,
    w: number,
    h: number,
    blurPx: number,
    paint: (ctx: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    if (this.key === key && this.blurred && this.blurred.width === w && this.blurred.height === h) {
      return this.blurred;
    }
    if (!this.raw) this.raw = document.createElement("canvas");
    if (!this.blurred) this.blurred = document.createElement("canvas");
    for (const c of [this.raw, this.blurred]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    const rc = this.raw.getContext("2d");
    const bc = this.blurred.getContext("2d");
    if (!rc || !bc) return null;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, w, h);
    paint(rc);
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, w, h);
    bc.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    bc.drawImage(this.raw, 0, 0);
    bc.filter = "none";
    this.key = key;
    this.builds++;
    return this.blurred;
  }
  release(): void {
    this.raw = null;
    this.blurred = null;
    this.key = "";
  }
}

export const SOFT_LAYER_SCALE = 0.5;

interface Placed {
  n: AuditVisualNode;
  x: number;
  y: number;
}

/** A constellation shell, recomputed from where its members actually are. */
interface Shell {
  agg: AuditScene["aggregates"][number];
  x: number;
  y: number;
  r: number;
}

/**
 * ONE FRAME, IN RUBRIC'S ORDER.
 *
 * `loop()`, lines 932-1069: backdrop, world transform, under layer, links,
 * mid layer, nodes, over layer, selection, restore, screen-space labels.
 */
export function paintScene(input: PaintInput): PaintStats {
  const { ctx, scene, camera, viewport, dpr, palette, sprites, fontFamily } = input;
  const k = camera.k;
  const stats: PaintStats = {
    calls: 0,
    nodesPainted: 0,
    nodesCulled: 0,
    nodesBatched: 0,
    edgesPainted: 0,
    edgeBatches: 0,
    labelsPainted: 0,
    spritesHeld: 0,
    softLayer: false,
    softBuilds: 0,
  };

  const W = Math.max(1, Math.round(viewport.w * dpr));
  const H = Math.max(1, Math.round(viewport.h * dpr));

  const at = (n: AuditVisualNode): Placed => {
    const p = input.positions?.get(n.id);
    return { n, x: p ? p.x : n.x, y: p ? p.y : n.y };
  };

  // ── BACKDROP, CACHED ─────────────────────────────────────────────────
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const bg = input.backdrop.get(viewport.w, viewport.h, dpr, {
    ground: palette.css("var(--i-void)"),
    ink: palette.css("var(--i-text)"),
    field: SKIN.backdropField,
    vignette: SKIN.backdropVignette,
  });
  if (bg) {
    ctx.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, W, H);
    stats.calls++;
  }

  const toWorld = () => {
    ctx.setTransform(
      dpr * k,
      0,
      0,
      dpr * k,
      dpr * (viewport.w / 2 - camera.x * k),
      dpr * (viewport.h / 2 - camera.y * k)
    );
  };
  const toScreen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Rubric's viewport bounds with a 60px screen margin (loop line 977).
  const m = 60 / k;
  const halfW = viewport.w / 2 / k;
  const halfH = viewport.h / 2 / k;
  const vx0 = camera.x - halfW - m;
  const vx1 = camera.x + halfW + m;
  const vy0 = camera.y - halfH - m;
  const vy1 = camera.y + halfH + m;

  toWorld();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const placed = new Map<string, Placed>();
  for (const n of scene.nodes) {
    if (input.positions && !input.positions.has(n.id)) continue;
    placed.set(n.id, at(n));
  }

  // ── SHELLS FOLLOW THEIR MEMBERS ──────────────────────────────────────
  //
  // A constellation shell is a projection of real members — it stores
  // nothing and has no seat of its own. Once the spatial field is moving
  // those members, the shell's own layout coordinates are stale, so it is
  // recomputed each frame from the centroid and reach of what it actually
  // contains. It stays selectable, which is a product behaviour, and it
  // stays TRUE, which is the law it exists under.
  const shells = scene.aggregates.map((agg) => {
    if (!input.positions) return { agg, x: agg.x, y: agg.y, r: agg.discR };
    const projected = input.positions.get(agg.id);
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const id of agg.members) {
      const p = input.positions.get(id);
      if (!p) continue;
      sx += p.x;
      sy += p.y;
      count++;
    }
    if (count === 0 && !projected) return { agg, x: agg.x, y: agg.y, r: agg.discR };
    const cx = projected?.x ?? sx / count;
    const cy = projected?.y ?? sy / count;
    let far = 0;
    for (const id of agg.members) {
      const p = input.positions.get(id);
      if (!p) continue;
      far = Math.max(far, Math.hypot(p.x - cx, p.y - cy));
    }
    return { agg, x: cx, y: cy, r: Math.max(12, far + 8) };
  });

  // ── UNDER LAYER: FOG AND GUIDES ──────────────────────────────────────
  paintFog(ctx, scene, placed, shells, palette, sprites, stats);
  paintGuides(ctx, scene, input, palette, k, stats);
  if (input.sweepAngle != null) paintSweep(ctx, input.sweepAngle, palette, k, stats);

  // ── LINKS ────────────────────────────────────────────────────────────
  const drawnEdgeIds = new Set<string>();
  for (const e of scene.edges) if (e.visible) drawnEdgeIds.add(e.id);
  paintAmbient(ctx, scene, placed, drawnEdgeIds, palette, k, { vx0, vx1, vy0, vy1 }, stats);
  paintEdges(ctx, scene, placed, palette, k, { vx0, vx1, vy0, vy1 }, stats);

  // ── MID LAYER: TRACE ONLY ────────────────────────────────────────────
  if (input.traceEdges && input.traceEdges.size > 0 && input.ambient) {
    paintTraceComets(ctx, scene, placed, palette, input, stats);
  }

  // ── NODES ────────────────────────────────────────────────────────────
  const soft: Placed[] = [];
  const sharp: Placed[] = [];
  const softLabels: AuditVisualNode[] = [];
  const batch = new Map<string, { color: string; alpha: number; pts: number[] }>();

  for (const n of scene.nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    if (n.labelled && n.depth > 0 && n.kind !== "reality") softLabels.push(n);
    if (n.opacity < 0.012) continue;
    const rr = Math.max(n.r, n.latentR) + 26 / k;
    if (p.x + rr < vx0 || p.x - rr > vx1 || p.y + rr < vy0 || p.y - rr > vy1) {
      stats.nodesCulled++;
      continue;
    }
    // Rubric line 1027: sub-4.2px marks batch into one path per colour.
    // Selected and hovered nodes always bypass the batch.
    const projected = (n.identity === "latent" ? n.latentR : n.r) * k;
    if (projected < SKIN.batchBelowPx && !n.selected && !n.hovered && n.kind !== "reality") {
      const key = `${n.color}|${Math.round(n.opacity * 20)}`;
      let b = batch.get(key);
      if (!b) batch.set(key, (b = { color: n.color, alpha: n.opacity, pts: [] }));
      b.pts.push(p.x, p.y, n.identity === "latent" ? n.latentR : n.r);
      stats.nodesBatched++;
      continue;
    }
    if (n.kind === "reality") continue; // the hero, painted below
    (n.depth > 0 ? soft : sharp).push(p);
  }

  if (soft.length > 0 || softLabels.length > 0) {
    stats.softLayer = true;
    // ── THE DEPTH LAYER ONLY EXISTS WHEN THE WORLD IS STILL ────────────
    //
    // One blur for the whole softened population is a real win over the
    // DOM's one-filter-per-element — while the field is static. Once the
    // spatial engine is moving nodes, the layer's pixels are stale the frame
    // after they are made, so the cache never hits and every frame pays a
    // full-viewport rasterisation. Measured during a morph, that alone was
    // most of a 166ms frame.
    //
    // So: cached blur at rest, and during motion the softened content is
    // painted directly at a lower alpha. Motion masks the missing blur — the
    // eye cannot resolve a moving mark anyway, which is the same reason the
    // blur was wanted in the first place.
    if (!input.settled) {
      const wasAlpha = ctx.globalAlpha;
      for (const p of soft) paintNode(ctx, p, palette, sprites, k, input, stats, 0.55);
      toScreen();
      for (const n of softLabels) {
        paintNodeName(ctx, placed.get(n.id)!, camera, viewport, fontFamily, palette, stats);
      }
      toWorld();
      ctx.globalAlpha = wasAlpha;
    } else {
      const lw = Math.max(1, Math.round(W * SOFT_LAYER_SCALE));
      const lh = Math.max(1, Math.round(H * SOFT_LAYER_SCALE));
      const layerKey = `${input.sceneKey}|${camera.x.toFixed(2)},${camera.y.toFixed(2)},${k.toFixed(5)}|${lw}x${lh}`;
      const layer = input.softLayer.acquire(
        layerKey,
        lw,
        lh,
        DEPTH_BLUR_PX[1] * dpr * SOFT_LAYER_SCALE,
        (lc) => {
          const sc = dpr * k * SOFT_LAYER_SCALE;
          lc.setTransform(
            sc,
            0,
            0,
            sc,
            dpr * SOFT_LAYER_SCALE * (viewport.w / 2 - camera.x * k),
            dpr * SOFT_LAYER_SCALE * (viewport.h / 2 - camera.y * k)
          );
          lc.lineCap = "round";
          lc.lineJoin = "round";
          for (const p of soft) paintNode(lc, p, palette, sprites, k, input, stats);
          const ss = dpr * SOFT_LAYER_SCALE;
          lc.setTransform(ss, 0, 0, ss, 0, 0);
          for (const n of softLabels) {
            paintNodeName(lc, placed.get(n.id)!, camera, viewport, fontFamily, palette, stats);
          }
        }
      );
      if (layer) {
        toScreen();
        ctx.drawImage(layer, 0, 0, lw, lh, 0, 0, viewport.w, viewport.h);
        stats.calls++;
        toWorld();
      } else {
        for (const p of soft) paintNode(ctx, p, palette, sprites, k, input, stats);
      }
      stats.softBuilds = input.softLayer.stats.builds;
    }
  }

  // Rubric line 1043: the batch, one fill per colour.
  for (const b of batch.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = palette.css(b.color);
    ctx.beginPath();
    for (let i = 0; i < b.pts.length; i += 3) {
      ctx.moveTo(b.pts[i] + b.pts[i + 2], b.pts[i + 1]);
      ctx.arc(b.pts[i], b.pts[i + 1], b.pts[i + 2], 0, Math.PI * 2);
    }
    ctx.fill();
    stats.calls++;
  }
  ctx.globalAlpha = 1;

  paintReality(ctx, scene, placed, palette, sprites, k, input, stats);
  for (const p of sharp) paintNode(ctx, p, palette, sprites, k, input, stats);

  // ── SELECTION ────────────────────────────────────────────────────────
  const sel = scene.nodes.find((n) => n.selected && n.identity !== "latent");
  const selected = sel ? placed.get(sel.id) : null;
  if (selected) paintSelection(ctx, selected, palette, k, input, stats);

  // ── LABELS, SCREEN SPACE ─────────────────────────────────────────────
  toScreen();
  paintLabels(ctx, scene, placed, shells, palette, camera, viewport, fontFamily, input, stats);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  stats.spritesHeld = sprites.size;
  return stats;
}

// ── FOG ────────────────────────────────────────────────────────────────
//
// ADAPTED FROM `underLayer()` — index.html lines 156-170.
//
// Rubric draws one enlarged glow sprite beneath every department hub. It is
// the single largest contributor to the "nebula" character: it gives each
// cell a coloured atmosphere, so a group reads as a REGION before any
// individual mark in it is identified.
//
// Signal's anchors are its lane pucks and Reality. Nothing else changes.
function paintFog(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  shells: Shell[],
  palette: TokenPalette,
  sprites: RubricSprites,
  stats: PaintStats
): void {
  if (SKIN.fog <= 0.03) return;
  const fr = 110 + SKIN.fog * 170;
  ctx.globalAlpha = SKIN.fogAlpha * SKIN.fog;
  for (const n of scene.nodes) {
    if (n.layoutRole !== "hub" && n.layoutRole !== "cell") continue;
    if (n.opacity < 0.02) continue;
    const p = placed.get(n.id);
    if (!p) continue;
    const s = sprites.glow(palette.css(n.color));
    if (!s) continue;
    ctx.drawImage(s, p.x - fr, p.y - fr, fr * 2, fr * 2);
    stats.calls++;
  }
  // The constellation shells are regions too, and they carry their group's
  // own tint where the group is homogeneous.
  for (const sh of shells) {
    if (sh.agg.opacity <= 0.01) continue;
    const s = sprites.glow(palette.css(sh.agg.tint ?? "var(--i-text-soft)"));
    if (!s) continue;
    const r = sh.r * 2.2;
    ctx.globalAlpha = SKIN.fogAlpha * SKIN.fog * 0.8;
    ctx.drawImage(s, sh.x - r, sh.y - r, r * 2, r * 2);
    stats.calls++;
  }
  ctx.globalAlpha = 1;
}

/** Signal's structural guides — the disagreement rings, or the bounded
    silhouette the constellation physics is using. Rubric's `drawArmsGuides`
    and `drawBoundGuide` occupy the same slot in `underLayer()`. */
function paintGuides(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  input: PaintInput,
  palette: TokenPalette,
  k: number,
  stats: PaintStats
): void {
  const s = scene.structure;
  ctx.strokeStyle = palette.css("var(--i-text-soft)");
  ctx.lineWidth = 1 / k;

  if (input.boundR > 0) {
    // Constellations: one soft boundary, because that is the only structure
    // this layout actually has. Drawing the disagreement rings here would
    // claim a radial semantic the arrangement does not encode.
    ctx.globalAlpha = s.opacity * 0.8;
    ctx.setLineDash([6 / k, 10 / k]);
    ctx.beginPath();
    ctx.arc(0, 0, input.boundR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    stats.calls++;
    return;
  }

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
  ctx.setLineDash([]);
  ctx.globalAlpha = s.opacity * 0.5;
  const sectors = new Path2D();
  for (const g of s.sectors) {
    sectors.moveTo(g.x1, g.y1);
    sectors.lineTo(g.x2, g.y2);
  }
  ctx.stroke(sectors);
  ctx.globalAlpha = 1;
  stats.calls++;
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
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, FIELD.edgeR, (-(i + 1) * 8 * Math.PI) / 180, (-i * 8 * Math.PI) / 180);
    ctx.closePath();
    ctx.fillStyle = rgba(signal, 0.09 * (1 - i / 6));
    ctx.fill();
    stats.calls++;
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(FIELD.edgeR, 0);
  ctx.strokeStyle = rgba(signal, 0.8);
  ctx.lineWidth = 1.6 / k;
  ctx.stroke();
  ctx.restore();
  stats.calls++;
}

// ── THE AMBIENT MESH ───────────────────────────────────────────────────
//
// ADAPTED FROM RUBRIC — `_core.js` `loop()` lines 979-1017 and `index.html`
// `drawLink()` lines 205-235.
//
// Rubric paints EVERY link every frame at low alpha, batched into one Path2D
// per kind, and lets focus brighten what matters. That faint whole-graph mesh
// is a large part of why a Rubric field reads as one connected system rather
// than as clusters that happen to share a screen.
//
// It replaces Signal's precomputed structural web here, for two reasons. The
// web's paths are baked from static seats and cannot survive a field whose
// nodes move. And Rubric's version is simply the better mechanism now that
// the geometry is live: it is the real relationships, at their real
// endpoints, rather than a bundled understudy of them.
//
// SIGNAL'S GRAMMAR STILL HOLDS. Trust stays on the dash. Class stays on the
// hue. Nothing travels.
function paintAmbient(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  drawn: Set<string>,
  palette: TokenPalette,
  k: number,
  view: { vx0: number; vx1: number; vy0: number; vy1: number },
  stats: PaintStats
): void {
  if (scene.webOpacity <= 0.01) return;
  const base = scene.webOpacity * (scene.focus ? 0.45 : 1);
  const batches = new Map<string, { path: Path2D; color: string; width: number; dash: number[]; alpha: number }>();

  for (const e of scene.ambient) {
    // ONE RELATIONSHIP, ONE LINE. An edge the meaning layer is already
    // drawing must not also appear as its own faint understudy.
    if (drawn.has(e.id)) continue;
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    if (
      (a.x < view.vx0 && b.x < view.vx0) ||
      (a.x > view.vx1 && b.x > view.vx1) ||
      (a.y < view.vy0 && b.y < view.vy0) ||
      (a.y > view.vy1 && b.y > view.vy1)
    )
      continue;
    const color = WEB_STRAND_COLOR[e.cls];
    // Rubric's ambient widths: `.5-.7 / cam.k`, by kind.
    const width = (e.cls === "semantic" || e.cls === "temporal" ? 0.9 : 0.6) / k;
    const dash = e.basis === "external" ? [2.2 / k, 2.6 / k] : e.basis === "inferred" ? [4 / k, 4 / k] : [];
    // Rubric's `.07-.16 * link * 2` band, and provenance stays quietest —
    // how a thing is known is not a statement about the project.
    const alpha =
      base *
      (e.cls === "provenance" ? 0.07 : e.cls === "contextual" ? 0.06 : 0.16) *
      SKIN.link *
      2 *
      (e.current ? 1 : 0.6);
    if (alpha < 0.004) continue;
    const key = `${color}|${width.toFixed(4)}|${dash.join(",")}|${Math.round(alpha * 200)}`;
    let bt = batches.get(key);
    if (!bt) batches.set(key, (bt = { path: new Path2D(), color, width, dash, alpha }));
    const [cx, cy] = linkCtrl(a, b, e.id);
    bt.path.moveTo(a.x, a.y);
    bt.path.quadraticCurveTo(cx, cy, b.x, b.y);
    stats.edgesPainted++;
  }

  for (const b of batches.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.strokeStyle = palette.css(b.color);
    ctx.lineWidth = b.width;
    ctx.setLineDash(b.dash);
    ctx.stroke(b.path);
    stats.calls++;
    stats.edgeBatches++;
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// ── LINKS ──────────────────────────────────────────────────────────────
//
// ADAPTED FROM `loop()` lines 979-1017 (culling + batching) and `drawLink()`
// index.html lines 205-235 (materials).
//
// THE MECHANIC WORTH HAVING: a focused edge gets a LINEAR GRADIENT from its
// source colour to its target colour. That is why a woken Rubric edge reads
// as a connection between two specific things rather than as a generic line —
// it carries both ends' identity along its length.
//
// SIGNAL'S GRAMMAR IS UNTOUCHED. The dash still says whose claim it is, focus
// still never rewrites it, and nothing travels.
function paintEdges(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  palette: TokenPalette,
  k: number,
  view: { vx0: number; vx1: number; vy0: number; vy1: number },
  stats: PaintStats
): void {
  const visible: { e: AuditVisualEdge; a: Placed; b: Placed }[] = [];
  for (const e of scene.edges) {
    if (!e.visible) continue;
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    // Rubric line 985: reject when BOTH ends are off the same side.
    if (
      (a.x < view.vx0 && b.x < view.vx0) ||
      (a.x > view.vx1 && b.x > view.vx1) ||
      (a.y < view.vy0 && b.y < view.vy0) ||
      (a.y > view.vy1 && b.y > view.vy1)
    )
      continue;
    visible.push({ e, a, b });
  }

  // The luminous provenance underlay — Signal's own, kept: object → passage →
  // source must read as one continuous route.
  const underlay = new Path2D();
  let underlayAlpha = 0;
  for (const { e, a, b } of visible) {
    if (!e.filament || e.woken == null) continue;
    const [cx, cy] = linkCtrl(a, b, e.id);
    underlay.moveTo(a.x, a.y);
    underlay.quadraticCurveTo(cx, cy, b.x, b.y);
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

  // AMBIENT EDGES BATCH; WOKEN EDGES ARE PAINTED INDIVIDUALLY, because only a
  // woken edge gets a gradient and a gradient cannot be batched.
  const batches = new Map<string, { path: Path2D; color: string; width: number; dash: number[]; alpha: number }>();
  for (const { e, a, b } of visible) {
    stats.edgesPainted++;
    const [cx, cy] = linkCtrl(a, b, e.id);
    if (e.woken != null) {
      // Rubric line 209: source colour → target colour, 0.9 alpha each end.
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const ca = palette.css(scene.nodes.find((n) => n.id === e.from)?.color ?? e.strokeColor);
      const cb = palette.css(scene.nodes.find((n) => n.id === e.to)?.color ?? e.strokeColor);
      g.addColorStop(0, rgba(ca, 0.9));
      g.addColorStop(1, rgba(cb, 0.9));
      ctx.globalAlpha = e.opacity;
      ctx.strokeStyle = g;
      // Rubric line 212: `1.4 / cam.k + 0.35` — a screen-compensated width
      // that stays substantial when zoomed out.
      ctx.lineWidth = (e.filament ? 1.0 : 1.4) / k + 0.35;
      ctx.setLineDash(e.dash ? [e.dash[0] / k, e.dash[1] / k] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      ctx.stroke();
      stats.calls++;
      continue;
    }
    // Rubric line 206: unrelated edges drop to 0.07 when a focus exists.
    const alpha = scene.focus ? 0.07 : e.opacity * (0.5 + SKIN.link);
    const width = e.weight / k;
    const dash = e.dash ? [e.dash[0] / k, e.dash[1] / k] : [];
    const key = `${e.strokeColor}|${width.toFixed(4)}|${dash.join(",")}|${Math.round(alpha * 50)}`;
    let b2 = batches.get(key);
    if (!b2) batches.set(key, (b2 = { path: new Path2D(), color: e.strokeColor, width, dash, alpha }));
    b2.path.moveTo(a.x, a.y);
    b2.path.quadraticCurveTo(cx, cy, b.x, b.y);
  }
  ctx.setLineDash([]);
  for (const b of batches.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.strokeStyle = palette.css(b.color);
    ctx.lineWidth = b.width;
    ctx.setLineDash(b.dash);
    ctx.stroke(b.path);
    stats.calls++;
    stats.edgeBatches++;
  }
  ctx.setLineDash([]);

  // Arrowheads, on woken directional edges only.
  const heads = new Map<string, { path: Path2D; alpha: number }>();
  for (const { e, b } of visible) {
    if (!e.head) continue;
    const key = `${e.strokeColor}|${Math.round(e.opacity * 50) / 50}`;
    let h = heads.get(key);
    if (!h) heads.set(key, (h = { path: new Path2D(), alpha: Math.round(e.opacity * 50) / 50 }));
    h.path.addPath(arrowHeadPath(b.x, b.y, e.tangent, k, e.target.r, e.head.double));
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

// ── TRACE COMETS ───────────────────────────────────────────────────────
//
// ADAPTED FROM `midLayer()` — index.html lines 238-269.
//
// Rubric's comet pool, used for the ONE case Signal can defend. The handoff
// is explicit (§10, KEEP/ADAPT table): ambient comets are DO NOT TAKE because
// motion on a stored relationship implies live activity; the same mechanism
// for an active Trace is "semantically defensible when activity is explicit".
//
// A Trace is a thing the reader turned on to watch a route being followed. It
// is the only place on this field where something moves along an edge.
function paintTraceComets(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  palette: TokenPalette,
  input: PaintInput,
  stats: PaintStats
): void {
  const route = scene.edges.filter((e) => input.traceEdges!.has(e.id) && e.visible);
  if (route.length === 0) return;
  ctx.globalCompositeOperation = "lighter";
  const col = palette.css("var(--i-source)");
  for (let i = 0; i < route.length; i++) {
    const e = route[i];
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    // Rubric's pool advances `p.t` per frame; Signal derives it from the
    // clock so the speed is the same on every display.
    const t = ((input.time / 2600 + i * 0.37) % 1);
    for (let s = 0; s < 4; s++) {
      const tt = t - s * 0.02;
      if (tt < 0) break;
      const [px, py] = linkPoint(a, b, e.id, tt);
      ctx.globalAlpha = (1 - s / 4) * 0.6;
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath();
      ctx.arc(px, py, (1.6 - s * 0.28) / Math.sqrt(input.camera.k), 0, Math.PI * 2);
      ctx.fill();
      stats.calls++;
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

// ── NODES ──────────────────────────────────────────────────────────────
//
// ADAPTED FROM `drawNode()` — index.html lines 271-463.
//
// TWO RUBRIC MECHANICS, AND THEY ARE THE WHOLE LOOK:
//
//   THE GLOW. `if (glow > .04 && on && !dim) drawImage(glowSprite(c), …)` at
//   `r * (2.1 + glow * 2.6)`. Every lit node carries an atmosphere.
//
//   THE ORB. A cached radial-lit sphere with its highlight OFF CENTRE, at
//   (0.38, 0.38). That offset is the difference between a filled circle and
//   a lit object, and it costs nothing because the sprite is cached.
//
// SIGNAL'S SHAPE CHANNEL SURVIVES INTACT. Rubric paints everything as a
// sphere because its types are carried by colour and icon; Signal's fourteen
// glyphs say WHAT KIND OF THING this is and are the accessibility floor for
// colour-blind readers. So the orb becomes the MATERIAL rather than the form:
// it is clipped to Signal's glyph. A hexagon still reads as a dependency, and
// it is now a lit hexagon rather than an outline.
function paintNode(
  ctx: CanvasRenderingContext2D,
  p: Placed,
  palette: TokenPalette,
  sprites: RubricSprites,
  k: number,
  input: PaintInput,
  stats: PaintStats,
  /** Multiplies opacity. Stands in for the blur while the field is moving. */
  alphaScale = 1
): void {
  const n = p.n;
  const color = palette.css(n.color);
  ctx.globalAlpha = n.opacity * alphaScale;
  ctx.setLineDash([]);

  if (n.identity === "latent") {
    // A latent mark is population, not an object. It stays a plain dot — but
    // it is now a LIT one, because that is nearly free.
    const s = sprites.orb(color, SKIN.litLeaf);
    if (s) ctx.drawImage(s, p.x - n.latentR, p.y - n.latentR, n.latentR * 2, n.latentR * 2);
    else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, n.latentR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    stats.calls++;
    stats.nodesPainted++;
    return;
  }

  const grown = n.selected ? n.r * 1.35 : n.hovered ? n.r * 1.15 : n.r;

  // THE GLOW — Rubric index.html line 321.
  if (SKIN.glow > 0.04 && n.depth === 0 && n.opacity > 0.3) {
    const gr = grown * (2.1 + SKIN.glow * 2.6);
    const s = sprites.glow(color);
    if (s) {
      ctx.globalAlpha = n.opacity * SKIN.glowAlpha * SKIN.glow;
      ctx.drawImage(s, p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = n.opacity;
      stats.calls++;
    }
  }

  const geo = nodeShapePath(n.shape, p.x, p.y, grown);
  const stroke = 1.4 / k;

  if (n.hollow) {
    // AN UNKNOWN STAYS GENUINELY EMPTY. Its whole content is that it has no
    // content yet, and a lit body would be a claim.
    ctx.fillStyle = palette.css("var(--i-void)");
    ctx.fill(geo.path);
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.setLineDash([2.4 / k, 1.8 / k]);
    ctx.stroke(geo.path);
    ctx.setLineDash([]);
    stats.calls += 2;
  } else if (shapeIsOutline(n.shape)) {
    // THE ORB AS MATERIAL: the sprite, clipped to Signal's own glyph.
    const s = sprites.orb(color, n.layoutRole === "leaf" ? SKIN.litLeaf : SKIN.litGroup);
    ctx.save();
    ctx.clip(geo.path);
    if (s) {
      const b = grown * 1.35;
      ctx.drawImage(s, p.x - b, p.y - b, b * 2, b * 2);
    } else {
      ctx.fillStyle = color;
      ctx.fill(geo.path);
    }
    ctx.restore();
    // A rim, brighter than the body, so the silhouette stays legible against
    // its own glow. Rubric strokes its hubs the same way (line 314).
    ctx.strokeStyle = mix(color, "#ffffff", 0.25);
    ctx.lineWidth = (n.shape === "disc" ? stroke * 1.2 : stroke) + 0.15;
    if (n.shape === "shard") ctx.setLineDash([2.4 / k, 1.8 / k]);
    ctx.stroke(geo.path);
    ctx.setLineDash([]);
    stats.calls += 3;
    void shapeBodyTint;
  } else {
    const s = sprites.orb(color, SKIN.litLeaf);
    if (s) ctx.drawImage(s, p.x - grown, p.y - grown, grown * 2, grown * 2);
    else {
      ctx.fillStyle = color;
      ctx.fill(geo.path);
    }
    stats.calls++;
  }

  if (geo.detail) {
    ctx.globalAlpha = n.opacity * geo.detailAlpha;
    if (geo.detailFilled) {
      ctx.fillStyle = mix(color, "#ffffff", 0.4);
      ctx.fill(geo.detail);
    } else {
      ctx.strokeStyle = mix(color, "#ffffff", 0.4);
      ctx.lineWidth = n.shape === "page" ? stroke * 0.8 : stroke;
      ctx.stroke(geo.detail);
    }
    stats.calls++;
  }

  // HOVER: a white rim. Rubric index.html line 460 — the one place pure white
  // appears on a node, which is what makes preselection unmistakable.
  if (n.hovered && !n.selected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2 / k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, grown + 1 + 2 / k, 0, Math.PI * 2);
    ctx.stroke();
    stats.calls++;
  }

  // A search match or the audit sweep passing over.
  if ((n.matched || n.swept) && !n.selected) {
    ctx.globalAlpha = n.opacity * 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, grown + 7 / k, 0, Math.PI * 2);
    ctx.stroke();
    stats.calls++;
  }

  ctx.globalAlpha = 1;
  stats.nodesPainted++;
}

/**
 * REALITY — the hero.
 *
 * ADAPTED FROM the router painter, index.html lines 285-300: a breathing
 * corona, eight slowly rotating rays, and a body. Rubric's sun is the most
 * recognisable single object on its field, and Reality occupies exactly that
 * position in Signal's.
 *
 * The rays ROTATE and the corona BREATHES, and both stop under reduced
 * motion. This is decoration in the honest sense — it says "this is the
 * centre" and claims nothing about the data.
 */
function paintReality(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  palette: TokenPalette,
  sprites: RubricSprites,
  k: number,
  input: PaintInput,
  stats: PaintStats
): void {
  const core = scene.nodes.find((n) => n.kind === "reality");
  if (!core) return;
  const p = placed.get(core.id);
  if (!p) return;
  const cs = scene.coreScale;
  const signal = palette.css("var(--i-signal)");
  const t = input.reducedMotion ? 0 : input.time;

  const breathe = input.reducedMotion ? 0 : Math.sin(t * 0.0012) * 5;
  const gr = (FIELD.coreR + 46 + breathe) * cs;
  const glow = sprites.glow(signal);
  if (glow) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
    stats.calls++;
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = rgba(signal, 0.5);
  ctx.lineWidth = 1 / k;
  const rayIn = FIELD.coreR * cs * 1.12;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 0.00024;
    const wob = input.reducedMotion ? 0 : Math.sin(t * 0.003 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * rayIn, p.y + Math.sin(a) * rayIn);
    ctx.lineTo(p.x + Math.cos(a) * (rayIn + 12 * cs + wob), p.y + Math.sin(a) * (rayIn + 12 * cs + wob));
    ctx.stroke();
    stats.calls++;
  }

  const r = FIELD.coreR * cs;
  const orb = sprites.orb(signal, 0.62);
  if (orb) ctx.drawImage(orb, p.x - r, p.y - r, r * 2, r * 2);
  ctx.strokeStyle = mix(signal, "#ffffff", 0.4);
  ctx.lineWidth = 1.7 / k;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  stats.calls += 2;
}

/**
 * THE SELECTION RING.
 *
 * ADAPTED FROM `drawSelection()` — index.html lines 476-484: two rings, one
 * white and one in the node's own colour, both breathing on `sin(tick * .08)`.
 * It is the clearest "this one" on the reference field.
 */
function paintSelection(
  ctx: CanvasRenderingContext2D,
  p: Placed,
  palette: TokenPalette,
  k: number,
  input: PaintInput,
  stats: PaintStats
): void {
  const n = p.n;
  const r = n.r * 1.35;
  const pulse = input.reducedMotion ? 0 : Math.sin(input.time * 0.0048);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.3 / k;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 5 / k + pulse * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(palette.css(n.color), 0.5);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 10 / k + pulse * 2.5, 0, Math.PI * 2);
  ctx.stroke();
  stats.calls += 2;
}

// ── LABELS ─────────────────────────────────────────────────────────────
//
// ADAPTED FROM `drawLabels()` — _core.js lines 1071-1092 (eligibility and
// budget) and index.html lines 486-510 (placement and halo).
//
// Rubric's ELIGIBILITY policy is worth taking: force hover/selection and
// major nodes, gate the rest on projected radius, sort big-first, truncate to
// a budget. Its PLACEMENT is not — the handoff marks it REPLACE, because it
// has no collision detection at all.
//
// So: Rubric's gate, Signal's allocator. The scene's label plan already ran a
// deterministic screen-space collision pass upstream; this only decides how a
// surviving name is drawn.
function paintNodeName(
  ctx: CanvasRenderingContext2D,
  p: Placed,
  camera: PaintCamera,
  vp: { w: number; h: number },
  fontFamily: string,
  palette: TokenPalette,
  stats: PaintStats,
  reserve?: (cx: number, cy: number, w: number, h: number, mandatory?: boolean) => boolean,
  mandatory = false
): void {
  const n = p.n;
  const sx = (p.x - camera.x) * camera.k + vp.w / 2;
  const sy = (p.y - camera.y) * camera.k + vp.h / 2;
  if (sx < -200 || sx > vp.w + 200 || sy < -40 || sy > vp.h + 40) return;
  const grown = n.selected ? n.r * 1.35 : n.hovered ? n.r * 1.15 : n.r;
  const big = n.layoutRole === "router" || n.layoutRole === "hub";
  const label = big ? n.label.toUpperCase() : truncateLabel(n.label, n.kind === "passage" ? 40 : 32);

  // Rubric places labels BENEATH the node at a fixed offset, which is what
  // keeps a dense field readable: every name is in the same relation to its
  // mark, so the eye stops hunting for which label belongs to what.
  const oy = sy + grown * camera.k + (big ? 16 : 11);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = big ? `600 10.5px ${fontFamily}` : `400 9.5px ${fontFamily}`;
  if (reserve && !reserve(sx, oy - 4, ctx.measureText(label).width + 8, big ? 16 : 13, mandatory)) return;
  ctx.globalAlpha = n.opacity;
  // Rubric's halo: the same string drawn one pixel down-right in the
  // background colour. Cheaper than a stroke and reads the same.
  ctx.fillStyle = rgba(palette.css("var(--i-void)"), 0.9);
  ctx.fillText(label, sx + 1, oy + 1);
  ctx.fillStyle = palette.css(
    n.selected || n.hovered || n.rank != null ? "var(--i-text)" : "var(--i-text-soft)"
  );
  ctx.fillText(label, sx, oy);
  ctx.globalAlpha = 1;
  stats.calls += 2;
  stats.labelsPainted++;
}

function paintLabels(
  ctx: CanvasRenderingContext2D,
  scene: AuditScene,
  placed: Map<string, Placed>,
  shells: Shell[],
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

  // ── THE ONE THING RUBRIC DOES NOT SOLVE ──────────────────────────────
  //
  // The handoff is explicit (§8): Rubric's label placement has "no
  // label-label collision detection, occupancy grid, quadtree, anchor
  // search, leader line, or edge-label logic", and is marked REPLACE. Its
  // ELIGIBILITY policy is worth taking — force hover/selection and major
  // nodes, gate the rest, sort big-first, budget — and is taken above.
  //
  // This is the missing half: a deterministic screen-space reservation, in
  // priority order. Mandatory names go first and always win; everything else
  // takes the space that is left. It is a rectangle list rather than a grid
  // because at a sixty-label budget the list is faster and exact.
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const reserve = (cx: number, cy: number, w: number, h: number, mandatory = false): boolean => {
    const box = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
    if (!mandatory) {
      for (const t of taken) {
        if (box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0) return false;
      }
    }
    taken.push(box);
    return true;
  };

  const halo = rgba(palette.css("var(--i-void)"), 0.9);
  const write = (text: string, x: number, y: number, fill: string) => {
    ctx.fillStyle = halo;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    stats.calls += 2;
  };

  // Cluster names, and the counts that expand them.
  //
  // BIGGEST LANE FIRST, AND THEY COLLIDE LIKE ANYTHING ELSE. The previous
  // version made every cluster name mandatory on the grounds that the legend
  // is never dropped — and four of them promptly printed on top of each
  // other where their cells had settled close together, which is not a
  // legend, it is a smear. A name that cannot be read is not protecting
  // anything.
  const clusters = [...input.clusterLabels].sort((a, b) => b.latent - a.latent);
  for (const c of clusters) {
    // The lane puck is a real node that the spatial field moves, so its name
    // follows it rather than staying at the seat the static layout gave it.
    const lane = placed.get(`lane:${c.cluster}`);
    const p = toScreen(lane ? lane.x : c.x, lane ? lane.y : c.y);
    if (p.x < -220 || p.x > vp.w + 220 || p.y < -60 || p.y > vp.h + 60) continue;
    ctx.globalAlpha = scene.dimClusterLabels ? 0.34 : 1;
    ctx.textAlign = c.flip ? "right" : "left";
    ctx.font = `600 12px ${fontFamily}`;
    const cw = ctx.measureText(c.label).width + 10;
    if (!reserve(c.flip ? p.x - cw / 2 : p.x + cw / 2, p.y + 7, cw, 30)) continue;
    write(
      c.label.toUpperCase(),
      p.x,
      p.y,
      palette.css(c.supplied ? "var(--i-text)" : "var(--i-text-faint)")
    );
    if (c.latent > 0 || c.open) {
      ctx.font = `400 10.5px ${fontFamily}`;
      write(c.open ? "− collapse" : `+ ${c.latent}`, p.x, p.y + 15, palette.css("var(--i-text-faint)"));
    }
    stats.labelsPainted++;
  }

  // Constellation shells.
  for (const sh of shells) {
    const agg = sh.agg;
    if (agg.opacity <= 0.01) continue;
    const tint = palette.css(agg.tint ?? "var(--i-text-soft)");
    const off = sh.r * camera.k + 7;
    const p = toScreen(sh.x, sh.y);
    const ax = agg.named ? p.x + (agg.labelFlip ? -off : off) : p.x;
    if (ax < -220 || ax > vp.w + 220 || p.y < -60 || p.y > vp.h + 60) continue;
    ctx.globalAlpha = agg.opacity;
    if (agg.named) {
      ctx.textAlign = agg.labelFlip ? "right" : "left";
      ctx.font = `600 11px ${fontFamily}`;
      const aw = ctx.measureText(agg.label).width + 10;
      if (!reserve(agg.labelFlip ? ax - aw / 2 : ax + aw / 2, p.y + 6, aw, 26)) continue;
      write(agg.label.toUpperCase(), ax, p.y, palette.css("var(--i-text)"));
      ctx.font = `400 10px ${fontFamily}`;
      write(String(agg.count), ax, p.y + 13, tint);
    } else {
      ctx.textAlign = "center";
      ctx.font = `400 10px ${fontFamily}`;
      write(String(agg.count), ax, p.y, tint);
    }
    stats.labelsPainted++;
  }

  // Edge verbs, on woken edges with room for the word.
  for (const e of scene.edges) {
    if (!e.visible || !e.showVerb) continue;
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const [cx, cy] = linkCtrl(a, b, e.id);
    const p = toScreen((mx + cx) / 2, (my + cy) / 2);
    if (p.x < -60 || p.x > vp.w + 60 || p.y < -30 || p.y > vp.h + 30) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.globalAlpha = Math.max(e.opacity, 0.88);
    ctx.textAlign = "center";
    ctx.font = `400 9px ${fontFamily}`;
    write(
      e.verb,
      0,
      0,
      palette.css(
        e.filament ? "var(--i-source)" : e.woken === "temporal" ? "var(--i-text)" : "var(--i-signal)"
      )
    );
    ctx.restore();
    stats.labelsPainted++;
  }

  // Node names, sharp ones only — the softened ones rode the depth layer.
  //
  // MANDATORY FIRST: the selection, whatever is under the cursor, and any
  // search match. Those are what the reader asked for and they may overlap
  // anything. Everything else takes what is left, in the plan's own order.
  const named = scene.nodes.filter((n) => n.labelled && n.kind !== "reality" && n.depth === 0 && placed.has(n.id));
  const mandatory = named.filter((n) => n.selected || n.hovered || n.matched);
  const optional = named.filter((n) => !(n.selected || n.hovered || n.matched));
  for (const n of mandatory) {
    paintNodeName(ctx, placed.get(n.id)!, camera, vp, fontFamily, palette, stats, reserve, true);
  }
  for (const n of optional) {
    paintNodeName(ctx, placed.get(n.id)!, camera, vp, fontFamily, palette, stats, reserve, false);
  }

  // Reality's own two words.
  const core = scene.nodes.find((n) => n.kind === "reality");
  const corePlaced = core ? placed.get(core.id) : null;
  if (core && corePlaced) {
    const p = toScreen(corePlaced.x, corePlaced.y);
    const cs = scene.coreScale * camera.k;
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.min(10, 14 * cs)}px ${fontFamily}`;
    write("ACCEPTED", p.x, p.y - 6 * cs, palette.css("var(--i-signal)"));
    ctx.font = `600 ${Math.min(17, 24 * cs)}px ${fontFamily}`;
    write("Reality", p.x, p.y + 12 * cs, palette.css("var(--i-text)"));
  }

  ctx.globalAlpha = 1;
}

export function truncateLabel(s: string, n: number): string {
  if (s.length <= n) return s;
  const pathShaped = s.includes("://") || s.split("/").length > 2;
  return pathShaped ? `…${s.slice(s.length - (n - 1))}` : `${s.slice(0, n - 1)}…`;
}

export { WEB_STRAND_COLOR };
