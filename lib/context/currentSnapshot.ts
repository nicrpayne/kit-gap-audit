import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SnapshotReader = Pick<Prisma.TransactionClient, "projectActivation" | "bootstrapPackage" | "contextSnapshot">;

/** Creation order is history, not a current-source pointer. Restoring an older
 * package must restore its immutable snapshot too. Use this inside acceptance
 * transactions as well as reads so a concurrent package switch invalidates review.
 */
export async function currentContextSnapshot(scopeId: string, db: SnapshotReader = prisma) {
  const activation = await db.projectActivation.findUnique({
    where: { scopeId }, include: { bootstrap: { select: { activePackageId: true } } },
  });
  const activeId = activation?.bootstrap.activePackageId;
  // Legacy scopes and operational bindings predate the package pointer.
  if (!activeId) return db.contextSnapshot.findFirst({
    where: { scopeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const active = await db.bootstrapPackage.findUnique({ where: { id: activeId } });
  if (!active) throw new Error("Current knowledge package is unavailable. Complete the knowledge refresh before continuing.");
  const pkg = active.package as { producer?: string; packageId?: string };
  for (const prefix of ["bootstrap-refresh-v2", "bootstrap-refresh"]) {
    const snapshot = await db.contextSnapshot.findFirst({ where: {
      scopeId, producer: "gap_app", packageId: `${prefix}:${pkg.producer}:${pkg.packageId}`,
    } });
    if (snapshot) return snapshot;
  }
  // The first activated package has an activation snapshot, not a refresh one.
  const initial = await db.contextSnapshot.findUnique({ where: { id: activation!.contextSnapshotId } });
  const body = initial?.package as { sources?: Array<{ extra?: { bootstrapPackageId?: string } }> } | undefined;
  if (initial && body?.sources?.some((source) => source.extra?.bootstrapPackageId === active.packageId)) return initial;
  // Never fall back to a newer, superseded package during an in-flight refresh.
  throw new Error("Current knowledge is still being processed. Retry after the refresh completes; historical evidence has been retained.");
}
