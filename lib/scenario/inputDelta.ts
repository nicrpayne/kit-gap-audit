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
  startDate: Date;
  targetDate: Date | null;
}

// Reality + ScenarioInputDelta -> the exact ScopeSimulationSpec[] shape
// lib/forecast/portfolio.ts's runPortfolioSimulation takes. Pure -- calls
// the existing resolveCapacity (lib/capacity/resolve.ts) per scope rather
// than reimplementing any part of the capacity fallback chain.
//
// Passing a delta built from Reality's own saved allocations/people/
// contextSwitchCostPct (hypotheticalPeople: []) reproduces the baseline
// forecast exactly: resolveCapacity is the same pure function used
// originally to compute each Scope's stored `teamCapacity`, so re-running
// it here against the same saved inputs returns the same capacity number
// for the "allocations" and "explicit" fallback rungs, and the `??
// s.teamCapacity` fallback below reproduces the "inferred" rung without
// needing to re-infer anything.
export function applyScenarioInputDelta(
  scopes: ScenarioInputScope[],
  realityPeople: PersonLike[],
  delta: ScenarioInputDelta
): ScopeSimulationSpec[] {
  const people = [...realityPeople, ...delta.hypotheticalPeople];
  return scopes.map((s) => {
    const resolved = resolveCapacity(
      s.scopeId,
      s.explicitTeamCapacity,
      people,
      delta.allocations,
      delta.contextSwitchCostPct
    );
    return {
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates,
      teamCapacity: resolved.capacity ?? s.teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: s.startDate,
      targetDate: s.targetDate,
    };
  });
}
