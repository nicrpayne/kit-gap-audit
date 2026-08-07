import { runSimulation, type SimulationResult, type WorkItem, type DecisionGate } from "./simulate";
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

// Depth-first topological sort (Kahn's-alternative via a visiting/done
// coloring) so every scope is simulated only after everything it depends
// on. Throws DependencyCycleError naming the exact cycle rather than
// looping forever or silently picking an arbitrary order, and
// MissingDependencyError if a scope names a dependency not present in
// the provided specs (the caller's job -- see lib/forecast/compute.ts --
// is to have already collected the full transitive closure).
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

// Runs every Scope's simulation exactly once, in dependency order,
// threading each dependency's own completionDaysSorted into its
// dependents' trial loops (see simulate.ts's dependencySamples) -- so a
// diamond dependency (A and B both depending on C) draws from the SAME
// simulated C, not two independently-simulated copies of it. Every
// scope's own simulation uses a freshly-seeded FORECAST_SEED generator,
// same as every other simulation in this app: reproducible across
// recomputes for a given data state, at the deliberate cost of not
// modeling true statistical independence between scopes that share
// people -- a stated approximation, not a hidden one (see ROADMAP.md).
export function runPortfolioSimulation(specs: ScopeSimulationSpec[]): Map<string, SimulationResult> {
  const byId = new Map(specs.map((s) => [s.scopeId, s]));
  const order = topologicalOrder(specs);

  const results = new Map<string, SimulationResult>();
  for (const scopeId of order) {
    const spec = byId.get(scopeId)!;
    const dependencySamples = spec.dependsOnScopeIds
      .map((depId) => results.get(depId)?.completionDaysSorted)
      .filter((s): s is number[] => !!s);

    const result = runSimulation(
      {
        items: spec.items,
        gates: spec.gates,
        teamCapacity: spec.teamCapacity,
        startDate: spec.startDate,
        random: seededRandom(FORECAST_SEED),
        dependencySamples,
      },
      spec.targetDate
    );
    results.set(scopeId, result);
  }
  return results;
}
