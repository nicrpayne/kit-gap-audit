// THE PROJECT TRUTH MODEL — what Audit actually knows, before anything is drawn.
//
// Audit answers one question: WHERE DOES ACCEPTED DELIVERY REALITY DISAGREE
// WITH THE EVIDENCE AND EXECUTION AROUND IT?
//
// This module turns real rows (Finding, Scope, Decision, DecisionGate,
// Source, ContextDoc, ContextSnapshot, Allocation, plus Linear issues) into
// that answer. It is the ONLY place a truth state is decided. Geometry lives
// in lib/audit/layout.ts, because where a thing sits on screen is a drawing
// decision and persisting one would turn a picture into a fact — the same
// split lib/orbit/graph.ts and lib/orbit/layout.ts already keep.
//
// THE RULES THIS MODULE EXISTS TO ENFORCE
//
//   1. Every state here is DERIVED FROM A COLUMN THAT EXISTS. There is no
//      confidence score, no health index, no composite severity number. The
//      schema has no such column, and a plausible percentage is exactly the
//      kind of unfalsifiable claim docs/CONTROL-ROOM-TRUTH-AUDIT.md spent a
//      whole pass removing from the Control Room.
//
//   2. A LANE THAT IS NOT CONNECTED SAYS SO. It is not hidden and it is not
//      drawn as if it were healthy. "Notion is feeding this project nothing"
//      is a true and useful statement about project truth, and the map's job
//      is to make it visible rather than tidy it away.
//
//   3. EVIDENCE IS NOT A FINDING AND A FINDING IS NOT REALITY. A checkpoint
//      reports what the data shows. A Finding is something the audit
//      noticed. Neither one changes Reality; only an explicit human action
//      does, and that path lives in lib/audit/actions.ts.

import type {
  Allocation,
  ContextDoc,
  ContextSnapshot,
  Decision,
  DecisionGate,
  Finding,
  Person,
  Scope,
  Source,
} from "@prisma/client";
import type { LinearIssueSummary } from "@/lib/linear";
import type { ProjectContextPackage } from "@/lib/context/package";

// ── STATES ─────────────────────────────────────────────────────────────
//
// Four, and only four. They map onto the instrument's existing semantic
// tokens (app/globals.css) rather than introducing an Audit-only palette:
//
//   verified -> --i-signal (cyan)    aligned, reaching Reality intact
//   drift    -> --i-amber            uncertain, incomplete, going stale
//   conflict -> --i-red              actively disagrees with Reality
//   missing  -> --i-text-faint       nothing is supplying this at all
//
// "human judgment" is deliberately NOT a fifth state. It is a property of a
// Finding (needsHuman), drawn in --i-violet, because whether a person has to
// decide something is orthogonal to whether the signal is intact.
export type TruthState = "verified" | "drift" | "conflict" | "missing";

const STATE_RANK: Record<TruthState, number> = { verified: 0, drift: 1, missing: 2, conflict: 3 };

/** The worst state in a set — how a lane inherits its state from its checkpoints. */
export function worstState(states: TruthState[]): TruthState {
  return states.reduce<TruthState>(
    (worst, s) => (STATE_RANK[s] > STATE_RANK[worst] ? s : worst),
    "verified"
  );
}

/** Which half of the model a lane belongs to. The distinction is real: a
    model lane is something Signal owns and can change; an evidence lane is
    something the world supplies and Signal may only read. */
export type LaneFamily = "model" | "evidence";

// ── CHECKPOINTS ────────────────────────────────────────────────────────
//
// A meaningful compiled assertion along a lane — "execution present",
// "owner known", "evidence fresh". Deliberately NOT one node per ticket,
// per passage or per document: that would be a graph-database dump, not an
// interpretable instrument.
//
// Every checkpoint carries the measurement it was decided from, so the
// junction on screen is a claim a human can check rather than a dot.
export interface TruthCheckpoint {
  id: string;
  /** What was tested, as a predicate: "execution present". */
  label: string;
  state: TruthState;
  /** The measured fact behind the state: "34 issues, 12 remaining". */
  detail: string;
}

export interface TruthLane {
  id: string;
  label: string;
  family: LaneFamily;
  /** Worst checkpoint state. A lane with no checkpoints at all is "missing". */
  state: TruthState;
  /** Is anything supplying this lane? False draws it explicitly unconnected. */
  supplied: boolean;
  checkpoints: TruthCheckpoint[];
  /** Open Findings whose subject is this lane. */
  findingIds: string[];
}

