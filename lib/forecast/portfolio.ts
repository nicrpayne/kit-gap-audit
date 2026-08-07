import { sampleOwnDays, summarizeCompletionDays, type SimulationResult, type WorkItem, type DecisionGate } from "./simulate";
import { seededRandom, FORECAST_SEED } from "./scenarios";

export interface ScopeSimulationSpec {
  scopeId: string;
  items: WorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
  dependsOnScopeIds: string[];
  startDate: Date;
  targetDate: Date | null;
}

export class DependencyCycleError extends Error {
  cycle: string[];
  constructor(cycle: string[]) {
    super(`Circular Scope dependency: ${cycle.join(" -> ")}`);
    this.name = "DependencyCycleError";
    this.cycle = cycle;
  }
}

export class MissingDependencyError extends Error {
  scopeId: string;
  missingDependencyId: string;
  constructor(scopeId: string, missingDependencyId: string) {
    super(`Scope ${scopeId} depends on scope ${missingDependencyId}, which wasn't provided to runPortfolioSimulation`);
    this.name = "MissingDependencyError";
    this.scopeId = scopeId;
    this.missingDependencyId = missingDependencyId;
  }
}

// Depth-first topological sort (a visiting/done coloring) so every scope
// is ordered after everything it depends on -- used both to order trial
// processing WITHIN each single trial (below) and, degenerately, as the
// once-per-run scope order. Throws DependencyCycleError naming the exact
// cycle rather than looping forever or silently picking an arbitrary
// order, and MissingDependencyError if a scope names a dependency not
// present in the provided specs (the caller's job -- see
// lib/forecast/compute.ts -- is to have already collected the full
// transitive closure).
function topologicalOrder(specs: ScopeSimulationSpec[]): string[] {
  const byId = new Map(specs.map((s) => [s.scopeId, s]));
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];

  function visit(id: string, path: string[]) {
    const existing = state.get(id);
    if (existing === "done") return;
    if (existing === "visiting") throw new DependencyCycleError([...path, id]);

    const spec = byId.get(id);
    if (!spec) {
      const parent = path[path.length - 1];
      throw new MissingDependencyError(parent ?? id, id);
    }

    state.set(id, "visiting");
    for (const depId of spec.dependsOnScopeIds) {
      visit(depId, [...path, id]);
    }
    state.set(id, "done");
    order.push(id);
  }

  for (const spec of specs) visit(spec.scopeId, []);
  return order;
}

// The actual correlated-risk mechanism: a SINGLE outer loop of `trials`
// iterations shared across every scope in the dependency graph. Within
// each trial, scopes are processed in topological order and a
// dependency's day for THAT SAME trial is read directly out of the
// array being built for it -- not re-sampled, not looked up by a random
// index into a finished, sorted distribution. This is what makes "on
// trial 4,231, Platform drew a bad outcome" mean the same thing for
// every scope that depends on it, in that same trial: they all see it,
// together, because they're all still on trial 4,231 when they read it.
//
// A prior version ran each scope's FULL simulation to completion (all N
// trials, then sorted) before its dependents' simulations even began --
// structurally incapable of correlation, confirmed empirically (see
// ROADMAP.md): with realistically different-shaped dependent scopes,
// only ~1.5% of sorted-position pairs matched, and the ~27% that were
// "close" was a sorting artifact (small values cluster near the front of
// any ascending array), not real shared-scenario risk.
//
// Each scope gets its own dedicated seeded RNG stream for its OWN item/
// gate sampling (reproducible per scope, same FORECAST_SEED convention
// as every other simulation in this app) -- the correlation comes
// entirely from the shared trial index and direct array read, not from
// sharing a random stream across scopes.
export function runPortfolioTrials(specs: ScopeSimulationSpec[], trials = 5000): Map<string, number[]> {
  const byId = new Map(specs.map((s) => [s.scopeId, s]));
  const order = topologicalOrder(specs);

  const randomByScope = new Map(order.map((id) => [id, seededRandom(FORECAST_SEED)]));
  const daysByScope = new Map<string, number[]>(order.map((id) => [id, []]));

  for (let trial = 0; trial < trials; trial++) {
    for (const scopeId of order) {
      const spec = byId.get(scopeId)!;
      const random = randomByScope.get(scopeId)!;
      let days = sampleOwnDays(spec.items, spec.gates, spec.teamCapacity, random);
      for (const depId of spec.dependsOnScopeIds) {
        // Safe: topological order guarantees depId's array already has
        // this trial's entry pushed before scopeId is processed.
        const depDayThisTrial = daysByScope.get(depId)![trial];
        days = Math.max(days, depDayThisTrial);
      }
      daysByScope.get(scopeId)!.push(days);
    }
  }

  return daysByScope;
}

// Runs every Scope's simulation lockstep (see runPortfolioTrials) and
// summarizes each into the same SimulationResult shape a standalone
// runSimulation call produces. For a scope with zero dependencies this
// is provably identical to calling runSimulation directly with the same
// seed and trial count -- verified in ROADMAP.md.
export function runPortfolioSimulation(specs: ScopeSimulationSpec[], trials = 5000): Map<string, SimulationResult> {
  const byId = new Map(specs.map((s) => [s.scopeId, s]));
  const daysByScope = runPortfolioTrials(specs, trials);

  const results = new Map<string, SimulationResult>();
  for (const [scopeId, days] of daysByScope) {
    const spec = byId.get(scopeId)!;
    results.set(scopeId, summarizeCompletionDays(days, spec.items, spec.gates, spec.startDate, spec.targetDate));
  }
  return results;
}
