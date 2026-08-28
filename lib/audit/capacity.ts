// WHO IS CARRYING THIS PROJECT — read, never recomputed.
//
// CAPACITY IS EMBODIED. A Scope's capacity is the people allocated to it and
// nothing else (lib/capacity/workforce.ts states that as the product law).
// This file's whole job is to hand the graph what `resolveCapacity` already
// decided, so the number a Person node shows and the number the forecast
// receives cannot be two different calculations.
//
//   THERE IS NO CAPACITY MATH IN AUDIT.
//
// `scopeCount`, `switchFactor` and `effectiveFte` all come out of
// lib/capacity/resolve.ts unchanged. If the context-switch model changes, it
// changes in one place and this follows. A proof asserts every figure on a
// Person node equals the resolver's own output.
//
// ── WHY GLOBAL ALLOCATIONS ────────────────────────────────────────────
//
// The context-switch penalty is keyed on how many Scopes a person works
// across ANYWHERE, not on this Scope's rows. Sam Ortiz is JSA 0.6 and Design
// 0.4; reading only JSA's allocations would make Sam look undivided and
// overstate the effective FTE this project gets. So the resolver is handed
// every Allocation row, and the graph then keeps only what belongs to the
// Scope being audited.
//
// ── AND WHY THE GRAPH STAYS SCOPE-SHAPED ──────────────────────────────
//
//   THE GRAPH SHOWS THIS SCOPE. THE INSPECTOR EXPLAINS THE REST.
//
// Sam's Design allocation is what makes Sam's switch factor 0.88, so hiding
// it would leave a number nobody can check. But drawing a Design node inside
// a JSA audit would quietly turn a project instrument into a portfolio one.
// The other allocations therefore ride on the Person node as an attribute the
// inspector prints, and never as graph topology. A proof asserts no foreign
// Scope node appears.

import { resolveCapacity, type PersonLike, type AllocationLike } from "@/lib/capacity/resolve";

/** One Scope this person's time is committed to. Inspector context, not
    graph topology — see the note above. */
export interface PersonScopeAllocation {
  scopeId: string;
  scopeName: string;
  fraction: number;
  /** True for the Scope currently being audited. */
  current: boolean;
}

export interface ProjectedPerson {
  personId: string;
  /** A LABEL, NOT AN IDENTITY. "Person 07" and "Alice" are the same unit of
      capacity — which is exactly why this must never be joined to a Linear
      assignee. See the identity gap in docs/SIGNAL-GRAPH.md. */
  name: string;
  fte: number;
  active: boolean;
  /** Stands in for a legacy flat team-capacity number nobody attested. Shown,
      never hidden: how much of the workforce is inherited assumption rather
      than someone a human named is a fact about the plan. */
  synthetic: boolean;
  /** Share of this person's own time on the Scope being audited. */
  fraction: number;
  /** Distinct Scopes this person is allocated to, anywhere. */
  scopeCount: number;
  /** The resolver's own switch factor. 1 means no penalty. */
  switchFactor: number;
  /** fraction × fte × switchFactor — this Scope's actual take. */
  effectiveFte: number;
  /** Every Scope this person is committed to, current one included. */
  allocations: PersonScopeAllocation[];
  /** The portfolio setting the switch factor was computed from, so the
      inspector can name the assumption rather than presenting the result as
      a law of nature. */
  contextSwitchCostPct: number;
}

export interface CapacityInput {
  scopeId: string;
  people: (PersonLike & { synthetic: boolean })[];
  /** EVERY allocation row, not just this Scope's. */
  allocations: AllocationLike[];
  scopeNames: Map<string, string>;
  contextSwitchCostPct: number;
}

/**
 * The people carrying one Scope.
 *
 * WHICH PEOPLE APPEAR is not a rule this file invents: it is exactly
 * `resolveCapacity`'s own contributor set — active, allocated to this Scope,
 * fraction greater than zero. A person who is inactive, unallocated here, or
 * allocated at zero contributes no capacity, and a node for them would be a
 * mark on the field standing for nothing.
 *
 * Deterministic: sorted by person id, so two builds agree.
 */
export function projectPeople(input: CapacityInput): ProjectedPerson[] {
  const resolved = resolveCapacity(
    input.scopeId,
    input.people,
    input.allocations,
    input.contextSwitchCostPct
  );
  if (resolved.source !== "allocations") return [];

  const syntheticById = new Map(input.people.map((p) => [p.id, p.synthetic]));
  const activeById = new Map(input.people.filter((p) => p.active).map((p) => [p.id, p]));

  return resolved.contributors
    .map((c) => ({
      personId: c.personId,
      name: c.name,
      fte: c.fte,
      active: activeById.has(c.personId),
      synthetic: syntheticById.get(c.personId) ?? false,
      fraction: c.fraction,
      scopeCount: c.scopeCount,
      switchFactor: c.switchFactor,
      effectiveFte: c.effectiveFte,
      allocations: input.allocations
        .filter((a) => a.personId === c.personId && a.fraction > 0)
        .map((a) => ({
          scopeId: a.scopeId,
          scopeName: input.scopeNames.get(a.scopeId) ?? a.scopeId,
          fraction: a.fraction,
          current: a.scopeId === input.scopeId,
        }))
        .sort((a, b) => (a.current === b.current ? a.scopeName.localeCompare(b.scopeName) : a.current ? -1 : 1)),
      contextSwitchCostPct: input.contextSwitchCostPct,
    }))
    .sort((a, b) => a.personId.localeCompare(b.personId));
}
