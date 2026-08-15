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

import {
  resolveCapacity,
  type PersonLike,
  type AllocationLike,
  type CapacityResolution,
} from "@/lib/capacity/resolve";
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
  // Scopes to simulate at a DIFFERENT allocation resolution than Reality
  // currently declares -- "what would Platform be if we tracked it by name
  // instead of as 10 FTE?". This is how the conversion preview gets its
  // number: through the same engine, on the same path, rather than a
  // bespoke calculation that could disagree with what committing does.
  // Changes no Reality; omitted = simulate every Scope as declared.
  resolutionOverrideByScope?: Record<string, CapacityResolution>;
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
  // Reality's OWN resolved capacity source for this Scope, BEFORE anything
  // in this scenario is applied. Reported for display; the math below keys
  // on capacityResolution instead.
  capacitySource: CapacitySource;
  // Reality's DECLARED allocation resolution for this Scope. A scenario
  // never changes it implicitly: introducing an allocation-shaped entry
  // must not be able to switch how a Scope is modelled, which is what made
  // "+1 developer" move a date the wrong way. Only an explicit
  // resolutionOverrideByScope entry simulates the other resolution.
  capacityResolution: CapacityResolution;
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
// ONE POOL, TWO RESOLUTIONS -- NEVER A SUM.
//
// An earlier version of this function added a scenario's named
// allocations ON TOP OF an aggregate Scope's team estimate, so dragging
// one person onto a 10 FTE Platform previewed 10.5 FTE. That invented
// half a person. Worse, it was unpersistable and disagreed with what
// Reality would have resolved to (0.5), so the preview was answering a
// different question from the one Commit would record.
//
// The corrected rule matches how humans actually work: a team is a team,
// however precisely we happen to describe it. So the branch below reads
// the Scope's DECLARED resolution and consults exactly one description:
//
// - "named": the roster IS the capacity. resolveCapacity sums the
//   scenario's allocations for this Scope, switch-cost-adjusted against
//   the full cross-scope picture (so a multi-scope contributor's
//   switchFactor reflects their whole week, not a per-scope slice). The
//   dormant team estimate is not consulted.
// - "team": the estimate IS the capacity, and allocation-shaped entries
//   in the scenario are ignored for this Scope entirely -- there is no
//   roster here to move someone into. Moving a person here is not a
//   capacity change, it is a request to change how the Scope is modelled,
//   which is what resolutionOverrideByScope exists to preview.
//
// Passing a delta built from Reality's own saved allocations/people/
// contextSwitchCostPct reproduces the baseline forecast exactly in both
// branches -- see docs/SCENARIO-MODEL.md.
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
    const resolution = delta.resolutionOverrideByScope?.[s.scopeId] ?? s.capacityResolution;
    if (override !== undefined) {
      teamCapacity = clampSimulatedCapacity(override);
    } else if (resolution === "named") {
      const resolved = resolveCapacity(
        s.scopeId,
        s.explicitTeamCapacity,
        people,
        delta.allocations,
        delta.contextSwitchCostPct,
        "named"
      );
      // An empty roster is 0, not a quiet fall back to the dormant
      // estimate. Callers refuse to commit that state rather than
      // simulating a team that isn't there (see hasEmptyNamedRoster).
      teamCapacity = resolved.capacity ?? 0;
    } else {
      teamCapacity = s.teamCapacity;
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
