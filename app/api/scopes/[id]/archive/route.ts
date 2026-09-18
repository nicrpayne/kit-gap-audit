import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    confirmName?: string;
    expectedRealityRevision?: number;
    reason?: string;
  } | null;
  if (!body || !Number.isInteger(body.expectedRealityRevision)) {
    return NextResponse.json({ error: "expectedRealityRevision is required" }, { status: 400 });
  }
  const existing = await prisma.scope.findUnique({
    where: { id },
    include: { derivedState: true, activation: { include: { bootstrap: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  if (existing.executionState === "unavailable" && existing.executionDetail?.startsWith("Archived by operator")) {
    return NextResponse.json({ scope: existing, archived: true, reused: true, retention: existing.executionDetail });
  }
  if (body.confirmName !== existing.name) {
    return NextResponse.json({ error: `Type the exact project name “${existing.name}” to confirm archive.` }, { status: 400 });
  }
  const currentRevision = existing.derivedState?.realityRevision ?? 0;
  if (body.expectedRealityRevision !== currentRevision) {
    return NextResponse.json({ error: `Reality changed: expected revision ${body.expectedRealityRevision}, current ${currentRevision}. Reload before retrying.`, currentRealityRevision: currentRevision }, { status: 409 });
  }

  const archivedAt = new Date();
  const archiveName = `[ARCHIVED ${archivedAt.toISOString().slice(0, 10)}] ${existing.name} · ${id.slice(-6)}`;
  const retention = `Archived by operator at ${archivedAt.toISOString()}. Immutable activation, knowledge, audit, forecast, and report history is retained. Live Linear ownership and mutable staffing were detached. Reason: ${body.reason?.trim() || "staging project lifecycle complete"}.`;

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.projectDerivedState.findUnique({ where: { scopeId: id }, select: { realityRevision: true } });
    if ((latest?.realityRevision ?? 0) !== body.expectedRealityRevision) return null;
    const dependents = await tx.scope.findMany({ where: { dependsOnScopeIds: { has: id } }, select: { id: true, dependsOnScopeIds: true } });
    for (const dependent of dependents) {
      await tx.scope.update({ where: { id: dependent.id }, data: { dependsOnScopeIds: dependent.dependsOnScopeIds.filter((scopeId) => scopeId !== id) } });
      await invalidateDerivedReads(tx, dependent.id, `Archived dependency ${existing.name} was detached`);
    }
    await tx.allocation.deleteMany({ where: { scopeId: id } });
    await tx.capacityReconciliation.deleteMany({ where: { scopeId: id } });
    const scope = await tx.scope.update({
      where: { id },
      data: {
        name: archiveName,
        teamKey: "",
        projectNames: [],
        labelFilter: null,
        dependsOnScopeIds: [],
        teamCapacity: null,
        executionState: "unavailable",
        executionDetail: retention,
      },
    });
    if (existing.activation?.bootstrapId) {
      await tx.projectBootstrap.update({ where: { id: existing.activation.bootstrapId }, data: { status: "archived" } });
      await tx.bootstrapReviewEvent.create({
        data: {
          bootstrapId: existing.activation.bootstrapId,
          action: "archive",
          fromStatus: existing.activation.bootstrap.status,
          toStatus: "archived",
          detail: { scopeId: id, archivedAt: archivedAt.toISOString(), reason: body.reason?.trim() || null },
        },
      });
    }
    await invalidateDerivedReads(tx, id, "Project archived; live execution and staffing detached");
    return scope;
  });
  if (!result) {
    const latest = await prisma.projectDerivedState.findUnique({ where: { scopeId: id }, select: { realityRevision: true } });
    return NextResponse.json({ error: "Reality changed while the archive was being saved. Reload before retrying.", currentRealityRevision: latest?.realityRevision ?? 0 }, { status: 409 });
  }
  const derived = await recomputeDerivedReads(id);
  return NextResponse.json({ scope: result, derived, archived: true, reused: false, retention });
}
