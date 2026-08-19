// ORBIT'S GEOMETRY. PRESENTATION ONLY — but not arbitrary.
//
// Nothing here is business truth and nothing here is persisted. What it is,
// is a grammar: every position on the screen has to mean something, or the
// radial form is decoration and a bar chart would say more.
//
// THE GRAMMAR
//
//   RADIUS is causal distance from the consequence. The forecast is the
//   centre. Work sits outside it. What controls whether the work moves sits
//   outside that. Supply comes from furthest out. Reading inward is reading
//   the causal chain in order.
//
//   ANGLE means two different things in two different places, and the two
//   never overlap in radius:
//     · INSIDE THE HALO, angle is TIME. The arc is the day axis.
//     · OUTSIDE THE HALO, angle is only seating. A capability's angle says
//       nothing about when it lands, because the model does not know that —
//       a capability contributes to the whole distribution, not to a day.
//
//   That second rule is why load flows all bundle onto the sector's midline
//   and are absorbed into the forecast's inner edge, rather than landing on
//   the halo at their own angle. A line touching the halo at an angle would
//   be claiming a date the model never computed.
//
//   THE ARC IS OPEN. 240° with the mouth at the bottom. A closed ring would
//   put the last trial next to the first and claim time wraps. It does not.
//
// PURE: no DOM, no clock, no state.

import { BINS, density, liveRange } from "@/lib/forecast/shape";

export const FRAME = { size: 1000, cx: 500, cy: 500 } as const;

/** The visible window. Deliberately NOT the full square: the arc's mouth is
    120° of deliberate emptiness, and showing all of it would put a third of
    the screen below anything that means something. Cropped to where the
    instrument actually is, so the object fills its frame. */
export const VIEWBOX = { x: 0, y: 6, w: 1000, h: 752 } as const;
export const viewBoxAttr = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;

/** Radii, inward-causal. Every gap between two of these is deliberate: it is
    the room a relationship needs to be legible as it crosses. */
export const RING = {
  /** Where load flows bundle before entering the forecast. Inside the halo,
      so a flow visibly passes THROUGH the outcome's body. */
  core: 88,
  /** The halo's centreline. Thickness is added either side of this. */
  halo: 248,
  /** Maximum half-thickness at the densest bin. Kept well under the radius
      so the object reads as a halo rather than a lobe. */
  haloMax: 33,
  /** The clamp band: where an unresolved decision crosses everything. */
  gate: 344,
  /** The capability band. */
  cap: 404,
  /** The capacity supply rail, outside all of the work it feeds. */
  rail: 476,
} as const;

/** The day axis. Starts lower-left, rises over the top, ends lower-right —
    so time reads left to right where the eye actually travels. The 120° at
    the bottom is the opening, and it is left empty. */
export const ARC = { startDeg: 150, sweepDeg: 240 } as const;

/** Where the work lives. Centred on the top of the frame, comfortably
    inside the arc's own span so no capability sits past the end of time. */
export const SECTOR = { startDeg: 208, endDeg: 332 } as const;

export const SECTOR_MID = (SECTOR.startDeg + SECTOR.endDeg) / 2;

export interface Pt {
  x: number;
  y: number;
}

export const polar = (r: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return { x: FRAME.cx + Math.cos(a) * r, y: FRAME.cy + Math.sin(a) * r };
};

/** Day → angle on the halo. The ONLY place a day becomes an angle. */
export const dayToAngle = (day: number, minDay: number, maxDay: number): number =>
  ARC.startDeg + ARC.sweepDeg * clamp01((day - minDay) / (maxDay - minDay || 1));

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** An arc along a constant radius. `sweep` follows increasing angle. */
export function arcPath(r: number, a0: number, a1: number): string {
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const dir = a1 >= a0 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} ${dir} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Evenly across a span, for things that belong to the sector itself rather
    than to a set of objects — a clamp's teeth, the strands coming off a
    supply rail. Distinct from `seats` on purpose. */
export function across(n: number, fromDeg: number = SECTOR.startDeg, toDeg: number = SECTOR.endDeg): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(fromDeg + toDeg) / 2];
  return Array.from({ length: n }, (_, i) => fromDeg + ((toDeg - fromDeg) * i) / (n - 1));
}

/** Seats for n objects in the work sector. One object sits at the sector's
    midline rather than at an end, so a single capability does not read as
    "the first of several". */
export function seats(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [SECTOR_MID];
  // THE SPREAD GROWS WITH THE COUNT. Two objects pushed to the shoulders of
  // a full sector read as two poles with a void between them, and their
  // flows sweep across the field like a wire rather than converging. Two
  // objects sit close together; five fill the sector. The pitch between
  // seats stays roughly constant, which is what makes a busy project look
  // busy and a small one look small.
  const full = SECTOR.endDeg - SECTOR.startDeg - 16;
  const span = Math.min(full, 26 * (n - 1));
  const a0 = SECTOR_MID - span / 2;
  return Array.from({ length: n }, (_, i) => a0 + (span * i) / (n - 1));
}

