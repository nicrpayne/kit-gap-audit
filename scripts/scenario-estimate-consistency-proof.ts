import assert from "node:assert/strict";
import { composeFeatures, composeScopeFeatures } from "../lib/scope/features";
import type { ShapeCapability } from "../lib/scope/productShape";
import type { ScopeWorkItem } from "../lib/instrument/useProject";
import { reviewCapabilityKnowledgeEstimate } from "../lib/scope/knowledgeEstimates";

const item: ScopeWorkItem = {
  id: "TEST-1", label: "Synthetic remaining work", low: 1, likely: 3, high: 7,
  estimateSource: "issue_placeholder", kind: "ticket", state: "started",
  assignee: null, points: null, quote: null, rationale: null,
  parentIdentifier: "TEST-FEATURE", parentTitle: "Synthetic feature", projectName: "Test",
};
const untouched = { ...item, id: "TEST-2" };
const override = { low: 2, likely: 6, high: 10 };
const changed = composeFeatures([item, untouched], [], 2, new Set(), { "TEST-1": override }, []);
const feature = changed.features[0];
assert.deepEqual(feature.range, { low: 3, likely: 9, high: 17 });
assert.deepEqual(
  { low: feature.items[0].low, likely: feature.items[0].likely, high: feature.items[0].high },
  override,
  "D06: row/pad must show the same Scenario range used by the feature aggregate",
);
assert.deepEqual(item, { ...item, low: 1, likely: 3, high: 7 }, "canonical input is immutable");
assert.equal(feature.items[1].likely, 3, "other items remain unchanged");
const reset = composeFeatures([item, untouched], [], 2, new Set(), {}, []);
assert.equal(reset.features[0].items[0].likely, 3);
assert.deepEqual(reset.features[0].range, { low: 2, likely: 6, high: 14 });
const capability: ShapeCapability = {
  id: "cap", name: "Synthetic feature", description: null, status: "accepted",
  workLinks: [{ id: "link", externalId: item.id, externalUrl: null, provider: "linear", state: "active" }],
  knowledgeEstimates: [{ id: "same-object", contextSnapshotId: "snapshot-B", capabilityId: "cap",
    rawEstimate: "20–25–30 developer days", rawUnit: "developer_days", rawValues: [20, 25, 30], rawShape: "three_point",
    sourceWorkMeaning: "remaining", currentness: "current", supersedes: [], supersededBy: [],
    passages: [{ id: "passage", sourceRef: "synthetic", exactQuote: "Synthetic quote", externalRef: null, sourceUrl: null, surroundingContext: null }],
    range: { low: 20, likely: 25, high: 30 }, unit: "developer_days", basis: "remaining_capability",
    speaker: null, owner: null, observedAt: null, sourceRef: "synthetic", excerpt: "Synthetic quote", evidenceRefs: ["passage"], statement: "Synthetic estimate", confidence: null }],
};
const covered = composeScopeFeatures([item], [], [capability], 2, new Set(), {}, [], new Set(), {
  cap: { estimateId: "same-object", contextSnapshotId: "snapshot-B", low: 20, likely: 25, high: 30 },
}).features[0];
assert.equal(covered.estimateBasis, "knowledge_review_required");
assert.equal(covered.range.likely, 3, "pre-v2 raw evidence must not alter a new Scenario simulation");
assert.equal(covered.activeKnowledgeEstimate, null);
assert.equal(covered.stagedKnowledgeEstimateReviewRequired?.id, "same-object", "the inert staged state remains visible for explicit review or removal");
assert.equal(covered.items[0].likely, 3, "execution rows remain Reality while the raw assumption is inert");

const candidate = capability.knowledgeEstimates![0];
const accepted = reviewCapabilityKnowledgeEstimate(candidate, {
  passageId: "passage",
  sourceWorkMeaning: "remaining",
  range: { low: 20, likely: 25, high: 30 },
  rangeOrigin: { low: "verbatim", likely: "verbatim", high: "verbatim" },
  rationale: "Synthetic reviewed remaining-work range.",
  quoteSupportsInterpretation: true,
  coveredOpenItemIds: [item.id],
  additionalOpenItemIds: [untouched.id],
  reviewerDisplayName: "Fixture reviewer",
}, {
  capabilityRevisionAtReview: 2,
  currentOpenItemIds: [item.id, untouched.id],
  reviewedAt: "2026-09-27T10:00:00.000Z",
  acceptedAt: "2026-09-27T10:00:00.000Z",
});
const reviewedCapability: ShapeCapability = {
  ...capability,
  acceptedEstimate: accepted,
  workLinks: [
    capability.workLinks[0],
    { id: "link-2", externalId: untouched.id, externalUrl: null, provider: "linear", state: "active" },
  ],
};
const reviewedFeature = composeScopeFeatures([item, untouched], [], [reviewedCapability], 2, new Set(), {}, []).features[0];
assert.equal(reviewedFeature.estimateBasis, "knowledge_accepted");
assert.deepEqual(reviewedFeature.range, { low: 21, likely: 28, high: 37 }, "reviewed range replaces covered work while additional ticket work remains once");
const newOpen = { ...item, id: "TEST-3", label: "New unclassified work" };
const driftedCapability: ShapeCapability = {
  ...reviewedCapability,
  workLinks: [...reviewedCapability.workLinks, { id: "link-3", externalId: newOpen.id, externalUrl: null, provider: "linear", state: "active" }],
};
const driftedFeature = composeScopeFeatures([item, untouched, newOpen], [], [driftedCapability], 2, new Set(), {}, []).features[0];
assert.equal(driftedFeature.estimateBasis, "knowledge_review_required");
assert.equal(driftedFeature.acceptedKnowledgeReview?.status, "review_required");
assert.deepEqual(driftedFeature.range, { low: 21, likely: 28, high: 37 }, "new unclassified work is not silently swallowed or added to the qualified prior boundary");
console.log("PASS: Scenario estimate rows, aggregate and reset resolve the same range without mutating Reality.");
