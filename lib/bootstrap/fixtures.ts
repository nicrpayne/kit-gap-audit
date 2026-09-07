import type { BootstrapCorpus } from "./scan";

const directArtifact = {
  id: "artifact-harbor-transcript", provider: "signal-source-store", kind: "transcript",
  title: "Harbor Relay planning review", canonicalRef: "fixture://transcript/harbor-review",
  deepLink: "/audit/fixture-harbor", observedAt: "2026-08-20T15:00:00.000Z",
  text: "Harbor Relay needs offline transfer, an approval decision, and the launch depends on Dock Gateway. Morgan owns the approval question.",
  derivative: false, lineageRootIds: ["fixture://transcript/harbor-review"], scopeLabel: "Archive",
};

const wikiArtifact = {
  id: "artifact-harbor-wiki", provider: "wiki", kind: "wiki",
  title: "Harbor Relay project synthesis", canonicalRef: "ke://wiki/project/harbor-relay",
  observedAt: "2026-08-22T12:00:00.000Z", text: "Harbor Relay needs offline transfer.",
  derivative: true, lineageRootIds: ["fixture://transcript/harbor-review"], scopeLabel: "Archive",
};

export const richHistoricalCorpus: BootstrapCorpus = {
  artifacts: [directArtifact, wikiArtifact],
  evidence: [
    { id: "evidence-harbor-direct", artifactId: directArtifact.id, exactQuote: "Harbor Relay needs offline transfer, an approval decision, and the launch depends on Dock Gateway.", locator: { segmentId: "00:14:22" }, independence: "independent", lineageRootIds: directArtifact.lineageRootIds },
    { id: "evidence-harbor-wiki", artifactId: wikiArtifact.id, exactQuote: "Harbor Relay needs offline transfer.", locator: { blockId: "summary-2" }, independence: "derivative", lineageRootIds: wikiArtifact.lineageRootIds },
  ],
  intelligence: [
    { id: "intel-capability", type: "Opportunity", statement: "Harbor Relay should support offline transfer.", isCurrent: true, observedDate: "2026-08-20T15:00:00.000Z", fields: { capability: "Offline transfer" }, evidenceRefs: ["evidence-harbor-direct", "evidence-harbor-wiki"], supersedes: [], contradictedBy: [], provenance: { batch: "fixture-rich" }, sourceSnapshotId: "snapshot-rich" },
    { id: "intel-decision", type: "Decision", statement: "Harbor Relay needs an approval-path decision.", isCurrent: true, observedDate: "2026-08-20T15:00:00.000Z", fields: { question: "Which approval path should Harbor Relay use?", owner: "Morgan" }, evidenceRefs: ["evidence-harbor-direct"], supersedes: [], contradictedBy: [], provenance: { batch: "fixture-rich" }, sourceSnapshotId: "snapshot-rich" },
    { id: "intel-dependency", type: "Dependency", statement: "Harbor Relay launch depends on Dock Gateway.", isCurrent: true, observedDate: "2026-08-20T15:00:00.000Z", fields: { from: "Harbor Relay", to: "Dock Gateway" }, evidenceRefs: ["evidence-harbor-direct"], supersedes: [], contradictedBy: [], provenance: { batch: "fixture-rich" }, sourceSnapshotId: "snapshot-rich" },
    { id: "intel-milestone", type: "Commitment", statement: "Harbor Relay pilot review is scheduled.", isCurrent: true, observedDate: "2026-08-20T15:00:00.000Z", fields: { action: "Pilot review", due_date: "2026-10-02" }, evidenceRefs: ["evidence-harbor-direct"], supersedes: [], contradictedBy: [], provenance: { batch: "fixture-rich" }, sourceSnapshotId: "snapshot-rich" },
  ],
  derivedClaims: [], activeIdentities: [], registrations: [], snapshotCount: 1,
  relations: [
    { sourceId: "intel-capability", relation: "supports", targetId: "intel-decision", relationClass: "semantic", sourceInPackage: true, targetInPackage: true, provenance: { batch: "fixture-rich" } },
    { sourceId: "intel-dependency", relation: "depends_on", targetId: "intel-capability", relationClass: "contextual", sourceInPackage: true, targetInPackage: true, provenance: { batch: "fixture-rich" } },
  ],
};

export const sparseCorpus: BootstrapCorpus = {
  artifacts: [{ ...directArtifact, id: "artifact-cedar", title: "Cedar Note mention", canonicalRef: "fixture://transcript/cedar", text: "Cedar Note was mentioned; no scope was described.", lineageRootIds: ["fixture://transcript/cedar"] }],
  evidence: [], intelligence: [], relations: [], derivedClaims: [], activeIdentities: [], registrations: [], snapshotCount: 0,
};

export const aliasCollisionCorpus: BootstrapCorpus = {
  artifacts: [], evidence: [], intelligence: [], relations: [], derivedClaims: [], registrations: [], snapshotCount: 0,
  activeIdentities: [{ id: "scope-northstar", name: "Northstar Vendor Program", projectNames: ["NS"] }],
};

export const contradictoryCorpus: BootstrapCorpus = {
  ...richHistoricalCorpus,
  intelligence: [{ ...richHistoricalCorpus.intelligence[3], id: "intel-old-pilot", statement: "Lantern Review pilot is September 10.", isCurrent: false, fields: { action: "Pilot", due_date: "2026-09-10" }, contradictedBy: ["intel-new-pilot"] },
    { ...richHistoricalCorpus.intelligence[3], id: "intel-new-pilot", statement: "Lantern Review pilot was postponed without a new date.", fields: {}, evidenceRefs: ["evidence-harbor-direct"], contradictedBy: ["intel-old-pilot"] }],
};
