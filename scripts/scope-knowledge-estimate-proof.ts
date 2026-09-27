import assert from "node:assert/strict";
import type { ProjectContextPackage } from "../lib/context/package";
import {
  acceptCapabilityKnowledgeEstimate,
  acceptedCapabilityEstimate,
  acceptedEstimateIdentity,
  auditPassageHref,
  capabilityKnowledgeEstimates,
  estimateBoundaryFingerprint,
  knowledgeEstimateItemId,
  reviewCapabilityKnowledgeEstimate,
  reviewedCapabilityEstimate,
  safeSourceUrl,
  substituteCapabilityKnowledgeEstimates,
  type AcceptedCapabilityEstimateV1,
} from "../lib/scope/knowledgeEstimates";

const pkg: ProjectContextPackage = {
  version: "1.1",
  packageId: "knowledge-estimate-review-proof",
  producer: "hermes",
  generatedAt: "2026-09-23T12:00:00.000Z",
  scopeId: "jsa",
  sources: [{
    sourceType: "transcript",
    sourceRef: "synthetic-refinement-fixture",
    registrationId: null,
    role: "estimate_evidence",
    status: "candidate",
    observedAt: "2026-09-22T00:00:00.000Z",
    succeeded: true,
    detail: null,
  }],
  evidence: [{
    id: "ev-context",
    sourceRef: "synthetic-refinement-fixture",
    kind: "passage",
    excerpt: "The team discussed notification scope before giving an estimate.",
  }, {
    id: "ev-exact",
    sourceRef: "synthetic-refinement-fixture",
    kind: "passage",
    excerpt: "The notification feed is bounded between eight and thirteen developer days.",
    externalRef: "https://example.test/transcript#estimate",
    data: { speaker: "Fixture speaker", meetingDate: "2026-09-22", surroundingContext: "Synthetic surrounding context." },
  }, {
    id: "ev-historical",
    sourceRef: "synthetic-refinement-fixture",
    kind: "passage",
    excerpt: "An earlier pass put the work between twenty and thirty developer days.",
  }],
  intelligenceObjects: [{
    id: "estimate-current",
    intelligenceType: "Commitment",
    trust: "external_intelligence",
    statement: "A synthetic notification estimate was recorded.",
    isCurrent: true,
    observedDate: "2026-09-22",
    evidenceRefs: ["ev-context", "ev-exact"],
    fields: {
      capability_id: "notifications",
      duration_stated: "8–13 developer days",
      owner: "Fixture owner",
    },
    provenance: { confidence: "medium" },
  }, {
    id: "estimate-historical",
    intelligenceType: "Observation",
    trust: "external_intelligence",
    statement: "A synthetic historical estimate was recorded.",
    isCurrent: false,
    evidenceRefs: ["ev-historical"],
    fields: { capability_id: "notifications", estimate_range: "20–30 developer days" },
  }],
  intelligenceRelations: [{
    from: "estimate-current",
    rel: "supersedes",
    to: "estimate-historical",
    relClass: "temporal",
  }],
  completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
  warnings: [],
};

const estimates = capabilityKnowledgeEstimates(pkg, "snapshot-1", [{ id: "notifications", name: "Notifications" }]);
assert.equal(estimates.length, 2, "current and historical evidence remain inspectable");
const current = estimates.find((estimate) => estimate.id === "estimate-current")!;
const historical = estimates.find((estimate) => estimate.id === "estimate-historical")!;
assert.equal(current.currentness, "current");
assert.equal(historical.currentness, "historical");
assert.deepEqual(current.rawValues, [8, 13]);
assert.equal(current.rawShape, "bounds");
assert.equal(current.rawUnit, "developer_days");
assert.equal(current.sourceWorkMeaning, "unknown", "remaining versus total is never inferred from prose");
assert.equal(current.range, null, "two bounds must not acquire an invented midpoint");
assert.deepEqual(current.supersedes.map((ref) => ref.intelligenceObjectId), ["estimate-historical"]);
assert.deepEqual(historical.supersededBy.map((ref) => ref.intelligenceObjectId), ["estimate-current"]);
assert.equal(current.passages.length, 2, "all exact candidate passages remain available for explicit selection");
assert.equal(auditPassageHref("jsa", current), "/audit?project=jsa&select=passage%3Asnapshot-1%3Aev-context");
const sprintPackage = structuredClone(pkg);
sprintPackage.intelligenceObjects = [{
  ...sprintPackage.intelligenceObjects![0],
  id: "estimate-sprints",
  fields: { capability_id: "notifications", duration_stated: "3 sprints" },
}];
sprintPackage.intelligenceRelations = [];
const sprintEvidence = capabilityKnowledgeEstimates(sprintPackage, "snapshot-sprint", [{ id: "notifications", name: "Notifications" }])[0];
assert.equal(sprintEvidence.rawUnit, "sprints");
assert.equal(sprintEvidence.rawShape, "single");
assert.equal(sprintEvidence.range, null, "sprints remain evidence and are never converted to developer-days");

