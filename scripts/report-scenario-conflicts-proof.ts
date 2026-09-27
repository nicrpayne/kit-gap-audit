import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countScenarioReportLevers,
  findScenarioLeverConflicts,
  scenarioLeverConflictMessage,
} from "../lib/reports/scenarioConflicts";

const capabilities = [
  { id: "capability-1", name: "Offline capture", scopeId: "scope-a", workItemIds: ["WORK-1", "knowledge-1"] },
  { id: "capability-2", name: "Admin", scopeId: "scope-b", workItemIds: [] },
];

const clean = findScenarioLeverConflicts({
  capabilities,
  excludedCapabilityIds: ["capability-1"],
  excludedItemIds: ["WORK-1", "knowledge-1"],
  includedItemIds: [],
  knowledgeCapabilityIds: [],
  staffingCapabilityIds: [],
});
assert.equal(clean.length, 0, "mirrored engine exclusions for a product capability are expected, not conflicts");

const conflicts = findScenarioLeverConflicts({
  capabilities,
  excludedCapabilityIds: ["capability-1"],
  excludedItemIds: ["WORK-1"],
  includedItemIds: ["WORK-1", "knowledge-1"],
  knowledgeCapabilityIds: ["capability-1"],
  staffingCapabilityIds: ["capability-1"],
});
assert.deepEqual(conflicts.map((conflict) => conflict.code), [
  "ITEM_INCLUDED_AND_EXCLUDED",
  "EXCLUDED_CAPABILITY_INCLUDED_WORK",
  "EXCLUDED_CAPABILITY_KNOWLEDGE",
  "EXCLUDED_CAPABILITY_STAFFING",
]);
assert.match(scenarioLeverConflictMessage(conflicts), /Offline capture/);
assert.match(scenarioLeverConflictMessage(conflicts), /both included and excluded/i);
assert.match(scenarioLeverConflictMessage(conflicts), /meeting estimate/i);
assert.match(scenarioLeverConflictMessage(conflicts), /staffing/i);

const capabilityOnly = findScenarioLeverConflicts({
  capabilities,
  excludedCapabilityIds: ["capability-2"],
  excludedItemIds: [],
  includedItemIds: [],
  knowledgeCapabilityIds: [],
  staffingCapabilityIds: [],
});
assert.equal(capabilityOnly.length, 0);
assert.equal(countScenarioReportLevers({
  excludedItemIds: [], includedItemIds: [], excludedCapabilityIds: ["capability-2"], resolvedGateIds: [],
  estimateOverrideIds: [], knowledgeCapabilityIds: [], staffingCapabilityIds: [], capacityOverrideScopeIds: [],
  hasCapacityPlan: false, contextSwitchCostPct: null,
}), 1, "a canonical capability-only removal is a reportable product-scope lever");

const serverSource = readFileSync(new URL("../lib/reports/scenario.ts", import.meta.url), "utf8");
assert.match(serverSource, /const leverConflicts = findScenarioLeverConflicts/);
assert.match(serverSource, /Scenario levers conflict:/);
assert.match(serverSource, /!target\.forecastCoverage\.canonicalForecast[\s\S]*ForecastCoverageIncompleteError/,
  "Scenario report publication must fail before using a review-required forecast basis");
assert.match(serverSource, /reviewedEstimateSimulationDecision/,
  "Scenario consumers must use the normalized reviewed boundary rather than raw accepted-estimate fields");
assert.match(serverSource, /Raw meeting estimates cannot support a new delivery report[\s\S]*reviewed remaining-work interpretation[\s\S]*covered\/additional ticket boundary/,
  "raw provisional assertions must fail closed at the report boundary");
assert.match(serverSource, /scenario\.excludedCapabilityIds\.length[\s\S]*product capability/,
  "a capability-only product-scope change must remain visible in the frozen causal explanation");
const clientSource = readFileSync(new URL("../components/ReportsPageClient.tsx", import.meta.url), "utf8");
assert.match(clientSource, /countScenarioReportLevers\(\{/);
assert.match(clientSource, /scenarioLeverConflictReason[\s\S]*Resolve in Scope/,
  "the UI must block contradictory publication without deleting independent staged levers");
assert.match(clientSource, /unreviewedKnowledgeReason[\s\S]*other staged Scenario levers will remain unchanged/,
  "the UI must direct explicit estimate review without silently deleting unrelated work");

console.log("PASS: contradictory Scenario levers fail closed while capability-only removals remain reportable.");
