import type { AuditEdgeAttributes, AuditNodeAttributes, EdgeRel, NodeKind } from "./graph";

export interface ExportedSignalGraph {
  nodes: Array<{ key: string; attributes: AuditNodeAttributes }>;
  edges: Array<{ source: string; target: string; attributes: AuditEdgeAttributes }>;
}

export interface RubricDepartment {
  key: string;
  label: string;
  color: string;
  icon: string;
}

export interface RubricLayer {
  key: "A" | "R" | "M" | "S";
  label: string;
  color: string;
  shape: string;
  blurb: string;
}

export interface SignalRubricConnection {
  id: string;
  transportId: string;
  label: string;
  rel: EdgeRel;
  basis: string;
  rule: string;
  direction: "out" | "in";
  intelRel?: string;
  current?: boolean;
}

export interface SignalRubricNode {
  id: string;
  canonicalId?: string;
  canonicalRef?: string;
  presentationOnly?: boolean;
  memberIds?: string[];
  type: "router" | "hub" | "file" | "dir" | "routine" | "app";
  hubKind?: "dept" | "layer";
  layer: "A" | "R" | "M" | "S";
  label: string;
  dept?: string | null;
  access?: "both";
  size?: number;
  ext?: string;
  path?: string;
  kind?: string;
  status?: string;
  desc?: string;
  schedule?: string;
  runner?: string;
  sourceProvider?: string;
  sourceRef?: string;
  sourceResolver?: string;
  disagreement?: string;
  currentness?: string;
  basisSummary?: string;
  attributes?: Record<string, unknown>;
  connections?: SignalRubricConnection[];
}

export interface SignalRubricLink {
  s: string;
  t: string;
  k: string;
  w?: number;
  canonical?: boolean;
  basis?: string;
  rule?: string;
}

export interface SignalRubricPayload {
  meta: {
    adapter: "SignalRubricAdapter";
    scopeId: string;
    scopeName: string;
    canonicalNodes: number;
    canonicalEdges: number;
    presentationNodes: number;
    sourceSystems: string[];
    transportAliases: Record<string, string>;
    traceByNode: Record<string, Array<{ s: string; t: string; rel: string; basis: string }>>;
    scannedAt: string;
    scanMs: number;
    totalFiles: number;
    totalDirs: number;
    mdParsed: number;
    mdRead: number;
    mdCached: number;
    visibleNodes: number;
    mdLinks: number;
    hiddenCount: number;
  };
  departments: RubricDepartment[];
  layers: RubricLayer[];
  nodes: SignalRubricNode[];
  links: SignalRubricLink[];
  mdLinks: Array<[string, string]>;
}

const REALITY_TRANSPORT_ID = "CLAUDE.md";
const PRESENTATION_PREFIX = "signal:";

export const SIGNAL_RUBRIC_DEPARTMENTS: RubricDepartment[] = [
  { key: "delivery", label: "Delivery", color: "#e040fb", icon: "build" },
  { key: "evidence", label: "Evidence", color: "#2196f3", icon: "data" },
  { key: "external", label: "External Intelligence", color: "#00bcd4", icon: "spark" },
  { key: "decisions", label: "Decisions", color: "#f5a623", icon: "decision" },
  { key: "dependencies", label: "Dependencies", color: "#b47aff", icon: "link" },
  { key: "capacity", label: "Capacity / People", color: "#56d97a", icon: "people" },
];

export const SIGNAL_RUBRIC_LAYERS: RubricLayer[] = [
  { key: "A", label: "Source Systems", color: "#3f8fd4", shape: "hex", blurb: "Actual systems and providers represented in this Audit" },
  { key: "R", label: "Attention", color: "#d99a1f", shape: "ringdot", blurb: "Current unresolved findings, decisions, blockers, risks, and unknowns" },
  { key: "M", label: "Project World", color: "#9a66e0", shape: "chip", blurb: "Canonical project objects, evidence, work, people, and external intelligence" },
  { key: "S", label: "Project Model", color: "#ff6b1a", shape: "diamond", blurb: "Accepted scope, governing requirements, constraints, and supplied truth lanes" },
];

