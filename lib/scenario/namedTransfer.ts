// Detects whether a real, named person's allocation differs between
// Reality and a scenario, and whether every Scope they'd end up on can
// truthfully represent that (see docs/SCENARIO-MODEL.md's "named-person
// transfer" section for the reasoning). Deliberately minimal: this
// answers exactly one question -- "did this person's allocation move,
// and can the touched Scopes represent that move" -- not a general diff/
// workflow engine. Used by the Portfolio Save flow to decide what's
// eligible to commit and to build the "why is this blocked" explanation;
// NOT used by the simulation/preview path, which has no opinion on
// persistability.

import type { AllocationLike } from "@/lib/capacity/resolve";
import type { CapacitySource } from "@/lib/forecast/build";

const EPSILON = 1e-6;

export interface NamedTransferScope {
  scopeId: string;
  name: string;
  capacitySource: CapacitySource;
}

export interface ScopeFractionChange {
  scopeId: string;
  scopeName: string;
  from: number;
  to: number;
  scopeCapacitySource: CapacitySource;
}

export interface NamedPersonMove {
  personId: string;
  personName: string;
  changes: ScopeFractionChange[];
  // false if ANY scope this person would end up on (to > 0) has an
  // aggregate (non-"allocations") capacitySource -- an aggregate number
  // has no enumerable roster, so committing a named person's presence
  // there would either fabricate identity information Reality doesn't
  // have, or silently discard the person's identity to fit the aggregate
  // number. Reducing/removing a person's fraction is always eligible
  // regardless of source, since a real person can only have had a
  // nonzero Reality fraction on a Scope that was ALREADY
  // allocations-sourced (an aggregate Scope has no real allocations by
  // definition), so a reduction never touches an aggregate Scope's
  // "to > 0" case.
  eligible: boolean;
  blockedReason: string | null;
}

// realityAllocations: Reality's saved Allocation rows (AllocationLike --
// personId/scopeId/fraction). scenarioAllocations: the scenario's final,
// complete allocation picture for REAL people ONLY -- the caller is
// responsible for excluding hypothetical/ghost personIds before calling
// this (this module has no opinion on what makes a person "real"; it
// just diffs whatever AllocationLike rows it's given against Reality's
// own, for the named people in `people`).
export function detectNamedPersonMoves(
  realityAllocations: AllocationLike[],
  scenarioAllocations: AllocationLike[],
  people: { id: string; name: string }[],
  scopes: NamedTransferScope[]
): NamedPersonMove[] {
  const scopeById = new Map(scopes.map((s) => [s.scopeId, s]));
  const moves: NamedPersonMove[] = [];

  for (const person of people) {
    const realityByScope = new Map<string, number>();
    for (const a of realityAllocations) {
      if (a.personId === person.id) realityByScope.set(a.scopeId, a.fraction);
    }
    const scenarioByScope = new Map<string, number>();
    for (const a of scenarioAllocations) {
      if (a.personId === person.id) scenarioByScope.set(a.scopeId, a.fraction);
    }

    const touchedScopeIds = new Set([...realityByScope.keys(), ...scenarioByScope.keys()]);
    const changes: ScopeFractionChange[] = [];
    for (const scopeId of touchedScopeIds) {
      const from = realityByScope.get(scopeId) ?? 0;
      const to = scenarioByScope.get(scopeId) ?? 0;
      if (Math.abs(to - from) <= EPSILON) continue;
      const scope = scopeById.get(scopeId);
      if (!scope) continue; // defensive: an unknown scopeId shouldn't reach here
      changes.push({ scopeId, scopeName: scope.name, from, to, scopeCapacitySource: scope.capacitySource });
    }

    if (changes.length === 0) continue;

    const blockedOn = changes.filter((c) => c.to > EPSILON && c.scopeCapacitySource !== "allocations");
    const eligible = blockedOn.length === 0;
    const blockedReason = eligible
      ? null
      : `${person.name} would move onto ${blockedOn.map((c) => c.scopeName).join(", ")}, which ${
          blockedOn.length === 1 ? "isn't" : "aren't"
        } tracked at the person level yet (capacity is a single aggregate number there) -- can't commit this without either fabricating who else makes up that number, or discarding that ${person.name} is specifically the one who moved.`;

    moves.push({ personId: person.id, personName: person.name, changes, eligible, blockedReason });
  }

  return moves;
}
