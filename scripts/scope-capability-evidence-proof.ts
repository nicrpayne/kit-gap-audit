import assert from "node:assert/strict";
import {
  capabilityEvidenceReferences,
  createCapabilityEvidenceProjector,
  projectCapabilityEvidence,
  type CapabilityEvidenceOriginSnapshot,
} from "../lib/scope/capabilityEvidence";

const acceptedAt = "2026-10-08T15:00:00.000Z";
const sourceRef = "https://source.example/qa-notes";
const packageFor = (
  candidateId: string,
  quote = "The accepted fictional capability is supported by this exact sentence.",
  scopeId = "scope-accepted",
) => ({
  version: "1.1",
  packageId: `activation:${candidateId}`,
  producer: "gap_app",
  generatedAt: acceptedAt,
  scopeId,
  sources: [{
    sourceType: "document",
    sourceRef,
    registrationId: null,
    role: "raw_evidence",
    status: "active",
    observedAt: "2026-10-07T12:30:00.000Z",
    succeeded: true,
    detail: "QA source notes",
  }],
  evidence: [
    {
      id: "hermes-ev:qa-oct08-ev-2",
      sourceRef,
      kind: "bootstrap_evidence",
      excerpt: quote,
      externalRef: "https://source.example/qa-notes#accepted-capability",
      independence: "independent",
      data: { occurredAt: "2026-10-07", charStart: 20, charEnd: 91, offsetUnit: "utf16_code_unit" },
      passageHash: "sha256:accepted-quote",
    },
    {
      id: "hermes-ev:qa-oct08-ev-3",
      sourceRef,
      kind: "bootstrap_evidence",
      excerpt: "A second exact accepted passage.",
      data: { meeting_date: "2026-10-06", primaryAnchor: "paragraph-4" },
    },
  ],
  derivedClaims: [{
    id: `bootstrap-accepted:${candidateId}`,
    kind: "capability",
    statement: "Fictional accepted capability",
    evidenceRefs: ["hermes-ev:qa-oct08-ev-2", "hermes-ev:qa-oct08-ev-3"],
    disposition: "accepted",
    canonical: true,
    sourceCandidateId: candidateId,
  }],
  completeness: { expectedSources: [sourceRef], missingSources: [], excludedSources: [] },
  warnings: [],
});

const activationSnapshot = (
  candidateId = "candidate-accepted",
  quote?: string,
  scopeId = "scope-accepted",
): CapabilityEvidenceOriginSnapshot => ({
  id: "snapshot-at-acceptance",
  scopeId,
  createdAt: acceptedAt,
  package: packageFor(candidateId, quote, scopeId),
});

const bootstrapProvenance = {
  boundary: "human_accepted_bootstrap",
  sourceCandidateId: "candidate-accepted",
  sourceFingerprint: "sha256:candidate",
  evidence: [{ ref: "operator-attached-note", statement: "Operator attachment retained" }],
  evidenceRefs: ["hermes-ev:qa-oct08-ev-2", "hermes-ev:qa-oct08-ev-3", "hermes-ev:missing"],
};

const projected = projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: activationSnapshot() });
assert.deepEqual(projected.map((entry) => entry.evidenceId), [
  "operator-attached-note",
  "hermes-ev:qa-oct08-ev-2",
  "hermes-ev:qa-oct08-ev-3",
  "hermes-ev:missing",
], "nested and top-level references remain present and ordered");
assert.equal(projected[0].state, "reference_only", "an unmatched nested attachment is shown without an invented quote");
assert.equal(projected[1].state, "captured_at_acceptance");
assert.equal(projected[1].capture?.excerpt, "The accepted fictional capability is supported by this exact sentence.");
assert.equal(projected[1].capture?.contextSnapshotId, "snapshot-at-acceptance");
assert.equal(projected[1].capture?.sourceDate, "2026-10-07");
assert.deepEqual(projected[1].capture?.locator, {
  quoteHash: "sha256:accepted-quote",
  charStart: 20,
  charEnd: 91,
  offsetUnit: "utf16_code_unit",
});
assert.equal(projected[1].capture?.sourceUrl, "https://source.example/qa-notes#accepted-capability");
assert.equal(projected[2].capture?.excerpt, "A second exact accepted passage.");
assert.equal(projected[3].state, "reference_only", "a missing id remains visible instead of borrowing another passage");

const newerQuote = "A newer package changed the words.";
const newerSnapshot = activationSnapshot("candidate-accepted", newerQuote);
newerSnapshot.id = "snapshot-newer-current";
const stillAccepted = projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: activationSnapshot() });
assert.equal(stillAccepted[1].capture?.excerpt, "The accepted fictional capability is supported by this exact sentence.");
assert.notEqual(stillAccepted[1].capture?.excerpt, projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: newerSnapshot })[1].capture?.excerpt,
  "the projector's output is qualified by the supplied immutable origin; buildPortfolioInputs supplies Scope.activation, never current knowledge");

const wrongSnapshot = projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: activationSnapshot("different-candidate") });
assert.ok(wrongSnapshot.every((entry) => entry.state === "reference_only"), "a package without the accepted candidate claim cannot resolve an equal bare evidence id");

const wrongScopeSnapshot = activationSnapshot();
wrongScopeSnapshot.scopeId = "another-scope";
assert.ok(projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: wrongScopeSnapshot }).every((entry) => entry.state === "reference_only"),
  "a snapshot/package scope mismatch refuses resolution");
const internallyConsistentForeignSnapshot = activationSnapshot("candidate-accepted", undefined, "scope-foreign");
assert.ok(projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: internallyConsistentForeignSnapshot }).every((entry) => entry.state === "reference_only"),
  "an internally consistent snapshot and package from another Scope are refused against the owning Scope id");
