// ADAPTED FROM RUBRIC SECOND BRAIN — `public/index.html`, `drawBackdrop()`
// lines 127-152 and `underLayer()` lines 154-203.
//
// Original work: Copyright (c) 2026 Jay E | RoboNuggets
// (https://skool.com/robonuggets), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/legalcode).
// Reference copy: lab/rubric-reference/second-brain/public/index.html
//
// CHANGES MADE BY SIGNAL:
//   · Ported to a typed module; the skin object and theme table are replaced
//     by Signal's own resolved `--i-*` tokens.
//   · Rubric hard-codes `#0a0a0a` for the ground under its hex field; Signal
//     paints `--i-void`, so the instrument's own black is the black.
//   · The hex field is a declared, tunable field rather than a fixed one, so
//     the "does the hex grid belong in Audit" question the handoff raises
//     (§16.3) can be answered by turning one number down rather than by
//     rewriting the backdrop.
//
// WHY IT IS CACHED. Rubric renders this once into `S.bgCache` and reuses it
// until the window resizes (`_core.js` lines 963-972). It has to be: the hex
// field is O(W·H / 520) stroked paths — several thousand at a normal viewport
// — and drawing it per frame would cost more than the entire graph.

const HEX_SIZE = 20;
/** Rubric's `k`, which scales the whole field's alpha. */
const FIELD_K = 0.55;

export interface BackdropOptions {
  /** `--i-void`, resolved. */
  ground: string;
  /** The hex stroke, resolved. Rubric uses white at very low alpha. */
  ink: string;
  /** 0 disables the hex field entirely and leaves ground + vignette. */
  field: number;
  /** Vignette strength. Rubric's is 0.4. */
  vignette: number;
}

/**
 * The backdrop, painted once into an offscreen canvas.
 *
 * Two elements, and they do different jobs:
 *
 *   THE HEX FIELD tells the eye that the dark area is a SURFACE rather than
 *   an absence. It fades with distance from centre (`1 - dist/maxD * 0.6`,
 *   squared) so it is a texture near the middle and nothing at the corners.
 *
 *   THE VIGNETTE says where to look, before anything has been identified. It
 *   runs from transparent at 30% of the smaller dimension to 40% black at 72%
 *   of the larger one.
 *
 * Both are well under the contrast of the faintest real mark, so neither can
 * be mistaken for content.
 */
export function paintBackdrop(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: BackdropOptions
): void {
  g.fillStyle = opts.ground;
  g.fillRect(0, 0, W, H);

  if (opts.field > 0.001) {
    const hS = HEX_SIZE * Math.sqrt(3);
    const vS = HEX_SIZE * 1.5;
    const cx0 = W / 2;
    const cy0 = H / 2;
    const maxD = Math.sqrt(cx0 * cx0 + cy0 * cy0);
    g.lineWidth = 0.6;
    for (let row = -1; row < H / vS + 2; row++) {
      for (let col = -1; col < W / hS + 2; col++) {
        const hx = col * hS + (row % 2 ? hS / 2 : 0);
        const hy = row * vS;
        const dist = Math.sqrt((hx - cx0) ** 2 + (hy - cy0) ** 2);
        const fade = Math.max(0, 1 - (dist / maxD) * 0.6);
        const alpha = 0.064 * fade * fade * (FIELD_K * 2) * opts.field;
        if (alpha < 0.005) continue;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = hx + HEX_SIZE * Math.cos(a);
          const py = hy + HEX_SIZE * Math.sin(a);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.globalAlpha = alpha;
        g.strokeStyle = opts.ink;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  const v = g.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.3,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.72
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,0,${opts.vignette})`);
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

/**
 * THE BACKDROP CACHE.
 *
 * Rubric keys it on nothing and clears it on resize. Signal keys it on the
 * things that actually change it — size, DPR and the resolved palette — so a
 * theme change rebuilds it and a pan does not.
 */
export class BackdropCache {
  private canvas: HTMLCanvasElement | null = null;
  private key = "";

  get(W: number, H: number, dpr: number, opts: BackdropOptions): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const key = `${W}x${H}@${dpr}|${opts.ground}|${opts.ink}|${opts.field}|${opts.vignette}`;
    if (this.canvas && this.key === key) return this.canvas;
    const c = this.canvas ?? document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const g = c.getContext("2d");
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    paintBackdrop(g, W, H, opts);
    this.canvas = c;
    this.key = key;
    return c;
  }

  release(): void {
    this.canvas = null;
    this.key = "";
  }
}
