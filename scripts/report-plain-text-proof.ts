import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeMarkdownText, markdownBlockquoteLines, reportMarkdownToPlainText } from "../lib/reports/markdown";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { renderDecisionBriefPlainText } from "../lib/reports/decisionBriefRender";
import { renderAudienceBriefPlainText } from "../lib/reports/audienceBriefRender";
import { buildBriefRecipe } from "../lib/reports/composer";
import { freezeCapabilityEstimate, freezeForecastBasis } from "../lib/reports/forecastBasis";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

const original = 'We agreed 2–8 days for API_V2 (not all features). **literal** [reference](https://example.test) `code` \\path <tag> &lt; & > # - !';
const markdown = `# Heading\n\n**Emphasis** and [navigation](/audit?project=x)\n\n${markdownBlockquoteLines(original).join("\n")}`;
assert.equal(reportMarkdownToPlainText(markdown), `Heading\n\nEmphasis and navigation\n\n> ${original}`);
for (const literal of ["\\-", "\\\\", "*_*", "`one`", "[brackets](x)", "&amp;lt;", "\uE000signalPlain0\uE001", "# heading\n> still source"]) {
  assert.equal(reportMarkdownToPlainText(escapeMarkdownText(literal)), literal, "source characters survive plaintext conversion exactly");
}
const owner = healthyOwnerFixture();
owner.forecast.basis = freezeForecastBasis([], [freezeCapabilityEstimate("jsa", { id: "cap", name: "API_V2", revision: 1 }, {
  id: "estimate", contextSnapshotId: "snapshot-original", capabilityId: "cap", rawEstimate: "2–8 days", range: { low: 2, likely: 5, high: 8 }, unit: "developer_days", basis: "remaining_capability",
  speaker: null, owner: null, observedAt: "2026-09-30", sourceRef: "meeting", excerpt: original, evidenceRefs: ["original-passage"], statement: "Remaining work", confidence: "explicit", acceptedAt: "2026-10-01", acceptedBy: "operator",
}, ["TICKET-1"], "reviewed", { status: "reviewed", interpretation: "Remaining effort", reviewedBy: "Reviewer", reviewedAt: "2026-10-01", coveredItemIds: ["TICKET-1"], additionalItemIds: [], usedInSimulation: true, reviewRequiredReason: null })]);
const brief = assembleDecisionBrief(owner), before = JSON.stringify(brief), recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
for (const text of [renderDecisionBriefPlainText(brief), renderAudienceBriefPlainText(brief, recipe)]) {
  assert(text.includes(original), "original quote punctuation is preserved in real plain-text exports");
  assert(text.includes("TICKET-1") && !text.includes("TICKET\\-1"));
  assert(text.includes("snapshot-original") && !text.includes("snapshot\\-original"));
  assert(!text.includes("&lt;tag&gt;"));
}
assert.equal(JSON.stringify(brief), before, "plaintext export cannot change frozen report data");
// Source-binding guard only; actual clipboard permission behavior requires a
// separate supported browser pass.
const copyComponent = readFileSync(new URL("../components/ReportView.tsx", import.meta.url), "utf8");
assert.match(copyComponent, /catch \{ setCopied\(false\); setManualCopy\(true\); \}/);
assert.match(copyComponent, /role="alert">Clipboard access is unavailable/);
assert.match(copyComponent, /textarea[\s\S]*readOnly value=\{markdown\}/);
console.log("PASS plain-text report export: presentation removed, escaped punctuation/entities decoded once, exact source characters and frozen report preserved");
