import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bootstrapHash } from "./hash";
import type { ProjectBootstrapPackageV1 } from "./contracts";
import { persistCompiledPackage } from "./scan";
import { auditActivatedBootstrapRefresh, toContextPackage } from "./refresh";

export type PackageIngestResult = {
  ok: true; scanId: string; packageId: string; reused: boolean; refreshAudit: unknown;
};

export async function ingestBootstrapPackage(
  bootstrapId: string,
  pkg: ProjectBootstrapPackageV1,
  options: { scanRunId?: string } = {},
): Promise<{ status: number; body: PackageIngestResult } | { status: number; body: { error: string } }> {
  const bootstrap = await prisma.projectBootstrap.findUnique({
    where: { id: bootstrapId },
    select: { id: true, activePackageId: true, activation: { select: { id: true, scopeId: true } } },
  });
  if (!bootstrap) return { status: 404, body: { error: "Project bootstrap not found" } };
  const hash = bootstrapHash(pkg);
  const existing = await prisma.bootstrapPackage.findUnique({ where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } } });
  if (existing && existing.packageHash !== hash) return { status: 409, body: { error: "The producer reused packageId for different content" } };
  if (existing && existing.bootstrapId !== bootstrapId) return { status: 409, body: { error: "The package identity already belongs to a different bootstrap" } };
  if (existing && bootstrap.activePackageId === existing.id) {
    if (options.scanRunId) {
      const scan = await prisma.bootstrapScanRun.findUnique({ where: { id: options.scanRunId } });
      if (!scan || scan.bootstrapId !== bootstrapId) return { status: 409, body: { error: "Job scan does not belong to this bootstrap" } };
    }
    // A companion can legitimately compile the same immutable knowledge
    // package twice. Reusing it must still honor the operator's one-button
    // refresh by reading Linear again and recomputing Scope and readiness.
    const refreshAudit = bootstrap.activation
      ? await auditActivatedBootstrapRefresh(bootstrapId, { receiptScanRunId: options.scanRunId })
      : null;
    return {
      status: 200,
      body: {
        ok: true,
        scanId: options.scanRunId ?? existing.scanRunId,
        packageId: existing.packageId,
        reused: true,
        refreshAudit,
      },
    };
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
  // DERIVE AND VALIDATE BEFORE THE POINTER MOVES.
  //
  // `persistCompiledPackage` commits `activePackageId` in its own transaction.
  // `auditActivatedBootstrapRefresh` then derives the ProjectContextPackage --
  // and `toContextPackage` ends in `validateProjectContextPackage`, which
  // throws on a package the context contract rejects. Run in that order, a
  // rejected package leaves the pointer referencing a bootstrap package with
  // no usable snapshot, and every `currentContextSnapshot` consumer fails:
  // envelope, forecast, reports, scope proposal, audit truth.
  //
  // This is a PRE-CHECK, not a compensating rollback. Nothing is reset, no
  // revision is rewound, and no concurrent review is overwritten -- the
  // pointer simply never moves. `toContextPackage` is pure, so the only cost
  // is deriving the context twice on the activated path.
  //
  // It does not cover a failure INSIDE the snapshot transaction (a database
  // error, say). That residual case wants snapshot creation and the pointer
  // move in one transaction; this change removes the deterministic class
  // without reaching for that.
  if (bootstrap.activation) {
    toContextPackage(bootstrap.activation.scopeId, pkg);
  }
  await persistCompiledPackage(scanId, pkg);
  const refreshAudit = bootstrap.activation
    ? await auditActivatedBootstrapRefresh(bootstrapId, { receiptScanRunId: scanId })
    : null;
  return { status: existing ? 200 : 201, body: { ok: true, scanId, packageId: pkg.packageId, reused: Boolean(existing), refreshAudit } };
}
