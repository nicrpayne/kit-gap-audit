import { verifyAuditProtectedWorld } from "./lib/production-hardening-2-audit-integrity.mjs";

// The reviewed exception is relative to this exact protected base. Do not
// advance it wholesale when approving one bounded adapter blob.
const BASE = "02afba325ddf30fdd8620822dfa9bb870e2ca949";
const EXPECTED_FINGERPRINT = "ee91c5a1762d457362b23c81b926a5d96c6d85eccca37c4f24bf1dd2ab847439";
const REVIEWED_EXCEPTIONS = {
  "components/audit/graphTokens.ts": {
    baseBlob: "17c438015ea94168acf54beae9e3b1fcf454dc72",
    reviewedBlob: "c3d6f55a0a8c17e809736b6c98b96c90c39e4af1",
    rationale: "Inherited a65eacc one-line duplicate-work color correction; unchanged by this repair.",
    evidence: "docs/AUDIT-INSPECTOR-USEFULNESS-REBASELINE-EVIDENCE.md",
  },
  "public/audit-rubric-phase2/phase2-host.js": {
    baseBlob: "de42e297da8232e2917b47054920d61858436c00",
    reviewedBlob: "a21a90235cdfee7b3c8346d98a00e00a0421ed0e",
    rationale: "Exact snapshot-qualified navigation, keyboard search and safe quote viewer with source context; no Rubric spatial, layout, ranking, or canonical data change.",
    evidence: "docs/AUDIT-INSPECTOR-USEFULNESS-REBASELINE-EVIDENCE.md",
  },
  "public/audit-rubric-phase3/phase3-host.js": {
    baseBlob: "d3f3c4951e77cb53b17a2a278d60ec8740131313",
    reviewedBlob: "a799e130722132432811041ce2311298f97807ce",
    rationale: "Exact stored passage provenance and an accessible Inspector close name; no Rubric spatial, layout, canonical graph, or authority change.",
    evidence: "docs/AUDIT-INSPECTOR-USEFULNESS-REBASELINE-EVIDENCE.md",
  },
};

const result = verifyAuditProtectedWorld({
  base: BASE,
  expectedFingerprint: EXPECTED_FINGERPRINT,
  expectedWorldCount: 33,
  reviewedExceptions: REVIEWED_EXCEPTIONS,
});

console.log(`PASS Audit protected world: ${result.protectedWorld.length} working-tree files, ${result.reviewedExceptionPaths.length} exact reviewed exceptions`);
console.log(`PASS Audit working-tree fingerprint: ${result.fingerprint}`);
console.log(`PASS Audit mirror: ${result.mirror.nodes} objects / ${result.mirror.edges} relationships`);
