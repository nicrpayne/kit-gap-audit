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
