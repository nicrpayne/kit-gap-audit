import type { ProjectScope, SuiteScenario } from "@/lib/project/contracts";
import { scenarioDisplayShape } from "@/lib/scenario/displayShape";
import { reviewedEstimateSimulationDecision } from "./reviewedEstimate";

const activeLink = (state: string) => state === "active" || state === "configured";

/** Only offer genuinely unclassified current work. Accepted out/later choices,
 * pending mapping proposals and reviewed aggregate boundaries are not ours to
 * override. IDs, rather than a future 'include everything' flag, are frozen in
 * the existing shared Scenario and survive its normal save/review lifecycle. */
export function provisionalWorkCandidates(scope: ProjectScope, scenario: SuiteScenario) {
  if (!scope.capabilities.length || !["configured", "available", "current", "stale"].includes(scope.executionState)) return [];
  const shape = scenarioDisplayShape(scope, scenario);
  const classified = new Set([
    ...scope.capabilities.flatMap(card => card.workLinks.filter(link => activeLink(link.state)).map(link => link.externalId)),
    ...shape.scenarioCapabilities.flatMap(card => card.workLinks.filter(link => activeLink(link.state)).map(link => link.externalId)),
    ...shape.proposalSelections.flatMap(selection => [...selection.itemIds, ...selection.sourceAlreadyLinkedItemIds]),
    ...scenario.draftFeatures.flatMap(draft => draft.itemIds),
    ...scenario.includedItemIds, ...scenario.excludedItemIds,
    ...scope.items.map(item => item.id),
    ...scope.capabilities.flatMap(card => card.estimateReview
      ? reviewedEstimateSimulationDecision(card, card.estimateReview).review.coveredItemIds : []),
    ...Object.values(scenario.remainingEstimateByCapabilityId ?? {}).flatMap(estimate => estimate.input.coveredOpenItemIds),
  ]);
  return scope.executionItems.filter(item => !classified.has(item.id));
}

export function includeProvisionalWork(scopes: ProjectScope[], scopeId: string, scenario: SuiteScenario, itemIds: string[]): SuiteScenario {
  const scope = scopes.find(candidate => candidate.scopeId === scopeId);
  if (!scope) throw new Error("This project is no longer available. Refresh before trying this assumption.");
  const candidates = new Set(provisionalWorkCandidates(scope, scenario).map(item => item.id));
  const selected = [...new Set(itemIds)];
  if (!selected.length) throw new Error("Select at least one ticket to include in this Scenario.");
  if (selected.some(id => !candidates.has(id))) throw new Error("The ticket list changed. Review it again; no assumptions were applied.");
  if (selected.some(id => scopes.filter(row => row.executionItems.some(item => item.id === id)).length !== 1)) {
    throw new Error("A selected ticket belongs to more than one project. Resolve its ownership in Scope first.");
  }
  return { ...scenario, includedItemIds: new Set([...scenario.includedItemIds, ...selected]) };
}
