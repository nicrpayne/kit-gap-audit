/**
 * One delivery-forecast coverage contract for every consumer.
 *
 * The Monte Carlo engine answers "when do these inputs finish?". This
 * contract answers the separate product question "do those inputs represent
 * enough of the project to call that result its delivery forecast?".
 */

export type ForecastCoverageState = "forecastable" | "modeled_subset" | "unavailable";

export type ForecastCoverageReasonCode =
  | "execution_source_not_configured"
  | "execution_source_unavailable"
  | "execution_source_stale"
  | "execution_source_empty"
  | "no_remaining_execution_work"
  | "accepted_scope_unmapped"
  | "accepted_scope_mapping_missing_from_source"
  | "execution_work_unmapped"
  | "shape_decisions_open"
  | "capability_estimate_review_required"
  | "dependency_coverage_incomplete";

export interface ForecastCoverageReason {
  code: ForecastCoverageReasonCode;
  label: string;
  count: number;
}

export interface ForecastCoverageContract {
  state: ForecastCoverageState;
  canonicalForecast: boolean;
  label: string;
  reason: string | null;
  caveat: string | null;
  reasons: ForecastCoverageReason[];
  census: {
    executionIssueCount: number;
    modeledExecutionIssueCount: number;
    outsideExecutionIssueCount: number;
    unmappedExecutionIssueCount: number;
    acceptedCapabilityCount: number;
    mappedAcceptedCapabilityCount: number;
    openShapeDecisionCount: number;
    incompleteDependencyCount: number;
  };
}

export class ForecastCoverageIncompleteError extends Error {
  readonly code = "FORECAST_COVERAGE_INCOMPLETE";
  constructor(readonly coverage: ForecastCoverageContract) {
    super(`${coverage.label}${coverage.reason ? ` — ${coverage.reason}` : ""}`);
    this.name = "ForecastCoverageIncompleteError";
  }
}

interface CoverageCapability {
  status: string;
  workLinks: { externalId: string; state: string }[];
  /** True when an accepted assertion cannot support a new canonical
      delivery claim. Reviewed v2 may remain qualified exploration; legacy
      or malformed assertions are not applied. */
  estimateReviewRequired?: boolean;
}

import { isTerminalIssue } from "@/lib/linearIssueState";

export interface ForecastCoverageInput {
  executionState: string;
  /** Remaining executable leaves only; these are the classification census. */
  issueIds: string[];
  /** Completed (not canceled) records from the same current owner read.
   * Mapping evidence only: never counted or simulated as remaining work. */
  completedIssueIds?: string[];
  capabilities: CoverageCapability[];
  openShapeDecisionCount: number;
}

const ACTIVE_LINK_STATES = new Set(["active", "configured"]);

/** Coverage governs the same executable leaf work as the simulation, not
    historical shipped rows or Linear grouping parents represented by an
    open child. A dangling parent still counts because no child represents
    its delivery work. */
export function deliveryRelevantIssueIds(
  issues: { identifier: string; completedAt: string | null; canceledAt?: string | null; stateType?: string; parentIdentifier?: string | null }[],
  includeTriage = true,
): string[] {
  const remaining = issues.filter((issue) =>
    !isTerminalIssue(issue)
    && (includeTriage || issue.stateType !== "triage")
  );
  const representedParents = new Set(
    remaining.map((issue) => issue.parentIdentifier).filter((identifier): identifier is string => Boolean(identifier)),
  );
  return remaining.filter((issue) => !representedParents.has(issue.identifier)).map((issue) => issue.identifier);
}

/**
 * Deterministic and threshold-free. It reuses governed Scope rows,
 * CapabilityWorkLinks, open boundary Decisions, and the configured execution
 * source. No percentage is invented and no Finding is promoted to Scope.
 */
