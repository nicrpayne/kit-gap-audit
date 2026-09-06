// WHAT THE DECISION CIRCUIT READS. Types mirror the Prisma rows as they
// arrive over /api/decisions, plus the handful of derivations the surface
// is allowed to make.
//
// The only derivation that matters is forecastActive(). It is a function of
// the GATE, never of the decision's importance, owner, severity or age --
// which is the product law expressed as code rather than as a comment.

export interface DecisionOption {
  id: string;
  label: string;
  note?: string;
}

export interface DecisionGateRow {
  id: string;
  decisionId: string;
  targetScopeId: string;
  dependency: string;
  evidenceForGate: string;
  low: number;
  likely: number;
  high: number;
  serial: boolean;
  provenance: string;
  /** Canonical display identity resolved from DecisionGate.targetScopeId.
      Never substitute the Decision's home Scope or current URL project. */
  targetScope: { id: string; name: string; targetDate: string | null };
}

export function gateTarget(d: DecisionRow): DecisionGateRow["targetScope"] | null {
  return d.gate?.targetScope ?? null;
}

export interface DecisionEvidenceRow {
  id: string;
  kind: string;
  excerpt: string;
  contextSnapshotId: string | null;
  evidenceItemId: string | null;
  externalRef: string | null;
  sourceLabel: string | null;
}

export type DecisionStatus = "open" | "decided" | "dismissed";

export interface DecisionRow {
  id: string;
  scopeId: string;
  title: string;
  status: DecisionStatus;
  owner: string | null;
  rationale: string | null;
  neededBy: string | null;
  options: DecisionOption[];
  chosenOption: string | null;
  resolution: string | null;
  decidedAt: string | null;
  dismissReason: string | null;
  relatedIssues: string[];
  sourceFindingId: string | null;
  sourceClaimKey: string | null;
  createdAt: string;
  gate: DecisionGateRow | null;
  evidence: DecisionEvidenceRow[];
  scope: { id: string; name: string; targetDate: string | null };
}

export interface CandidateRow {
  id: string;
  claimKey: string;
  scopeId: string;
  title: string;
  question: string | null;
  sourceLabel: string;
  contextSnapshotId: string | null;
  evidenceRefs: string[];
  excerpts: string[];
  status: string;
  scope: { id: string; name: string };
}

export interface DecisionsPayload {
  decisions: DecisionRow[];
  candidates: CandidateRow[];
  scopes: { id: string; name: string; targetDate: string | null }[];
}

// THE ONE RULE. A decision reaches the forecast when, and only when, it is
// still open AND carries a serial gate. Everything the circuit draws in the
// delivery path is filtered through this.
export function forecastActive(d: DecisionRow): boolean {
  return d.status === "open" && d.gate !== null && d.gate.serial;
}

/** Open, real, and touching no date — the ordinary case, and the one the
    instrument has to make look normal rather than unfinished. */
export function openNotGating(d: DecisionRow): boolean {
  return d.status === "open" && !forecastActive(d);
}

export type Lane = "gating" | "open" | "decided" | "dismissed";

export function laneOf(d: DecisionRow): Lane {
  if (d.status === "dismissed") return "dismissed";
  if (d.status === "decided") return "decided";
  return forecastActive(d) ? "gating" : "open";
}

// The material each state is made of (docs/DESIGN-NORTH-STAR.md's grammar,
// §34 of the build contract). State determines material — there is no
// per-decision colour.
export const LANE_COLOR: Record<Lane | "candidate", string> = {
  candidate: "var(--i-violet)",
  open: "var(--i-amber)",
  gating: "var(--i-red)",
  decided: "var(--i-mint)",
  dismissed: "var(--i-reality)",
};
export const LANE_WASH: Record<Lane | "candidate", string> = {
  candidate: "var(--i-violet-soft)",
  open: "var(--i-amber-soft)",
  gating: "var(--i-red-soft)",
  decided: "var(--i-mint-soft)",
  dismissed: "rgba(107,114,120,0.14)",
};

/** A short human identifier. There is no D-017 column in the database and
    inventing a stored one would be fake precision, so the circuit labels
    objects by the tail of their real id — stable, and honestly opaque. */
export function shortId(prefix: string, id: string): string {
  return `${prefix}-${id.slice(-4).toUpperCase()}`;
}

export function evidenceSourceKinds(d: DecisionRow): string[] {
  return [...new Set(d.evidence.map((e) => e.kind))];
}
