export type SourceCurrentness = "current" | "stale";

export interface CurrentnessReading {
  temporalRole: "live" | "historical";
  asOf: string;
  currentness: SourceCurrentness;
  ageDays: number;
}

export const DEFAULT_STALE_AFTER_DAYS = 7;
const DAY = 86_400_000;

/** Currentness is independent of ownership. A live owner read can still be stale. */
export function sourceCurrentness(
  asOf: string | Date,
  now: string | Date,
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
  temporalRole: CurrentnessReading["temporalRole"] = "live"
): CurrentnessReading {
  const asOfDate = new Date(asOf);
  const nowDate = new Date(now);
  const ageDays = Math.max(0, Math.floor((nowDate.getTime() - asOfDate.getTime()) / DAY));
  return {
    temporalRole,
    asOf: asOfDate.toISOString(),
    currentness: ageDays > staleAfterDays ? "stale" : "current",
    ageDays,
  };
}

export function currentnessLabel(reading: Pick<CurrentnessReading, "currentness" | "ageDays">): string {
  return reading.currentness === "stale" ? `Stale · ${reading.ageDays}d` : "Current";
}
