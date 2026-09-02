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