export function evaluateForecastCoverage(input: ForecastCoverageInput): ForecastCoverageContract {
  const accepted = input.capabilities.filter((capability) => capability.status === "accepted");
  const outside = input.capabilities.filter((capability) => capability.status !== "accepted");
  const hasGovernedShape = input.capabilities.length > 0;
  const issueIds = new Set(input.issueIds);
  const completedIds = new Set(input.completedIssueIds ?? []);
  const hasCurrentMapping = (capability: CoverageCapability) => {
    const links = capability.workLinks.filter((link) => ACTIVE_LINK_STATES.has(link.state));
    return links.some((link) => issueIds.has(link.externalId))
      // An entirely finished mapping is valid only when every active link is
      // accounted for. One done row must not conceal absent/canceled work.
      || (links.length > 0 && links.every((link) => completedIds.has(link.externalId)));
  };
  const mappedIssueIds = new Set(
    accepted.flatMap((capability) => capability.workLinks)
      .filter((link) => ACTIVE_LINK_STATES.has(link.state) && issueIds.has(link.externalId))
      .map((link) => link.externalId),
  );
  const linked = accepted.filter(hasCurrentMapping);
  const activeButAbsent = accepted.filter((capability) =>
    capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state)) &&
    !hasCurrentMapping(capability)
  );
  const withoutActiveLink = accepted.filter((capability) =>
    !capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state))
  );
  const outsideIssueIds = new Set(
    outside.flatMap((capability) => capability.workLinks)
      .filter((link) => ACTIVE_LINK_STATES.has(link.state) && issueIds.has(link.externalId))
      .map((link) => link.externalId),
  );
  const classifiedIssueIds = new Set([...mappedIssueIds, ...outsideIssueIds]);

  const census = {
    executionIssueCount: input.issueIds.length,
    modeledExecutionIssueCount: hasGovernedShape ? mappedIssueIds.size : input.issueIds.length,
    outsideExecutionIssueCount: hasGovernedShape ? outsideIssueIds.size : 0,
    unmappedExecutionIssueCount: hasGovernedShape ? input.issueIds.length - classifiedIssueIds.size : 0,
    acceptedCapabilityCount: accepted.length,
    mappedAcceptedCapabilityCount: linked.length,
    openShapeDecisionCount: input.openShapeDecisionCount,
    incompleteDependencyCount: 0,
  };

  if (input.executionState === "not_configured") {
    return unavailable("execution_source_not_configured", "Execution source is not configured", census);
  }
  if (input.executionState === "unavailable") {
    return unavailable("execution_source_unavailable", "Execution source is unavailable", census);
  }

  const reasons: ForecastCoverageReason[] = [];
  if (input.executionState === "stale") {
    reasons.push({ code: "execution_source_stale", label: "Execution mapping is stale", count: 1 });
  }
  if (input.issueIds.length === 0) {
    reasons.push(completedIds.size > 0
      ? { code: "no_remaining_execution_work", label: "No remaining execution work to forecast; ticket completion is not release confirmation", count: 1 }
      : { code: "execution_source_empty", label: "No current execution work was returned", count: 1 });
  }
  if (withoutActiveLink.length > 0) {
    reasons.push({
      code: "accepted_scope_unmapped",
      label: `${withoutActiveLink.length} accepted ${withoutActiveLink.length === 1 ? "capability has" : "capabilities have"} no active work mapping`,
      count: withoutActiveLink.length,
    });
  }
  if (activeButAbsent.length > 0) {
    reasons.push({
      code: "accepted_scope_mapping_missing_from_source",
      label: `${activeButAbsent.length} accepted ${activeButAbsent.length === 1 ? "capability has" : "capabilities have"} mappings absent from the current execution read`,
      count: activeButAbsent.length,
    });
  }
  if (hasGovernedShape && classifiedIssueIds.size < input.issueIds.length) {
    reasons.push({
      code: "execution_work_unmapped",
      label: `${input.issueIds.length - classifiedIssueIds.size} current execution ${input.issueIds.length - classifiedIssueIds.size === 1 ? "item is" : "items are"} not classified as in or out of this release`,
      count: input.issueIds.length - classifiedIssueIds.size,
    });
  }
  if (input.openShapeDecisionCount > 0) {
    reasons.push({
      code: "shape_decisions_open",
      label: `${input.openShapeDecisionCount} open product-shape ${input.openShapeDecisionCount === 1 ? "Decision" : "Decisions"}`,
      count: input.openShapeDecisionCount,
    });
  }
  const estimatesAwaitingReview = accepted.filter((capability) => capability.estimateReviewRequired).length;
  if (estimatesAwaitingReview > 0) {
    reasons.push({
      code: "capability_estimate_review_required",
      label: `${estimatesAwaitingReview} accepted capability ${estimatesAwaitingReview === 1 ? "estimate requires" : "estimates require"} explicit boundary review`,
      count: estimatesAwaitingReview,
    });
  }

  if (reasons.length > 0) {
    const estimateReviewRequired = reasons.some((reason) => reason.code === "capability_estimate_review_required");
    return {
      // There is no remaining-work forecast to display. Keep the real
      // source/mapping census, but suppress synthetic start-day/gate dates.
      state: reasons.some((reason) => reason.code === "no_remaining_execution_work") ? "unavailable" : "modeled_subset",
      canonicalForecast: false,
      label: reasons.length === 1 && reasons[0].code === "no_remaining_execution_work"
        ? "NO REMAINING WORK TO FORECAST"
        : estimateReviewRequired
        ? "FORECAST INCOMPLETE — ESTIMATE REVIEW REQUIRED"
        : "FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED",
      reason: reasons.map((item) => item.label).join("; "),
      caveat: reasons.some((reason) => reason.code === "no_remaining_execution_work")
        ? "Completed ticket mappings are retained. No delivery date or release approval is inferred from ticket completion."
        : estimateReviewRequired
        ? "An accepted estimate needs review. Reviewed v2 may appear only as qualified exploration; a legacy or malformed assertion is not applied, and remaining tickets are only a ticket-only subset pending review."
        : "Unmapped accepted scope or unclassified execution work is excluded.",
      reasons,
      census,
    };
  }

  return {
    state: "forecastable",
    canonicalForecast: true,
    label: "CANONICAL DELIVERY FORECAST",
    reason: null,
    caveat: null,
    reasons: [],
    census,
  };
}

