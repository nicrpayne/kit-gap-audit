import type { ProjectScope, SuiteScenario } from "@/lib/instrument/useProject";
import { acceptedEstimateIdentity, knowledgeEstimateItemId } from "@/lib/scope/knowledgeEstimates";
import { remainingEstimateItems } from "./remainingEstimates";

/** One selected/ranged work list for the live simulation and its coverage
 * contract. An empty or all-zero list must not acquire a delivery claim. */
export function scenarioWorkItems(scope: ProjectScope, scenario: SuiteScenario) {
  const sourceItemIds = new Set(scope.items.map(item => item.id));
  const proposed = scenario.scopeProposalSelections.filter(selection => selection.scopeId === scope.scopeId);
  const proposalIncludedIds = new Set(proposed.flatMap(selection => selection.itemIds));
  const proposalExcludedIds = new Set(proposed.flatMap(selection => {
    const selected = new Set(selection.itemIds);
    const deselected = selection.sourceCapabilityId && selection.sourceCapabilityId === selection.targetCapabilityId
      ? selection.sourceAlreadyLinkedItemIds.filter(id => !selected.has(id)) : [];
    if (selection.releaseStatus !== "outside") return deselected;
    return [...deselected, ...selection.itemIds, ...(selection.targetCapabilityId
      ? scope.capabilities.find(capability => capability.id === selection.targetCapabilityId)?.workLinks.map(link => link.externalId) ?? [] : [])];
  }));
  const bypassedIds = new Set(scope.capabilities
    .filter(capability => scenario.bypassedFeatureIds.has(`capability:${capability.id}`))
    .flatMap(capability => [
      ...capability.workLinks.filter(link => ["active", "configured"].includes(link.state) && sourceItemIds.has(link.externalId)).map(link => link.externalId),
      ...(capability.estimateReview?.estimate && (capability.estimateReview.status === "reviewed" || capability.estimateReview.exploration)
        ? (() => { const identity = acceptedEstimateIdentity(capability.estimateReview.estimate); return [knowledgeEstimateItemId(capability.id, identity.estimateId, identity.contextSnapshotId)]; })() : []),
    ]));
  // Legacy test/read-model callers may lack forecastItems. Production sends
  // it explicitly, including [] when no work is selected.
  const modeled = remainingEstimateItems({...scope, forecastItems: scope.forecastItems ?? scope.items}, scenario.remainingEstimateByCapabilityId);
  return [
    ...modeled,
    ...scope.executionItems.filter(item => (scenario.includedItemIds.has(item.id) || proposalIncludedIds.has(item.id))
      && !(scope.forecastItems ?? scope.items).some(base => base.id === item.id)),
  ].filter(item => !scenario.excludedItemIds.has(item.id) && !proposalExcludedIds.has(item.id) && !bypassedIds.has(item.id))
    .map(item => scenario.estimateOverrideByItemId[item.id] ? {...item, ...scenario.estimateOverrideByItemId[item.id]} : item);
}
