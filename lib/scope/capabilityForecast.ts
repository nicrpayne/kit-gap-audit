import { runSimulation, type ThreePoint as ForecastRange } from "@/lib/forecast/simulate";
import { seededRandom } from "@/lib/forecast/scenarios";
import { toDateOnly } from "@/lib/time/dateContract";

export interface CapabilityStaffingContributor {
  personId: string;
  name: string;
  fte: number;
}

/**
 * A Scenario-only staffing assumption for one capability. It is deliberately
 * not an Allocation: Allocations answer which project owns a person's time,
 * while this answers how much of that already-owned project capacity is
 * assumed to stay focused on one capability for an isolated outlook.
 */
export interface CapabilityStaffingPlan {
  contributors: CapabilityStaffingContributor[];
}

export interface CapabilityForecastOutlook {
  staffingFte: number;
  earliestDate: string;
  likelyDate: string;
  latestDate: string;
  likelyScheduleDays: number;
  confidenceAtTarget: number | null;
}

function seedFor(value: string): number {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

export function staffingFte(plan: CapabilityStaffingPlan | null | undefined): number {
  return (plan?.contributors ?? []).reduce((sum, contributor) => sum + contributor.fte, 0);
}

/**
 * Forecast one capability on the same Monte Carlo engine as the release,
 * with a stable capability-specific seed so re-rendering never moves dates.
 * This is intentionally isolated: it does not assert ordering or simultaneous
 * availability across other capability cards.
 */
export function forecastCapability(
  capabilityId: string,
  range: ForecastRange,
  staffing: CapabilityStaffingPlan | null | undefined,
  startDate: Date,
  targetDate: Date | null,
): CapabilityForecastOutlook | null {
  const fte = staffingFte(staffing);
  if (!(fte > 0) || range.high <= 0) return null;
  const result = runSimulation({
    items: [{ id: capabilityId, label: capabilityId, ...range }],
    gates: [],
    teamCapacity: fte,
    startDate,
    trials: 5_000,
    random: seededRandom(seedFor(capabilityId)),
  }, targetDate);
  const day = 86_400_000;
  return {
    staffingFte: fte,
    earliestDate: toDateOnly(result.earliestDate),
    likelyDate: toDateOnly(result.likelyDate),
    latestDate: toDateOnly(result.latestDate),
    likelyScheduleDays: Math.max(0, Math.round(((result.likelyDate.getTime() - startDate.getTime()) / day) * 10) / 10),
    confidenceAtTarget: result.confidenceAtTarget,
  };
}
