import { verifyAuditProtectedWorld } from "./lib/production-hardening-2-audit-integrity.mjs";

// The reviewed exception is relative to this exact protected base. Do not
// advance it wholesale when approving one bounded adapter blob.
const BASE = "02afba325ddf30fdd8620822dfa9bb870e2ca949";
const EXPECTED_FINGERPRINT = "764dcf8c189358753051e7c2679081c03e1db192d7e2877d875c410ac9eb0c94";
const REVIEWED_EXCEPTIONS = {
  "public/audit-rubric-phase2/phase2-host.js": {
    baseBlob: "de42e297da8232e2917b47054920d61858436c00",
    reviewedBlob: "0ec853e1952b22b1ac0bcdb0be69b2595f01fb1d",
    rationale: "Exact snapshot-qualified navigation plus keyboard access to the existing native search result action; no Rubric spatial, layout, ranking, or canonical data change.",
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
