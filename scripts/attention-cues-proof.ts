import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deliveryNextAction } from "../lib/instrument/nextAction";
import { evaluateForecastCoverage, type ForecastCoverageContract } from "../lib/forecast/coverage";

const clear: ForecastCoverageContract = { state: "forecastable", canonicalForecast: true, label: "Ready", reason: null, caveat: null, reasons: [], census: { executionIssueCount: 1, modeledExecutionIssueCount: 1, outsideExecutionIssueCount: 0, unmappedExecutionIssueCount: 0, acceptedCapabilityCount: 1, mappedAcceptedCapabilityCount: 1, openShapeDecisionCount: 0, incompleteDependencyCount: 0 } };
const action = (patch: Partial<ForecastCoverageContract> = {}, census = {}, capacityReconciles = true) => deliveryNextAction({ scopeId: "project / one", coverage: { ...clear, ...patch, census: { ...clear.census, ...census } }, capacityReconciles });
assert.equal(action(), null);
assert.equal(action({}, { unmappedExecutionIssueCount: 1 })?.href, "/scope?project=project%20%2F%20one");
assert.match(action({}, { unmappedExecutionIssueCount: 1 })!.detail, /1 ticket needs/);
assert.match(action({}, { unmappedExecutionIssueCount: 2 })!.detail, /2 tickets need/);
assert.match(action({}, { mappedAcceptedCapabilityCount: 0 })!.label, /mappings/);
assert.equal(action({}, { openShapeDecisionCount: 2 })?.href, "/decisions?project=project%20%2F%20one");
assert.equal(action({}, {}, false)?.href, "/portfolio?project=project%20%2F%20one");
assert.equal(deliveryNextAction({ scopeId: "one", coverage: clear, capacityRequired: 0.5 })?.href, "/portfolio?project=one");
assert.equal(action({ canonicalForecast: false, reasons: [{ code: "execution_source_stale", label: "Old execution", count: 1 }] }, { unmappedExecutionIssueCount: 10 })?.href, "/audit?project=project%20%2F%20one");
assert.equal(action({ canonicalForecast: false, reason: "Estimate needs review" })?.detail, "Estimate needs review");
// A real incomplete contract also routes safely. No thresholds or mutations.
const coverage = evaluateForecastCoverage({ executionState: "available", issueIds: ["Q-1"], capabilities: [{ status: "accepted", workLinks: [] }], openShapeDecisionCount: 0 });
assert(deliveryNextAction({ scopeId: "q", coverage }));
const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /signal-action-glow 4\.8s ease-in-out infinite/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /data-attention-motion="paused"/);
assert.match(css, /aria-busy="true"/);
assert.match(css, /@media print.*animation: none/);
assert(!/\[data-attention\][^{]*\{[^}]*transform:/.test(css));
console.log("PASS attention routing, clean-state silence, project isolation, source priority, disabled/busy, reduced-motion and print contracts");
