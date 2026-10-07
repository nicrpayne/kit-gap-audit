// Negative integrity proof. Builds a disposable repository from the original
// protected base, applies only the reviewed host blob, then proves uncommitted
// mutations and added protected paths are rejected. The real tree is read-only.

import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  protectedWorldAtBase,
  verifyAuditProtectedWorld,
} from "./lib/production-hardening-2-audit-integrity.mjs";

const sourceRoot = resolve(".");
const sourceBase = "02afba325ddf30fdd8620822dfa9bb870e2ca949";
const expectedFingerprint = "ee91c5a1762d457362b23c81b926a5d96c6d85eccca37c4f24bf1dd2ab847439";
const evidencePath = "docs/AUDIT-INSPECTOR-USEFULNESS-REBASELINE-EVIDENCE.md";
const reviewedExceptions = {
  "components/audit/graphTokens.ts": {
    baseBlob: "17c438015ea94168acf54beae9e3b1fcf454dc72",
    reviewedBlob: "c3d6f55a0a8c17e809736b6c98b96c90c39e4af1",
    rationale: "Inherited a65eacc duplicate-work color correction, reviewed unchanged.",
    evidence: evidencePath,
  },
  "public/audit-rubric-phase2/phase2-host.js": {
    baseBlob: "de42e297da8232e2917b47054920d61858436c00",
    reviewedBlob: "a21a90235cdfee7b3c8346d98a00e00a0421ed0e",
    rationale: "Exact navigation, keyboard search and safe source-context quote viewer reviewed by lead.",
    evidence: evidencePath,
  },
  "public/audit-rubric-phase3/phase3-host.js": {
    baseBlob: "d3f3c4951e77cb53b17a2a278d60ec8740131313",
    reviewedBlob: "a799e130722132432811041ce2311298f97807ce",
    rationale: "Exact passage provenance presentation and accessible close name reviewed by lead.",
    evidence: evidencePath,
  },
};
const hostPaths = Object.keys(reviewedExceptions);

function git(cwd, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding });
}

const sandbox = mkdtempSync(join(tmpdir(), "signal-audit-integrity-"));
try {
  git(sandbox, ["init", "-q"]);
  git(sandbox, ["config", "user.name", "Signal Integrity Proof"]);
  git(sandbox, ["config", "user.email", "integrity-proof@invalid"]);
  const protectedWorld = protectedWorldAtBase(sourceRoot, sourceBase);
  for (const path of protectedWorld) {
    const destination = join(sandbox, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, git(sourceRoot, ["show", `${sourceBase}:${path}`], null));
  }
  mkdirSync(dirname(join(sandbox, evidencePath)), { recursive: true });
  writeFileSync(join(sandbox, evidencePath), "Reviewed Audit usefulness adapter exceptions.\n");
  git(sandbox, ["add", "."]);
  git(sandbox, ["commit", "-q", "-m", "protected base"]);
  const sandboxBase = git(sandbox, ["rev-parse", "HEAD"]).trim();

  const reviewedHosts = new Map(hostPaths.map((path) => [path, readFileSync(join(sourceRoot, path))]));
  for (const [path, contents] of reviewedHosts) writeFileSync(join(sandbox, path), contents);
  verifyAuditProtectedWorld({
    repoRoot: sandbox,
    base: sandboxBase,
    expectedFingerprint,
    expectedWorldCount: 33,
    reviewedExceptions,
  });

  for (const hostPath of hostPaths) {
    appendFileSync(join(sandbox, hostPath), "\n// unreviewed mutation\n");
    assert.throws(() => verifyAuditProtectedWorld({
      repoRoot: sandbox, base: sandboxBase, expectedFingerprint,
      expectedWorldCount: 33, reviewedExceptions,
    }), /changed outside reviewed exception/);
    writeFileSync(join(sandbox, hostPath), reviewedHosts.get(hostPath));
  }

  const ordinaryPath = "public/audit-rubric-phase1/_core.js";
  const ordinaryOriginal = readFileSync(join(sandbox, ordinaryPath));
  appendFileSync(join(sandbox, ordinaryPath), "\n// unexpected protected edit\n");
  assert.throws(() => verifyAuditProtectedWorld({
    repoRoot: sandbox, base: sandboxBase, expectedFingerprint,
    expectedWorldCount: 33, reviewedExceptions,
  }), /changed outside reviewed exception/);
  writeFileSync(join(sandbox, ordinaryPath), ordinaryOriginal);

  const addedPath = join(sandbox, "public/audit-rubric-phase2/unreviewed-addon.js");
  writeFileSync(addedPath, "// unexpected protected file\n");
  assert.throws(() => verifyAuditProtectedWorld({
    repoRoot: sandbox, base: sandboxBase, expectedFingerprint,
    expectedWorldCount: 33, reviewedExceptions,
  }), /Unexpected protected Audit files added/);

  console.log("PASS Audit integrity self-test: all three exact reviewed working-tree blobs accepted");
  console.log("PASS Audit integrity self-test: mutation of each exception and an ordinary protected file rejected");
  console.log("PASS Audit integrity self-test: added protected path rejected");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
