import type { FrozenCapabilityEstimate } from "@/lib/reports/forecastBasis";
import {
  acceptedEstimateIdentity,
  type KnowledgeEstimateSubstitution,
  type ReviewedCapabilityEstimateResult,
} from "@/lib/scope/knowledgeEstimates";

export interface ReviewedEstimateSimulationDecision {
  substitution: KnowledgeEstimateSubstitution | null;
  review: NonNullable<FrozenCapabilityEstimate["review"]>;
}

/** Turns the normalized review result into one simulation substitution. The
 * only removable IDs are the operator-reviewed covered IDs; additional IDs
 * remain ordinary ticket estimates and therefore cannot be double counted. */
export function reviewedEstimateSimulationDecision(
  capability: { id: string; name: string },
  result: Exclude<ReviewedCapabilityEstimateResult, null>,
): ReviewedEstimateSimulationDecision {
  if (!result.estimate) {
    return {
      substitution: null,
      review: {
        status: "review_required",
        interpretation: null,
        reviewedBy: null,
        reviewedAt: null,
        coveredItemIds: [],
        additionalItemIds: [],
        usedInSimulation: false,
        reviewRequiredReason: result.status === "review_required"
          ? result.reviewRequiredReason
          : "The stored accepted estimate is unavailable for simulation.",
      },
    };
  }
  const identity = acceptedEstimateIdentity(result.estimate);
  const reviewedV2 = result.estimate.version === "accepted-capability-estimate.v2" ? result.estimate : null;
  const boundary = result.status === "reviewed" ? result : result.exploration;
  const usedInSimulation = Boolean(boundary);
  return {
    substitution: boundary ? {
      capabilityId: capability.id,
      capabilityName: capability.name,
      estimateId: identity.estimateId,
      contextSnapshotId: identity.contextSnapshotId,
      range: boundary.range,
      replacedItemIds: [...boundary.coveredItemIds],
      authority: result.status,
    } : null,
    review: {
      status: result.status,
      interpretation: reviewedV2?.interpretation.rationale ?? null,
      reviewedBy: reviewedV2?.acceptance.reviewer.displayName ?? null,
      reviewedAt: reviewedV2?.boundary.reviewedAt ?? null,
      coveredItemIds: boundary ? [...boundary.coveredItemIds] : [],
      additionalItemIds: boundary ? [...boundary.additionalItemIds] : [],
      usedInSimulation,
      reviewRequiredReason: result.status === "review_required" ? result.reviewRequiredReason : null,
    },
  };
}
