import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportComparison } from "../lib/reports/comparison";
import {
  CANONICAL_REPORT_MODE_WHERE,
  CANONICAL_REPORT_ORDER_ASC,
  CANONICAL_REPORT_ORDER_DESC,
} from "../lib/reports/history";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

function row(id: string, mode: "reality" | "scenario", comparisonId?: string) {
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  brief.identity.mode = mode;
  brief.identity.comparisonId = comparisonId;
  brief.identity.comparisonRequestHash = comparisonId ? `hash:${comparisonId}` : undefined;
  return { id, mode, briefSnapshot: brief };
}
const oldReality = row("r1", "reality", "pair1");
const oldScenario = row("s1", "scenario", "pair1");
const unrelatedReality = row("r2", "reality");
const newReality = row("r3", "reality", "pair2");
const newScenario = row("s3", "scenario", "pair2");
const history = [unrelatedReality, newScenario, newReality, oldScenario, oldReality];
assert.equal(reportComparison(history, "s1")?.reality.id, "r1");
assert.equal(reportComparison(history, "r3")?.scenario.id, "s3");
assert.equal(reportComparison(history, "r2"), null, "standalone report must not borrow another Scenario");
assert.equal(reportComparison([oldScenario, unrelatedReality], "s1"), null, "orphan pair is not silently completed");
assert.equal(reportComparison([oldScenario, oldReality, row("duplicate", "reality", "pair1")], "s1"), null);
const otherProject = row("other", "reality", "pair1");
otherProject.briefSnapshot.identity.project.value.id = "different-project";
assert.equal(reportComparison([oldScenario, otherProject], "s1"), null);
assert.equal(reportComparison([row("legacyR", "reality"), row("legacyS", "scenario")], "legacyS"), null);
const mismatched = row("mismatch", "scenario", "pair1");
mismatched.briefSnapshot.identity.comparisonRequestHash = "different-request";
assert.equal(reportComparison([oldReality, mismatched], "mismatch"), null);
mismatched.briefSnapshot.identity.comparisonRequestHash = "hash:pair1";
mismatched.briefSnapshot.identity.realityRevision += 1;
assert.equal(reportComparison([oldReality, mismatched], "mismatch"), null);

assert.deepEqual(CANONICAL_REPORT_MODE_WHERE, { OR: [{ mode: "reality" }, { mode: null }] });
assert.deepEqual(CANONICAL_REPORT_ORDER_DESC, [{ generatedAt: "desc" }, { id: "desc" }]);
assert.deepEqual(CANONICAL_REPORT_ORDER_ASC, [{ generatedAt: "asc" }, { id: "asc" }]);
for (const path of [
  "../lib/reports/readModel.ts",
  "../lib/timeline/entries.ts",
  "../app/api/instrument/project/route.ts",
  "../app/api/forecast/route.ts",
  "../lib/context/envelope.ts",
  "../app/api/forecast/ask/route.ts",
  "../lib/forecast/compute.ts",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /CANONICAL_REPORT_MODE_WHERE/, `${path} must exclude hypothetical Scenario rows from canonical history`);
  assert.match(source, /CANONICAL_REPORT_ORDER_(?:ASC|DESC)/, `${path} must break equal generatedAt ties deterministically`);
}
const generationSource = readFileSync(new URL("../lib/reports/generate.ts", import.meta.url), "utf8");
assert.match(generationSource, /options\?: \{ mode\?: "reality"; recipe\?: unknown \}/,
  "standalone report generation must be reality-only at the typed boundary");
assert.match(generationSource, /requestedMode !== undefined && requestedMode !== "reality"[\s\S]*atomic Reality\/Scenario pair/,
  "untyped or stale Scenario/comparison callers must fail before standalone persistence");
assert.match(generationSource, /pg_advisory_xact_lock\([\s\S]*?\)::text AS lock_result/,
  "the transaction lock must return a Prisma-supported scalar instead of PostgreSQL void");
console.log("PASS: comparisons use the selected explicit same-project pair; unrelated, orphaned, ambiguous and legacy reports are not mispaired.");
