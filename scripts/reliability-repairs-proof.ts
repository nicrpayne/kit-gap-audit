import assert from "node:assert/strict";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { buildBriefRecipe } from "../lib/reports/composer";
import { savedReportHandoff } from "../lib/reports/savedHandoff";
import { timelineClaims, dateFromEvidence, endDateFromEvidence } from "../lib/timeline/candidates";
import { packPlanRows, planHitExtent, labelWidth } from "../lib/timeline/plan";
import { compileScopeProposal } from "../lib/scope/proposal";
import type { LinearIssueSummary } from "../lib/linear";
import type { ProjectContextPackage } from "../lib/context/package";

const owner = healthyOwnerFixture();
owner.timeline.events = [
  { id: "span", title: "Integration activity", date: "2026-10-08", endDate: "2026-10-12", temporalState: "planned", kind: "phase", sourceLabel: "QA meeting", semanticState: "planned", contextSnapshotId: "quote-snapshot", evidence: [{ passageId: "q1", quote: "Integration runs October 8 through October 12.", sourceRef: "qa-meeting" }] },
  { id: "review", title: "Review", date: "2026-10-15", endDate: null, temporalState: "planned", kind: "milestone", sourceLabel: "QA meeting" },
  { id: "release", title: "Release conversation", date: "2026-10-22", endDate: null, temporalState: "planned", kind: "milestone", sourceLabel: "QA meeting" },
];
const reality = assembleDecisionBrief(owner);
const scenario = structuredClone(reality);
reality.identity.comparisonId = scenario.identity.comparisonId = "pair";
reality.identity.comparisonRequestHash = scenario.identity.comparisonRequestHash = "hash";
scenario.identity.mode = "scenario";
const rows = [reality, scenario].map((brief, index) => ({ id: String(index), mode: brief.identity.mode, briefSnapshot: brief, briefRecipe: buildBriefRecipe("delivery-leadership", "weekly-update", brief) }));
const bundle = savedReportHandoff(rows, "1", true);
assert.equal(bundle.reports.length, 2);
assert.equal(bundle.reports[0].briefSnapshot.timeline.schedule?.value.events.length, 3);
assert.equal(bundle.reports[0].briefSnapshot.timeline.schedule?.value.events[0].endDate, "2026-10-12");
assert.equal(bundle.reports[0].briefSnapshot.timeline.schedule?.value.events[0].evidence?.[0].quote, "Integration runs October 8 through October 12.");
assert(bundle.reports[0].recipe.modules.some((module) => module.id === "timeline"));
owner.timeline.events[0].title = "Changed owner";
assert.equal(bundle.reports[0].briefSnapshot.timeline.schedule?.value.events[0].title, "Integration activity");
assert.throws(() => savedReportHandoff([rows[0]], "0", true), /same-baseline/);
assert.throws(() => savedReportHandoff([{ ...rows[0], briefRecipe: null }], "0", false), /historical/);
const mismatch = structuredClone(rows);
mismatch[1].briefSnapshot.identity.comparisonRequestHash = "different";
assert.throws(() => savedReportHandoff(mismatch, "0", true), /same-baseline/);

const pkg = {
  derivedClaims: [{ id: "plan", kind: "milestone", statement: "Integration", evidenceRefs: ["quote"], extra: { fields: { startDate: "2026-10-08", endDate: "2026-10-12" } } }],
  intelligenceObjects: [
    { id: "head", intelligenceType: "Commitment", isCurrent: true, statement: "Review", evidenceRefs: ["review"], fields: { target_date: "2026-10-15" } },
    { id: "old", intelligenceType: "Milestone", isCurrent: false, statement: "Old release", fields: { target_date: "2026-09-01" } },
    { id: "dateless", intelligenceType: "Commitment", isCurrent: true, statement: "Possibly next week", observedDate: "2026-10-03", fields: {} },
  ],
} as unknown as ProjectContextPackage;
const claims = timelineClaims(pkg);
assert.deepEqual(claims.map((claim) => claim.id), ["plan", "head"]);
assert.equal(dateFromEvidence(claims[0].schedule)?.toISOString().slice(0, 10), "2026-10-08");
assert.equal(endDateFromEvidence(claims[0].schedule)?.toISOString().slice(0, 10), "2026-10-12");
assert.equal(dateFromEvidence({ observedDate: "2026-10-03", retrieved_date: "2026-10-03" }), null);
const extent = planHitExtent(50, 70, "Integration activity", true, true);
const pin = planHitExtent(76, 76 + labelWidth("Review", true), "Review", true, false);
assert.notEqual(packPlanRows([{ id: "span", ...extent }, { id: "pin", ...pin }]).rowOf.get("span"), packPlanRows([{ id: "span", ...extent }, { id: "pin", ...pin }]).rowOf.get("pin"));

const issue = (identifier: string, parentIdentifier: string | null = null): LinearIssueSummary => ({
  identifier, parentIdentifier, parentTitle: parentIdentifier ? "Opaque parent" : null, title: "Opaque execution work", description: null,
  url: "", estimate: 2, state: "Todo", stateType: "unstarted", labels: [], assignee: null, completedAt: null, updatedAt: null, projectName: "QA",
});
const base = {
  includeTriage: false, activeReleaseNames: ["QA"],
  issues: [issue("QA-1"), issue("QA-2", "QA-1"), issue("QA-3", "QA-1"), issue("QA-9")],
  capabilities: [{ id: "maps", name: "Maps", description: null, status: "accepted", revision: 1, workLinks: [] }],
  snapshot: { id: "snap", packageId: "p", packageVersion: "1.1", producer: "qa", contextHash: "h", createdAt: new Date(), completenessSummary: {}, package: { intelligenceObjects: [{ id: "mapping", intelligenceType: "Decision", statement: "Maps in QA", isCurrent: true, fields: { capability: "Maps", linear_issue_ids: ["QA-1"] } }] } },
};
const mapped = compileScopeProposal(base).items.find((item) => item.targetCapabilityId === "maps")!;
assert.deepEqual(mapped.workItemIds, ["QA-2", "QA-3"], "explicit parent maps remaining leaves once");
assert(!mapped.workItemIds.includes("QA-9"), "unrelated work stays unclaimed");
base.snapshot.package.intelligenceObjects[0].fields.linear_issue_ids = ["QA-2"];
assert.deepEqual(compileScopeProposal(base).items.find((item) => item.targetCapabilityId === "maps")!.workItemIds, [], "one child does not claim its siblings");
console.log("PASS reliability repairs: immutable saved pair, full schedule and quote, recipe, mismatched pair rejection, structured Timeline intake, no meeting-date inference, hit packing, explicit hierarchy mapping");
