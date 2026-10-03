import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import { resolveCapacity } from "@/lib/capacity/resolve";
import { clampSimulatedCapacity } from "@/lib/capacity/limits";
import { readChannel } from "@/lib/capacity/workforce";

/** Display the same finite workforce and allocation picture used by simulation.
 * Callers refuse invalid/stale plans before rendering their Scenario preview. */
export function scenarioCapacityDisplay(data: ProjectPayload, scenario: SuiteScenario, scopeId: string) {
  const plan = scenario.capacityPlan;
  const workforce = {
    people: [...data.people, ...(plan?.hypotheticalPeople ?? [])],
    allocations: plan?.allocations ?? data.allocations,
  };
  const switchCost = plan?.contextSwitchCostPct ?? scenario.contextSwitchCostPct ?? data.contextSwitchCostPct;
  const scope = data.scopes.find((s) => s.scopeId === scopeId)!;
  const override = plan ? undefined : scenario.capacityOverrideByScope[scopeId];
  const resolved = resolveCapacity(scopeId, workforce.people, workforce.allocations, switchCost);
  const capacity = override !== undefined ? clampSimulatedCapacity(override)
    : resolved.capacity ?? (scope.capacitySource === "allocations" ? 0 : scope.teamCapacity);
  const raw = readChannel(workforce, scopeId, switchCost).raw;
  const required = plan?.requiredByScope[scopeId] ?? (override === undefined ? 0 : Math.max(0, override - raw));
  return { capacity, channel: readChannel(workforce, scopeId, switchCost, required) };
}
