import assert from "node:assert/strict";
import {
  parseScenarioReportSnapshot,
  SCENARIO_REPORT_VERSION,
  LEGACY_SCENARIO_REPORT_VERSION,
} from "../lib/reports/scenarioSnapshot";

const valid = {
  version: SCENARIO_REPORT_VERSION,
  scenarioId: "combined-proof-1",
  baseRealityRevision: 3,
  excludedItemIds: ["TICKET-1"],
  includedItemIds: [],
  resolvedGateIds: [],
  excludedCapabilityIds: [],
  estimateOverrideByItemId: { "TICKET-2": { low: 1, likely: 2, high: 3 } },
  capacityOverrideByScope: {},
  capacityPlan: null,
  contextSwitchCostPct: null,
  knowledgeEstimateByCapabilityId: {},
  capabilityStaffingById: {},
};
assert.deepEqual(parseScenarioReportSnapshot(valid), valid);
assert.equal(parseScenarioReportSnapshot({ ...valid, version: LEGACY_SCENARIO_REPORT_VERSION }).version, LEGACY_SCENARIO_REPORT_VERSION);
assert.throws(() => parseScenarioReportSnapshot({ ...valid, exlcudedItemIds: ["TICKET-3"] }), /Unsupported Scenario fields/);
assert.deepEqual(parseScenarioReportSnapshot({ ...valid, computed: { scenarioLikelyDate: "invented" } }), valid, "computed is server-derived, never trusted from a submitted payload");

// No malformed lever may disappear while another valid lever allows a report.
for (const field of ["excludedItemIds", "includedItemIds", "resolvedGateIds", "excludedCapabilityIds"]) {
  for (const bad of [null, "TICKET-3", {}, ["TICKET-3", 5], ["TICKET-3", " "], [null]]) {
    assert.throws(() => parseScenarioReportSnapshot({ ...valid, [field]: bad }), Error, `${field}: ${JSON.stringify(bad)} must fail closed`);
  }
}
for (const field of ["estimateOverrideByItemId", "capacityOverrideByScope", "knowledgeEstimateByCapabilityId", "capabilityStaffingById"]) {
  for (const bad of [null, [], "invalid", 0, false, new Date("2026-09-26")]) {
    assert.throws(() => parseScenarioReportSnapshot({ ...valid, [field]: bad }), Error, `${field}: ${JSON.stringify(bad)} must fail closed`);
  }
}
for (const id of ["", " ", "__proto__", "constructor", "prototype"]) {
  const overrides = JSON.parse(`{${JSON.stringify(id)}:{"low":1,"likely":2,"high":3}}`);
  assert.throws(() => parseScenarioReportSnapshot({ ...valid, estimateOverrideByItemId: overrides }), Error, `invalid record key ${id} must not disappear`);
}
assert.deepEqual(parseScenarioReportSnapshot({ ...valid, excludedItemIds: ["TICKET-1", " TICKET-1 "] }).excludedItemIds, ["TICKET-1"]);
assert.deepEqual(parseScenarioReportSnapshot({ ...valid, includedItemIds: undefined }).includedItemIds, [], "an omitted optional field remains compatible");
const capabilityOnly = parseScenarioReportSnapshot({ ...valid, excludedItemIds: [], estimateOverrideByItemId: {}, excludedCapabilityIds: ["capability-1"] });
assert.deepEqual(capabilityOnly.excludedCapabilityIds, ["capability-1"], "capability removal is itself a lever; server resolves its exact work set");
assert.throws(() => parseScenarioReportSnapshot({ ...valid, excludedItemIds: [], estimateOverrideByItemId: {} }), /at least one/);
console.log("PASS: malformed combined Scenario payloads fail closed; valid v1/v2 and capability-only removals retain their full intent.");
