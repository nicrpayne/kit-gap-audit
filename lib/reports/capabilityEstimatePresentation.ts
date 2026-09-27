import type { FrozenCapabilityEstimate } from "./forecastBasis";

export interface CapabilityEstimatePresentation {
  estimateId: string;
  range: { low: number; likely: number; high: number } | null;
  basisLabel: string;
  sourceDate: string | null;
  originalQuote: string;
  rawAssertion: string;
  contextSnapshotId: string;
  authorityLabel: string;
  reviewRequired: boolean;
  reviewSummary: string | null;
  interpretation: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  coveredItemIds: string[];
  additionalItemIds: string[];
  usedInSimulation: boolean | null;
}

/** Defensive, additive presenter for both historical v1 records and the
 * reviewed-v2 evidence now frozen at computation time. Never reconstruct a
 * missing review boundary from current tickets. */
export function capabilityEstimatePresentation(record: FrozenCapabilityEstimate): CapabilityEstimatePresentation {
  const estimate = record.estimate;
  const normalized = "version" in estimate && estimate.version === "accepted-capability-estimate.v2"
    ? {
        estimateId: estimate.source.intelligenceObjectId,
        range: estimate.interpretation.range,
        basisLabel: estimate.interpretation.modeledBasis.replaceAll("_", " "),
        sourceDate: estimate.source.observedAt,
        originalQuote: estimate.source.exactQuote,
        rawAssertion: estimate.source.rawEstimateText,
        contextSnapshotId: estimate.source.contextSnapshotId,
      }
    : {
        estimateId: estimate.id,
        range: estimate.range,
        basisLabel: estimate.basis.replaceAll("_", " "),
        sourceDate: estimate.observedAt,
        originalQuote: estimate.excerpt ?? estimate.statement,
        rawAssertion: estimate.rawEstimate,
        contextSnapshotId: estimate.contextSnapshotId,
      };
  if (!record.review) {
    return {
      ...normalized,
      authorityLabel: record.authority.toUpperCase().replaceAll("_", " "),
      reviewRequired: false,
      reviewSummary: null,
      interpretation: null,
      reviewer: null,
      reviewedAt: null,
      coveredItemIds: [...record.replacedItemIds],
      additionalItemIds: [],
      usedInSimulation: null,
    };
  }
  return {
    ...normalized,
    authorityLabel: record.review.status === "reviewed" ? "REVIEWED" : "REVIEW REQUIRED",
    reviewRequired: record.review.status === "review_required",
    reviewSummary: record.review.status === "review_required"
      ? `${record.review.reviewRequiredReason ?? "The reviewed boundary is no longer current."} Full delivery claims are suppressed; any retained assertion is qualified exploration only.`
      : "Explicitly reviewed remaining-effort assertion and ticket boundary.",
    interpretation: record.review.interpretation,
    reviewer: record.review.reviewedBy,
    reviewedAt: record.review.reviewedAt,
    coveredItemIds: [...record.review.coveredItemIds],
    additionalItemIds: [...record.review.additionalItemIds],
    usedInSimulation: record.review.usedInSimulation,
  };
}
