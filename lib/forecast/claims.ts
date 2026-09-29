import type { ForecastCoverageContract } from "./coverage";

/**
 * Presentation-only forecast semantics. This module never changes simulation
 * inputs or outputs; it controls which claims those outputs are allowed to
 * support once coverage is known.
 */

export const FORECAST_PERCENTILE_COPY = {
  interval: "P10–P90 interval · middle 80% of simulated outcomes",
  p10: "10% of simulated finishes are on or before this date",
  p50: "Median · half on or before, half after",
  p90: "90% of simulated finishes are on or before this date; 10% later",
  fullRange: "Minimum–maximum across all simulated runs",
} as const;

export interface ForecastAssumptionItem {
  id:
    | "estimate_mapping"
    | "remaining_work"
    | "calendar"
    | "pooled_capacity"
    | "serial_gates"
    | "dependency_finish_floors"
    | "risk_streams";
  label: string;
  detail: string;
}

export interface ForecastAssumptionSnapshot {
  version: "forecast-assumptions.v1";
  items: ForecastAssumptionItem[];
}

const FORECAST_ASSUMPTION_ITEMS: readonly ForecastAssumptionItem[] = [
  {
    id: "risk_streams",
    label: "Risk sampling",
    detail: "Own work and gate risks use independent deterministic streams keyed by project and item. Unchanged work shares samples across Reality and Scenario; dependents share the same upstream outcome in each trial. Frequencies are model outputs, not calibrated real-world probabilities.",
  },
  {
    id: "estimate_mapping",
    label: "Estimate mapping",
    detail: "Linear points map to low/likely/high effort days at 0.7× / 1× / 1.6×. Work without an estimate uses 1 / 3 / 7 effort days.",
  },
  {
    id: "remaining_work",
    label: "Remaining work",
    detail: "Each open-ticket estimate is used as remaining work in full; an in-progress status does not apply a completion discount. Completed, canceled, and represented parent items are excluded.",
  },
  {
    id: "calendar",
    label: "Calendar",
    detail: "Modeled durations are added as calendar days. Weekends, holidays, leave, and a working calendar are not modeled.",
  },
  {
    id: "pooled_capacity",
    label: "Pooled capacity",
    detail: "Item effort is summed and divided by pooled effective FTE. This is not a task-level resource scheduler and does not model skills, assignments, sequencing, or work-in-progress limits.",
  },
  {
    id: "serial_gates",
    label: "Serial gates",
    detail: "Open Decision-gate delay is added after capacity is applied and is not reduced by adding FTE.",
  },
  {
    id: "dependency_finish_floors",
    label: "Dependency finish floors",
    detail: "A declared dependency sets a completion floor: own work may proceed concurrently, and each run finishes at the later of the project's own outcome and the upstream outcome.",
  },
];

/** Return a copy suitable for freezing into an immutable report payload. */
export function forecastAssumptionSnapshot(): ForecastAssumptionSnapshot {
  return {
    version: "forecast-assumptions.v1",
    items: FORECAST_ASSUMPTION_ITEMS.map((item) => ({ ...item })),
  };
}

export interface ForecastDeliveryClaimInput {
  scopeName: string;
  coverage: ForecastCoverageContract;
  likelyDate: string | null;
  targetDate?: string | null;
  confidenceAtTarget?: number | null;
}

export interface ForecastDeliveryClaim {
  state: ForecastCoverageContract["state"];
  badge: string;
  outcome: string;
  targetConfidence: string;
  detail: string | null;
  accessibleLabel: string;
  exposesOutcome: boolean;
  exposesProjectConfidence: boolean;
}

