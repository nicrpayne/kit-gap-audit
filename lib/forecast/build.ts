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

// Serial time-to-decide for a blocking decision -- doesn't shrink with
// more developers, so it's a gate, not a divisible work item.
const DECISION_GATE_ESTIMATE: ThreePoint = { low: 1, likely: 4, high: 10 };

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

export interface ForecastInputs {
  items: SourcedWorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
  teamCapacityInferred: boolean;
  remainingIssueCount: number;
  unticketedFindingCount: number;
  estimateQuality: EstimateQuality;
  composition: ScopeComposition;
  ai: AiEstimateStats;
}

// Assembles the Monte Carlo inputs from raw Linear issues + Findings for a
// Scope. Ticketed findings are excluded from the finding pass since
// they're already counted via the Linear issue they became. Triage-state
// issues are excluded from the forecast by default (they're unaccepted
// work, not release scope) unless includeTriage is set -- the audit is
// unaffected either way and always matches against every ticket.
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
  }
): ForecastInputs {
  const includeTriage = options?.includeTriage ?? false;
  const estimates = options?.estimates ?? new Map<string, WorkEstimateLike>();
  const hashFor = options?.hashFor;
  const findingEstimates = options?.findingEstimates ?? new Map<string, WorkEstimateLike>();
  const findingHashFor = options?.findingHashFor;

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

  const remainingIssues = issues.filter(
    (i) => !DONE_STATE_TYPES.has(i.stateType) && (includeTriage || i.stateType !== "triage")
  );
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

  const openWorkFindings = findings.filter((f) => f.type !== "decision" && f.status === "open");
  for (const f of openWorkFindings) {
    const estimate = findingEstimates.get(f.id);
    const fresh = estimate && (!findingHashFor || estimate.contentHash === findingHashFor(f));
    if (estimate && !fresh) ai.staleCount += 1;

    if (fresh) {
      ai.aiItemCount += 1;
      if (estimate.flags.length > 0) {
        ai.flagged.push({
          id: f.id,
          label: f.title,
          flags: estimate.flags,
          rationale: estimate.rationale,
          aiLikelyDays: estimate.likelyDays,
          teamPoints: null,
        });
      }
      items.push({
        id: f.id,
        label: f.title,
        estimateSource: "ai",
        low: estimate.lowDays,
        likely: estimate.likelyDays,
        high: estimate.highDays,
      });
      continue;
    }

    const { tp, source } = classifyEstimateHint(f.estimateHint);
    items.push({ id: f.id, label: f.title, estimateSource: source, ...tp });
  }

  ai.flagged.sort((a, b) => b.aiLikelyDays - a.aiLikelyDays);
  ai.flagged = ai.flagged.slice(0, 8);

  const blockingDecisions = findings.filter(
    (f) => f.type === "decision" && f.status === "open" && f.blocking
  );
  const gates: DecisionGate[] = blockingDecisions.map((f) => ({
    id: f.id,
    label: f.title,
    ...DECISION_GATE_ESTIMATE,
  }));

  let teamCapacity = configuredCapacity ?? 0;
  let teamCapacityInferred = false;
  if (teamCapacity <= 0) {
    const distinctAssignees = new Set(
      remainingIssues.map((i) => i.assignee).filter((a): a is string => !!a)
    );
    teamCapacity = distinctAssignees.size > 0 ? distinctAssignees.size : 1;
    teamCapacityInferred = true;
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
    // Only what actually feeds the simulation -- AI-excluded tickets are not counted here.
    remainingIssueCount: remainingIssues.length - ai.unrelatedExcluded.length,
    unticketedFindingCount: openWorkFindings.length,
    estimateQuality,
    composition,
    ai,
  };
}
