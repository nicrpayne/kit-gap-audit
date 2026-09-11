import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeForecast } from "@/lib/forecast/compute";
import { toDateOnly } from "@/lib/time/dateContract";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function invalidateDerivedReads(tx: Prisma.TransactionClient, scopeId: string, reason: string) {
  const now = new Date();
  return tx.projectDerivedState.upsert({
    where: { scopeId },
    create: {
      scopeId, realityRevision: 1, computedRevision: 0, status: "stale",
      consumers: json({ forecast: "stale", timeline: "stale", controlRoom: "stale", reports: "stale", scope: "stale", capacity: "stale", reason }),
      readiness: json({ ready: false, blockers: ["Derived consequences are being recomputed."] }),
      invalidatedAt: now,
    },
    update: {
      realityRevision: { increment: 1 }, status: "stale",
      consumers: json({ forecast: "stale", timeline: "stale", controlRoom: "stale", reports: "stale", scope: "stale", capacity: "stale", reason }),
      invalidatedAt: now, error: null,
    },
  });
}

async function readinessWithoutDerived(scopeId: string) {
  const [scope, openTestGates, pendingScope, sourceHealth, reconciliation, namedAllocations] = await Promise.all([
    prisma.scope.findUnique({ where: { id: scopeId } }),
    prisma.decision.count({ where: { scopeId, status: "open", gate: { isNot: null }, OR: [
      { title: { contains: "test", mode: "insensitive" } }, { title: { contains: "address", mode: "insensitive" } },
    ] } }),
    prisma.auditChangeProposal.count({ where: { scopeId, category: "scope", status: { in: ["pending", "needs_completion"] }, relevanceClass: { not: "irrelevant_bleed" } } }),
    prisma.auditChangeProposal.count({ where: { scopeId, category: "source_health", status: { in: ["pending", "needs_completion"] } } }),
    prisma.capacityReconciliation.findUnique({ where: { scopeId } }),
    prisma.allocation.count({ where: { scopeId, person: { active: true, synthetic: false } } }),
  ]);
  const blockers: string[] = [];
  if (!scope || scope.executionState !== "configured") blockers.push("Execution truth unavailable.");
  if (openTestGates) blockers.push("A synthetic/test Decision gate is still active.");
  if (pendingScope) blockers.push(`${pendingScope} Scope proposal${pendingScope === 1 ? " is" : "s are"} unreconciled.`);
  if (sourceHealth) blockers.push(`${sourceHealth} source-health issue${sourceHealth === 1 ? " is" : "s are"} open.`);
  if (!namedAllocations || reconciliation?.status !== "named_exact" || !reconciliation.completenessConfirmed) blockers.push("Named capacity is unreconciled.");
  return { ready: blockers.length === 0, blockers };
}

// All current downstream surfaces are dynamic reads. The receipt below both
// proves they were invalidated and eagerly validates the protected Forecast
// computation; Timeline/Control Room/Reports will read the new revision on
// their next request without an operator visiting each instrument.
export async function recomputeDerivedReads(scopeId: string) {
  const state = await prisma.projectDerivedState.findUnique({ where: { scopeId } });
  if (!state) return null;
  await prisma.projectDerivedState.update({ where: { scopeId }, data: { status: "recomputing", error: null } });
  try {
    const scope = await prisma.scope.findUniqueOrThrow({ where: { id: scopeId } });
    const forecast = await computeForecast(scope);
    const readiness = await readinessWithoutDerived(scopeId);
    return await prisma.projectDerivedState.update({ where: { scopeId }, data: {
      computedRevision: state.realityRevision, status: "current", recomputedAt: new Date(), error: null,
      consumers: json({
        forecast: { status: "current", likelyDate: toDateOnly(forecast.likelyDate), confidenceAtTarget: forecast.confidenceAtTarget },
        timeline: { status: "invalidated", behavior: "dynamic projection reads current owner rows" },
        controlRoom: { status: "invalidated", behavior: "dynamic read uses current owner rows" },
        reports: { status: readiness.ready ? "ready" : "blocked", behavior: "readiness recalculated" },
        scope: { status: "current" }, capacity: { status: "current" },
      }),
      readiness: json(readiness),
    } });
  } catch (error) {
    return prisma.projectDerivedState.update({ where: { scopeId }, data: {
      status: "error", error: error instanceof Error ? error.message.slice(0, 2_000) : "Derived recompute failed",
      consumers: json({ forecast: "error", timeline: "invalidated", controlRoom: "invalidated", reports: "blocked", scope: "current", capacity: "current" }),
      readiness: json({ ready: false, blockers: ["Forecast is unavailable after the Reality change."] }),
    } });
  }
}
