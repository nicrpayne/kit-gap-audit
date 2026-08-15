// Pure, isomorphic capacity math -- no Prisma import. Runs server-side in
// lib/forecast/compute.ts today, and will run client-side too once the
// portfolio dashboard re-simulates on every slider drag (see ROADMAP.md
// "Shared capacity pool"), so nothing here may touch the database or the
// network.

export interface PersonLike {
  id: string;
  name: string;
  fte: number;
  active: boolean;
}

export interface AllocationLike {
  personId: string;
  scopeId: string;
  fraction: number; // 0..1, share of this person's own time
}

export interface CapacityContributor {
  personId: string;
  name: string;
  fte: number;
  fraction: number;
  // How many scopes this person has a positive allocation to, anywhere --
  // not just this one. Drives the context-switch penalty below.
  scopeCount: number;
  switchFactor: number; // 1 = no penalty
  effectiveFte: number; // fraction * fte * switchFactor -- this scope's take
}

export type CapacitySource = "allocations" | "explicit";

// HOW PRECISELY WE KNOW WHO IS ON A SCOPE. See Scope.capacityResolution in
// prisma/schema.prisma for the full reasoning. The short version, because
// it is the invariant this whole module exists to protect:
//
//   There is ONE portfolio capacity pool. People are the capacity.
//   Naming someone does not create capacity -- it only says, more
//   precisely, where capacity that already existed is going.
//
// So "team" and "named" are two resolutions of one fact, and exactly one
// of them is authoritative for a given Scope at a given moment. They are
// never summed. A 10 FTE team estimate plus a 2.5 FTE named roster is not
// 12.5 FTE of humans; it is one team, described twice, and the more
// precise description wins.
export type CapacityResolution = "team" | "named";

// Scope.capacityResolution is a String column (Prisma has no enum here),
// so every read narrows through this. Anything unrecognised is treated as
// "team": the coarser description is the safe one to fall back to, since
// it can never invent a roster that isn't there.
export function asCapacityResolution(raw: string | null | undefined): CapacityResolution {
  return raw === "named" ? "named" : "team";
}

export interface ResolvedCapacity {
  // null when this Scope has neither allocations nor an explicit
  // teamCapacity -- callers fall back to their own inference (e.g.
  // buildForecastInputs' distinct-assignee count), which needs data
  // (Linear issues) this module deliberately doesn't have.
  capacity: number | null;
  source: CapacitySource | null;
  contributors: CapacityContributor[]; // non-empty only when source === "allocations"
}

const EPSILON = 1e-6;

// Linear penalty, user-set and defaulting to 0 (no penalty) -- never an
// inferred or baked-in number, per the same "no invented benchmarks" rule
// already applied to Forecast's estimate math. A person allocated to only
// one scope is never penalized regardless of the setting.
// Exported so the Instrument can SHOW this formula's own output ("2 scopes
// -> 88% effective") rather than paraphrasing it in prose that could drift.
// Behaviour is unchanged: same function, same call sites.
export function switchFactorFor(contextSwitchCostPct: number, scopeCount: number): number {
  if (contextSwitchCostPct <= 0 || scopeCount <= 1) return 1;
  const factor = 1 - (contextSwitchCostPct / 100) * (scopeCount - 1);
  return Math.min(1, Math.max(0.1, factor));
}

// How many distinct scopes each person has a positive allocation to,
// across the whole allocation set (not just one scope) -- this is what
// the context-switch penalty is keyed on.
function countScopesPerPerson(allocations: AllocationLike[]): Map<string, number> {
  const scopesByPerson = new Map<string, Set<string>>();
  for (const a of allocations) {
    if (a.fraction <= 0) continue;
    let set = scopesByPerson.get(a.personId);
    if (!set) {
      set = new Set();
      scopesByPerson.set(a.personId, set);
    }
    set.add(a.scopeId);
  }
  const counts = new Map<string, number>();
  for (const [personId, scopes] of scopesByPerson) counts.set(personId, scopes.size);
  return counts;
}

