// CACHED GLOW SPRITES.
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────
//
// A radial gradient is the honest way to draw a glow: luminance falling off
// smoothly from a centre, which is what light actually does and what three
// concentric strokes only approximate. It is also, per draw, one of the more
// expensive things a 2D context can be asked for — the gradient has to be
// built, then rasterised over the fill area, every time.
//
// The SVG renderer sidesteps this by NOT drawing gradients: a selected node
// gets three concentric circle strokes, chosen explicitly because "a blur on
// the node that must respond instantly would cost a rasterisation surface on
// exactly the wrong element". That reasoning is correct for SVG and it is
// exactly what caps how good the bloom can look there — three steps is three
// steps, and the eye can count them.
//
// ── THE MECHANIC ───────────────────────────────────────────────────────
//
// A canvas can have the smooth falloff AND pay for it once, because the same
// glow is drawn over and over at a handful of distinct sizes and colours.
// Rasterise each (colour, radius) once into an offscreen canvas; every
// subsequent draw is a `drawImage`, which is a blit.
//
// Radii are QUANTISED into geometric buckets before they key the cache. A
// continuous zoom otherwise produces a new sprite on every frame, which is
// the cache paying full price forever and then also holding the results. The
// bucket is fine enough that no one can see the step and coarse enough that a
// whole gesture reuses one sprite.
//
// ── AND IT IS BOUNDED ──────────────────────────────────────────────────
//
// A cache with no eviction is a memory leak with good intentions. Signal's
// palette is small and the buckets are few, so the natural working set is
// tens of sprites; the cap exists for the pathological case (a long session
// sweeping the whole zoom range over every colour) and evicts oldest-first.

const BUCKETS_PER_EFOLD = 8;
const MAX_SPRITES = 240;
/** Beyond this a sprite is larger than any glow that helps, and the cost of
    holding it stops being worth the blit. */
const MAX_SPRITE_PX = 512;

export type SpriteKind = "corona" | "orb";

interface SpriteKey {
  kind: SpriteKind;
  css: string;
  radiusPx: number;
}

function quantizeRadius(px: number): number {
  if (px <= 1) return 1;
  return Math.exp(Math.round(Math.log(px) * BUCKETS_PER_EFOLD) / BUCKETS_PER_EFOLD);
}

/**
 * Sprites, keyed by what they look like rather than by which node asked.
 *
 * Two nodes of the same colour and size share one sprite, which is the whole
 * point: 192 external claims in four type colours at one zoom are four
 * sprites, not 192.
 */
export class SpriteCache {
  private readonly map = new Map<string, HTMLCanvasElement>();
  private dpr = 1;

  setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    // Every held sprite was rasterised for the old density and would be
    // resampled — cheaper and sharper to rebuild than to blur.
    this.map.clear();
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * A glow sprite, rasterised on first ask.
   *
   * `css` is an already-resolved colour string (see TokenPalette) — the cache
   * never resolves tokens itself, so it holds no opinion about the palette.
   */
  get(kind: SpriteKind, css: string, radiusPx: number): { sprite: HTMLCanvasElement; radius: number } | null {
    if (typeof document === "undefined") return null;
    const radius = Math.min(quantizeRadius(radiusPx), MAX_SPRITE_PX / 2);
    if (radius < 1) return null;
    const key = `${kind}|${css}|${radius.toFixed(3)}`;
    const hit = this.map.get(key);
    if (hit) {
      // Refresh recency: delete and re-set moves it to the end of the
      // insertion order Map iteration uses, which is what makes the eviction
      // below oldest-first rather than arbitrary.
      this.map.delete(key);
      this.map.set(key, hit);
      return { sprite: hit, radius };
    }

    const sprite = rasterise({ kind, css, radiusPx: radius }, this.dpr);
    if (!sprite) return null;
    if (this.map.size >= MAX_SPRITES) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, sprite);
    return { sprite, radius };
  }
}

function rasterise(key: SpriteKey, dpr: number): HTMLCanvasElement | null {
  const side = Math.max(2, Math.ceil(key.radiusPx * 2 * dpr));
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const mid = side / 2;
  const r = mid;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, r);

  // TWO PROFILES, AND THEY MEAN DIFFERENT THINGS.
  //
  //   CORONA  a selection's authority. Bright at the rim of the node and
  //           falling away — it reads as light coming OFF the mark, so the
  //           mark itself stays the sharpest thing inside it. A flat centre
  //           would wash out the shape the reader is trying to identify.
  //   ORB     mass. Brightest at the centre and soft to nothing, for hubs
  //           and for Reality, where the glow is the body rather than an
  //           annotation on it.
  const stops: [number, number][] =
    key.kind === "corona"
      ? [
          [0, 0],
          [0.42, 0.1],
          [0.62, 0.34],
          [0.78, 0.18],
          [1, 0],
        ]
      : [
          [0, 0.55],
          [0.34, 0.28],
          [0.66, 0.09],
          [1, 0],
        ];

  const rgb = key.css;
  for (const [at, alpha] of stops) {
    g.addColorStop(at, withAlpha(rgb, alpha));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, side, side);
  return c;
}

/** Multiply an already-resolved `rgb()`/`rgba()` string by an alpha. */
export function withAlpha(css: string, alpha: number): string {
  const m = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (!m) return css;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const [r, g, b] = parts;
  const base = parts.length > 3 ? parts[3] : 1;
  return `rgba(${r},${g},${b},${(alpha * base).toFixed(4)})`;
}
