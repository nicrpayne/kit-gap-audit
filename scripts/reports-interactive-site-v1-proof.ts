import assert from "node:assert/strict";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { createInteractiveBriefBundle, stableJson, validatePublicationReadiness } from "../lib/reports/publication";
import { siteHandoffPrompt } from "../lib/reports/publicationContract";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import {
  executiveCompressedFixture,
  healthyLeadershipFixture,
  historicalScenarioFixture,
  incompleteNewProjectFixture,
  staleLiveOwnerFixture,
} from "./lib/publication-fixtures";

const healthy = healthyLeadershipFixture();
const repeated = healthyLeadershipFixture();
assert.equal(healthy.integrity.bundleHash, repeated.integrity.bundleHash, "bundle hash is deterministic");
assert.equal(stableJson(healthy), stableJson(repeated), "bundle bytes are deterministic");
assert.equal(healthy.content.delivery.likely, "2026-11-01T00:00:00.000Z");
assert.equal(healthy.content.delivery.target, "2026-11-15T00:00:00.000Z");
assert.equal(healthy.content.delivery.commitment.status, "missing");
assert.equal(healthy.content.delivery.commitment.date, null);
assert.equal(healthy.content.decisions.length, 2);
assert.deepEqual(healthy.content.leadershipAsks.map((item) => item.id), ["decision-gated"]);
assert.equal(healthy.content.capacity?.availability, "available");
assert.equal(healthy.content.capacity?.namedEffectiveFte, 1.4);
assert.equal(healthy.content.dependencies.length, 1);
assert.equal(healthy.content.next?.title, "Release candidate");
assert(validatePublicationReadiness(healthy).ready);

const executive = executiveCompressedFixture();
assert.equal(executive.integrity.snapshotFingerprint, healthy.integrity.snapshotFingerprint, "audience changes presentation, not frozen truth");
assert.equal(executive.content.delivery.likely, healthy.content.delivery.likely);
assert(executive.presentation.moduleOrder.length < healthy.presentation.moduleOrder.length, "executive recipe compresses modules");
assert.notEqual(executive.integrity.bundleHash, healthy.integrity.bundleHash, "audience/purpose changes the publication bundle");

const incomplete = incompleteNewProjectFixture();
const incompleteReadiness = validatePublicationReadiness(incomplete);
assert(incompleteReadiness.ready, "honest absence remains publishable");
assert.equal(incomplete.content.delivery.status, "unavailable");
assert.equal(incomplete.content.delivery.likely, null);
assert.equal(incomplete.content.delivery.confidenceAtTarget, null);
assert.equal(incomplete.content.delivery.commitment.status, "missing");
assert.equal(incomplete.content.capacity?.availability, "missing");
assert(incomplete.content.caveats.some((item) => item.code === "FORECAST_UNAVAILABLE"));
assert(incompleteReadiness.warnings.some((item) => item.includes("Missing executable work mapping")));

const stale = staleLiveOwnerFixture();
const staleReadiness = validatePublicationReadiness(stale);
assert(staleReadiness.ready);
assert(stale.provenance.some((item) => item.owner === "Forecast" && item.currentness === "stale"));
assert(staleReadiness.warnings.some((item) => item.includes("Forecast is stale")));
assert(stale.content.caveats.some((item) => item.code === "FORECAST_STALE"));

const scenario = historicalScenarioFixture();
assert.equal(scenario.identity.mode, "scenario");
assert.equal(scenario.identity.compareTo, "report-prior");
assert.equal(scenario.content.scenarioCompare?.frozen, true);
assert(scenario.presentation.allowedInteractions.includes("frozen_scenario_compare"));
assert.equal(scenario.permissions.mutationCapability, false);
assert.equal(scenario.permissions.silentRefreshAllowed, false);

const fullBrief = assembleDecisionBrief(healthyOwnerFixture());
const hiddenRecipe = { ...buildBriefRecipe("executive", "executive-update", fullBrief), modules: [{ id: "delivery-outlook" as const, density: "headline" as const }] };
const hidden = createInteractiveBriefBundle("report-hidden", fullBrief, hiddenRecipe);
assert.equal(hidden.content.scope, null);
assert.equal(hidden.content.capacity, null);
assert.equal(hidden.content.decisions.length, 0);
assert(!stableJson(hidden).includes("passage-42"), "raw evidence passage ids are excluded");
assert(!stableJson(hidden).includes("ctx-current"), "context snapshot ids are excluded");
assert(!Object.hasOwn(hidden, "briefSnapshot"), "full internal brief is not embedded");

for (const [label, contaminant] of [
  ["secret", "Authorization: Bearer sk-secretsecretsecret"],
  ["local path", "/Users/nic/private/source.md"],
  ["raw HTML", "<!doctype html><html><body>502 Bad Gateway</body></html>"],
] as const) {
  const contaminated = structuredClone(healthy);
  contaminated.content.outcome = contaminant;
  assert.equal(validatePublicationReadiness(contaminated).ready, false, `${label} fails closed`);
}

const handoff = siteHandoffPrompt(healthy);
for (const constraint of [
  "Use only facts present in the bundle",
  "Do not connect to Signal",
  "Never turn likely or target into a commitment",
  "Keep every missing-data",
  "Do not deploy, publish, share",
  "reconcile every displayed number",
]) assert(handoff.includes(constraint), `handoff contains: ${constraint}`);

console.log("PASS Report → ChatGPT Site V1: 5 fixtures, deterministic sealing, fail-closed readiness, frozen truth reconciliation and governed handoff");
