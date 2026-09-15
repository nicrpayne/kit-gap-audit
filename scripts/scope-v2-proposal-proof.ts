import assert from "node:assert/strict";
import type { LinearIssueSummary } from "../lib/linear";
import { compileScopeProposal, type ProposalCapability } from "../lib/scope/proposal";

const updatedAt = "2026-09-15T18:30:00.000Z";
const issue = (
  identifier: string,
  title: string,
  parentIdentifier: string | null = null,
  parentTitle: string | null = null,
): LinearIssueSummary => ({
  identifier,
  url: `https://linear.example/${identifier}`,
  title,
  description: null,
  state: "Todo",
  stateType: "unstarted",
  estimate: 2,
  assignee: "Proof Owner",
  labels: [],
  completedAt: null,
  updatedAt,
  parentIdentifier,
  parentTitle,
  projectName: "Job Safety Analysis",
});

const clusters = [
  { parent: ["SOF-904", "Notifications"], children: ["SOF-912", "SOF-913", "SOF-914", "SOF-915", "SOF-916"] },
  { parent: ["SOF-747", "PDF / Docufy output"], children: ["SOF-748", "SOF-917", "SOF-918", "SOF-919"] },
  { parent: ["SOF-857", "Offline support"], children: ["SOF-920", "SOF-921", "SOF-922", "SOF-923", "SOF-924", "SOF-925", "SOF-926", "SOF-927"] },
  { parent: ["SOF-903", "Submission and Job-Lead Approvals"], children: ["SOF-907", "SOF-908", "SOF-909", "SOF-910", "SOF-911"] },
] as const;

const issues: LinearIssueSummary[] = clusters.flatMap(({ parent: [parentId, parentTitle], children }) => [
  issue(parentId, parentTitle),
  ...children.map((identifier, index) => issue(identifier, `${parentTitle} implementation ${index + 1}`, parentId, parentTitle)),
]);

const capabilities: ProposalCapability[] = [
  ["notifications", "Notifications"],
  ["pdf", "PDF generation"],
  ["offline", "Offline support"],
  ["approvals", "Submission and Job-Lead Approval"],
].map(([id, name]) => ({ id, name, description: `${name} product capability`, status: "accepted", revision: 3, workLinks: [] }));

const compiled = compileScopeProposal({
  includeTriage: false,
  issues,
  capabilities,
  generatedAt: new Date("2026-09-15T19:00:00.000Z"),
  snapshot: {
    id: "snapshot-jsa-current",
    packageId: "jsa-context",
    packageVersion: "1.0",
    producer: "proof",
    contextHash: "sha256-proof",
    createdAt: new Date("2026-09-15T18:45:00.000Z"),
    completenessSummary: { complete: true },
    package: {
      generatedAt: "2026-09-15T18:40:00.000Z",
      derivedClaims: clusters.map(({ parent: [identifier, title] }) => ({
        id: `claim-${identifier}`,
        kind: "release_requirement",
        statement: `${identifier} ${title} is in scope for the beta release`,
        evidenceRefs: [`linear:${identifier}`],
        extra: { disposition: "accepted" },
      })),
      intelligenceObjects: [],
    },
  },
});

assert.equal(compiled.items.length, 4, "the four live-data hierarchy clusters stay first-class");
assert.equal(compiled.summary.confidentlyMatched, 4);
assert.equal(compiled.summary.likelyIn, 4);
assert.equal(compiled.summary.unresolved, 0);

for (const { parent: [parentId], children } of clusters) {
  const proposal = compiled.items.find((item) => item.provenance.linearParent?.identifier === parentId);
  assert.ok(proposal, `${parentId} should produce one proposal`);
  assert.equal(proposal.action, "link_existing");
  assert.equal(proposal.confidence, "high");
  assert.deepEqual(proposal.workItemIds, [...children].sort());
  assert.ok(!proposal.workItemIds.some((workId: string) => workId === parentId), `${parentId} must not double-count beside its children`);
}

const pdf = compiled.items.find((item) => item.provenance.linearParent?.identifier === "SOF-747");
assert.equal(pdf?.targetCapabilityId, "pdf", "Docufy/PDF normalization should map without identifier hardcoding");
assert.equal(compiled.sourceWatermark.contextSnapshotId, "snapshot-jsa-current");
assert.equal(compiled.sourceWatermark.linearIssueCount, 26);

const changedTitle = compileScopeProposal({
  includeTriage: false,
  issues: [issue("ALT-1", "Alerts"), issue("ALT-2", "Alert delivery", "ALT-1", "Alerts")],
  capabilities: [{ id: "alert-cap", name: "Alerts", description: null, status: "accepted", revision: 1, workLinks: [] }],
  snapshot: null,
  generatedAt: new Date("2026-09-15T19:00:00.000Z"),
});
assert.equal(changedTitle.items[0].targetCapabilityId, "alert-cap", "compiler behavior follows source semantics, not JSA identifiers");

console.log(JSON.stringify({
  ok: true,
  clusters: compiled.items.map((item) => ({ parent: item.provenance.linearParent?.identifier, target: item.targetCapabilityId, workItems: item.workItemIds.length, confidence: item.confidence })),
  parentChildDoubleCount: false,
  deterministicFingerprint: compiled.fingerprint,
}, null, 2));
