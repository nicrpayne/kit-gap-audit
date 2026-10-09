import assert from "node:assert/strict";
import { appendCapabilityEditEvidence } from "../lib/scope/editEvidence";
import { capabilityEvidenceReferences, projectCapabilityEvidence } from "../lib/scope/capabilityEvidence";

const quote = { id: "original-passage", excerpt: "Keep exactly these words: **literal** and _literal_.", sourceRef: "fixture://meeting", observedAt: "2026-09-30" };
const sources = [
  { auditChangeProposalId: "proposal", auditRunId: "audit", contextSnapshotId: "snapshot", evidence: [quote] },
  { boundary: "human_accepted_bootstrap", sourceCandidateId: "candidate", evidenceRefs: ["original-passage"] },
  { source: "scope_proposal", proposalId: "proposal", evidence: { contextRefs: [quote] } },
  { source: "manual", note: "Original acceptance", acceptedAt: "2026-09-30", evidence: [quote] },
];
for (const source of sources) {
  const before = structuredClone(source);
  assert.deepEqual(appendCapabilityEditEvidence(source), before);
  assert.deepEqual(appendCapabilityEditEvidence(source, []), before, "blank edit must keep original provenance byte-for-byte");
  const extra = { ref: "fixture://additional-operator-reference", suppliedBy: "operator" };
  const withExtra = appendCapabilityEditEvidence(source, [extra]);
  assert.deepEqual(source, before, "source is not mutated");
  assert.deepEqual(withExtra, { ...before, operatorEvidence: [extra] });
  assert.deepEqual(appendCapabilityEditEvidence(withExtra, []), withExtra, "later blank edits must retain prior operator references");
  assert.deepEqual(appendCapabilityEditEvidence(withExtra, [extra, extra]), withExtra, "repeated same reference is not duplicated");
  assert.deepEqual(capabilityEvidenceReferences(withExtra), [...capabilityEvidenceReferences(before), extra]);
  const projected = projectCapabilityEvidence({ scopeId: "fixture", provenance: withExtra });
  assert(projected.every(ref => ref.state === "reference_only"), "an edit cannot invent captured source authority");
  assert.deepEqual(projected.at(-1)?.reference, extra);
}
console.log("PASS blank edits preserve all origin shapes; added references are additive, isolated and deduplicated; no false source capture");
