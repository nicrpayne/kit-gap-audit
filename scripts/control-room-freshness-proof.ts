import assert from "node:assert/strict";
import { readControlRoomFreshness } from "../lib/control-room/freshness";
import { controlRoomNextAction } from "../lib/control-room/readiness";
import type { ForecastCoverageContract } from "../lib/forecast/coverage";

const now = new Date("2026-10-08T00:30:00.000Z");
const freshness = readControlRoomFreshness({
  now,
  dataReceivedAt: new Date("2026-10-08T00:29:50.000Z"),
  lastReportAt: new Date("2026-09-20T12:00:00.000Z"),
  refreshReceipts: [{
    scopeId: "itrack",
    scopeName: "iTrack",
    lastPackageAt: "2026-10-08T00:28:00.000Z",
    evidenceObservedAt: {
      oldest: "2026-08-05T12:00:00.000Z",
      newest: "2026-10-07T23:55:00.000Z",
    },
    latestRun: { status: "complete", completedAt: "2026-10-08T00:28:30.000Z" },
  }],
  // Earlier Timeline snapshots remain history; they must not replace the
  // current package's own source manifest.
  contextObservedAt: [new Date("2026-06-01T00:00:00.000Z")],
});

assert.equal(freshness.oldestSuccessfulRead?.id, "knowledge-ingestion");
assert((freshness.oldestSuccessfulRead?.ageDays ?? Infinity) < 1 / 24);
const source = freshness.rows.find((row) => row.id === "source-observations");
assert(source && source.ageDays && source.ageDays > 60);
assert.equal(source.at?.toISOString(), "2026-08-05T12:00:00.000Z");
assert.equal(source.kind, "source_observation");
assert.match(source.state, /not sync health/i);
assert.notEqual(freshness.oldestSuccessfulRead?.id, source.id);
assert.equal(freshness.rows.find((row) => row.id === "saved-report")?.kind, "saved_report");

// A new package receipt cannot rewrite its source-owned observation date.
const sourceBefore = source.at?.toISOString();
const afterAnotherPackage = readControlRoomFreshness({
  now: new Date("2026-10-08T00:40:00.000Z"),
  dataReceivedAt: new Date("2026-10-08T00:39:50.000Z"),
  lastReportAt: null,
  refreshReceipts: [{
    scopeId: "itrack",
    scopeName: "iTrack",
    lastPackageAt: "2026-10-08T00:39:00.000Z",
    evidenceObservedAt: {
      oldest: "2026-08-05T12:00:00.000Z",
      newest: "2026-10-07T23:55:00.000Z",
    },
    latestRun: { status: "complete", completedAt: "2026-10-08T00:39:30.000Z" },
  }],
  contextObservedAt: [],
});
assert.equal(afterAnotherPackage.rows.find((row) => row.id === "source-observations")?.at?.toISOString(), sourceBefore);

const missingReceipt = readControlRoomFreshness({
  now,
  dataReceivedAt: now,
  lastReportAt: null,
  refreshReceipts: [{
    scopeId: "itrack",
    scopeName: "iTrack",
    lastPackageAt: null,
    evidenceObservedAt: { oldest: null, newest: null },
    latestRun: null,
    error: "Receipt unavailable",
  }],
  contextObservedAt: [],
});
assert.deepEqual(missingReceipt.missingPackageScopeNames, ["iTrack"]);
assert.equal(missingReceipt.rows.find((row) => row.id === "knowledge-ingestion")?.ageDays, null);

const coverage: ForecastCoverageContract = {
  state: "modeled_subset",
  canonicalForecast: false,
  label: "FORECAST INCOMPLETE — EXECUTION COVERAGE UNRESOLVED",
  reason: "71 current execution items are not classified; 4 open product-shape Decisions",
  caveat: "Unclassified work is excluded.",
  reasons: [
    { code: "execution_work_unmapped", label: "71 current execution items are not classified", count: 71 },
    { code: "shape_decisions_open", label: "4 open product-shape Decisions", count: 4 },
  ],
  census: {
    executionIssueCount: 100,
    modeledExecutionIssueCount: 25,
    outsideExecutionIssueCount: 4,
    unmappedExecutionIssueCount: 71,
    acceptedCapabilityCount: 8,
    mappedAcceptedCapabilityCount: 8,
    openShapeDecisionCount: 4,
    incompleteDependencyCount: 0,
  },
};
const canonicalCoverage: ForecastCoverageContract = {
  ...coverage,
  state: "forecastable",
  canonicalForecast: true,
  label: "CANONICAL DELIVERY FORECAST",
  reason: null,
  caveat: null,
  reasons: [],
  census: { ...coverage.census, unmappedExecutionIssueCount: 0, openShapeDecisionCount: 0 },
};
const next = controlRoomNextAction([
  { scopeId: "jsa", name: "JSA", forecastCoverage: canonicalCoverage, capacityContract: { reconciles: false } },
  { scopeId: "itrack", name: "iTrack", forecastCoverage: coverage, capacityContract: { reconciles: true } },
]);
assert(next);
assert.match(next.title, /^iTrack:/);
assert.match(next.detail, /71 tickets need an in-release or out\/later assignment/i);
assert.match(next.detail, /4 unreviewed product-shape decisions also remain open/i);
assert.match(next.href, /\/scope\?project=itrack/);

console.log(JSON.stringify({
  oldestSuccessfulRead: freshness.oldestSuccessfulRead?.id,
  underlyingSourceAgeDays: Math.floor(source.ageDays),
  sourceDatePreservedAcrossRefresh: sourceBefore,
  readiness: next.detail,
}, null, 2));
