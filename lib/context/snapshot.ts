// Persistence boundary for ProjectContextPackage -> ContextSnapshot. This
// is the ONLY place a ContextSnapshot row is created (Correction 4: one
// accepted package instance produces exactly one snapshot). Phase 1b's
// future callers (runAudit, generateReport, /api/refresh) will call this
// once at the top of a refresh and pass the resulting snapshot id through
// to whatever consumes it -- none of that wiring exists yet in Phase 1a.
//
// Idempotent by (producer, packageId): a retried push of the same logical
// package (same producer re-sending the same packageId, e.g. after a
// timeout) returns the existing snapshot rather than creating a duplicate.
// This is the safety net Correction 1 asks for -- packageId is the
// producer's own identity for a package instance, ContextSnapshot.id is
// the Gap App's separate, local, immutable historical identifier.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateProjectContextPackage } from "./validate";
import { hashProjectContextPackage } from "./hash";
import type { ProjectContextPackage, PackageCompleteness } from "./package";

export interface PersistedContextSnapshot {
  id: string;
  scopeId: string;
  packageId: string;
  packageVersion: string;
  producer: string;
  package: ProjectContextPackage;
  contextHash: string;
  completenessSummary: PackageCompleteness;
  createdAt: Date;
  // true when this call found an already-persisted snapshot for the same
  // (producer, packageId) instead of creating a new row -- proves the
  // idempotency guarantee rather than just asserting it.
  reused: boolean;
}

function toResult(
  row: {
    id: string;
    scopeId: string;
    packageId: string;
    packageVersion: string;
    producer: string;
    package: Prisma.JsonValue;
    contextHash: string;
    completenessSummary: Prisma.JsonValue;
    createdAt: Date;
  },
  reused: boolean
): PersistedContextSnapshot {
  return {
    id: row.id,
    scopeId: row.scopeId,
    packageId: row.packageId,
    packageVersion: row.packageVersion,
    producer: row.producer,
    package: row.package as unknown as ProjectContextPackage,
    contextHash: row.contextHash,
    completenessSummary: row.completenessSummary as unknown as PackageCompleteness,
    createdAt: row.createdAt,
    reused,
  };
}

// Validates, then persists exactly one immutable ContextSnapshot row.
// Never updates an existing row -- a ContextSnapshot, once written, is
// never touched again by this or any other function.
export async function persistContextSnapshot(rawPackage: unknown): Promise<PersistedContextSnapshot> {
  const pkg = validateProjectContextPackage(rawPackage);

  const scope = await prisma.scope.findUnique({ where: { id: pkg.scopeId }, select: { id: true } });
  if (!scope) {
    throw new Error(`ContextSnapshot: unknown scopeId "${pkg.scopeId}"`);
  }

  const existing = await prisma.contextSnapshot.findUnique({
    where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } },
  });
  if (existing) {
    return toResult(existing, true);
  }

  const contextHash = hashProjectContextPackage(pkg);

  const created = await prisma.contextSnapshot.create({
    data: {
      scopeId: pkg.scopeId,
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      producer: pkg.producer,
      package: pkg as unknown as Prisma.InputJsonValue,
      contextHash,
      completenessSummary: pkg.completeness as unknown as Prisma.InputJsonValue,
    },
  });

  return toResult(created, false);
}

export async function getContextSnapshot(id: string): Promise<PersistedContextSnapshot | null> {
  const row = await prisma.contextSnapshot.findUnique({ where: { id } });
  if (!row) return null;
  return toResult(row, false);
}
