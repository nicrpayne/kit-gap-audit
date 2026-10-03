import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";

/** Scope and Orbit must render the same staged shape, including link moves. */
export function scenarioDisplayShape(scope: ProjectPayload["scopes"][number], scenario: SuiteScenario) {
  const proposalSelections = scenario.scopeProposalSelections.filter((selection) => selection.scopeId === scope.scopeId);
  const stagedWorkIds = new Set(proposalSelections.flatMap((selection) => selection.itemIds));
  const scenarioItems = [
    ...scope.items,
    ...scope.executionItems.filter((item) => (scenario.includedItemIds.has(item.id) || stagedWorkIds.has(item.id)) && !scope.items.some((baseItem) => baseItem.id === item.id)),
  ].filter((item) => !scenario.excludedItemIds.has(item.id));
  const scenarioCapabilities = scope.capabilities.map((capability) => {
    const staged = proposalSelections.filter((selection) => selection.targetCapabilityId === capability.id);
    const removedLinkIds = new Set(proposalSelections.flatMap((selection) => {
      if (selection.sourceCapabilityId !== capability.id) return [];
      if (selection.targetCapabilityId !== capability.id) return selection.itemIds;
      const selected = new Set(selection.itemIds);
      return selection.sourceAlreadyLinkedItemIds.filter((id) => !selected.has(id));
    }));
    const additionalLinks = [...new Set(staged.flatMap((selection) => selection.itemIds))]
      .filter((id) => !capability.workLinks.some((link) => link.externalId === id))
      .map((externalId) => ({ id: `proposal-link:${capability.id}:${externalId}`, provider: "linear", externalId, externalUrl: null, state: "active" }));
    return {
      ...capability,
      status: staged.at(-1)?.releaseStatus ?? (scenario.includedCapabilityIds.has(capability.id) ? "accepted" : capability.status),
      workLinks: [...capability.workLinks.filter((link) => !removedLinkIds.has(link.externalId)), ...additionalLinks],
    };
  });
  const proposalDrafts = proposalSelections.filter((selection) => !selection.targetCapabilityId)
    .map((selection) => ({ id: `proposal:${selection.itemId}`, name: selection.title, intent: selection.description ?? "Proposed from current Linear hierarchy and structured context.", itemIds: selection.itemIds }));
  const proposalBypassed = new Set(scenario.bypassedFeatureIds);
  for (const selection of proposalSelections) {
    if (selection.releaseStatus === "outside") proposalBypassed.add(selection.targetCapabilityId ? `capability:${selection.targetCapabilityId}` : `proposal:${selection.itemId}`);
  }
  return { proposalSelections, scenarioItems, scenarioCapabilities, proposalDrafts, proposalBypassed };
}
