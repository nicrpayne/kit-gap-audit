import assert from "node:assert/strict";
import { composeFeatures, composeScopeFeatures } from "../lib/scope/features";
import type { ShapeCapability } from "../lib/scope/productShape";
import type { ScopeWorkItem } from "../lib/instrument/useProject";

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
    rawEstimate: "20–25–30 developer days", range: { low: 20, likely: 25, high: 30 }, unit: "developer_days", basis: "remaining_capability",
    speaker: null, owner: null, observedAt: null, sourceRef: "synthetic", excerpt: "Synthetic quote", evidenceRefs: ["passage"], statement: "Synthetic estimate", confidence: null }],
};
const covered = composeScopeFeatures([item], [], [capability], 2, new Set(), { [item.id]: override }, [], new Set(), {
  cap: { estimateId: "same-object", contextSnapshotId: "snapshot-B", low: 20, likely: 25, high: 30 },
}).features[0];
assert.equal(covered.estimateBasis, "knowledge_provisional");
assert.equal(covered.range.likely, 25);
assert.equal(covered.items[0].likely, 3, "covered execution rows are Reality details, not silently effective ticket experiments");
console.log("PASS: Scenario estimate rows, aggregate and reset resolve the same range without mutating Reality.");
