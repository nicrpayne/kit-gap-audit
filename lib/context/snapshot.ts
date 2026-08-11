// Persistence boundary for ProjectContextPackage -> ContextSnapshot. This
// is the ONLY place a ContextSnapshot row is created (one accepted package
// instance produces exactly one snapshot -- callers pass the resulting
// snapshot id through to whatever consumes it; nothing downstream creates
// a second snapshot for the same accepted package).
//
// Idempotent by (producer, packageId) ONLY when the content is identical
// (contextHash matches). A retry of the same logical package (same
// producer re-sending the same packageId, e.g. after a timeout) returns
// the existing snapshot. A DIFFERENT package showing up under an
// already-used (producer, packageId) is an identity conflict, not a
// silent overwrite or a silent "close enough" reuse -- packageId is
// supposed to identify immutable content, so this is a real, throwable
// error at the boundary, not something to paper over.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateProjectContextPackage } from "./validate";
import { hashProjectContextPackage } from "./hash";
import type { ProjectContextPackage } from "./package";
import {
  validatePackageAgainstRegistrations,
  evaluateSourcePolicyCompleteness,
  type RegistrationLike,
  type PolicyEvaluatedCompleteness,
} from "./sourcePolicy";

export { SourcePolicyViolationError } from "./sourcePolicy";

export class PackageIdentityConflictError extends Error {
  constructor(producer: string, packageId: string) {
    super(
      `A different package was already persisted for producer "${producer}" + packageId "${packageId}". ` +
        `packageId must identify immutable content -- send a new packageId for changed content, or resend ` +
        `the exact original package to reuse the existing snapshot.`
    );
    this.name = "PackageIdentityConflictError";
  }
}

export class PackageScopeMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Package scopeId "${actual}" does not match the expected scopeId "${expected}" for this request`);
    this.name = "PackageScopeMismatchError";
  }
}

export interface PersistedContextSnapshot {
  id: string;
  scopeId: string;
  packageId: string;
  packageVersion: string;
  producer: string;
  package: ProjectContextPackage;
  contextHash: string;
  // GAP-APP-EVALUATED completeness, computed against CURRENT
  // SourceRegistration Reality at acceptance time -- NOT a copy of the
  // producer's own pkg.completeness (that stays preserved verbatim inside
  // `package` above, purely as a historical record of the producer's own
  // claim). See lib/context/sourcePolicy.ts.
  completenessSummary: PolicyEvaluatedCompleteness;
  createdAt: Date;
  // true when this call found an already-persisted snapshot for the same
  // (producer, packageId, contextHash) instead of creating a new row --
  // proves the idempotency guarantee rather than just asserting it.
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
    completenessSummary: row.completenessSummary as unknown as PolicyEvaluatedCompleteness,
    createdAt: row.createdAt,
    reused,
  };
}

export interface PersistContextSnapshotOptions {
  // When provided, the package's own scopeId must match exactly --
  // defense-in-depth so an ingestion boundary (POST /api/refresh) can't
  // accidentally persist a package for a different Scope than the one the
  // request named.
  expectedScopeId?: string;
}

// Validates, then persists exactly one immutable ContextSnapshot row (or
// returns the existing one for an identical retry). Never updates an
// existing row -- a ContextSnapshot, once written, is never touched again.
export async function persistContextSnapshot(
  rawPackage: unknown,
  options: PersistContextSnapshotOptions = {}
): Promise<PersistedContextSnapshot> {
  const pkg = validateProjectContextPackage(rawPackage);

  if (options.expectedScopeId !== undefined && pkg.scopeId !== options.expectedScopeId) {
    throw new PackageScopeMismatchError(options.expectedScopeId, pkg.scopeId);
  }

  const scope = await prisma.scope.findUnique({ where: { id: pkg.scopeId }, select: { id: true } });
  if (!scope) {
    throw new Error(`ContextSnapshot: unknown scopeId "${pkg.scopeId}"`);
  }

  const contextHash = hashProjectContextPackage(pkg);

  const existing = await prisma.contextSnapshot.findUnique({
    where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } },
  });
  if (existing) {
    if (existing.contextHash !== contextHash) {
      throw new PackageIdentityConflictError(pkg.producer, pkg.packageId);
    }
    // Identical content already accepted -- return the historical result
    // as-is. Deliberately does NOT re-validate against or re-evaluate
    // current SourceRegistration policy: this call created nothing new,
    // so a registration change made after the original acceptance must
    // not make a pure retry of unchanged content start failing (or
    // silently change what was recorded as true at acceptance time).
    return toResult(existing, true);
  }

  // Only a genuinely NEW package is checked against current
  // SourceRegistration Reality -- registrationId existence/type/ref/scope/
  // status, and the Gap-App-evaluated completeness. Fetched once, used for
  // both, so a package can't be validated against one registration list
  // and evaluated against a different (e.g. concurrently changed) one.
  const relevantRegistrations: RegistrationLike[] = await prisma.sourceRegistration.findMany({
    where: { OR: [{ scopeIds: { isEmpty: true } }, { scopeIds: { has: pkg.scopeId } }] },
  });
  const registrationsById = new Map(relevantRegistrations.map((r) => [r.id, r]));
  validatePackageAgainstRegistrations(pkg, registrationsById);
  const completenessSummary = evaluateSourcePolicyCompleteness(pkg, relevantRegistrations);

  const created = await prisma.contextSnapshot.create({
    data: {
      scopeId: pkg.scopeId,
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      producer: pkg.producer,
      package: pkg as unknown as Prisma.InputJsonValue,
      contextHash,
      completenessSummary: completenessSummary as unknown as Prisma.InputJsonValue,
    },
  });

  return toResult(created, false);
}

export async function getContextSnapshot(id: string): Promise<PersistedContextSnapshot | null> {
  const row = await prisma.contextSnapshot.findUnique({ where: { id } });
  if (!row) return null;
  return toResult(row, false);
}
