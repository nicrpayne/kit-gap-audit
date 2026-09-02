// Create a public-safe, topology-exact mirror from a read-only production
// GET /api/audit/graph capture.
//
// The repository is public, so canonical ids, labels, excerpts, statements,
// people and source references must never enter the durable fixture. This
// keeps the exact node/edge census, membership topology, presentation kinds,
// lanes, disagreement state, source grouping and external subtype/currentness
// while replacing every project-specific identity and all free text.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

type NodeRecord = { key: string; attributes: Record<string, unknown> };
type EdgeRecord = { source: string; target: string; attributes: Record<string, unknown> };
type Payload = {
  measurement: unknown;
  rules: unknown;
  graph: { nodes: NodeRecord[]; edges: EdgeRecord[] };
};

const source = process.argv[2] ?? "artifacts/rubric-production-parity/production-jsa-graph.json";
const output = process.argv[3] ?? "artifacts/rubric-production-parity/jsa-production-mirror.json";
const raw = readFileSync(source, "utf8");
const payload = JSON.parse(raw) as Payload;
const sorted = [...payload.graph.nodes].sort((a, b) => a.key.localeCompare(b.key));
const counters = new Map<string, number>();
const ids = new Map<string, string>();

for (const node of sorted) {
  const kind = String(node.attributes.kind);
  const lane = String(node.attributes.lane ?? "");
  if (kind === "reality") ids.set(node.key, "reality");
  else if (kind === "lane") ids.set(node.key, `lane:${lane}`);
  else {
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    ids.set(node.key, `${kind}:mirror:${String(next).padStart(3, "0")}`);
  }
}

const presentationKeys = new Set([
  "kind",
  "slice",
  "lane",
  "state",
  "tier",
  "handled",
  "needsHuman",
  "blocking",
  "type",
  "kindLabel",
  "family",
  "supplied",
  "status",
  "gated",
  "sourceType",
  "producer",
  "intelligenceType",
  "isCurrent",
]);

const nodes = sorted.map((node) => {
  const mapped = ids.get(node.key)!;
  const kind = String(node.attributes.kind);
  const attributes: Record<string, unknown> = {};
  for (const key of presentationKeys) if (key in node.attributes) attributes[key] = node.attributes[key];
  attributes.label = kind === "reality" ? "Reality" : kind === "scope" ? "JSA" : kind === "lane"
    ? String(node.attributes.label)
    : `${kind.replaceAll("_", " ")} ${mapped.split(":").at(-1)}`;
  attributes.ref = `Mirror:${mapped}`;
  return { key: mapped, attributes };
});

const edgeKeys = new Set(["rel", "basis", "rule", "intelRel", "relClass", "current"]);
const edges = payload.graph.edges.map((edge) => {
  const attributes: Record<string, unknown> = {};
  for (const key of edgeKeys) if (key in edge.attributes) attributes[key] = edge.attributes[key];
  return { source: ids.get(edge.source)!, target: ids.get(edge.target)!, attributes };
});

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const mirror = {
  _mirror: {
    sourceCaptureSha256: digest(raw),
    canonicalIdSetSha256: digest(sorted.map((node) => node.key).join("\n")),
    generatedBy: "scripts/audit-production-mirror-fixture.ts",
    redaction: "all canonical ids and free text replaced; topology and spatial attributes retained",
  },
  scopes: [{ id: "production-mirror-jsa", name: "JSA" }],
  scope: { id: "production-mirror-jsa", name: "JSA" },
  slice: "detail",
  measurement: payload.measurement,
  graph: { nodes, edges },
  rules: payload.rules,
  linearError: null,
};

writeFileSync(output, `${JSON.stringify(mirror, null, 2)}\n`);
console.log(`wrote ${output} — ${nodes.length} nodes, ${edges.length} edges`);
