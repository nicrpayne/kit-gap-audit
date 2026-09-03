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
  sourceSystemId?: string;
  sourceDepth?: "system" | "artifact" | "passage" | "claim" | "object";
  sourceCounts?: { linkedObjects: number; artifacts: number; passages: number; claims: number };
  worldLabel?: string;
  sourceRef?: string;
  sourceResolver?: string;
  disagreement?: string;
  realityRelationship?: "aligned" | "drift" | "conflict" | "unassessed";
  /** Semantic 0..1 score consumed only by the protected Rubric Rings hook. */
  realityDistance?: number;
  trustMaterial?: "attested" | "inferred" | "external";
  identityMinZoom?: number;
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
  intelRel?: string;
  current?: boolean;
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
    auditContext?:
      | { mode: "current" }
      | { mode: "audit"; id: string; title: string; kind: string; createdAt: string };
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

const SOURCE_PROVIDER_ALIASES = new Map<string, string>([
  ["linear", "Linear"],
  ["notion", "Notion"],
  ["figma", "Figma"],
  ["hermes", "Hermes"],
  ["meeting", "Meetings / Transcripts"],
  ["meetings", "Meetings / Transcripts"],
  ["transcript", "Meetings / Transcripts"],
  ["transcripts", "Meetings / Transcripts"],
  ["meetings transcripts", "Meetings / Transcripts"],
  ["document", "Documents"],
  ["documents", "Documents"],
  ["source", "Documents"],
  ["contextdoc", "Documents"],
  ["notes", "Documents"],
  ["spreadsheet", "Documents"],
]);

/** Normalize only typed provider fields. Arbitrary labels, excerpts, refs and
 * URLs never participate in provider identity. */
export function normalizeSourceProvider(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known = SOURCE_PROVIDER_ALIASES.get(key);
  if (known) return known;
  // An explicit canonical provider field may name a provider Signal has not
  // seen before. Preserve that typed identity while deterministically folding
  // case/separator variants into one anchor.
  return key.split(" ").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") || null;
}

