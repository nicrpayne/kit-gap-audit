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
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";
import { buildTruthMap, type TruthMapModel } from "./truth";
import { resolveProvenance, type FindingProvenance } from "./provenance";
import { projectRequirements } from "./requirements";
import { projectPeople } from "./capacity";
import { projectIntelligence } from "./intelligence";
import { selectCurrentSnapshotFromHistory } from "./currentSnapshotSelection";
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
export async function loadAuditGraphInputs(
  scopeId: string,
  options: { auditSourceId?: string } = {}
): Promise<AuditGraphInputs | null> {
  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) return null;

  // An Audit-history lens narrows only the evidence run and its Findings.
  // Reality, accepted project structure, work, capacity and external
  // intelligence stay canonical/current: the database does not contain a
  // historical snapshot of those systems, so pretending it does would be a
  // false reconstruction. With no lens this is the current-world query; its
  // package-backed projections are selected by the active pointer below.
  const auditSourceId = options.auditSourceId;
  const findingScopeWhere = { OR: [{ source: { scopeId } }, { contextSnapshot: { scopeId } }] };

  const [findings, decisions, sources, contextDocs, snapshots, allocations, dependsOn, runs, registrations, resolvedCurrentSnapshot] =
    await Promise.all([
      prisma.finding.findMany({
        where: auditSourceId
          ? { AND: [findingScopeWhere, { sourceId: auditSourceId }] }
          : findingScopeWhere,
        orderBy: { createdAt: "desc" },
      }),
      prisma.decision.findMany({ where: { scopeId }, include: { gate: true }, orderBy: { createdAt: "asc" } }),
      prisma.source.findMany({
        where: auditSourceId ? { scopeId, id: auditSourceId } : { scopeId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contextDoc.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.contextSnapshot.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      // THIS SCOPE'S ROWS, for the Truth Map's capacity checkpoint.
      prisma.allocation.findMany({ where: { scopeId }, include: { person: true } }),
      prisma.scope.findMany({ where: { id: { in: scope.dependsOnScopeIds } }, orderBy: { createdAt: "asc" } }),
      prisma.auditRun.findMany({ orderBy: { createdAt: "desc" }, take: 2 }),
      prisma.sourceRegistration.findMany({
        where: { OR: [{ scopeIds: { isEmpty: true } }, { scopeIds: { has: scopeId } }] },
        orderBy: { createdAt: "asc" },
      }),
      // Creation order is immutable history, not currentness. The active
      // package pointer owns selection and also restores A after A/B/A.
      currentContextSnapshot(scopeId),
    ]);

  const currentSnapshot = selectCurrentSnapshotFromHistory(
    snapshots,
    resolvedCurrentSnapshot?.id ?? null
  );
  const currentSnapshots = currentSnapshot ? [currentSnapshot] : [];

  // EVERY ALLOCATION, EVERYWHERE — a second read, and a deliberate one.
  //
  // The context-switch penalty is keyed on how many Scopes a person works
  // across ANYWHERE, so a resolver handed only this Scope's rows would report
  // Sam Ortiz as undivided and overstate what JSA actually gets. The scope
  // list comes with it so the inspector can name the other commitments
  // without the graph having to contain them.
  const [allPeople, allAllocations, allScopes, settings] = await Promise.all([
    prisma.person.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.allocation.findMany({ orderBy: { personId: "asc" } }),
    prisma.scope.findMany({ select: { id: true, name: true } }),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
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
    currentSnapshot,
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
    scope: {
      id: scope.id,
      name: scope.name,
      dependsOnScopeIds: scope.dependsOnScopeIds,
      notionPageIds: scope.notionPageIds,
      figmaRefs: scope.figmaRefs,
    },
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
      parentTitle: i.parentTitle,
    })),
    registrations: registrations.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      status: r.status,
      supersededByRegistrationId: r.supersededByRegistrationId,
    })),
    // Both projections below apply their own law in their own file. This one
    // stays the single place that touches Prisma.
    people: projectPeople({
      scopeId,
      people: allPeople.map((p) => ({
        id: p.id,
        name: p.name,
        fte: p.fte,
        active: p.active,
        synthetic: p.synthetic,
      })),
      allocations: allAllocations.map((a) => ({
        personId: a.personId,
        scopeId: a.scopeId,
        fraction: a.fraction,
      })),
      scopeNames: new Map(allScopes.map((s) => [s.id, s.name])),
      // Never defaulted to a nonzero guess: 0 is the schema's own default and
      // means "no penalty stated", which is a different claim from a number
      // someone chose.
      contextSwitchCostPct: settings?.contextSwitchCostPct ?? 0,
    }),
    // Current project world projects only the package selected by the active
    // package pointer. The immutable history remains above for Finding
    // provenance, but an omitted requirement is not kept alive by an older
    // snapshot.
    requirements: projectRequirements(
      currentSnapshots.map((s) => ({ id: s.id, scopeId: s.scopeId, package: s.package }))
    ),
    // EXTERNAL STRUCTURED INTELLIGENCE, admitted by the selected snapshot's
    // attested Scope and by nothing else. The same snapshots the requirements
    // projection reads — Signal never calls the Hermes workspace directly,
    // and the only thing that crosses the bridge is an accepted package. A
    // producer head remains current only inside the selected package; an old
    // package is history even when its own head flag was true at the time.
    intelligence: projectIntelligence(
      currentSnapshots.map((s) => ({ id: s.id, scopeId: s.scopeId, package: s.package })),
      scopeId
    ),
    // Paired with the snapshot they were cited in, because an evidence id
    // means nothing outside its own package.
    findingCitations: findings
      .filter((f) => f.contextSnapshotId && f.evidenceRefs.length > 0)
      .map((f) => ({
        findingId: f.id,
        snapshotId: f.contextSnapshotId!,
        evidenceIds: f.evidenceRefs,
      })),
  };

  return { model, provenance, entities, linearError };
}
