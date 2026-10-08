import type { ProjectScope, SuiteScenario } from '@/lib/instrument/useProject';
import { evaluateForecastCoverage, inheritDependencyCoverage, type ForecastCoverageContract } from '@/lib/forecast/coverage';
import { scenarioDisplayShape } from './displayShape';
import { reviewedCapabilityEstimate } from '@/lib/scope/knowledgeEstimates';
import { decisionScenarioOpenCount, validateDecisionPlans, type DecisionScenarioInput } from './decisionPlan';

const linksFor = (ids: string[]) => ids.map(externalId => ({ externalId, state: 'active' }));

/** Coverage of the same temporary product shape shown in Scope. Never writes
 * accepted Reality, and never promotes a draft to a reportable baseline. */
export function scenarioForecastCoverage(scopes: ProjectScope[], scenario: SuiteScenario, active: boolean, decisions: DecisionScenarioInput[] = []): Map<string, ForecastCoverageContract> {
  if (!active || validateDecisionPlans(scenario.decisionPlans, decisions, scopes.map(scope => scope.scopeId), scenario.resolvedGateIds)) return new Map(scopes.map(scope => [scope.scopeId, scope.forecastCoverage]));
  const own = new Map(scopes.map(scope => {
    const shape = scenarioDisplayShape(scope, scenario);
    const ids = new Set(scope.executionItems.map(item => item.id));
    const excluded = new Set([...scenario.excludedItemIds].filter(id => ids.has(id)));
    const included = new Set([...scenario.includedItemIds].filter(id => ids.has(id) && !excluded.has(id)));
    const capabilities = [
      ...shape.scenarioCapabilities.map(capability => ({
        status: shape.proposalBypassed.has(`capability:${capability.id}`) ? 'outside' : capability.status,
        workLinks: capability.workLinks.filter(link => !excluded.has(link.externalId)),
        estimateReviewRequired: capability.estimateReview?.status === 'review_required'
          || (!capability.signalScenarioEstimate && reviewedCapabilityEstimate(capability.acceptedEstimate,
            capability.workLinks.filter(link => (link.state === 'active' || link.state === 'configured') && ids.has(link.externalId) && !excluded.has(link.externalId)).map(link => link.externalId),
            capability.knowledgeEstimates)?.status === 'review_required'),
      })),
      ...shape.proposalSelections.filter(selection => !selection.targetCapabilityId).map(selection => ({
        status: selection.releaseStatus,
        workLinks: linksFor(selection.itemIds.filter(id => !excluded.has(id))),
      })),
      ...scenario.draftFeatures.filter(draft => draft.itemIds.some(id => ids.has(id))).map(draft => ({
        status: shape.proposalBypassed.has(draft.id) ? 'outside' : 'accepted',
        workLinks: linksFor(draft.itemIds.filter(id => ids.has(id) && !excluded.has(id))),
      })),
    ].map(capability => ({
      ...capability,
      // Explicit item inclusion overrides an outside link for this what-if.
      workLinks: capability.status === 'accepted' ? capability.workLinks
        : capability.workLinks.filter(link => !included.has(link.externalId)),
    }));
    // Legacy projects already model all current work. Excluding one ticket
    // must not make every untouched ticket "unmapped".
    const implicitIds = scope.capabilities.length === 0
      ? [...ids].filter(id => !excluded.has(id) && !capabilities.some(capability => capability.workLinks.some(link => link.externalId === id)))
      : [];
    const directIds = [...new Set([...included, ...implicitIds])];
    const directWork = [
      ...(directIds.length ? [{ status: 'accepted', workLinks: linksFor(directIds) }] : []),
      ...(excluded.size ? [{ status: 'outside', workLinks: linksFor([...excluded]) }] : []),
    ];
    // Decision gate ids are not product-shape Decision ids. Resolving a
    // modeled delay cannot silently settle an unrelated release boundary.
    const coverage = evaluateForecastCoverage({
      executionState: scope.executionState,
      issueIds: [...ids],
      capabilities: [...capabilities, ...directWork],
      openShapeDecisionCount: decisionScenarioOpenCount(scope.scopeId, scope.openShapeQuestions, decisions, scenario.decisionPlans),
    });
    // Direct ticket classifications are not invented product capabilities.
    if (directIds.length) {
      coverage.census.acceptedCapabilityCount -= 1;
      coverage.census.mappedAcceptedCapabilityCount -= 1;
    }
    return [scope.scopeId, coverage] as const;
  }));
  const byId = new Map(scopes.map(scope => [scope.scopeId, scope]));
  const result = new Map<string, ForecastCoverageContract>();
  const visiting = new Set<string>();
  const unavailable = () => evaluateForecastCoverage({ executionState: 'unavailable', issueIds: [], capabilities: [], openShapeDecisionCount: 0 });
  const visit = (id: string): ForecastCoverageContract => {
    if (result.has(id)) return result.get(id)!;
    // Missing or cyclic predecessors cannot become a complete claim.
    if (visiting.has(id)) return unavailable();
    const scope = byId.get(id);
    if (!scope) return unavailable();
    visiting.add(id);
    const coverage = inheritDependencyCoverage(own.get(id)!, scope.dependsOnScopeIds.map(dependencyId => ({
      name: byId.get(dependencyId)?.name ?? dependencyId,
      coverage: visit(dependencyId),
    })));
    visiting.delete(id);
    result.set(id, coverage);
    return coverage;
  };
  for (const scope of scopes) visit(scope.scopeId);
  return result;
}
