import { assembleDecisionBrief, type DecisionBriefV1 } from "../../lib/reports/decisionBrief";
import { buildBriefRecipe, type BriefRecipeV1 } from "../../lib/reports/composer";
import { createInteractiveBriefBundle } from "../../lib/reports/publication";
import { healthyOwnerFixture, missingNamedCapacityFixture } from "./decision-brief-fixtures";

export function healthyLeadershipFixture() {
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  const base = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const recipe: BriefRecipeV1 = { ...base, promotedAskIds: ["decision-gated"] };
  return createInteractiveBriefBundle("report-healthy-leadership", brief, recipe);
}

export function executiveCompressedFixture() {
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  return createInteractiveBriefBundle("report-executive", brief, buildBriefRecipe("executive", "executive-update", brief));
}

export function incompleteNewProjectFixture() {
  const brief = assembleDecisionBrief(missingNamedCapacityFixture()) as DecisionBriefV1;
  brief.headline.likelyWindow.source = { ...brief.headline.likelyWindow.source, currentness: "unavailable", note: "Missing executable work mapping." };
  brief.timeline.currentForecast.source = { ...brief.timeline.currentForecast.source, currentness: "unavailable", note: "Missing executable work mapping." };
  brief.headline.keyReason.value = "Forecast unavailable — missing executable work mapping.";
  brief.caveats.value = [
    { code: "FORECAST_UNAVAILABLE", message: "Missing executable work mapping." },
    { code: "CAPACITY_MISSING", message: "Named staffing not configured." },
    { code: "FIRST_AUDIT_FINDINGS", message: "The first Audit found unrepresented capabilities and provider gaps." },
  ];
  return createInteractiveBriefBundle("report-incomplete-new-project", brief, buildBriefRecipe("delivery-leadership", "weekly-update", brief));
}

export function staleLiveOwnerFixture() {
  const owner = healthyOwnerFixture();
  owner.forecast.asOf = "2026-08-20T15:00:00.000Z";
  const brief = assembleDecisionBrief(owner);
  return createInteractiveBriefBundle("report-stale-owner", brief, buildBriefRecipe("delivery-leadership", "delivery-review", brief));
}

export function historicalScenarioFixture() {
  const owner = healthyOwnerFixture();
  owner.mode = "scenario";
  owner.scenarioId = "resolve-decisions";
  const brief = assembleDecisionBrief(owner);
  const base = buildBriefRecipe("decision-scenario", "scenario-review", brief);
  const recipe: BriefRecipeV1 = { ...base, mode: "scenario", compareTo: "report-prior" };
  return createInteractiveBriefBundle("report-frozen-scenario", brief, recipe);
}
