const PRESENTATION_NUMBER_SCALE = 1_000_000_000;

type ReportJsonWithForecastBasis = {
  forecast?: { basis?: unknown };
};

const exactJsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Apply the report's established display-number normalization at the JSON
 * persistence boundary without rewriting the immutable forecast input
 * closure. The basis is replay evidence: allocation fractions, estimate
 * ranges, and simulation specs must retain the exact numbers captured by the
 * forecast, even when presentation fields are rounded for stable rendering.
 */
export function normalizeReportJsonForPersistence<T extends ReportJsonWithForecastBasis>(value: T): T {
  const normalized = JSON.parse(JSON.stringify(value, (_key, candidate) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.round(candidate * PRESENTATION_NUMBER_SCALE) / PRESENTATION_NUMBER_SCALE
      : candidate
  )) as T;
  const basis = value.forecast?.basis;
  if (basis !== undefined && normalized.forecast) {
    normalized.forecast.basis = exactJsonClone(basis);
  }
  return normalized;
}