assert.ok(projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: bootstrapProvenance, activationSnapshot: null }).every((entry) => entry.state === "reference_only"),
  "a missing activation snapshot retains references without guessing current knowledge");

const operatorEvidence = { ref: "context:jsa", statement: "Accepted product-shape truth" };
const operator = projectCapabilityEvidence({ scopeId: "scope-accepted", provenance: { authority: "Scope", source: "operator", evidence: [operatorEvidence] } });
assert.equal(operator.length, 1);
assert.equal(operator[0].state, "reference_only");
assert.deepEqual(operator[0].reference, operatorEvidence, "the established operator evidence object is preserved for presentation");

assert.deepEqual(
  capabilityEvidenceReferences({ evidence: { evidenceRefs: ["nested-evidence-1", "nested-evidence-2"] } }),
  ["nested-evidence-1", "nested-evidence-2"],
  "the established nested evidenceRefs wrapper is expanded rather than displayed as an unknown object",
);
assert.deepEqual(
  capabilityEvidenceReferences({ evidence: { contextRefs: [{ id: "nested-context" }] } }),
  [{ id: "nested-context" }],
  "the established nested contextRefs wrapper is expanded rather than displayed as an unknown object",
);

let packageReads = 0;
const countedPackage = packageFor("candidate-accepted");
const countedSnapshot: CapabilityEvidenceOriginSnapshot = {
  id: "snapshot-counted",
  scopeId: "scope-accepted",
  createdAt: acceptedAt,
  get package() {
    packageReads += 1;
    return countedPackage;
  },
};
const scopeProjector = createCapabilityEvidenceProjector({ scopeId: "scope-accepted", activationSnapshot: countedSnapshot });
const readsAfterPreparation = packageReads;
assert.equal(scopeProjector(bootstrapProvenance)[1].state, "captured_at_acceptance");
assert.equal(scopeProjector({ authority: "Scope", evidence: [operatorEvidence] })[0].state, "reference_only");
assert.equal(packageReads, readsAfterPreparation, "the prepared Scope projector does not re-read or revalidate its activation package per capability");

console.log("scope capability evidence proof: captured bootstrap quotes stay bound to the immutable acceptance snapshot");

const auditPackage = packageFor("candidate-accepted");
const auditEvidence = auditPackage.evidence.map(item=>({id:item.id,excerpt:item.excerpt,sourceRef:item.sourceRef}));
const auditProvenance = {auditChangeProposalId:"accepted-proposal",auditRunId:"accepted-audit",contextSnapshotId:"audit-snapshot",evidence:auditEvidence};
const auditOrigin = {proposalId:"accepted-proposal",capabilityId:"accepted-capability",scopeId:"scope-accepted",auditRunId:"accepted-audit",status:"accepted",acceptedAt:"2026-10-08T18:00:00Z",evidence:auditEvidence,snapshot:{...activationSnapshot(),id:"audit-snapshot"}};
const auditInput = {scopeId:"scope-accepted",capabilityId:"accepted-capability",provenance:auditProvenance,auditOrigins:[auditOrigin]};
const auditProjected=projectCapabilityEvidence(auditInput);
assert.equal(auditProjected[0].capture?.excerpt,auditPackage.evidence[0].excerpt);
assert.equal(auditProjected[0].capture?.acceptedAt,auditOrigin.acceptedAt,"actual acceptance time, not snapshot creation time");
assert.equal(auditProjected[0].capture?.sourceDate,"2026-10-07");
assert.equal(auditProjected[0].capture?.locator.charStart,20);
assert.equal(auditProjected[0].capture?.contextSnapshotId,"audit-snapshot");
for (const changed of [
  {...auditInput,capabilityId:"wrong-capability"},
  {...auditInput,scopeId:"wrong-scope"},
  {...auditInput,auditOrigins:[]},
  {...auditInput,auditOrigins:[{...auditOrigin,status:"pending"}]},
  {...auditInput,auditOrigins:[{...auditOrigin,snapshot:{...auditOrigin.snapshot,id:"newer-snapshot"}}]},
  {...auditInput,provenance:{...auditProvenance,auditRunId:"wrong-audit"}},
  {...auditInput,provenance:{...auditProvenance,evidence:[{...auditEvidence[0],excerpt:"Changed words"}]}},
  {...auditInput,provenance:{...auditProvenance,evidence:[{...auditEvidence[0],sourceRef:"https://source.example/wrong-origin"}]}},
  {...auditInput,provenance:{...auditProvenance,evidence:[],operatorEvidence:[auditEvidence[0]]}},
  {...auditInput,provenance:{...auditProvenance,evidence:[],operatorEvidence:[{...auditEvidence[0],sourceRef:"https://source.example/operator",sourceUrl:"https://source.example/operator",suppliedBy:"operator"}]}},
  {...auditInput,auditOrigins:[{...auditOrigin,evidence:[{...auditEvidence[0],excerpt:"Changed acceptance"}]}]},
]) assert(projectCapabilityEvidence(changed).every(entry=>entry.state==="reference_only"),"unverified Audit origin stays reference-only");
const mixed=projectCapabilityEvidence({...auditInput,provenance:{...auditProvenance,operatorEvidence:[{ref:"https://source.example/operator",suppliedBy:"operator"}]}});
assert.equal(mixed[0].state,"captured_at_acceptance");
assert.equal(mixed.at(-1)?.state,"reference_only","operator references do not become transcript quotes");
console.log("scope Audit evidence proof: exact accepted proposal/capability/snapshot/words, date+locator, negative cross-project/wrong-owner/unaccepted/drift, independent operator references");
