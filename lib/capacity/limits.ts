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

// THE FADER'S RANGE IS A DISPLAY PROPERTY, NOT A MODEL LIMIT.
//
// There is no maximum capacity in the model. The engine is numerically
// valid at any finite positive capacity (`effort / capacity`), so the
// instrument must never refuse "what would it take?" -- knowing that even
// 25 FTE misses the date is exactly the kind of answer this tool exists to
// give. The only real constraint is the floor above, which exists because
// the engine genuinely mistreats zero.
//
// What the two functions below decide is only how much of the number line
// the physical throw currently spans.

// The resting range: twice Reality, so Reality sits at the MIDDLE of the
// throw and there is as much room to ask "what if we had less" as "what if
// we had more". The floor of 2 is for genuinely small scopes -- a fixed
// 8-FTE ceiling put a 0.4-FTE scope's Reality at 5% of the travel, where
// every useful adjustment was a few pixels.
export function nominalMaxCapacity(realityCapacity: number): number {
  return Math.max(2, Math.ceil(realityCapacity * 2));
}

// Rounds up to a readable ceiling with at least one step of headroom, so a
// value typed past the resting range still has somewhere to sit rather than
// being pinned against the top of the slot.
function ceilingFor(value: number): number {
  const step = value <= 10 ? 1 : value <= 50 ? 5 : value <= 200 ? 10 : 50;
  const rounded = Math.ceil(value / step) * step;
  return rounded > value ? rounded : rounded + step;
}

// The range the fader should actually span right now: its resting range,
// widened only as far as the current value requires. Because this is derived
// from the value rather than stored, clearing the scenario (double-click
// Reset) automatically collapses the range back to resting -- there is no
// separate "expanded" state that could get stuck.
export function faderMaxCapacity(realityCapacity: number, currentValue: number): number {
  return Math.max(nominalMaxCapacity(realityCapacity), currentValue > 0 ? ceilingFor(currentValue) : 0);
}

// Validation for a directly typed scenario capacity. Rejects NaN/Infinity
// and anything under the engine floor; deliberately imposes NO upper bound.
// Rounded to 2dp so the number shown is exactly the number simulated.
export function parseCapacityInput(raw: string): number | null {
  const v = Number(raw.trim());
  if (!Number.isFinite(v)) return null;
  if (v < MIN_SIMULATED_CAPACITY) return null;
  return Math.round(v * 100) / 100;
}

// Up to 2dp, but never fewer than 1, so 28 reads "28.0", 13.5 reads "13.5"
// and a typed 28.25 reads "28.25" instead of being rounded away.
export function formatCapacity(v: number): string {
  return v.toFixed(2).replace(/0$/, "");
}
