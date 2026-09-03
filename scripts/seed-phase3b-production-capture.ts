// Reconstruct the read-only production-shaped JSA capture through Signal's
// real persistence and graph-loading contracts, inside the Phase 3B
// disposable database only.
//
// The raw captures are deliberately gitignored because they contain real
// project identity and excerpts. This script contains no captured values: it
// reads those local files, rebuilds first-class records and immutable
// ContextSnapshots, then requires the normal graph loader to reproduce the
// exact 438-node / 543-edge canonical graph before it succeeds.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashProjectContextPackage } from "../lib/context/hash";
import type { ProjectContextPackage } from "../lib/context/package";
import { evaluateSourcePolicyCompleteness, type RegistrationLike } from "../lib/context/sourcePolicy";
import { validateProjectContextPackage } from "../lib/context/validate";
import { buildAuditGraph, exportAuditGraph } from "../lib/audit/graph";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { adaptSignalGraphToRubric } from "../lib/audit/signalRubricAdapter";

type JsonRecord = Record<string, unknown>;
type CapturedNode = { key: string; attributes: JsonRecord };
type CapturedEdge = { source: string; target: string; attributes: JsonRecord };
type GraphCapture = {
  scopes: Array<{ id: string; name: string }>;
  scope: { id: string; name: string };
  graph: { nodes: CapturedNode[]; edges: CapturedEdge[] };
};
type TruthFinding = {
  id: string;
  type: string;
  title: string;
  severity: string;
  blocking: boolean;
  status: string;
  quote: string;
  rationale: string;
  owner: string | null;
  blocks: string | null;
  matchedIssues: string[];
  estimateHint: string | null;
  createdAt: string;
};
type TruthProvenance = {
  snapshot?: { id: string; producer: string; packageId: string; generatedAt: string; acceptedAt: string } | null;
  passages?: Array<{
    evidenceId: string;
    kind: string;
    sourceRef: string;
    sourceType: string;
    role: string;
    status: string;
    observedAt: string;
    externalRef: string | null;
    registrationId: string | null;
  }>;
  source?: { id: string; kind: string; title: string; createdAt: string } | null;
};
type TruthCapture = {
  scope: { id: string; name: string; targetDate: string | null };
  model: {
    findings: TruthFinding[];
    lanes: Array<{ id: string; supplied: boolean; checkpoints: Array<{ id: string; detail: string }> }>;
    lastRunAt: string | null;
    priorRunAt: string | null;
  };
  provenance: Record<string, TruthProvenance>;
};

const prisma = new PrismaClient();
const repoRoot = join(__dirname, "..");
const graphPath = process.env.PHASE3B_PRODUCTION_GRAPH ??
  join(repoRoot, "artifacts/rubric-production-parity/production-jsa-graph.json");
const truthPath = process.env.PHASE3B_PRODUCTION_TRUTH ??
  join(repoRoot, "artifacts/rubric-production-parity/production-jsa-truth.json");

function fail(message: string): never {
  throw new Error(`Phase 3B production-shaped seed refused: ${message}`);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateValue(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function jsonRecord(value: unknown): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function edgeSignature(edge: CapturedEdge): string {
  return [
    edge.source,
    edge.target,
    stringValue(edge.attributes.rel),
    stringValue(edge.attributes.basis),
    stringValue(edge.attributes.rule),
  ].join("|");
}

function digest(values: string[]): string {
  return createHash("sha256").update([...values].sort().join("\n")).digest("hex");
}

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL is not set");
  const url = new URL(raw);
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || url.port !== "55432" || url.pathname !== "/signal_audit_p3b") {
    fail("DATABASE_URL is not the localhost:55432 signal_audit_p3b disposable database");
  }
  if (process.env.KIT_DEV_FIXTURES !== "1") {
    fail("KIT_DEV_FIXTURES=1 is required so no live provider can be read");
  }
}

