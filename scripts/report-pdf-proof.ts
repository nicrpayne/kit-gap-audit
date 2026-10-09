import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { savedReportHandoff } from "../lib/reports/savedHandoff";
import { recipientSnapshot } from "../lib/reports/recipientSnapshot";
import { renderReportPdf, ReportPdfError } from "../lib/reports/pdf";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

async function main() {
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const originalWarnings = ["Fictional warning A", "Fictional warning B"];
  brief.evidence.warnings.value = originalWarnings;
  brief.changes.currentness.value.warnings = [...originalWarnings];
  const snapshot = recipientSnapshot(savedReportHandoff([{ id: "fictional-pdf-reality", mode: "reality", briefSnapshot: brief, briefRecipe: recipe }], "fictional-pdf-reality", false));
  assert.deepEqual(snapshot.reports[0].sourceWarnings, originalWarnings, "duplicate warnings deduplicated without changing saved source");
  const r = snapshot.reports[0];
  r.project = "FICTIONAL QA / Harbor Relay";
  r.generatedAt = "2026-10-08T21:00:00.000Z";
  r.outcome = { earliest: "2026-10-14", likely: "2026-10-16", latest: "2026-10-18" };
  r.target = "2026-10-31";
  r.forecastStart = "2026-10-08";
  r.capacityPhases = [{ startDay: 0, teamCapacity: 1 }, { startDay: 7, teamCapacity: 1.5 }];
  r.schedule = [
    { title: "Fictional preparation window", date: "2026-10-08", endDate: "2026-10-15", state: "planned", meaning: "plan", source: "Fictional planning call", evidence: [{ quote: "We plan to prepare this between October 8 and October 15.", source: "fixture-conversation", passage: "paragraph-2" }] },
    { title: "Fictional release target", date: "2026-10-31", endDate: null, state: "planned", meaning: "planning_target", source: "Owner planning target", evidence: [] },
  ];
  const exactQuote = 'We agreed 2–8 days remain for API_V2; **literal** [reference](example.test) \\path <tag> & details. Not a release promise.';
  r.evidence = { capturedAt: r.generatedAt, capabilities: [{ name: "Fictional file upload", excluded: false, references: [{ quote: exactQuote, source: "Fictional refinement call", sourceDate: "2026-09-30", acceptedAt: "2026-10-01", snapshot: "fixture-original-snapshot", evidenceId: "fixture-evidence", locator: { sourceId: "fixture-source", passageId: "fixture-passage", hash: "a".repeat(64), start: 4, end: 140 } }] }] };
  r.estimates = [{ name: "Fictional file upload", authority: "Operator estimate", basis: "Remaining capability effort", range: { low: 2, likely: 5, high: 8 }, quote: "", sourceDate: "2026-10-01", snapshot: "", interpretation: "Reuse is assumed; confirm integration work.", review: "Review required", rawAssertion: "2-5-8 developer-days", usedInSimulation: false, coveredItemIds: ["QA-1"], additionalItemIds: ["QA-2"], reviewer: null, reviewedAt: null }];
  const scenario = structuredClone(r); scenario.reportId = "fictional-pdf-scenario"; scenario.mode = "scenario"; scenario.outcome.likely = "2026-10-15";
  scenario.evidence!.capabilities[0].excluded = true;
  snapshot.comparisonId = "fictional-comparison"; snapshot.reports.push(scenario);
  const before = JSON.stringify(snapshot);
  const pdf = await renderReportPdf(snapshot);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); assert(pdf.byteLength > 20_000);
  assert.equal(JSON.stringify(snapshot), before);
  const out = resolve(process.env.REPORT_PDF_OUTPUT ?? "../outputs/native-pdf-2026-10-08/output/pdf");
  mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, "fictional-leadership-pair.pdf"), pdf);
  const stress = structuredClone(snapshot); stress.reports = [stress.reports[0]]; stress.comparisonId = null;
  const longQuote = Array.from({ length: 32 }, (_, i) => `Paragraph ${i + 1}: This fictional source passage stays readable across a page break. It is evidence, not a new commitment. Brackets [remain] and punctuation \\ **stay literal**.`).join("\n");
  stress.reports[0].evidence!.capabilities[0].references[0].quote = longQuote;
  stress.reports[0].schedule!.push({ title: "Invalid legacy date remains labelled", date: "not exposed by the system", endDate: null, state: "planned", meaning: "plan", source: "Legacy fixture", evidence: [] });
  writeFileSync(resolve(out, "fictional-long-source-proof.pdf"), await renderReportPdf(stress));
  writeFileSync(resolve(out, "expected-text.json"), JSON.stringify({ exactQuote, longQuote, snapshot }, null, 2));
  const unsupported = structuredClone(snapshot); unsupported.reports[0].project = "Unsupported glyph 漢";
  await assert.rejects(renderReportPdf(unsupported), error => error instanceof ReportPdfError && /character/.test(error.message));
  const oversized = structuredClone(snapshot); oversized.reports[0].reason = "x".repeat(2_000_001);
  await assert.rejects(renderReportPdf(oversized), /too large/);
  console.log("PASS native PDF: actual bytes, exact frozen pair projection, deduplicated source warnings, long source and invalid-date handling, size/font fail-safe, immutable input. Visual/text extraction QA remains separate.");
}
main();
