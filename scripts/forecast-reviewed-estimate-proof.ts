import assert from "node:assert/strict";
import { reviewedEstimateSimulationDecision } from "../lib/forecast/reviewedEstimate";
import { capabilityEstimatePresentation } from "../lib/reports/capabilityEstimatePresentation";
import { freezeCapabilityEstimate } from "../lib/reports/forecastBasis";
import {
  reviewedCapabilityEstimate,
  estimateBoundaryFingerprint,
  substituteCapabilityKnowledgeEstimates,
  type AcceptedCapabilityEstimateV1,
  type AcceptedCapabilityEstimateV2,
  type CapabilityKnowledgeEstimate,
} from "../lib/scope/knowledgeEstimates";

const accepted: AcceptedCapabilityEstimateV2 = {
  version: "accepted-capability-estimate.v2",
  source: {
    contextSnapshotId: "snapshot-reviewed",
    intelligenceObjectId: "estimate-reviewed",
    passageId: "passage-reviewed",
    sourceRef: "refinement-2026-09-26",
    exactQuote: "The capability has about two to four developer-days remaining.",
    surroundingContext: "Explicitly discussing remaining work.",
    externalRef: null,
    sourceUrl: null,
    statement: "Two to four developer-days remain.",
    rawEstimateText: "2–4 developer-days remaining",
    rawUnit: "developer_days",
    rawValues: [2, 4],
    rawShape: "bounds",
    speaker: "Developer",
    observedAt: "2026-09-26T10:00:00.000Z",
    currentnessAtReview: "current",
    supersedes: [],
    supersededBy: [],
  },
  interpretation: {
    sourceWorkMeaning: "remaining",
    modeledBasis: "remaining_capability",
    modeledUnit: "developer_days",
    range: { low: 2, likely: 3, high: 4 },
    rangeOrigin: { low: "verbatim", likely: "operator", high: "verbatim" },
    rationale: "The quote is explicitly remaining work; the reviewer supplied the midpoint.",
    quoteSupportsInterpretation: true,
    policy: {
      progress: "manual_remaining_no_status_discount.v1",
      capacity: "pooled_effective_fte.v1",
      calendar: "calendar_days.v1",
    },
  },
  boundary: {
    capabilityId: "capability-1",
    capabilityRevisionAtReview: 7,
    coveredOpenItemIds: ["WORK-COVERED"],
    additionalOpenItemIds: ["WORK-ADDITIONAL"],
    reviewedLinkFingerprint: estimateBoundaryFingerprint("capability-1", ["WORK-COVERED"], ["WORK-ADDITIONAL"]),
    reviewedAt: "2026-09-26T11:00:00.000Z",
    boundaryStatement: null,
  },
  acceptance: {
    acceptedAt: "2026-09-26T11:00:00.000Z",
    reviewer: { id: "operator-1", displayName: "Delivery lead" },
  },
};

const currentSource: CapabilityKnowledgeEstimate[] = [{
  id: "estimate-reviewed",
  contextSnapshotId: "snapshot-reviewed",
  capabilityId: "capability-1",
  rawEstimate: "2–4 developer-days remaining",
  rawUnit: "developer_days",
  rawValues: [2, 4],
  rawShape: "bounds",
  sourceWorkMeaning: "remaining",
  currentness: "current",
  supersedes: [],
  supersededBy: [],
  passages: [{
    id: "passage-reviewed",
    sourceRef: "refinement-2026-09-26",
    exactQuote: "The capability has about two to four developer-days remaining.",
    externalRef: null,
    sourceUrl: null,
    surroundingContext: "Explicitly discussing remaining work.",
  }],
  range: null,
  unit: "unsupported",
  basis: "review_required",
  speaker: "Developer",
  owner: null,
  observedAt: "2026-09-26T10:00:00.000Z",
  sourceRef: "refinement-2026-09-26",
  excerpt: "The capability has about two to four developer-days remaining.",
  evidenceRefs: ["passage-reviewed"],
  statement: "Two to four developer-days remain.",
  confidence: null,
}];
const reviewed = reviewedCapabilityEstimate(accepted, ["WORK-COVERED", "WORK-ADDITIONAL"], currentSource);
assert(reviewed?.status === "reviewed");
const reviewedDecision = reviewedEstimateSimulationDecision({ id: "capability-1", name: "Capability one" }, reviewed);
assert(reviewedDecision.substitution);
const sourceItems = [
  { id: "WORK-COVERED", label: "Covered", low: 1, likely: 2, high: 3 },
  { id: "WORK-ADDITIONAL", label: "Additional", low: 4, likely: 5, high: 6 },
];
const reviewedItems = substituteCapabilityKnowledgeEstimates(sourceItems, [reviewedDecision.substitution]);
assert.equal(reviewedItems.some((item) => item.id === "WORK-COVERED"), false, "only reviewed covered work is replaced");
assert.equal(reviewedItems.filter((item) => item.id === "WORK-ADDITIONAL").length, 1, "additional work remains exactly once");
assert.equal(reviewedItems.length, 2, "one reviewed synthetic plus one additional ticket");

