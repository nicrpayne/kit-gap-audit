// The one place the Instrument's capacity bounds are defined, and the
// reasoning behind them.
//
// WHY ZERO IS NOT OFFERED. The engine divides effort by capacity
// (`effort / capacity` in sampleOwnDays, lib/forecast/simulate.ts) and
// guards that division with:
//
//     const capacity = teamCapacity > 0 ? teamCapacity : 1;
//
// So a capacity of 0 is not "nobody works on this, therefore never" -- it
// is silently rewritten to 1 FTE and produces a perfectly ordinary
// one-person forecast. Offering 0 on a control would therefore show the
// user a number that is not the number being simulated, which is exactly
// the class of quiet lie this instrument exists to avoid. Until "nobody is
// working on this" has a real modelled meaning, the control stops short of
// zero and says why.
//
// 0.1 FTE is the smallest value that is both engine-safe (strictly
// positive, so it is never coerced) and honest at the control's own
// resolution -- it matches the Capacity fader's fine-adjust step, so every
// reachable position is a value the simulation actually receives.
export const MIN_SIMULATED_CAPACITY = 0.1;

// Clamp a hypothetical capacity into the range the engine can simulate
// truthfully. Only ever applied to SCENARIO values -- Reality's own
// resolution (lib/capacity/resolve.ts) is untouched by this.
export function clampSimulatedCapacity(fte: number): number {
  if (!Number.isFinite(fte)) return MIN_SIMULATED_CAPACITY;
  return Math.max(MIN_SIMULATED_CAPACITY, fte);
}

// The Capacity fader's upper bound for a Scope. Twice Reality, so Reality
// always sits at the MIDDLE of the throw and there is as much room to ask
// "what if we had less" as "what if we had more" -- the whole point of the
// control being bidirectional.
//
// The absolute floor of 2 exists for genuinely small scopes: a fixed
// 8-FTE ceiling put a 0.4-FTE scope's Reality at 5% of the travel, where
// every useful adjustment is a few pixels and the notch is unreachable by
// eye. It never truncates a real value, since the ceiling can only exceed
// Reality.
export function maxSimulatedCapacity(realityCapacity: number): number {
  return Math.max(2, Math.ceil(realityCapacity * 2));
}
