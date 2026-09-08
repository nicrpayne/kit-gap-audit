import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bootstrapHash } from "./hash";
import type { ProjectBootstrapPackageV1 } from "./contracts";
import { persistCompiledPackage } from "./scan";
import { auditActivatedBootstrapRefresh } from "./refresh";

export type PackageIngestResult = {
  ok: true; scanId: string; packageId: string; reused: boolean; refreshAudit: unknown;
};

export async function ingestBootstrapPackage(
  bootstrapId: string,
  pkg: ProjectBootstrapPackageV1,
  options: { scanRunId?: string } = {},
): Promise<{ status: number; body: PackageIngestResult } | { status: number; body: { error: string } }> {
  const bootstrap = await prisma.projectBootstrap.findUnique({
    where: { id: bootstrapId }, select: { id: true, activePackageId: true, activation: { select: { id: true } } },
  });
  if (!bootstrap) return { status: 404, body: { error: "Project bootstrap not found" } };
  const hash = bootstrapHash(pkg);
  const existing = await prisma.bootstrapPackage.findUnique({ where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } } });
  if (existing && existing.packageHash !== hash) return { status: 409, body: { error: "The producer reused packageId for different content" } };
  if (existing && existing.bootstrapId !== bootstrapId) return { status: 409, body: { error: "The package identity already belongs to a different bootstrap" } };
  if (existing && bootstrap.activePackageId === existing.id) {
    return { status: 200, body: { ok: true, scanId: existing.scanRunId, packageId: existing.packageId, reused: true, refreshAudit: null } };
  }

  let scanId = options.scanRunId;
  if (scanId) {
    const scan = await prisma.bootstrapScanRun.findUnique({ where: { id: scanId } });
    if (!scan || scan.bootstrapId !== bootstrapId) return { status: 409, body: { error: "Job scan does not belong to this bootstrap" } };
    await prisma.bootstrapScanRun.update({ where: { id: scanId }, data: {
      status: "running", stage: "package_validation", startedAt: scan.startedAt ?? new Date(),
      providerCoverage: pkg.coverage as unknown as Prisma.InputJsonValue,
      warnings: pkg.warnings as unknown as Prisma.InputJsonValue,
    } });
  } else {
    const last = await prisma.bootstrapScanRun.findFirst({ where: { bootstrapId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const scan = await prisma.bootstrapScanRun.create({ data: {
      bootstrapId, sequence: (last?.sequence ?? 0) + 1, status: "running", stage: "package_validation", startedAt: new Date(),
      providerCoverage: pkg.coverage as unknown as Prisma.InputJsonValue,
      metrics: {} as Prisma.InputJsonValue, warnings: pkg.warnings as unknown as Prisma.InputJsonValue,
    } });
    scanId = scan.id;
  }
  await persistCompiledPackage(scanId, pkg);
  const refreshAudit = bootstrap.activation ? await auditActivatedBootstrapRefresh(bootstrapId) : null;
  return { status: existing ? 200 : 201, body: { ok: true, scanId, packageId: pkg.packageId, reused: Boolean(existing), refreshAudit } };
}
