// The one canonical representation of "what's different from Reality" for
// every INPUT-SIDE scenario lever that exists today (allocations,
// hypothetical people, context-switch cost) -- the part of a future
// Scenario that actually changes what gets simulated. Deliberately named
// ScenarioInputDelta, not ScenarioDelta or ScenarioState: a saved scenario
// will eventually also need an evaluation/target context (a target date,
// judged against an already-simulated distribution -- see
// docs/SCENARIO-MODEL.md), and that does NOT belong in this type. Keeping
// this narrow to only what feeds the simulation engine leaves the
// evaluation half somewhere clean to live later instead of overloading
// this one with two different kinds of "difference from Reality."
//
// This module replaces what used to be two independently hand-maintained
// implementations of the same transform: PortfolioPageClient.tsx's local
// specsFor() (client-side, drives the live drag preview) and
// POST /api/portfolio/preview's inline spec-building (server-side). Both
// now call applyScenarioInputDelta below instead of rebuilding
// ScopeSimulationSpec[] themselves.

import { resolveCapacity, type PersonLike, type AllocationLike } from "@/lib/capacity/resolve";
import { clampSimulatedCapacity } from "@/lib/capacity/limits";
import type { ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import type { WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import type { CapacitySource } from "@/lib/forecast/build";

export interface ScenarioInputDelta {
  // AGGREGATE CAPACITY SCENARIO, per Scope: "simulate this Scope as though
  // its total effective capacity were N FTE." When present for a Scope this
  // REPLACES the entire capacity resolution chain for that Scope, in that
  // hypothetical only -- allocations, explicit override and assignee
  // inference are all bypassed, and Reality is not modified in any way.
  //
  // This is deliberately a separate concept from allocations/
  // hypotheticalPeople below, not a clever encoding on top of them. The two
  // answer different questions:
  //
  //   NAMED PERSON REALLOCATION -- "move Sam from Platform to JSA"
  //     -> allocations / hypotheticalPeople. Knows WHO. Commits to real
  //        Allocation rows.
  //   AGGREGATE CAPACITY SCENARIO -- "what if Platform had 7 FTE"
  //     -> capacityOverrideByScope. Deliberately does NOT know who, and
  //        must never be read as "remove a specific person."
  //
  // Encoding a downward move as a negative person was considered and
  // rejected: there is no such thing as a person with negative time, the
  // arithmetic only coincidentally works, and it would have made the
  // commit path claim knowledge of named people it does not have. Keeping
  // the aggregate case as its own field is also what leaves room for the
  // future Resource Mixer to own the named-person case properly.
  //
  // Values are clamped to MIN_SIMULATED_CAPACITY (see lib/capacity/limits.ts).
  // Omitted entirely (or an empty object) = no aggregate override anywhere,
  // which reproduces the pre-existing behaviour exactly.
  capacityOverrideByScope?: Record<string, number>;
  // The COMPLETE hypothetical allocation set to simulate against -- not a
  // diff layered on top of saved allocations. This matches how the
  // allocation grid and POST /api/portfolio/preview already treat
  // "preview" (the full current state of every slider): passing a
  // Scope's saved allocations here, mapped to AllocationLike, reproduces
  // the baseline exactly -- see applyScenarioInputDelta below.
  allocations: AllocationLike[];
  // People who don't exist as a real Person row (yet) -- e.g. an
  // exploratory "+1 developer" click before Save. Empty for the baseline.
  hypotheticalPeople: PersonLike[];
  contextSwitchCostPct: number;
}

// Everything applyScenarioInputDelta needs about one Scope that ISN'T part
// of the delta itself: its own simulation inputs, plus the two rungs of
// the capacity fallback chain this module can't resolve on its own.
export interface ScenarioInputScope {
  scopeId: string;
  items: WorkItem[];
  gates: DecisionGate[];
  dependsOnScopeIds: string[];
  // A Scope's own explicit teamCapacity override, or null.
  explicitTeamCapacity: number | null;
  // The already-fully-resolved fallback value from
  // lib/forecast/compute.ts's buildScopeSimInputs -- which may itself be
  // inferred from distinct Linear assignees. Used only when this delta
  // gives the Scope neither a real allocation nor an explicit override;
  // re-deriving THAT inference would need Linear issue data this pure,
  // isomorphic module deliberately doesn't have.
  teamCapacity: number;
  // Reality's OWN capacity source for this Scope, computed from Reality's
  // saved allocations/explicit value/inference -- BEFORE anything in this
  // scenario is applied. This is the fact that decides how a scenario's
  // allocation-shaped changes may be applied (see applyScenarioInputDelta
  // below); it never changes as a result of the scenario itself, which is
  // exactly the invariant that fixes the "+1 developer makes the date
  // later" bug: a scenario must not be able to switch a Scope's
  // authoritative capacity source merely by introducing an allocation-
  // shaped entry.
  capacitySource: CapacitySource;
  startDate: Date;
  targetDate: Date | null;
}

// Reality + ScenarioInputDelta -> the exact ScopeSimulationSpec[] shape
// lib/forecast/portfolio.ts's runPortfolioSimulation takes. Pure -- calls
// the existing resolveCapacity (lib/capacity/resolve.ts) per scope rather
// than reimplementing any part of the capacity fallback chain -- and
// NEVER changes resolveCapacity's own fallback semantics, which stay
// correct for authoritative Reality (see docs/SCENARIO-MODEL.md).
//
// ONE POOL, ONE BRANCH. Capacity is embodied (lib/capacity/workforce.ts):
// a Scope's capacity is the people on it, so the scenario's allocation set
// is simply resolved the same way Reality's is. Hypothetical people are
// people too -- a scenario that hires puts real capacity in the pool for
// the duration of the hypothetical, and it flows through the identical
// path.
//
// An earlier version branched on whether a Scope was "aggregate" or
// "person-level", and ADDED a scenario's named allocations on top of an
// aggregate Scope's flat number. That invented humans: dragging one person
// onto a 10 FTE Platform previewed 11 FTE. It was also unpersistable, so
// the preview answered a different question from the one Commit recorded.
// There is no aggregate number left to add to, and no branch to get wrong.
//
// Passing a delta built from Reality's own saved allocations/people/
// contextSwitchCostPct reproduces the baseline forecast exactly -- see
// docs/SCENARIO-MODEL.md.
export function applyScenarioInputDelta(
  scopes: ScenarioInputScope[],
  realityPeople: PersonLike[],
  delta: ScenarioInputDelta
): ScopeSimulationSpec[] {
  const people = [...realityPeople, ...delta.hypotheticalPeople];
  const overrides = delta.capacityOverrideByScope ?? {};
  return scopes.map((s) => {
    let teamCapacity: number;
    // An aggregate capacity scenario short-circuits the whole fallback
    // chain for this Scope: the user asked to simulate a specific total, so
    // that total is what gets simulated, whatever Reality's source is. This
    // is the one sanctioned way to bypass resolveCapacity, and it applies
    // to the hypothetical only -- Reality is never rewritten to achieve it.
    const override = overrides[s.scopeId];
    if (override !== undefined) {
      teamCapacity = clampSimulatedCapacity(override);
    } else {
      const resolved = resolveCapacity(s.scopeId, people, delta.allocations, delta.contextSwitchCostPct);
      teamCapacity = resolved.capacity ?? s.teamCapacity;
    }
    return {
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates,
      teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: s.startDate,
      targetDate: s.targetDate,
    };
  });
}
