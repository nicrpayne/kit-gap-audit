import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

export const protectedPrefixes = [
  "public/audit-rubric-phase1/",
  "public/audit-rubric-phase2/",
  "public/audit-rubric-phase3/",
  "components/audit/canvas/",
  "components/audit/renderer/",
  "lib/audit/spatial/",
];

export const protectedFiles = [
  "artifacts/rubric-production-parity/jsa-production-mirror.json",
  "components/audit/CanvasAuditRenderer.tsx",
  "components/audit/SignalGraph.tsx",
  "components/audit/cameraMotion.ts",
  "components/audit/graphTokens.ts",
  "components/audit/rubricCamera.ts",
  "lib/audit/focus.ts",
  "lib/audit/graphLayout.ts",
  "lib/audit/rubricVisualAdapter.ts",
  "lib/audit/structuralWeb.ts",
  "lib/audit/visualScene.ts",
];

export function git(repoRoot, ...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

export function blobAt(repoRoot, revision, path) {
  return git(repoRoot, "rev-parse", `${revision}:${path}`);
}

export function workingTreeBlob(repoRoot, path) {
  return git(repoRoot, "hash-object", "--", path);
}

export function protectedWorldAtBase(repoRoot, base) {
  const baseFiles = git(repoRoot, "ls-tree", "-r", "--name-only", base).split("\n").filter(Boolean);
  return [...new Set([
    ...protectedFiles,
    ...baseFiles.filter(path => protectedPrefixes.some(prefix => path.startsWith(prefix))),
  ])].sort();
}

function filesUnder(repoRoot, prefix) {
  const absoluteRoot = join(repoRoot, prefix);
  if (!existsSync(absoluteRoot)) return [];
  const found = [];
  const visit = absolute => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        found.push(relative(repoRoot, child).split(sep).join("/"));
      }
    }
  };
  visit(absoluteRoot);
  return found;
}

function protectedWorkingTree(repoRoot) {
  return [...new Set([
    ...protectedFiles.filter(path => existsSync(join(repoRoot, path))),
    ...protectedPrefixes.flatMap(prefix => filesUnder(repoRoot, prefix)),
  ])].sort();
}

export function verifyAuditProtectedWorld({
  repoRoot = ".",
  base,
  expectedFingerprint,
  expectedWorldCount,
  reviewedExceptions = {},
  expectedMirror = { nodes: 438, edges: 543 },
}) {
  const root = resolve(repoRoot);
  const protectedWorld = protectedWorldAtBase(root, base);
  const workingWorld = protectedWorkingTree(root);
  const expectedSet = new Set(protectedWorld);
  const workingSet = new Set(workingWorld);
  const unexpectedAdded = workingWorld.filter(path => !expectedSet.has(path));
  const missing = protectedWorld.filter(path => !workingSet.has(path));

  if (protectedWorld.length !== expectedWorldCount) {
    throw new Error(`Expected ${expectedWorldCount} protected files in the reviewed base; found ${protectedWorld.length}`);
  }
  if (unexpectedAdded.length) {
    throw new Error(`Unexpected protected Audit files added: ${unexpectedAdded.join(", ")}`);
  }
  if (missing.length) {
    throw new Error(`Protected Audit files missing from working tree: ${missing.join(", ")}`);
  }
  if (workingWorld.length !== expectedWorldCount) {
    throw new Error(`Expected ${expectedWorldCount} protected working-tree files; found ${workingWorld.length}`);
  }

  const exceptionPaths = Object.keys(reviewedExceptions);
  for (const path of exceptionPaths) {
    if (!expectedSet.has(path)) throw new Error(`Reviewed exception is outside the protected world: ${path}`);
    const review = reviewedExceptions[path];
    if (!review.rationale || !review.evidence || !existsSync(join(root, review.evidence))) {
      throw new Error(`Reviewed exception lacks rationale or local evidence: ${path}`);
    }
  }

  const currentBlobs = new Map();
  const unexpectedChanges = [];
  for (const path of protectedWorld) {
    const baseBlob = blobAt(root, base, path);
    const currentBlob = workingTreeBlob(root, path);
    currentBlobs.set(path, currentBlob);
    const review = reviewedExceptions[path];
    if (!review) {
      if (currentBlob !== baseBlob) unexpectedChanges.push(`${path} (${baseBlob} -> ${currentBlob})`);
      continue;
    }
    if (baseBlob !== review.baseBlob || currentBlob !== review.reviewedBlob) {
      unexpectedChanges.push(`${path} (reviewed ${review.baseBlob} -> ${review.reviewedBlob}; found ${baseBlob} -> ${currentBlob})`);
    }
  }
  if (unexpectedChanges.length) {
    throw new Error(`Protected Audit files changed outside reviewed exception: ${unexpectedChanges.join(", ")}`);
  }

  const digest = createHash("sha256");
  for (const path of protectedWorld) digest.update(`${path}\0${currentBlobs.get(path)}\n`);
  const fingerprint = digest.digest("hex");
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`Audit working-tree fingerprint changed: ${fingerprint}`);
  }

  const mirrorPath = join(root, "artifacts/rubric-production-parity/jsa-production-mirror.json");
  if (!lstatSync(mirrorPath).isFile()) throw new Error("Audit mirror is not a regular file");
  const mirror = JSON.parse(readFileSync(mirrorPath, "utf8"));
  if (mirror.graph?.nodes?.length !== expectedMirror.nodes || mirror.graph?.edges?.length !== expectedMirror.edges) {
    throw new Error(`Audit mirror changed: ${mirror.graph?.nodes?.length}/${mirror.graph?.edges?.length}`);
  }

  return {
    protectedWorld,
    reviewedExceptionPaths: exceptionPaths.sort(),
    fingerprint,
    mirror: { nodes: mirror.graph.nodes.length, edges: mirror.graph.edges.length },
  };
}
