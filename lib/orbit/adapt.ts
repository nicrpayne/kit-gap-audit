// FROM THE SUITE'S TRUTH TO ORBIT'S INPUT.
//
// One function, and it is deliberately boring. Every value it hands to
// buildOrbitGraph is either copied verbatim from the project payload or
// produced by calling the SAME function the owning instrument calls:
//
//   capabilities  composeFeatures(...)  — exactly Scope's call, same order
//   capacity      readChannel(...)      — exactly Portfolio's call
//   distribution  the maps useProject already holds
//   gates         the rows /api/decisions already returns
//
// Nothing is recomputed a second way. If a number here ever disagrees with
// the instrument that owns it, that is a bug in this file, not a difference
// of opinion — which is the property that makes Orbit safe to draw.
//
// PURE: no fetch, no clock, no store. It takes the payload and returns the
// input, so it can be proven without a browser.

import { composeFeatures } from "@/lib/scope/features";
import { readChannel } from "@/lib/capacity/workforce";
import { clampSimulatedCapacity } from "@/lib/capacity/limits";
import type { SimulationResult } from "@/lib/forecast/simulate";
import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import type { DecisionRow } from "@/lib/decisions/model";
import type { OrbitInput, OrbitScopeInput, OrbitGateInput } from "./graph";

export interface OrbitAdaptInput {
  data: ProjectPayload;
  scenario: SuiteScenario;
  scenarioActive: boolean;
  /** Every Decision as /api/decisions returns it, gate included. Empty is
      legitimate — it means no Decision has been connected to delivery, and
      Orbit will draw no gates rather than invent one. */
  decisions: DecisionRow[];
  /** What the centre shows: the Scenario's simulation, or Reality's when no
      Scenario is set. useProject's `preview`. */
  preview: Map<string, SimulationResult>;
  /** Reality's own, for the ghost. useProject's `baseline`. */
  baseline: Map<string, SimulationResult>;
  focusScopeId: string;
}

/**
 * Returns null when the payload cannot yet answer — no start date, or the
 * focus scope has no simulation. A half-built graph would be a lie with a
 * shape, so there isn't one.
 */
export function adaptOrbitInput(i: OrbitAdaptInput): OrbitInput | null {
  const { data, scenario, decisions, preview, baseline, focusScopeId } = i;
  const startDate = new Date(data.startDate);
  if (Number.isNaN(startDate.getTime())) return null;
  if (!preview.has(focusScopeId)) return null;

  const switchCostPct = scenario.contextSwitchCostPct ?? data.contextSwitchCostPct;
  const workforce = {
    people: data.people,
    allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
  };

  const scopes: OrbitScopeInput[] = [];
  for (const s of data.scopes) {
    const sim = preview.get(s.scopeId);
    if (!sim) continue;

    // Scope's own call, argument for argument. A capability's load must be
    // the same number on both surfaces or the release means two things.
    const capacity = scenario.capacityOverrideByScope[s.scopeId] ?? s.teamCapacity;
    const composition = composeFeatures(
      s.items,
      s.completedWork,
      capacity,
      scenario.bypassedFeatureIds,
      scenario.estimateOverrideByItemId,
      scenario.draftFeatures,
      scenario.acceptedCandidateIds
    );

    // PEOPLE ARE NOT MANUFACTURED HERE. readChannel reads the real roster.
    // An aggregate Scenario asking for more than the roster holds shows up
    // as `required` — capacity asked for and not found — which is exactly
    // what Portfolio does with the same call. Orbit never invents a body to
    // make a number work.
    const realityRaw = readChannel(workforce, s.scopeId, switchCostPct).raw;
    const override = scenario.capacityOverrideByScope[s.scopeId];
    const required = override === undefined ? 0 : Math.max(0, override - realityRaw);
    const channel = readChannel(workforce, s.scopeId, switchCostPct, required);

    const realitySim = baseline.get(s.scopeId) ?? null;
    scopes.push({
      scopeId: s.scopeId,
      name: s.name,
      targetDate: s.targetDate ? new Date(s.targetDate) : null,
      dependsOnScopeIds: s.dependsOnScopeIds,
      composition,
      channel,
      sim,
      // The ghost exists only when there is something to compare against.
      realitySim: i.scenarioActive ? realitySim : null,
      // Clamped HERE with the engine's own helper, so the number Orbit
      // shows is the number applyScenarioInputDelta will simulate — not the
      // raw value someone typed.
      simulatedTotal: override === undefined ? null : clampSimulatedCapacity(override),
      // Copied straight from the payload: which rung of the engine's own
      // capacity fallback chain this scope is standing on.
      capacityBasis: s.capacitySource,
      teamCapacity: s.teamCapacity,
    });
  }

  // A GATE IS THE ONLY WAY A DECISION IS HERE.
  //
  // The portfolio payload's gate list carries id/label/low/likely/high but
  // drops decisionId, so the decision a gate belongs to is read from the
  // Decisions payload, which already joins them. No new table, no new
  // endpoint, and no guessing by matching labels.
  const gates: OrbitGateInput[] = [];
  for (const d of decisions) {
    if (!d.gate) continue;
    gates.push({
      gateId: d.gate.id,
      decisionId: d.id,
      decisionTitle: d.title,
      decisionStatus: d.status,
      targetScopeId: d.gate.targetScopeId,
      low: d.gate.low,
      likely: d.gate.likely,
      high: d.gate.high,
      serial: d.gate.serial,
      dependency: d.gate.dependency,
      evidenceForGate: d.gate.evidenceForGate,
      evidenceCount: d.evidence.length,
    });
  }

  return {
    focusScopeId,
    startDate,
    scopes,
    gates,
    scenarioActive: i.scenarioActive,
    // THE EXISTING LEVER, PASSED THROUGH. Orbit does not keep its own set of
    // resolved gates; there is one Scenario in this app.
    resolvedGateIds: scenario.resolvedGateIds,
  };
}