assert.throws(() => reviewCapabilityKnowledgeEstimate(current, {
  passageId: "ev-exact",
  sourceWorkMeaning: "remaining",
  range: { low: 8, likely: 10.5, high: 13 },
  rangeOrigin: { low: "verbatim", likely: "operator", high: "verbatim" },
  rationale: "",
  quoteSupportsInterpretation: true,
  coveredOpenItemIds: ["SOF-1"],
  additionalOpenItemIds: ["SOF-2"],
  reviewerDisplayName: "Fixture reviewer",
}, { capabilityRevisionAtReview: 4, currentOpenItemIds: ["SOF-1", "SOF-2"] }), /Explain how/, "a range cannot be accepted without rationale");
assert.throws(() => reviewCapabilityKnowledgeEstimate(current, {
  passageId: "ev-exact",
  sourceWorkMeaning: "remaining",
  range: { low: 8, likely: 10.5, high: 13 },
  rangeOrigin: { low: "verbatim", likely: "verbatim", high: "verbatim" },
  rationale: "Synthetic invalid verbatim claim.",
  quoteSupportsInterpretation: true,
  coveredOpenItemIds: ["SOF-1"],
  additionalOpenItemIds: ["SOF-2"],
  reviewerDisplayName: "Fixture reviewer",
}, { capabilityRevisionAtReview: 4, currentOpenItemIds: ["SOF-1", "SOF-2"] }), /likely cannot be marked verbatim/, "point provenance cannot claim a value the source did not state");

const reviewed = reviewCapabilityKnowledgeEstimate(current, {
  passageId: "ev-exact",
  sourceWorkMeaning: "total",
  range: { low: 7, likely: 9, high: 12 },
  rangeOrigin: { low: "operator", likely: "operator", high: "operator" },
  rationale: "Fixture reviewer supplied a separate remaining-effort range; no progress percentage or unit conversion was applied.",
  quoteSupportsInterpretation: true,
  coveredOpenItemIds: ["SOF-1"],
  additionalOpenItemIds: ["SOF-2"],
  reviewerDisplayName: "Fixture reviewer",
}, {
  capabilityRevisionAtReview: 4,
  currentOpenItemIds: ["SOF-2", "SOF-1"],
  reviewedAt: "2026-09-24T12:00:00.000Z",
  acceptedAt: "2026-09-24T12:00:00.000Z",
});

assert.equal(reviewed.source.passageId, "ev-exact", "the selected supporting passage—not the first reference—is frozen");
assert.equal(reviewed.source.exactQuote, pkg.evidence[1].excerpt);
assert.deepEqual(reviewed.source.rawValues, [8, 13]);
assert.equal(reviewed.source.rawShape, "bounds");
assert.equal(reviewed.source.declaredWorkMeaningAtReview, "unknown");
assert.equal(reviewed.interpretation.sourceWorkMeaning, "total");
assert.deepEqual(reviewed.interpretation.range, { low: 7, likely: 9, high: 12 });
assert.deepEqual(reviewed.boundary.coveredOpenItemIds, ["SOF-1"]);
assert.deepEqual(reviewed.boundary.additionalOpenItemIds, ["SOF-2"]);
assert.equal(reviewed.boundary.reviewedLinkFingerprint, estimateBoundaryFingerprint("notifications", ["SOF-1"], ["SOF-2"]));
assert.equal(reviewed.acceptance.reviewer.id, null);
assert.equal(reviewed.acceptance.reviewer.displayName, "Fixture reviewer");
assert.equal(auditPassageHref("jsa", reviewed), "/audit?project=jsa&select=passage%3Asnapshot-1%3Aev-exact");
assert.deepEqual(acceptedCapabilityEstimate(structuredClone(reviewed)), reviewed, "v2 JSON round-trips without reconstructing source or review data");

const usable = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2"], estimates);
assert.equal(usable?.status, "reviewed");
assert.equal(usable?.publishable, true);
if (usable?.status === "reviewed") {
  assert.deepEqual(usable.coveredItemIds, ["SOF-1"]);
  assert.deepEqual(usable.additionalItemIds, ["SOF-2"]);
}

const linkedDrift = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2", "SOF-3"], estimates);
assert.equal(linkedDrift?.status, "review_required");
if (linkedDrift?.status === "review_required") {
  assert.equal(linkedDrift.publishable, false);
  assert.deepEqual(linkedDrift.exploration?.range, reviewed.interpretation.range, "v2 carries only a qualified prior exploration");
  assert.match(linkedDrift.reviewRequiredReason, /new open item/);
}
const completionDrift = reviewedCapabilityEstimate(reviewed, ["SOF-2"], estimates);
assert.equal(completionDrift?.status, "review_required", "completed or removed covered work forces re-review");
const missingAcceptedSource = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2"], []);
assert.equal(missingAcceptedSource?.status, "review_required", "a supplied latest snapshot missing the accepted source fails closed");
if (missingAcceptedSource?.status === "review_required") assert.match(missingAcceptedSource.reviewRequiredReason, /no longer contains/);

