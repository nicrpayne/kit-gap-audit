import assert from "node:assert/strict";
import type { LinearIssueSummary } from "../lib/linear";
import { compileScopeProposal, type ProposalCapability } from "../lib/scope/proposal";

const updatedAt = "2026-09-15T18:30:00.000Z";
const issue = (identifier: string, title: string, parentIdentifier: string | null = null, parentTitle: string | null = null): LinearIssueSummary => ({
  identifier, url: `https://linear.example/${identifier}`, title, description: null, state: "Todo", stateType: "unstarted", estimate: 2,
  assignee: "Proof Owner", labels: [], completedAt: null, updatedAt, parentIdentifier, parentTitle, projectName: "Job Safety Analysis",
});
const cluster = (parentId: string, parentTitle: string, children: string[]) => [
  issue(parentId, parentTitle),
  ...children.map((identifier, index) => issue(identifier, `${parentTitle} implementation ${index + 1}`, parentId, parentTitle)),
];

const expectedClusters = [
  { parent: "SOF-904", title: "People are notified when a JSA needs their attention", target: "notifications", children: ["SOF-912", "SOF-913", "SOF-914", "SOF-915", "SOF-916"] },
  { parent: "SOF-747", title: "Convert JSA into a stored PDF", target: "pdf", children: ["SOF-748", "SOF-917", "SOF-918", "SOF-919"] },
  { parent: "SOF-857", title: "Work on Draft JSA while offline", target: "offline", children: ["SOF-920", "SOF-921", "SOF-922", "SOF-923", "SOF-924", "SOF-925", "SOF-926", "SOF-927"] },
  { parent: "SOF-903", title: "Job Leads can review and decide on a submitted JSA", target: "approvals", children: ["SOF-907", "SOF-908", "SOF-909", "SOF-910", "SOF-911"] },
] as const;

const issues: LinearIssueSummary[] = [
  ...expectedClusters.flatMap(({ parent, title, children }) => cluster(parent, title, [...children])),
  ...cluster("LIN-100", "Telemetry housekeeping", ["LIN-101"]),
  ...cluster("LIN-200", "Audit export", ["LIN-201"]),
];
const capabilities: ProposalCapability[] = [
  ["notifications", "JSA notifications"], ["pdf", "PDF / Docufy output"], ["offline", "Offline support"], ["approvals", "Submission and job-lead approvals"],
  ["crew", "Crew acknowledgment"], ["audit", "Audit export"],
].map(([id, name]) => ({ id, name, description: `${name} accepted outcome`, status: "accepted", revision: 3, workLinks: [] }));

const intelligenceObjects = [
  ...expectedClusters.map(({ parent, target }) => ({
    id: `intel-${target}`, intelligenceType: "Decision", trust: "external_intelligence", isCurrent: true,
    statement: `${parent} is confirmed in scope for the V1 release.`, status: "decided", scope: ["jsa", target], evidenceRefs: [`evidence-${target}`],
    fields: { capability: capabilities.find((capability) => capability.id === target)!.name },
  })),
  {
    id: "intel-field-annotations", intelligenceType: "Opportunity", trust: "external_intelligence", isCurrent: true,
    statement: "Field annotations must ship in the V1 release.", status: "accepted", scope: ["jsa", "field-annotations"], evidenceRefs: ["evidence-field"],
    fields: { capability: "Field annotations" },
  },
  {
    id: "intel-analytics", intelligenceType: "Decision", trust: "external_intelligence", isCurrent: true,
    statement: "Advanced analytics is deferred and out of scope for this release.", status: "deferred", scope: ["jsa", "analytics"], evidenceRefs: ["evidence-analytics"],
    fields: { capability: "Advanced analytics" },
  },
  {
    id: "intel-audit-conflict", intelligenceType: "Decision", trust: "external_intelligence", isCurrent: true,
    statement: "Audit export is confirmed out of scope and deferred until later.", status: "deferred", scope: ["jsa", "audit-export"], evidenceRefs: ["evidence-audit"],
    fields: { capability: "Audit export" },
  },
];

const input = {
  includeTriage: false,
  issues,
  capabilities,
  snapshot: {
    id: "snapshot-jsa-current", packageId: "jsa-context", packageVersion: "1.1", producer: "proof", contextHash: "sha256-proof",
    createdAt: new Date("2026-09-15T18:45:00.000Z"), completenessSummary: { status: "complete" },
    package: { version: "1.1", packageId: "jsa-context", producer: "proof", generatedAt: "2026-09-15T18:40:00.000Z", scopeId: "jsa", sources: [], evidence: [], intelligenceObjects, intelligenceRelations: [], completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [] },
  },
};
const compiled = compileScopeProposal(input);
const byTarget = (id: string) => compiled.items.find((item) => item.targetCapabilityId === id);

for (const expected of expectedClusters) {
  const proposal = byTarget(expected.target);
  assert.ok(proposal, `${expected.target} should reconcile`);
  assert.deepEqual(proposal.origins, ["knowledge", "reality", "linear"], expected.target);
  assert.equal(proposal.reconciliationState, "aligned");
  assert.equal(proposal.action, "link_existing");
  assert.equal(proposal.confidence, "high");
  assert.deepEqual(proposal.workItemIds, [...expected.children].sort());
  assert.ok(!new Set<string>(proposal.workItemIds).has(expected.parent), `${expected.parent} parent must not double-count beside its children`);
}

const contextOnly = compiled.items.find((item) => item.title === "Field annotations");
assert.deepEqual(contextOnly?.origins, ["knowledge"]);
assert.equal(contextOnly?.reconciliationState, "knowledge_no_execution");
assert.equal(contextOnly?.action, "create_capability");

const acceptedNoWork = byTarget("crew");
assert.deepEqual(acceptedNoWork?.origins, ["reality"]);
assert.equal(acceptedNoWork?.reconciliationState, "reality_no_execution");
assert.equal(acceptedNoWork?.action, "none");

const linearOnly = compiled.items.find((item) => item.provenance.linearParent?.identifier === "LIN-100");
assert.deepEqual(linearOnly?.origins, ["linear"]);
assert.equal(linearOnly?.reconciliationState, "execution_exception");
assert.equal(linearOnly?.action, "none", "Linear hierarchy alone must never create product shape");

const deferred = compiled.items.find((item) => item.title === "Advanced analytics");
assert.equal(deferred?.releaseSignal, "likely_out");
assert.equal(deferred?.reconciliationState, "deferred");

const conflict = byTarget("audit");
assert.equal(conflict?.reconciliationState, "conflict");
assert.equal(conflict?.action, "none");
assert.ok((conflict?.conflicts.length ?? 0) > 0);

const reordered = compileScopeProposal({ ...input, issues: [...issues].reverse(), capabilities: [...capabilities].reverse() });
assert.equal(reordered.fingerprint, compiled.fingerprint, "source ordering cannot change the proposal fingerprint");

console.log(JSON.stringify({
  ok: true,
  threeSourceClusters: expectedClusters.map(({ target }) => ({ target, origins: byTarget(target)?.origins, workItems: byTarget(target)?.workItemIds.length })),
  contextOnly: contextOnly?.reconciliationState,
  acceptedWithoutWork: acceptedNoWork?.reconciliationState,
  linearOnly: linearOnly?.reconciliationState,
  disagreement: conflict?.reconciliationState,
  deferred: deferred?.reconciliationState,
  parentChildDoubleCount: false,
  deterministicFingerprint: compiled.fingerprint,
}, null, 2));
