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

// CAPACITY IS EMBODIED. A Scope's capacity is the people allocated to it,
// and nothing else -- see lib/capacity/workforce.ts for the product law.
//
// Scope.teamCapacity is NO LONGER consulted here. It was a second,
// disembodied way to say how big a team is, and holding both meant the
// portfolio could claim more capacity than it had humans (a 10 FTE flat
// number on one Scope plus a 3 FTE roster on another is not 13 people, it
// is one team described twice and one described properly). The column
// survives for rollback and history; scripts/migrate-embodied-capacity.ts
// converts each legacy number into the anonymous units it stood for, so
// this function returns the same figure it used to.
//
// A Scope with no allocations at all resolves to null, and
// buildForecastInputs still falls back to inferring from Linear assignees
// -- the correct behaviour for a Scope nobody has staffed yet.
export function resolveCapacity(
  scopeId: string,
  people: PersonLike[],
  allocations: AllocationLike[],
  contextSwitchCostPct: number
): ResolvedCapacity {
  const activeById = new Map(people.filter((p) => p.active).map((p) => [p.id, p]));
  const scopeCounts = countScopesPerPerson(allocations);

  const relevant = allocations.filter(
    (a) => a.scopeId === scopeId && a.fraction > 0 && activeById.has(a.personId)
  );

  if (relevant.length > 0) {
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
    const capacity = contributors.reduce((sum, c) => sum + c.effectiveFte, 0);
    return { capacity, source: "allocations", contributors };
  }

  return { capacity: null, source: null, contributors: [] };
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
