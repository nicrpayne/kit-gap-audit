// ADAPTED FROM RUBRIC SECOND BRAIN — `public/_flows2.js`, lines 17-58.
//
// Original work: Copyright (c) 2026 Jay E | RoboNuggets
// (https://skool.com/robonuggets), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/legalcode).
// Reference copy: lab/rubric-reference/second-brain/public/_flows2.js
//
// CHANGES MADE BY SIGNAL:
//   · Ported from a browser IIFE (`window.F2`) to a typed ES module.
//   · Colours arrive already resolved from Signal's own `--i-*` token set
//     rather than as Rubric hex literals; `mix`/`hexToRgba` accept `rgb()`
//     strings as well as hex.
//   · Sprite caches are instance-owned and bounded rather than module-global
//     and unbounded, and are keyed by device pixel ratio so a sprite is never
//     resampled across a DPR change.
//   · `bowOf` keys on a stable string (Signal's canonical edge id) instead of
//     an array index, because Signal's edge order is not stable across
//     re-derivations and the curvature must not change when it re-derives.
//
// WHY THIS IS THE THING TO TAKE. The handoff calls sprite caching one of the
// three mechanisms that "contribute more to Rubric's visual identity than its
// camera does" (§3). The reason is arithmetic: a radial gradient is the honest
// way to draw a glow and one of the more expensive things a 2D context can be
// asked for, so Rubric builds each one ONCE per colour and blits it forever
// after. That is what lets every node carry a real luminous falloff instead of
// the concentric strokes an SVG has to approximate one with.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Rubric's `norm` + channel split, widened to accept resolved `rgb()`. */
export function parseRgb(color: string): Rgb {
  const s = color.trim();
  if (s.startsWith("#")) {
    const hex = s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0 };
  }
  return { r: 144, g: 153, b: 161 };
}

/** `F2.hexToRgba` — _flows2.js line 6. */
export function rgba(color: string, a: number): string {
  const { r, g, b } = parseRgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

/** `F2.mix` — _flows2.js line 11. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(pa.r, pb.r)},${c(pa.g, pb.g)},${c(pa.b, pb.b)})`;
}

// ── CURVATURE ──────────────────────────────────────────────────────────
//
// `F2.bowOf` / `linkCtrl` / `linkPoint` — _flows2.js lines 17-30.
//
// Deterministic per-edge bow: a sign and a magnitude between 0.07 and 0.16,
// hashed from the edge's identity, applied perpendicular to the chord. It is
// curvature, NOT edge bundling — the handoff is explicit that Rubric has no
// shared bundle paths (§10).
//
// Signal already bows its edges toward the field centre, which is a different
// and equally deliberate rule. Both are kept: the radial bow is used in Rings,
// where the field HAS a centre and curving toward it reads as routing; this
// per-edge bow is used in Constellations, where there is no single centre to
// bow toward and Rubric's alternating hash is what stops parallel edges from
// collapsing into one another.

const BOWS = new Map<string, number>();

export function bowOf(key: string): number {
  const held = BOWS.get(key);
  if (held !== undefined) return held;
  // Rubric hashes an integer index; Signal hashes a canonical id string,
  // because its edge ORDER is not stable across re-derivations and a bow that
  // changed when the graph rebuilt would make the field twitch for no reason.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const i = Math.abs(h);
  const bow = (i % 2 ? 1 : -1) * (0.07 + ((i % 13) / 13) * 0.09);
  if (BOWS.size > 8000) BOWS.clear();
  BOWS.set(key, bow);
  return bow;
}

export function linkCtrl(
  a: { x: number; y: number },
  b: { x: number; y: number },
  key: string
): [number, number] {
  const bw = bowOf(key);
  return [(a.x + b.x) / 2 - (b.y - a.y) * bw, (a.y + b.y) / 2 + (b.x - a.x) * bw];
}

export function linkPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  key: string,
  t: number
): [number, number] {
  const [cx, cy] = linkCtrl(a, b, key);
  const u = 1 - t;
  return [
    u * u * a.x + 2 * u * t * cx + t * t * b.x,
    u * u * a.y + 2 * u * t * cy + t * t * b.y,
  ];
}

// ── CACHED SPRITES ─────────────────────────────────────────────────────

const ORB_SIZE = 48;
const GLOW_SIZE = 64;
const MAX_SPRITES = 320;

/**
 * `F2.orbSprite` and `F2.glowSprite` — _flows2.js lines 32-58.
 *
 *   ORB   a lit sphere: a radial gradient whose highlight sits at (0.38,
 *         0.38) of the sprite rather than at its centre, running from the
 *         colour mixed toward white down to the colour itself. That offset
 *         highlight is why a Rubric node reads as a lit object rather than as
 *         a filled circle, and it is one constant.
 *   GLOW  the atmosphere: colour at 0.55 alpha in the centre, 0.22 at 40%,
 *         zero at the rim.
 *
 * Both are rasterised once per colour and blitted thereafter.
 */
export class RubricSprites {
  private orbs = new Map<string, HTMLCanvasElement>();
  private glows = new Map<string, HTMLCanvasElement>();
  private dpr = 1;

  setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.orbs.clear();
    this.glows.clear();
  }

  get size(): number {
    return this.orbs.size + this.glows.size;
  }

  clear(): void {
    this.orbs.clear();
    this.glows.clear();
  }

  orb(color: string, litMix: number): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const key = `${color}|${litMix}`;
    const held = this.orbs.get(key);
    if (held) return held;
    const S = Math.round(ORB_SIZE * this.dpr);
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    if (!g) return null;
    const grd = g.createRadialGradient(S * 0.38, S * 0.38, S * 0.05, S / 2, S / 2, S / 2);
    grd.addColorStop(0, mix(color, "#ffffff", litMix));
    grd.addColorStop(1, color);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.fill();
    if (this.orbs.size > MAX_SPRITES) this.orbs.clear();
    this.orbs.set(key, c);
    return c;
  }

  glow(color: string): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const held = this.glows.get(color);
    if (held) return held;
    const S = Math.round(GLOW_SIZE * this.dpr);
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    if (!g) return null;
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, rgba(color, 0.55));
    grd.addColorStop(0.4, rgba(color, 0.22));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    if (this.glows.size > MAX_SPRITES) this.glows.clear();
    this.glows.set(color, c);
    return c;
  }
}

// ── SILHOUETTES ────────────────────────────────────────────────────────
//
// `F2.rrect` / `diamond` / `hex` — _flows2.js lines 61-73. Signal keeps its
// own fourteen kind glyphs (see ../shapes.ts, which is the SVG renderer's own
// vocabulary); these are the primitives the Rubric-derived painters need on
// top of them.

export function hexPath(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, s: number): void {
  const p = ctx as Path2D;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + s * Math.cos(a);
    const py = y + s * Math.sin(a);
    if (i) p.lineTo(px, py);
    else p.moveTo(px, py);
  }
  p.closePath();
}
