import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildForecastInputs } from "../lib/forecast/build";
import { evaluateForecastCoverage } from "../lib/forecast/coverage";
import { composeScopeFeatures } from "../lib/scope/features";
import { partitionProductShape, type ShapeCapability } from "../lib/scope/productShape";
import type { ScopeWorkItem } from "../lib/instrument/useProject";
import type { LinearIssueSummary } from "../lib/linear";

(globalThis as unknown as { React: typeof React }).React = React;
// ScopeInstrument reaches InstrumentRail, whose build id is rendered at
// module load under tsx's classic JSX transform. Install React first.
const {
  FirstCapabilityTransitionConfirmation,
  firstCapabilityTransitionImpact,
  firstCapabilityTransitionRequest,
  scopeClassificationSummary,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("../components/instrument/ScopeInstrument") as typeof import("../components/instrument/ScopeInstrument");

const issue = (
  identifier: string,
  assignee: string | null,
  patch: Partial<LinearIssueSummary> = {},
): LinearIssueSummary => ({
  identifier,
  url: `https://linear.example/${identifier}`,
  title: identifier,
  description: null,
  state: "Todo",
  stateType: "unstarted",
  estimate: 2,
  assignee,
  labels: [],
  completedAt: null,
  updatedAt: "2026-10-12T00:00:00.000Z",
  parentIdentifier: "PLAT-F1",
  parentTitle: "Platform feature",
  projectName: "KIT Platform",
  ...patch,
});

const ownerLeaves = Array.from({ length: 12 }, (_, index) => issue(`PLAT-${index + 1}`, index < 10 ? `Owner ${index + 1}` : null));
const fullOwnerRead = [
  issue("PLAT-F1", "Parent-only owner", { parentIdentifier: null, parentTitle: null }),
  ...ownerLeaves,
  issue("PLAT-DONE", "Completed-only owner", { state: "Done", stateType: "completed", completedAt: "2026-10-11T00:00:00.000Z" }),
  issue("PLAT-TRIAGE", "Triage-only owner", { state: "Triage", stateType: "triage" }),
];

const ownerBasis = buildForecastInputs(fullOwnerRead, [], null, { includeTriage: false });
assert.equal(ownerBasis.items.length, 12, "parents, completed work, and excluded triage do not enter the delivery basis");
assert.equal(ownerBasis.teamCapacity, 10, "capacity is inferred from distinct assignees on delivery-relevant leaves only");
assert.equal(ownerBasis.capacitySource, "inferred");
assert.equal(ownerBasis.teamCapacityInferred, true);

const emptyGovernedSubset = buildForecastInputs([], [], ownerBasis.teamCapacity, { capacitySource: ownerBasis.capacitySource });
assert.equal(emptyGovernedSubset.items.length, 0, "governed classification does not invent modeled work");
assert.equal(emptyGovernedSubset.teamCapacity, 10, "narrowing Scope preserves the full owner read's sourced capacity");
assert.equal(emptyGovernedSubset.capacitySource, "inferred");
assert.equal(emptyGovernedSubset.teamCapacityInferred, true);

const explicit = buildForecastInputs([], [], 4, { capacitySource: "explicit" });
assert.deepEqual({ value: explicit.teamCapacity, source: explicit.capacitySource, inferred: explicit.teamCapacityInferred }, { value: 4, source: "explicit", inferred: false });
const named = buildForecastInputs([], [], 2.5, { capacitySource: "allocations" });
assert.deepEqual({ value: named.teamCapacity, source: named.capacitySource, inferred: named.teamCapacityInferred }, { value: 2.5, source: "allocations", inferred: false });
const confirmedNamedZero = buildForecastInputs([], [], 0, { capacitySource: "allocations" });
assert.equal(confirmedNamedZero.teamCapacity, 0, "confirmed named zero never becomes the 1-FTE safety fallback");

const workItems: ScopeWorkItem[] = ownerLeaves.map((row) => ({
  id: row.identifier,
  label: `${row.identifier} ${row.title}`,
  low: 1,
  likely: 3,
  high: 7,
  estimateSource: "issue_placeholder",
  kind: "ticket",
  state: row.state,
  assignee: row.assignee,
  points: row.estimate,
  quote: null,
  rationale: null,
  parentIdentifier: row.parentIdentifier,
  parentTitle: row.parentTitle,
  projectName: row.projectName,
}));
const firstCapability: ShapeCapability = {
  id: "first",
  name: "Fictional accepted baseline marker",
  description: null,
  status: "accepted",
  revision: 1,
  workLinks: [],
};
const firstCoverage = evaluateForecastCoverage({
  executionState: "configured",
  issueIds: workItems.map((row) => row.id),
  capabilities: [firstCapability],
  openShapeDecisionCount: 0,
});
assert.equal(firstCoverage.census.modeledExecutionIssueCount, 0);
assert.equal(firstCoverage.census.unmappedExecutionIssueCount, 12);
assert.equal(firstCoverage.census.acceptedCapabilityCount, 1);
assert.equal(firstCoverage.canonicalForecast, false, "an empty first capability never hides unresolved source work");

const composition = composeScopeFeatures(
  workItems,
  [],
  [firstCapability],
  ownerBasis.teamCapacity,
  new Set(),
  {},
  [],
  new Set(),
  {},
  {},
  new Date("2026-10-12T00:00:00.000Z"),
  null,
  new Set(),
);
assert.deepEqual(composition.features.map((feature) => feature.id), ["capability:first"], "legacy cards do not survive once the active modeled basis is empty");
assert.equal(composition.loadDays, 0);

const emptyImpact = firstCapabilityTransitionImpact(workItems, { status: "accepted", workItemIds: [] }, ownerBasis.teamCapacity);
assert.deepEqual(emptyImpact, {
  sourceTicketCount: 12,
  selectedTicketCount: 0,
  modeledTicketCount: 0,
  outsideTicketCount: 0,
  unresolvedTicketCount: 12,
  modeledLoadDays: 0,
});
const selectedImpact = firstCapabilityTransitionImpact(workItems, { status: "accepted", workItemIds: ["PLAT-1", "PLAT-2"] }, ownerBasis.teamCapacity);
assert.equal(selectedImpact.modeledTicketCount, 2);
assert.equal(selectedImpact.unresolvedTicketCount, 10);
assert.equal(selectedImpact.modeledLoadDays, 11 / 15, "the warning uses selected source ranges without writing a new estimate");
const lastWorkImpact = firstCapabilityTransitionImpact(workItems, { status: "accepted", workItemIds: workItems.map((item) => item.id) }, ownerBasis.teamCapacity);
assert.equal(lastWorkImpact.unresolvedTicketCount, 0, "classifying the last source ticket leaves no unresolved work");
assert.equal(lastWorkImpact.modeledTicketCount, workItems.length);
const noCapacityImpact = firstCapabilityTransitionImpact(workItems, { status: "accepted", workItemIds: ["PLAT-1"] }, 0);
assert.equal(noCapacityImpact.modeledLoadDays, null, "zero named capacity never invents a 1-FTE schedule load");

const directTransition = firstCapabilityTransitionRequest(0, { name: "Direct", description: "", note: "", evidence: [], workItemIds: [], status: "accepted" });
assert.equal(directTransition?.scenarioDraftId, null);
const scenarioTransition = firstCapabilityTransitionRequest(0, { name: "Scenario", description: "", note: "", evidence: [], workItemIds: ["PLAT-1"], status: "accepted" }, "draft-1");
assert.equal(scenarioTransition?.scenarioDraftId, "draft-1", "committing a first Scenario draft enters the same confirmation path");
assert.equal(firstCapabilityTransitionRequest(1, scenarioTransition!.draft, "draft-1"), null, "existing governed Scope saves without the first-transition confirmation");

const outsideCapability = { ...firstCapability, status: "outside" };
const outsideCoverage = evaluateForecastCoverage({
  executionState: "configured",
  issueIds: workItems.map((row) => row.id),
  capabilities: [outsideCapability],
  openShapeDecisionCount: 0,
});
const outsideCount = partitionProductShape([outsideCapability]).outsideRelease.length;
assert.equal(outsideCoverage.census.outsideExecutionIssueCount, 0, "the coverage census counts tickets, not empty capabilities");
const summary = scopeClassificationSummary(outsideCoverage, outsideCount);
assert.match(summary, /0 out\/later tickets/);
assert.match(summary, /1 out\/later capability$/);

const confirmation = renderToStaticMarkup(
  <FirstCapabilityTransitionConfirmation
    draft={{ name: firstCapability.name, description: "", note: "", evidence: [], workItemIds: [], status: "accepted" }}
    executionItems={workItems}
    currentLoadDays={4.4}
    capacity={ownerBasis.teamCapacity}
    capacitySource="inferred"
    saving={false}
    error={null}
    onBack={() => {}}
    onConfirm={() => {}}
  />,
);
assert(confirmation.includes("Start reviewing this project&#x27;s Scope?"));
assert(confirmation.includes("12 modeled tickets"));
assert(confirmation.includes("12 unresolved"));
assert(confirmation.includes("4.4d at 10.0 FTE"));
assert(confirmation.includes("No other ticket is auto-classified"));
assert(confirmation.includes("Linear points, estimates, assignments, and status are unchanged"));
assert(confirmation.includes("does not create or confirm staffing"));

const zeroCapacityConfirmation = renderToStaticMarkup(
  <FirstCapabilityTransitionConfirmation
    draft={{ name: "Zero-capacity capability", description: "", note: "", evidence: [], workItemIds: ["PLAT-1"], status: "accepted" }}
    executionItems={workItems}
    currentLoadDays={4.4}
    capacity={0}
    capacitySource="allocations"
    saving={false}
    error={null}
    onBack={() => {}}
    onConfirm={() => {}}
  />,
);
assert(zeroCapacityConfirmation.includes("Not forecastable at 0.0 FTE"));
assert(!zeroCapacityConfirmation.includes("4.4d at 0.0 FTE"));

const noEligibleConfirmation = renderToStaticMarkup(
  <FirstCapabilityTransitionConfirmation
    draft={{ name: "Shape only", description: "", note: "", evidence: [], workItemIds: [], status: "accepted" }}
    executionItems={[]}
    currentLoadDays={0}
    capacity={ownerBasis.teamCapacity}
    capacitySource="inferred"
    saving={false}
    error={null}
    onBack={() => {}}
    onConfirm={() => {}}
  />,
);
assert(noEligibleConfirmation.includes("no eligible tickets to classify"));
assert(noEligibleConfirmation.includes("does not change the modeled ticket set"));
assert(noEligibleConfirmation.includes("no ticket is reclassified by this save"));
assert(!noEligibleConfirmation.includes("includes all 0 eligible"));

console.log("PASS Scope first-transition confirmation, unit labels, canonical cards, and full-owner capacity basis");
