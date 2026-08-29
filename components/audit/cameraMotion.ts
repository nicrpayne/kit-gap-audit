// THE CAMERA, AND HOW IT MOVES.
//
// Pure. No React, no DOM — so the motion contract can be asserted by a proof
// rather than only observed in a browser.
//
// ── WHY THE CAMERA ANIMATES AT ALL ────────────────────────────────────
//
// Before this, every programmatic camera move was a single assignment: the
// world was in one place, and then it was somewhere else. Measured, that is
// one distinct camera position over the whole move. It reads as a page
// jump, and it costs the thing the graph is for — you lose where you were.
// A short eased move keeps the field continuous, so "the Linear cluster is
// down and to the right" survives being taken there.
//
// ── AND WHY IT MUST ALWAYS LOSE ───────────────────────────────────────
//
//   THE HAND OUTRANKS THE ANIMATION, ALWAYS.
//
// An instrument that makes you wait 300ms for a camera to finish before it
// will listen is worse than one that cuts. Every direct camera write — a
// wheel tick, a drag, a zoom button — cancels whatever is in flight, and
// every new fly-to retargets from wherever the camera has actually reached
// rather than restarting from the origin. There is no queue and no lock.
//
// NO SPRING, NO INERTIA, NO OVERSHOOT. easeOutCubic only: it starts at full
// speed and settles, never passes the target and comes back. A camera that
// bounces is a camera that lies about where it stopped.

import { FIELD } from "@/lib/audit/graphLayout";

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export const DEFAULT_CAMERA: Camera = { x: FIELD.cx, y: FIELD.cy, k: 0.72 };

// Past roughly 4.5x every kind already carries a label and there is no
// further detail to reveal — only a larger circle. Capping keeps "zoom in"
// meaning "see more" rather than "see the same thing bigger".
export const MAX_ZOOM = 4.5;
export const MIN_ZOOM = 0.34;

/**
 * How long a programmatic camera move takes.
 *
 * 320ms: long enough that the eye tracks the motion rather than being
 * teleported, short enough that a second command never feels queued behind
 * it. Below ~220ms the continuity stops registering; past ~450ms the
 * instrument starts feeling like it is deciding rather than responding.
 */
export const FLY_MS = 320;

/** Decelerating, and only decelerating. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/**
 * One frame of a camera move.
 *
 * POSITION INTERPOLATES LINEARLY; SCALE INTERPOLATES GEOMETRICALLY. Zoom is
 * multiplicative — 0.72 to 2.88 is two doublings, not "plus 2.16" — so a
 * linear ramp on `k` spends most of its time at the wide end and then rushes
 * the last half of the perceived travel. Interpolating the logarithm makes
 * each equal slice of the move an equal-feeling change of scale, which is
 * what stops a fly-to reading as a lurch.
 */
export function interpolateCamera(from: Camera, to: Camera, e: number): Camera {
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    k: from.k * Math.pow(to.k / from.k, e),
  };
}

/** Whether the two cameras are close enough that a move between them would
    not be visible. Used to skip a tween that has nothing to show. */
export function cameraSettled(a: Camera, b: Camera): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k - b.k) < 0.002;
}

/**
 * The camera scale the NODES are told about, quantised.
 *
 * Nodes compensate for zoom in screen space — a stroke is `1.4 / k` world
 * units so that it stays 1.4 pixels — which made the raw scale a prop on
 * every node and re-rendered all of them on every frame of every wheel
 * gesture. Measured: 133 attribute mutations in the node layer per wheel
 * tick, none of which changed anything a person could see.
 *
 * Rounding the scale to fixed geometric steps means a slow trackpad zoom
 * (2% or less per event) usually lands inside the step it is already in, and
 * React skips all 64 nodes. 32 steps per e-fold is a 3.2% granularity: a
 * 1.4px stroke varies by four hundredths of a pixel, and the 2.4px floor on
 * a latent mark by eight hundredths. The camera itself is never quantised —
 * pan, zoom and the viewBox stay exactly continuous. Only what the nodes are
 * TOLD is stepped.
 */
