import assert from "node:assert/strict";
import type { ProjectContextPackage } from "../lib/context/package";
import {
  acceptCapabilityKnowledgeEstimate,
  acceptedCapabilityEstimate,
  capabilityKnowledgeEstimates,
  substituteCapabilityKnowledgeEstimates,
} from "../lib/scope/knowledgeEstimates";

const pkg: ProjectContextPackage = {
  version: "1.1",
  packageId: "knowledge-estimate-proof",
  producer: "hermes",
  generatedAt: "2026-09-23T12:00:00.000Z",
  scopeId: "jsa",
  sources: [{
    sourceType: "transcript",
    sourceRef: "refinement-2026-09-22",
    registrationId: null,
    role: "hermes_intelligence_evidence",
    status: "candidate",
    observedAt: "2026-09-22T00:00:00.000Z",
    succeeded: true,
    detail: null,
  }],
  evidence: [{
    id: "ev-notifications",
    sourceRef: "refinement-2026-09-22",
    kind: "passage",
    excerpt: "The in-app notification feed should take eight to thirteen developer days.",
    data: { speaker: "James", meetingDate: "2026-09-22" },
  }, {
    id: "ev-offline",
    sourceRef: "refinement-2026-09-22",
    kind: "passage",
    excerpt: "Offline is probably three sprints.",
    data: { speaker: "Pancho", meetingDate: "2026-09-22" },
  }],
  intelligenceObjects: [{
    id: "hermes:estimate-notifications",
    intelligenceType: "Commitment",
    trust: "external_intelligence",
    statement: "JSA notifications is estimated for the remaining capability.",
    isCurrent: true,
    observedDate: "2026-09-22",
    evidenceRefs: ["ev-notifications"],
    fields: {
      capability_name: "JSA notifications",
      duration_stated: "8–13 developer days",
      owner: "James",
    },
    provenance: { confidence: "medium" },
  }, {
    id: "hermes:estimate-offline",
    intelligenceType: "Observation",
    trust: "external_intelligence",
    statement: "Offline support is roughly three sprints.",
    isCurrent: true,
    observedDate: "2026-09-22",
    evidenceRefs: ["ev-offline"],
    fields: {
      capability_name: "Offline support",
      estimate_range: "3 sprints",
      speaker_or_actor: "Pancho",
    },
  }, {
    id: "hermes:stale-estimate",
    intelligenceType: "Observation",
    trust: "external_intelligence",
    statement: "JSA notifications used to be larger.",
    isCurrent: false,
    fields: { capability_name: "JSA notifications", estimate_range: "20–30 developer days" },
  }, {
    id: "hermes:unmatched-estimate",
    intelligenceType: "Observation",
    trust: "external_intelligence",
    statement: "Maps is five to eight developer days.",
    isCurrent: true,
    fields: { estimate_range: "5–8 developer days" },
  }],
  completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
  warnings: [],
};

const estimates = capabilityKnowledgeEstimates(pkg, "snapshot-1", [
  { id: "notifications", name: "JSA notifications" },
  { id: "offline", name: "Offline support" },
]);

assert.equal(estimates.length, 2, "only current estimates attached to exact capabilities should arrive");
const notifications = estimates.find((estimate) => estimate.capabilityId === "notifications");
assert.deepEqual(notifications?.range, { low: 8, likely: 10.5, high: 13 });
assert.equal(notifications?.speaker, "James");
assert.equal(notifications?.sourceRef, "refinement-2026-09-22");
assert.equal(notifications?.contextSnapshotId, "snapshot-1");

const offline = estimates.find((estimate) => estimate.capabilityId === "offline");
assert.equal(offline?.range, null, "sprints must remain evidence; Signal cannot invent a dev-day conversion");
assert.equal(offline?.rawEstimate, "3 sprints");

const substituted = substituteCapabilityKnowledgeEstimates([
  { id: "SOF-1", label: "Notification ticket one", low: 1, likely: 3, high: 7 },
  { id: "SOF-2", label: "Notification ticket two", low: 2, likely: 4, high: 8 },
  { id: "SOF-3", label: "Unrelated ticket", low: 1, likely: 2, high: 3 },
], [{
  capabilityId: "notifications",
  capabilityName: "JSA notifications",
  estimateId: notifications!.id,
  range: notifications!.range!,
  replacedItemIds: ["SOF-1", "SOF-2"],
}]);

assert.equal(substituted.length, 2, "the capability estimate must replace, never add on top of, its ticket rollup");
assert.ok(substituted.some((item) => item.id === "SOF-3"));
assert.deepEqual(substituted.find((item) => item.id.startsWith("knowledge-estimate:")), {
  id: "knowledge-estimate:notifications:hermes:estimate-notifications",
  label: "JSA notifications · provisional meeting estimate",
  estimateSource: "knowledge",
  low: 8,
  likely: 10.5,
  high: 13,
});

const accepted = acceptCapabilityKnowledgeEstimate(notifications!, "2026-09-24T12:00:00.000Z");
assert.deepEqual(acceptedCapabilityEstimate(JSON.parse(JSON.stringify(accepted))), accepted, "accepted Reality must retain the complete source assertion");
assert.equal(acceptedCapabilityEstimate({ ...accepted, range: { low: 20, likely: 5, high: 30 } }), null, "invalid Reality estimate ranges must fail closed");

const canonical = substituteCapabilityKnowledgeEstimates([
  { id: "SOF-1", label: "Notification ticket one", low: 1, likely: 3, high: 7 },
  { id: "SOF-2", label: "Notification ticket two", low: 2, likely: 4, high: 8 },
], [{
  capabilityId: "notifications",
  capabilityName: "JSA notifications",
  estimateId: accepted.id,
  range: accepted.range,
  replacedItemIds: ["SOF-1", "SOF-2"],
  authority: "accepted",
}]);
assert.equal(canonical.length, 1, "accepted estimate must replace every mapped ticket exactly once");
assert.equal(canonical[0].label, "JSA notifications · accepted meeting estimate");
assert.equal("estimateSource" in canonical[0] ? canonical[0].estimateSource : null, "knowledge");

const provisionalOverReality = substituteCapabilityKnowledgeEstimates(canonical, [{
  capabilityId: "notifications",
  capabilityName: "JSA notifications",
  estimateId: "newer-meeting-estimate",
  range: { low: 6, likely: 8, high: 10 },
  replacedItemIds: [canonical[0].id, "SOF-1", "SOF-2"],
  authority: "provisional",
}]);
assert.equal(provisionalOverReality.length, 1, "Scenario estimate must replace accepted Reality rather than stack on it");
assert.equal(provisionalOverReality[0].likely, 8);

console.log("Scope knowledge estimate proof passed: provenance retained, unsupported units fenced, and Scenario/Reality substitutions do not double count.");
