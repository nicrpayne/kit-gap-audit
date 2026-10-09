/** Simulation rows can replace several tickets with one reviewed estimate.
 * Explain source work and model rows separately instead of double-counting. */
export function scenarioWorkExplanation(input: {
  executionItemIds: string[];
  excludedItemIds: string[];
  includedItemIds: string[];
  excludedCapabilityWorkIds: string[];
}): string[] {
  const execution = new Set(input.executionItemIds);
  const removed = new Set([...input.excludedItemIds, ...input.excludedCapabilityWorkIds].filter(id => execution.has(id)));
  const added = new Set(input.includedItemIds.filter(id => execution.has(id)));
  const modelOnly = new Set(input.excludedItemIds.filter(id => !execution.has(id)));
  return [
    ...(removed.size ? [`Removed ${removed.size} tracked execution item${removed.size === 1 ? "" : "s"} from the hypothetical release.`] : []),
    ...(added.size ? [`Added ${added.size} mapped execution item${added.size === 1 ? "" : "s"}.`] : []),
    ...(modelOnly.size ? [`Excluded ${modelOnly.size} modeled estimate or finding input${modelOnly.size === 1 ? "" : "s"}; these are not additional tickets.`] : []),
  ];
}

/** Count source records represented in one project's exact simulated basis.
 * A zero-day source ticket is still a ticket; a synthetic aggregate is not an
 * extra ticket. Applied aggregates retain their distinct covered source IDs. */
export function countModeledSourceWork(input: {
  scopeId: string;
  modeledItemIds: string[];
  sourceItems: { id: string; kind: string }[];
  appliedCapabilityEstimates: {
    scopeId: string;
    replacedItemIds: string[];
    review?: { usedInSimulation: boolean };
  }[];
}): { remainingIssueCount: number; unticketedFindingCount: number } {
  const represented = new Set(input.modeledItemIds);
  for (const estimate of input.appliedCapabilityEstimates) {
    if (estimate.scopeId !== input.scopeId || estimate.review?.usedInSimulation === false) continue;
    for (const id of estimate.replacedItemIds) represented.add(id);
  }
  const count = (kind: string) => new Set(input.sourceItems
    .filter(item => item.kind === kind && represented.has(item.id))
    .map(item => item.id)).size;
  return { remainingIssueCount: count("ticket"), unticketedFindingCount: count("finding") };
}
