import type { SuiteScenario } from "@/lib/instrument/useProject";

/** Explicit recovery for a Capacity plan that produces no simulated change.
    Keep every independent Scenario lever staged; only remove the inert plan
    and its backward-compatible projections. */
export function removeUnchangedCapacityAssumption(scenario: SuiteScenario): SuiteScenario {
  return {
    ...scenario,
    capacityPlan: null,
    capacityOverrideByScope: {},
    contextSwitchCostPct: null,
  };
}
