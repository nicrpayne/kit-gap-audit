export interface BulkStageCandidate {
  id: string;
  reconciliationState: string;
  confidence: string;
  action: string;
  status: string;
  workItemIds: string[];
  alreadyLinkedItemIds: string[];
}

/**
 * Bulk staging is deliberately narrower than manual review. It is the safe,
 * mechanical path only; an operator can still open any actionable,
 * non-conflicting candidate and stage a reviewed correction by hand.
 */
export function isBulkStageEligible(item: BulkStageCandidate): boolean {
  return item.reconciliationState === "aligned"
    && item.confidence === "high"
    && item.action !== "none"
    && item.workItemIds.length > item.alreadyLinkedItemIds.length
    && item.status !== "committed";
}

export function bulkStageEligibleItems<T extends BulkStageCandidate>(items: T[], stagedItemIds: Set<string>): T[] {
  return items.filter((item) => isBulkStageEligible(item) && !stagedItemIds.has(item.id));
}
