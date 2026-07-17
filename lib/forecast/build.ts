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

// Linear issue estimate (points) -> three-point day estimate. There's no
// team-specific velocity data yet, so this treats the point value as a
// likely day count with a fixed uncertainty spread -- a documented
// assumption surfaced in the Forecast page's explainer, not hidden magic.
function issueEstimateToThreePoint(estimate: number | null): ThreePoint {
  if (estimate == null || estimate <= 0) {
    // No estimate on the ticket -- common on a fresh Linear team. Wide
    // placeholder rather than pretending to know.
    return { low: 1, likely: 3, high: 7 };
  }
  return { low: round1(estimate * 0.7), likely: estimate, high: round1(estimate * 1.6) };
}

const DAY_RANGE_RE = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*d/i;
const SINGLE_DAY_RE = /(\d+(?:\.\d+)?)\s*d/i;

// Parses free-text estimateHint strings like "1-3 days", "2 days",
// "needs scoping" into a three-point range. Unparseable or missing hints
// get the same wide placeholder as an un-estimated Linear issue.
export function parseEstimateHint(hint: string | null): ThreePoint {
  if (!hint) return { low: 2, likely: 5, high: 12 };

  const range = hint.match(DAY_RANGE_RE);
  if (range) {
    const low = parseFloat(range[1]);
    const high = parseFloat(range[2]);
    return { low, likely: round1((low + high) / 2), high };
  }

  const single = hint.match(SINGLE_DAY_RE);
  if (single) {
    const n = parseFloat(single[1]);
    return { low: round1(n * 0.7), likely: n, high: round1(n * 1.6) };
  }

  return { low: 2, likely: 5, high: 12 };
}

// Serial time-to-decide for a blocking decision -- doesn't shrink with
// more developers, so it's a gate, not a divisible work item.
const DECISION_GATE_ESTIMATE: ThreePoint = { low: 1, likely: 4, high: 10 };

export interface ForecastInputs {
  items: WorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
  teamCapacityInferred: boolean;
  remainingIssueCount: number;
  unticketedFindingCount: number;
}

// Assembles the Monte Carlo inputs from raw Linear issues + Findings for a
// Scope. Ticketed findings are excluded from the finding pass since
// they're already counted via the Linear issue they became.
export function buildForecastInputs(
  issues: LinearIssueSummary[],
  findings: FindingLike[],
  configuredCapacity: number | null
): ForecastInputs {
  const remainingIssues = issues.filter((i) => !DONE_STATE_TYPES.has(i.stateType));

  const items: WorkItem[] = remainingIssues.map((issue) => ({
    id: issue.identifier,
    label: `${issue.identifier} ${issue.title}`,
    ...issueEstimateToThreePoint(issue.estimate),
  }));

  const openWorkFindings = findings.filter((f) => f.type !== "decision" && f.status === "open");
  for (const f of openWorkFindings) {
    items.push({ id: f.id, label: f.title, ...parseEstimateHint(f.estimateHint) });
  }

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

  return {
    items,
    gates,
    teamCapacity,
    teamCapacityInferred,
    remainingIssueCount: remainingIssues.length,
    unticketedFindingCount: openWorkFindings.length,
  };
}
