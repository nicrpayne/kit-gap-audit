import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CLAIM_LEASE_MS = 90_000;
export const COMPANION_ONLINE_MS = 90_000;
export const JOB_STAGES = new Set([
  "companion_claimed", "identity", "exact_lexical_search", "evidence_lineage",
  "semantic_unavailable", "graph_expansion", "proposal_compilation", "package_upload",
]);

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeCompanionId(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{3,100}$/.test(value)) return null;
  return value;
}

export interface ClaimCandidateShape {
  id: string;
  revision: number;
  createdAt: Date;
  bootstrap: { reviewRevision: number; status: string };
}

export function jobIsIdentityCompatible(job: ClaimCandidateShape): boolean {
  return job.revision === job.bootstrap.reviewRevision && job.bootstrap.status !== "archived";
}

export function selectCurrentClaimCandidate<T extends ClaimCandidateShape>(jobs: T[]): T | null {
  return [...jobs]
    .filter(jobIsIdentityCompatible)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
}

export async function createCompanionScan(bootstrapId: string) {
  return prisma.$transaction(async (tx) => {
    const bootstrap = await tx.projectBootstrap.findUnique({ where: { id: bootstrapId } });
    if (!bootstrap) return null;
    const last = await tx.bootstrapScanRun.findFirst({ where: { bootstrapId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const superseded = await tx.bootstrapScanJob.findMany({
      where: { bootstrapId, status: { in: ["pending", "claimed", "running"] } },
      select: { id: true, scanRunId: true },
    });
    if (superseded.length > 0) {
      const completedAt = new Date();
      await tx.bootstrapScanJob.updateMany({
        where: { id: { in: superseded.map((job) => job.id) } },
        data: {
          status: "stale",
          stage: "superseded_by_newer_scan",
          error: "Superseded immediately by a newer refresh for the same project identity",
          completedAt,
          claimExpiresAt: null,
        },
      });
      await tx.bootstrapScanRun.updateMany({
        where: { id: { in: superseded.map((job) => job.scanRunId) } },
        data: {
          status: "stale",
          stage: "superseded_by_newer_scan",
          error: "Superseded by a newer refresh",
          completedAt,
        },
      });
    }
    const scan = await tx.bootstrapScanRun.create({ data: {
      bootstrapId, sequence: (last?.sequence ?? 0) + 1, status: "queued", stage: "waiting_for_companion",
      providerCoverage: [] as Prisma.InputJsonValue, metrics: {} as Prisma.InputJsonValue, warnings: [] as Prisma.InputJsonValue,
    } });
    const job = await tx.bootstrapScanJob.create({ data: {
      bootstrapId, scanRunId: scan.id, revision: bootstrap.reviewRevision,
      idempotencyKey: `bootstrap-scan:${bootstrapId}:${scan.id}:${randomUUID()}`,
      progress: { message: "Waiting for local knowledge companion" } as Prisma.InputJsonValue,
    } });
    if (bootstrap.status !== "activated") await tx.projectBootstrap.update({ where: { id: bootstrapId }, data: { status: "scanning" } });
    return { scan, job };
  });
}

export async function claimNextJob(companionId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = new Date();
    const candidates = await prisma.bootstrapScanJob.findMany({
      where: { OR: [
        { status: "pending" },
        { status: { in: ["claimed", "running"] }, claimExpiresAt: { lt: now } },
      ] },
      orderBy: { createdAt: "desc" },
      include: { bootstrap: true },
      take: 25,
    });
    const incompatible = candidates.filter((job) => !jobIsIdentityCompatible(job));
    if (incompatible.length > 0) {
      const completedAt = new Date();
      await prisma.$transaction([
        prisma.bootstrapScanJob.updateMany({
          where: { id: { in: incompatible.map((job) => job.id) }, status: { in: ["pending", "claimed", "running"] } },
          data: { status: "stale", stage: "stale_identity", error: "Project identity/revision changed before claim", completedAt, claimExpiresAt: null },
        }),
        prisma.bootstrapScanRun.updateMany({
          where: { id: { in: incompatible.map((job) => job.scanRunId) } },
          data: { status: "stale", stage: "stale_identity", error: "Project identity/revision changed before claim", completedAt },
        }),
      ]);
    }
    const candidate = selectCurrentClaimCandidate(candidates);
    if (!candidate) return null;
    const rawToken = randomBytes(32).toString("hex");
    const expires = new Date(now.getTime() + CLAIM_LEASE_MS);
    const updated = await prisma.bootstrapScanJob.updateMany({
      where: {
        id: candidate.id,
        OR: [{ status: "pending" }, { status: { in: ["claimed", "running"] }, claimExpiresAt: { lt: now } }],
      },
      data: {
        status: "claimed", stage: "companion_claimed", claimedBy: companionId,
        claimTokenHash: hashClaimToken(rawToken), claimExpiresAt: expires,
        claimedAt: now, lastHeartbeatAt: now, attempts: { increment: 1 }, error: null,
        progress: { message: "Companion online · scanning" } as Prisma.InputJsonValue,
      },
    });
    if (updated.count !== 1) continue;
    await prisma.$transaction([
      prisma.bootstrapScanRun.update({ where: { id: candidate.scanRunId }, data: { status: "running", stage: "companion_claimed", startedAt: now, error: null } }),
      prisma.bootstrapCompanion.update({ where: { id: companionId }, data: { state: "scanning", lastJobId: candidate.id, lastSeenAt: now } }),
    ]);
    return {
      id: candidate.id, bootstrapId: candidate.bootstrapId, scanRunId: candidate.scanRunId,
      canonicalName: candidate.bootstrap.canonicalName, aliases: candidate.bootstrap.aliases,
      ownerHint: candidate.bootstrap.ownerHint, sourceHints: candidate.bootstrap.sourceHints,
      expectedPackageVersion: candidate.expectedPackageVersion, revision: candidate.revision,
      idempotencyKey: candidate.idempotencyKey, claimToken: rawToken, claimExpiresAt: expires.toISOString(),
    };
  }
  return null;
}

export async function authorizedJob(jobId: string, claimToken: unknown) {
  if (typeof claimToken !== "string" || claimToken.length < 32) return null;
  const job = await prisma.bootstrapScanJob.findUnique({ where: { id: jobId }, include: { bootstrap: true } });
  if (!job?.claimTokenHash || job.claimTokenHash !== hashClaimToken(claimToken)) return null;
  if (["stale", "failed"].includes(job.status)) return null;
  if (job.bootstrap.reviewRevision !== job.revision || job.bootstrap.status === "archived") return null;
  if (!["complete", "partial"].includes(job.status) && (!job.claimExpiresAt || job.claimExpiresAt.getTime() < Date.now())) return null;
  return job;
}
