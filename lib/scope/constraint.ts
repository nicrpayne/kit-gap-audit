// WHAT CUTTING SCOPE CANNOT REACH.
//
// Scope's job is composing the product, not explaining the date -- but one
// truth has to survive the move to a feature-level instrument: sometimes
// taking a capability out of the release changes nothing, because a
// dependency's own completion or an unsettled decision is what is really
// holding it. V1 made that the organising principle of the whole screen,
// which was too much. Here it is an OUTPUT: one line in the release readout,
// and one paragraph in Feature Detail.
//
// `floor` is a real simulation of the scope with every one of its work items
// removed, so this reports a measured result rather than a rule of thumb
// about dependencies.

import type { DecisionGate, SimulationResult } from "@/lib/forecast/simulate";

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
