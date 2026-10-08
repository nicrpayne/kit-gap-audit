import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeSnapshot, withSnapshotProvenance } from "../lib/reports/snapshot";

// Browser regression: a newly saved Nov 6 Scenario was labeled stale against
// its paired Nov 18 Reality report even though no inputs had changed.
const generatedAt = new Date("2026-10-08T14:42:43.016Z");
const snapshotLikelyDate = new Date("2026-11-06T00:00:00.000Z");
for (const live of ["2026-11-18", "2026-10-20", "2026-11-06", null]) {
  const verdict = describeSnapshot({
    mode: "scenario", generatedAt, snapshotLikelyDate,
    liveLikelyDate: live ? new Date(`${live}T00:00:00.000Z`) : null,
    liveUnavailableReason: live ? null : "Current Reality unavailable",
  });
  assert.equal(verdict.stale, false, "Reality cannot prove Scenario staleness");
  assert.equal(verdict.deltaDays, null, "cross-mode dates are not a freshness delta");
  assert.match(verdict.line, /Nov 6, 2026 under its saved hypothetical assumptions/);
  assert.match(verdict.line, /Current Scenario freshness has not been checked/);
  assert.doesNotMatch(verdict.line, /current forecast|days? (later|earlier)|still says/i);
  const copied = withSnapshotProvenance("Frozen Scenario body", verdict);
  assert.match(copied, /saved hypothetical assumptions/);
  assert.match(copied, /Current Scenario freshness has not been checked/);
  assert.match(copied, /Frozen Scenario body$/);
}

for (const mode of ["reality", null, undefined] as const) {
  const stale = describeSnapshot({
    mode, generatedAt, snapshotLikelyDate,
    liveLikelyDate: new Date("2026-11-18T00:00:00.000Z"),
  });
  assert.equal(stale.stale, true, "Reality and legacy snapshots retain drift warnings");
  assert.equal(stale.deltaDays, 12);
  assert.match(stale.line, /12 days later/);
  const unchanged = describeSnapshot({ mode, generatedAt, snapshotLikelyDate, liveLikelyDate: snapshotLikelyDate });
  assert.equal(unchanged.stale, false);
  assert.equal(unchanged.deltaDays, 0);
  assert.match(unchanged.line, /current forecast still says/);
}

const client = readFileSync("components/ReportsPageClient.tsx", "utf8");
assert.match(client, /describeSnapshot\(\{\s*mode: selected\.mode === "scenario" \? "scenario" : "reality",/,
  "the selected persisted report mode must reach the shared banner/copy helper");
console.log("PASS: Scenario provenance never infers staleness from Reality; copied text agrees; Reality and legacy drift warnings remain.");
