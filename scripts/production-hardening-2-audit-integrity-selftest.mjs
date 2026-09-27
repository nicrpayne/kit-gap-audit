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
const expectedFingerprint = "0f631d8061c73e3689a1aa0cef89462e1444001521f4a71e065747c1933a16e9";
const hostPath = "public/audit-rubric-phase2/phase2-host.js";
const evidencePath = "docs/AUDIT-EXACT-QUOTE-NAVIGATION-REBASELINE-EVIDENCE.md";
const reviewedExceptions = {
  [hostPath]: {
    baseBlob: "de42e297da8232e2917b47054920d61858436c00",
    reviewedBlob: "9a6b3f131863dcc4ea10551742f257955f490588",
    rationale: "Exact quote navigation reviewed by lead.",
    evidence: evidencePath,
  },
};

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
  writeFileSync(join(sandbox, evidencePath), "Reviewed exact-quote adapter exception.\n");
  git(sandbox, ["add", "."]);
  git(sandbox, ["commit", "-q", "-m", "protected base"]);
  const sandboxBase = git(sandbox, ["rev-parse", "HEAD"]).trim();

  const reviewedHost = readFileSync(join(sourceRoot, hostPath));
  writeFileSync(join(sandbox, hostPath), reviewedHost);
  verifyAuditProtectedWorld({
    repoRoot: sandbox,
    base: sandboxBase,
    expectedFingerprint,
    expectedWorldCount: 33,
    reviewedExceptions,
  });

  appendFileSync(join(sandbox, hostPath), "\n// unreviewed mutation\n");
  assert.throws(() => verifyAuditProtectedWorld({
    repoRoot: sandbox, base: sandboxBase, expectedFingerprint,
    expectedWorldCount: 33, reviewedExceptions,
  }), /changed outside reviewed exception/);
  writeFileSync(join(sandbox, hostPath), reviewedHost);

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

  console.log("PASS Audit integrity self-test: reviewed working-tree blob accepted");
  console.log("PASS Audit integrity self-test: edited exception and ordinary protected file rejected");
  console.log("PASS Audit integrity self-test: added protected path rejected");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
