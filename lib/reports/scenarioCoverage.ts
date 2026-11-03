import { evaluateForecastCoverage, inheritDependencyCoverage, type ForecastCoverageContract, type ForecastCoverageInput } from "@/lib/forecast/coverage";
import { decisionScenarioOpenCount, type DecisionScenarioInput, type DecisionPlans } from "@/lib/scenario/decisionPlan";

/** Freeze coverage for the SAME selected work as a saved Scenario, not the
 * baseline census. Report generation does not accept pending Scope proposals. */
export function reportScenarioCoverage(scopes: {
  scopeId: string; name: string; executionState: string; dependsOnScopeIds: string[];
  forecastCoverage: ForecastCoverageContract; executionItems: { id: string }[];
  completedWork: { id: string }[]; openShapeQuestions: { id: string }[];
  capabilities: (ForecastCoverageInput["capabilities"][number] & { id: string; estimateReview?: { status: string } | null })[];
}[], selected: { scopeId: string; items: { high: number }[] }[], scenario: {
  excludedItemIds: string[]; includedItemIds: string[]; excludedCapabilityIds: string[]; decisionPlans?: DecisionPlans;
}, decisions: DecisionScenarioInput[]) {
  const excluded = new Set(scenario.excludedItemIds), included = new Set(scenario.includedItemIds);
  const links = (ids: string[]) => ids.map(externalId => ({ externalId, state: "active" }));
  const own = new Map(scopes.map(scope => {
    const ids = scope.executionItems.map(item => item.id);
    const directIn = ids.filter(id => (included.has(id) || !scope.forecastCoverage.workPolicy && scope.capabilities.length === 0) && !excluded.has(id));
    const directOut = ids.filter(id => excluded.has(id));
    const coverage = evaluateForecastCoverage({
      workPolicy: scope.forecastCoverage.workPolicy, executionState: scope.executionState,
      issueIds: ids, completedIssueIds: scope.completedWork.map(item => item.id),
      hasModeledRemainingEffort: selected.find(row => row.scopeId === scope.scopeId)?.items.some(item => item.high > 0) ?? false,
      capabilities: [...scope.capabilities.map(card => {
        const outside = scenario.excludedCapabilityIds.includes(card.id) || card.status !== "accepted";
        return { ...card, status: outside ? "outside" : "accepted", estimateReviewRequired: card.estimateReview?.status === "review_required" || card.estimateReviewRequired,
          workLinks: card.workLinks.filter(link => !excluded.has(link.externalId) && !(outside && included.has(link.externalId))) };
      }), ...(directIn.length ? [{ status: "accepted", workLinks: links(directIn) }] : []), ...(directOut.length ? [{ status: "outside", workLinks: links(directOut) }] : [])],
      openShapeDecisionCount: decisionScenarioOpenCount(scope.scopeId, scope.openShapeQuestions, decisions, scenario.decisionPlans),
    });
    if (directIn.length) { coverage.census.acceptedCapabilityCount--; coverage.census.mappedAcceptedCapabilityCount--; }
    return [scope.scopeId, coverage] as const;
  }));
  const result = new Map<string, ForecastCoverageContract>(), visiting = new Set<string>();
  const visit = (id: string): ForecastCoverageContract => {
    if (result.has(id)) return result.get(id)!;
    const scope = scopes.find(row => row.scopeId === id);
    if (!scope || visiting.has(id)) return evaluateForecastCoverage({ executionState: "unavailable", issueIds: [], capabilities: [], openShapeDecisionCount: 0 });
    visiting.add(id);
    const coverage = inheritDependencyCoverage(own.get(id)!, scope.dependsOnScopeIds.map(id => ({ name: scopes.find(row => row.scopeId === id)?.name ?? id, coverage: visit(id) })));
    visiting.delete(id); result.set(id, coverage); return coverage;
  };
  scopes.forEach(scope => visit(scope.scopeId));
  return result;
}
