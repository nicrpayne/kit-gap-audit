// Monte Carlo release-date simulation. Pure and DB/network-free so it's
// easy to reason about and (later) unit test in isolation.

export interface ThreePoint {
  low: number;
  likely: number;
  high: number;
}

export interface WorkItem extends ThreePoint {
  id: string;
  label: string;
}

// An open, blocking decision: modeled as a serial delay (time-to-decide)
// added on top of parallel work, not divided by team capacity -- a
// decision doesn't get faster with more developers.
export interface DecisionGate extends ThreePoint {
  id: string;
  label: string;
}

export interface SimulationInput {
  items: WorkItem[];
  gates: DecisionGate[];
  teamCapacity: number; // parallel "developer equivalents"; must be > 0
  trials?: number;
  startDate?: Date;
  now?: () => number; // injectable for tests
  random?: () => number; // injectable for tests
}

export interface SimulationResult {
  likelyDate: Date;
  earliestDate: Date;
  latestDate: Date;
  confidenceAtTarget: number | null; // 0-100, null if no target date given
  remainingEffortDays: ThreePoint;
  decisionDelayDays: ThreePoint;
  // Full sorted trial outcomes (calendar days from startDate). A pure
  // output for display/inspection (e.g. a future histogram) -- NOT used
  // for cross-scope dependency modeling; that reads raw, unsorted,
  // trial-index-aligned data instead (see portfolio.ts's
  // runPortfolioTrials), since sorting destroys which trial produced
  // which value.
  completionDaysSorted: number[];
  percentiles: { p10: number; p50: number; p70: number; p85: number; p90: number };
}

// Samples one value from a triangular(low, mode, high) distribution via
// inverse CDF. Clamps malformed inputs (mode outside [low, high], or
// high < low) rather than throwing -- estimate parsing upstream is
// heuristic and shouldn't be able to crash the simulation.
export function sampleTriangular(low: number, mode: number, high: number, random: () => number = Math.random): number {
  let a = low;
  let b = high;
  let c = mode;
  if (b < a) [a, b] = [b, a];
  c = Math.min(Math.max(c, a), b);
  if (b === a) return a;

  const u = random();
  const modeFraction = (c - a) / (b - a);
  if (u < modeFraction) {
    return a + Math.sqrt(u * (b - a) * (c - a));
  }
  return b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Math.round(days));
  return result;
}

function sumThreePoint(points: ThreePoint[]): ThreePoint {
  return points.reduce(
    (acc, p) => ({ low: acc.low + p.low, likely: acc.likely + p.likely, high: acc.high + p.high }),
    { low: 0, likely: 0, high: 0 }
  );
}

// One trial's worth of "this scope's own days" -- item effort (divided
// across capacity) plus serial decision delay. Exported so
// lib/forecast/portfolio.ts's lockstep loop can call it once per scope
// per trial directly, instead of running each scope's full N-trial
// simulation to completion before a dependent can see any of it (which
// is what made cross-scope correlation structurally impossible before
// this function existed -- see ROADMAP.md).
export function sampleOwnDays(
  items: ThreePoint[],
  gates: ThreePoint[],
  teamCapacity: number,
  random: () => number
): number {
  const capacity = teamCapacity > 0 ? teamCapacity : 1;
  let effort = 0;
  for (const item of items) {
    effort += sampleTriangular(item.low, item.likely, item.high, random);
  }
  let decisionDelay = 0;
  for (const gate of gates) {
    decisionDelay += sampleTriangular(gate.low, gate.likely, gate.high, random);
  }
  return effort / capacity + decisionDelay;
}

// Turns a raw (any order) array of per-trial completion days into the
// full percentile/date summary. Split out from runSimulation so
// portfolio.ts's lockstep loop -- which collects its own per-scope
// arrays trial-by-trial across multiple scopes at once -- can reuse the
// exact same summarization instead of duplicating it.
export function summarizeCompletionDays(
  completionDays: number[],
  items: ThreePoint[],
  gates: ThreePoint[],
  startDate: Date,
  targetDate?: Date | null
): SimulationResult {
  const sorted = [...completionDays].sort((a, b) => a - b);

  const percentiles = {
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p70: percentile(sorted, 70),
    p85: percentile(sorted, 85),
    p90: percentile(sorted, 90),
  };

  let confidenceAtTarget: number | null = null;
  if (targetDate && sorted.length > 0) {
    const targetDays = (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const withinTarget = sorted.filter((d) => d <= targetDays).length;
    confidenceAtTarget = Math.round((withinTarget / sorted.length) * 100);
  }

  return {
    likelyDate: addDays(startDate, percentiles.p50),
    earliestDate: addDays(startDate, percentiles.p10),
    latestDate: addDays(startDate, percentiles.p90),
    confidenceAtTarget,
    remainingEffortDays: sumThreePoint(items),
    decisionDelayDays: sumThreePoint(gates),
    completionDaysSorted: sorted,
    percentiles,
  };
}

export function runSimulation(input: SimulationInput, targetDate?: Date | null): SimulationResult {
  const trials = input.trials ?? 5000;
  const random = input.random ?? Math.random;
  const startDate = input.startDate ?? new Date();

  const completionDays: number[] = [];
  for (let i = 0; i < trials; i++) {
    completionDays.push(sampleOwnDays(input.items, input.gates, input.teamCapacity, random));
  }

  return summarizeCompletionDays(completionDays, input.items, input.gates, startDate, targetDate);
}
