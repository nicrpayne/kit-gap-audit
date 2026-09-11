import assert from "node:assert/strict";
import { deriveKnowledgeFreshness } from "../lib/audit/freshness";
import { rosterReadings, validateRosterDraft } from "../lib/capacity/reconciliation";
import { capabilityExecutionState, partitionProductShape } from "../lib/scope/productShape";

const current = deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, jobRunning: false, packageAheadOfSnapshot: false, watermarkAheadOfPackage: false });
const available = deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, jobRunning: false, packageAheadOfSnapshot: true, watermarkAheadOfPackage: false });
const ingesting = deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, ingestionState: "ingesting", jobRunning: false, packageAheadOfSnapshot: true, watermarkAheadOfPackage: true });
const refreshing = deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, jobRunning: true, packageAheadOfSnapshot: false, watermarkAheadOfPackage: false });
const offline = deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: false, jobRunning: false, packageAheadOfSnapshot: true, watermarkAheadOfPackage: true });
assert.deepEqual([current.code, available.code, ingesting.code, refreshing.code, offline.code], ["current", "new_available", "ingesting", "refreshing", "offline"]);
assert.equal(ingesting.canRefresh, false);
assert.equal(offline.canRefresh, false);

const scopes = new Set(["jsa", "platform", "itrack"]);
const split = [{ name: "Person A", fte: 1, allocations: [{ scopeId: "jsa", fte: 0.5 }, { scopeId: "itrack", fte: 0.5 }] }];
assert.deepEqual(validateRosterDraft(split, scopes), []);
const readings = rosterReadings(split, [...scopes], 10);
assert.equal(readings.workforceFte, 1);
assert.equal(readings.byScope.get("jsa")?.raw, 0.5);
assert.equal(readings.byScope.get("jsa")?.effective, 0.45);
assert.equal(readings.byScope.get("itrack")?.raw, 0.5);
assert.equal(readings.freeFte, 0);
assert.equal(validateRosterDraft([{ name: "Person A", fte: 1, allocations: [{ scopeId: "jsa", fte: 0.7 }, { scopeId: "itrack", fte: 0.4 }] }], scopes)[0]?.code, "overallocated");
assert.equal(validateRosterDraft([{ name: "Person A", fte: 1, allocations: [] }, { name: " person  a ", fte: 1, allocations: [] }], scopes)[0]?.code, "duplicate_name");

const shape = partitionProductShape([
  { id: "ship", name: "Ship", description: null, status: "accepted", workLinks: [] },
  { id: "cut", name: "Cut", description: null, status: "removed", workLinks: [] },
  { id: "defer", name: "Later", description: null, status: "deferred", workLinks: [] },
]);
assert.deepEqual(shape.accepted.map((item) => item.id), ["ship"]);
assert.deepEqual(shape.outsideRelease.map((item) => item.id), ["cut", "defer"]);
assert.equal(capabilityExecutionState(shape.accepted[0], "configured"), "unmapped");
assert.equal(capabilityExecutionState(shape.accepted[0], "not_configured"), "source_not_configured");
assert.equal(capabilityExecutionState({ ...shape.accepted[0], workLinks: [{ id: "w", provider: "linear", externalId: "JSA-1", externalUrl: null, state: "configured" }] }, "configured"), "mapped");
assert.equal(capabilityExecutionState({ ...shape.accepted[0], workLinks: [{ id: "w", provider: "linear", externalId: "JSA-1", externalUrl: null, state: "configured" }] }, "unavailable"), "source_unavailable");

console.log(JSON.stringify({ ok: true, auditStates: [current.code, available.code, ingesting.code, refreshing.code, offline.code], roster: { raw: 0.5, effective: 0.45, conserved: true }, scopeShape: { accepted: 1, outsideRelease: 2, findingsPromoted: 0 } }, null, 2));