// ── THE HALO ───────────────────────────────────────────────────────────
//
// A closed ribbon whose half-thickness at each bin is that bin's real trial
// density, mirrored about the halo's centreline exactly as the Living
// Forecast mirrors about its horizontal centreline. Same function, same
// kernel, same refusal to smooth further.

export interface HaloShape {
  /** The filled ribbon. */
  path: string;
  /** Angles of the first and last bin carrying real mass. */
  a0: number;
  a1: number;
  /** Per-bin half-thickness, for shells and for the ghost. */
  half: number[];
  peak: number;
}

/**
 * @param days  a quantile-sampled trial vector (equal probability mass per
 *              element), so binning reproduces the true histogram.
 * @param tau   isosurface threshold. 0 is the full form; a higher value is
 *              the region where density exceeds that fraction of the peak —
 *              the same density, not new geometry.
 */
export function haloShape(
  days: number[],
  minDay: number,
  maxDay: number,
  amp: number,
  tau = 0
): HaloShape | null {
  const d = density(days, minDay, maxDay);
  const peak = Math.max(...d, 1);
  const [lo, hi] = liveRange(d);
  const half = d.map((v) => (Math.max(0, v / peak - tau) / (1 - tau)) * amp);

  // Bin centre → angle. The halo's angular extent is the trials' own extent,
  // so the object starts and ends where the data does.
  const angleOf = (i: number) => ARC.startDeg + ARC.sweepDeg * ((i + 0.5) / BINS);

  let first = -1;
  let last = -1;
  for (let i = lo; i <= hi; i++) {
    if (half[i] > amp * 0.004) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;

  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = first; i <= last; i++) {
    const a = angleOf(i);
    const o = polar(RING.halo + half[i], a);
    outer.push(`${o.x.toFixed(2)} ${o.y.toFixed(2)}`);
  }
  for (let i = last; i >= first; i--) {
    const a = angleOf(i);
    const n = polar(RING.halo - half[i], a);
    inner.push(`${n.x.toFixed(2)} ${n.y.toFixed(2)}`);
  }
  return {
    path: `M ${outer.join(" L ")} L ${inner.join(" L ")} Z`,
    a0: angleOf(first),
    a1: angleOf(last),
    half,
    peak,
  };
}

// ── FLOWS ──────────────────────────────────────────────────────────────
//
// Not spokes. A spoke says "this points at the centre"; a flow says "this
// is going there, with everything else". Each one leaves its object
// radially, then bends onto the sector's midline so the whole set bundles
// into one trunk before reaching the forecast — which is also what gives an
// unresolved decision something honest to clamp: the trunk is the scope.

/** Where load flows end: the forecast's own inner edge. They are absorbed
    into the outcome rather than meeting at a point in its hollow — a shared
    vertex would read as a wireframe cone, and would also invite the reading
    that each capability arrives somewhere specific. It does not. */
export const FLOW_END = RING.halo - RING.haloMax;

export function flowPath(fromR: number, fromA: number, toR: number = FLOW_END): string {
  const p0 = polar(fromR, fromA);
  // Leaves along its own radius, so the object it belongs to is unambiguous.
  const c1 = polar(fromR - (fromR - toR) * 0.42, fromA);
  // Arrives along the trunk, so the set converges instead of radiating.
  const c2 = polar(toR + (fromR - toR) * 0.3, SECTOR_MID);
  const p1 = polar(toR, SECTOR_MID);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Where a flow from `fromA` crosses the gate band — the point a clamp acts
    on. Sampled off the same Bézier so the clamp sits ON the line rather
    than near it. */
export function flowAtRadius(fromR: number, fromA: number, atR: number, toR: number = FLOW_END): Pt {
  const p0 = polar(fromR, fromA);
  const c1 = polar(fromR - (fromR - toR) * 0.42, fromA);
  const c2 = polar(toR + (fromR - toR) * 0.3, SECTOR_MID);
  const p1 = polar(toR, SECTOR_MID);
  let best = p0;
  let bestErr = Infinity;
  for (let s = 0; s <= 60; s++) {
    const t = s / 60;
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x;
    const y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y;
    const r = Math.hypot(x - FRAME.cx, y - FRAME.cy);
    const err = Math.abs(r - atR);
    if (err < bestErr) {
      bestErr = err;
      best = { x, y };
    }
  }
  return best;
}

/** Node radius from real load days. AREA is proportional to load, so two
    capabilities of half the size really do add up to the big one — the
    reading a viewer makes from a circle. Size means load and nothing else;
    where load is unknown every node is the base size. */
export function capabilityRadius(loadDays: number, maxLoadDays: number): number {
  const BASE = 15;
  const MAX = 30;
  if (!(maxLoadDays > 0) || !(loadDays > 0)) return BASE;
  return BASE + (MAX - BASE) * Math.sqrt(Math.min(1, loadDays / maxLoadDays));
}
