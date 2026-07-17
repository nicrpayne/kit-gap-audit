import { runSimulation, type SimulationResult } from "./simulate";
import type { ForecastInputs } from "./build";

// Deterministic PRNG (mulberry32). Every scenario -- and the base run they
// are compared against -- uses the same seed, so a scenario's delta reflects
// the lever being tested, not Monte Carlo sampling noise. It also makes the
// forecast stable across refreshes for a given data state.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FORECAST_SEED = 0x5eed;

export interface Scenario {
  id: string;
  label: string;
  likelyDate: Date;
  deltaDays: number; // negative = sooner than the base likely date
  confidenceAtTarget: number | null;
}

function run(
  inputs: Pick<ForecastInputs, "items" | "gates">,
  teamCapacity: number,
  startDate: Date,
  targetDate: Date | null
): SimulationResult {
  return runSimulation(
    {
      items: inputs.items,
      gates: inputs.gates,
      teamCapacity,
      startDate,
      random: seededRandom(FORECAST_SEED),
    },
    targetDate
  );
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatCapacity(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Re-runs the simulation once per lever the team actually controls:
// resolving blocking decisions, adding people, and cutting the largest
// items from scope. Ordered as a narrative -- decide, staff, descope.
export function buildScenarios(
  inputs: ForecastInputs,
  startDate: Date,
  targetDate: Date | null
): { base: SimulationResult; scenarios: Scenario[] } {
  const base = run(inputs, inputs.teamCapacity, startDate, targetDate);
  const scenarios: Scenario[] = [];

  if (inputs.items.length === 0 && inputs.gates.length === 0) {
    return { base, scenarios };
  }

  if (inputs.gates.length > 0) {
    const result = run({ items: inputs.items, gates: [] }, inputs.teamCapacity, startDate, targetDate);
    scenarios.push({
      id: "resolve-decisions",
      label:
        inputs.gates.length === 1
          ? "Resolve the open blocking decision"
          : `Resolve all ${inputs.gates.length} blocking decisions`,
      likelyDate: result.likelyDate,
      deltaDays: daysBetween(base.likelyDate, result.likelyDate),
      confidenceAtTarget: result.confidenceAtTarget,
    });
  }

  for (const extra of [1, 2]) {
    const capacity = inputs.teamCapacity + extra;
    const result = run(inputs, capacity, startDate, targetDate);
    scenarios.push({
      id: `capacity-plus-${extra}`,
      label:
        extra === 1
          ? `Add one developer (capacity ${formatCapacity(capacity)})`
          : `Add two developers (capacity ${formatCapacity(capacity)})`,
      likelyDate: result.likelyDate,
      deltaDays: daysBetween(base.likelyDate, result.likelyDate),
      confidenceAtTarget: result.confidenceAtTarget,
    });
  }

  const topItems = [...inputs.items].sort((a, b) => b.likely - a.likely).slice(0, 3);
  for (const item of topItems) {
    const remaining = inputs.items.filter((i) => i.id !== item.id);
    const result = run({ items: remaining, gates: inputs.gates }, inputs.teamCapacity, startDate, targetDate);
    scenarios.push({
      id: `descope-${item.id}`,
      label: `Move "${truncate(item.label)}" out of scope`,
      likelyDate: result.likelyDate,
      deltaDays: daysBetween(base.likelyDate, result.likelyDate),
      confidenceAtTarget: result.confidenceAtTarget,
    });
  }

  return { base, scenarios };
}
