// Phase 2 semantic/veracity proof. All inputs are read-only derived graphs.

import { readFileSync } from "node:fs";
import { exportAuditGraph, type AuditEdgeAttributes, type AuditNodeAttributes } from "../lib/audit/graph";
import {
  adaptSignalGraphToRubric,
  validateSignalRubricPayload,
  type ExportedSignalGraph,
  type SignalRubricPayload,
} from "../lib/audit/signalRubricAdapter";
import { jsaShapedGraph } from "./lib/jsa-shaped-fixture";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

function loadCapture(path: string): { scope: { id: string; name: string }; graph: ExportedSignalGraph } {
  return JSON.parse(readFileSync(path, "utf8")) as { scope: { id: string; name: string }; graph: ExportedSignalGraph };
}

function verify(name: string, graph: ExportedSignalGraph, scope: { id: string; name: string }) {
  console.log(`\n── ${name}: ${graph.nodes.length} canonical nodes · ${graph.edges.length} canonical edges ──`);
  const payload = adaptSignalGraphToRubric(graph, scope, `proof:${name}`);
  const errors = validateSignalRubricPayload(payload);
  const canonical = payload.nodes.filter((node) => !node.presentationOnly);
  const presentation = payload.nodes.filter((node) => node.presentationOnly);
  const byCanonical = new Map(canonical.map((node) => [node.canonicalId!, node]));
  const ids = new Set(payload.nodes.map((node) => node.id));

  check(`${name} validates`, errors.length === 0, errors.join("; "));
  check(`${name} preserves one projection per canonical id`, byCanonical.size === graph.nodes.length, `${byCanonical.size}/${graph.nodes.length}`);
  check(`${name} preserves every canonical edge`, payload.links.filter((link) => link.canonical).length === graph.edges.length);
  check(`${name} has no missing link endpoints`, payload.links.every((link) => ids.has(link.s) && ids.has(link.t)));
  check(`${name} emits no spatial fields`, payload.nodes.every((node) => !["x", "y", "fx", "fy", "vx", "vy", "radius", "angle", "camera", "targetX", "targetY"].some((key) => key in node)));
  check(`${name} aliases only the hard-coded Reality router`, canonical.filter((node) => node.id !== node.canonicalId).length === 1 && byCanonical.get("reality")?.id === "CLAUDE.md");
  check(`${name} reserves presentation ids`, presentation.every((node) => node.id.startsWith("signal:") || node.id.startsWith("hub:") || node.id.startsWith("lhub:")));

  const sourceEdges = graph.edges.filter((edge) => edge.attributes.rel === "extracted_from");
  check(`${name} preserves all passage → source attachments`, sourceEdges.every((edge) => {
    const adapted = payload.links.find((link) => link.canonical && link.s === (edge.source === "reality" ? "CLAUDE.md" : edge.source) && link.t === (edge.target === "reality" ? "CLAUDE.md" : edge.target));
    const sourceKind = graph.nodes.find((node) => node.key === edge.target)?.attributes.kind;
    return !!adapted && ["source", "transcript", "notion_page", "figma_artifact"].includes(String(sourceKind));
  }), `${sourceEdges.length} attachments`);

  const truthKinds = new Set(["finding", "decision", "dependency", "intel"]);
  check(`${name} copies status/currentness/subtype attributes`, graph.nodes.filter((node) => truthKinds.has(node.attributes.kind)).every((node) => {
    const adapted = byCanonical.get(node.key)?.attributes ?? {};
    return ["status", "handled", "blocking", "intelligenceType", "isCurrent"].every((key) => adapted[key] === node.attributes[key]);
  }));

  check(`${name} uses Source System anchors`, payload.nodes.some((node) => node.type === "app") && payload.meta.sourceSystems.length === payload.nodes.filter((node) => node.type === "app").length, payload.meta.sourceSystems.join(", "));
  check(`${name} maps Reality / Project Model / Project World / Attention`,
    byCanonical.get("reality")?.type === "router"
      && payload.nodes.some((node) => node.layer === "S" && !node.presentationOnly)
      && payload.nodes.some((node) => node.layer === "M" && !node.presentationOnly && node.canonicalId !== "reality")
      && payload.nodes.some((node) => node.layer === "R" && node.presentationOnly));

  const unsupported = payload.links.filter((link) => link.canonical).filter((link) => !graph.edges.some((edge) =>
    (edge.source === "reality" ? "CLAUDE.md" : edge.source) === link.s
      && (edge.target === "reality" ? "CLAUDE.md" : edge.target) === link.t
      && edge.attributes.rel === link.k
      && edge.attributes.basis === link.basis
      && edge.attributes.rule === link.rule
  ));
  check(`${name} invents no canonical relations`, unsupported.length === 0, `${unsupported.length} unsupported`);

  const summary = {
    name,
    canonicalNodes: graph.nodes.length,
    canonicalEdges: graph.edges.length,
    presentationNodes: payload.meta.presentationNodes,
    sourceSystems: payload.meta.sourceSystems,
    attention: payload.nodes.filter((node) => node.type === "routine").length,
    traceable: Object.keys(payload.meta.traceByNode).length,
  };
  console.log(JSON.stringify(summary));
  return payload;
}

function main() {
  const fixtureGraph = exportAuditGraph(jsaShapedGraph()) as { nodes: Array<{ key: string; attributes: AuditNodeAttributes }>; edges: Array<{ source: string; target: string; attributes: AuditEdgeAttributes }> };
  verify("deterministic JSA fixture", fixtureGraph, { id: "jsa", name: "JSA" });

  const mirror = loadCapture("artifacts/rubric-production-parity/jsa-production-mirror.json");
  const mirrorPayload = verify("redacted production-shaped JSA mirror", mirror.graph, mirror.scope);
  check("production-shaped mirror has the captured 438/543 census", mirrorPayload.meta.canonicalNodes === 438 && mirrorPayload.meta.canonicalEdges === 543);

  const liveCapturePath = "artifacts/rubric-production-parity/production-jsa-graph.json";
  try {
    const capture = loadCapture(liveCapturePath);
    const payload = verify("read-only current production capture", capture.graph, capture.scope);
    check("current production capture reconciles to mirror census", payload.meta.canonicalNodes === mirrorPayload.meta.canonicalNodes && payload.meta.canonicalEdges === mirrorPayload.meta.canonicalEdges);
  } catch (error) {
    console.log(`SKIP  read-only current production capture — ${error instanceof Error ? error.message : String(error)}`);
  }

  if (failures > 0) throw new Error(`${failures} SignalRubricAdapter proof failure${failures === 1 ? "" : "s"}`);
  console.log("\nSignalRubricAdapter veracity proof passed.");
}

main();