// ── FINDINGS ───────────────────────────────────────────────────────────

/** Severity as the map ranks it. `critical` is NOT a stored value — the
    Finding model has only high/medium/low. It is derived, in exactly one
    place (`tierFor`), from `severity === "high" && blocking`, which are two
    real columns. A blocking high-severity finding is materially different
    from a high-severity one that blocks nothing, and the map would be
    lying by flattening them together. */
export type FindingTier = "critical" | "high" | "medium" | "low";

export const TIER_RANK: Record<FindingTier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function tierFor(finding: { severity: string; blocking: boolean }): FindingTier {
  if (finding.severity === "high" && finding.blocking) return "critical";
  if (finding.severity === "high") return "high";
  if (finding.severity === "medium") return "medium";
  return "low";
}

// The four REAL Finding.type values, and the human name the instrument uses
// for each. No category is invented to fill a slot on the map: if the audit
// prompt cannot produce it, it does not appear here.
//
// The mockups show richer names ("scope not in execution", "stale evidence",
// "blocking dependency"). Those are READINGS of these four types plus the
// `blocking`/`blocks` columns, not new types — see `kindLabelFor`.
const TYPE_LABEL: Record<string, string> = {
  missing_work: "Missing work",
  decision: "Unresolved decision",
  risk: "Risk",
  contradiction: "Contradiction",
};

/** The name shown on the callout. Sharpened by real columns where they say
    something more specific — a blocking risk that names what it blocks is a
    blocking dependency, and calling it one is a reading of `blocks`, not an
    invented category. */
export function kindLabelFor(f: { type: string; blocking: boolean; blocks: string | null }): string {
  if (f.type === "risk" && f.blocking) return "Blocking dependency";
  if (f.type === "missing_work" && f.blocking) return "Missing work blocks delivery";
  return TYPE_LABEL[f.type] ?? "Finding";
}

/** Which lane a Finding's subject sits on. The map anchors a finding to the
    domain it is ABOUT, which is what a reader is looking for — not to the
    document it was noticed in (that is provenance, and it lights up as the
    related lanes instead). */
export function laneForFinding(f: { type: string; blocks: string | null }): string {
  switch (f.type) {
    case "decision":
      return "decisions";
    // Missing work is work that requirements imply and execution does not
    // contain — the gap is on the execution lane.
    case "missing_work":
      return "linear";
    // A risk that names what it is holding up is a dependency statement.
    case "risk":
      return f.blocks ? "dependencies" : "evidence";
    case "contradiction":
      return "evidence";
    default:
      return "evidence";
  }
}

/** The colour family a Finding is drawn in. Type and `blocking` decide it;
    severity decides the tier, separately. Keeping them apart is why a
    low-severity contradiction still reads as a conflict rather than as
    background noise. */
export function stateForFinding(f: { type: string; blocking: boolean }): TruthState {
  if (f.type === "decision") return "drift"; // violet is applied via needsHuman
  if (f.type === "missing_work") return "missing";
  if (f.type === "contradiction") return "conflict";
  return f.blocking ? "conflict" : "drift";
}

export interface TruthFinding {
  id: string;
  /** Real Finding.type. */
  type: string;
  kindLabel: string;
  title: string;
  tier: FindingTier;
  state: TruthState;
  /** A choice only a person can make. True for `decision` findings, and for
      anything blocking that names no owner — both are read off real columns. */
  needsHuman: boolean;
  laneId: string;
  /** Lanes that carry this finding's PROVENANCE — where the claim came from. */
  relatedLaneIds: string[];
  severity: string;
  blocking: boolean;
  status: string;
  quote: string;
  rationale: string;
  owner: string | null;
  blocks: string | null;
  matchedIssues: string[];
  estimateHint: string | null;
  createdAt: string;
  /** True when this finding cites package evidence (contextSnapshotId +
      evidenceRefs). This is the closest thing to a real "how well grounded
      is this" the model has, and it is a fact rather than a score. */
  cited: boolean;
  evidenceRefCount: number;
  /** Already ticketed, resolved or dismissed. A handled finding is still
      real and still on the map — it has simply stopped being a live
      disagreement, so it is drawn collapsed toward Reality rather than out
      in the conflict band. Hiding it would make the "handled" count a
      number pointing at nothing. */
  handled: boolean;
}

