import type { SimulationResult } from "@/lib/forecast/simulate";
import type { ForecastSnapshot } from "@/lib/timeline/entries";

interface ForecastReadingBase {
  id: string;
  scopeId: string;
  asOf: string;
  earliestDate: string;
  likelyDate: string;
  latestDate: string;
  targetDate: string | null;
  confidenceAtTarget: number | null;
}

export type TimelineForecastReading =
  | (ForecastReadingBase & { temporalRole: "live"; source: "Forecast" })
  | (ForecastReadingBase & { temporalRole: "historical"; source: "Report snapshot"; reportId: string });

export function liveForecastReading(
  scopeId: string,
  asOf: string,
  result: SimulationResult,
  targetDate: string | null
): TimelineForecastReading {
  return {
    id: `live:${scopeId}`,
    scopeId,
    asOf,
    temporalRole: "live",
    source: "Forecast",
    earliestDate: result.earliestDate.toISOString(),
    likelyDate: result.likelyDate.toISOString(),
    latestDate: result.latestDate.toISOString(),
    targetDate,
    confidenceAtTarget: result.confidenceAtTarget,
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
    earliestDate: snapshot.earliestDate,
    likelyDate: snapshot.likelyDate,
    latestDate: snapshot.latestDate,
    targetDate: snapshot.targetDate,
    confidenceAtTarget: snapshot.confidenceAtTarget,
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

