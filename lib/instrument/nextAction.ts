import type { ForecastCoverageContract } from "@/lib/forecast/coverage";
import type { NextAction } from "@/components/instrument/Attention";

/** Derive navigation from existing truth, never new acceptance or readiness rules. */
export function deliveryNextAction(input: {
  scopeId: string;
  coverage: ForecastCoverageContract;
  capacityReconciles?: boolean;
  capacityRequired?: number;
}): NextAction | null {
  const { coverage, scopeId } = input;
  const href = (page: string) => `/${page}?project=${encodeURIComponent(scopeId)}`;
  if (coverage.reasons.some((reason) => reason.code.startsWith("execution_source_"))) return {
    title: "Check the project’s source data", detail: coverage.reason ?? "The execution source needs attention before this forecast can be trusted.",
    label: "Review sources in Audit", href: href("audit"),
  };
  if (coverage.census.unmappedExecutionIssueCount > 0) return {
    title: "Tell Signal which features these tickets belong to",
    detail: `${coverage.census.unmappedExecutionIssueCount} ticket${coverage.census.unmappedExecutionIssueCount === 1 ? " needs" : "s need"} an in-release or out/later assignment.`,
    label: "Resolve tickets in Scope", href: href("scope"),
  };
  if (coverage.census.acceptedCapabilityCount > coverage.census.mappedAcceptedCapabilityCount) return {
    title: "Connect the remaining features to their work", detail: "Some accepted features do not have current ticket coverage. Review their mappings in Scope.",
    label: "Review feature mappings", href: href("scope"),
  };
  if (coverage.census.openShapeDecisionCount > 0) return {
    title: "Review the choices holding up the forecast", detail: `${coverage.census.openShapeDecisionCount} product-scope decision${coverage.census.openShapeDecisionCount === 1 ? " is" : "s are"} still open. Review the evidence before deciding.`,
    label: "Review open Decisions", href: href("decisions"),
  };
  if (coverage.reasons.some((reason) => reason.code === "no_remaining_estimated_effort")) return {
    title: "Check the zero remaining-work estimates", detail: "Open tickets remain selected, but their estimates add no effort. Review the estimates or completion status; zero is not a completed-project claim.",
    label: "Review estimates in Scope", href: href("scope"),
  };
  if (coverage.reasons.some((reason) => reason.code === "capability_estimate_review_required")) return {
    title: "Review the remaining-work estimate", detail: "Its reviewed ticket boundary or source has changed. Check the estimate before using it for a delivery forecast.",
    label: "Review estimates in Scope", href: href("scope"),
  };
  if (coverage.reasons.some((reason) => reason.code === "no_remaining_execution_work")) return {
    title: "No remaining ticket work to forecast", detail: "Completed mappings are retained. Check that the linked work covers the intended feature; ticket completion is not release or deployment confirmation.",
    label: "Review completed work in Scope", href: href("scope"),
  };
  if (coverage.reasons.some((reason) => reason.code === "no_remaining_release_work")) return {
    title: "No remaining work is selected for this release", detail: "The current open tickets are out/later. Review the release boundary or restore work in Scope; this is not a completed-project claim.",
    label: "Review selected work in Scope", href: href("scope"),
  };
  if (input.capacityReconciles === false || (input.capacityRequired ?? 0) > 0) return {
    title: "Check who is actually available", detail: "The staffing inputs still need reconciliation. Review the team and allocations before relying on the date.",
    label: "Review team capacity", href: href("portfolio"),
  };
  if (!coverage.canonicalForecast) return {
    title: "Review what is blocking this forecast", detail: coverage.reason ?? "Signal needs reviewed delivery inputs before it can support a project forecast.",
    label: "Review Scope coverage", href: href("scope"),
  };
  return null;
}
