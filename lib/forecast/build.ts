import type { LinearIssueSummary } from "@/lib/linear";
import type { ThreePoint, WorkItem, DecisionGate } from "./simulate";

export interface FindingLike {
  id: string;
  type: string;
  title: string;
  status: string;
  blocking: boolean;
  estimateHint: string | null;
}

const DONE_STATE_TYPES = new Set(["completed", "canceled"]);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Where a work item's three-point range came from. "placeholder" sources
// mean we're guessing with a deliberately wide range because nothing better
// exists -- the estimate-quality panel reports how much of the forecast
// rests on these, since tightening them is the cheapest way to narrow the
// date range.
export type EstimateSource = "ai" | "points" | "issue_placeholder" | "hint" | "finding_placeholder";

// A stored AI estimate for one work item (see the WorkEstimate model).
export interface WorkEstimateLike {
  externalId: string;
  contentHash: string;
  lowDays: number;
  likelyDays: number;
  highDays: number;
  relevance: string; // "core" | "peripheral" | "unrelated"
  flags: string[];
  rationale: string;
}

export interface SourcedWorkItem extends WorkItem {
  estimateSource: EstimateSource;
}

// Linear issue estimate (points) -> three-point day estimate. There's no
// team-specific velocity data yet, so this treats the point value as a
// likely day count with a fixed uncertainty spread -- a documented
// assumption surfaced in the Forecast page's explainer, not hidden magic.
function issueEstimateToThreePoint(estimate: number | null): { tp: ThreePoint; source: EstimateSource } {
  if (estimate == null || estimate <= 0) {
    // No estimate on the ticket -- common on a fresh Linear team. Wide
    // placeholder rather than pretending to know.
    return { tp: { low: 1, likely: 3, high: 7 }, source: "issue_placeholder" };
  }
  return {
    tp: { low: round1(estimate * 0.7), likely: estimate, high: round1(estimate * 1.6) },
    source: "points",
  };
}

const DAY_RANGE_RE = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*d/i;
const SINGLE_DAY_RE = /(\d+(?:\.\d+)?)\s*d/i;

const HINT_PLACEHOLDER: ThreePoint = { low: 2, likely: 5, high: 12 };

// Parses free-text estimateHint strings like "1-3 days", "2 days",
// "needs scoping" into a three-point range. Unparseable or missing hints
// get the same wide placeholder as an un-estimated Linear issue.
export function parseEstimateHint(hint: string | null): ThreePoint {
  return classifyEstimateHint(hint).tp;
}

function classifyEstimateHint(hint: string | null): { tp: ThreePoint; source: EstimateSource } {
  if (!hint) return { tp: HINT_PLACEHOLDER, source: "finding_placeholder" };

  const range = hint.match(DAY_RANGE_RE);
  if (range) {
    const low = parseFloat(range[1]);
    const high = parseFloat(range[2]);
    return { tp: { low, likely: round1((low + high) / 2), high }, source: "hint" };
  }

  const single = hint.match(SINGLE_DAY_RE);
  if (single) {
    const n = parseFloat(single[1]);
    return { tp: { low: round1(n * 0.7), likely: n, high: round1(n * 1.6) }, source: "hint" };
  }

  return { tp: HINT_PLACEHOLDER, source: "finding_placeholder" };
}

// The timing every legacy gate used before Decisions existed. Kept as the
// migration's backfill value so no date moves; new gates carry their own
// three-point estimate, answered when the gate is created.
export const LEGACY_GATE_ESTIMATE: ThreePoint = { low: 1, likely: 4, high: 10 };

// A GATE SUPPLIED BY THE DECISION MODEL.
//
// Gates no longer come from Finding.type + a boolean. A Decision reaches
// the forecast only through a DecisionGate row, which had to say what
// waits, why the wait is serial, and on what evidence. Callers resolve
// those rows and hand them in; this module does not query.
export interface SuppliedGate extends ThreePoint {
  id: string;
  label: string;
}

// How much of the forecast rests on real estimates vs. placeholder guesses.
export interface EstimateQuality {
  aiCount: number; // items with a fresh AI estimate (best available signal)
  pointsIssueCount: number; // issues with a real Linear estimate
  placeholderIssueCount: number; // issues with no estimate (wide placeholder)
  hintFindingCount: number; // findings with a parseable day range
  placeholderFindingCount: number; // findings with no usable hint
  placeholderEffortSharePct: number; // % of likely effort-days from placeholders
}

// What the AI estimator contributed and surfaced for this forecast.
export interface AiEstimateStats {
  aiItemCount: number;
  staleCount: number; // ticket content changed since its estimate -- re-run to refresh
  unrelatedExcluded: { id: string; label: string; rationale: string }[];
  flagged: {
    id: string;
    label: string;
    flags: string[];
    rationale: string;
    aiLikelyDays: number;
    teamPoints: number | null;
  }[];
}

