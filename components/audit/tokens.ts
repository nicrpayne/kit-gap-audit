// AUDIT'S READING OF THE INSTRUMENT PALETTE.
//
// No new colours. Every value here resolves to a token that already exists
// in `.instrument` (app/globals.css) and already means this elsewhere in
// Signal — which is why Audit reads as a sibling of Forecast and Timeline
// rather than as a differently-themed page.
//
//   verified -> --i-signal   the same cyan Timeline uses for a seated fact
//   drift    -> --i-amber    the same amber that means "uncertainty" everywhere
//   conflict -> --i-red      the same red as blocking risk / over-allocation
//   missing  -> --i-reality  the muted grey Reality wears when it is a ghost
//   human    -> --i-violet   the same violet as a hypothetical / unsaved state
//
// docs/DESIGN-NORTH-STAR.md's rule is "colour means state, not category", and
// that is exactly the split Audit keeps: a LANE never takes a colour from its
// own identity (Linear is not blue, Figma is not purple), only from the state
// of what it is currently carrying.

import type { TruthState } from "@/lib/audit/truth";

export const STATE_COLOR: Record<TruthState, string> = {
  verified: "var(--i-signal)",
  drift: "var(--i-amber)",
  conflict: "var(--i-red)",
  missing: "var(--i-reality)",
};

export const STATE_SOFT: Record<TruthState, string> = {
  verified: "var(--i-signal-soft)",
  drift: "var(--i-amber-soft)",
  conflict: "var(--i-red-soft)",
  missing: "rgba(107, 114, 120, 0.16)",
};

export const HUMAN_COLOR = "var(--i-violet)";
export const HUMAN_SOFT = "var(--i-violet-soft)";
export const CONFIRMED_COLOR = "var(--i-mint)";

/** The colour a Finding is drawn in. Human judgement wins over the state
    colour, because "only a person can settle this" is the more actionable
    fact — it changes what you do next, where the state only says how bad it
    is. Severity is carried by the tier label and by radius, never by hue. */
export function findingColor(f: { state: TruthState; needsHuman: boolean }): string {
  return f.needsHuman ? HUMAN_COLOR : STATE_COLOR[f.state];
}

export function findingSoft(f: { state: TruthState; needsHuman: boolean }): string {
  return f.needsHuman ? HUMAN_SOFT : STATE_SOFT[f.state];
}

/** THE THREE CONTRAST TIERS, as literal opacities.
 *
 * The instrument keeps all of its information at every moment and varies
 * only how loudly each layer speaks — "keep the information, reduce
 * simultaneous salience". These are the numbers that rule is made of. */
export const TIER = {
  /** Rings, spokes, gutter rules, band labels. */
  structure: 0.17,
  /** Lanes, ordinary junctions, unselected findings. */
  signal: 0.38,
  /** A lane carrying something that is not verified — still Tier 2, but the
      top of it, so a conflict is findable at rest without shouting. */
  signalWarn: 0.55,
  /** Selected finding, its provenance route, its lane. */
  attention: 1,
  /** What everything unrelated drops to once something is selected. */
  dimmed: 0.13,
} as const;

export const TIER_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
