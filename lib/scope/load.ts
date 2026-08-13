// THE LOAD — what a release actually weighs, in the only unit that matters.
//
// Scope's central object is built entirely from this module, and every visual
// property it drives is derived here rather than chosen for effect. The one
// idea it rests on is exact, not a metaphor:
//
//   The simulation's own arithmetic is  Σ(item draw) / capacity + Σ(gate draw)
//   (see sampleOwnDays, lib/forecast/simulate.ts).
//
// Effort is divided by capacity; decision delay is not. The sum is linear in
// the items, so one work item's expected contribution to the schedule is
// exactly `mean(its range) / capacity` DAYS -- a separable share that falls
// out of the engine's own arithmetic, not an attribution we invented. That
// number is what the instrument draws, and it is why cutting an item can be
// shown as removing a measured piece of the schedule rather than as a vague
// "less work".
//
// Two quantities are kept deliberately separate, because conflating them is
// what makes scope-cutting feel dishonest in every other tool:
//
//   LOAD      what we have committed to carry, in days. Always shrinks when
//             you cut. Deterministic: Σ mean/capacity + Σ gate mean.
//   LANDING   where the simulation says it lands. Comes from 5000 trials, and
//             may not move at all when you cut, because a dependency's own
//             completion or a serial decision can dominate it.
//
// Showing both on one axis is the whole design: you watch the load shrink and
// see, physically, whether the date came with it.

import type { ScopeWorkItem } from "@/lib/instrument/useProject";
import type { DecisionGate, SimulationResult } from "@/lib/forecast/simulate";

export interface ThreePointRange {
  low: number;
  likely: number;
  high: number;
}

// An item's EXPECTED contribution, not its headline number. The simulation
// draws from the whole triangle, whose mean is (low + likely + high) / 3 --
// for a right-skewed range like the 1-3-7 day placeholder that is 3.7 days,
// not 3. Drawing slabs at the likely value instead would make every column
// fall systematically short of its own simulated date, and that shortfall
// would be indistinguishable from the real thing this instrument exists to
// show: a load that has stopped being what sets the date.
function expectedDays(r: ThreePointRange): number {
  return (r.low + r.likely + r.high) / 3;
}

export interface Stratum {
  item: ScopeWorkItem;
  /** The range actually being simulated -- the stored one, or the scenario's. */
  range: ThreePointRange;
  overridden: boolean;
  excluded: boolean;
  /** Days of schedule this item is expected to cost: mean of its range ÷ capacity. */
  days: number;
  /** How unsure that is, in the same unit: (high - low) / capacity. */
  spreadDays: number;
  /** Share of the included load, 0-1. Undefined meaning for an excluded item. */
  share: number;
}

export interface LoadComposition {
  capacity: number;
  /** Included work, heaviest first -- rank IS the reading order. */
  strata: Stratum[];
  /** Taken out in this Scenario. Kept, never discarded. */
  out: Stratum[];
  /** Σ days over included items: the divisible work. */
  workDays: number;
  /** Σ expected gate days: serial delay that capacity cannot divide. */
  decisionDays: number;
  /** workDays + decisionDays: everything this scope is carrying. */
  loadDays: number;
  /** Widest single-item spread, for scaling the silhouette. */
  maxSpreadDays: number;
}

function rangeFor(
  item: ScopeWorkItem,
  overrides: Record<string, ThreePointRange>
): { range: ThreePointRange; overridden: boolean } {
  const o = overrides[item.id];
  if (!o) return { range: { low: item.low, likely: item.likely, high: item.high }, overridden: false };
  return { range: o, overridden: true };
}