// What the in-scope Linear issues look like by workflow state, so the
// Forecast page can show what it's counting (and what it's leaving out).
export interface ScopeComposition {
  triage: number;
  backlog: number;
  unstarted: number;
  started: number;
  completed: number;
  canceled: number;
  excludedTriageCount: number; // > 0 when triage is excluded from the forecast
}

// Where teamCapacity actually came from -- "inferred" subsumes the old
// teamCapacityInferred boolean (kept alongside for existing callers) with
// one more rung: capacity resolved from named-person Allocations (see
// lib/capacity/resolve.ts) takes priority over a Scope's own explicit
// teamCapacity, which takes priority over inferring from distinct
// assignees on remaining issues.
export type CapacitySource = "allocations" | "explicit" | "inferred";

// The work the forecast actually simulates: executable leaf work not already
// finished, minus Triage unless the Scope opts in. A Linear parent that has
// another counted issue beneath it is a grouping container, not a second
// delivery item. A dangling parent remains counted: without a fetched child
// there is no evidence that its own work is represented elsewhere.
// Extracted so the
// capacity inference below AND the Instrument's "why is Reality 10?"
// explanation read from one definition instead of two that can drift.
export function remainingIssuesFor(issues: LinearIssueSummary[], includeTriage: boolean): LinearIssueSummary[] {
  const remaining = issues.filter(
    (i) => !DONE_STATE_TYPES.has(i.stateType) && (includeTriage || i.stateType !== "triage")
  );
  const representedParents = new Set(
    remaining.map((i) => i.parentIdentifier).filter((id): id is string => id !== null)
  );
  return remaining.filter((i) => !representedParents.has(i.identifier));
}

// Capacity inference, stage 2 of the fallback chain: with no named
// allocations and no explicit teamCapacity, a Scope's parallel capacity is
// taken to be THE NUMBER OF DISTINCT PEOPLE ASSIGNED TO ITS REMAINING
// WORK IN LINEAR -- i.e. "however many people are currently holding a
// ticket here is how many people are working on this." Unassigned tickets
// contribute nobody; a Scope where nothing is assigned falls back to 1 so
// the simulation never divides by zero.
//
// It is a rough proxy and the UI says so: it counts ticket-holders, not
// availability, so someone assigned one ticket at 10% time counts the same
// as someone full-time. Returning the names (not just the count) is what
// lets the Instrument show its work rather than asserting a number.
export function inferCapacityFromAssignees(remainingIssues: LinearIssueSummary[]): {
  capacity: number;
  assignees: string[];
  unassignedCount: number;
} {
  const distinct = new Set(remainingIssues.map((i) => i.assignee).filter((a): a is string => !!a));
  const assignees = [...distinct].sort();
  return {
    capacity: assignees.length > 0 ? assignees.length : 1,
    assignees,
    unassignedCount: remainingIssues.filter((i) => !i.assignee).length,
  };
}

export interface ForecastInputs {
  items: SourcedWorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
  teamCapacityInferred: boolean;
  capacitySource: CapacitySource;
  remainingIssueCount: number;
  unticketedFindingCount: number;
  estimateQuality: EstimateQuality;
  composition: ScopeComposition;
  ai: AiEstimateStats;
}

