// THE SIGNAL GRAPH'S VISUAL LANGUAGE.
//
// No new palette. Every value resolves to an `--i-*` token that already means
// this elsewhere in Signal, so the graph reads as a Signal instrument rather
// than as a differently-themed page.
//
// TWO CHANNELS, DELIBERATELY SEPARATE:
//
//   SHAPE says WHAT KIND of thing this is.
//   COLOUR says WHAT STATE it is in.
//
// Keeping them apart is what stops the field turning into a rainbow. A work
// item and a finding are different shapes whatever colour they happen to be;
// a conflicted dependency and a conflicted finding share a colour without
// being confusable. It is also the accessibility floor: kind survives without
// colour, and state is always also written in the inspector.

import type { NodeKind } from "@/lib/audit/graph";

export type NodeShape = "core" | "disc" | "diamond" | "hex" | "chip" | "pin" | "dot" | "doc";

/** Shape per kind. Never varies with state. */
export const NODE_SHAPE: Record<NodeKind, NodeShape> = {
  reality: "core",
  scope: "chip",
  lane: "disc",
  decision: "diamond",
  decisionGate: "diamond",
  dependency: "hex",
  finding: "pin",
  feature: "chip",
  work: "dot",
  intelligence: "disc",
  passage: "dot",
  source: "doc",
  checkpoint: "dot",
};

/**
 * Resting colour per kind, for nodes whose kind does NOT carry a state.
 *
 * Execution and provenance are deliberately muted: they are the substrate the
 * project is made of, not the thing Audit is pointing at. The eye should find
 * a critical finding before it finds a ticket.
 */
export const KIND_COLOR: Record<NodeKind, string> = {
  reality: "var(--i-signal)",
  scope: "var(--i-signal)",
  lane: "var(--i-text-soft)",
  decision: "var(--i-violet)",
  decisionGate: "var(--i-violet)",
  dependency: "var(--i-red)",
  finding: "var(--i-amber)",
  // Features are the one structural layer with an identity of its own, and
  // --i-cool already exists in the token set for exactly this register.
  feature: "var(--i-cool)",
  work: "var(--i-text-soft)",
  intelligence: "var(--i-violet)",
  passage: "var(--i-text-faint)",
  source: "var(--i-text-faint)",
  checkpoint: "var(--i-text-faint)",
};

export const STATE_COLOR: Record<string, string> = {
  verified: "var(--i-signal)",
  drift: "var(--i-amber)",
  conflict: "var(--i-red)",
  missing: "var(--i-reality)",
};

export const HUMAN_COLOR = "var(--i-violet)";
export const CONFIRMED_COLOR = "var(--i-mint)";

/** The colour a node is drawn in: state where the kind carries one, its kind
    colour otherwise. Human judgement outranks state on a finding, because
    "only a person can settle this" changes what you do next. */
export function nodeColor(attrs: Record<string, unknown>): string {
  const kind = attrs.kind as NodeKind;
  if (kind === "finding") {
    if (attrs.handled) return CONFIRMED_COLOR;
    if (attrs.needsHuman) return HUMAN_COLOR;
    return STATE_COLOR[attrs.state as string] ?? "var(--i-amber)";
  }
  if (kind === "lane" || kind === "dependency") {
    if (attrs.supplied === false) return "var(--i-reality)";
    return STATE_COLOR[attrs.state as string] ?? KIND_COLOR[kind];
  }
  if (kind === "work") {
    // Completed work recedes: it is no longer part of what remains.
    return attrs.stateType === "completed" || attrs.stateType === "canceled"
      ? "var(--i-text-faint)"
      : "var(--i-text-soft)";
  }
  return KIND_COLOR[kind] ?? "var(--i-text-soft)";
}

/**
 * THE THREE CONTRAST TIERS, as literal opacities.
 *
 * Same principle the Truth Map established: keep the information, reduce
 * simultaneous salience. These are the numbers that rule is made of.
 */
export const TIER = {
  /** Rings, sector guides, cluster gutters. */
  structure: 0.15,
  /** Ordinary nodes and attested edges at rest. */
  rest: 0.72,
  /** Inferred edges at rest — present, but clearly weaker evidence. */
  inferredRest: 0.26,
  /** Attested edges at rest. */
  attestedRest: 0.42,
  /** Selected node, its neighbourhood, its edges. */
  focus: 1,
  /** Everything unrelated once something is selected. */
  dimmed: 0.1,
  /** Unrelated during Evidence Solo — harder, but never invisible: losing
      orientation is worse than losing contrast. */
  soloDimmed: 0.06,
} as const;

/**
 * ZOOM THRESHOLDS — explicit, not "labels scale with k".
 *
 * The reference reveals detail in steps as the camera closes, which is what
 * makes a dense field readable at every distance. Scaling text continuously
 * would just produce unreadably small labels at far zoom instead of no
 * labels, which is worse.
 */
export const ZOOM = {
  /** Below this: project shape only. */
  far: 1.05,
  /** Below this: delivery structure. Above: source-level detail. */
  medium: 2.1,
} as const;

export type ZoomLevel = "far" | "medium" | "close";

export function zoomLevel(k: number): ZoomLevel {
  if (k < ZOOM.far) return "far";
  if (k < ZOOM.medium) return "medium";
  return "close";
}

/** Which kinds carry a visible label at each level. Reality and cluster
    pucks always label — they are the map's legend. */
const LABELLED_AT: Record<ZoomLevel, NodeKind[]> = {
  far: ["reality", "lane"],
  medium: ["reality", "lane", "dependency", "decision", "feature", "scope", "intelligence"],
  close: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "decisionGate",
    "feature",
    "scope",
    "intelligence",
    "work",
    "passage",
    "source",
    "finding",
    "checkpoint",
  ],
};

export function labelsFor(level: ZoomLevel): Set<NodeKind> {
  return new Set(LABELLED_AT[level]);
}

/**
 * Edges that are membership, not relationship.
 *
 * The prior tranche measured 74 of these. They say "this belongs to that
 * cluster", which the layout already says by POSITION — drawing them too is
 * how a graph becomes a hairball. Never rendered.
 */
export const MEMBERSHIP_RELS = new Set(["attests"]);

/** Human-readable relation names for the inspector's connection list. */
export const REL_LABEL: Record<string, string> = {
  supports: "supports",
  concerns: "concerns",
  missing_from: "missing from",
  evidenced_by: "evidenced by",
  extracted_from: "extracted from",
  linked_to: "linked to",
  depends_on: "depends on",
  blocks: "blocks",
  resolves: "resolves",
  implements: "implements",
  supersedes: "supersedes",
  attests: "belongs to",
};

export const KIND_LABEL: Record<NodeKind, string> = {
  reality: "Reality",
  scope: "Project",
  lane: "Cluster",
  checkpoint: "Checkpoint",
  finding: "Finding",
  work: "Work item",
  feature: "Feature",
  decision: "Decision",
  decisionGate: "Gate",
  dependency: "Dependency",
  intelligence: "Intelligence package",
  passage: "Evidence passage",
  source: "Source",
};