export const SCALE_STEPS_PER_EFOLD = 32;

export function quantizeScale(k: number): number {
  return Math.exp(Math.round(Math.log(k) * SCALE_STEPS_PER_EFOLD) / SCALE_STEPS_PER_EFOLD);
}

/** Honoured for every programmatic move. Someone who has asked their system
    for less motion has asked this instrument too. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── THE FRAMING LAW ────────────────────────────────────────────────────
//
// Before this, the camera's behaviour depended on HOW you had selected
// something. Clicking a node moved nothing. Clicking the same node in the
// search list flew to it and forced 230% zoom. Clicking it in an inspector
// relationship row did the same. Three routes to one act, three different
// worlds afterwards — and the 230% one is the worst, because it throws away
// the view you had built up in order to show you a node you could already
// see.
//
//   SELECTION SOURCE MUST NOT CHANGE CAMERA SEMANTICS.
//
// So there is now exactly one function that decides, and its default answer
// is NO. It moves the camera only to make the selected object and its useful
// neighbourhood legible, and it moves it the least it can:
//
//   1. Neighbourhood already comfortably in view  →  do not move. At all.
//   2. Anchor in view, some neighbours outside    →  the smallest pan that
//                                                    brings them in.
//   3. Anchor itself outside the viewport         →  centre the neighbourhood.
//
// AND IT NEVER ZOOMS IN. Not once, not for any caller. Zooming in is a thing
// the hand does; the framing law may only zoom OUT, and only when the
// neighbourhood genuinely does not fit. That single rule is what makes
// spatial memory survive a walk across the graph: the scale you chose is
// still the scale you are at.

export interface Viewport {
  w: number;
  h: number;
}

export interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * How much of the viewport is kept clear at the edges.
 *
 * A node sitting one pixel inside the frame is technically visible and
 * practically not: its label runs off, and it reads as something the view is
 * cutting off rather than something the view contains. 11% a side leaves room
 * for the label and for the eye to accept the thing as framed.
 */
export const FRAME_MARGIN = 0.11;

/**
 * And how far outside that a thing may sit before the camera reacts.
 *
 * TWO NUMBERS, DELIBERATELY, AND THE TRIGGER IS THE SMALLER ONE. If the test
 * for "does this need framing" used the same inset as the destination, then
 * every result would land exactly on the trigger boundary and the next
 * selection a pixel further out would move again — and, worse, `Fit` itself
 * puts the field at ~96% of the view, so an 11% inset would make EVERY
 * selection at Fit a camera move. That is the opposite of the law.
 *
 * So the camera holds until something is nearly at the edge (2%), and when it
 * does move it brings it comfortably in (11%). Hysteresis, in the same shape
 * as the zoom-level tier: react late, resolve properly.
 */
export const FRAME_SLACK = 0.02;

/** The world rectangle a camera is showing. */
export function worldViewport(camera: Camera, vp: Viewport): Extent {
  const w = vp.w / camera.k;
  const h = vp.h / camera.k;
  return { x0: camera.x - w / 2, y0: camera.y - h / 2, x1: camera.x + w / 2, y1: camera.y + h / 2 };
}