// Assembles the Monte Carlo inputs from canonical Linear work for a Scope.
// Findings never enter the delivery model directly: an open Finding is an
// Audit observation, not accepted Reality. Filing or attaching it creates or
// identifies canonical Linear work, and that Linear row then enters here
// exactly once through the issue pass. Triage-state issues are excluded from
// the forecast by default (they're unaccepted work, not release scope) unless
// includeTriage is set -- Audit is unaffected and retains every Finding.
export function buildForecastInputs(
  issues: LinearIssueSummary[],
  findings: FindingLike[],
  configuredCapacity: number | null,
  options?: {
    includeTriage?: boolean;
    estimates?: Map<string, WorkEstimateLike>;
    hashFor?: (issue: LinearIssueSummary) => string;
    findingEstimates?: Map<string, WorkEstimateLike>;
    findingHashFor?: (finding: { title: string; estimateHint: string | null }) => string;
    /** Serial gates from DecisionGate rows, already resolved by the caller
        (lib/forecast/compute.ts). Absent = this Scope has no gated
        Decisions, which is a perfectly ordinary state. */
    gates?: SuppliedGate[];
    // Caller's classification of configuredCapacity when it's non-null --
    // "allocations" if resolved from named-person Allocations, otherwise
    // "explicit" (a Scope's own teamCapacity, today's only source).
    // Irrelevant when configuredCapacity is null (falls to "inferred").
    capacitySource?: "allocations" | "explicit";
  }
): ForecastInputs {
  const includeTriage = options?.includeTriage ?? false;
  const estimates = options?.estimates ?? new Map<string, WorkEstimateLike>();
  const hashFor = options?.hashFor;
  const composition: ScopeComposition = {
    triage: 0,
    backlog: 0,
    unstarted: 0,
    started: 0,
    completed: 0,
    canceled: 0,
    excludedTriageCount: 0,
  };
  for (const issue of issues) {
    if (issue.stateType in composition) {
      composition[issue.stateType as keyof Omit<ScopeComposition, "excludedTriageCount">] += 1;
    }
  }

  const remainingIssues = remainingIssuesFor(issues, includeTriage);
  if (!includeTriage) {
    composition.excludedTriageCount = composition.triage;
  }

  // Prefer a fresh AI estimate (content-hash still matching) over the
  // points heuristic. An estimate whose ticket has changed since is stale:
  // fall back to points and count it, so the UI can prompt a re-run.
  // AI-judged "unrelated" tickets are excluded from the simulation but
  // listed loudly -- content-based scope filtering, no labels required.
  const ai: AiEstimateStats = { aiItemCount: 0, staleCount: 0, unrelatedExcluded: [], flagged: [] };
  const items: SourcedWorkItem[] = [];

  for (const issue of remainingIssues) {
    const label = `${issue.identifier} ${issue.title}`;
    const estimate = estimates.get(issue.identifier);
    const fresh = estimate && (!hashFor || estimate.contentHash === hashFor(issue));

    if (estimate && !fresh) ai.staleCount += 1;

    if (fresh) {
      if (estimate.relevance === "unrelated") {
        ai.unrelatedExcluded.push({ id: issue.identifier, label, rationale: estimate.rationale });
        continue;
      }
      ai.aiItemCount += 1;
      if (estimate.flags.length > 0) {
        ai.flagged.push({
          id: issue.identifier,
          label,
          flags: estimate.flags,
          rationale: estimate.rationale,
          aiLikelyDays: estimate.likelyDays,
          teamPoints: issue.estimate,
        });
      }
      items.push({
        id: issue.identifier,
        label,
        estimateSource: "ai",
        low: estimate.lowDays,
        likely: estimate.likelyDays,
        high: estimate.highDays,
      });
      continue;
    }

    const { tp, source } = issueEstimateToThreePoint(issue.estimate);
    items.push({ id: issue.identifier, label, estimateSource: source, ...tp });
  }

  // Attention count only. These rows are intentionally absent from `items`.
  // Keeping the count lets Forecast name the unresolved observations without
  // implying that they have already altered Reality.
  const openWorkFindings = findings.filter((f) => f.type !== "decision" && f.status === "open");

  ai.flagged.sort((a, b) => b.aiLikelyDays - a.aiLikelyDays);
  ai.flagged = ai.flagged.slice(0, 8);

  // EXACTLY ONE GATE PATH. Legacy decision Findings no longer produce
  // gates -- scripts/migrate-decisions.ts converted them into Decisions
  // with explicit DecisionGate rows, and the caller supplies those. A
  // Finding of type "decision" is now purely an audit observation, and the
  // rows survive only as history.
  const gates: DecisionGate[] = (options?.gates ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    low: g.low,
    likely: g.likely,
    high: g.high,
  }));

  let teamCapacity = configuredCapacity ?? 0;
  let teamCapacityInferred = false;
  let capacitySource: CapacitySource = options?.capacitySource ?? "explicit";
  if (teamCapacity <= 0) {
    teamCapacity = inferCapacityFromAssignees(remainingIssues).capacity;
    teamCapacityInferred = true;
    capacitySource = "inferred";
  }

  const totalLikely = items.reduce((sum, i) => sum + i.likely, 0);
  const placeholderLikely = items
    .filter((i) => i.estimateSource === "issue_placeholder" || i.estimateSource === "finding_placeholder")
    .reduce((sum, i) => sum + i.likely, 0);

  const estimateQuality: EstimateQuality = {
    aiCount: items.filter((i) => i.estimateSource === "ai").length,
    pointsIssueCount: items.filter((i) => i.estimateSource === "points").length,
    placeholderIssueCount: items.filter((i) => i.estimateSource === "issue_placeholder").length,
    hintFindingCount: items.filter((i) => i.estimateSource === "hint").length,
    placeholderFindingCount: items.filter((i) => i.estimateSource === "finding_placeholder").length,
    placeholderEffortSharePct: totalLikely > 0 ? Math.round((placeholderLikely / totalLikely) * 100) : 0,
  };

  return {
    items,
    gates,
    teamCapacity,
    teamCapacityInferred,
    capacitySource,
    // Only what actually feeds the simulation -- AI-excluded tickets are not counted here.
    remainingIssueCount: remainingIssues.length - ai.unrelatedExcluded.length,
    unticketedFindingCount: openWorkFindings.length,
    estimateQuality,
    composition,
    ai,
  };
}