const SOURCE_KINDS = new Set<NodeKind>(["source", "transcript", "notion_page", "figma_artifact"]);
const MODEL_KINDS = new Set<NodeKind>(["scope", "requirement"]);
const PROVENANCE_RELS = new Set<EdgeRel>([
  "extracted_from",
  "evidenced_by",
  "cites",
  "concerns",
  "missing_from",
  "supports",
  "attests",
  "belongs_to",
]);

function transportId(canonicalId: string): string {
  return canonicalId === "reality" ? REALITY_TRANSPORT_ID : canonicalId;
}

function territoryOf(attrs: AuditNodeAttributes): string {
  if (attrs.kind === "work" || attrs.kind === "feature" || attrs.lane === "linear") return "delivery";
  if (attrs.kind === "intel" || attrs.kind === "intelligence" || attrs.lane === "hermes") return "external";
  if (attrs.kind === "decision" || attrs.kind === "decisionGate" || attrs.lane === "decisions") return "decisions";
  if (attrs.kind === "dependency" || attrs.lane === "dependencies") return "dependencies";
  if (attrs.kind === "person" || attrs.lane === "capacity") return "capacity";
  return "evidence";
}

function humanizeSourceRef(value: string): string {
  const tail = value.split("/").filter(Boolean).at(-1) ?? value;
  return tail.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, "").replace(/[_-]+/g, " ").trim() || value;
}

