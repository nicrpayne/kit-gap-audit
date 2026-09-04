import assert from "node:assert/strict";
import { buildForecastInputs } from "../lib/forecast/build";
import DecisionBriefView from "../components/DecisionBriefView";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint, renderDecisionBriefMarkdown, renderDecisionBriefPlainText } from "../lib/reports/decisionBriefRender";
import {
  auditDeltaFixture,
  gatedDecisionFixture,
  healthyOwnerFixture,
  liveDiffersFromHistoryFixture,
  missingNamedCapacityFixture,
  namedCapacityFixture,
  pivotPrototypeFixture,
  staleEvidenceFixture,
  ungatedDecisionFixture,
  weakGroundingFixture,
} from "./lib/decision-brief-fixtures";
import type { LinearIssueSummary } from "../lib/linear";

const cases = [
  ["A healthy project", healthyOwnerFixture],
  ["B stale evidence / missing providers", staleEvidenceFixture],
  ["C open ungated Decision", ungatedDecisionFixture],
  ["D open gated Decision", gatedDecisionFixture],
  ["E live differs from historical", liveDiffersFromHistoryFixture],
  ["F no named capacity", missingNamedCapacityFixture],
  ["G named capacity reconciled", namedCapacityFixture],
  ["H current/prior Audit delta", auditDeltaFixture],
  ["I weakly-grounded Findings", weakGroundingFixture],
] as const;

for (const [name, factory] of cases) {
  const owner = factory();
  const brief = assembleDecisionBrief(owner);
  assert.equal(brief.headline.likelyWindow.value.likely, owner.forecast.likelyDate, `${name}: headline`);
  assert.equal(brief.headline.confidenceAtTarget.value, owner.forecast.confidenceAtTarget, `${name}: confidence`);
  assert.equal(brief.movable.scope.value.executableItemCount, owner.forecast.remainingIssueCount, `${name}: executable Scope count`);
  assert.deepEqual(brief.movable.scope.value.remainingEffortDays, owner.forecast.remainingEffortDays, `${name}: executable Scope effort`);
  assert.equal(brief.timeline.currentForecast.source.temporalRole, "live", `${name}: Timeline live`);
  assert.equal(brief.boundaries.timelineReading.value.label, "Current Forecast", `${name}: Timeline label`);
  assert.equal(brief.calls.decisions.value.length, owner.decisions.filter((decision) => decision.status === "open").length, `${name}: only first-class open Decisions`);

  const fingerprint = briefPayloadFingerprint(brief);
  const markdown = renderDecisionBriefMarkdown(brief);
  const plain = renderDecisionBriefPlainText(brief);
  const screen = DecisionBriefView({ brief });
  assert(markdown.includes(fingerprint), `${name}: Markdown payload identity`);
  assert(plain.includes(fingerprint), `${name}: plain-text payload identity`);
  assert.equal(screen.props["data-brief-fingerprint"], fingerprint, `${name}: screen/print payload identity`);
}

const ungated = assembleDecisionBrief(ungatedDecisionFixture()).calls.decisions.value[0];
assert.equal(ungated.gated, false);
assert.deepEqual(ungated.modeledDelay, { low: 0, likely: 0, high: 0 });

const gated = assembleDecisionBrief(gatedDecisionFixture()).calls.decisions.value[0];
assert.equal(gated.gate?.targetScopeId, "platform");
assert.equal(gated.gate?.targetScopeName, "Platform");
assert.deepEqual(gated.modeledDelay, { low: 1, likely: 3, high: 6 });

const openFinding = { id: "finding-open", type: "missing_work", title: "Observed but not accepted", status: "open", blocking: false, estimateHint: "8 days" };
const findingInputs = buildForecastInputs([], [openFinding], 1);
assert.equal(findingInputs.items.length, 0);
assert.equal(findingInputs.unticketedFindingCount, 1);
assert.equal(assembleDecisionBrief(healthyOwnerFixture()).boundaries.findingsForecastEffect.value.modeledBaselineWorkItems, 0);