export function presentForecastDeliveryClaim(input: ForecastDeliveryClaimInput): ForecastDeliveryClaim {
  const { coverage } = input;
  if (coverage.state === "unavailable") {
    const detail = coverage.reason ?? coverage.caveat;
    return {
      state: coverage.state,
      badge: "FORECAST UNAVAILABLE",
      outcome: "Delivery outcome unavailable",
      targetConfidence: "Project target confidence unavailable",
      detail,
      accessibleLabel: [input.scopeName, "delivery outcome unavailable", detail].filter(Boolean).join(". "),
      exposesOutcome: false,
      exposesProjectConfidence: false,
    };
  }

  if (coverage.state === "modeled_subset") {
    const outcome = input.likelyDate ? `Modeled subset ~${input.likelyDate}` : "Modeled subset outcome unavailable";
    const detail = coverage.reason ?? coverage.caveat;
    return {
      state: coverage.state,
      badge: "FORECAST INCOMPLETE",
      outcome,
      targetConfidence: "Project target confidence unavailable — incomplete coverage",
      detail,
      accessibleLabel: [input.scopeName, outcome, "not a full-project delivery forecast", detail].filter(Boolean).join(". "),
      exposesOutcome: Boolean(input.likelyDate),
      exposesProjectConfidence: false,
    };
  }

  const outcome = input.likelyDate ? `Likely ${input.likelyDate}` : "Delivery outcome unavailable";
  const targetConfidence = input.targetDate && input.confidenceAtTarget !== null && input.confidenceAtTarget !== undefined
    ? `${input.confidenceAtTarget}% by ${input.targetDate} under these assumptions; simulated frequency, not a measured real-world probability`
    : input.targetDate
      ? "Target confidence unavailable"
      : "No target date set";
  return {
    state: coverage.state,
    badge: coverage.label,
    outcome,
    targetConfidence,
    detail: null,
    accessibleLabel: [input.scopeName, "canonical delivery forecast", outcome, targetConfidence].join(". "),
    exposesOutcome: Boolean(input.likelyDate),
    exposesProjectConfidence: input.confidenceAtTarget !== null && input.confidenceAtTarget !== undefined,
  };
}

export interface PortfolioDeliveryClaim {
  state: "forecastable" | "incomplete" | "unavailable";
  headline: string;
  detail: string;
  accessibleLabel: string;
  incompleteScopeNames: string[];
}

export function presentPortfolioDeliveryClaim(input: {
  likelyDate: string | null;
  scopes: { name: string; coverage: ForecastCoverageContract }[];
}): PortfolioDeliveryClaim {
  const incomplete = input.scopes.filter((scope) => !scope.coverage.canonicalForecast);
  const incompleteScopeNames = incomplete.map((scope) => scope.name);
  if (incomplete.length > 0) {
    const allUnavailable = incomplete.every((scope) => scope.coverage.state === "unavailable");
    const headline = allUnavailable && incomplete.length === input.scopes.length
      ? "Portfolio forecast unavailable"
      : "Portfolio forecast incomplete";
    const detail = `${incompleteScopeNames.join(", ")} ${incomplete.length === 1 ? "does" : "do"} not have complete delivery coverage; no all-project landing date is claimed.`;
    return {
      state: allUnavailable && incomplete.length === input.scopes.length ? "unavailable" : "incomplete",
      headline,
      detail,
      accessibleLabel: `${headline}. ${detail}`,
      incompleteScopeNames,
    };
  }

  const headline = input.likelyDate ? `Portfolio lands ${input.likelyDate}` : "Portfolio forecast unavailable";
  const detail = input.likelyDate
    ? "Latest P50 date across projects with complete delivery coverage."
    : "No modeled delivery outcome is available.";
  return {
    state: input.likelyDate ? "forecastable" : "unavailable",
    headline,
    detail,
    accessibleLabel: `${headline}. ${detail}`,
    incompleteScopeNames: [],
  };
}

export function presentStructuralConstraints(gateLabels: string[], dependencyNames: string[]): {
  summary: string;
  detail: string;
} {
  if (gateLabels.length === 0 && dependencyNames.length === 0) {
    return {
      summary: "No declared serial gates or dependency finish floors",
      detail: "The model has no declared structural delay beyond the modeled work and capacity assumptions.",
    };
  }
  const parts = [
    gateLabels.length ? `${gateLabels.length} serial ${gateLabels.length === 1 ? "gate" : "gates"}` : null,
    dependencyNames.length ? `finish ${dependencyNames.length === 1 ? "floor" : "floors"} · ${dependencyNames.join(", ")}` : null,
  ].filter((part): part is string => Boolean(part));
  const summary = gateLabels.length === 0 && dependencyNames.length === 1
    ? `Dependency finish floor · ${dependencyNames[0]}`
    : parts.join(" · ");
  const details = [
    gateLabels.length ? "Serial gate delay is added to the scope's modeled duration." : null,
    dependencyNames.length
      ? "For each dependency, own work may proceed concurrently; each run finishes at the later of the two outcomes."
      : null,
  ].filter((part): part is string => Boolean(part));
  return { summary, detail: details.join(" ") };
}
