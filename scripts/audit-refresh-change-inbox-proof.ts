import assert from "node:assert/strict";
import { deriveKnowledgeFreshness } from "../lib/audit/freshness";
import { classifyProjectRelevance } from "../lib/audit/projectRelevance";
import { resolveRefreshDisposition } from "../lib/bootstrap/rescan";
import type { BootstrapProposal } from "../lib/bootstrap/contracts";

function proposal(title: string, kind: BootstrapProposal["kind"], payload: Record<string, never> = {}): BootstrapProposal {
  return {
    proposalId: title, candidateKey: title, fingerprint: title, kind, title, statement: title,
    whyProposed: "fixture", matchBasis: "fixture", basis: "direct", evidenceRefs: [], intelligenceRefs: [],
    relevance: "high", currentness: "current", grounding: { directEvidenceCount: 1, independentLineageRootCount: 1, derivativeOnly: false, unresolvedContradiction: false }, payload,
  };
}

const identities = [
  { id: "jsa", name: "JSA", aliases: ["KIT Safety"] },
  { id: "itrack", name: "iTrack", aliases: ["iTrack Safety"] },
  { id: "construct", name: "KIT Construct", aliases: [] },
  { id: "platform", name: "Platform", aliases: ["KIT Platform"] },
];

assert.equal(
  classifyProjectRelevance(proposal("JSA expanded controls were cut", "capability"), identities[1], identities).classification,
  "irrelevant_bleed",
  "G1 JSA-only concern must not enter iTrack delivery truth",
);
assert.equal(
  classifyProjectRelevance(proposal("KIT Construct review mentioned beside iTrack", "risk"), identities[1], identities).classification,
  "neighboring_project_context",
  "G2 a KIT Construct mention is labeled as neighboring context",
);
assert.equal(
  classifyProjectRelevance(proposal("iTrack depends on KIT Platform authentication", "dependency"), identities[1], identities).classification,
  "cross_scope_relevant",
  "G3 a real Platform prerequisite remains visible",
);

assert.equal(deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, ingestionState: "ingesting", jobRunning: false, packageAheadOfSnapshot: false, watermarkAheadOfPackage: true }).code, "ingesting", "H ingestion outranks a newer watermark");
assert.equal(deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, jobRunning: false, packageAheadOfSnapshot: false, watermarkAheadOfPackage: false }).code, "current", "I unchanged knowledge is current");
assert.equal(deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: true, jobRunning: false, packageAheadOfSnapshot: false, watermarkAheadOfPackage: true }).code, "new_available", "new completed knowledge is offered once");
assert.equal(deriveKnowledgeFreshness({ activationAvailable: true, companionOnline: false, jobRunning: false, packageAheadOfSnapshot: true, watermarkAheadOfPackage: true }).code, "offline", "offline is honest");

assert.deepEqual(resolveRefreshDisposition({ sourceFingerprint: "same", status: "accepted", dispositionReason: null, reviewedProposal: null }, "same"), {
  status: "accepted", dispositionReason: null, reviewedProposal: null, changedSincePrior: false,
}, "unchanged proposals preserve governance");
assert.equal(resolveRefreshDisposition({ sourceFingerprint: "old", status: "accepted", dispositionReason: null, reviewedProposal: null }, "new").status, "pending", "changed proposals reopen");

console.log(JSON.stringify({
  ok: true,
  fixtures: {
    crossProjectBleed: ["irrelevant_bleed", "neighboring_project_context", "cross_scope_relevant"],
    ingestionStillRunning: "wait/no refresh",
    noNewKnowledge: "current/no rescan",
    refreshDisposition: "unchanged stays governed; changed reopens",
  },
}, null, 2));
