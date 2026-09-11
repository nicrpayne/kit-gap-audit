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
  | "accepted_scope_unmapped"
  | "accepted_scope_mapping_missing_from_source"
  | "shape_decisions_open";

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
    acceptedCapabilityCount: number;
    mappedAcceptedCapabilityCount: number;
    openShapeDecisionCount: number;
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
}

export interface ForecastCoverageInput {
  executionState: string;
  issueIds: string[];
  capabilities: CoverageCapability[];
  openShapeDecisionCount: number;
}

const ACTIVE_LINK_STATES = new Set(["active", "configured"]);

/**
 * Deterministic and threshold-free. It reuses governed Scope rows,
 * CapabilityWorkLinks, open boundary Decisions, and the configured execution
 * source. No percentage is invented and no Finding is promoted to Scope.
 */
export function evaluateForecastCoverage(input: ForecastCoverageInput): ForecastCoverageContract {
  const accepted = input.capabilities.filter((capability) => capability.status === "accepted");
  const issueIds = new Set(input.issueIds);
  const linked = accepted.filter((capability) =>
    capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state) && issueIds.has(link.externalId))
  );
  const activeButAbsent = accepted.filter((capability) =>
    capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state)) &&
    !capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state) && issueIds.has(link.externalId))
  );
  const withoutActiveLink = accepted.filter((capability) =>
    !capability.workLinks.some((link) => ACTIVE_LINK_STATES.has(link.state))
  );

  const census = {
    executionIssueCount: input.issueIds.length,
    acceptedCapabilityCount: accepted.length,
    mappedAcceptedCapabilityCount: linked.length,
    openShapeDecisionCount: input.openShapeDecisionCount,
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
    reasons.push({ code: "execution_source_empty", label: "No current execution work was returned", count: 1 });
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
  if (input.openShapeDecisionCount > 0) {
    reasons.push({
      code: "shape_decisions_open",
      label: `${input.openShapeDecisionCount} open product-shape ${input.openShapeDecisionCount === 1 ? "Decision" : "Decisions"}`,
      count: input.openShapeDecisionCount,
    });
  }

  if (reasons.length > 0) {
    return {
      state: "modeled_subset",
      canonicalForecast: false,
      label: "FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED",
      reason: reasons.map((item) => item.label).join("; "),
      caveat: "Unmapped accepted scope or unresolved execution work is excluded.",
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
