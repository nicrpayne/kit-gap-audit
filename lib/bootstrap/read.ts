import { prisma } from "@/lib/prisma";
import type { ProjectBootstrapPackageV1 } from "./contracts";

export async function readBootstrap(bootstrapId: string) {
  const bootstrap = await prisma.projectBootstrap.findUnique({
    where: { id: bootstrapId },
    include: {
      scans: { orderBy: { sequence: "desc" }, take: 10 },
      candidates: {
        where: { active: true }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
        include: { evidenceLinks: true },
      },
      reviewEvents: { orderBy: { createdAt: "desc" }, take: 100 },
      activation: true,
    },
  });
  if (!bootstrap) return null;
  const activePackage = bootstrap.activePackageId
    ? await prisma.bootstrapPackage.findUnique({ where: { id: bootstrap.activePackageId } })
    : null;
  const firstAudit = bootstrap.activation
    ? await prisma.auditRun.findUnique({ where: { id: bootstrap.activation.firstAuditRunId }, include: { findings: { orderBy: { createdAt: "asc" } } } })
    : null;
  const counts = bootstrap.candidates.reduce<Record<string, number>>((out, candidate) => {
    out[candidate.kind] = (out[candidate.kind] ?? 0) + 1;
    out[candidate.status] = (out[candidate.status] ?? 0) + 1;
    return out;
  }, {});
  return {
    bootstrap: {
      id: bootstrap.id, canonicalName: bootstrap.canonicalName, aliases: bootstrap.aliases,
      ownerHint: bootstrap.ownerHint, sourceHints: bootstrap.sourceHints,
      searchExistingKnowledge: bootstrap.searchExistingKnowledge, status: bootstrap.status,
      reviewRevision: bootstrap.reviewRevision, createdAt: bootstrap.createdAt, updatedAt: bootstrap.updatedAt,
      activation: bootstrap.activation ? { ...bootstrap.activation, firstAudit } : null,
    },
    scans: bootstrap.scans,
    activePackage: activePackage
      ? {
          id: activePackage.id, packageId: activePackage.packageId, packageVersion: activePackage.packageVersion,
          producer: activePackage.producer, compilerVersion: activePackage.compilerVersion,
          packageHash: activePackage.packageHash, generatedAt: activePackage.generatedAt,
          package: activePackage.package as unknown as ProjectBootstrapPackageV1,
        }
      : null,
    candidates: bootstrap.candidates,
    reviewEvents: bootstrap.reviewEvents,
    counts,
    boundary: bootstrap.activation ? {
      label: "ACTIVATED",
      canonicalWrites: 1,
      forecastEffect: 0,
      detail: "The accepted activation manifest crossed into Reality. All later scan candidates remain external until separately accepted.",
    } : {
      label: "NOT REALITY",
      canonicalWrites: 0,
      forecastEffect: 0,
      detail: "All records on this surface belong only to ProjectBootstrap review state.",
    },
  };
}
