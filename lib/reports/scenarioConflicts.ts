export interface ScenarioConflictCapability {
  id: string;
  name: string;
  scopeId: string;
  /** Every simulation item owned by the capability, including an accepted
   * knowledge-estimate item when one exists. */
  workItemIds: string[];
}

export type ScenarioLeverConflictCode =
  | "ITEM_INCLUDED_AND_EXCLUDED"
  | "EXCLUDED_CAPABILITY_INCLUDED_WORK"
  | "EXCLUDED_CAPABILITY_KNOWLEDGE"
  | "EXCLUDED_CAPABILITY_STAFFING";

export interface ScenarioLeverConflict {
  code: ScenarioLeverConflictCode;
  capabilityIds: string[];
  capabilityNames: string[];
  scopeIds: string[];
  itemIds: string[];
}

export interface ScenarioLeverConflictInput {
  capabilities: ScenarioConflictCapability[];
  excludedCapabilityIds: string[];
  excludedItemIds: string[];
  includedItemIds: string[];
  knowledgeCapabilityIds: string[];
  staffingCapabilityIds: string[];
}

const unique = (values: string[]) => [...new Set(values)];

function capabilityConflict(
  code: ScenarioLeverConflictCode,
  capabilities: ScenarioConflictCapability[],
  itemIds: string[] = [],
): ScenarioLeverConflict {
  return {
    code,
    capabilityIds: unique(capabilities.map((capability) => capability.id)),
    capabilityNames: unique(capabilities.map((capability) => capability.name)),
    scopeIds: unique(capabilities.map((capability) => capability.scopeId)),
    itemIds: unique(itemIds),
  };
}

/** Contradictory inputs must be resolved by the operator, never silently
 * normalized: each staged lever may represent intentional work. */
export function findScenarioLeverConflicts(input: ScenarioLeverConflictInput): ScenarioLeverConflict[] {
  const excludedItems = new Set(input.excludedItemIds);
  const includedItems = new Set(input.includedItemIds);
  const excludedCapabilities = new Set(input.excludedCapabilityIds);
  const knowledgeCapabilities = new Set(input.knowledgeCapabilityIds);
  const staffingCapabilities = new Set(input.staffingCapabilityIds);
  const excludedOwners = input.capabilities.filter((capability) => excludedCapabilities.has(capability.id));
  const conflicts: ScenarioLeverConflict[] = [];

  const itemOverlap = unique(input.includedItemIds.filter((itemId) => excludedItems.has(itemId)));
  if (itemOverlap.length) {
    conflicts.push({
      code: "ITEM_INCLUDED_AND_EXCLUDED",
      capabilityIds: [],
      capabilityNames: [],
      scopeIds: unique(input.capabilities.filter((capability) => capability.workItemIds.some((id) => itemOverlap.includes(id))).map((capability) => capability.scopeId)),
      itemIds: itemOverlap,
    });
  }

  const excludedWithIncludedWork = excludedOwners.filter((capability) => capability.workItemIds.some((id) => includedItems.has(id)));
  if (excludedWithIncludedWork.length) {
    conflicts.push(capabilityConflict(
      "EXCLUDED_CAPABILITY_INCLUDED_WORK",
      excludedWithIncludedWork,
      excludedWithIncludedWork.flatMap((capability) => capability.workItemIds.filter((id) => includedItems.has(id))),
    ));
  }

  const excludedWithKnowledge = excludedOwners.filter((capability) => knowledgeCapabilities.has(capability.id));
  if (excludedWithKnowledge.length) conflicts.push(capabilityConflict("EXCLUDED_CAPABILITY_KNOWLEDGE", excludedWithKnowledge));

  const excludedWithStaffing = excludedOwners.filter((capability) => staffingCapabilities.has(capability.id));
  if (excludedWithStaffing.length) conflicts.push(capabilityConflict("EXCLUDED_CAPABILITY_STAFFING", excludedWithStaffing));

  return conflicts;
}

const names = (conflict: ScenarioLeverConflict) => conflict.capabilityNames.join(", ");

export function scenarioLeverConflictMessage(conflicts: ScenarioLeverConflict[]): string {
  return conflicts.map((conflict) => {
    switch (conflict.code) {
      case "ITEM_INCLUDED_AND_EXCLUDED":
        return `Work ${conflict.itemIds.join(", ")} is both included and excluded`;
      case "EXCLUDED_CAPABILITY_INCLUDED_WORK":
        return `${names(conflict)} is excluded while its work ${conflict.itemIds.join(", ")} is included`;
      case "EXCLUDED_CAPABILITY_KNOWLEDGE":
        return `${names(conflict)} is excluded but still has a staged meeting estimate`;
      case "EXCLUDED_CAPABILITY_STAFFING":
        return `${names(conflict)} is excluded but still has staged staffing`;
    }
  }).join("; ");
}

export interface ScenarioReportLeverSelection {
  excludedItemIds: readonly string[];
  includedItemIds: readonly string[];
  excludedCapabilityIds: readonly string[];
  resolvedGateIds: readonly string[];
  estimateOverrideIds: readonly string[];
  knowledgeCapabilityIds: readonly string[];
  staffingCapabilityIds: readonly string[];
  capacityOverrideScopeIds: readonly string[];
  hasCapacityPlan: boolean;
  contextSwitchCostPct: number | null;
}

export function countScenarioReportLevers(input: ScenarioReportLeverSelection): number {
  return input.excludedItemIds.length + input.includedItemIds.length + input.excludedCapabilityIds.length +
    input.resolvedGateIds.length + input.estimateOverrideIds.length + input.knowledgeCapabilityIds.length +
    input.staffingCapabilityIds.length + (input.hasCapacityPlan ? 1 : input.capacityOverrideScopeIds.length) +
    (input.contextSwitchCostPct === null ? 0 : 1);
}
