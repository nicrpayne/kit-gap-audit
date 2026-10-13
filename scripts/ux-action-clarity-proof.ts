import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { secondaryActionsFor } from "../lib/audit/actions";
import type { TruthFinding } from "../lib/audit/truth";
import { groupAuditPassages } from "../lib/audit/evidenceDisplay";

// Deterministic action/copy contracts. Browser checks separately verify
// discoverability, focus, successful writes and failed-request recovery.
const secondary = secondaryActionsFor({ laneId: "linear" } as TruthFinding);
const passages = [
  { id: "a", excerpt: "Exact statement.", sourceRef: "same-conversation", observedAt: "2026-09-01", kind: "evidence" },
  { id: "b", excerpt: "Exact statement.", sourceRef: "same-conversation", observedAt: "2026-09-02", kind: "evidence" },
  { id: "c", excerpt: "Exact statement.", sourceRef: "different-conversation", kind: "evidence" },
  { id: "d", excerpt: "Exact statement.", kind: "evidence" },
  { id: "e", excerpt: "Exact statement.", kind: "evidence" },
];
const originalPassages = JSON.stringify(passages);
const groups = groupAuditPassages(passages);
assert.equal(groups.length, 4);
assert.deepEqual(groups[0].records.map(record => record.observedAt), ["2026-09-01", "2026-09-02"]);
assert.equal(JSON.stringify(passages), originalPassages, "grouping never rewrites quotes, records, dates or source identity");
assert.deepEqual(secondary.map(action => action.id), ["need_more_evidence", "reject"]);
assert.equal(secondary[0].label, "Mark for this session");
assert.match(secondary[0].doesNotWrite, /not saved/);
assert.match(secondary[1].writes, /dismissed with the reason/);
const read = (path: string) => readFileSync(path, "utf8");
const audit = read("components/audit/AuditReviewConsole.tsx");
assert.match(audit, /Not saved; leaving the review may clear it/);
assert.match(audit, /Clear session reminder/);
const refresh = read("components/audit/AuditRefreshControl.tsx");
assert.match(refresh, />How to add evidence<\/button>/);
const sources = read("components/audit/AuditChangeInbox.tsx");
assert.match(sources, /href=\{`\/scopes\?project=/);
assert.match(sources, /Managed by the upstream wiki intake/);
assert.match(sources, /const selectedCanReview = selected\?\.canReview === true/);
assert.match(sources, /Review the newer proposal/);
assert.match(sources, /HISTORICAL PROPOSAL · NOT APPLIED/);
assert.match(sources, /Proposed object status/);
assert.match(sources, /Refresh status could not be read\. Try again to check the running refresh/);
const orbit = read("components/OrbitPageClient.tsx");
for (const label of ['title="Dependencies"', "Assume answered in Scenario", "Try removing from Scenario", "Accepted Reality stays unchanged."]) assert(orbit.includes(label));
assert(!orbit.includes("Scope.dependsOnScopeIds"));
assert(orbit.includes("<summary className=\"cursor-pointer\">Technical reference</summary>"));
assert(!read("components/instrument/FeatureDetail.tsx").includes('["Beta", "Production", "Later"]'));
const reports = read("components/ReportsPageClient.tsx");
assert.match(reports, /Download saved brief data \(\.json\)/);
// Preserve actual owner-authenticated buffered routes, not replacement mocks.
for (const route of ["print", "share-preview"]) assert(read(`pages/reports/[reportId]/${route}.tsx`).includes("getServerSideProps"));
const saved = read("components/instrument/SavedScenarios.tsx");
assert.match(saved, /workspace\.scenarioDirty \? "Unsaved edits will be lost\." : "There are no unsaved Scenario edits\."/);
assert.match(saved, /Confirm return to Reality/);
const importTool = read("components/decisions/DecisionTools.tsx");
assert.match(importTool, /if \(response\.ok\) \{ setText\(""\); setImported\(true\); \}/);
assert.match(importTool, /Done — review on Decisions/);
assert.match(importTool, /!res\.ok \|\| body\.error/);
assert.match(importTool, /!text\.trim\(\) \|\| !scopeId \|\| reading \|\| busy \|\| pending/);
const timeline = read("components/timeline/TimelineInspector.tsx");
assert.match(timeline, /No structured date was supplied with this evidence/);
assert.match(timeline, /not an interpretation of the quote/);
assert(!timeline.includes("Nothing in the evidence says when"));
assert(read("app/api/reports/[id]/pdf/route.ts").includes('requireReportOwner(req, false, "downloading private reports")'));
console.log("PASS UX action contracts: honest temporary actions, source destinations, Scenario labels, import recovery, saved-state copy and real report routes");
