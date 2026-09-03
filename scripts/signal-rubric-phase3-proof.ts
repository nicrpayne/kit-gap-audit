// Phase 3 protected-law proof. All graph inputs are read-only captures.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { exportAuditGraph, type AuditNodeAttributes } from "../lib/audit/graph";
import {
  adaptSignalGraphToRubric,
  normalizeSourceProvider,
  realityRelationshipOf,
  sourceProviderOf,
  trustMaterialOf,
  validateSignalRubricPayload,
  type ExportedSignalGraph,
} from "../lib/audit/signalRubricAdapter";
import { buildPhase3RubricCore, PHASE_3_CORE_PATCHES } from "../lib/audit/rubricPhase3Core";
import { jsaShapedGraph } from "./lib/jsa-shaped-fixture";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

function sha(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function loadCapture(path: string): { scope: { id: string; name: string }; graph: ExportedSignalGraph } {
  return JSON.parse(readFileSync(path, "utf8")) as { scope: { id: string; name: string }; graph: ExportedSignalGraph };
}

function verifyGraph(name: string, graph: ExportedSignalGraph, scope: { id: string; name: string }) {
  const payload = adaptSignalGraphToRubric(graph, scope, `phase3-proof:${name}`);
  const errors = validateSignalRubricPayload(payload);
  const canonical = payload.nodes.filter((node) => !node.presentationOnly);
  const apps = payload.nodes.filter((node) => node.type === "app");
  const byCanonical = new Map(canonical.map((node) => [node.canonicalId!, node]));

  check(`${name} validates`, errors.length === 0, errors.join("; "));
  check(`${name} preserves canonical census`, canonical.length === graph.nodes.length && payload.links.filter((link) => link.canonical).length === graph.edges.length);
  check(`${name} keeps the Rubric structural mapping`,
    byCanonical.get("reality")?.type === "router"
      && canonical.some((node) => node.layer === "S")
      && canonical.some((node) => node.layer === "M" && node.canonicalId !== "reality")
      && payload.nodes.some((node) => node.type === "routine")
      && apps.length > 0);
  check(`${name} uses only 0/.5/1 semantic Reality scores`, canonical.filter((node) => node.layer === "M" && node.type !== "router").every((node) => [0, 0.5, 1].includes(node.realityDistance!)));
  check(`${name} separates trust/currentness from Reality score`, canonical.every((node) => node.type === "router" || !!node.trustMaterial) && canonical.every((node) => node.currentness === undefined || ["current", "superseded"].includes(node.currentness)));
  check(`${name} exposes source anchors at Fit with counts`, apps.every((node) => node.identityMinZoom === 0 && !!node.worldLabel && !!node.sourceCounts));
  check(`${name} keeps passages on exact extracted_from providers`, graph.edges.filter((edge) => edge.attributes.rel === "extracted_from").every((edge) => {
    const passage = byCanonical.get(edge.source);
    const artifact = byCanonical.get(edge.target);
    return !!passage && !!artifact && passage.sourceProvider === artifact.sourceProvider;
  }));
  check(`${name} preserves only canonical relationship edges as canonical`, payload.links.filter((link) => link.canonical).every((link) => graph.edges.some((edge) =>
    (edge.source === "reality" ? "CLAUDE.md" : edge.source) === link.s
      && (edge.target === "reality" ? "CLAUDE.md" : edge.target) === link.t
      && edge.attributes.rel === link.k
      && edge.attributes.basis === link.basis
      && edge.attributes.rule === link.rule
  )));
  check(`${name} adapter emits no geometry`, payload.nodes.every((node) => !["x", "y", "fx", "fy", "vx", "vy", "radius", "angle", "camera", "targetX", "targetY"].some((field) => field in node)));

  const relationships = canonical.reduce<Record<string, number>>((counts, node) => {
    const key = node.realityRelationship ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const materials = canonical.reduce<Record<string, number>>((counts, node) => {
    const key = node.trustMaterial ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ name, sourceSystems: payload.meta.sourceSystems, relationships, materials, anchors: apps.map((node) => ({ label: node.label, counts: node.sourceCounts })) }));
}

function main() {
  const phaseOneCore = readFileSync("public/audit-rubric-phase1/_core.js", "utf8");
  const suppliedCore = readFileSync("lab/rubric-reference/second-brain/public/_core.js", "utf8");
  const phaseThreeCore = buildPhase3RubricCore(phaseOneCore);
  check("accepted Phase 1 core remains byte-identical", sha(phaseOneCore) === sha(suppliedCore), sha(phaseOneCore));
  check("Phase 3 applies exactly four guarded core extensions", PHASE_3_CORE_PATCHES.length === 4 && phaseThreeCore !== phaseOneCore);
  check("bounded modifier is exactly 0..12 world units", phaseThreeCore.includes("Math.max(0, Math.min(1, value)) * 12"));
  check("Phase 3 core still contains native Rings/Force/Circle/Hex/camera/drag machinery",
    ["computeRingTargets", "forceSimulation", "kind === 'circle'", "kind === 'hex'", "flyToNode", "S.drag"].every((token) => phaseThreeCore.includes(token)));

  const drift = { kind: "finding", label: "Drift", slice: "core", ref: "Finding:test", state: "drift" } satisfies AuditNodeAttributes;
  const externalCurrent = { ...drift, trust: "external", isCurrent: true, producer: "hermes" } satisfies AuditNodeAttributes;
  const attestedSuperseded = { ...drift, trust: "attested", isCurrent: false, producer: "signal" } satisfies AuditNodeAttributes;
  check("trust/currentness/producer cannot move Reality distance",
    realityRelationshipOf(drift) === realityRelationshipOf(externalCurrent)
      && realityRelationshipOf(drift) === realityRelationshipOf(attestedSuperseded));
  check("trust material remains independent", trustMaterialOf(externalCurrent) === "external" && trustMaterialOf({ ...drift, kind: "passage" }) === "attested");
  check("provider identity ignores prose",
    sourceProviderOf({ kind: "source", label: "Linear Notion Figma Hermes meeting", slice: "evidence", ref: "Source:test", sourceType: "source" }) === "Documents");
  check("provider identity accepts typed canonical fields",
    sourceProviderOf({ kind: "source", label: "opaque", slice: "evidence", ref: "Source:notion", sourceType: "notion" }) === "Notion"
      && sourceProviderOf({ kind: "work", label: "opaque", slice: "execution", ref: "LinearIssue:X", lane: "linear" }) === "Linear");
  check("provider aliases normalize deterministically",
    normalizeSourceProvider("meetings/transcripts") === "Meetings / Transcripts"
      && normalizeSourceProvider("LINEAR") === "Linear"
      && normalizeSourceProvider("Acme source cloud") === "Acme Source Cloud");
  check("external intelligence without typed producer does not fabricate Hermes",
    sourceProviderOf({ kind: "intel", label: "opaque", slice: "evidence", ref: "Intelligence:test", lane: "decisions" }) === null);

  verifyGraph("deterministic JSA fixture", exportAuditGraph(jsaShapedGraph()), { id: "jsa", name: "JSA" });
  const mirror = loadCapture("artifacts/rubric-production-parity/jsa-production-mirror.json");
  verifyGraph("redacted production-shaped JSA mirror", mirror.graph, mirror.scope);
  try {
    const current = loadCapture("artifacts/rubric-production-parity/production-jsa-graph.json");
    verifyGraph("read-only current production capture", current.graph, current.scope);
  } catch (error) {
    console.log(`SKIP  read-only current production capture — ${error instanceof Error ? error.message : String(error)}`);
  }

  if (failures > 0) throw new Error(`${failures} Phase 3 proof failure${failures === 1 ? "" : "s"}`);
  console.log("\nSignal Rubric Phase 3 protected-law proof passed.");
}

main();