export function sourceProviderOf(attrs: AuditNodeAttributes): string | null {
  const lane = String(attrs.lane ?? "").toLowerCase();
  const sourceType = String(attrs.sourceType ?? "").toLowerCase();
  // Provider identity comes only from canonical typed fields. Labels,
  // excerpts, source refs, and URL prose are deliberately absent here.
  const explicit = normalizeSourceProvider(attrs.sourceProvider ?? attrs.provider);
  if (explicit) return explicit;
  if (attrs.kind === "work" || attrs.kind === "feature" || lane === "linear" || sourceType.includes("linear")) return "Linear";
  if (attrs.kind === "notion_page" || sourceType.includes("notion") || lane === "notion") return "Notion";
  if (attrs.kind === "figma_artifact" || sourceType.includes("figma") || lane === "figma") return "Figma";
  if (lane === "hermes" || normalizeSourceProvider(attrs.producer) === "Hermes" || sourceType.includes("hermes")) return "Hermes";
  if (attrs.kind === "transcript" || sourceType === "transcript" || sourceType === "meeting") return "Meetings / Transcripts";
  if (attrs.kind === "source") return normalizeSourceProvider(sourceType) ?? "Documents";
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

export function realityRelationshipOf(attrs: AuditNodeAttributes): "aligned" | "drift" | "conflict" | "unassessed" {
  const state = String(attrs.state ?? "").toLowerCase();
  if (attrs.blocking === true || attrs.kind === "decisionGate" || ["conflict", "missing", "blocked", "blocking"].includes(state)) return "conflict";
  if (["drift", "unresolved", "unknown", "open", "pending"].includes(state)) return "drift";
  if (["aligned", "supporting", "supported", "resolved", "complete", "completed"].includes(state)) return "aligned";
  if (attrs.kind === "finding" && attrs.handled !== true) return "drift";
  if (attrs.kind === "decision") {
    const status = String(attrs.status ?? "").toLowerCase();
    if (["open", "pending", "unresolved"].includes(status)) return "drift";
    if (["accepted", "committed", "resolved", "closed", "decided"].includes(status)) return "aligned";
  }
  return "unassessed";
}

function realityDistanceOf(relationship: ReturnType<typeof realityRelationshipOf>): number {
  if (relationship === "aligned") return 0;
  if (relationship === "conflict") return 1;
  // Unassessed is intentionally the neutral midpoint. It is not derived
  // from trust, producer, currentness, or external-vs-accepted status.
  return 0.5;
}

export function trustMaterialOf(
  attrs: AuditNodeAttributes,
  connections: SignalRubricConnection[] = []
): "attested" | "inferred" | "external" {
  if (attrs.kind === "intel" || String(attrs.trust ?? "").toLowerCase() === "external") return "external";
  if (attrs.kind === "passage" || SOURCE_KINDS.has(attrs.kind)) return "attested";
  if (connections.some((connection) => connection.basis === "attested")) return "attested";
  if (connections.some((connection) => connection.basis === "external")) return "external";
  return "inferred";
}

function identityMinZoomOf(attrs: AuditNodeAttributes): number {
  if (attrs.kind === "passage") return 1.35;
  if (SOURCE_KINDS.has(attrs.kind) || attrs.kind === "intelligence") return 0.72;
  return 1.05;
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

  // Resolve the provenance horizon from typed canonical fields first, then
  // let passages inherit the provider of their exact extracted_from target.
  // No title, source-ref prose, or guessed hostname participates.
  const providerByCanonical = new Map<string, string>();
  for (const { key, attributes } of graph.nodes) {
    const provider = sourceProviderOf(attributes);
    if (provider) providerByCanonical.set(key, provider);
  }
  for (const edge of graph.edges) {
    if (edge.attributes.rel !== "extracted_from") continue;
    const source = canonicalById.get(edge.source);
    const provider = providerByCanonical.get(edge.target);
    if (source?.kind === "passage" && provider) providerByCanonical.set(edge.source, provider);
  }

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
    const provider = providerByCanonical.get(key) ?? null;
    const id = aliases.get(key)!;
    const realityRelationship = realityRelationshipOf(attributes);
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
      sourceSystemId: provider ? `${PRESENTATION_PREFIX}source:${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : undefined,
      sourceDepth: SOURCE_KINDS.has(attributes.kind) || attributes.kind === "intelligence" || attributes.kind === "work" || attributes.kind === "feature"
        ? "artifact"
        : attributes.kind === "passage" ? "passage"
          : attributes.kind === "finding" || attributes.kind === "intel" ? "claim"
            : "object",
      sourceRef: typeof attributes.sourceRef === "string" ? attributes.sourceRef : undefined,
      sourceResolver: resolverOf(attributes),
      disagreement: realityRelationship,
      realityRelationship,
      realityDistance: realityDistanceOf(realityRelationship),
      trustMaterial: trustMaterialOf(attributes, nodeConnections),
      identityMinZoom: identityMinZoomOf(attributes),
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
  const providerArtifacts = new Map<string, Set<string>>();
  const providerPassages = new Map<string, Set<string>>();
  const providerClaims = new Map<string, Set<string>>();
  for (const { key, attributes } of graph.nodes) {
    const provider = providerByCanonical.get(key);
    if (provider) {
      const members = providerMembers.get(provider) ?? new Set<string>();
      members.add(key);
      providerMembers.set(provider, members);
      if (attributes.kind === "finding" || attributes.kind === "intel") {
        const claims = providerClaims.get(provider) ?? new Set<string>();
        claims.add(key);
        providerClaims.set(provider, claims);
      } else if (SOURCE_KINDS.has(attributes.kind) || attributes.kind === "intelligence" || attributes.kind === "work" || attributes.kind === "feature") {
        const artifacts = providerArtifacts.get(provider) ?? new Set<string>();
        artifacts.add(key);
        providerArtifacts.set(provider, artifacts);
      }
    }
    if (provider && attributes.kind === "passage") {
      const passages = providerPassages.get(provider) ?? new Set<string>();
      passages.add(key);
      providerPassages.set(provider, passages);
    }
  }

  for (const edge of graph.edges) {
    if (!PROVENANCE_RELS.has(edge.attributes.rel)) continue;
    const source = canonicalById.get(edge.source);
    if (!source || (source.kind !== "finding" && source.kind !== "intel")) continue;
    const provider = providerByCanonical.get(edge.target);
    if (!provider) continue;
    const claims = providerClaims.get(provider) ?? new Set<string>();
    claims.add(edge.source);
    providerClaims.set(provider, claims);
    const members = providerMembers.get(provider) ?? new Set<string>();
    members.add(edge.source);
    providerMembers.set(provider, members);
  }

  const providerId = (provider: string) => `${PRESENTATION_PREFIX}source:${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  for (const [provider, members] of [...providerMembers].sort(([a], [b]) => a.localeCompare(b))) {
    const artifacts = providerArtifacts.get(provider) ?? new Set<string>();
    const passages = providerPassages.get(provider) ?? new Set<string>();
    const claims = providerClaims.get(provider) ?? new Set<string>();
    const allMembers = new Set([...members, ...passages, ...claims]);
    const sourceCounts = { linkedObjects: allMembers.size, artifacts: artifacts.size, passages: passages.size, claims: claims.size };
    nodes.push({
      id: providerId(provider),
      type: "app",
      layer: "A",
      label: provider,
      worldLabel: `${provider} · ${sourceCounts.linkedObjects} linked`,
      kind: "source system",
      status: "read-only",
      desc: `${sourceCounts.linkedObjects} linked object${sourceCounts.linkedObjects === 1 ? "" : "s"} · ${sourceCounts.artifacts} artifact${sourceCounts.artifacts === 1 ? "" : "s"} · ${sourceCounts.passages} passage${sourceCounts.passages === 1 ? "" : "s"} · ${sourceCounts.claims} claim${sourceCounts.claims === 1 ? "" : "s"}`,
      access: "both",
      presentationOnly: true,
      memberIds: [...allMembers].sort(),
      sourceProvider: provider,
      sourceSystemId: providerId(provider),
      sourceDepth: "system",
      sourceCounts,
      identityMinZoom: 0,
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
      realityRelationship: canonical.realityRelationship,
      realityDistance: canonical.realityDistance,
      trustMaterial: canonical.trustMaterial,
      identityMinZoom: 0.82,
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
      ...(typeof edge.attributes.intelRel === "string" ? { intelRel: edge.attributes.intelRel } : {}),
      ...(typeof edge.attributes.current === "boolean" ? { current: edge.attributes.current } : {}),
    });
  }

  const presentationNodes = nodes.filter((node) => node.presentationOnly).length;
  const sourceSystems = [...providerMembers.keys()].sort();
  const traceByNode = tracesFor(graph, aliases);
  for (const node of nodes) {
    if (!node.presentationOnly || !node.canonicalId) continue;
    const canonicalTransportId = aliases.get(node.canonicalId);
    if (canonicalTransportId && traceByNode[canonicalTransportId]) {
      traceByNode[node.id] = traceByNode[canonicalTransportId];
    }
  }
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
      traceByNode,
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
  const canonicalIdSet = new Set(canonicalIds);
  if (canonicalIds.some((id) => !id)) errors.push("canonical projection missing canonicalId");
  if (new Set(canonicalIds).size !== canonicalIds.length) errors.push("duplicate canonical projection");
  if (canonicalNodes.length !== payload.meta.canonicalNodes) errors.push("canonical node count does not reconcile");
  if (payload.links.filter((link) => link.canonical).length !== payload.meta.canonicalEdges) errors.push("canonical edge count does not reconcile");
  if (payload.nodes.find((node) => node.type === "router")?.canonicalId !== "reality") errors.push("Reality router alias is invalid");
  for (const node of canonicalNodes) {
    if (node.layer === "M" && node.type !== "router" && ![0, 0.5, 1].includes(node.realityDistance ?? -1)) {
      errors.push(`Project World node ${node.id} has invalid Reality-distance semantics`);
    }
    if (node.type !== "router" && !["attested", "inferred", "external"].includes(node.trustMaterial ?? "")) {
      errors.push(`canonical node ${node.id} has no trust material`);
    }
  }
  const sourceAnchors = payload.nodes.filter((node) => node.type === "app");
  if (new Set(sourceAnchors.map((source) => source.sourceProvider)).size !== sourceAnchors.length) {
    errors.push("duplicate normalized Source System anchor");
  }
  for (const source of sourceAnchors) {
    if (!source.presentationOnly || source.sourceDepth !== "system" || !source.sourceCounts) {
      errors.push(`Source System anchor ${source.id} is missing provenance-horizon metadata`);
      continue;
    }
    const members = new Set(source.memberIds ?? []);
    if (members.size !== source.sourceCounts.linkedObjects) {
      errors.push(`Source System anchor ${source.id} linked-object count does not reconcile`);
    }
    if ([...members].some((id) => !canonicalIdSet.has(id))) {
      errors.push(`Source System anchor ${source.id} contains a non-canonical member`);
    }
    if (![source.sourceCounts.artifacts, source.sourceCounts.passages, source.sourceCounts.claims].every((count) => count <= source.sourceCounts!.linkedObjects)) {
      errors.push(`Source System anchor ${source.id} category count exceeds linked objects`);
    }
    if (!source.worldLabel?.includes(" linked")) {
      errors.push(`Source System anchor ${source.id} presents an ambiguous population count`);
    }
  }
  for (const node of canonicalNodes.filter((candidate) => candidate.sourceProvider)) {
    const anchor = sourceAnchors.find((source) => source.sourceProvider === node.sourceProvider);
    if (!anchor || !anchor.memberIds?.includes(node.canonicalId!)) {
      errors.push(`canonical node ${node.id} is missing its normalized Source System membership`);
    }
  }
  return errors;
}