function readCapture<T>(path: string, label: string): T {
  if (!existsSync(path)) {
    fail(`${label} is missing at ${path}; the gitignored read-only capture is required`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function kindNodes(graph: GraphCapture, kind: string): CapturedNode[] {
  return graph.graph.nodes.filter((node) => node.attributes.kind === kind);
}

function idAfter(key: string, prefix: string): string {
  if (!key.startsWith(prefix) || key.length === prefix.length) fail(`invalid captured key ${key}`);
  return key.slice(prefix.length);
}

async function assertEmptyDatabase(): Promise<void> {
  const counts = await Promise.all([
    prisma.scope.count(),
    prisma.source.count(),
    prisma.finding.count(),
    prisma.auditRun.count(),
    prisma.contextSnapshot.count(),
    prisma.decision.count(),
  ]);
  if (counts.some((count) => count !== 0)) {
    fail("database is not empty; refusing to merge a production-shaped fixture into existing rows");
  }
}

function capacityFromTruth(truth: TruthCapture): number {
  const detail = truth.model.lanes
    .find((lane) => lane.id === "capacity")
    ?.checkpoints.find((checkpoint) => checkpoint.id === "capacity:attested")
    ?.detail ?? "";
  const match = detail.match(/stated\s+([0-9]+(?:\.[0-9]+)?)\s+FTE/i);
  return match ? Number(match[1]) : 1;
}

function snapshotIds(graph: GraphCapture, truth: TruthCapture): string[] {
  const ids = new Set<string>();
  for (const node of kindNodes(graph, "intel")) {
    const id = stringValue(node.attributes.snapshotId);
    if (id) ids.add(id);
  }
  for (const provenance of Object.values(truth.provenance)) {
    if (provenance.snapshot?.id) ids.add(provenance.snapshot.id);
  }
  return [...ids].sort();
}

function passageIdentity(node: CapturedNode, knownSnapshots: string[]): { snapshotId: string; evidenceId: string } {
  for (const snapshotId of knownSnapshots) {
    const prefix = `passage:${snapshotId}:`;
    if (node.key.startsWith(prefix)) return { snapshotId, evidenceId: node.key.slice(prefix.length) };
  }
  fail(`passage ${node.key} does not name a captured ContextSnapshot`);
}

async function seedScopes(graph: GraphCapture, truth: TruthCapture): Promise<{ dependencyId: string; gateTargetId: string }> {
  const dependency = kindNodes(graph, "dependency")[0];
  if (!dependency) fail("capture has no dependency node");
  const dependencyId = idAfter(dependency.key, "dependency:");
  const capturedScopes = new Map(graph.scopes.map((scope) => [scope.id, scope.name]));
  if (!capturedScopes.has(dependencyId)) capturedScopes.set(dependencyId, stringValue(dependency.attributes.label, "Dependency"));

  const gateTargetId = [...capturedScopes.keys()].find((id) => id !== graph.scope.id && id !== dependencyId)
    ?? "phase3b-captured-gate-target";
  if (!capturedScopes.has(gateTargetId)) capturedScopes.set(gateTargetId, "Captured gate target");

  for (const [id, name] of capturedScopes) {
    const selected = id === graph.scope.id;
    const upstream = id === dependencyId;
    await prisma.scope.create({
      data: {
        id,
        name,
        teamKey: selected ? "P3B_CAPTURE" : `P3B_${id.slice(-8)}`,
        projectNames: [],
        targetDate: selected
          ? (truth.scope.targetDate ? new Date(truth.scope.targetDate) : null)
          : upstream ? dateValue(dependency.attributes.targetDate, new Date("2026-12-31T00:00:00.000Z")) : null,
        teamCapacity: selected ? capacityFromTruth(truth) : null,
        includeTriage: false,
        notionPageIds: [],
        figmaRefs: [],
        dependsOnScopeIds: selected ? [dependencyId] : [],
      },
    });
  }
  return { dependencyId, gateTargetId };
}

function registrationRows(truth: TruthCapture): RegistrationLike[] {
  const registrations = new Map<string, RegistrationLike>();
  for (const provenance of Object.values(truth.provenance)) {
    for (const passage of provenance.passages ?? []) {
      if (!passage.registrationId) continue;
      registrations.set(passage.registrationId, {
        id: passage.registrationId,
        sourceType: passage.sourceType,
        sourceRef: passage.sourceRef,
        scopeIds: [truth.scope.id],
        role: passage.role,
        status: passage.status,
      });
    }
  }
  return [...registrations.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function seedRegistrations(rows: RegistrationLike[]): Promise<void> {
  for (const row of rows) {
    await prisma.sourceRegistration.create({
      data: { ...row, rationale: "Reconstructed from the read-only Phase 3B production capture" },
    });
  }
}

function packageForSnapshot(
  graph: GraphCapture,
  truth: TruthCapture,
  snapshotId: string,
  allSnapshotIds: string[],
  registrations: RegistrationLike[]
): { pkg: ProjectContextPackage; acceptedAt: Date } {
  const nodeByKey = new Map(graph.graph.nodes.map((node) => [node.key, node]));
  const passageNodes = kindNodes(graph, "passage").filter(
    (node) => passageIdentity(node, allSnapshotIds).snapshotId === snapshotId
  );
  const evidenceKind = new Map<string, string>();
  for (const provenance of Object.values(truth.provenance)) {
    if (provenance.snapshot?.id !== snapshotId) continue;
    for (const passage of provenance.passages ?? []) evidenceKind.set(passage.evidenceId, passage.kind);
  }

  const evidence = passageNodes.map((node) => {
    const { evidenceId } = passageIdentity(node, allSnapshotIds);
    const anchor = jsonRecord(node.attributes.anchor);
    return {
      id: evidenceId,
      sourceRef: stringValue(node.attributes.sourceRef),
      kind: evidenceKind.get(evidenceId) ?? "passage",
      excerpt: stringValue(node.attributes.excerpt),
      ...(nullableString(node.attributes.externalRef) ? { externalRef: stringValue(node.attributes.externalRef) } : {}),
      ...(nullableString(node.attributes.independence) ? { independence: stringValue(node.attributes.independence) } : {}),
      ...(Object.keys(anchor).length > 0 ? { data: anchor } : {}),
    };
  });

  const registrationByRef = new Map(registrations.map((registration) => [registration.sourceRef, registration]));
  const sourceRefs = [...new Set(evidence.map((item) => item.sourceRef))].sort();
  const sources = sourceRefs.map((sourceRef) => {
    const node = nodeByKey.get(`source:pkg:${sourceRef}`);
    if (!node) fail(`captured passage source ${sourceRef} has no package-source node`);
    const registration = registrationByRef.get(sourceRef);
    return {
      sourceType: stringValue(node.attributes.sourceType, "source"),
      sourceRef,
      registrationId: registration?.id ?? null,
      role: nullableString(node.attributes.role),
      status: stringValue(node.attributes.status, "candidate") as ProjectContextPackage["sources"][number]["status"],
      observedAt: dateValue(node.attributes.observedAt, new Date("2026-08-01T00:00:00.000Z")).toISOString(),
      succeeded: true,
      detail: null,
    };
  });

  const intelNodes = kindNodes(graph, "intel").filter((node) => node.attributes.snapshotId === snapshotId);
  const evidenceIdByPassage = new Map(
    passageNodes.map((node) => [node.key, passageIdentity(node, allSnapshotIds).evidenceId])
  );
  const citationEdges = graph.graph.edges.filter(
    (edge) => edge.attributes.rule === "intel-cites-passage" && nodeByKey.get(edge.source)?.attributes.snapshotId === snapshotId
  );
  const refsByIntel = new Map<string, string[]>();
  for (const edge of citationEdges) {
    const evidenceId = evidenceIdByPassage.get(edge.target);
    if (!evidenceId) fail(`intelligence citation ${edge.source} has no captured passage target`);
    const refs = refsByIntel.get(edge.source) ?? [];
    refs.push(evidenceId);
    refsByIntel.set(edge.source, refs);
  }
  const intelligenceObjects = intelNodes.map((node) => ({
    id: stringValue(node.attributes.externalId),
    intelligenceType: stringValue(node.attributes.intelligenceType),
    trust: stringValue(node.attributes.trust),
    statement: stringValue(node.attributes.statement),
    ...(nullableString(node.attributes.statementBasis) ? { statementBasis: stringValue(node.attributes.statementBasis) } : {}),
    ...(nullableString(node.attributes.dataStatus) ? { status: stringValue(node.attributes.dataStatus) } : {}),
    isCurrent: node.attributes.isCurrent === true,
    ...(nullableString(node.attributes.observedDate) ? { observedDate: stringValue(node.attributes.observedDate) } : {}),
    dates: jsonRecord(node.attributes.dates),
    scope: Array.isArray(node.attributes.scope) ? node.attributes.scope.filter((value): value is string => typeof value === "string") : [],
    evidenceRefs: [...new Set(refsByIntel.get(node.key) ?? [])].sort(),
    fields: jsonRecord(node.attributes.fields),
    provenance: jsonRecord(node.attributes.provenance),
    extra: jsonRecord(node.attributes.extra),
  }));

  const intelligenceRelations = graph.graph.edges
    .filter((edge) => edge.attributes.rule === "intel-relates-intel" && nodeByKey.get(edge.source)?.attributes.snapshotId === snapshotId)
    .map((edge) => ({
      from: stringValue(nodeByKey.get(edge.source)?.attributes.externalId),
      rel: stringValue(edge.attributes.intelRel),
      to: stringValue(nodeByKey.get(edge.target)?.attributes.externalId),
      relClass: stringValue(edge.attributes.relClass, "contextual"),
      fromInPackage: true,
      toInPackage: true,
      declared: jsonRecord(edge.attributes.declared),
    }));

  const capturedProvenance = Object.values(truth.provenance).find((value) => value.snapshot?.id === snapshotId)?.snapshot;
  const intelligenceAggregate = nodeByKey.get(`intelligence:${snapshotId}`);
  const observedDates = sources.map((source) => Date.parse(source.observedAt)).filter(Number.isFinite);
  const generatedAt = capturedProvenance?.generatedAt ??
    new Date(observedDates.length > 0 ? Math.max(...observedDates) : Date.parse("2026-08-01T00:00:00.000Z")).toISOString();
  const acceptedAt = dateValue(
    capturedProvenance?.acceptedAt ?? intelligenceAggregate?.attributes.acceptedAt,
    new Date(generatedAt)
  );
  const producer = stringValue(capturedProvenance?.producer ?? intelligenceAggregate?.attributes.producer, "hermes");
  const packageId = capturedProvenance?.packageId ??
    stringValue(intelligenceAggregate?.attributes.label, `phase3b-production-capture-${snapshotId}`);

  const rawPackage = {
    version: intelligenceObjects.length > 0 ? "1.1" : "1.0",
    packageId,
    producer,
    generatedAt,
    scopeId: graph.scope.id,
    sources,
    evidence,
    derivedClaims: [],
    ...(intelligenceObjects.length > 0 ? {
      intelligenceObjects,
      intelligenceRelations,
      intelligenceMeta: {
        batchId: `phase3b-production-capture-${snapshotId}`,
        generatedAt,
        objectCount: intelligenceObjects.length,
        currentCount: intelligenceObjects.filter((item) => item.isCurrent).length,
        relationCount: intelligenceRelations.length,
      },
    } : {}),
    completeness: { expectedSources: sourceRefs, missingSources: [], excludedSources: [] },
    warnings: ["Reconstructed locally from the read-only production graph capture for disposable acceptance only."],
  };

  return { pkg: validateProjectContextPackage(rawPackage), acceptedAt };
}

async function seedSnapshots(graph: GraphCapture, truth: TruthCapture, registrations: RegistrationLike[]): Promise<void> {
  const ids = snapshotIds(graph, truth);
  if (ids.length !== 2) fail(`expected 2 captured ContextSnapshots, found ${ids.length}`);
  for (const id of ids) {
    const { pkg, acceptedAt } = packageForSnapshot(graph, truth, id, ids, registrations);
    const completenessSummary = evaluateSourcePolicyCompleteness(pkg, registrations);
    await prisma.contextSnapshot.create({
      data: {
        id,
        scopeId: graph.scope.id,
        packageId: pkg.packageId,
        packageVersion: pkg.version,
        producer: pkg.producer,
        package: pkg as unknown as Prisma.InputJsonValue,
        contextHash: hashProjectContextPackage(pkg),
        completenessSummary: completenessSummary as unknown as Prisma.InputJsonValue,
        createdAt: acceptedAt,
      },
    });
  }
}

async function seedSource(graph: GraphCapture): Promise<string> {
  const rowSources = kindNodes(graph, "source").filter((node) => node.key.startsWith("source:row:"));
  if (rowSources.length !== 1) fail(`expected 1 captured Source row, found ${rowSources.length}`);
  const node = rowSources[0];
  const id = idAfter(node.key, "source:row:");
  await prisma.source.create({
    data: {
      id,
      kind: stringValue(node.attributes.sourceType, "notes"),
      title: stringValue(node.attributes.label, "Captured Audit source"),
      content: "Read-only production capture source body was not included in the graph export.",
      scopeId: graph.scope.id,
      createdAt: dateValue(node.attributes.observedAt, new Date("2026-08-01T00:00:00.000Z")),
    },
  });
  return id;
}

async function seedFindings(graph: GraphCapture, truth: TruthCapture, scopeSourceId: string): Promise<void> {
  if (truth.model.findings.length !== kindNodes(graph, "finding").length) {
    fail("truth and graph captures disagree on Finding count");
  }
  for (const finding of truth.model.findings) {
    const provenance = truth.provenance[finding.id];
    await prisma.finding.create({
      data: {
        id: finding.id,
        // The public truth contract deliberately withholds provenance for
        // handled Findings. They still need a real first-class parent for
        // Scope ownership in Prisma, so attach those rows to the one captured
        // Scope Source. The graph loader never treats handled provenance as
        // evidence, preserving the captured graph exactly.
        sourceId: provenance?.source?.id ?? (finding.status === "open" ? null : scopeSourceId),
        contextSnapshotId: provenance?.snapshot?.id ?? null,
        evidenceRefs: [...new Set((provenance?.passages ?? []).map((passage) => passage.evidenceId))],
        type: finding.type,
        title: finding.title,
        quote: finding.quote,
        rationale: finding.rationale,
        severity: finding.severity,
        estimateHint: finding.estimateHint,
        owner: finding.owner,
        blocks: finding.blocks,
        blocking: finding.blocking,
        matchedIssues: finding.matchedIssues,
        status: finding.status,
        createdAt: new Date(finding.createdAt),
      },
    });
  }
}

async function seedDecisionAndGate(graph: GraphCapture, gateTargetId: string): Promise<void> {
  const decisionNodes = kindNodes(graph, "decision");
  const gateNodes = kindNodes(graph, "decisionGate");
  if (decisionNodes.length !== 1 || gateNodes.length !== 1) {
    fail(`expected one Decision and one DecisionGate, found ${decisionNodes.length}/${gateNodes.length}`);
  }
  const decisionNode = decisionNodes[0];
  const gateNode = gateNodes[0];
  const decisionId = idAfter(decisionNode.key, "decision:");
  const gateId = idAfter(gateNode.key, "gate:");
  await prisma.decision.create({
    data: {
      id: decisionId,
      scopeId: graph.scope.id,
      title: stringValue(decisionNode.attributes.label),
      status: stringValue(decisionNode.attributes.status, "open"),
      owner: nullableString(decisionNode.attributes.owner),
      rationale: "Reconstructed from the read-only production graph capture for disposable acceptance.",
      options: [],
      relatedIssues: [],
    },
  });
  await prisma.decisionGate.create({
    data: {
      id: gateId,
      decisionId,
      targetScopeId: gateTargetId,
      dependency: stringValue(gateNode.attributes.label, "Captured delivery gate"),
      evidenceForGate: "Gate existence is attested by the read-only production graph capture; its source body was not exported.",
      low: Number(gateNode.attributes.low ?? 1),
      likely: Number(gateNode.attributes.likely ?? 4),
      high: Number(gateNode.attributes.high ?? 10),
      serial: true,
      provenance: "manual",
    },
  });
}

async function seedAuditRuns(graph: GraphCapture, truth: TruthCapture, sourceId: string): Promise<void> {
  const dates = [truth.model.priorRunAt, truth.model.lastRunAt].filter((value): value is string => Boolean(value));
  const capturedSnapshotId = Object.values(truth.provenance).find((value) => value.snapshot)?.snapshot?.id ?? null;
  for (let index = 0; index < dates.length; index++) {
    await prisma.auditRun.create({
      data: {
        sourceId: index === dates.length - 1 ? sourceId : null,
        contextSnapshotId: index === dates.length - 1 ? null : capturedSnapshotId,
        issueCount: 0,
        findingCount: truth.model.findings.length,
        model: "read-only-production-capture",
        createdAt: new Date(dates[index]),
      },
    });
  }
}

async function verifyGraph(graph: GraphCapture): Promise<void> {
  const inputs = await loadAuditGraphInputs(graph.scope.id);
  if (!inputs) fail("normal Signal graph loader could not read the reconstructed Scope");
  const rebuilt = buildAuditGraph(inputs);
  const rebuiltExport = exportAuditGraph(rebuilt);
  const capturedNodeDigest = digest(graph.graph.nodes.map((node) => node.key));
  const rebuiltNodeDigest = digest(rebuiltExport.nodes.map((node) => node.key));
  const capturedEdgeDigest = digest(graph.graph.edges.map(edgeSignature));
  const rebuiltEdgeDigest = digest(rebuiltExport.edges.map(edgeSignature));
  if (rebuilt.order !== 438 || rebuilt.size !== 543) {
    const capturedKeys = new Set(graph.graph.nodes.map((node) => node.key));
    const rebuiltKeys = new Set(rebuiltExport.nodes.map((node) => node.key));
    const missing = [...capturedKeys].filter((key) => !rebuiltKeys.has(key));
    const unexpected = [...rebuiltKeys].filter((key) => !capturedKeys.has(key));
    const kinds = (nodes: Array<{ attributes: JsonRecord }>) => Object.fromEntries(
      [...new Set(nodes.map((node) => stringValue(node.attributes.kind)))].sort().map((kind) => [
        kind,
        nodes.filter((node) => node.attributes.kind === kind).length,
      ])
    );
    fail(`normal Signal loader produced ${rebuilt.order} nodes / ${rebuilt.size} edges, expected 438 / 543; ` +
      `captured kinds=${JSON.stringify(kinds(graph.graph.nodes))}; rebuilt kinds=${JSON.stringify(kinds(rebuiltExport.nodes))}; ` +
      `missing=${JSON.stringify(missing.slice(0, 30))}; unexpected=${JSON.stringify(unexpected.slice(0, 30))}`);
  }
  if (capturedNodeDigest !== rebuiltNodeDigest) fail("rebuilt canonical node identity set differs from the capture");
  if (capturedEdgeDigest !== rebuiltEdgeDigest) fail("rebuilt canonical edge signatures differ from the capture");

  const rubric = adaptSignalGraphToRubric(rebuiltExport, graph.scope, "phase3b-disposable-production-capture");
  const countKind = (kind: string) => rebuiltExport.nodes.filter((node) => node.attributes.kind === kind).length;
  const dbBacked = ["scope", "dependency", "decision", "decisionGate", "finding"]
    .reduce((sum, kind) => sum + countKind(kind), 0) +
    rebuiltExport.nodes.filter((node) => node.attributes.kind === "source" && node.key.startsWith("source:row:")).length;
  const contextProjected = ["intelligence", "passage", "intel"].reduce((sum, kind) => sum + countKind(kind), 0) +
    rebuiltExport.nodes.filter((node) => ["source", "transcript"].includes(node.attributes.kind) && node.key.startsWith("source:pkg:")).length;
  const truthDerived = ["reality", "lane", "checkpoint"].reduce((sum, kind) => sum + countKind(kind), 0);
  const countBy = <T>(items: T[], value: (item: T) => string) => Object.fromEntries(
    [...new Set(items.map(value))].sort().map((key) => [key, items.filter((item) => value(item) === key).length])
  );
  const sourceSystemCounts = rubric.nodes
    .filter((node) => node.type === "app" && node.sourceCounts)
    .map((node) => ({ sourceSystem: node.label, ...node.sourceCounts! }));
  const worldCanonical = rubric.nodes.filter((node) => node.layer === "M" && !node.presentationOnly).length;
  const modelCanonical = rubric.nodes.filter((node) => node.layer === "S" && !node.presentationOnly).length;
  const attentionEchoes = rubric.nodes.filter((node) => node.layer === "R" && node.type === "routine").length;

  console.log(`PHASE3B_SCOPE_ID=${graph.scope.id}`);
  console.log(JSON.stringify({
    canonicalObjects: rebuilt.order,
    canonicalRelationships: rebuilt.size,
    canonicalIdentityDigest: rebuiltNodeDigest,
    canonicalEdgeDigest: rebuiltEdgeDigest,
    sourceSystems: rubric.meta.sourceSystems.length,
    evidencePassages: countKind("passage"),
    externalIntelligence: countKind("intel"),
    findings: countKind("finding"),
    canonicalKinds: countBy(rebuiltExport.nodes, (node) => node.attributes.kind),
    canonicalRelationshipsByType: countBy(rebuiltExport.edges, (edge) => edge.attributes.rel),
    breakdown: { dbBacked, contextSnapshotProjected: contextProjected, signalTruthDerived: truthDerived },
    presentationOnlyNodes: rubric.meta.presentationNodes,
    presentationBreakdown: {
      sourceSystemAnchors: sourceSystemCounts.length,
      semanticTerritoryHubs: rubric.nodes.filter((node) => node.type === "hub" && node.layer === "M").length,
      layerHubs: rubric.nodes.filter((node) => node.type === "hub" && node.layer !== "M").length,
      attentionEchoes,
    },
    rubricPopulations: {
      projectWorldCanonicalIncludingReality: worldCanonical,
      projectWorldCanonicalExcludingReality: worldCanonical - 1,
      projectModelCanonical: modelCanonical,
      attentionPresentationEchoes: attentionEchoes,
    },
    sourceSystemCounts,
    totalRubricNodes: rubric.nodes.length,
  }, null, 2));
}

async function main(): Promise<void> {
  assertDisposableDatabase();
  const graph = readCapture<GraphCapture>(graphPath, "production graph capture");
  const truth = readCapture<TruthCapture>(truthPath, "production truth capture");
  if (graph.scope.id !== truth.scope.id) fail("graph and truth captures name different Scopes");
  if (graph.graph.nodes.length !== 438 || graph.graph.edges.length !== 543) {
    fail(`capture census is ${graph.graph.nodes.length}/${graph.graph.edges.length}, not 438/543`);
  }
  await assertEmptyDatabase();
  const { gateTargetId } = await seedScopes(graph, truth);
  const registrations = registrationRows(truth);
  await seedRegistrations(registrations);
  await seedSnapshots(graph, truth, registrations);
  const sourceId = await seedSource(graph);
  await seedFindings(graph, truth, sourceId);
  await seedDecisionAndGate(graph, gateTargetId);
  await seedAuditRuns(graph, truth, sourceId);
  await verifyGraph(graph);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
