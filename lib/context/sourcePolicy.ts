// Source policy evaluation: the Gap App's own answer to "is this package
// complete," independent of whatever the producer claimed. SourceRegistration
// is Reality about tracking policy (see prisma/schema.prisma); an incoming
// package's role/status/completeness values are producer ASSERTIONS, never
// the final authority. This module is the boundary where that distinction
// is enforced.
//
// Two separate jobs, deliberately kept apart:
//   - validatePackageAgainstRegistrations: can REJECT a package outright
//     (a registrationId that doesn't exist, doesn't match, doesn't apply
//     to this Scope, or points at a superseded/retired registration).
//   - evaluateSourcePolicyCompleteness: never rejects, only SUMMARIZES --
//     this is what becomes ContextSnapshot.completenessSummary, replacing
//     a naive copy of the producer's own package.completeness.

import type { ProjectContextPackage } from "./package";

export class SourcePolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcePolicyViolationError";
  }
}

// The subset of a real SourceRegistration row this module needs -- kept
// narrow and Prisma-import-free so it stays trivially testable, same
// spirit as lib/capacity/resolve.ts's PersonLike/AllocationLike.
export interface RegistrationLike {
  id: string;
  sourceType: string;
  sourceRef: string;
  scopeIds: string[];
  role: string;
  status: string; // "candidate" | "active" | "paused" | "superseded" | "retired"
}

function appliesToScope(reg: RegistrationLike, scopeId: string): boolean {
  return reg.scopeIds.length === 0 || reg.scopeIds.includes(scopeId);
}

// Validates every package source entry that supplies a registrationId
// against CURRENT SourceRegistration Reality. Never trusts the package's
// own sourceType/role/status for a registered source -- only uses them to
// confirm they still match the registration (an impersonation/drift
// check), and rejects the WHOLE package (throws) on any mismatch. A
// source with registrationId === null is ad-hoc/unregistered and always
// allowed -- it contributes evidence for this one package without making
// any claim about Gap App tracking policy.
export function validatePackageAgainstRegistrations(
  pkg: ProjectContextPackage,
  registrationsById: Map<string, RegistrationLike>
): void {
  for (const source of pkg.sources) {
    if (!source.registrationId) continue; // ad-hoc -- allowed, no policy claim made

    const reg = registrationsById.get(source.registrationId);
    if (!reg) {
      throw new SourcePolicyViolationError(
        `Package source "${source.sourceRef}" references unknown registrationId "${source.registrationId}"`
      );
    }
    if (reg.sourceType !== source.sourceType) {
      throw new SourcePolicyViolationError(
        `Package source "${source.sourceRef}" declares sourceType "${source.sourceType}", but registration ` +
          `${reg.id} is registered as sourceType "${reg.sourceType}"`
      );
    }
    if (reg.sourceRef !== source.sourceRef) {
      throw new SourcePolicyViolationError(
        `Package source "${source.sourceRef}" claims registrationId ${reg.id}, but that registration is for ` +
          `sourceRef "${reg.sourceRef}" -- refusing to let one source impersonate another's registration`
      );
    }
    if (!appliesToScope(reg, pkg.scopeId)) {
      throw new SourcePolicyViolationError(
        `SourceRegistration ${reg.id} ("${reg.sourceRef}") does not apply to Scope "${pkg.scopeId}"`
      );
    }
    if (reg.status === "superseded" || reg.status === "retired") {
      throw new SourcePolicyViolationError(
        `SourceRegistration ${reg.id} ("${reg.sourceRef}") is ${reg.status} and cannot be used as current ` +
          `tracked evidence. To use this content once anyway, resend it with registrationId omitted (ad-hoc evidence).`
      );
    }
  }
}

export interface EvaluatedRegistrationRef {
  sourceRef: string;
  registrationId: string;
  role: string;
}

export interface PolicyEvaluatedCompleteness {
  // GAP-APP-EVALUATED, not producer-claimed -- see docs/CONTEXT-MODEL.md.
  status: "complete" | "partial";
  activeSupplied: EvaluatedRegistrationRef[];
  missingActive: EvaluatedRegistrationRef[];
  paused: (EvaluatedRegistrationRef & { supplied: boolean })[];
  excluded: (EvaluatedRegistrationRef & { status: "superseded" | "retired" })[];
  adHoc: { sourceType: string; sourceRef: string }[];
}

function toRef(reg: RegistrationLike): EvaluatedRegistrationRef {
  return { sourceRef: reg.sourceRef, registrationId: reg.id, role: reg.role };
}

// Computes what the Gap App independently concludes about this package's
// completeness, against `relevantRegistrations` (every SourceRegistration
// applicable to this Scope, regardless of whether the package mentions
// them) -- NOT against pkg.completeness, which is preserved verbatim
// elsewhere (inside ContextSnapshot.package) purely as a historical record
// of what the producer itself claimed. `candidate` registrations are
// intentionally excluded from every bucket: they have zero Reality effect
// until explicitly promoted, so their absence is never "missing."
export function evaluateSourcePolicyCompleteness(
  pkg: ProjectContextPackage,
  relevantRegistrations: RegistrationLike[]
): PolicyEvaluatedCompleteness {
  const suppliedRegistrationIds = new Set(
    pkg.sources.map((s) => s.registrationId).filter((id): id is string => !!id)
  );

  const active = relevantRegistrations.filter((r) => r.status === "active");
  const paused = relevantRegistrations.filter((r) => r.status === "paused");
  const excludedRegs = relevantRegistrations.filter((r) => r.status === "superseded" || r.status === "retired");

  const activeSupplied = active.filter((r) => suppliedRegistrationIds.has(r.id)).map(toRef);
  const missingActive = active.filter((r) => !suppliedRegistrationIds.has(r.id)).map(toRef);
  const pausedList = paused.map((r) => ({ ...toRef(r), supplied: suppliedRegistrationIds.has(r.id) }));
  const excluded = excludedRegs.map((r) => ({ ...toRef(r), status: r.status as "superseded" | "retired" }));
  const adHoc = pkg.sources
    .filter((s) => !s.registrationId)
    .map((s) => ({ sourceType: s.sourceType, sourceRef: s.sourceRef }));

  return {
    status: missingActive.length > 0 ? "partial" : "complete",
    activeSupplied,
    missingActive,
    paused: pausedList,
    excluded,
    adHoc,
  };
}