export interface TruthMapModel {
  scopeId: string;
  scopeName: string;
  lanes: TruthLane[];
  findings: TruthFinding[];
  /** Counts the header and inspector overview read. All derived. */
  totals: {
    all: number;
    critical: number;
    needsHuman: number;
    handled: number;
  };
  /** The audit run this picture came from, when one exists. */
  lastRunAt: string | null;
  priorRunAt: string | null;
  /** Sources this Scope could be reading but is not. Rendered, not hidden. */
  unsuppliedLaneIds: string[];
}

// ── THE ADAPTER ────────────────────────────────────────────────────────

export interface TruthInputs {
  scope: Scope;
  findings: Finding[];
  decisions: (Decision & { gate: DecisionGate | null })[];
  sources: Source[];
  contextDocs: ContextDoc[];
  snapshots: ContextSnapshot[];
  allocations: (Allocation & { person: Person })[];
  issues: LinearIssueSummary[];
  /** Scopes this one declares a dependency on, resolved. */
  dependsOn: Scope[];
  lastRunAt: Date | null;
  priorRunAt: Date | null;
  /** Freshness horizon for evidence, in days. */
  staleAfterDays?: number;
  now?: Date;
}

const DAY = 86_400_000;
const DEFAULT_STALE_AFTER_DAYS = 21;

function daysSince(then: Date, now: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / DAY);
}

/**
 * Build the Truth Map model from real rows.
 *
 * Pure: takes everything it needs as arguments and touches no database, so
 * the renderer can be exercised without production access — the same reason
 * lib/orbit/adapt.ts is shaped this way.
 */