// Resolve one Scope's capacity at its DECLARED resolution.
//
// `resolution` decides which description of the team is authoritative, and
// the other is not consulted at all -- that exclusivity is the point. A
// "named" Scope reads its roster and ignores explicitTeamCapacity; a "team"
// Scope reads its number and ignores allocations. Nothing here ever adds
// one to the other.
//
// Stage 2 of the fallback ("team" with no number -> inferred from Linear
// assignees) lives in buildForecastInputs, since it needs issue data this
// module deliberately doesn't have -- see lib/forecast/build.ts.
export function resolveCapacity(
  scopeId: string,
  explicitTeamCapacity: number | null,
  people: PersonLike[],
  allocations: AllocationLike[],
  contextSwitchCostPct: number,
  resolution: CapacityResolution
): ResolvedCapacity {
  if (resolution === "named") {
    const activeById = new Map(people.filter((p) => p.active).map((p) => [p.id, p]));
    const scopeCounts = countScopesPerPerson(allocations);
    const relevant = allocations.filter(
      (a) => a.scopeId === scopeId && a.fraction > 0 && activeById.has(a.personId)
    );

    const contributors: CapacityContributor[] = relevant.map((a) => {
      const person = activeById.get(a.personId)!;
      const scopeCount = scopeCounts.get(a.personId) ?? 1;
      const switchFactor = switchFactorFor(contextSwitchCostPct, scopeCount);
      return {
        personId: person.id,
        name: person.name,
        fte: person.fte,
        fraction: a.fraction,
        scopeCount,
        switchFactor,
        effectiveFte: a.fraction * person.fte * switchFactor,
      };
    });

    // An empty roster resolves to 0, NOT to the dormant team estimate.
    // Falling back here is what used to let removing the last person
    // silently reinstate a stale aggregate number; callers surface the
    // empty-roster state instead (see hasEmptyNamedRoster below).
    const capacity = contributors.reduce((sum, c) => sum + c.effectiveFte, 0);
    return { capacity, source: "allocations", contributors };
  }

  if (explicitTeamCapacity != null && explicitTeamCapacity > 0) {
    return { capacity: explicitTeamCapacity, source: "explicit", contributors: [] };
  }

  return { capacity: null, source: null, contributors: [] };
}

// A Scope tracked by name with nobody on it. Not a number the simulation
// can honour -- the engine rewrites a capacity of 0 to 1 FTE (see
// lib/capacity/limits.ts), which would quietly report a one-person
// forecast for work nobody is doing. Callers must surface this and refuse
// to commit it, rather than showing a date derived from it.
export function hasEmptyNamedRoster(
  scopeId: string,
  people: PersonLike[],
  allocations: AllocationLike[],
  resolution: CapacityResolution
): boolean {
  if (resolution !== "named") return false;
  const activeIds = new Set(people.filter((p) => p.active).map((p) => p.id));
  return !allocations.some((a) => a.scopeId === scopeId && a.fraction > 0 && activeIds.has(a.personId));
}

export interface OverAllocation {
  personId: string;
  personName: string;
  totalFraction: number; // > 1.0
}

// Rejects over-allocation (a person's fractions across all their
// Allocations summing past 1.0) -- callers must surface this as an error,
// never silently clamp or normalize it away, since that would quietly
// misreport how much of someone's time is actually committed.
export function validateAllocations(people: PersonLike[], allocations: AllocationLike[]): OverAllocation[] {
  const totals = new Map<string, number>();
  for (const a of allocations) {
    if (a.fraction < 0) {
      throw new Error(`Allocation fraction cannot be negative (person ${a.personId})`);
    }
    totals.set(a.personId, (totals.get(a.personId) ?? 0) + a.fraction);
  }

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const errors: OverAllocation[] = [];
  for (const [personId, totalFraction] of totals) {
    if (totalFraction > 1 + EPSILON) {
      errors.push({ personId, personName: peopleById.get(personId)?.name ?? personId, totalFraction });
    }
  }
  return errors;
}

export interface UnallocatedPerson {
  personId: string;
  name: string;
  fte: number;
  allocatedFraction: number; // 0..1
  unallocatedFte: number; // (1 - allocatedFraction) * fte
}

// Active people with FTE not assigned to any Scope -- surfaced explicitly
// rather than silently absorbed, per the brief ("you have 1.5 FTE not
// assigned to anything").
export function unallocatedCapacity(people: PersonLike[], allocations: AllocationLike[]): UnallocatedPerson[] {
  const allocatedByPerson = new Map<string, number>();
  for (const a of allocations) {
    if (a.fraction <= 0) continue;
    allocatedByPerson.set(a.personId, (allocatedByPerson.get(a.personId) ?? 0) + a.fraction);
  }

  const result: UnallocatedPerson[] = [];
  for (const person of people) {
    if (!person.active) continue;
    const allocatedFraction = allocatedByPerson.get(person.id) ?? 0;
    const unallocatedFraction = Math.max(0, 1 - allocatedFraction);
    if (unallocatedFraction <= EPSILON) continue;
    result.push({
      personId: person.id,
      name: person.name,
      fte: person.fte,
      allocatedFraction,
      unallocatedFte: unallocatedFraction * person.fte,
    });
  }
  return result;
}
