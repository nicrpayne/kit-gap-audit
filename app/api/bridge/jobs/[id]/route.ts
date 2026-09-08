import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizedJob, CLAIM_LEASE_MS, JOB_STAGES } from "@/lib/bootstrap/jobs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await authorizedJob(id, req.headers.get("x-claim-token"));
  if (!job) return NextResponse.json({ error: "Invalid or expired job claim" }, { status: 409 });
  return NextResponse.json({ job: {
    id: job.id, bootstrapId: job.bootstrapId, scanRunId: job.scanRunId, revision: job.revision,
    status: job.status, stage: job.stage, packageId: job.packageId, attempts: job.attempts,
    lastHeartbeatAt: job.lastHeartbeatAt, completedAt: job.completedAt, error: job.error,
  } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.text();
  if (raw.length > 32_768) return NextResponse.json({ error: "Job update body too large" }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const job = await authorizedJob(id, body?.claimToken);
  if (!job) return NextResponse.json({ error: "Invalid or expired job claim" }, { status: 409 });
  if (body?.revision !== job.revision || job.bootstrap.reviewRevision !== job.revision) {
    await prisma.bootstrapScanJob.update({ where: { id }, data: { status: "stale", stage: "stale_revision", error: "Bootstrap revision changed before package delivery", completedAt: new Date() } });
    return NextResponse.json({ error: "Stale bootstrap revision" }, { status: 409 });
  }
  const status = body.status === "failed" ? "failed" : "running";
  const stage = typeof body.stage === "string" && JOB_STAGES.has(body.stage) ? body.stage : job.stage;
  const now = new Date();
  const error = status === "failed" ? String(body.error ?? "Local companion scan failed").slice(0, 2_000) : null;
  await prisma.$transaction([
    prisma.bootstrapScanJob.update({ where: { id }, data: {
      status, stage, error, lastHeartbeatAt: now, claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      progress: (body.progress && typeof body.progress === "object" ? body.progress : {}) as Prisma.InputJsonValue,
      ...(status === "failed" ? { completedAt: now } : {}),
    } }),
    prisma.bootstrapScanRun.update({ where: { id: job.scanRunId }, data: {
      status: status === "failed" ? "failed" : "running", stage, error,
      ...(status === "failed" ? { completedAt: now } : {}),
    } }),
    prisma.bootstrapCompanion.update({ where: { id: job.claimedBy! }, data: { state: status === "failed" ? "degraded" : "scanning", lastSeenAt: now, lastJobId: id } }),
    ...(status === "failed" && job.bootstrap.status !== "activated" ? [prisma.projectBootstrap.update({ where: { id: job.bootstrapId }, data: { status: "scan_failed" } })] : []),
  ]);
  return NextResponse.json({ ok: true, status, stage, leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString() });
}
