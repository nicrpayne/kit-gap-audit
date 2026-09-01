// THE RUBRIC CAMERA — THE CANVAS VIEWPORT'S ONLY DIRECT-MANIPULATION CAMERA.
//
// ADAPTED FROM RUBRIC SECOND BRAIN — `public/_core.js`:
//   `w2s` / `s2w` / `flyCam` / `resetCam` / `flyToNode`  lines 811-816
//   wheel handler inside `initCanvas()`                  lines 819-830
//   fly advance inside `loop()`                          lines 934-940
//
// Original work: Copyright (c) 2026 Jay E | RoboNuggets
// (https://skool.com/robonuggets), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/legalcode).
// Reference copy: lab/rubric-reference/second-brain/public/_core.js
//
// ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────
//
// This is Rubric's camera, faithfully: an affine `{k, x, y}` where x/y are
// a SCREEN-SPACE translation rather than a world centre, a wheel that
// preserves the world point under the cursor, `.1-8` bounds, and a fly that
// eases x, y and k independently with ease-out cubic.
//
// ── THE THREE PLACES IT IS NOT FAITHFUL, AND WHY ───────────────────────
//
// 1. FRAME COUNTS BECOME MILLISECONDS. Rubric's fly runs `S.fly.t++` once per
//    `requestAnimationFrame` over a duration of ~50 FRAMES, so the same move
//    takes 833ms on a 60Hz display and 417ms on a 120Hz one. That is not a
//    style difference, it is a bug the reference happens to contain,
//    and shipping it would make Signal's motion depend on the reader's
//    monitor. Duration is converted at 60fps and driven by elapsed time.
//
// 2. REDUCED MOTION IS HONOURED. Rubric has no such path. Protected law 14.
//
// 3. THE FLY SNAPSHOTS THE REACHED POSITION, which Rubric already does
//    (line 813) — kept, because it is the good part: a new fly retargets from
//    wherever the camera actually got to rather than restarting.
//
// Everything else — the exponential wheel constant, the zoom bounds, the
// cursor-anchored zoom, ease-out cubic on each axis independently, the
// absence of geometric scale interpolation — is Rubric's feel, not a
// paraphrase of it.

import { FIELD } from "@/lib/audit/graphLayout";
import type { Camera } from "./cameraMotion";

/** Rubric: `Math.max(.1, Math.min(8, …))` — _core.js line 823. */
export const RUBRIC_MIN_ZOOM = 0.1;
export const RUBRIC_MAX_ZOOM = 8;

/** Rubric: `Math.exp(-e.deltaY * .0014)` — line 823. Signal's own is .0016,
    so Rubric's wheel is ~12% less sensitive per notch. */
export const RUBRIC_WHEEL = 0.0014;

/** Rubric flies for 50 frames (`flyCam` default) and resets over 55. At 60fps
    that is 833ms and 917ms — roughly 2.6× Signal's 320ms. */
export const RUBRIC_FLY_MS = (50 / 60) * 1000;
export const RUBRIC_RESET_MS = (55 / 60) * 1000;

/** Rubric's `flyToNode` raises zoom to at least 1.6 — line 815. */
export const RUBRIC_FOCUS_K = 1.6;

export interface RubricTransform {
  k: number;
  /** SCREEN-space translation, in CSS pixels. Not a world centre. */
  x: number;
  y: number;
}

/** `w2s` — line 811. */
export function w2s(p: { x: number; y: number }, t: RubricTransform): { x: number; y: number } {
  return { x: p.x * t.k + t.x, y: p.y * t.k + t.y };
}

/** `s2w` — line 812. */
export function s2w(p: { x: number; y: number }, t: RubricTransform): { x: number; y: number } {
  return { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k };
}

/**
 * SIGNAL'S CAMERA IS A WORLD CENTRE; RUBRIC'S IS A SCREEN OFFSET.
 *
 * They describe the same view. These conversions let Signal's product-level
 * controls and scene builder mirror the Rubric transform without becoming a
 * second gesture camera.
 */
export function toSignal(t: RubricTransform, vp: { w: number; h: number }): Camera {
  return { k: t.k, x: (vp.w / 2 - t.x) / t.k, y: (vp.h / 2 - t.y) / t.k };
}