/** The world rectangle a set of points occupies, or null for no points. */
export function boundsOf(points: { x: number; y: number }[]): Extent | null {
  if (points.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function inset(e: Extent, fx: number, fy: number): Extent {
  return { x0: e.x0 + fx, y0: e.y0 + fy, x1: e.x1 - fx, y1: e.y1 - fy };
}

export function contains(outer: Extent, inner: Extent): boolean {
  return inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;
}

export function containsPoint(outer: Extent, p: { x: number; y: number }): boolean {
  return p.x >= outer.x0 && p.x <= outer.x1 && p.y >= outer.y0 && p.y <= outer.y1;
}

/**
 * Where the camera should go so that `bounds` is legible — or null, meaning
 * STAY EXACTLY WHERE YOU ARE.
 *
 * `anchor` is the selected object itself; it is what decides between a small
 * pan and a re-centre, because a neighbour off the left edge is a nudge and a
 * selection off the left edge is a journey.
 */
export function frameFocus(
  bounds: Extent,
  anchor: { x: number; y: number },
  camera: Camera,
  vp: Viewport
): Camera | null {
  if (vp.w <= 0 || vp.h <= 0) return null;
  const view = worldViewport(camera, vp);
  const mx = (vp.w * FRAME_MARGIN) / camera.k;
  const my = (vp.h * FRAME_MARGIN) / camera.k;
  const comfortable = inset(view, mx, my);
  const trigger = inset(view, (vp.w * FRAME_SLACK) / camera.k, (vp.h * FRAME_SLACK) / camera.k);

  // 1. ALREADY THERE. The most common answer, and the one the instrument was
  //    missing: at Fit the whole field is on screen, so selecting anything —
  //    by click, by search, by inspector row — moves nothing.
  if (contains(trigger, bounds)) return null;

  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;
  const tw = trigger.x1 - trigger.x0;
  const th = trigger.y1 - trigger.y0;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;

  // 3'. Too big to fit at this scale: pull back, but only as far as it takes,
  //     and never past the floor. This is the ONLY branch that changes `k`.
  // Judged against the TRIGGER, not the destination: a neighbourhood that
  // fits the view but not the comfortable inset should be panned into place,
  // not zoomed away from.
  if (bw > tw || bh > th) {
    const fit = Math.min(vp.w / Math.max(bw, 1e-6), vp.h / Math.max(bh, 1e-6)) * (1 - 2 * FRAME_MARGIN);
    const k = Math.max(MIN_ZOOM, Math.min(camera.k, fit));
    // THE SELECTION WINS. Zoom has a floor, so a neighbourhood spread across
    // most of the field can still be wider than any view this camera is
    // allowed to take — and centring the BOX then puts the thing you clicked
    // outside the frame. Framing the neighbourhood is best-effort; showing
    // what was selected is not.
    const centred = { x: cx, y: cy, k };
    return containsPoint(worldViewport(centred, vp), anchor) ? centred : { x: anchor.x, y: anchor.y, k };
  }

  // 3. The selection itself is off screen — a re-centre, because a minimum
  //    pan would leave the thing you just chose against the frame edge.
  if (!containsPoint(view, anchor)) return { x: cx, y: cy, k: camera.k };

  // 2. MINIMUM PAN. Shift by exactly the overhang, no more: the field keeps
  //    almost all of the arrangement the reader had already learned.
  let dx = 0;
  let dy = 0;
  if (bounds.x0 < comfortable.x0) dx = bounds.x0 - comfortable.x0;
  else if (bounds.x1 > comfortable.x1) dx = bounds.x1 - comfortable.x1;
  if (bounds.y0 < comfortable.y0) dy = bounds.y0 - comfortable.y0;
  else if (bounds.y1 > comfortable.y1) dy = bounds.y1 - comfortable.y1;

  // AND IT MAY NEVER PAN PAST THE THING THAT WAS SELECTED.
  //
  // A neighbourhood can be taller than the comfortable band while still
  // fitting the view — the two insets differ, which is what stops Fit from
  // twitching. Chasing the far edge of such a box then walks the camera right
  // off the anchor: measured, one real passage whose citations run 287 units
  // down the field ended up 10 units above the top of the frame, with its
  // own inspector open. Clamping the shift to the span that keeps the anchor
  // comfortably framed brings in as much of the neighbourhood as can be had
  // without ever losing the selection.
  dx = clamp(dx, anchor.x - comfortable.x1, anchor.x - comfortable.x0);
  dy = clamp(dy, anchor.y - comfortable.y1, anchor.y - comfortable.y0);

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  return { x: camera.x + dx, y: camera.y + dy, k: camera.k };
}