export function composeLoad(
  items: ScopeWorkItem[],
  gates: DecisionGate[],
  capacity: number,
  excludedItemIds: Set<string>,
  resolvedGateIds: Set<string>,
  estimateOverrides: Record<string, ThreePointRange>
): LoadComposition {
  // Mirrors sampleOwnDays' own guard: capacity is never allowed to be zero
  // there either, so the division shown here is the division performed.
  const cap = capacity > 0 ? capacity : 1;

  const all: Stratum[] = items.map((item) => {
    const { range, overridden } = rangeFor(item, estimateOverrides);
    return {
      item,
      range,
      overridden,
      excluded: excludedItemIds.has(item.id),
      days: expectedDays(range) / cap,
      spreadDays: Math.max(0, range.high - range.low) / cap,
      share: 0,
    };
  });

  const strata = all.filter((s) => !s.excluded).sort((a, b) => b.days - a.days || a.item.id.localeCompare(b.item.id));
  const out = all.filter((s) => s.excluded).sort((a, b) => b.days - a.days || a.item.id.localeCompare(b.item.id));

  const workDays = strata.reduce((sum, s) => sum + s.days, 0);
  for (const s of strata) s.share = workDays > 0 ? s.days / workDays : 0;

  // Gates are serial: capacity does not divide them. Same expected-value
  // reading as the work above, for the same reason.
  const decisionDays = gates
    .filter((g) => !resolvedGateIds.has(g.id))
    .reduce((sum, g) => sum + expectedDays(g), 0);

  return {
    capacity: cap,
    strata,
    out,
    workDays,
    decisionDays,
    loadDays: workDays + decisionDays,
    maxSpreadDays: Math.max(0.0001, ...all.map((s) => s.spreadDays)),
  };
}

// What cutting scope in this instrument cannot reach. `floor` is a real
// simulation of this scope with every one of its work items removed (see
// useProject's floorByScope), so this reports a measured result rather than
// a rule of thumb about dependencies.
export interface Dominance {
  /** Where the scope lands today, in days from the run's start date. */
  landingDays: number;
  /** Where it would still land with an empty backlog. */
  floorDays: number;
  /** The most that cutting every remaining item could still buy. */
  headroomDays: number;
  /** True when the backlog is no longer what sets the date. */
  dominated: boolean;
  /** Named causes, from the model -- never guessed. */
  causes: { kind: "decisions" | "dependency"; label: string }[];
  /** The causes as a readable clause, e.g. "it waits on Platform". Built here
      so the canvas, the macro strip and the Comparison tool cannot describe
      the same fact three slightly different ways. Empty when nothing outside
      the backlog is holding this scope. */
  phrase: string;
}

export function readDominance(
  landing: SimulationResult,
  floor: SimulationResult | null | undefined,
  startDate: Date,
  gates: DecisionGate[],
  resolvedGateIds: Set<string>,
  dependencyNames: string[]
): Dominance | null {
  if (!floor) return null;
  const toDays = (d: Date) => (d.getTime() - startDate.getTime()) / 86400000;
  const landingDays = toDays(landing.likelyDate);
  const floorDays = toDays(floor.likelyDate);
  const headroomDays = Math.max(0, landingDays - floorDays);

  const causes: Dominance["causes"] = [];
  const openGates = gates.filter((g) => !resolvedGateIds.has(g.id));
  const clauses: string[] = [];
  if (dependencyNames.length > 0) {
    for (const name of dependencyNames) causes.push({ kind: "dependency", label: name });
    clauses.push(`it waits on ${dependencyNames.join(" and ")}`);
  }
  if (openGates.length > 0) {
    const n = openGates.length;
    causes.push({ kind: "decisions", label: `${n} open decision${n === 1 ? "" : "s"}` });
    clauses.push(`${n} open decision${n === 1 ? " has" : "s have"} to be settled first`);
  }

  return {
    landingDays,
    floorDays,
    headroomDays,
    phrase: clauses.join(", and "),
    // Under a day of headroom means the backlog has stopped being the thing
    // that decides. Rounded to whole days because that is the resolution the
    // date is actually reported at.
    dominated: floorDays > 0.5 && Math.round(headroomDays) <= 0,
    causes,
  };
}

// THE YARDSTICK. The depth axis is pinned to REALITY and may grow to hold a
// bigger hypothetical, but never shrinks to flatter a smaller one -- if the
// axis rescaled on every cut, a shorter load would redraw the same length and
// the instrument would show nothing happening. Same lesson as the Forecast
// object's framing rule: the frame is not allowed to hide the movement.
export function axisDepthDays(reality: { loadDays: number; landingDays: number }, scenarioLoadDays: number): number {
  const pinned = Math.max(reality.loadDays, reality.landingDays, 1);
  // The 1.14 is headroom, not padding: the landing readout is set BELOW its
  // own rule, and a date that runs off the bottom of the stage is the one
  // number this instrument may never lose.
  return Math.max(pinned, scenarioLoadDays) * 1.14;
}