export function fromSignal(c: Camera, vp: { w: number; h: number }): RubricTransform {
  return { k: c.k, x: vp.w / 2 - c.x * c.k, y: vp.h / 2 - c.y * c.k };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The Rubric camera, driven by a clock.
 *
 * `advance` is called once per frame with the elapsed milliseconds and
 * returns whether it is still moving, so the render loop can stop when the
 * camera has arrived.
 */
export class RubricCamera {
  private t: RubricTransform;
  private fly: { from: RubricTransform; to: RubricTransform; ms: number; el: number } | null = null;
  private reduced = false;

  constructor(initial: RubricTransform) {
    this.t = { ...initial };
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  get transform(): RubricTransform {
    return this.t;
  }

  get flying(): boolean {
    return this.fly != null;
  }

  /** A direct write. Rubric's wheel and pan both set `S.fly = null` first —
      the hand outranks the animation, which is also Signal's protected law 13. */
  set(t: RubricTransform): void {
    this.fly = null;
    this.t = { ...t };
  }

  /** `wheel` — lines 821-828. Zooms about the cursor, in screen pixels. */
  wheel(deltaY: number, screen: { x: number; y: number }): void {
    this.fly = null;
    const w = s2w(screen, this.t);
    this.t.k = Math.max(
      RUBRIC_MIN_ZOOM,
      Math.min(RUBRIC_MAX_ZOOM, this.t.k * Math.exp(-deltaY * RUBRIC_WHEEL))
    );
    const s = w2s(w, this.t);
    this.t.x += screen.x - s.x;
    this.t.y += screen.y - s.y;
  }

  /** Direct screen-delta pan — Rubric's pointer handler. */
  pan(dx: number, dy: number): void {
    this.fly = null;
    this.t.x += dx;
    this.t.y += dy;
  }

  /** `flyCam` — line 813. Snapshots where the camera has REACHED. */
  flyTo(to: RubricTransform, ms = RUBRIC_FLY_MS): void {
    if (this.reduced) {
      this.t = { ...to };
      this.fly = null;
      return;
    }
    this.fly = { from: { ...this.t }, to: { ...to }, ms, el: 0 };
  }

  /** `resetCam` — line 814. Rubric fits a nominal 1500-unit world; Signal's
      record is `FIELD.size` across, so the constant becomes the real extent. */
  reset(vp: { w: number; h: number }, ms = RUBRIC_RESET_MS): void {
    const k = Math.min(vp.w, vp.h) / (FIELD.size * 1.05);
    this.flyTo({ k, x: vp.w / 2 - FIELD.cx * k, y: vp.h / 2 - FIELD.cy * k }, ms);
  }

  /** Rubric's reset-camera contract applied to the live visual world's
      measured radius instead of its original fixed 1500-unit filesystem.
      This is the only fit adaptation: affine camera, easing and timing stay
      the source implementation. */
  fitWorld(
    world: { x: number; y: number },
    radius: number,
    vp: { w: number; h: number },
    ms = RUBRIC_RESET_MS
  ): void {
    const room = Math.max(160, Math.min(vp.w - 96, vp.h - 96));
    const k = Math.max(RUBRIC_MIN_ZOOM, Math.min(RUBRIC_MAX_ZOOM, room / Math.max(1, radius * 2)));
    const target = { k, x: vp.w / 2 - world.x * k, y: vp.h / 2 - world.y * k };
    if (ms <= 0) this.set(target);
    else this.flyTo(target, ms);
  }

  /** `flyToNode` — line 815. */
  flyToPoint(world: { x: number; y: number }, vp: { w: number; h: number }): void {
    const k = Math.max(RUBRIC_FOCUS_K, this.t.k);
    this.flyTo({ k, x: vp.w / 2 - world.x * k, y: vp.h / 2 - world.y * k });
  }

  cancel(): void {
    this.fly = null;
  }

  /** One frame. Rubric eases x, y and k INDEPENDENTLY with ease-out cubic and
      no geometric interpolation on scale — kept exactly. */
  advance(dt: number): boolean {
    const f = this.fly;
    if (!f) return false;
    f.el += dt;
    const p = Math.min(1, f.el / f.ms);
    const e = easeOutCubic(p);
    this.t = {
      k: f.from.k + (f.to.k - f.from.k) * e,
      x: f.from.x + (f.to.x - f.from.x) * e,
      y: f.from.y + (f.to.y - f.from.y) * e,
    };
    if (p >= 1) this.fly = null;
    return this.fly != null;
  }
}
