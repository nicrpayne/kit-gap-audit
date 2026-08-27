// THE TRUTH MAP'S READ.
//
// One expensive fetch per instrument load, exactly like /api/portfolio/inputs
// — everything the Project Truth Map draws, assembled once, so selection,
// focus, Evidence Solo and the candidate preview are all pure client work
// with no network round trip. docs/DESIGN-NORTH-STAR.md treats that loop as
// a design constraint rather than an optimisation, and Audit joins it.
//
// Deliberately dynamic: Findings and Decisions are Reality, and a cached
// truth map would be the freshness bug this suite has already fixed once.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { buildTruthMap } from "@/lib/audit/truth";
import { resolveProvenance, groundingLabel, type FindingProvenance } from "@/lib/audit/provenance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("scope");

  const scopes = await prisma.scope.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (scopes.length === 0) {
    return NextResponse.json({ error: "No Scopes are configured." }, { status: 404 });
  }

  // WHICHEVER SCOPE HAS THE MOST TO ANSWER FOR, when the caller names none.
  // Falling back to "whichever was created first" opened Audit on a project
  // with nothing to look at, which is the wrong first screen for an
  // instrument whose whole question is "what are we missing".
  let scopeId = requested && scopes.some((s) => s.id === requested) ? requested : null;
  if (!scopeId) {
    const openByScope = await prisma.finding.groupBy({
      by: ["sourceId", "contextSnapshotId"],
      where: { status: "open" },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    if (openByScope.length > 0) {
      const [srcs, snaps] = await Promise.all([
        prisma.source.findMany({ select: { id: true, scopeId: true } }),
        prisma.contextSnapshot.findMany({ select: { id: true, scopeId: true } }),
      ]);
      const scopeOfSource = new Map(srcs.map((s) => [s.id, s.scopeId]));
      const scopeOfSnapshot = new Map(snaps.map((s) => [s.id, s.scopeId]));
      for (const row of openByScope) {
        const owner =
          (row.contextSnapshotId ? scopeOfSnapshot.get(row.contextSnapshotId) : null) ??
          (row.sourceId ? scopeOfSource.get(row.sourceId) ?? null : null);
        if (owner) counts.set(owner, (counts.get(owner) ?? 0) + row._count._all);
      }
    }
    scopeId =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? scopes[0].id;
  }
  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) return NextResponse.json({ error: "Unknown Scope" }, { status: 404 });

  // A Finding belongs to this Scope through EITHER its Source or its
  // ContextSnapshot — both are real provenance paths and neither is
  // privileged (see the Finding model's own note on nullable sourceId).
  const [findings, decisions, sources, contextDocs, snapshots, allocations, dependsOn, runs] =
    await Promise.all([
      prisma.finding.findMany({
        where: { OR: [{ source: { scopeId } }, { contextSnapshot: { scopeId } }] },
        orderBy: { createdAt: "desc" },
      }),
      prisma.decision.findMany({ where: { scopeId }, include: { gate: true } }),
      prisma.source.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.contextDoc.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.contextSnapshot.findMany({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
      prisma.allocation.findMany({ where: { scopeId }, include: { person: true } }),
      prisma.scope.findMany({ where: { id: { in: scope.dependsOnScopeIds } } }),
      prisma.auditRun.findMany({ orderBy: { createdAt: "desc" }, take: 2 }),
    ]);

  // Linear is a STRUCTURAL source (Scope.teamKey/projectNames), not a
  // registered one. It can fail independently of everything else, and the
  // map must survive that saying so rather than dying — the lane simply
  // reports as unsupplied, which is the honest reading of "we could not
  // read execution".
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

  // Provenance for every OPEN finding, resolved up front so Evidence Solo
  // is instant and so the client never has to ask a second question to
  // answer "why does Signal believe this".
  const snapshotById = new Map(snapshots.map((s) => [s.id, s]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const provenance: Record<string, FindingProvenance & { grounding: ReturnType<typeof groundingLabel> }> = {};
  for (const f of findings) {
    if (f.status !== "open") continue;
    const resolved = resolveProvenance(
      f,
      f.contextSnapshotId ? (snapshotById.get(f.contextSnapshotId) ?? null) : null,
      f.sourceId ? (sourceById.get(f.sourceId) ?? null) : null
    );
    provenance[f.id] = { ...resolved, grounding: groundingLabel(resolved) };
  }

  return NextResponse.json({
    scopes,
    scope: { id: scope.id, name: scope.name, targetDate: scope.targetDate },
    model,
    provenance,
    linearError,
  });
}
