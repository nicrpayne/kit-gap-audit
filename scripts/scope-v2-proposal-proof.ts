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
    statement: "Audit export is confirmed out of scope for KIT JSA V1.", status: "deferred", scope: ["jsa", "audit-export"], evidenceRefs: ["evidence-audit"],
    fields: { capability: "Audit export" },
  },
];

const input = {
  includeTriage: false,
  issues,
  capabilities,
  activeReleaseNames: ["KIT JSA v1"],
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

function releaseCase(activeRelease: string, objects: { id: string; statement: string; observedDate?: string | null }[]) {
  const result = compileScopeProposal({
    includeTriage: false,
    issues: [],
    capabilities: [],
    activeReleaseNames: [activeRelease],
    snapshot: {
      id: `snapshot-${activeRelease}`, packageId: "release-semantics", packageVersion: "1.1", producer: "proof", contextHash: `hash-${activeRelease}`,
      createdAt: new Date("2026-09-15T18:45:00.000Z"), completenessSummary: { status: "complete" },
      package: {
        version: "1.1", packageId: "release-semantics", producer: "proof", generatedAt: "2026-09-15T18:40:00.000Z", scopeId: "jsa",
        sources: [], evidence: [], derivedClaims: [], intelligenceRelations: [], completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
        intelligenceObjects: objects.map((object) => ({
          ...object, intelligenceType: "Decision", trust: "external_intelligence", isCurrent: true, status: "decided", scope: ["jsa", "semantic-release-probe"], evidenceRefs: [`evidence-${object.id}`], fields: { capability: "Semantic release probe" },
        })),
      },
    },
  });
  const item = result.items.find((candidate) => candidate.title === "Semantic release probe");
  assert.ok(item, `semantic release probe missing for ${activeRelease}`);
  return item;
}

const crossBoundaryStatement = "The criteria are confirmed out of the 2026-09-08 beta cut and slated for KIT JSA V1.";
const v1Interpretation = releaseCase("KIT JSA v1", [{ id: "cross-boundary", statement: crossBoundaryStatement, observedDate: "2026-09-03" }]);
assert.equal(v1Interpretation.releaseSignal, "likely_in");
assert.equal(v1Interpretation.reconciliationState, "knowledge_no_execution");
assert.equal(v1Interpretation.conflicts.length, 0);
assert.deepEqual(v1Interpretation.provenance.releaseInterpretation.otherBoundaryClaims.map((claim) => `${claim.direction}:${claim.normalizedBoundary}`), ["out:beta"]);

const betaInterpretation = releaseCase("Beta", [{ id: "cross-boundary", statement: crossBoundaryStatement, observedDate: "2026-09-03" }]);
assert.equal(betaInterpretation.releaseSignal, "likely_out");
assert.equal(betaInterpretation.conflicts.length, 0);

const betaOnlyUnderV1 = releaseCase("KIT JSA v1", [{ id: "beta-only", statement: "The criteria are confirmed out of the 2026-09-08 beta cut.", observedDate: "2026-09-03" }]);
assert.equal(betaOnlyUnderV1.releaseSignal, "boundary");
assert.equal(betaOnlyUnderV1.reconciliationState, "knowledge_no_execution");

const opposingV1 = releaseCase("KIT JSA v1", [
  { id: "v1-in", statement: "The capability is confirmed in scope for KIT JSA V1.", observedDate: "2026-09-03" },
  { id: "v1-out", statement: "The capability is confirmed out of scope for KIT JSA V1.", observedDate: "2026-09-03" },
]);
assert.equal(opposingV1.reconciliationState, "conflict");
assert.match(opposingV1.conflicts[0], /KIT JSA v1.*v1-in.*v1-out/i);

const laterV1Wins = releaseCase("KIT JSA v1", [
  { id: "historical-v1-out", statement: "The capability is confirmed out of scope for KIT JSA V1.", observedDate: "2026-08-04" },
  { id: "later-v1-in", statement: "The capability is slated for KIT JSA V1.", observedDate: "2026-09-03" },
]);
assert.equal(laterV1Wins.releaseSignal, "likely_in");
assert.equal(laterV1Wins.conflicts.length, 0);
assert.deepEqual(laterV1Wins.provenance.releaseInterpretation.effectiveClaims.map((claim) => claim.evidenceId), ["later-v1-in"]);
assert.deepEqual(laterV1Wins.provenance.releaseInterpretation.supersededClaims.map((claim) => claim.evidenceId), ["historical-v1-out"]);

const unresolvedBoundary = compileScopeProposal({
  includeTriage: false,
  issues: [],
  capabilities: [{ id: "unresolved", name: "Unresolved release capability", description: null, status: "accepted", revision: 1, workLinks: [] }],
  snapshot: null,
}).items[0];
assert.equal(unresolvedBoundary.releaseSignal, "boundary");
assert.equal(unresolvedBoundary.conflicts.length, 0);
assert.equal(unresolvedBoundary.provenance.releaseInterpretation.activeReleaseSource, "unresolved");

const capabilityLeakGuard = compileScopeProposal({
  includeTriage: false,
  issues: [],
  activeReleaseNames: ["KIT JSA v1"],
  capabilities: [{ id: "other", name: "Expanded STKY control flows", description: "Historical release cut retained outside active work.", status: "removed", revision: 1, workLinks: [] }],
  snapshot: {
    id: "snapshot-capability-leak", packageId: "capability-leak", packageVersion: "1.1", producer: "proof", contextHash: "capability-leak",
    createdAt: new Date("2026-09-15T18:45:00.000Z"), completenessSummary: { status: "complete" },
    package: {
      version: "1.1", packageId: "capability-leak", producer: "proof", generatedAt: "2026-09-15T18:40:00.000Z", scopeId: "jsa", sources: [], evidence: [], intelligenceRelations: [], completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
      intelligenceObjects: [{ id: "notifications-v1", intelligenceType: "Decision", trust: "external_intelligence", isCurrent: true, observedDate: "2026-09-03", statement: "Notifications are out of the Beta cut and slated for KIT JSA V1.", status: "decided", scope: ["jsa", "notifications"], evidenceRefs: ["notifications-evidence"], fields: { capability: "JSA notifications" } }],
    },
  },
}).items.find((item) => item.targetCapabilityId === "other");
assert.equal(capabilityLeakGuard?.releaseSignal, "likely_out");
assert.equal(capabilityLeakGuard?.conflicts.length, 0, "release evidence for another capability must not create a conflict");

console.log(JSON.stringify({
  ok: true,
  threeSourceClusters: expectedClusters.map(({ target }) => ({ target, origins: byTarget(target)?.origins, workItems: byTarget(target)?.workItemIds.length })),
  contextOnly: contextOnly?.reconciliationState,
  acceptedWithoutWork: acceptedNoWork?.reconciliationState,
  linearOnly: linearOnly?.reconciliationState,
  disagreement: conflict?.reconciliationState,
  deferred: deferred?.reconciliationState,
  releaseBoundaryRegression: {
    v1FromCrossBoundary: v1Interpretation.releaseSignal,
    betaFromCrossBoundary: betaInterpretation.releaseSignal,
    betaOnlyUnderV1: betaOnlyUnderV1.releaseSignal,
    opposingV1: opposingV1.reconciliationState,
    laterV1Wins: laterV1Wins.releaseSignal,
    unresolvedActiveRelease: unresolvedBoundary.releaseSignal,
    crossCapabilityLeak: capabilityLeakGuard?.conflicts.length,
  },
  parentChildDoubleCount: false,
  deterministicFingerprint: compiled.fingerprint,
}, null, 2));
