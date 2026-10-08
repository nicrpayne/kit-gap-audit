import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyReportLiveForecast,
  comparisonAttemptAfterHistoryRefresh,
  mergeReportReceipts,
  parseReportHistoryEnvelope,
  reportsFromMutationReceipt,
  type ClientReportRow,
} from "../lib/reports/clientLifecycle";

function report(id: string, mode: "reality" | "scenario", generatedAt = "2026-10-07T20:12:00.000Z"): ClientReportRow {
  return {
    id,
    generatedAt,
    targetDate: "2026-11-15T00:00:00.000Z",
    likelyDate: "2026-11-12T00:00:00.000Z",
    confidenceAtTarget: 70,
    likelyDateDeltaDays: null,
    shippedCount: 2,
    blockingCount: 1,
    resolvedSinceLastCount: 0,
    summaryMarkdown: `# ${mode}`,
    briefVersion: "decision-brief.v1",
    briefSnapshot: { identity: { mode } },
    mode,
    recipeVersion: "brief-recipe.v1",
    briefRecipe: {},
    presentationVersion: "brief-presentation.v1",
    scenarioSnapshot: mode === "scenario" ? {} : null,
  };
}

// Every failed live read is unavailable, independent of provider wording.
assert.equal(classifyReportLiveForecast(null), "pending");
assert.equal(classifyReportLiveForecast({ state: "loading" }), "pending");
assert.equal(classifyReportLiveForecast({ state: "error", reason: "FORECAST UNAVAILABLE — no capacity" }), "unavailable");
assert.equal(classifyReportLiveForecast({ state: "error", reason: "forecast unavailable (500)" }), "unavailable");
assert.equal(classifyReportLiveForecast({ state: "error", reason: "Failed to fetch" }), "unavailable");
assert.equal(classifyReportLiveForecast({ state: "ready", coverageState: "modeled_subset" }), "incomplete");
assert.equal(classifyReportLiveForecast({ state: "ready", coverageState: "forecastable" }), "ready");

const reality = report("report-reality", "reality");
const scenario = report("report-scenario", "scenario");
assert.deepEqual(parseReportHistoryEnvelope({ reports: [reality, scenario] }), [reality, scenario]);
assert.throws(() => parseReportHistoryEnvelope({ error: "database offline" }), /did not contain a report list/);
assert.throws(() => parseReportHistoryEnvelope({ reports: [{ ...reality, likelyDate: null }] }), /invalid saved report row/);

assert.deepEqual(reportsFromMutationReceipt({ report: reality }), [reality]);
assert.deepEqual(
  reportsFromMutationReceipt({
    report: scenario,
    reality: { report: reality },
    scenario: { report: scenario },
  }),
  [scenario, reality],
  "an atomic comparison receipt must install both rows without duplicating the spread scenario row",
);
assert.deepEqual(reportsFromMutationReceipt({ report: { id: "broken" } }), [], "an invalid receipt row must never enter history state");

const merged = mergeReportReceipts(
  [report("older", "reality", "2026-10-06T20:12:00.000Z"), scenario],
  [scenario, reality],
);
assert.equal(new Set(merged.map((row) => row.id)).size, merged.length);
assert.deepEqual(merged.slice(0, 2).map((row) => row.id), ["report-reality", "report-scenario"]);

const attempt = { signature: "scope+snapshot", id: "scenario-stable-1" };
assert.equal(comparisonAttemptAfterHistoryRefresh(attempt, false), attempt, "failed history refresh must retain the stable replay id");
assert.equal(comparisonAttemptAfterHistoryRefresh(attempt, true), null, "validated history refresh may release the retry id");

// Production binding guards. This is Node/source evidence, not browser QA.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(`${repoRoot}/components/ReportsPageClient.tsx`, "utf8");
assert.match(source, /const liveGate = classifyReportLiveForecast\(live\)/);
assert.match(source, /if \(!res\.ok\) throw new Error\(responseErrorMessage\(body,/);
assert.match(source, /const nextReports = parseReportHistoryEnvelope\(body\)/);
assert.match(source, /installMutationReceipts\(body\);[\s\S]*refreshAfterPersist/);
assert.match(source, /comparisonAttempt\.current = comparisonAttemptAfterHistoryRefresh\(comparisonAttempt\.current, refreshed\)/);

console.log(JSON.stringify({
  result: "REPORT CLIENT LIFECYCLE VERIFIED (NODE ONLY)",
  liveErrors: "all unavailable regardless of message wording",
  history: "error and malformed envelopes rejected before state",
  postSuccess: "validated receipts survive refresh failure",
  comparisonRetry: attempt.id,
  browserAcceptance: false,
}, null, 2));
