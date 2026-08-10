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
import type { ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import type { WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import type { CapacitySource } from "@/lib/forecast/build";

export interface ScenarioInputDelta {
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
// The branch below is keyed on s.capacitySource -- Reality's OWN,
// scenario-independent source for this Scope -- not on whether a given
// allocation entry belongs to a real or hypothetical person. That
// distinction matters: a scope's authoritative source must never flip
// merely because the scenario introduces an allocation-shaped change,
// whether that change is a net-new hypothetical person or an existing
// real person moved in from another scope. Both are handled identically
// here, additively, once the Scope is aggregate-sourced.
//
// - capacitySource === "allocations": Reality already tracks this Scope
//   at person level, so every allocation-shaped change (real reallocation
//   AND net-new hypothetical people) is folded into ONE resolveCapacity
//   call against the full current allocation picture -- identical to how
//   this always worked, and correct, because there's no aggregate number
//   at risk of being silently discarded.
// - capacitySource === "explicit" | "inferred": Reality is an aggregate
//   number with no enumerable contributor list. s.teamCapacity (the
//   already-resolved aggregate baseline) is preserved untouched, and a
//   SECOND resolveCapacity call -- with explicitTeamCapacity forced to
//   null so it can never itself resolve to "explicit" -- computes only
//   the scenario's ADDITIVE contribution for this one Scope, correctly
//   switch-cost-adjusted (it still receives the full, unfiltered,
//   cross-scope delta.allocations array, so a multi-scope contributor's
//   switchFactor is computed from their whole picture, not a per-scope
//   slice). That contribution is added on top of the preserved baseline.
//
// Passing a delta built from Reality's own saved allocations/people/
// contextSwitchCostPct (hypotheticalPeople: []) reproduces the baseline
// forecast exactly in both branches -- see docs/SCENARIO-MODEL.md for the
// proof.
export function applyScenarioInputDelta(
  scopes: ScenarioInputScope[],
  realityPeople: PersonLike[],
  delta: ScenarioInputDelta
): ScopeSimulationSpec[] {
  const people = [...realityPeople, ...delta.hypotheticalPeople];
  return scopes.map((s) => {
    let teamCapacity: number;
    if (s.capacitySource === "allocations") {
      const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, people, delta.allocations, delta.contextSwitchCostPct);
      teamCapacity = resolved.capacity ?? s.teamCapacity;
    } else {
      const additive = resolveCapacity(s.scopeId, null, people, delta.allocations, delta.contextSwitchCostPct);
      teamCapacity = s.teamCapacity + (additive.capacity ?? 0);
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
