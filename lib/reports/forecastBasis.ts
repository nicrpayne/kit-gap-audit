import type { ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { FORECAST_SEED } from "@/lib/forecast/scenarios";
import type { AllocationLike, PersonLike } from "@/lib/capacity/resolve";
import type { AcceptedCapabilityEstimate, CapabilityKnowledgeEstimate } from "@/lib/scope/knowledgeEstimates";
import { auditPassageHref } from "@/lib/scope/knowledgeEstimates";

/** Immutable record of the exact estimate assertion, not a pointer to today's
 * capability. Its original quote remains available after source supersession. */
export interface FrozenCapabilityEstimate {
  scopeId: string;
  capabilityId: string;
  capabilityName: string;
  capabilityRevision: number;
  /** `accepted` is retained for historical forecast-basis.v1 JSON. New
   * operator-reviewed assertions use `reviewed`; stale reviewed assertions
   * may be retained as qualified evidence with `review_required`. */
  authority: "accepted" | "provisional" | "reviewed" | "review_required";
  estimate: AcceptedCapabilityEstimate | CapabilityKnowledgeEstimate;
  replacedItemIds: string[];
  /** Additive v2 review evidence. Historical records legitimately omit it. */
  review?: {
    status: "reviewed" | "review_required";
    interpretation: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    coveredItemIds: string[];
    additionalItemIds: string[];
    usedInSimulation: boolean;
    reviewRequiredReason: string | null;
  };
  auditHref: string | null;
}

export interface FrozenForecastBasisV1 {
  version: "forecast-basis.v1";
  model: "triangular-pooled-calendar-finish-floor.v1";
  seed: number;
  trials: number;
  scopes: (Omit<ScopeSimulationSpec, "startDate" | "targetDate"> & { startDate: string; targetDate: string | null })[];
  capabilityEstimates: FrozenCapabilityEstimate[];
  /** Added after v1 shipped. Historical JSON legitimately has no capacity
   * closure; callers must not reconstruct one from today's owner state. */
  capacity?: FrozenForecastCapacityBasisV1;
}

export interface FrozenNamedCapacityPerson {
  id: string;
  name: string;
  fte: number;
  externalCommitmentFte: number;
  active: boolean;
}

export interface FrozenHypotheticalCapacityPerson extends FrozenNamedCapacityPerson {
  origin: "hypothetical-hire";
}

/** Exact capacity-side inputs that produced the effective FTE already stored
 * on each frozen simulation spec. This is evidence, not another input path. */
export interface FrozenForecastCapacityBasisV1 {
  version: "forecast-capacity-basis.v1";
  namedRoster: FrozenNamedCapacityPerson[];
  modeledAllocations: AllocationLike[];
  contextSwitchCostPct: number;
  hypotheticalHires: FrozenHypotheticalCapacityPerson[];
  aggregateOverridesByScope: Record<string, number>;
}

export interface ForecastCapacityBasisInput {
  namedRoster: PersonLike[];
  modeledAllocations: AllocationLike[];
  contextSwitchCostPct: number;
  hypotheticalHires?: (PersonLike & { origin?: "hypothetical-hire" })[];
  aggregateOverridesByScope?: Record<string, number>;
}

export function freezeForecastCapacityBasis(input: ForecastCapacityBasisInput): FrozenForecastCapacityBasisV1 {
  return JSON.parse(JSON.stringify({
    version: "forecast-capacity-basis.v1",
    namedRoster: input.namedRoster.map((person) => ({
      id: person.id,
      name: person.name,
      fte: person.fte,
      externalCommitmentFte: person.externalCommitmentFte ?? 0,
      active: person.active,
    })),
    modeledAllocations: input.modeledAllocations.map((allocation) => ({ ...allocation })),
    contextSwitchCostPct: input.contextSwitchCostPct,
    hypotheticalHires: (input.hypotheticalHires ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      fte: person.fte,
      externalCommitmentFte: person.externalCommitmentFte ?? 0,
      active: person.active,
      origin: "hypothetical-hire" as const,
    })),
    aggregateOverridesByScope: { ...(input.aggregateOverridesByScope ?? {}) },
  })) as FrozenForecastCapacityBasisV1;
}

export function freezeCapabilityEstimate(
  scopeId: string,
  capability: { id: string; name: string; revision: number },
  estimate: FrozenCapabilityEstimate["estimate"],
  replacedItemIds: string[],
  authority: FrozenCapabilityEstimate["authority"] = "accepted",
  review?: FrozenCapabilityEstimate["review"],
): FrozenCapabilityEstimate {
  return JSON.parse(JSON.stringify({
    scopeId, capabilityId: capability.id, capabilityName: capability.name,
    capabilityRevision: capability.revision, authority, estimate,
    replacedItemIds: [...new Set(replacedItemIds)].sort(),
    ...(review ? { review: {
      ...review,
      coveredItemIds: [...new Set(review.coveredItemIds)].sort(),
      additionalItemIds: [...new Set(review.additionalItemIds)].sort(),
    } } : {}),
    auditHref: auditPassageHref(scopeId, estimate),
  }));
}

/** Copy at computation time, before any later source or owner read. Never
 * reconstruct a historical report from current data. Scope ordering is kept
 * because it is part of the exact simulation input. */
export function freezeForecastBasis(
  specs: ScopeSimulationSpec[],
  capabilityEstimates: FrozenCapabilityEstimate[],
  capacity?: ForecastCapacityBasisInput,
): FrozenForecastBasisV1 {
  return JSON.parse(JSON.stringify({
    version: "forecast-basis.v1", model: "triangular-pooled-calendar-finish-floor.v1",
    seed: FORECAST_SEED, trials: 5000,
    scopes: specs.map((spec) => ({ ...spec, startDate: spec.startDate.toISOString(), targetDate: spec.targetDate?.toISOString() ?? null })),
    capabilityEstimates,
    ...(capacity ? { capacity: freezeForecastCapacityBasis(capacity) } : {}),
  })) as FrozenForecastBasisV1;
}

export function replayFrozenForecast(basis: FrozenForecastBasisV1) {
  if (basis.version !== "forecast-basis.v1" || basis.model !== "triangular-pooled-calendar-finish-floor.v1" || basis.seed !== FORECAST_SEED || basis.trials !== 5000) {
    throw new Error("This saved forecast requires its original model version; refusing to replay with different rules.");
  }
  return runPortfolioSimulation(basis.scopes.map((spec) => ({
    ...spec, startDate: new Date(spec.startDate), targetDate: spec.targetDate ? new Date(spec.targetDate) : null,
  })), basis.trials);
}