/** A delivery claim also inherits the coverage truth of every predecessor
    whose completion is part of its simulated date. */
export function inheritDependencyCoverage(
  own: ForecastCoverageContract,
  dependencies: { name: string; coverage: ForecastCoverageContract }[],
): ForecastCoverageContract {
  const incomplete = dependencies.filter((dependency) => !dependency.coverage.canonicalForecast);
  if (incomplete.length === 0) return own;

  const unavailableDependency = incomplete.some((dependency) => dependency.coverage.state === "unavailable");
  const dependencyReason: ForecastCoverageReason = {
    code: "dependency_coverage_incomplete",
    label: `${incomplete.length} ${incomplete.length === 1 ? "dependency has" : "dependencies have"} incomplete execution coverage (${incomplete.map((dependency) => dependency.name).join(", ")})`,
    count: incomplete.length,
  };
  const reasons = [...own.reasons, dependencyReason];
  const state: ForecastCoverageState = own.state === "unavailable" || unavailableDependency ? "unavailable" : "modeled_subset";

  return {
    ...own,
    state,
    canonicalForecast: false,
    label: state === "unavailable" ? "FORECAST UNAVAILABLE" : "FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED",
    reason: reasons.map((reason) => reason.label).join("; "),
    caveat: state === "unavailable"
      ? "Signal has no reliable execution input for the full dependency closure."
      : "Unmapped accepted scope or unresolved execution work is excluded.",
    reasons,
    census: { ...own.census, incompleteDependencyCount: incomplete.length },
  };
}

function unavailable(
  code: Extract<ForecastCoverageReasonCode, "execution_source_not_configured" | "execution_source_unavailable">,
  label: string,
  census: ForecastCoverageContract["census"],
): ForecastCoverageContract {
  return {
    state: "unavailable",
    canonicalForecast: false,
    label: "FORECAST UNAVAILABLE",
    reason: label,
    caveat: "Signal has no reliable execution input to model.",
    reasons: [{ code, label, count: 1 }],
    census,
  };
}
