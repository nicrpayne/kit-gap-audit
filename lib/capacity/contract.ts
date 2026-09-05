import { readChannel, workforceFte } from "@/lib/capacity/workforce";
import type { AllocationLike, PersonLike } from "@/lib/capacity/resolve";
import type { CapacitySource } from "@/lib/forecast/build";

export interface CapacityForecastContract {
  scopeId: string;
  workforceFte: number;
  namedRawFte: number;
  namedEffectiveFte: number;
  forecastEffectiveFte: number;
  source: CapacitySource;
  status: "named_exact" | "legacy_inferred_unstaffed" | "legacy_explicit_unstaffed";
  reconciles: boolean;
}

const sameFte = (a: number, b: number) => Math.abs(a - b) <= 1e-9;

/** One audit-ready statement of Capacity -> Forecast. Named allocations
 * are authoritative when they exist, and Forecast must consume their exact
 * effective sum. Legacy explicit/inferred scopes stay operational but are
 * explicitly NOT represented as reconciled named capacity. */
export function capacityForecastContract(
  scopeId: string,
  people: PersonLike[],
  allocations: AllocationLike[],
  contextSwitchCostPct: number,
  forecastEffectiveFte: number,
  source: CapacitySource
): CapacityForecastContract {
  const channel = readChannel({ people, allocations }, scopeId, contextSwitchCostPct);
  const named = source === "allocations";
  return {
    scopeId,
    workforceFte: workforceFte(people),
    namedRawFte: channel.raw,
    namedEffectiveFte: channel.effective,
    forecastEffectiveFte,
    source,
    status: named
      ? "named_exact"
      : source === "explicit"
        ? "legacy_explicit_unstaffed"
        : "legacy_inferred_unstaffed",
    reconciles: named && sameFte(channel.effective, forecastEffectiveFte),
  };
}