const issue = (identifier: string, estimate: number, parentIdentifier: string | null = null): LinearIssueSummary => ({
  identifier,
  title: identifier,
  description: null,
  state: "Todo",
  stateType: "unstarted",
  estimate,
  assignee: "Nic",
  labels: [],
  completedAt: null,
  parentIdentifier,
  parentTitle: parentIdentifier,
  projectName: "Platform",
});
const platformRows = [issue("SOF-810", 3), issue("SOF-487", 3, "SOF-810"), ...Array.from({ length: 14 }, (_, index) => issue(`SOF-F${index + 1}`, 2)), issue("SOF-F15", 10)];
assert.equal(platformRows.reduce((sum, row) => sum + (row.estimate ?? 0), 0), 44);
assert.equal(buildForecastInputs(platformRows, [], 4).items.reduce((sum, item) => sum + item.likely, 0), 41);

const missingCapacity = assembleDecisionBrief(missingNamedCapacityFixture()).movable.capacity.value;
assert.equal(missingCapacity.availability, "missing");
assert.equal(missingCapacity.namedRawFte, null);
assert.deepEqual(missingCapacity.contributors, []);
const namedCapacity = assembleDecisionBrief(namedCapacityFixture()).movable.capacity.value;
assert.equal(namedCapacity.availability, "available");
assert.equal(namedCapacity.namedEffectiveFte, namedCapacity.forecastEffectiveFte);
assert.equal(namedCapacity.contributors.length, 2);

const delta = assembleDecisionBrief(auditDeltaFixture()).changes.audit.value;
assert.deepEqual(delta.newFindings.map((finding) => finding.id), ["finding-new"]);
assert.deepEqual(delta.resolvedFindings.map((finding) => finding.id), ["finding-old-current"]);
const unavailableAudit = healthyOwnerFixture();
unavailableAudit.audit.comparisonCurrentness = "unavailable";
unavailableAudit.audit.warnings = ["Exact Audit membership unavailable."];
assert.deepEqual(assembleDecisionBrief(unavailableAudit).changes.audit.value.newFindings, []);
assert.deepEqual(assembleDecisionBrief(unavailableAudit).changes.audit.value.resolvedFindings, []);
assert(assembleDecisionBrief(staleEvidenceFixture()).evidence.warnings.value.some((warning) => warning.includes("not supplied")));
assert(assembleDecisionBrief(weakGroundingFixture()).caveats.value.some((caveat) => caveat.code === "WEAK_GROUNDING"));
const residueInputs = healthyOwnerFixture();
residueInputs.decisions[0].title = "Test";
assert(assembleDecisionBrief(residueInputs).caveats.value.some((caveat) => caveat.code === "TEST_RESIDUE"));

const historical = assembleDecisionBrief(liveDiffersFromHistoryFixture());
assert.equal(historical.headline.movement.source.temporalRole, "historical");
assert(renderDecisionBriefMarkdown(historical).includes("ReportHistory · HISTORICAL"));

const liveInputs = healthyOwnerFixture();
const saved = structuredClone(assembleDecisionBrief(liveInputs));
const savedJson = JSON.stringify(saved);
liveInputs.forecast.likelyDate = "2027-01-15T00:00:00.000Z";
const refreshedLive = assembleDecisionBrief(liveInputs);
assert.equal(JSON.stringify(saved), savedJson, "saved payload remains immutable after owner inputs change");
assert.notEqual(refreshedLive.headline.likelyWindow.value.likely, saved.headline.likelyWindow.value.likely);

const pivot = assembleDecisionBrief(pivotPrototypeFixture());
const pivotMarkdown = renderDecisionBriefMarkdown(pivot);
assert(pivot.caveats.value.some((caveat) => caveat.code === "KIT_CONSTRUCT_MISSING"));
assert(pivot.caveats.value.some((caveat) => caveat.code === "CAPACITY_MISSING"));
assert(pivotMarkdown.includes("KIT Construct project world"));
assert(pivotMarkdown.includes("Named Capacity: MISSING"));

console.log(`PASS Reports DecisionBriefV1: ${cases.length} fixtures + reconciliation, immutability, renderers and pivot gaps`);
