import {
  ambiguousScenarioItemLeverMessage,
  findAmbiguousScenarioItemLevers,
  type ScenarioItemLeverSelection,
} from "@/lib/scenario/itemLeverScope";

export interface ScenarioPreviewRefusal {
  code: "ambiguous_item_ownership";
  message: string;
  action: string;
  itemIds: string[];
}

/**
 * A Scenario is one atomic hypothetical. If an old bare item id resolves to
 * multiple projects, no consumer may show the unambiguous parts as though
 * they ran while quietly falling back to Reality for the rest.
 */
export function scenarioPreviewRefusal(
  input: ScenarioItemLeverSelection,
): ScenarioPreviewRefusal | null {
  const ambiguous = findAmbiguousScenarioItemLevers(input);
  if (ambiguous.length === 0) return null;
  return {
    code: "ambiguous_item_ownership",
    message: `Scenario work-item controls are ambiguous: ${ambiguousScenarioItemLeverMessage(ambiguous)}. The same ticket cannot be changed across multiple projects by an unscoped control.`,
    action: "Return to Reality, remove the overlapping execution ownership in Scope, then recreate the Scenario.",
    itemIds: ambiguous.map((item) => item.itemId),
  };
}
