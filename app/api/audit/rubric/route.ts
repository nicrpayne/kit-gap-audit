// PHASE 2: read-only canonical Signal graph → literal Rubric runtime payload.
//
// This route deliberately rebuilds the derived graph for each request. It
// never invokes Audit, writes Prisma, accepts Reality, or changes a source.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Graph from "graphology";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadAuditGraphInputs } from "@/lib/audit/graphInputs";
import {
  buildAuditGraph,
  exportAuditGraph,
  type AuditGraph,
  type AuditEdgeAttributes,
  type AuditNodeAttributes,
} from "@/lib/audit/graph";
import { SignalSearchIndex } from "@/lib/audit/searchIndex";
import {
  adaptSignalGraphToRubric,
  validateSignalRubricPayload,
  type ExportedSignalGraph,
} from "@/lib/audit/signalRubricAdapter";

export const dynamic = "force-dynamic";

type MirrorPayload = {
  scope: { id: string; name: string };
  graph: ExportedSignalGraph;
};

function graphFromExport(value: ExportedSignalGraph): AuditGraph {
  const graph = new Graph<AuditNodeAttributes, AuditEdgeAttributes>({ type: "directed", multi: true });
  for (const node of value.nodes) graph.addNode(node.key, node.attributes);
  for (const edge of value.edges) graph.addDirectedEdge(edge.source, edge.target, edge.attributes);
  return graph;
}

async function fixtureGraph(kind: string): Promise<{ graph: AuditGraph; scope: { id: string; name: string }; generatedAt: string } | null> {
  if (kind === "jsa") {
    const { jsaShapedGraph } = await import("@/scripts/lib/jsa-shaped-fixture");
    return { graph: jsaShapedGraph(), scope: { id: "jsa", name: "JSA deterministic fixture" }, generatedAt: "deterministic-jsa-fixture" };
  }
  if (kind === "production-mirror") {
    const raw = await readFile(join(process.cwd(), "artifacts/rubric-production-parity/jsa-production-mirror.json"), "utf8");
    const mirror = JSON.parse(raw) as MirrorPayload;
    return { graph: graphFromExport(mirror.graph), scope: mirror.scope, generatedAt: "redacted-production-shaped-capture" };
  }
  return null;
}

async function canonicalGraph(req: NextRequest) {
  const fixture = req.nextUrl.searchParams.get("fixture") ?? "";
  const fixtureResult = await fixtureGraph(fixture);
  if (fixtureResult) return { ...fixtureResult, selectedAudit: null };

  const requested = req.nextUrl.searchParams.get("scope");
  const scopes = await prisma.scope.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (scopes.length === 0) throw new Error("No Scopes are configured.");
  const scope = requested && scopes.some((candidate) => candidate.id === requested)
    ? scopes.find((candidate) => candidate.id === requested)!
    : scopes[0];
  const requestedAudit = req.nextUrl.searchParams.get("audit");
  const selectedAudit = requestedAudit
    ? await prisma.source.findFirst({
        where: { id: requestedAudit, scopeId: scope.id },
        select: { id: true, title: true, kind: true, createdAt: true },
      })
    : null;
  if (requestedAudit && !selectedAudit) throw new Error("Unknown Audit for this Scope");
  const inputs = await loadAuditGraphInputs(
    scope.id,
    selectedAudit ? { auditSourceId: selectedAudit.id } : undefined
  );
  if (!inputs) throw new Error("Unknown Scope");
  return {
    graph: buildAuditGraph(inputs),
    scope,
    generatedAt: selectedAudit
      ? `audit-lens:${selectedAudit.id}:${selectedAudit.createdAt.toISOString()}`
      : "current-read-only-audit-graph",
    selectedAudit,
  };
}

async function auditContext(req: NextRequest) {
  const fixture = req.nextUrl.searchParams.get("fixture") ?? "";
  const fixtureResult = await fixtureGraph(fixture);
  if (fixtureResult) {
    return { scopes: [fixtureResult.scope], scope: fixtureResult.scope, audits: [] };
  }
  const requested = req.nextUrl.searchParams.get("scope");
  const scopes = await prisma.scope.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (scopes.length === 0) throw new Error("No Scopes are configured.");
  const scope = requested && scopes.some((candidate) => candidate.id === requested)
    ? scopes.find((candidate) => candidate.id === requested)!
    : scopes[0];
  const sources = await prisma.source.findMany({
    where: { scopeId: scope.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { findings: { select: { status: true } } },
  });
  return {
    scopes,
    scope,
    audits: sources.map((source, index) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
      createdAt: source.createdAt.toISOString(),
      findingCount: source.findings.length,
      openFindingCount: source.findings.filter((finding) => finding.status === "open").length,
      position: index === 0 ? "current" : index === 1 ? "prior" : "earlier",
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get("mode") ?? "graph";
    if (mode === "context") {
      return NextResponse.json(await auditContext(req), { headers: { "cache-control": "no-store" } });
    }

    const { graph, scope, generatedAt, selectedAudit } = await canonicalGraph(req);
    const exported = exportAuditGraph(graph);
    const payload = adaptSignalGraphToRubric(exported, scope, generatedAt);
    payload.meta.auditContext = selectedAudit
      ? {
          mode: "audit",
          id: selectedAudit.id,
          title: selectedAudit.title,
          kind: selectedAudit.kind,
          createdAt: selectedAudit.createdAt.toISOString(),
        }
      : { mode: "current" };
    const errors = validateSignalRubricPayload(payload);
    if (errors.length > 0) {
      return NextResponse.json({ error: "SignalRubricAdapter rejected its output", details: errors }, { status: 500 });
    }

    if (mode === "search") {
      const query = req.nextUrl.searchParams.get("q") ?? "";
      const outcome = SignalSearchIndex.build(graph).search(query);
      const byCanonical = new Map(payload.nodes.filter((node) => node.canonicalId).map((node) => [node.canonicalId!, node]));
      return NextResponse.json({
        maturity: "Signal MiniSearch · lexical, tokenised, fuzzy",
        partial: outcome.partial,
        total: outcome.total,
        results: outcome.hits.map((hit) => {
          const node = byCanonical.get(hit.id);
          return {
            path: node?.id ?? hit.id,
            canonicalId: hit.id,
            name: hit.doc.title,
            type: node?.type ?? "file",
            layer: node?.layer ?? "M",
            dept: node?.dept ?? "evidence",
            matchedField: hit.matchedField,
            snippet: hit.snippet,
          };
        }),
      });
    }

    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build Signal Rubric view" },
      { status: 500 }
    );
  }
}
