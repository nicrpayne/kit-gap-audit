import { deliveryNextAction } from "@/lib/instrument/nextAction";
import type { ForecastCoverageContract } from "@/lib/forecast/coverage";

interface ControlRoomReadinessScope {
  scopeId: string;
  name: string;
  forecastCoverage: ForecastCoverageContract;
  capacityContract: { reconciles: boolean };
}

/** One actionable step, without dropping the rest of the coverage truth.
 *
 * Delivery's ordered next-action contract still chooses the first place to
 * go. When unclassified work and shape decisions coexist, the Control Room
 * also names the latter so clearing the first blocker cannot be mistaken
 * for complete readiness.
 */
export function controlRoomNextAction(scopes: ControlRoomReadinessScope[]) {
  // Coverage refusal outranks a capacity follow-up on another project: the
  // former withholds the project-level claim altogether, while the latter
  // remains a qualified input-reconciliation task. This also prevents a
  // healthy project's capacity note from hiding iTrack's concrete census.
  const ordered = [
    ...scopes.filter((scope) => !scope.forecastCoverage.canonicalForecast),
    ...scopes.filter((scope) => scope.forecastCoverage.canonicalForecast),
  ];
  for (const scope of ordered) {
    const action = deliveryNextAction({
      scopeId: scope.scopeId,
      coverage: scope.forecastCoverage,
      capacityReconciles: scope.capacityContract.reconciles,
    });
    if (!action) continue;
    const openShape = scope.forecastCoverage.census.openShapeDecisionCount;
    const unclassified = scope.forecastCoverage.census.unmappedExecutionIssueCount;
    return {
      ...action,
      title: `${scope.name}: ${action.title}`,
      detail: unclassified > 0 && openShape > 0
        ? `${action.detail} ${openShape} unreviewed product-shape ${openShape === 1 ? "decision" : "decisions"} also remain open.`
        : action.detail,
    };
  }
  return null;
}
