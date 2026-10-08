import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { freezeScopeEvidence } from "../lib/reports/scopeEvidence";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { normalizeReportJsonForPersistence } from "../lib/reports/persistenceNormalization";
import { renderDecisionBriefMarkdown } from "../lib/reports/decisionBriefRender";
import { renderAudienceBriefMarkdown } from "../lib/reports/audienceBriefRender";
import { buildBriefRecipe } from "../lib/reports/composer";
import { buildInteractiveBriefBundle } from "../lib/reports/presentation";
import ReportScopeEvidence from "../components/reports/ReportScopeEvidence";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { markdownInlineText } from "../lib/reports/markdown";

const quote = 'The dashboard is agreed.\n<script>alert("untrusted")</script>\n[link](javascript:alert(1))';
const acceptedAt = "2026-10-01T12:00:00.000Z";
const capturedAt = "2026-10-08T12:00:00.000Z";
const provenance = { boundary: "human_accepted_bootstrap", sourceCandidateId: "candidate", evidenceRefs: ["quote", "missing"], evidence: [{ ref: "operator-note", statement: "unverified operator attachment" }] };
const activationSnapshot = {
  id: "original-snapshot", scopeId: "jsa", createdAt: acceptedAt,
  package: {
    version: "1.1", packageId: "original-package", producer: "manual", scopeId: "jsa", generatedAt: acceptedAt,
    sources: [{ sourceType: "transcript", sourceRef: "fixture://meeting", registrationId: null, role: "raw_evidence", status: "active", observedAt: acceptedAt, succeeded: true, detail: null }],
    evidence: [{ id: "quote", sourceRef: "fixture://meeting", kind: "bootstrap_evidence", excerpt: quote, data: { occurredAt: "2026-09-29", charStart: 3, charEnd: 89, offsetUnit: "utf16_code_unit" }, passageHash: "exact-hash" }],
    derivedClaims: [{ id: "bootstrap-accepted:candidate", kind: "capability", statement: "Agreed dashboard", evidenceRefs: ["quote"] }],
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
  },
};
const capability = { id: "capability", scopeId: "jsa", name: "Dashboard <img src=x>", revision: 4, status: "accepted", provenance };
const input = { scopeId: "jsa", capturedAt, activationSnapshot, capabilities: [capability, { ...capability, id: "foreign", scopeId: "other" }, { ...capability, id: "outside", status: "outside" }] };
const receipts = freezeScopeEvidence(input);
assert.equal(receipts.capabilities.length, 1, "only this Scope's accepted capabilities");
const exact = receipts.capabilities[0].references.find(ref => ref.evidenceId === "quote")!;
assert.equal(exact.capture?.excerpt, quote);
assert.equal(exact.capture?.sourceDate, "2026-09-29");
assert.equal(exact.capture?.acceptedAt, acceptedAt);
assert.equal(receipts.capturedAt, capturedAt, "source, acceptance and generation times stay distinct");
assert.equal(exact.capture?.locator.quoteHash, "exact-hash");
assert.equal(exact.capture?.locator.charStart, 3);
const href = new URL(exact.auditHref!, "https://signal.example");
assert.equal(href.searchParams.get("project"), "jsa");
assert.equal(href.searchParams.get("select"), "passage:original-snapshot:quote");
assert.equal(receipts.capabilities[0].references.find(ref => ref.evidenceId === "missing")?.auditHref, null);
for (const origin of [null, { ...activationSnapshot, scopeId: "other" }, { ...activationSnapshot, package: { ...activationSnapshot.package, scopeId: "other" } }]) {
  assert(freezeScopeEvidence({ ...input, activationSnapshot: origin }).capabilities[0].references.every(ref => ref.capture === null && ref.auditHref === null), "missing/foreign origin never gets a fallback quote or Audit link");
}
assert(freezeScopeEvidence({ ...input, capabilities: [{ ...capability, provenance: { ...provenance, boundary: "operator" } }] }).capabilities[0].references.every(ref => !ref.capture));
const owner = healthyOwnerFixture();
owner.scopeEvidence = receipts;
const brief = assembleDecisionBrief(owner);
const baseline = JSON.stringify(brief);
activationSnapshot.package.evidence[0].excerpt = "Newer source cannot overwrite a saved quote";
provenance.evidence[0].statement = "Changed operator reference";
receipts.capabilities[0].name = "Later name";
assert.equal(JSON.stringify(brief), baseline, "assembler clones nested receipt; source changes leave the report unchanged");
const persisted = normalizeReportJsonForPersistence(brief);
assert.deepEqual(persisted.evidence.scopeReceipts, brief.evidence.scopeReceipts);
const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
if (!recipe.modules.some(module => module.id === "evidence")) recipe.modules.push({ id: "evidence", density: "expanded" });
for (const markdown of [renderDecisionBriefMarkdown(brief), renderAudienceBriefMarkdown(brief, recipe)]) {
  assert(markdown.includes("Accepted Scope evidence"));
  assert(markdown.includes("not evidence for an operator-entered numerical estimate"));
  assert(markdown.includes("Reference only; no verified captured quote"));
  assert(markdown.includes("&lt;script&gt;"));
  assert(!markdown.includes('<script>'));
  assert(markdown.includes(markdownInlineText("exact-hash")));
  assert(markdown.includes(exact.auditHref!));
}
const html = renderToStaticMarkup(<ReportScopeEvidence receipts={brief.evidence.scopeReceipts} />);
assert(html.includes("&lt;script&gt;"));
assert(!html.includes("<script>") && !html.includes("<img"));
assert(html.includes("not evidence for an operator-entered numerical estimate"));
assert(html.includes("original-snapshot") && html.includes("exact-hash"));
const bundle = buildInteractiveBriefBundle(brief, recipe);
assert.deepEqual(bundle.briefSnapshot.evidence.scopeReceipts, brief.evidence.scopeReceipts);
assert(bundle.permittedReferences.some(ref => ref.href === exact.auditHref && ref.owner === "Scope"));
const scenario = structuredClone(brief);
scenario.evidence.scopeReceipts!.capabilities[0].excludedFromScenario = true;
assert(renderToStaticMarkup(<ReportScopeEvidence receipts={scenario.evidence.scopeReceipts} />).includes("REMOVED IN THIS SCENARIO"));
assert(renderAudienceBriefMarkdown(scenario, recipe).includes("REMOVED IN THIS SCENARIO"));
assert.equal(JSON.stringify(brief), baseline, "Scenario rendering does not rewrite Reality");
const legacy = assembleDecisionBrief(healthyOwnerFixture());
assert.equal(legacy.evidence.scopeReceipts, undefined);
assert(renderToStaticMarkup(<ReportScopeEvidence />).includes("not backfilled"));
assert(renderDecisionBriefMarkdown(legacy).includes("not backfilled"));
console.log("PASS frozen Scope receipts: ownership, immutable origin, exact quote/date/locator, reference-only, source/estimate boundaries, legacy behavior, Scenario labeling, inert HTML/Markdown and handoff");
