// THE ONE PLACE THE SIGNAL GRAPH'S INPUTS ARE READ.
//
// Shared by GET /api/audit/graph, the measurement script and the proofs, so
// none of them can drift into measuring a different graph from the one the
// product serves.
//
// This is the only file in the graph layer that touches Prisma. lib/audit/
// graph.ts stays pure and takes everything as arguments — which is what lets
// the proofs build a graph from a fixture with no database at all.

import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { buildTruthMap, type TruthMapModel } from "./truth";
import { resolveProvenance, type FindingProvenance } from "./provenance";
import type { GraphEntityInputs } from "./graph";

export interface AuditGraphInputs {
  model: TruthMapModel;
  provenance: Record<string, FindingProvenance>;
  entities: GraphEntityInputs;
  linearError: string | null;
}

/**
 * Read everything one Scope's graph is built from.
 *
 * Deliberately the same queries the Truth Map read uses, plus the identified
 * ROWS the map collapses into counts (decisions, gates, upstream Scopes,
 * work items, registrations). The map needs "3 decisions"; the graph needs
 * the three decisions.
 */
export async function loadAuditGraphInputs(scopeId: string): Promise<AuditGraphInputs | null> {
  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) return null;

  const [findings, decisions, sources, contextDocs, snapshots, allocations, dependsOn, runs, registrations] =
    await Promise.all([
      prisma.finding.findMany({
        where: { OR: [{ source: { scopeId } }, { contextSnapshot: { scopeId } }] },
        orderBy: { createdAt: "desc" },
      }),
      prisma.decision.findMany({ where: { scopeId }, include: { gate: true }, orderBy: { createdAt: "asc" } }),
      prisma.source.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.contextDoc.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.contextSnapshot.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.allocation.findMany({ where: { scopeId }, include: { person: true } }),
      prisma.scope.findMany({ where: { id: { in: scope.dependsOnScopeIds } }, orderBy: { createdAt: "asc" } }),
      prisma.auditRun.findMany({ orderBy: { createdAt: "desc" }, take: 2 }),
      prisma.sourceRegistration.findMany({
        where: { OR: [{ scopeIds: { isEmpty: true } }, { scopeIds: { has: scopeId } }] },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  // Linear can fail independently. The graph must survive that by having no
  // work nodes, not by refusing to build — same posture the Truth Map read
  // already takes.
  let issues: Awaited<ReturnType<typeof getScopedIssues>> = [];
  let linearError: string | null = null;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    linearError = error instanceof Error ? error.message : "Linear could not be read";
  }

  const model = buildTruthMap({
    scope,
    findings,
    decisions,
    sources,
    contextDocs,
    snapshots,
    allocations,
    issues,
    dependsOn,
    lastRunAt: runs[0]?.createdAt ?? null,
    priorRunAt: runs[1]?.createdAt ?? null,
  });

  const snapshotById = new Map(snapshots.map((s) => [s.id, s]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const provenance: Record<string, FindingProvenance> = {};
  for (const f of findings) {
    if (f.status !== "open") continue;
    provenance[f.id] = resolveProvenance(
      f,
      f.contextSnapshotId ? (snapshotById.get(f.contextSnapshotId) ?? null) : null,
      f.sourceId ? (sourceById.get(f.sourceId) ?? null) : null
    );
  }

  const entities: GraphEntityInputs = {
    scope: { id: scope.id, name: scope.name, dependsOnScopeIds: scope.dependsOnScopeIds },
    decisions: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      owner: d.owner,
      sourceFindingId: d.sourceFindingId,
      gate: d.gate
        ? {
            id: d.gate.id,
            targetScopeId: d.gate.targetScopeId,
            dependency: d.gate.dependency,
            low: d.gate.low,
            likely: d.gate.likely,
            high: d.gate.high,
          }
        : null,
    })),
    dependsOn: dependsOn.map((s) => ({
      id: s.id,
      name: s.name,
      targetDate: s.targetDate?.toISOString() ?? null,
    })),
    work: issues.map((i) => ({
      identifier: i.identifier,
      title: i.title,
      state: i.state,
      stateType: i.stateType,
      estimate: i.estimate,
      assignee: i.assignee,
      parentIdentifier: i.parentIdentifier,
    })),
    registrations: registrations.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      status: r.status,
      supersededByRegistrationId: r.supersededByRegistrationId,
    })),
  };

  return { model, provenance, entities, linearError };
}