export function buildTruthMap(input: TruthInputs): TruthMapModel {
  const now = input.now ?? new Date();
  const staleAfter = input.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const { scope } = input;

  const openFindings = input.findings.filter((f) => f.status === "open");
  const handled = input.findings.length - openFindings.length;

  // ── EXECUTION (Linear) ───────────────────────────────────────────────
  const remaining = input.issues.filter(
    (i) => i.stateType !== "completed" && i.stateType !== "canceled"
  );
  const estimated = remaining.filter((i) => i.estimate != null);
  const linearSupplied = input.issues.length > 0;
  const linearChecks: TruthCheckpoint[] = linearSupplied
    ? [
        {
          id: "linear:execution",
          label: "Execution present",
          state: "verified",
          detail: `${input.issues.length} issues, ${remaining.length} remaining`,
        },
        {
          id: "linear:estimates",
          label: "Estimates present",
          state:
            remaining.length === 0
              ? "verified"
              : estimated.length === 0
                ? "missing"
                : estimated.length < remaining.length
                  ? "drift"
                  : "verified",
          detail:
            remaining.length === 0
              ? "no remaining work to estimate"
              : `${estimated.length} of ${remaining.length} remaining issues carry an estimate`,
        },
        {
          id: "linear:assigned",
          label: "Owner known",
          state: (() => {
            const unassigned = remaining.filter((i) => !i.assignee).length;
            if (remaining.length === 0) return "verified";
            return unassigned === 0 ? "verified" : unassigned === remaining.length ? "missing" : "drift";
          })(),
          detail: (() => {
            const unassigned = remaining.filter((i) => !i.assignee).length;
            return unassigned === 0
              ? "every remaining issue has an assignee"
              : `${unassigned} of ${remaining.length} remaining issues unassigned`;
          })(),
        },
      ]
    : [];

  // ── REQUIREMENTS (Notion) ────────────────────────────────────────────
  const notionSupplied = scope.notionPageIds.length > 0;
  const notionChecks: TruthCheckpoint[] = notionSupplied
    ? [
        {
          id: "notion:supplied",
          label: "Requirements supplied",
          state: "verified",
          detail: `${scope.notionPageIds.length} Notion page${scope.notionPageIds.length === 1 ? "" : "s"} attached to this Scope`,
        },
      ]
    : [];

  // ── DESIGN (Figma) ───────────────────────────────────────────────────
  const figmaSupplied = scope.figmaRefs.length > 0;
  const figmaChecks: TruthCheckpoint[] = figmaSupplied
    ? [
        {
          id: "figma:supplied",
          label: "Design supplied",
          state: "verified",
          detail: `${scope.figmaRefs.length} Figma ref${scope.figmaRefs.length === 1 ? "" : "s"} attached to this Scope`,
        },
      ]
    : [];

  // ── EVIDENCE (pasted sources + context docs) ─────────────────────────
  const evidenceItems = [
    ...input.sources.map((s) => ({ at: s.createdAt, label: s.title })),
    ...input.contextDocs.map((d) => ({ at: d.createdAt, label: d.label })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const evidenceSupplied = evidenceItems.length > 0;
  const newestEvidence = evidenceItems[0];
  const evidenceAgeDays = newestEvidence ? daysSince(newestEvidence.at, now) : null;
  const evidenceChecks: TruthCheckpoint[] = evidenceSupplied
    ? [
        {
          id: "evidence:present",
          label: "Evidence present",
          state: "verified",
          detail: `${evidenceItems.length} source${evidenceItems.length === 1 ? "" : "s"} attached to this Scope`,
        },
        {
          id: "evidence:fresh",
          label: "Evidence fresh",
          // A REAL freshness test against a stated horizon, not a vibe.
          state: evidenceAgeDays !== null && evidenceAgeDays > staleAfter ? "drift" : "verified",
          detail:
            evidenceAgeDays === null
              ? "no dated evidence"
              : `newest source is ${evidenceAgeDays} day${evidenceAgeDays === 1 ? "" : "s"} old (stale after ${staleAfter})`,
        },
      ]
    : [];

  // ── ORGANISATIONAL INTELLIGENCE (Hermes / packages) ──────────────────
  //
  // Hermes owns organisational intelligence; Signal owns delivery Reality.
  // A snapshot being present is NOT the same as it being authoritative, and
  // this lane never claims otherwise — it reports what arrived and when.
  const hermesSnapshots = input.snapshots.filter((s) => s.producer === "hermes");
  const anySnapshot = input.snapshots.length > 0;
  const newestSnapshot = input.snapshots
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const citedFindings = openFindings.filter(
    (f) => f.contextSnapshotId != null && f.evidenceRefs.length > 0
  );
  const hermesChecks: TruthCheckpoint[] = anySnapshot
    ? [
        {
          id: "hermes:supplied",
          label: "Intelligence supplied",
          state: "verified",
          detail: `${input.snapshots.length} context snapshot${input.snapshots.length === 1 ? "" : "s"}${
            hermesSnapshots.length > 0 ? `, ${hermesSnapshots.length} from Hermes` : ", none from Hermes"
          }`,
        },
        {
          id: "hermes:fresh",
          label: "Package fresh",
          state:
            newestSnapshot && daysSince(newestSnapshot.createdAt, now) > staleAfter ? "drift" : "verified",
          detail: newestSnapshot
            ? `newest package accepted ${daysSince(newestSnapshot.createdAt, now)} day(s) ago`
            : "no package accepted",
        },
        {
          id: "hermes:cited",
          label: "Provenance cited",
          state: citedFindings.length > 0 ? "verified" : "drift",
          detail:
            citedFindings.length > 0
              ? `${citedFindings.length} open finding(s) cite package evidence`
              : "no open finding cites package evidence",
        },
      ]
    : [];

  // ── DECISIONS ────────────────────────────────────────────────────────
  //
  // THE LAW: an open Decision has NO forecast effect. It reaches delivery
  // only through a DecisionGate. This lane reports both facts separately so
  // the map can never imply that "unresolved" means "late".
  const openDecisions = input.decisions.filter((d) => d.status === "open");
  const gated = input.decisions.filter((d) => d.gate != null);
  const ownerless = openDecisions.filter((d) => !d.owner);
  const decisionsSupplied = input.decisions.length > 0;
  const decisionChecks: TruthCheckpoint[] = decisionsSupplied
    ? [
        {
          id: "decisions:recorded",
          label: "Decision recorded",
          state: "verified",
          detail: `${input.decisions.length} decision(s), ${openDecisions.length} open`,
        },
        {
          id: "decisions:owner",
          label: "Owner known",
          state:
            openDecisions.length === 0
              ? "verified"
              : ownerless.length === openDecisions.length
                ? "missing"
                : ownerless.length > 0
                  ? "drift"
                  : "verified",
          detail:
            openDecisions.length === 0
              ? "no open decisions"
              : `${ownerless.length} of ${openDecisions.length} open decisions have no owner`,
        },
        {
          id: "decisions:gate",
          label: "Gate declared",
          state: "verified",
          // Deliberately never "drift": having no gate is the CORRECT and
          // common case. A gate is a claim that delivery is physically
          // waiting, and its absence is not a defect.
          detail:
            gated.length > 0
              ? `${gated.length} decision(s) connected to delivery`
              : "no decision is holding delivery",
        },
      ]
    : [];

  // ── DEPENDENCIES ─────────────────────────────────────────────────────
  const dependsSupplied = scope.dependsOnScopeIds.length > 0;
  const dependencyChecks: TruthCheckpoint[] = dependsSupplied
    ? [
        {
          id: "dependencies:accepted",
          label: "Dependency accepted",
          state: "verified",
          detail: `waits on ${input.dependsOn.map((s) => s.name).join(", ") || scope.dependsOnScopeIds.join(", ")}`,
        },
        {
          id: "dependencies:target",
          label: "Upstream target known",
          state: input.dependsOn.every((s) => s.targetDate != null)
            ? "verified"
            : input.dependsOn.some((s) => s.targetDate != null)
              ? "drift"
              : "missing",
          detail: (() => {
            const without = input.dependsOn.filter((s) => !s.targetDate);
            return without.length === 0
              ? "every upstream Scope has a target date"
              : `${without.map((s) => s.name).join(", ")} has no target date`;
          })(),
        },
      ]
    : [];

  // ── CAPACITY ─────────────────────────────────────────────────────────
  //
  // Capacity is "conserved" in this product: it comes from named people, an
  // explicit number, or an inference off Linear assignees, and which of
  // those it is matters more than the number. `Person.synthetic` marks
  // capacity that stands in for a legacy figure nobody attested.
  const capacitySupplied = input.allocations.length > 0 || scope.teamCapacity != null;
  const synthetic = input.allocations.filter((a) => a.person.synthetic);
  const capacityChecks: TruthCheckpoint[] = capacitySupplied
    ? [
        {
          id: "capacity:attested",
          label: "Capacity attested",
          state:
            input.allocations.length > 0
              ? synthetic.length === input.allocations.length
                ? "drift"
                : "verified"
              : "drift",
          detail:
            input.allocations.length > 0
              ? `${input.allocations.length} allocation(s)${synthetic.length > 0 ? `, ${synthetic.length} synthetic` : ", all named people"}`
              : `no allocations — capacity is the Scope's stated ${scope.teamCapacity} FTE`,
        },
      ]
    : [];

  const laneSpecs: {
    id: string;
    label: string;
    family: LaneFamily;
    supplied: boolean;
    checkpoints: TruthCheckpoint[];
    /** Shown when nothing supplies the lane — the honest empty statement. */
    absentDetail: string;
  }[] = [
    {
      id: "decisions",
      label: "Decisions",
      family: "model",
      supplied: decisionsSupplied,
      checkpoints: decisionChecks,
      absentDetail: "no decisions recorded for this Scope",
    },
    {
      id: "dependencies",
      label: "Dependencies",
      family: "model",
      supplied: dependsSupplied,
      checkpoints: dependencyChecks,
      absentDetail: "this Scope declares no upstream dependency",
    },
    {
      id: "capacity",
      label: "Capacity",
      family: "model",
      supplied: capacitySupplied,
      checkpoints: capacityChecks,
      absentDetail: "no allocations and no stated team capacity",
    },
    {
      id: "linear",
      label: "Linear",
      family: "evidence",
      supplied: linearSupplied,
      checkpoints: linearChecks,
      absentDetail: "no Linear issues resolve for this Scope's team and projects",
    },
    {
      id: "notion",
      label: "Notion",
      family: "evidence",
      supplied: notionSupplied,
      checkpoints: notionChecks,
      absentDetail: "no Notion pages attached to this Scope",
    },
    {
      id: "figma",
      label: "Figma",
      family: "evidence",
      supplied: figmaSupplied,
      checkpoints: figmaChecks,
      absentDetail: "no Figma refs attached to this Scope",
    },
    {
      id: "hermes",
      label: "Hermes / Wiki",
      family: "evidence",
      supplied: anySnapshot,
      checkpoints: hermesChecks,
      absentDetail: "no context package has been accepted for this Scope",
    },
    {
      id: "evidence",
      label: "Evidence",
      family: "evidence",
      supplied: evidenceSupplied,
      checkpoints: evidenceChecks,
      absentDetail: "no transcripts, notes or context docs attached",
    },
  ];

  // ── FINDINGS ─────────────────────────────────────────────────────────
  //
  // Provenance decides RELATED lanes: which sources actually stand behind
  // this claim. A finding backed by a pasted transcript lights the Evidence
  // lane; one citing package evidence lights Hermes plus whichever lanes the
  // cited passages' sourceRefs resolve to.
  const snapshotById = new Map(input.snapshots.map((s) => [s.id, s]));

  const findings: TruthFinding[] = input.findings.map((f) => {
    const related = new Set<string>();
    if (f.sourceId) related.add("evidence");
    if (f.contextSnapshotId && f.evidenceRefs.length > 0) {
      related.add("hermes");
      const snap = snapshotById.get(f.contextSnapshotId);
      const pkg = snap?.package as unknown as ProjectContextPackage | undefined;
      for (const ref of f.evidenceRefs) {
        const item = pkg?.evidence?.find((e) => e.id === ref);
        if (!item) continue;
        const manifest = pkg?.sources?.find((s) => s.sourceRef === item.sourceRef);
        const laneId = laneForSourceType(manifest?.sourceType ?? item.kind);
        if (laneId) related.add(laneId);
      }
    }
    // Matched Linear issues are a real relationship: the audit checked this
    // claim against those tickets.
    if (f.matchedIssues.length > 0) related.add("linear");

    const laneId = laneForFinding(f);
    related.delete(laneId);

    return {
      id: f.id,
      type: f.type,
      kindLabel: kindLabelFor(f),
      title: f.title,
      tier: tierFor(f),
      state: stateForFinding(f),
      // A choice only a person can make: every `decision`, plus anything
      // blocking that names nobody to resolve it.
      needsHuman: f.type === "decision" || (f.blocking && !f.owner),
      laneId,
      relatedLaneIds: [...related],
      severity: f.severity,
      blocking: f.blocking,
      status: f.status,
      quote: f.quote,
      rationale: f.rationale,
      owner: f.owner,
      blocks: f.blocks,
      matchedIssues: f.matchedIssues,
      estimateHint: f.estimateHint,
      createdAt: f.createdAt.toISOString(),
      cited: f.contextSnapshotId != null && f.evidenceRefs.length > 0,
      evidenceRefCount: f.evidenceRefs.length,
      handled: f.status !== "open",
    };
  });

  // Lane badges and lane state read LIVE findings only. A handled finding is
  // no longer a disagreement, and leaving it in would keep a lane red for a
  // gap somebody has already closed.
  const byLane = new Map<string, string[]>();
  for (const f of findings) {
    if (f.handled) continue;
    const list = byLane.get(f.laneId) ?? [];
    list.push(f.id);
    byLane.set(f.laneId, list);
  }

  const lanes: TruthLane[] = laneSpecs.map((spec) => {
    const findingIds = byLane.get(spec.id) ?? [];
    const findingStates = findingIds
      .map((id) => findings.find((f) => f.id === id)!.state)
      .filter((s): s is TruthState => Boolean(s));
    const checkpoints = spec.supplied
      ? spec.checkpoints
      : [
          // AN UNCONNECTED LANE STATES ITS ABSENCE as a checkpoint rather
          // than vanishing. "Nothing is supplying design" is project truth.
          {
            id: `${spec.id}:absent`,
            label: "Not supplied",
            state: "missing" as TruthState,
            detail: spec.absentDetail,
          },
        ];
    return {
      id: spec.id,
      label: spec.label,
      family: spec.family,
      supplied: spec.supplied,
      state: worstState([...checkpoints.map((c) => c.state), ...findingStates]),
      checkpoints,
      findingIds,
    };
  });

  return {
    scopeId: scope.id,
    scopeName: scope.name,
    lanes,
    findings,
    totals: {
      all: findings.filter((f) => !f.handled).length,
      critical: findings.filter((f) => !f.handled && f.tier === "critical").length,
      needsHuman: findings.filter((f) => !f.handled && f.needsHuman).length,
      handled,
    },
    lastRunAt: input.lastRunAt?.toISOString() ?? null,
    priorRunAt: input.priorRunAt?.toISOString() ?? null,
    unsuppliedLaneIds: lanes.filter((l) => !l.supplied).map((l) => l.id),
  };
}

/** Map a package manifest sourceType onto one of this map's lanes. Returns
    null when the source has no lane — better than forcing it onto a lane it
    does not belong to. */
function laneForSourceType(sourceType: string): string | null {
  const t = sourceType.toLowerCase();
  if (t.includes("linear") || t === "issue") return "linear";
  if (t.includes("notion") || t === "page" || t === "block") return "notion";
  if (t.includes("figma")) return "figma";
  if (t.includes("transcript") || t.includes("note") || t.includes("doc") || t.includes("spreadsheet"))
    return "evidence";
  return null;
}
