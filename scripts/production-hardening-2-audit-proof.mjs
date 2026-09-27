import { verifyAuditProtectedWorld } from "./lib/production-hardening-2-audit-integrity.mjs";

// The reviewed exception is relative to this exact protected base. Do not
// advance it wholesale when approving one bounded adapter blob.
const BASE = "02afba325ddf30fdd8620822dfa9bb870e2ca949";
const EXPECTED_FINGERPRINT = "0f631d8061c73e3689a1aa0cef89462e1444001521f4a71e065747c1933a16e9";
const REVIEWED_EXCEPTIONS = {
  "public/audit-rubric-phase2/phase2-host.js": {
    baseBlob: "de42e297da8232e2917b47054920d61858436c00",
    reviewedBlob: "9a6b3f131863dcc4ea10551742f257955f490588",
    rationale: "Exact snapshot-qualified quote navigation through the existing same-origin parent bridge; no Rubric spatial, layout, or canonical data change.",
    evidence: "docs/AUDIT-EXACT-QUOTE-NAVIGATION-REBASELINE-EVIDENCE.md",
  },
};

const result = verifyAuditProtectedWorld({
  base: BASE,
  expectedFingerprint: EXPECTED_FINGERPRINT,
  expectedWorldCount: 33,
  reviewedExceptions: REVIEWED_EXCEPTIONS,
});

console.log(`PASS Audit protected world: ${result.protectedWorld.length} working-tree files, ${result.reviewedExceptionPaths.length} exact reviewed exception`);
console.log(`PASS Audit working-tree fingerprint: ${result.fingerprint}`);
console.log(`PASS Audit mirror: ${result.mirror.nodes} objects / ${result.mirror.edges} relationships`);
