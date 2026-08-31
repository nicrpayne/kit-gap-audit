// CANVAS HIT TESTING.
//
// A canvas has no elements, so nothing answers a click for it. That is the
// one thing the DOM gives the SVG renderer for free, and it has to be paid
// for here — properly, because a field of 427 marks is exactly where naive
// hit testing shows up as "I clicked it and nothing happened".
//
// ── THE THREE RULES ────────────────────────────────────────────────────
//
// 1. THE TARGET IS THE PAINTER'S OWN FOOTPRINT, NOT THE MODEL RADIUS.
//    A hovered node is drawn 15% larger and a selected one 35% larger. If
//    the hit radius stayed at `r`, a selected node would have a visible rim
//    that is not clickable — the exact "selected object becomes unclickable
//    beneath its own glow" failure. So the same `grown` the painter computes
//    is what the index stores.
//
// 2. A 4px DOT IS NOT A CLICK TARGET. The SVG renderer already says this and
//    draws an invisible circle of `max(grown + 5/k, 11/k)` under every node.
//    Same floor here, in screen pixels, so the affordance does not shrink
//    with the camera.
//
// 3. NEAREST CENTRE WINS, NOT LAST PAINTED. Overlapping targets are common
//    in a packed constellation, and "whichever the loop reached last" makes
//    the pointer flicker between two neighbours as it moves a pixel. Ranking
//    by distance from the mark's own centre is stable: the answer only
//    changes when the pointer actually crosses the midpoint between them.
//
// ── AND IT IS BUCKETED ─────────────────────────────────────────────────
//
// A linear scan of 427 nodes per pointermove is 427 distance computations at
// pointer frequency. A uniform grid over world space turns that into the
// handful of nodes in the neighbouring cells. Rebuilt when the scene's
// geometry changes, not per frame.

import type { AuditScene, AuditVisualNode } from "@/lib/audit/visualScene";

/** The smallest a target may be, in CSS pixels, whatever the camera does. */
export const MIN_TARGET_PX = 11;
/** Slack around the drawn footprint, in CSS pixels. */
export const TARGET_SLACK_PX = 5;

export interface HitCandidate {
  id: string;
  x: number;
  y: number;
  /** Hit radius in WORLD units at the camera scale it was built for. */
  radius: number;
  /** Painted footprint, for the report. */
  drawn: number;
}

/**
 * THE HIT RADIUS OF ONE NODE.
 *
 * Exported because the proof asserts it against the painter's own `grown`,
 * and because the accessibility mirror needs the same number to size the
 * focusable region it exposes.
 */
export function hitRadiusOf(n: AuditVisualNode, k: number): { radius: number; drawn: number } {
  if (n.identity === "latent") {
    // A latent mark is not a pointer target — the SVG gives it no pointer
    // events — UNLESS it is reachable, which is superseded history that a
    // temporal arrow points at and the reader is invited to follow.
    const drawn = n.latentR;
    return n.reachable
      ? { radius: Math.max(drawn + TARGET_SLACK_PX / k, MIN_TARGET_PX / k), drawn }
      : { radius: 0, drawn };
  }
  const grown = n.selected ? n.r * 1.35 : n.hovered ? n.r * 1.15 : n.r;
  return { radius: Math.max(grown + TARGET_SLACK_PX / k, MIN_TARGET_PX / k), drawn: grown };
}

/**
 * A uniform grid over world space.
 *
 * Cell size is derived from the largest target so a query never has to look
 * further than one ring of neighbours.
 */
export class HitIndex {
  private cells = new Map<string, HitCandidate[]>();
  private cell = 64;
  private maxRadius = 0;
  private built = 0;

  get size(): number {
    return this.built;
  }

  /**
   * Rebuild from LIVE positions.
   *
   * The spatial field moves nodes every frame, so the index can no longer be
   * built from the scene's own coordinates — those are the resting seats the
   * adapter projected, not where the thing is. Rubric's own `hitTest` reads
   * `n.x/n.y` straight off the simulation for exactly this reason
   * (`_core.js` lines 918-929).
   */
  buildFrom(scene: AuditScene, positions: ReadonlyMap<string, { x: number; y: number }>, k: number): void {
    this.build(scene, k, positions);
  }

  /** Rebuild from the scene at a given camera scale. */
  build(scene: AuditScene, k: number, positions?: ReadonlyMap<string, { x: number; y: number }>): void {
    this.cells = new Map();
    this.maxRadius = 0;
    this.built = 0;

    const candidates: HitCandidate[] = [];
    for (const n of scene.nodes) {
      const { radius, drawn } = hitRadiusOf(n, k);
      if (radius <= 0) continue;
      // Something painted at effectively zero opacity is not on the field as
      // far as a reader is concerned, and must not swallow their click.
      if (n.opacity < 0.012) continue;
      const p = positions?.get(n.id);
      candidates.push({ id: n.id, x: p ? p.x : n.x, y: p ? p.y : n.y, radius, drawn });
      if (radius > this.maxRadius) this.maxRadius = radius;
    }

    // AGGREGATES ARE SELECTABLE, AND THEY ARE NOT NODES. A shell is a
    // projection of real members; the instrument opens a panel for it, so it
    // has to answer a pointer while it is on screen.
    for (const agg of scene.aggregates) {
      if (agg.opacity <= 0.01) continue;
      candidates.push({ id: agg.id, x: agg.x, y: agg.y, radius: agg.discR, drawn: agg.discR });
      if (agg.discR > this.maxRadius) this.maxRadius = agg.discR;
    }

    this.cell = Math.max(24, this.maxRadius * 2);
    for (const c of candidates) {
      const key = this.key(c.x, c.y);
      let bucket = this.cells.get(key);
      if (!bucket) this.cells.set(key, (bucket = []));
      bucket.push(c);
      this.built++;
    }
  }

  /**
   * What is under this world point, or null.
   *
   * NEAREST CENTRE WINS. A smaller mark sitting inside a larger one is still
   * reachable, because "inside its own radius and closer to its own centre"
   * beats "inside a bigger thing's radius and far from its centre" — which is
   * what keeps a member selectable inside its own constellation, and a source
   * hub selectable among its passages.
   */
  at(wx: number, wy: number): string | null {
    if (this.built === 0) return null;
    let best: string | null = null;
    let bestScore = Infinity;
    const cx = Math.floor(wx / this.cell);
    const cy = Math.floor(wy / this.cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = this.cells.get(`${ix}:${iy}`);
        if (!bucket) continue;
        for (const c of bucket) {
          const dx = wx - c.x;
          const dy = wy - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > c.radius * c.radius) continue;
          // Normalised by the target's own radius, so a small mark inside a
          // large shell wins on its own terms rather than on raw distance.
          const score = d2 / (c.radius * c.radius);
          if (score < bestScore) {
            bestScore = score;
            best = c.id;
          }
        }
      }
    }
    return best;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`;
  }
}
