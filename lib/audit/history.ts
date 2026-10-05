import { prisma } from "@/lib/prisma";

/** Package refreshes create AuditRun rows without legacy Source rows. Read
 * both provenance paths; do not confuse a missing legacy source with no run. */
export async function auditRunHistory(scopeId: string | undefined, page: number, pageSize = 20) {
  const sourceIds = scopeId ? (await prisma.source.findMany({
    where: { scopeId }, select: { id: true },
  })).map((source) => source.id) : [];
  const where = scopeId ? { OR: [
    { contextSnapshot: { scopeId } }, { sourceId: { in: sourceIds } },
  ] } : undefined;
  const [runs, total] = await Promise.all([
    prisma.auditRun.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      include: { contextSnapshot: { select: { packageId: true, scope: { select: { name: true } } } },
        _count: { select: { changeProposals: true } } },
    }),
    prisma.auditRun.count({ where }),
  ]);
  return { runs, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
