// WHERE A SIGNAL OBJECT BELONGS, AND WHY.
//
// Rubric's spatial engine is driven by ANCHORS — one per department, with
// every file pulled toward its own department's hub and almost nothing else
// deciding seats (`_core.js`, `buildSim()` deptPull, lines 711-732). That
// mechanism is what makes a Rubric field read as coherent cells rather than
// as a hairball, and it is reusable.
//
// What is NOT reusable is Rubric's notion of what a department IS. This file
// is Signal's answer: the anchor policy, stated once, in Signal's own terms.
//
// ── THE LAW THIS FILE EXISTS TO HOLD ───────────────────────────────────
//
// Protected law 12: RELATIONSHIP DOES NOT AUTOMATICALLY MEAN SPATIAL
// NEIGHBOURHOOD. A cross-lane evidence citation lights an edge; it must never
// move either endpoint toward the other. That is enforced by giving every
// node exactly ONE anchor, derived from its own semantics, and by leaving
// generic relationship springs at zero — which is also Rubric's own shipped
// default (`index.html` skin `g_link: 0`).
//
// Protected law 11: ABSENT DATA REMAINS ABSENT. An anchor is never invented
// to make a layout look complete; a node with no lane belongs to the
// project's own model, which is a real place, not a fallback.

import type { NodeKind } from "../graph";
import { CLUSTER_ORDER, FIELD } from "../graphLayout";

/**
 * The anchor keys, in a fixed order.
 *
 * `core` is Signal's own model — Reality, the Scope, and the requirements it
 * asserts. It is not a lane and never becomes one: nothing in a source system
 * produced it.
 */
export const CORE_ANCHOR = "core";

export const ANCHOR_ORDER: string[] = [CORE_ANCHOR, ...CLUSTER_ORDER];

export interface AnchorPolicy {
  key: string;
  /** What a person would call it. */
  label: string;
  /** Angle on the field, radians. `core` sits at the centre and has none. */
  angle: number | null;
  /** Resting radius of the anchor itself, world units. */
  radius: number;
}

const RAD = Math.PI / 180;

/**
 * One anchor per lane, seated on the lane's own sector axis, plus the core.
 *
 * The angles are Signal's existing sector angles — the same ones
 * `graphLayout.sectorAngle` uses — so a field that morphs between layouts
 * keeps every cluster on the bearing the reader already learned. That
 * continuity is worth more than any spatial improvement a re-bearing could
 * buy.
 */
export function anchorPolicies(): AnchorPolicy[] {
  const out: AnchorPolicy[] = [
    { key: CORE_ANCHOR, label: "Model", angle: null, radius: 0 },
  ];
  CLUSTER_ORDER.forEach((c, i) => {
    out.push({
      key: c,
      label: c,
      angle: (-90 + i * (360 / CLUSTER_ORDER.length)) * RAD,
      radius: FIELD.clusterR,
    });
  });
  return out;
}

/** The anchor a node belongs to. Exactly one, always, derived from Signal. */
export function anchorOf(kind: NodeKind, lane: string | null | undefined): string {
  if (kind === "reality" || kind === "scope" || kind === "requirement") return CORE_ANCHOR;
  if (typeof lane === "string" && lane && (CLUSTER_ORDER as readonly string[]).includes(lane)) return lane;
  // A node with no lane is part of the project's own model by construction —
  // see graph.ts, where `lane` is absent exactly for Reality, the Scope and
  // requirements. Anything else arriving here is new and belongs at the
  // centre until someone gives it a home, which is the honest default.
  return CORE_ANCHOR;
}

// ── RINGS: THE RADIAL BAND POLICY ──────────────────────────────────────
//
// SIGNAL'S SEMANTIC LAW SURVIVES THIS PASS UNCHANGED: distance from Reality
// is distance from agreement. Rubric supplies the sector arithmetic and the
// motion; it supplies no meaning, and the brief is explicit that we must not
// claim a positional semantic the layout does not encode.
//
// These radii are the ones Signal's own layout already uses (graphLayout.ts
// FIELD), so a Finding at `conflict` sits exactly where the shipped renderer
// puts it. What Rubric adds is how MANY of them fit on a ring and how the
// sector is shared out — not where the ring is.

export type Band =
  | "core"
  | "model"
  | "aligned"
  | "drift"
  | "conflict"
  | "cluster"
  | "structure"
  | "evidence"
  | "external";

export interface BandPolicy {
  id: Band;
  /** Base radius, world units. */
  r: number;
  /** What this distance MEANS. Printed in the legend; never decorative. */
  meaning: string;
  /** Rows step outward by this much when a band overflows. */
  rowStep: number;
}

export const BANDS: Record<Band, BandPolicy> = {
  core: { id: "core", r: 0, meaning: "Reality — what Signal accepts", rowStep: 0 },
  model: { id: "model", r: FIELD.modelR, meaning: "the project's own model", rowStep: 22 },
  aligned: { id: "aligned", r: FIELD.alignedR, meaning: "agrees with Reality", rowStep: 20 },
  drift: { id: "drift", r: FIELD.driftR, meaning: "drifting from Reality", rowStep: 20 },
  conflict: { id: "conflict", r: FIELD.conflictR, meaning: "contradicts Reality", rowStep: 20 },
  cluster: { id: "cluster", r: FIELD.clusterR, meaning: "where a source system sits", rowStep: 0 },
  structure: { id: "structure", r: FIELD.childR, meaning: "execution and structure", rowStep: 24 },
  evidence: { id: "evidence", r: FIELD.sourceInner, meaning: "what Signal read", rowStep: 22 },
  external: { id: "external", r: FIELD.intelR, meaning: "claims from outside Signal", rowStep: 26 },
};

/**
 * The band an object sits in.
 *
 * A FINDING'S BAND IS ITS SEVERITY, exactly as the shipped layout has it —
 * categorical, because there is no continuous "distance from truth" in the
 * model and inventing one would be fake precision.
 */
export function bandOf(kind: NodeKind, attrs: Record<string, unknown>): Band {
  switch (kind) {
    case "reality":
      return "core";
    case "scope":
    case "requirement":
      return "model";
    case "lane":
      return "cluster";
    case "finding": {
      const tier = String(attrs.tier ?? "");
      if (tier === "critical" || tier === "high") return "conflict";
      if (tier === "medium") return "drift";
      return "aligned";
    }
    case "dependency":
    case "decision":
    case "decisionGate": {
      const state = String(attrs.state ?? "");
      if (state === "conflict") return "conflict";
      if (state === "drift") return "drift";
      return "aligned";
    }
    case "intel":
      return "external";
    case "passage":
    case "source":
    case "transcript":
    case "notion_page":
    case "figma_artifact":
    case "intelligence":
      return "evidence";
    default:
      // feature, work, person, checkpoint — the substrate the project is made
      // of. It is structure, not a position on the disagreement axis.
      return "structure";
  }
}