const sameIdChangedAssertion = {
  ...current,
  contextSnapshotId: "snapshot-2",
  rawEstimate: "13–21 developer days",
  rawValues: [13, 21],
  passages: current.passages.map((passage) => passage.id === reviewed.source.passageId
    ? { ...passage, exactQuote: "The latest estimate is thirteen to twenty-one developer days." }
    : passage),
};
const sourceContentDrift = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2"], [sameIdChangedAssertion]);
assert.equal(sourceContentDrift?.status, "review_required", "reusing an object ID cannot hide changed raw values or quote text");
if (sourceContentDrift?.status === "review_required") assert.match(sourceContentDrift.reviewRequiredReason, /changed the accepted source assertion/);
const sameIdChangedMeaning = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2"], [{
  ...current,
  contextSnapshotId: "snapshot-2",
  sourceWorkMeaning: "remaining",
}]);
assert.equal(sameIdChangedMeaning?.status, "review_required", "changed structured remaining-vs-total meaning requires re-review");

const laterSuccessor = {
  ...current,
  id: "estimate-next",
  supersedes: [{ contextSnapshotId: "snapshot-2", intelligenceObjectId: "estimate-current" }],
  supersededBy: [],
};
const superseded = reviewedCapabilityEstimate(reviewed, ["SOF-1", "SOF-2"], [current, laterSuccessor]);
assert.equal(superseded?.status, "review_required", "a new explicit successor blocks a publishable forecast");

const legacyCandidate = {
  ...current,
  rawEstimate: "8–10–13 developer days",
  rawValues: [8, 10, 13],
  rawShape: "three_point" as const,
  sourceWorkMeaning: "remaining" as const,
  range: { low: 8, likely: 10, high: 13 },
  unit: "developer_days" as const,
  basis: "remaining_capability" as const,
};
const legacy = acceptCapabilityKnowledgeEstimate(legacyCandidate, "2026-09-24T12:00:00.000Z");
const parsedLegacy = acceptedCapabilityEstimate(structuredClone(legacy)) as AcceptedCapabilityEstimateV1;
assert.deepEqual(parsedLegacy, legacy);
const legacyStatus = reviewedCapabilityEstimate(legacy, ["SOF-1", "SOF-2"]);
assert.equal(legacyStatus?.status, "review_required");
if (legacyStatus?.status === "review_required") assert.equal(legacyStatus.exploration, undefined, "legacy has no reviewed boundary to simulate");

const invalidStoredStatus = reviewedCapabilityEstimate({
  version: "accepted-capability-estimate.v2",
  source: { contextSnapshotId: "snapshot-corrupt" },
}, ["SOF-1", "SOF-2"], estimates);
assert.equal(invalidStoredStatus?.status, "review_required", "a present but malformed accepted assertion must fail closed");
if (invalidStoredStatus?.status === "review_required") {
  assert.equal(invalidStoredStatus.estimate, null);
  assert.equal(invalidStoredStatus.invalidStoredAssertion, true);
  assert.equal(invalidStoredStatus.exploration, undefined, "malformed persisted JSON cannot invent a carry-forward range");
  assert.match(invalidStoredStatus.reviewRequiredReason, /malformed or unsupported/);
}
assert.equal(reviewedCapabilityEstimate(null, ["SOF-1", "SOF-2"], estimates), null, "an actually absent accepted assertion remains normal");

const substituted = substituteCapabilityKnowledgeEstimates([
  { id: "SOF-1", label: "Covered ticket", low: 1, likely: 3, high: 7 },
  { id: "SOF-2", label: "Additional ticket", low: 2, likely: 4, high: 8 },
], [{
  capabilityId: "notifications",
  capabilityName: "Notifications",
  estimateId: acceptedEstimateIdentity(reviewed).estimateId,
  contextSnapshotId: acceptedEstimateIdentity(reviewed).contextSnapshotId,
  range: reviewed.interpretation.range,
  replacedItemIds: reviewed.boundary.coveredOpenItemIds,
  authority: "reviewed",
}]);
assert.equal(substituted.length, 2, "only covered work is replaced; additional work remains exactly once");
assert.ok(substituted.some((item) => item.id === "SOF-2"));
assert.equal(substituted.find((item) => item.id.startsWith("knowledge-estimate:"))?.label, "Notifications · reviewed remaining-work estimate");

assert.notEqual(knowledgeEstimateItemId("notifications", "same-object", "snapshot-A"), knowledgeEstimateItemId("notifications", "same-object", "snapshot-B"));
assert.equal(safeSourceUrl("javascript:alert(1)"), null);
assert.equal(safeSourceUrl("https://secret:token@example.test/meeting"), null);
assert.equal(acceptedCapabilityEstimate({ ...reviewed, boundary: { ...reviewed.boundary, coveredOpenItemIds: ["SOF-1", "SOF-1"] } }), null, "non-canonical boundaries fail closed");

console.log("Scope accepted-estimate v2 proof passed: raw source shape is preserved, review is explicit, boundaries are exact, and drift stays qualified/non-publishable.");
