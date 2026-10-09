import assert from "node:assert/strict";
import { composeScopeFeatures } from "../lib/scope/features";
import { capabilityReleaseLoadDelta } from "../lib/scope/releaseImpact";
import { makeSignalEstimate } from "../lib/scope/signalEstimates";
import type { ShapeCapability } from "../lib/scope/productShape";
import type { ScopeWorkItem } from "../lib/instrument/useProject";

const ticket: ScopeWorkItem = { id: "TEST-1", label: "Fictional optional work", low: 1, likely: 3, high: 7, estimateSource: "issue_placeholder", kind: "ticket", state: "started", assignee: null, points: null, quote: null, rationale: null, parentIdentifier: null, parentTitle: null, projectName: "Fixture" };
const capability: ShapeCapability = { id: "optional", name: "Optional", description: null, status: "accepted", revision: 1, workLinks: [{id:"link", provider:"linear",externalId:ticket.id,externalUrl:null,state:"active"}] };
const featureAt = (capacity: number) => composeScopeFeatures([ticket], [], [capability], capacity, new Set(["capability:optional"]), {}, []).features[0];
assert.equal(capabilityReleaseLoadDelta(featureAt(1), "outside"), -11/3, "unreviewed baseline keeps its labeled provisional range");
capability.acceptedEstimate = makeSignalEstimate(capability.id, 1, {
  alreadyDone: "Fictional completed work", reuseFrom: "", remainingWork: "Fictional optional work remains", rationale: "QA only", evidenceReference: "fixture://review", asOfDate:"2026-10-08", reviewerDisplayName:"Fixture reviewer", range:{low:3,likely:4,high:5},coveredOpenItemIds:[ticket.id],additionalOpenItemIds:[],
}, [ticket.id], "estimate", "2026-10-08T12:00:00Z");
assert.equal(capabilityReleaseLoadDelta(featureAt(1), "outside"), -4, "reviewed 3/4/5 replaces raw 1/3/7 in preview");
assert.equal(capabilityReleaseLoadDelta(featureAt(2), "outside"), -2, "same current staffing normalization as Scope card");
assert.equal(capabilityReleaseLoadDelta(featureAt(1), "accepted"), 4, "adding uses the same reviewed basis");
assert.equal(capabilityReleaseLoadDelta(undefined, "outside"), null, "missing model is not a zero-effort claim");
assert.deepEqual({low:ticket.low,likely:ticket.likely,high:ticket.high},{low:1,likely:3,high:7}, "preview does not change ticket facts");
console.log("PASS Scope impact uses feature model, not replaced raw ticket estimates; remove/add/capacity/missing/immutability");
