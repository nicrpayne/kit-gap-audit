import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BootstrapPackageValidationError, validateBootstrapPackage } from "@/lib/bootstrap/contracts";
import { authorizedJob } from "@/lib/bootstrap/jobs";
import { ingestBootstrapPackage } from "@/lib/bootstrap/transport";

const SENSITIVE = /^(access_?token|refresh_?token|api_?key|password|client_?secret|authorization)$/i;
function rejectSecrets(value: unknown, path = "package") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.test(key)) throw new BootstrapPackageValidationError(`${path}.${key} may not contain connector credentials`);
    rejectSecrets(child, `${path}.${key}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.text();
  if (raw.length > 5_010_000) return NextResponse.json({ error: "Bootstrap delivery exceeds 5 MB" }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const job = await authorizedJob(id, body.claimToken);
  if (!job) return NextResponse.json({ error: "Invalid or expired job claim" }, { status: 409 });
  if (body.revision !== job.revision) return NextResponse.json({ error: "Stale bootstrap revision" }, { status: 409 });

  let pkg;
  try {
    rejectSecrets(body.package);
    pkg = validateBootstrapPackage(body.package, job.bootstrapId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid bootstrap package" }, { status: 400 });
  }
  if (pkg.version !== job.expectedPackageVersion) return NextResponse.json({ error: "Package version does not match job contract" }, { status: 409 });

  if (["complete", "partial"].includes(job.status)) {
    const existing = await prisma.bootstrapPackage.findUnique({ where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } } });
    if (!existing || existing.bootstrapId !== job.bootstrapId || existing.packageId !== job.packageId) {
      return NextResponse.json({ error: "Completed job package identity does not match" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, scanId: existing.scanRunId, packageId: existing.packageId, reused: true, jobId: id });
  }
  if (job.bootstrap.reviewRevision !== job.revision) {
    await prisma.bootstrapScanJob.update({ where: { id }, data: { status: "stale", stage: "stale_revision", error: "Bootstrap revision changed before package delivery", completedAt: new Date() } });
    return NextResponse.json({ error: "Stale bootstrap revision" }, { status: 409 });
  }

  const result = await ingestBootstrapPackage(job.bootstrapId, pkg, { scanRunId: job.scanRunId });
  if (!result.body || !("ok" in result.body)) return NextResponse.json(result.body, { status: result.status });
  const now = new Date();
  const terminalStatus = pkg.discovery.partial ? "partial" : "complete";
  await prisma.$transaction([
    prisma.bootstrapScanJob.update({ where: { id }, data: { status: terminalStatus, stage: terminalStatus, packageId: pkg.packageId, completedAt: now, lastHeartbeatAt: now, progress: { message: "Bootstrap Review ready" } } }),
    prisma.bootstrapScanRun.update({ where: { id: job.scanRunId }, data: { status: terminalStatus, stage: terminalStatus } }),
    ...(job.claimedBy ? [prisma.bootstrapCompanion.update({ where: { id: job.claimedBy }, data: { state: "online", lastSeenAt: now, lastJobId: id } })] : []),
  ]);
  return NextResponse.json({ ...result.body, jobId: id }, { status: result.status });
}
