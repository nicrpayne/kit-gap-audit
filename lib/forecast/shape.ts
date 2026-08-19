// THE SHAPE OF A FORECAST, INDEPENDENT OF HOW IT IS DRAWN.
//
// These four functions turn a sorted trial array into something a renderer
// can put on screen. They were written for the Living Forecast's horizontal
// spindle and lived inside it; Orbit needs exactly the same shape on a
// radial arc, so they live here now and BOTH surfaces import them.
//
// That is the whole reason this file exists. Two copies of "how dense are
// the trials here" would eventually disagree, and then the same project
// would have two shapes depending on which instrument you were standing in.
//
// Nothing here knows about pixels, angles, viewBoxes or colour. Nothing here
// smooths beyond the fixed kernel already established, and nothing invents
// shape the trials do not have — a genuinely bimodal project stays bimodal.
//
// PURE. No clock, no randomness, no DOM.

/** Bins used across the day window. Fixed, so two renderings of the same
    trials are the same shape at any size. */
export const BINS = 128;

/** Quantile samples used for morphing — each point is equal probability
    mass, so binning them reproduces the true histogram shape. */
export const Q = 384;

/** Resample a sorted trial array to a fixed-length quantile vector.
    Fixed length is what makes two different simulations interpolable: the
    i-th element always means "the i/n quantile", so a morph between two
    forecasts is a morph between like and like. */
export function quantileSample(sorted: number[], n = Q): number[] {
  const out = new Array<number>(n);
  if (sorted.length === 0) return out.fill(0);
  for (let i = 0; i < n; i++) {
    out[i] = sorted[Math.round((i / (n - 1)) * (sorted.length - 1))];
  }
  return out;
}

/** Trial mass per bin across [minDay, maxDay]. */
export function density(days: number[], minDay: number, maxDay: number): number[] {
  const span = maxDay - minDay || 1;
  const counts = new Array<number>(BINS).fill(0);
  for (const d of days) {
    const t = (d - minDay) / span;
    if (t < 0 || t > 1) continue;
    counts[Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))] += 1;
  }
  // Light smoothing only — enough to read as a form, never enough to invent
  // shape the trials don't have. A genuinely bimodal project stays bimodal.
  const k = [1, 3, 5, 3, 1];
  return counts.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = -2; j <= 2; j++) {
      const n = i + j;
      if (n < 0 || n >= BINS) continue;
      s += counts[n] * k[j + 2];
      w += k[j + 2];
    }
    return w ? s / w : 0;
  });
}

/** First and last bin carrying real mass — the object starts and ends at the
    trials, not at the canvas edge. */
export function liveRange(d: number[]): [number, number] {
  const peak = Math.max(...d, 1);
  const live = d.map((v) => v / peak > 0.004);
  const first = live.indexOf(true);
  const last = live.lastIndexOf(true);
  return first < 0 ? [0, BINS - 1] : [first, last];
}

/** Heights of the density region above a threshold fraction of the peak —
    a true isosurface of the same density, renormalised so τ=0 is the full
    form. This is what makes the body volumetric without inventing shape:
    inner shells are literally "where the probability is denser". */
export function shellHeights(d: number[], peak: number, amp: number, tau: number): number[] {
  return d.map((v) => (Math.max(0, v / peak - tau) / (1 - tau)) * amp);
}
