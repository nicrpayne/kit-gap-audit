import assert from "node:assert/strict";
import { test } from "node:test";
import type { ForecastSnapshot } from "../../lib/timeline/entries";
import { forecastMemoryAt } from "../../lib/timeline/forecastMemory";

function snapshot(reportId: string, generatedAt: string, likelyDate: string): ForecastSnapshot {
  return {
    reportId,
    scopeId: "fictional-harbor",
    generatedAt,
    earliestDate: "2026-10-20T00:00:00.000Z",
    likelyDate,
    latestDate: "2026-11-15T00:00:00.000Z",
    targetDate: "2026-10-31T00:00:00.000Z",
    confidenceAtTarget: 0.65,
    likelyDateDeltaDays: null,
    shippedCount: 2,
    blockingCount: 1,
    resolvedSinceLastCount: 0,
    summaryMarkdown: "Fictional recorded outlook, not a live forecast.",
  };
}

const first = snapshot("report-a", "2026-10-01T12:00:00.000Z", "2026-10-28T00:00:00.000Z");
const second = snapshot("report-b", "2026-10-08T12:00:00.000Z", "2026-11-02T00:00:00.000Z");

test("Timeline has no remembered forecast before the first saved report", () => {
  assert.equal(forecastMemoryAt([], new Date(first.generatedAt)), null);
  assert.equal(
    forecastMemoryAt([first, second], new Date(Date.parse(first.generatedAt) - 1)),
    null,
  );
});

test("Timeline holds the exact saved report, then steps at its millisecond boundary", () => {
  const series = [first, second];
  // Object identity checks preserve every stored field, not just the headline date.
  assert.equal(forecastMemoryAt(series, new Date(first.generatedAt)), first);
  assert.equal(forecastMemoryAt(series, new Date("2026-10-04T12:00:00.000Z")), first);
  assert.equal(forecastMemoryAt(series, new Date(Date.parse(second.generatedAt) - 1)), first);
  assert.equal(forecastMemoryAt(series, new Date(second.generatedAt)), second);
  assert.equal(forecastMemoryAt(series, new Date("2026-12-01T00:00:00.000Z")), second);
});

test("Timeline projection does not mutate frozen report history or the playhead", () => {
  const series = [structuredClone(first), structuredClone(second)];
  const before = structuredClone(series);
  const at = new Date(second.generatedAt);
  const originalTime = at.getTime();
  for (const report of series) Object.freeze(report);
  Object.freeze(series);

  assert.equal(forecastMemoryAt(series, at), series[1]);
  assert.deepEqual(series, before);
  assert.equal(at.getTime(), originalTime);
});
