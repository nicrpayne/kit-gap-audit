import assert from "node:assert/strict";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint } from "../lib/reports/decisionBriefRender";
import {
  AUDIENCE_LABELS,
  PURPOSE_LABELS,
  buildBriefRecipe,
  moveRecipeModule,
  toggleRecipeModule,
  type AudienceLens,
  type BriefPurpose,
} from "../lib/reports/composer";
import { renderAudienceBriefMarkdown, renderAudienceBriefPlainText } from "../lib/reports/audienceBriefRender";
import { buildBriefPresentation, buildInteractiveBriefBundle, siteHandoffPrompt } from "../lib/reports/presentation";
import { healthyOwnerFixture, missingNamedCapacityFixture, pivotPrototypeFixture } from "./lib/decision-brief-fixtures";

const audiences = Object.keys(AUDIENCE_LABELS) as AudienceLens[];
const purposes = Object.keys(PURPOSE_LABELS) as BriefPurpose[];
const brief = assembleDecisionBrief(healthyOwnerFixture());
const fingerprint = briefPayloadFingerprint(brief);
const canonical = JSON.stringify(brief);

for (const audience of audiences) {
  for (const purpose of purposes) {
    const recipe = buildBriefRecipe(audience, purpose, brief);
    const presentation = buildBriefPresentation(brief, recipe);
    assert.equal(presentation.snapshotFingerprint, fingerprint, `${audience}/${purpose}: frozen payload`);
    assert.equal(presentation.projectId, "jsa", `${audience}/${purpose}: project`);
    assert.equal(JSON.stringify(brief), canonical, `${audience}/${purpose}: recipe cannot mutate truth`);
    const markdown = renderAudienceBriefMarkdown(brief, recipe);
    const plain = renderAudienceBriefPlainText(brief, recipe);
    assert(markdown.includes(fingerprint), `${audience}/${purpose}: Markdown identity`);
    assert(plain.includes(fingerprint), `${audience}/${purpose}: plain identity`);
    assert(markdown.includes("Nov 1, 2026") || !recipe.modules.some((module) => module.id === "delivery-outlook"), `${audience}/${purpose}: likely date reconciles when shown`);
  }
}

const baseRecipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
const hidden = toggleRecipeModule(baseRecipe, "delivery-outlook");
const reordered = moveRecipeModule(baseRecipe, baseRecipe.modules[0].id, baseRecipe.modules.at(-1)!.id);
assert.equal(buildBriefPresentation(brief, hidden).snapshotFingerprint, fingerprint, "hidden module preserves truth fingerprint");
assert.equal(buildBriefPresentation(brief, reordered).snapshotFingerprint, fingerprint, "reorder preserves truth fingerprint");
assert.equal(JSON.stringify(brief), canonical, "presentation operations preserve frozen payload bytes");

const presentation = buildBriefPresentation(brief, baseRecipe);
assert.equal(presentation.commitment.status, "missing");
assert.equal(presentation.commitment.label, "NO CANONICAL DELIVERY COMMITMENT");
assert(brief.calls.decisions.value.find((decision) => decision.id === "decision-ungated")?.modeledDelay.likely === 0);
assert(brief.calls.decisions.value.find((decision) => decision.id === "decision-gated")?.gate?.targetScopeId === "platform");
assert.equal(presentation.leadershipAsks.length, 0, "candidates are not promoted without operator confirmation");
assert(presentation.leadershipAskCandidates.length > 0);
const promotedRecipe = { ...baseRecipe, promotedAskIds: ["decision-gated"] };
assert.deepEqual(buildBriefPresentation(brief, promotedRecipe).leadershipAsks.map((ask) => ask.id), ["decision-gated"]);

for (const href of [
  ...brief.calls.decisions.value.map((item) => item.href),
  ...brief.calls.dependencies.value.map((item) => item.href),
  brief.movable.scope.value.href,
  brief.movable.capacity.value.href,
  brief.timeline.currentForecast.value.href,
  ...brief.evidence.references.value.map((item) => item.href),
]) assert(new URL(href, "https://signal.local").searchParams.get("project"), `project context: ${href}`);

const bundle = buildInteractiveBriefBundle(brief, baseRecipe);
assert.equal(bundle.snapshotFingerprint, fingerprint);
assert.deepEqual(bundle.security, { liveOwnerAccess: false, databaseCredentials: false, secrets: false, publishAuthorized: false });
assert.equal(bundle.briefSnapshot.boundaries.findingsForecastEffect.value.modeledBaselineWorkItems, 0);
assert(siteHandoffPrompt(bundle).includes("do not deploy or publish"));
assert(siteHandoffPrompt(bundle).includes("Do not fetch live Signal data"));

assert.equal(bundle.presentation.snapshotFingerprint, fingerprint, "screen/Site bundle shares the snapshot identity");
assert(bundle.presentation.modules.length === baseRecipe.modules.length, "screen/Site modules come from the same recipe");
const timelineRecipe = buildBriefRecipe("operator", "delivery-review", brief);
assert(renderAudienceBriefMarkdown(brief, timelineRecipe).includes("Current Forecast · LIVE"));
assert(renderAudienceBriefMarkdown(brief, baseRecipe).includes("ReportHistory · HISTORICAL"));

const missingCapacityBrief = assembleDecisionBrief(missingNamedCapacityFixture());
const portfolio = renderAudienceBriefMarkdown(missingCapacityBrief, buildBriefRecipe("portfolio-staffing", "scenario-review", missingCapacityBrief));
assert(portfolio.includes("Named Capacity MISSING"));
assert(!portfolio.includes("Nic:"), "missing named Capacity must not expose fabricated contributors");

const pivot = assembleDecisionBrief(pivotPrototypeFixture());
const pivotOutput = renderAudienceBriefMarkdown(pivot, buildBriefRecipe("decision-scenario", "handoff", pivot));
assert(pivotOutput.includes("KIT Construct project world"));
assert(pivotOutput.includes("Named Capacity MISSING"));
assert.equal(pivot.boundaries.findingsForecastEffect.value.modeledBaselineWorkItems, 0);

console.log(`PASS Reports audience composer: ${audiences.length} audiences × ${purposes.length} purposes, immutable recipes, renderers, Sites bundle, semantic boundaries and pivot gaps`);
