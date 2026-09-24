import { runSimulation, type DecisionGate, type SimulationResult, type WorkItem } from "./simulate";
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

export interface ScenarioVariant {
  id: string;
  label: string;
  items: WorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
}

function run(
  inputs: { items: WorkItem[]; gates: DecisionGate[] },
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

// Describes the controlled changes once, separately from how a forecast is
// executed. Standalone scopes and dependency graphs can then evaluate the
// exact same levers against their respective canonical model.
export function buildScenarioVariants(
  inputs: { items: WorkItem[]; gates: DecisionGate[]; teamCapacity: number }
): ScenarioVariant[] {
  if (inputs.items.length === 0 && inputs.gates.length === 0) return [];

  const variants: ScenarioVariant[] = [];
  if (inputs.gates.length > 0) {
    variants.push({
      id: "resolve-decisions",
      label:
        inputs.gates.length === 1
          ? "Resolve the open blocking decision"
          : `Resolve all ${inputs.gates.length} blocking decisions`,
      items: inputs.items,
      gates: [],
      teamCapacity: inputs.teamCapacity,
    });
  }

  for (const extra of [1, 2]) {
    const capacity = inputs.teamCapacity + extra;
    variants.push({
      id: `capacity-plus-${extra}`,
      label:
        extra === 1
          ? `Add one developer (capacity ${formatCapacity(capacity)})`
          : `Add two developers (capacity ${formatCapacity(capacity)})`,
      items: inputs.items,
      gates: inputs.gates,
      teamCapacity: capacity,
    });
  }

  const topItems = [...inputs.items].sort((a, b) => b.likely - a.likely).slice(0, 3);
  for (const item of topItems) {
    variants.push({
      id: `descope-${item.id}`,
      label: `Move "${truncate(item.label)}" out of scope`,
      items: inputs.items.filter((i) => i.id !== item.id),
      gates: inputs.gates,
      teamCapacity: inputs.teamCapacity,
    });
  }
  return variants;
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
  const scenarios = buildScenarioVariants(inputs).map((variant) => {
    const result = run(
      { items: variant.items, gates: variant.gates },
      variant.teamCapacity,
      startDate,
      targetDate
    );
    return {
      id: variant.id,
      label: variant.label,
      likelyDate: result.likelyDate,
      deltaDays: daysBetween(base.likelyDate, result.likelyDate),
      confidenceAtTarget: result.confidenceAtTarget,
    };
  });

  return { base, scenarios };
}
