import type { WorkItem } from "@/lib/forecast/simulate";
import { reviewedCapabilityEstimate, substituteCapabilityKnowledgeEstimates, type AcceptedCapabilityEstimate, type CapabilityKnowledgeEstimate, type ReviewedCapabilityEstimateResult } from "@/lib/scope/knowledgeEstimates";
import { reviewedEstimateSimulationDecision } from "@/lib/forecast/reviewedEstimate";
import { parseSignalEstimate, type AcceptedSignalEstimate } from "@/lib/scope/signalEstimates";

export type RemainingEstimateDrafts = Record<string, AcceptedSignalEstimate>;
interface Card {
  id: string; name: string; status: string; revision: number;
  acceptedEstimate: AcceptedCapabilityEstimate | null;
  estimateReview?: ReviewedCapabilityEstimateResult;
  knowledgeEstimates?: CapabilityKnowledgeEstimate[];
  workLinks: {externalId: string; state: string}[];
}
export function remainingEstimateCapabilities<T extends Card>(capabilities: T[], items: WorkItem[], drafts: RemainingEstimateDrafts = {}): (T & {signalScenarioEstimate?: boolean})[] {
  return capabilities.map(card => {
    if (!drafts[card.id]) return card;
    const estimate = parseSignalEstimate(drafts[card.id]);
    if (!estimate || estimate.capabilityId !== card.id || estimate.capabilityRevisionAtReview !== card.revision || card.status !== "accepted") throw new Error(`Remaining-work Scenario for ${card.name} needs review: the card changed. Clear or recreate this estimate.`);
    const linked = new Set(card.workLinks.filter(link => ["active", "configured"].includes(link.state)).map(link => link.externalId));
    const review = reviewedCapabilityEstimate(estimate, items.filter(item => linked.has(item.id)).map(item => item.id));
    if (review?.status !== "reviewed") throw new Error(`Remaining-work Scenario for ${card.name} needs review: the open tickets changed. Clear or recreate this estimate.`);
    return {...card, acceptedEstimate:estimate, estimateReview:review, signalScenarioEstimate:true};
  });
}

/** Rebuild from original ticket ranges, then replace reviewed covered work
 * exactly once. This also restores formerly covered tickets now marked extra. */
export function remainingEstimateItems(scope: {capabilities: Card[]; items: WorkItem[]; forecastItems: WorkItem[]}, drafts: RemainingEstimateDrafts = {}): WorkItem[] {
  if (!scope.capabilities.some(card => drafts[card.id])) return scope.forecastItems;
  const capabilities = remainingEstimateCapabilities(scope.capabilities, scope.items, drafts);
  const substitutions = capabilities.flatMap(card => {
    if (card.status !== "accepted" || !card.estimateReview) return [];
    const decision = reviewedEstimateSimulationDecision(card, card.estimateReview);
    return decision.substitution ? [decision.substitution] : [];
  });
  return substituteCapabilityKnowledgeEstimates(scope.items, substitutions);
}

export function remainingEstimateConflict(scopes: {capabilities: Card[]; items: WorkItem[]}[], drafts: RemainingEstimateDrafts = {}, changedTicketIds: string[] = [], knowledgeIds: string[] = []): string | null {
  try {
    const cards = scopes.flatMap(scope => scope.capabilities);
    for (const [id, estimate] of Object.entries(drafts)) {
      if (!cards.some(card => card.id === id)) return "A remaining-work Scenario refers to a missing Scope card. Clear or recreate it.";
      if (knowledgeIds.includes(id) || estimate.input.coveredOpenItemIds.some(ticket => changedTicketIds.includes(ticket))) return "A remaining-work estimate overlaps another estimate or ticket lever. Clear the overlapping experiment before continuing.";
    }
    for (const scope of scopes) remainingEstimateCapabilities(scope.capabilities, scope.items, drafts);
    return null;
  } catch(error) { return error instanceof Error ? error.message : "Review remaining-work Scenario inputs."; }
}
