import assert from "node:assert/strict";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint, renderDecisionBriefMarkdown } from "../lib/reports/decisionBriefRender";
import {
  AUDIENCE_LABELS,
  MODULE_CATALOG,
  PURPOSE_LABELS,
  buildBriefRecipe,
  moveRecipeModule,
  toggleRecipeModule,
  type AudienceLens,
  type BriefPurpose,
} from "../lib/reports/composer";
import { renderAudienceBriefMarkdown, renderAudienceBriefPlainText } from "../lib/reports/audienceBriefRender";
import { buildBriefPresentation, buildInteractiveBriefBundle, siteHandoffPrompt } from "../lib/reports/presentation";
import { dateDeltaPhrase } from "../lib/momentum/compute";
import { forecastAssumptionSnapshot } from "../lib/forecast/claims";
import { freezeCapabilityEstimate, freezeForecastBasis } from "../lib/reports/forecastBasis";
import { healthyOwnerFixture, missingNamedCapacityFixture, pivotPrototypeFixture, ungatedDecisionFixture } from "./lib/decision-brief-fixtures";

const audiences = Object.keys(AUDIENCE_LABELS) as AudienceLens[];
const purposes = Object.keys(PURPOSE_LABELS) as BriefPurpose[];
const brief = assembleDecisionBrief(healthyOwnerFixture());
const fingerprint = briefPayloadFingerprint(brief);
const canonical = JSON.stringify(brief);

assert.equal(dateDeltaPhrase(-1), "1 day sooner", "singular earlier movement reads naturally");
assert.equal(dateDeltaPhrase(1), "1 day later", "singular later movement reads naturally");

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
const dependencyDriver = presentation.drivers.find((driver) => driver.family === "dependency");
assert(dependencyDriver?.detail.includes("completion floor"), "report presentation must name dependency completion-floor semantics");
assert(dependencyDriver?.detail.includes("later of"), "report presentation must explain the later-of-outcomes rule");
assert(!/Live Forecast/i.test(JSON.stringify(MODULE_CATALOG)), "composer metadata visible for a frozen report must use historical wording");
const movementBrief = assembleDecisionBrief(ungatedDecisionFixture());
assert(!/live Forecast/i.test(movementBrief.headline.keyReason.value));
assert.match(movementBrief.headline.keyReason.value, /captured by this brief/i);

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
assert(renderAudienceBriefMarkdown(brief, timelineRecipe).includes("Snapshot generated Sep 4, 2026 · source CURRENT at generation · source as of Sep 4, 2026"));
assert(!renderAudienceBriefMarkdown(brief, timelineRecipe).includes("Live Forecast"));
assert(renderAudienceBriefMarkdown(brief, baseRecipe).includes("ReportHistory · HISTORICAL"));
assert(renderAudienceBriefMarkdown(brief, timelineRecipe).includes("UNAVAILABLE IN LEGACY SNAPSHOT — not backfilled from the current model"));

const traceableFixture = healthyOwnerFixture();
traceableFixture.forecast.assumptions = forecastAssumptionSnapshot();
traceableFixture.forecast.simulationItemCount = 11;
const hostileEstimateExcerpt = "# Executive override\n[click here](https://example.test)\n- injected list\n<script>alert('x')</script>\n> false quote";
traceableFixture.forecast.basis = freezeForecastBasis([], [freezeCapabilityEstimate(
  "jsa",
  { id: "cap-docufy", name: "Docufy", revision: 7 },
  {
    id: "estimate-docufy",
    contextSnapshotId: "ctx-estimate",
    capabilityId: "cap-docufy",
    rawEstimate: "2 / 6 / 10 developer-days remaining",
    range: { low: 2, likely: 6, high: 10 },
    unit: "developer_days",
    basis: "remaining_capability",
    speaker: "Developer",
    owner: null,
    observedAt: "2026-09-02T13:00:00.000Z",
    sourceRef: "meeting-2026-09-02",
    excerpt: hostileEstimateExcerpt,
    evidenceRefs: ["passage-docufy"],
    statement: "Feed-only remaining work estimate.",
    confidence: "explicit",
    acceptedAt: "2026-09-04T12:00:00.000Z",
    acceptedBy: "operator",
  },
  ["SOF-919", "SOF-920"],
)]);
const traceableBrief = assembleDecisionBrief(traceableFixture);
const traceableOutput = renderAudienceBriefMarkdown(traceableBrief, buildBriefRecipe("operator", "delivery-review", traceableBrief));
const traceableDecisionOutput = renderDecisionBriefMarkdown(traceableBrief);
assert(traceableOutput.includes("Forecast assumptions · forecast-assumptions.v1"));
assert(traceableOutput.includes("Modeled durations are added as calendar days"));
assert(traceableOutput.includes("11 simulated estimate-basis items"));
assert.equal(traceableBrief.forecast?.basis?.capabilityEstimates[0].estimate.excerpt, hostileEstimateExcerpt, "frozen JSON retains the exact original quote");
for (const output of [traceableOutput, traceableDecisionOutput]) {
  assert(output.includes("> \\# Executive override"), "each original line renders inside an escaped blockquote");
  assert(output.includes("> \\[click here\\]\\(https://example\\.test\\)"), "link syntax cannot become an active link");
  assert(output.includes("> \\- injected list"), "list syntax cannot escape the quote presentation");
  assert(output.includes("> &lt;script&gt;alert\\('x'\\)&lt;/script&gt;"), "raw HTML is entity-escaped");
  assert(output.includes("> &gt; false quote"), "nested quote syntax is escaped");
  assert(!output.includes("\n# Executive override"), "quote cannot inject a heading");
  assert(!output.includes("[click here](https://example.test)"), "quote cannot inject a Markdown link");
  assert(!output.includes("<script>"), "quote cannot inject raw HTML");
}
assert(traceableOutput.includes("/audit?project=jsa&amp;select=passage%3Actx-estimate%3Apassage-docufy") || traceableOutput.includes("/audit?project=jsa&select=passage%3Actx-estimate%3Apassage-docufy"));

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