const drifted = reviewedCapabilityEstimate(accepted, ["WORK-COVERED", "WORK-ADDITIONAL", "WORK-NEW"], currentSource);
assert(drifted?.status === "review_required" && drifted.exploration);
const driftedDecision = reviewedEstimateSimulationDecision({ id: "capability-1", name: "Capability one" }, drifted);
assert.equal(driftedDecision.substitution?.authority, "review_required");
const driftedItems = substituteCapabilityKnowledgeEstimates([...sourceItems, { id: "WORK-NEW", label: "New", low: 1, likely: 1, high: 2 }], [driftedDecision.substitution!]);
assert.equal(driftedItems.filter((item) => item.id === "WORK-ADDITIONAL").length, 1);
assert.equal(driftedItems.filter((item) => item.id === "WORK-NEW").length, 1, "unclassified new work remains visible beside qualified exploration");

const superseded = reviewedCapabilityEstimate(accepted, ["WORK-COVERED", "WORK-ADDITIONAL"], [{
  ...currentSource[0],
  id: "estimate-successor",
  currentness: "current",
  supersedes: [{ contextSnapshotId: "snapshot-reviewed", intelligenceObjectId: "estimate-reviewed" }],
  supersededBy: [],
}]);
assert(superseded?.status === "review_required");
assert.match(superseded.reviewRequiredReason, /superseded/i);

const missingFromLatestSnapshot = reviewedCapabilityEstimate(accepted, ["WORK-COVERED", "WORK-ADDITIONAL"], []);
assert(missingFromLatestSnapshot?.status === "review_required");
assert.match(missingFromLatestSnapshot.reviewRequiredReason, /no longer contains/i,
  "an accepted source omitted by the latest snapshot cannot remain canonical indefinitely");

const sameIdChangedSource = structuredClone(currentSource[0]);
sameIdChangedSource.contextSnapshotId = "snapshot-later";
sameIdChangedSource.rawEstimate = "9 developer-days remaining";
sameIdChangedSource.rawValues = [9];
sameIdChangedSource.rawShape = "single";
sameIdChangedSource.passages[0].exactQuote = "A later snapshot reuses the object ID but changes the assertion.";
const changedSource = reviewedCapabilityEstimate(accepted, ["WORK-COVERED", "WORK-ADDITIONAL"], [sameIdChangedSource]);
assert(changedSource?.status === "review_required");
assert.match(changedSource.reviewRequiredReason, /changed the accepted source assertion/i,
  "intelligence object IDs are not content identities across immutable snapshots");

const historicalAtReview: AcceptedCapabilityEstimateV2 = structuredClone(accepted);
historicalAtReview.source.currentnessAtReview = "historical";
const historical = reviewedCapabilityEstimate(historicalAtReview, ["WORK-COVERED", "WORK-ADDITIONAL"]);
assert(historical?.status === "review_required", "a source already historical at review cannot become publishable");

const legacy: AcceptedCapabilityEstimateV1 = {
  id: "legacy-estimate", contextSnapshotId: "legacy-snapshot", capabilityId: "capability-1",
  rawEstimate: "3 days", range: { low: 2, likely: 3, high: 4 }, unit: "developer_days",
  basis: "remaining_capability", speaker: null, owner: null, observedAt: null,
  sourceRef: "legacy-ref", excerpt: "three days", evidenceRefs: ["legacy-passage"],
  statement: "three days", confidence: null, acceptedAt: "2026-09-20T00:00:00.000Z", acceptedBy: "operator",
};
const legacyReview = reviewedCapabilityEstimate(legacy, ["WORK-COVERED", "WORK-ADDITIONAL"]);
assert(legacyReview?.status === "review_required" && !legacyReview.exploration);
const legacyDecision = reviewedEstimateSimulationDecision({ id: "capability-1", name: "Capability one" }, legacyReview);
assert.equal(legacyDecision.substitution, null, "legacy assertions cannot silently replace the ticket rollup");
const invalidReview = reviewedCapabilityEstimate({ version: "accepted-capability-estimate.v2", source: {} }, ["WORK-COVERED"]);
assert(invalidReview?.status === "review_required" && invalidReview.estimate === null);
const invalidDecision = reviewedEstimateSimulationDecision({ id: "capability-1", name: "Capability one" }, invalidReview);
assert.equal(invalidDecision.substitution, null, "malformed persisted assertions cannot silently become ticket-rollup or synthetic estimate authority");
assert.equal(invalidDecision.review.usedInSimulation, false);

const frozen = freezeCapabilityEstimate(
  "scope-1",
  { id: "capability-1", name: "Capability one", revision: 7 },
  accepted,
  reviewedDecision.review.coveredItemIds,
  "reviewed",
  reviewedDecision.review,
);
accepted.source.exactQuote = "mutated later";
accepted.boundary.coveredOpenItemIds.push("MUTATED");
assert("version" in frozen.estimate && frozen.estimate.version === "accepted-capability-estimate.v2");
assert.equal(frozen.estimate.source.exactQuote, "The capability has about two to four developer-days remaining.");
assert.deepEqual(frozen.review?.coveredItemIds, ["WORK-COVERED"]);
assert.deepEqual(frozen.review?.additionalItemIds, ["WORK-ADDITIONAL"]);
const presented = capabilityEstimatePresentation(frozen);
assert.equal(presented.authorityLabel, "REVIEWED");
assert.equal(presented.interpretation, "The quote is explicitly remaining work; the reviewer supplied the midpoint.");
assert.equal(presented.reviewer, "Delivery lead");
assert.equal(presented.originalQuote, "The capability has about two to four developer-days remaining.");
assert.equal(presented.rawAssertion, "2–4 developer-days remaining");

console.log("PASS: reviewed-v2 estimates replace only covered work, preserve additional work once, qualify drift, suppress legacy claims, and freeze exact review evidence.");
