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
  // One array per Scope this simulation depends on, each the OTHER
  // scope's own completionDaysSorted from its already-run simulation
  // (see lib/forecast/portfolio.ts). Per trial, a random index is drawn
  // from each array (empirical bootstrap) and this scope's own days for
  // that trial become max(own, every drawn dependency day) -- "can't
  // finish before what you depend on finishes," the same idea as
  // DecisionGate's serial delay, applied at scope granularity. Absent or
  // empty (true for every call site before this field existed) leaves
  // the trial loop byte-for-byte what it always was.
  dependencySamples?: number[][];
}

export interface SimulationResult {
  likelyDate: Date;
  earliestDate: Date;
  latestDate: Date;
  confidenceAtTarget: number | null; // 0-100, null if no target date given
  remainingEffortDays: ThreePoint;
  decisionDelayDays: ThreePoint;
  // Full sorted trial outcomes (calendar days from startDate), exposed so
  // a dependent scope's simulation can bootstrap-sample from this one --
  // see dependencySamples above. Not used by any existing caller.
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

export function runSimulation(input: SimulationInput, targetDate?: Date | null): SimulationResult {
  const trials = input.trials ?? 5000;
  const capacity = input.teamCapacity > 0 ? input.teamCapacity : 1;
  const random = input.random ?? Math.random;
  const startDate = input.startDate ?? new Date();

  const dependencySamples = input.dependencySamples?.filter((s) => s.length > 0) ?? [];
  const completionDays: number[] = [];

  for (let i = 0; i < trials; i++) {
    let effort = 0;
    for (const item of input.items) {
      effort += sampleTriangular(item.low, item.likely, item.high, random);
    }
    let decisionDelay = 0;
    for (const gate of input.gates) {
      decisionDelay += sampleTriangular(gate.low, gate.likely, gate.high, random);
    }
    let calendarDays = effort / capacity + decisionDelay;
    for (const depSamples of dependencySamples) {
      const draw = depSamples[Math.floor(random() * depSamples.length)];
      calendarDays = Math.max(calendarDays, draw);
    }
    completionDays.push(calendarDays);
  }

  completionDays.sort((a, b) => a - b);

  const percentiles = {
    p10: percentile(completionDays, 10),
    p50: percentile(completionDays, 50),
    p70: percentile(completionDays, 70),
    p85: percentile(completionDays, 85),
    p90: percentile(completionDays, 90),
  };

  let confidenceAtTarget: number | null = null;
  if (targetDate) {
    const targetDays = (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const withinTarget = completionDays.filter((d) => d <= targetDays).length;
    confidenceAtTarget = Math.round((withinTarget / trials) * 100);
  }

  return {
    likelyDate: addDays(startDate, percentiles.p50),
    earliestDate: addDays(startDate, percentiles.p10),
    latestDate: addDays(startDate, percentiles.p90),
    confidenceAtTarget,
    remainingEffortDays: sumThreePoint(input.items),
    decisionDelayDays: sumThreePoint(input.gates),
    completionDaysSorted: completionDays,
    percentiles,
  };
}
