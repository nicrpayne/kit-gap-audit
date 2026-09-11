import type { SimulationResult } from "@/lib/forecast/simulate";
import type { ForecastSnapshot } from "@/lib/timeline/entries";
import { sourceCurrentness, type SourceCurrentness } from "@/lib/truth/currentness";
import { toDateOnly } from "@/lib/time/dateContract";

interface ForecastReadingBase {
  id: string;
  scopeId: string;
  asOf: string;
  earliestDate: string;
  likelyDate: string;
  latestDate: string;
  targetDate: string | null;
  confidenceAtTarget: number | null;
  currentness: SourceCurrentness;
  ageDays: number;
}

export type TimelineForecastReading =
  | (ForecastReadingBase & { temporalRole: "live"; source: "Forecast" })
  | (ForecastReadingBase & { temporalRole: "historical"; source: "Report snapshot"; reportId: string });

export function liveForecastReading(
  scopeId: string,
  asOf: string,
  result: SimulationResult,
  targetDate: string | null,
  now: string = asOf
): TimelineForecastReading {
  const freshness = sourceCurrentness(asOf, now);
  return {
    id: `live:${scopeId}`,
    scopeId,
    asOf,
    temporalRole: "live",
    source: "Forecast",
    earliestDate: toDateOnly(result.earliestDate),
    likelyDate: toDateOnly(result.likelyDate),
    latestDate: toDateOnly(result.latestDate),
    targetDate: targetDate ? toDateOnly(targetDate) : null,
    confidenceAtTarget: result.confidenceAtTarget,
    currentness: freshness.currentness,
    ageDays: freshness.ageDays,
  };
}

export function historicalForecastReading(snapshot: ForecastSnapshot): TimelineForecastReading {
  return {
    id: `report:${snapshot.reportId}`,
    reportId: snapshot.reportId,
    scopeId: snapshot.scopeId,
    asOf: snapshot.generatedAt,
    temporalRole: "historical",
    source: "Report snapshot",
    earliestDate: toDateOnly(snapshot.earliestDate),
    likelyDate: toDateOnly(snapshot.likelyDate),
    latestDate: toDateOnly(snapshot.latestDate),
    targetDate: snapshot.targetDate ? toDateOnly(snapshot.targetDate) : null,
    confidenceAtTarget: snapshot.confidenceAtTarget,
    currentness: "current",
    ageDays: 0,
  };
}

/** At NOW, absence of a live read is an honest empty state. Historical
 * memory must never be substituted and relabelled as current. */
export function forecastReadingForTime(
  atNow: boolean,
  live: TimelineForecastReading | null,
  historical: ForecastSnapshot | null
): TimelineForecastReading | null {
  if (atNow) return live?.temporalRole === "live" ? live : null;
  return historical ? historicalForecastReading(historical) : null;
}
