import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ambiguousScenarioItemLeverMessage,
  findAmbiguousScenarioItemLevers,
} from "../lib/scenario/itemLeverScope";

const scopes = [
  { scopeId: "delivery", name: "Delivery", itemIds: ["SHARED-1", "DELIVERY-1"] },
  { scopeId: "upstream", name: "Upstream", itemIds: ["SHARED-1", "UPSTREAM-1"] },
];

for (const [kind, selection] of [
  ["excluded", { excludedItemIds: ["SHARED-1"], includedItemIds: [], estimateOverrideIds: [] }],
  ["included", { excludedItemIds: [], includedItemIds: ["SHARED-1"], estimateOverrideIds: [] }],
  ["estimate override", { excludedItemIds: [], includedItemIds: [], estimateOverrideIds: ["SHARED-1"] }],
] as const) {
  const result = findAmbiguousScenarioItemLevers({ scopes, ...selection });
  assert.equal(result.length, 1, `${kind} must fail closed when a bare item id has multiple Scope owners`);
  assert.equal(result[0].itemId, "SHARED-1");
  assert.deepEqual(result[0].scopeIds, ["delivery", "upstream"]);
  assert.match(ambiguousScenarioItemLeverMessage(result), /Delivery, Upstream/);
}

assert.deepEqual(findAmbiguousScenarioItemLevers({
  scopes,
  excludedItemIds: ["DELIVERY-1"],
  includedItemIds: ["UPSTREAM-1"],
  estimateOverrideIds: [],
}), [], "unambiguous bare item controls preserve existing behavior across distinct Scope ownership");

assert.deepEqual(findAmbiguousScenarioItemLevers({
  scopes,
  excludedItemIds: ["UNKNOWN"],
  includedItemIds: [],
  estimateOverrideIds: [],
}), [], "unknown ids remain the stale-owner validator's responsibility rather than being misreported as ambiguous");

const clientSimulation = readFileSync(new URL("../lib/instrument/useProject.ts", import.meta.url), "utf8");
assert.match(clientSimulation, /findAmbiguousScenarioItemLevers\(\{[\s\S]*no Scenario input was applied[\s\S]*setPreview\(baseline\)/,
  "browser simulation must return to the Reality preview rather than applying an ambiguous item lever");
const reportServer = readFileSync(new URL("../lib/reports/scenario.ts", import.meta.url), "utf8");
assert.match(reportServer, /findAmbiguousScenarioItemLevers\(\{[\s\S]*Bare item ids cannot be published when more than one project owns them/,
  "server replay must independently reject ambiguous historical/current snapshots without guessing an owner");
const reportsClient = readFileSync(new URL("../components/ReportsPageClient.tsx", import.meta.url), "utf8");
assert.match(reportsClient, /ambiguousItemLeverReason[\s\S]*remove overlapping execution ownership[\s\S]*scenarioReportBlockedReason/,
  "Reports must explain the ambiguity before a publication attempt");

console.log("PASS: bare Scenario work-item levers fail closed across overlapping Scope ownership and remain unchanged for unambiguous owners.");
