import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.PRODUCTION_HARDENING_BASE
  ?? "02afba325ddf30fdd8620822dfa9bb870e2ca949";
const EXPECTED_FINGERPRINT = "5a798edc490b9f3c127899ad88e94aca5928ae733894f0fe813b00a1ff562961";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function blobAt(revision, path) {
  return git("rev-parse", `${revision}:${path}`);
}

const protectedPrefixes = [
  "public/audit-rubric-phase1/",
  "public/audit-rubric-phase2/",
  "public/audit-rubric-phase3/",
  "components/audit/canvas/",
  "components/audit/renderer/",
  "lib/audit/spatial/",
];
const protectedFiles = [
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
const baseFiles = git("ls-tree", "-r", "--name-only", BASE).split("\n");
const protectedWorld = [...new Set([
  ...protectedFiles,
  ...baseFiles.filter((path) => protectedPrefixes.some((prefix) => path.startsWith(prefix))),
])].sort();
const changed = protectedWorld.filter((path) => {
  try {
    return blobAt(BASE, path) !== blobAt("HEAD", path);
  } catch {
    return true;
  }
});

const digest = createHash("sha256");
for (const path of protectedWorld) digest.update(`${path}\0${blobAt("HEAD", path)}\n`);
const fingerprint = digest.digest("hex");
const mirror = JSON.parse(readFileSync("artifacts/rubric-production-parity/jsa-production-mirror.json", "utf8"));

if (protectedWorld.length !== 33) throw new Error(`Expected 33 protected files; found ${protectedWorld.length}`);
if (changed.length) throw new Error(`Protected Audit files changed: ${changed.join(", ")}`);
if (fingerprint !== EXPECTED_FINGERPRINT) throw new Error(`Audit fingerprint changed: ${fingerprint}`);
if (mirror.graph?.nodes?.length !== 438 || mirror.graph?.edges?.length !== 543) {
  throw new Error(`Audit mirror changed: ${mirror.graph?.nodes?.length}/${mirror.graph?.edges?.length}`);
}

console.log(`PASS Audit protected world: ${protectedWorld.length} files, ${changed.length} changed`);
console.log(`PASS Audit fingerprint: ${fingerprint}`);
console.log(`PASS Audit mirror: ${mirror.graph.nodes.length} objects / ${mirror.graph.edges.length} relationships`);