function labelOf(attrs: AuditNodeAttributes): string {
  if (attrs.kind === "passage" && typeof attrs.excerpt === "string" && attrs.excerpt.trim()) {
    const text = attrs.excerpt.trim().replace(/^[“\"']+|[”\"']+$/g, "");
    return text.length > 66 ? `${text.slice(0, 65)}…` : text;
  }
  if (SOURCE_KINDS.has(attrs.kind)) return humanizeSourceRef(String(attrs.label ?? "Source"));
  if (attrs.kind === "work" && typeof attrs.title === "string" && attrs.title.trim()) return attrs.title.trim();
  return String(attrs.label ?? attrs.ref ?? "Untitled");
}

function sourceProviderOf(attrs: AuditNodeAttributes): string | null {
  const lane = String(attrs.lane ?? "").toLowerCase();
  const sourceType = String(attrs.sourceType ?? "").toLowerCase();
  const haystack = `${lane} ${sourceType} ${String(attrs.label ?? "")} ${String(attrs.sourceRef ?? "")}`.toLowerCase();
  if (haystack.includes("linear")) return "Linear";
  if (haystack.includes("notion")) return "Notion";
  if (haystack.includes("figma")) return "Figma";
  if (attrs.kind === "intelligence" || attrs.kind === "intel" || lane === "hermes") return "Hermes";
  if (attrs.kind === "transcript" || haystack.includes("transcript") || haystack.includes("meeting")) return "Meetings / Transcripts";
  if (SOURCE_KINDS.has(attrs.kind)) return "Documents";
  return null;
}

function resolverOf(attrs: AuditNodeAttributes): string | undefined {
  for (const value of [attrs.externalRef, attrs.sourceRef]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return undefined;
}

function isAcceptedDecision(attrs: AuditNodeAttributes): boolean {
  if (attrs.kind !== "decision") return false;
  return ["accepted", "committed", "resolved", "closed", "decided"].includes(String(attrs.status ?? "").toLowerCase());
}

function qualifiesForAttention(attrs: AuditNodeAttributes): boolean {
  if (attrs.kind === "finding") return attrs.handled !== true;
  if (attrs.kind === "decision") return ["open", "pending", "unresolved"].includes(String(attrs.status ?? "").toLowerCase());
  if (attrs.kind === "decisionGate") return true;
  if (attrs.kind === "intel" && attrs.isCurrent === true) {
    return ["risk", "unknown"].includes(String(attrs.intelligenceType ?? "").toLowerCase());
  }
  return false;
}

function disagreementOf(attrs: AuditNodeAttributes): string | undefined {
  const state = String(attrs.state ?? "").toLowerCase();
  if (["conflict", "missing", "drift", "unknown"].includes(state)) return state;
  if (attrs.kind === "finding" && attrs.handled !== true) return "open";
  return undefined;
}

function nodeSize(attrs: AuditNodeAttributes): number {
  const text = `${String(attrs.label ?? "")} ${String(attrs.statement ?? "")} ${String(attrs.excerpt ?? "")}`;
  return Math.max(900, Math.min(128_000, text.length * 1200));
}

function basisSummaryOf(connections: SignalRubricConnection[]): string {
  const counts = new Map<string, number>();
  for (const c of connections) counts.set(c.basis, (counts.get(c.basis) ?? 0) + 1);
  return ["attested", "inferred", "external"]
    .filter((basis) => counts.has(basis))
    .map((basis) => `${basis} ${counts.get(basis)}`)
    .join(" · ");
}

function tracesFor(
  graph: ExportedSignalGraph,
  aliases: Map<string, string>
): Record<string, Array<{ s: string; t: string; rel: string; basis: string }>> {
  const adj = new Map<string, Array<{ next: string; edge: ExportedSignalGraph["edges"][number] }>>();
  for (const edge of graph.edges) {
    if (!PROVENANCE_RELS.has(edge.attributes.rel)) continue;
    const a = adj.get(edge.source) ?? [];
    const b = adj.get(edge.target) ?? [];
    a.push({ next: edge.target, edge });
    b.push({ next: edge.source, edge });
    adj.set(edge.source, a);
    adj.set(edge.target, b);
  }

  const result: Record<string, Array<{ s: string; t: string; rel: string; basis: string }>> = {};
  for (const start of graph.nodes.map((node) => node.key)) {
    if (start === "reality") continue;
    const queue: Array<{ id: string; path: ExportedSignalGraph["edges"] }> = [{ id: start, path: [] }];
    const seen = new Set([start]);
    let found: ExportedSignalGraph["edges"] | null = null;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === "reality") { found = current.path; break; }
      if (current.path.length >= 7) continue;
      for (const hop of adj.get(current.id) ?? []) {
        if (seen.has(hop.next)) continue;
        seen.add(hop.next);
        queue.push({ id: hop.next, path: [...current.path, hop.edge] });
      }
    }
    if (!found || found.length === 0) continue;
    result[transportId(start)] = found.map((edge) => ({
      s: aliases.get(edge.source) ?? edge.source,
      t: aliases.get(edge.target) ?? edge.target,
      rel: edge.attributes.rel,
      basis: edge.attributes.basis,
    }));
  }
  return result;
}

export function adaptSignalGraphToRubric(
  graph: ExportedSignalGraph,
  scope: { id: string; name: string },
  generatedAt = "derived-read"
): SignalRubricPayload {
  const canonicalById = new Map(graph.nodes.map((node) => [node.key, node.attributes]));
  const aliases = new Map(graph.nodes.map((node) => [node.key, transportId(node.key)]));
  const connections = new Map<string, SignalRubricConnection[]>();

  for (const edge of graph.edges) {
    const source = canonicalById.get(edge.source);
    const target = canonicalById.get(edge.target);
    if (!source || !target) continue;
    const common = {
      rel: edge.attributes.rel,
      basis: edge.attributes.basis,
      rule: edge.attributes.rule,
      ...(typeof edge.attributes.intelRel === "string" ? { intelRel: edge.attributes.intelRel } : {}),
      ...(typeof edge.attributes.current === "boolean" ? { current: edge.attributes.current } : {}),
    };
    const sourceList = connections.get(edge.source) ?? [];
    sourceList.push({ id: edge.target, transportId: aliases.get(edge.target)!, label: labelOf(target), direction: "out", ...common });
    connections.set(edge.source, sourceList);
    const targetList = connections.get(edge.target) ?? [];
    targetList.push({ id: edge.source, transportId: aliases.get(edge.source)!, label: labelOf(source), direction: "in", ...common });
    connections.set(edge.target, targetList);
  }

  const nodes: SignalRubricNode[] = [];
  for (const { key, attributes } of graph.nodes) {
    const nodeConnections = connections.get(key) ?? [];
    const acceptedModel = MODEL_KINDS.has(attributes.kind)
      || (attributes.kind === "lane" && attributes.supplied === true)
      || isAcceptedDecision(attributes);
    const provider = sourceProviderOf(attributes);
    const id = aliases.get(key)!;
    nodes.push({
      id,
      canonicalId: key,
      canonicalRef: String(attributes.ref),
      type: attributes.kind === "reality" ? "router" : "file",
      layer: attributes.kind === "reality" ? "M" : acceptedModel ? "S" : "M",
      label: attributes.kind === "reality" ? "Reality" : labelOf(attributes),
      dept: attributes.kind === "reality" || acceptedModel ? null : territoryOf(attributes),
      access: "both",
      size: nodeSize(attributes),
      ext: ".md",
      path: id,
      kind: attributes.kind,
      status: typeof attributes.status === "string" ? attributes.status : undefined,
      desc: typeof attributes.statement === "string" ? attributes.statement
        : typeof attributes.detail === "string" ? attributes.detail
          : typeof attributes.excerpt === "string" ? attributes.excerpt
            : undefined,
      sourceProvider: provider ?? undefined,
      sourceRef: typeof attributes.sourceRef === "string" ? attributes.sourceRef : undefined,
      sourceResolver: resolverOf(attributes),
      disagreement: disagreementOf(attributes),
      currentness: typeof attributes.isCurrent === "boolean" ? (attributes.isCurrent ? "current" : "superseded") : undefined,
      basisSummary: basisSummaryOf(nodeConnections),
      attributes: { ...attributes },
      connections: nodeConnections,
    });
  }

  for (const dept of SIGNAL_RUBRIC_DEPARTMENTS) {
    nodes.push({
      id: `hub:${dept.key}`,
      type: "hub",
      hubKind: "dept",
      layer: "M",
      label: dept.label,
      dept: dept.key,
      presentationOnly: true,
      memberIds: graph.nodes.filter((n) => territoryOf(n.attributes) === dept.key && !MODEL_KINDS.has(n.attributes.kind)).map((n) => n.key),
    });
  }
  for (const layer of SIGNAL_RUBRIC_LAYERS.filter((layer) => layer.key !== "M")) {
    nodes.push({ id: `lhub:${layer.key}`, type: "hub", hubKind: "layer", layer: layer.key, label: layer.label, presentationOnly: true });
  }

  const providerMembers = new Map<string, Set<string>>();
  for (const { key, attributes } of graph.nodes) {
    const provider = sourceProviderOf(attributes);
    if (provider && (SOURCE_KINDS.has(attributes.kind) || attributes.kind === "intelligence" || attributes.kind === "intel" || attributes.kind === "work" || attributes.kind === "feature")) {
      const members = providerMembers.get(provider) ?? new Set<string>();
      members.add(key);
      providerMembers.set(provider, members);
    }
    if (attributes.kind === "lane" && attributes.supplied === true) {
      const laneProvider = sourceProviderOf({ ...attributes, kind: "source", sourceType: attributes.lane });
      if (laneProvider) {
        const members = providerMembers.get(laneProvider) ?? new Set<string>();
        members.add(key);
        providerMembers.set(laneProvider, members);
      }
    }
  }

  const providerId = (provider: string) => `${PRESENTATION_PREFIX}source:${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  for (const [provider, members] of [...providerMembers].sort(([a], [b]) => a.localeCompare(b))) {
    nodes.push({
      id: providerId(provider),
      type: "app",
      layer: "A",
      label: provider,
      kind: "source system",
      status: "read-only",
      desc: `${members.size} canonical object${members.size === 1 ? "" : "s"} represented`,
      access: "both",
      presentationOnly: true,
      memberIds: [...members].sort(),
    });
  }

  for (const { key, attributes } of graph.nodes) {
    if (!qualifiesForAttention(attributes)) continue;
    const canonical = nodes.find((node) => node.canonicalId === key)!;
    nodes.push({
      id: `${PRESENTATION_PREFIX}attention:${key}`,
      canonicalId: key,
      canonicalRef: String(attributes.ref),
      presentationOnly: true,
      memberIds: [key],
      type: "routine",
      layer: "R",
      label: canonical.label,
      kind: attributes.kind,
      status: "open",
      desc: canonical.desc,
      schedule: "Current",
      runner: "Signal",
      access: "both",
      disagreement: canonical.disagreement,
      currentness: canonical.currentness,
      basisSummary: canonical.basisSummary,
      attributes: { ...attributes },
      connections: canonical.connections,
    });
  }

  const links: SignalRubricLink[] = [];
  for (const dept of SIGNAL_RUBRIC_DEPARTMENTS) links.push({ s: REALITY_TRANSPORT_ID, t: `hub:${dept.key}`, k: "route" });
  for (const layer of SIGNAL_RUBRIC_LAYERS.filter((layer) => layer.key !== "M")) links.push({ s: REALITY_TRANSPORT_ID, t: `lhub:${layer.key}`, k: "route" });
  for (const node of nodes) {
    if (node.type === "router" || node.type === "hub") continue;
    if (node.type === "app") links.push({ s: node.id, t: "lhub:A", k: "spoke" });
    else if (node.type === "routine") links.push({ s: node.id, t: "lhub:R", k: "spoke" });
    else if (node.layer === "S") links.push({ s: node.id, t: "lhub:S", k: "spoke" });
    else if (node.dept) links.push({ s: node.id, t: `hub:${node.dept}`, k: "spoke" });
  }
  for (const [provider, members] of providerMembers) {
    for (const member of members) links.push({ s: aliases.get(member)!, t: providerId(provider), k: "spoke" });
  }
  for (const edge of graph.edges) {
    links.push({
      s: aliases.get(edge.source)!,
      t: aliases.get(edge.target)!,
      k: edge.attributes.rel,
      canonical: true,
      basis: edge.attributes.basis,
      rule: edge.attributes.rule,
    });
  }

  const presentationNodes = nodes.filter((node) => node.presentationOnly).length;
  const sourceSystems = [...providerMembers.keys()].sort();
  return {
    meta: {
      adapter: "SignalRubricAdapter",
      scopeId: scope.id,
      scopeName: scope.name,
      canonicalNodes: graph.nodes.length,
      canonicalEdges: graph.edges.length,
      presentationNodes,
      sourceSystems,
      transportAliases: { reality: REALITY_TRANSPORT_ID },
      traceByNode: tracesFor(graph, aliases),
      scannedAt: generatedAt,
      scanMs: 0,
      totalFiles: graph.nodes.length,
      totalDirs: presentationNodes,
      mdParsed: 0,
      mdRead: 0,
      mdCached: 0,
      visibleNodes: nodes.length,
      mdLinks: graph.edges.length,
      hiddenCount: 0,
    },
    departments: SIGNAL_RUBRIC_DEPARTMENTS,
    layers: SIGNAL_RUBRIC_LAYERS,
    nodes,
    links,
    mdLinks: [],
  };
}

export function validateSignalRubricPayload(payload: SignalRubricPayload): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of payload.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate transport node ${node.id}`);
    ids.add(node.id);
    for (const forbidden of ["x", "y", "fx", "fy", "vx", "vy", "radius", "angle", "camera", "targetX", "targetY"]) {
      if (forbidden in node) errors.push(`adapter emitted spatial field ${forbidden} on ${node.id}`);
    }
  }
  for (const link of payload.links) {
    if (!ids.has(link.s)) errors.push(`missing link source ${link.s}`);
    if (!ids.has(link.t)) errors.push(`missing link target ${link.t}`);
  }
  const canonicalNodes = payload.nodes.filter((node) => !node.presentationOnly);
  const canonicalIds = canonicalNodes.map((node) => node.canonicalId);
  if (canonicalIds.some((id) => !id)) errors.push("canonical projection missing canonicalId");
  if (new Set(canonicalIds).size !== canonicalIds.length) errors.push("duplicate canonical projection");
  if (canonicalNodes.length !== payload.meta.canonicalNodes) errors.push("canonical node count does not reconcile");
  if (payload.links.filter((link) => link.canonical).length !== payload.meta.canonicalEdges) errors.push("canonical edge count does not reconcile");
  if (payload.nodes.find((node) => node.type === "router")?.canonicalId !== "reality") errors.push("Reality router alias is invalid");
  return errors;
}
