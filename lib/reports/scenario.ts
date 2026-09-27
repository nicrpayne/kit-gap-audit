import "server-only";

import type { Prisma, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";
import { estimateQualityForItems } from "@/lib/forecast/build";
import { buildPortfolioScenarios, runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { resolveCapacity } from "@/lib/capacity/resolve";
import { capacityForecastContract } from "@/lib/capacity/contract";
import {
  buildCapacityPlanBaseline,
  capacityAssumptionLedger,
  capacityPlanAffectedScopeIds,
  resolveCapacityPlan,
  validateCapacityScenarioPlan,
} from "@/lib/scenario/capacityPlan";
import { toDateOnly } from "@/lib/time/dateContract";
import { assembleDecisionBrief, type DecisionBriefV1 } from "./decisionBrief";
import { loadDecisionBriefOwnerInputs } from "./readModel";
import { knowledgeEstimateItemId, substituteCapabilityKnowledgeEstimates } from "@/lib/scope/knowledgeEstimates";
import { reviewedEstimateSimulationDecision } from "@/lib/forecast/reviewedEstimate";
import { ForecastCoverageIncompleteError } from "@/lib/forecast/coverage";
import { forecastCapability } from "@/lib/scope/capabilityForecast";
import { freezeCapabilityEstimate, freezeForecastBasis, type ForecastCapacityBasisInput } from "./forecastBasis";
import { findScenarioLeverConflicts, scenarioLeverConflictMessage } from "./scenarioConflicts";

export * from "./scenarioSnapshot";
import {
  SCENARIO_REPORT_VERSION,
  ScenarioReportValidationError,
  parseScenarioReportSnapshot,
  type ScenarioReportSnapshotV1,
} from "./scenarioSnapshot";

const day = 86_400_000;

export async function buildScenarioDecisionBriefReadModel(
  scope: Scope,
  value: unknown,
  contextSnapshotId?: string | null
): Promise<{ realityBrief: DecisionBriefV1; brief: DecisionBriefV1; scenarioSnapshot: ScenarioReportSnapshotV1 }> {
  const scenario = parseScenarioReportSnapshot(value);
  // Historical v1 payloads remain readable, but new reports must not bypass
  // named-person conservation through a legacy aggregate override.
  if (scenario.version !== SCENARIO_REPORT_VERSION) {
    throw new ScenarioReportValidationError("Recreate this legacy Scenario with the current controls before publishing.");
  }
  if (!scenario.capacityPlan && (Object.keys(scenario.capacityOverrideByScope).length || scenario.contextSwitchCostPct !== null)) {
    throw new ScenarioReportValidationError("A reportable Capacity or switch-cost change requires the complete named staffing plan. Recreate it in Capacity.");
  }
  const unreviewedKnowledgeCapabilityIds = Object.keys(scenario.knowledgeEstimateByCapabilityId);
  if (unreviewedKnowledgeCapabilityIds.length) {
    throw new ScenarioReportValidationError(`Raw meeting estimates cannot support a new delivery report without an explicitly reviewed remaining-work interpretation and exact covered/additional ticket boundary: ${unreviewedKnowledgeCapabilityIds.join(", ")}. Return to Scope and review each assertion; other staged Scenario levers remain unchanged.`);
  }
  const derived = await prisma.projectDerivedState.findUnique({ where: { scopeId: scope.id }, select: { realityRevision: true, computedRevision: true, status: true } });
  const realityRevision = derived?.realityRevision ?? 0;
  if (scenario.baseRealityRevision !== realityRevision || derived && (derived.computedRevision !== derived.realityRevision || derived.status !== "current")) {
    throw new ScenarioReportValidationError(`Scenario is based on Reality r${scenario.baseRealityRevision}, but current coherent Reality is r${realityRevision}. Return to Reality, refresh, and recreate the scenario.`);
  }

  const portfolio = await buildPortfolioInputs();
  const target = portfolio.scopes.find((candidate) => candidate.scopeId === scope.id);
  if (!target) throw new ScenarioReportValidationError("Scenario project is no longer in the active portfolio.");
  if (!target.forecastCoverage.canonicalForecast) {
    throw new ForecastCoverageIncompleteError(target.forecastCoverage);
  }
  if (
    target.realityState.realityRevision !== realityRevision ||
    target.realityState.computedRevision !== target.realityState.realityRevision ||
    target.realityState.status !== "current"
  ) {
    throw new ScenarioReportValidationError("Reality changed while the Scenario report inputs were loading. Review the refreshed Scenario and try again.");
  }
  if (scenario.capacityPlan) {
    const affectedScopeIds = new Set(capacityPlanAffectedScopeIds(scenario.capacityPlan));
    const incoherentScopes = portfolio.scopes.filter((candidate) =>
      affectedScopeIds.has(candidate.scopeId) && (
        candidate.realityState.status !== "current" ||
        candidate.realityState.computedRevision !== candidate.realityState.realityRevision
      )
    );
    if (incoherentScopes.length) {
      throw new ScenarioReportValidationError(`Capacity inputs are still recomputing for ${incoherentScopes.map((candidate) => candidate.name).join(", ")}. Wait for coherent Reality, then review the scenario.`);
    }
    const currentCapacityBaseline = buildCapacityPlanBaseline({
      people: portfolio.people,
      allocations: portfolio.allocations,
      contextSwitchCostPct: portfolio.contextSwitchCostPct,
      scopeRevisionById: Object.fromEntries(portfolio.scopes.map((candidate) => [
        candidate.scopeId,
        candidate.realityState.realityRevision,
      ])),
    });
    const capacityValidation = validateCapacityScenarioPlan(scenario.capacityPlan, currentCapacityBaseline);
    if (!capacityValidation.ok) throw new ScenarioReportValidationError(capacityValidation.reason);
    const unstaffed = Object.values(scenario.capacityPlan.requiredByScope).reduce((total, fte) => total + fte, 0);
    if (unstaffed > 1e-6) {
      throw new ScenarioReportValidationError(`This Capacity scenario still requires ${unstaffed.toFixed(1)} FTE that has not been staffed. Reallocate named capacity or add an explicit hypothetical hire before publishing it.`);
    }
  }
  const allItemIds = new Set(portfolio.scopes.flatMap((candidate) => [...candidate.items, ...candidate.forecastItems, ...candidate.executionItems].map((item) => item.id)));
  const allGateIds = new Set(portfolio.scopes.flatMap((candidate) => candidate.gates.map((gate) => gate.id)));
  const allScopeIds = new Set(portfolio.scopes.map((candidate) => candidate.scopeId));
  const capabilityOwner = new Map(portfolio.scopes.flatMap((candidate) => candidate.capabilities.map((capability) => [capability.id, { scope: candidate, capability }] as const)));
  const unknownItems = [...scenario.excludedItemIds, ...scenario.includedItemIds, ...Object.keys(scenario.estimateOverrideByItemId)].filter((id) => !allItemIds.has(id));
  const unknownGates = scenario.resolvedGateIds.filter((id) => !allGateIds.has(id));
  const unknownScopes = Object.keys(scenario.capacityOverrideByScope).filter((id) => !allScopeIds.has(id));
  const unknownCapabilities = [...scenario.excludedCapabilityIds, ...Object.keys(scenario.knowledgeEstimateByCapabilityId), ...Object.keys(scenario.capabilityStaffingById)].filter((id) => !capabilityOwner.has(id));
  if (unknownItems.length || unknownGates.length || unknownScopes.length || unknownCapabilities.length) {
    throw new ScenarioReportValidationError(`Scenario references stale owner records: ${[...unknownItems, ...unknownGates, ...unknownScopes, ...unknownCapabilities].join(", ")}. Refresh and recreate it.`);
  }

  const includedSet = new Set(scenario.includedItemIds);
  const conflictCapabilities = portfolio.scopes.flatMap((candidate) => {
    const sourceItemIds = new Set(candidate.items.map((item) => item.id));
    return candidate.capabilities.map((capability) => {
      const acceptedDecision = capability.status === "accepted" && capability.estimateReview
        ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
        : null;
      const substitution = acceptedDecision?.substitution;
      return {
        id: capability.id,
        name: capability.name,
        scopeId: candidate.scopeId,
        workItemIds: [
          ...capability.workLinks
            .filter((link) => (link.state === "active" || link.state === "configured") && sourceItemIds.has(link.externalId))
            .map((link) => link.externalId),
          ...(substitution
            ? [knowledgeEstimateItemId(capability.id, substitution.estimateId, substitution.contextSnapshotId)]
            : []),
        ],
      };
    });
  });
  const leverConflicts = findScenarioLeverConflicts({
    capabilities: conflictCapabilities,
    excludedCapabilityIds: scenario.excludedCapabilityIds,
    excludedItemIds: scenario.excludedItemIds,
    includedItemIds: scenario.includedItemIds,
    knowledgeCapabilityIds: Object.keys(scenario.knowledgeEstimateByCapabilityId),
    staffingCapabilityIds: Object.keys(scenario.capabilityStaffingById),
  });
  if (leverConflicts.length) {
    throw new ScenarioReportValidationError(`Scenario levers conflict: ${scenarioLeverConflictMessage(leverConflicts)}. Resolve the conflicting choices in Scope before publishing; no staged changes were removed.`);
  }
  const conflictingIncludedItems = portfolio.scopes.flatMap((candidate) => candidate.capabilities.flatMap((capability) => {
    const acceptedDecision = capability.status === "accepted" && capability.estimateReview
      ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
      : null;
    const stagedWholeCapabilityBasis = Boolean(scenario.knowledgeEstimateByCapabilityId[capability.id]);
    const basisItemIds = stagedWholeCapabilityBasis
      ? capability.workLinks.map((link) => link.externalId)
      : acceptedDecision?.review.coveredItemIds ?? [];
    return basisItemIds.filter((id) => includedSet.has(id));
  }));
  if (conflictingIncludedItems.length) {
    throw new ScenarioReportValidationError(`Additional work is inside a capability estimate boundary and cannot be added independently: ${[...new Set(conflictingIncludedItems)].join(", ")}. Review whether it is genuinely additional work before publishing.`);
  }

  for (const [capabilityId, selected] of Object.entries(scenario.knowledgeEstimateByCapabilityId)) {
    const owner = capabilityOwner.get(capabilityId)!;
    const current = owner.capability.knowledgeEstimates.find((estimate) => estimate.id === selected.estimateId && estimate.contextSnapshotId === selected.contextSnapshotId);
    if (!current?.range || current.range.low !== selected.low || current.range.likely !== selected.likely || current.range.high !== selected.high) {
      throw new ScenarioReportValidationError(`The meeting estimate for ${owner.capability.name} is no longer current. Refresh Scope and stage the current evidence again.`);
    }
  }
  for (const [capabilityId, staffing] of Object.entries(scenario.capabilityStaffingById)) {
    const owner = capabilityOwner.get(capabilityId)!;
    const available = new Map(owner.scope.capacityContributors.map((person) => [person.personId, person]));
    const seen = new Set<string>();
    for (const contributor of staffing.contributors) {
      const current = available.get(contributor.personId);
      if (!current || seen.has(contributor.personId) || contributor.fte > current.effectiveFte + 0.0001) {
        throw new ScenarioReportValidationError(`The staffing assumption for ${owner.capability.name} is stale or exceeds ${contributor.name}'s current project capacity. Refresh Capacity and recreate it.`);
      }
      seen.add(contributor.personId);
      contributor.name = current.name;
    }
  }

  const scopes: ScenarioInputScope[] = portfolio.scopes.map((candidate) => ({
    scopeId: candidate.scopeId,
    items: candidate.forecastItems,
    gates: candidate.gates,
    dependsOnScopeIds: candidate.dependsOnScopeIds,
    explicitTeamCapacity: candidate.explicitTeamCapacity,
    teamCapacity: candidate.teamCapacity,
    capacitySource: candidate.capacitySource,
    startDate: portfolio.startDate,
    targetDate: candidate.targetDate,
  }));
  const baselineDelta: ScenarioInputDelta = {
    allocations: portfolio.allocations.map((allocation) => ({ personId: allocation.personId, scopeId: allocation.scopeId, fraction: allocation.fraction })),
    hypotheticalPeople: [],
    contextSwitchCostPct: portfolio.contextSwitchCostPct,
  };
  const baselineSpecs = applyScenarioInputDelta(scopes, portfolio.people, baselineDelta);
  const frozenBaselineCapabilityEstimates = portfolio.scopes.flatMap((candidate) => {
    const simulatedIds = new Set(scopes.find((row) => row.scopeId === candidate.scopeId)?.items.map((item) => item.id) ?? []);
    return candidate.capabilities.flatMap((capability) => {
      if (capability.status !== "accepted" || !capability.estimateReview) return [];
      const decision = reviewedEstimateSimulationDecision(capability, capability.estimateReview);
      if (!decision.substitution) return [];
      if (!capability.estimateReview.estimate) return [];
      const syntheticId = knowledgeEstimateItemId(capability.id, decision.substitution.estimateId, decision.substitution.contextSnapshotId);
      if (!simulatedIds.has(syntheticId)) return [];
      return [freezeCapabilityEstimate(
        candidate.scopeId,
        capability,
        capability.estimateReview.estimate,
        decision.review.coveredItemIds,
        capability.estimateReview.status,
        decision.review,
      )];
    });
  });
  const excluded = new Set(scenario.excludedItemIds);
  const included = new Set(scenario.includedItemIds);
  const resolved = new Set(scenario.resolvedGateIds);
  const excludedCapabilities = new Set(scenario.excludedCapabilityIds);
  const scenarioScopes = scopes.map((candidate) => {
    const owner = portfolio.scopes.find((row) => row.scopeId === candidate.scopeId)!;
    const sourceItemIds = new Set(owner.items.map((item) => item.id));
    const excludedCapabilityItemIds = new Set(owner.capabilities
      .filter((capability) => excludedCapabilities.has(capability.id))
      .flatMap((capability) => {
        const decision = capability.status === "accepted" && capability.estimateReview
          ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
          : null;
        return [
          ...capability.workLinks
            .filter((link) => (link.state === "active" || link.state === "configured") && sourceItemIds.has(link.externalId))
            .map((link) => link.externalId),
          ...(decision?.substitution
            ? [knowledgeEstimateItemId(capability.id, decision.substitution.estimateId, decision.substitution.contextSnapshotId)]
            : []),
        ];
      }));
    const knowledgeSubstitutions = Object.entries(scenario.knowledgeEstimateByCapabilityId).flatMap(([capabilityId, selected]) => {
      const capability = owner.capabilities.find((row) => row.id === capabilityId);
      if (!capability || excludedCapabilities.has(capabilityId)) return [];
      const acceptedDecision = capability.status === "accepted" && capability.estimateReview
        ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
        : null;
      return [{
        capabilityId,
        capabilityName: capability.name,
        estimateId: selected.estimateId,
        contextSnapshotId: selected.contextSnapshotId,
        range: { low: selected.low, likely: selected.likely, high: selected.high },
        replacedItemIds: [
          ...capability.workLinks
            .filter((link) => (link.state === "active" || link.state === "configured") && sourceItemIds.has(link.externalId))
            .map((link) => link.externalId),
          ...(acceptedDecision?.substitution
            ? [knowledgeEstimateItemId(capabilityId, acceptedDecision.substitution.estimateId, acceptedDecision.substitution.contextSnapshotId)]
            : []),
        ],
      }];
    });
    const baseItems = [...candidate.items, ...owner.executionItems.filter((item) => included.has(item.id) && !candidate.items.some((base) => base.id === item.id))]
      .filter((item) => !excluded.has(item.id) && !excludedCapabilityItemIds.has(item.id))
      .map((item) => scenario.estimateOverrideByItemId[item.id] ? { ...item, ...scenario.estimateOverrideByItemId[item.id], estimateSource: "hint" as const } : item);
    return {
      ...candidate,
      items: substituteCapabilityKnowledgeEstimates(baseItems, knowledgeSubstitutions),
      gates: candidate.gates.filter((gate) => !resolved.has(gate.id)),
    };
  });
  const frozenCapabilityEstimates = portfolio.scopes.flatMap((candidate) => candidate.capabilities.flatMap((capability) => {
    if (excludedCapabilities.has(capability.id)) return [];
    const sourceItemIds = new Set(candidate.items.map((item) => item.id));
    const acceptedDecision = capability.status === "accepted" && capability.estimateReview
      ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
      : null;
    const simulatedIds = new Set(scenarioScopes.find((row) => row.scopeId === candidate.scopeId)?.items.map((item) => item.id) ?? []);
    const provisional = scenario.knowledgeEstimateByCapabilityId[capability.id];
    if (provisional) {
      const estimate = capability.knowledgeEstimates.find((row) =>
        row.id === provisional.estimateId && row.contextSnapshotId === provisional.contextSnapshotId
      );
      if (!estimate || !simulatedIds.has(knowledgeEstimateItemId(capability.id, estimate.id, estimate.contextSnapshotId))) return [];
      return [freezeCapabilityEstimate(
        candidate.scopeId,
        capability,
        estimate,
        [
          ...capability.workLinks
            .filter((link) => (link.state === "active" || link.state === "configured") && sourceItemIds.has(link.externalId))
            .map((link) => link.externalId),
          ...(acceptedDecision?.substitution
            ? [knowledgeEstimateItemId(capability.id, acceptedDecision.substitution.estimateId, acceptedDecision.substitution.contextSnapshotId)]
            : []),
        ],
        "provisional",
      )];
    }
    return acceptedDecision?.substitution && capability.estimateReview?.estimate && simulatedIds.has(knowledgeEstimateItemId(capability.id, acceptedDecision.substitution.estimateId, acceptedDecision.substitution.contextSnapshotId))
      ? [freezeCapabilityEstimate(
          candidate.scopeId,
          capability,
          capability.estimateReview.estimate,
          acceptedDecision.review.coveredItemIds,
          capability.estimateReview.status,
          acceptedDecision.review,
        )]
      : [];
  }));
  const scenarioDelta: ScenarioInputDelta = scenario.capacityPlan
    ? resolveCapacityPlan(scenario.capacityPlan)
    : {
        ...baselineDelta,
        contextSwitchCostPct: scenario.contextSwitchCostPct ?? portfolio.contextSwitchCostPct,
        capacityOverrideByScope: scenario.capacityOverrideByScope,
  };
  const scenarioSpecs = applyScenarioInputDelta(scenarioScopes, portfolio.people, scenarioDelta);
  if (scenario.capacityPlan) {
    const baselineCapacityByScope = new Map(baselineSpecs.map((candidate) => [candidate.scopeId, candidate.teamCapacity]));
    const expectedCapacityProjection = Object.fromEntries(scenarioSpecs.flatMap((candidate) => {
      const baselineCapacity = baselineCapacityByScope.get(candidate.scopeId) ?? candidate.teamCapacity;
      return Math.abs(candidate.teamCapacity - baselineCapacity) > 1e-6
        ? [[candidate.scopeId, candidate.teamCapacity] as const]
        : [];
    }));
    const projectionScopeIds = new Set([
      ...Object.keys(expectedCapacityProjection),
      ...Object.keys(scenario.capacityOverrideByScope),
    ]);
    const projectionMismatch = [...projectionScopeIds].find((scopeId) => {
      const expected = expectedCapacityProjection[scopeId];
      const supplied = scenario.capacityOverrideByScope[scopeId];
      return expected === undefined || supplied === undefined || Math.abs(expected - supplied) > 1e-6;
    });
    if (projectionMismatch) {
      throw new ScenarioReportValidationError(`Capacity projection for ${projectionMismatch} does not match the complete exact named plan. Return to Capacity and recreate the scenario.`);
    }
    const expectedLegacySwitchCost = scenario.capacityPlan.contextSwitchCostPct === scenario.capacityPlan.baselineFingerprint.contextSwitchCostPct
      ? null
      : scenario.capacityPlan.contextSwitchCostPct;
    if (scenario.contextSwitchCostPct !== expectedLegacySwitchCost) {
      throw new ScenarioReportValidationError("The projected switch-cost field does not match the exact named Capacity plan. Return to Capacity and recreate the scenario.");
    }
    const capacityChangesSimulation = scenarioSpecs.some((candidate) =>
      Math.abs(candidate.teamCapacity - (baselineCapacityByScope.get(candidate.scopeId) ?? candidate.teamCapacity)) > 1e-6
    );
    if (!capacityChangesSimulation) {
      throw new ScenarioReportValidationError("The Capacity plan does not change any simulated project input. Allocate an explicit hypothetical hire or clear the no-op capacity assumption before publishing.");
    }
  }

  // Every claimed ticket-level override must survive into the exact
  // simulation input. Excluded work or work replaced by a capability basis
  // would otherwise produce a report that names a change the engine ignored.
  const simulatedItemIds = new Set(scenarioScopes.flatMap((candidate) => candidate.items.map((item) => item.id)));
  const ignoredEstimateOverrides = Object.keys(scenario.estimateOverrideByItemId).filter((id) => !simulatedItemIds.has(id));
  if (ignoredEstimateOverrides.length) {
    throw new ScenarioReportValidationError(`Estimate overrides would not affect the simulated basis: ${ignoredEstimateOverrides.join(", ")}. Clear the covered ticket assumptions or review the capability estimate boundary before publishing.`);
  }
  const baselineCapacityBasis: ForecastCapacityBasisInput = {
    namedRoster: portfolio.people,
    modeledAllocations: baselineDelta.allocations,
    contextSwitchCostPct: baselineDelta.contextSwitchCostPct,
    hypotheticalHires: [],
    aggregateOverridesByScope: {},
  };
  const scenarioCapacityBasis: ForecastCapacityBasisInput = {
    namedRoster: portfolio.people,
    modeledAllocations: scenarioDelta.allocations,
    contextSwitchCostPct: scenarioDelta.contextSwitchCostPct,
    hypotheticalHires: scenario.capacityPlan?.hypotheticalPeople ?? [],
    // Exact named plans flow through allocations and hires. This field only
    // records an aggregate override actually consumed by the simulation.
    aggregateOverridesByScope: scenarioDelta.capacityOverrideByScope ?? {},
  };
  const baselineResults = runPortfolioSimulation(baselineSpecs);
  const scenarioResults = runPortfolioSimulation(scenarioSpecs);
  const baselineResult = baselineResults.get(scope.id)!;
  const scenarioResult = scenarioResults.get(scope.id)!;
  const scenarioOptions = buildPortfolioScenarios(scenarioSpecs, scope.id, scenarioResult).map((option) => ({
    ...option,
    likelyDate: toDateOnly(option.likelyDate),
  }));
  const deltaDays = Math.round((scenarioResult.likelyDate.getTime() - baselineResult.likelyDate.getTime()) / day);
  const capacityLedger = scenario.capacityPlan ? capacityAssumptionLedger(scenario.capacityPlan) : undefined;
  const capacityAffectedScopeIds = scenario.capacityPlan ? capacityPlanAffectedScopeIds(scenario.capacityPlan) : [];
  const causalExplanation = [
    ...(scenario.excludedCapabilityIds.length ? [`Removed ${scenario.excludedCapabilityIds.length} product capability${scenario.excludedCapabilityIds.length === 1 ? "" : "s"} from the hypothetical release scope.`] : []),
    ...(scenario.excludedItemIds.length ? [`Removed ${scenario.excludedItemIds.length} executable work item${scenario.excludedItemIds.length === 1 ? "" : "s"}.`] : []),
    ...(scenario.includedItemIds.length ? [`Added ${scenario.includedItemIds.length} mapped execution item${scenario.includedItemIds.length === 1 ? "" : "s"}.`] : []),
    ...(scenario.resolvedGateIds.length ? [`Assumed ${scenario.resolvedGateIds.length} decision gate${scenario.resolvedGateIds.length === 1 ? "" : "s"} resolved.`] : []),
    ...(Object.keys(scenario.estimateOverrideByItemId).length ? [`Changed ${Object.keys(scenario.estimateOverrideByItemId).length} governed estimate assumption${Object.keys(scenario.estimateOverrideByItemId).length === 1 ? "" : "s"}.`] : []),
    ...(Object.keys(scenario.knowledgeEstimateByCapabilityId).length ? [`Used ${Object.keys(scenario.knowledgeEstimateByCapabilityId).length} source-attributed meeting estimate${Object.keys(scenario.knowledgeEstimateByCapabilityId).length === 1 ? "" : "s"} provisionally, replacing rather than adding to ticket rollups.`] : []),
    ...(Object.keys(scenario.capabilityStaffingById).length ? [`Added ${Object.keys(scenario.capabilityStaffingById).length} isolated capability staffing outlook${Object.keys(scenario.capabilityStaffingById).length === 1 ? "" : "s"}; these do not claim the same people can execute multiple cards simultaneously.`] : []),
    ...(scenario.capacityPlan
      ? [`Applied an exact named capacity plan across ${capacityAffectedScopeIds.length} affected project${capacityAffectedScopeIds.length === 1 ? "" : "s"}; allocations and outside-Signal commitments remain conserved.`]
      : Object.keys(scenario.capacityOverrideByScope).length
        ? [`Changed aggregate capacity for ${Object.keys(scenario.capacityOverrideByScope).length} project${Object.keys(scenario.capacityOverrideByScope).length === 1 ? "" : "s"}.`]
        : []),
    ...(capacityLedger?.scenario.hypotheticalHireFte
      ? [`Added ${capacityLedger.scenario.hypotheticalHireFte.toFixed(1)} FTE from explicit hypothetical hires.`]
      : []),
    ...(capacityLedger && capacityLedger.scenario.externalCommitmentFte > 0
      ? [`Preserved ${capacityLedger.scenario.externalCommitmentFte.toFixed(1)} FTE committed outside Signal.`]
      : []),
    ...(scenario.capacityPlan
      ? scenario.capacityPlan.contextSwitchCostPct === scenario.capacityPlan.baselineFingerprint.contextSwitchCostPct
        ? []
        : [`Set context-switch cost to ${scenario.capacityPlan.contextSwitchCostPct}%.`]
      : scenario.contextSwitchCostPct === null ? [] : [`Set context-switch cost to ${scenario.contextSwitchCostPct}%.`]),
    `The protected forecast engine moved the likely date ${Math.abs(deltaDays)} day${Math.abs(deltaDays) === 1 ? "" : "s"} ${deltaDays < 0 ? "earlier" : deltaDays > 0 ? "later" : "(no net movement)"}.`,
  ];

  // Load every non-forecast owner once, then derive both halves from the same
  // immutable owner read and the same portfolio baseline. generate.ts persists
  // this `realityBrief` with `brief` as one comparison; it must not issue a
  // second independent Reality read.
  const ownerInput = await loadDecisionBriefOwnerInputs(scope, { contextSnapshotId, mode: "reality", scenarioId: null });
  if ((ownerInput.project.realityRevision ?? 0) !== realityRevision) {
    throw new ScenarioReportValidationError("Reality changed while the paired report owner inputs were loading. Review the refreshed Scenario and try again.");
  }
  const realityInput = structuredClone(ownerInput);
  realityInput.forecast = {
    ...realityInput.forecast,
    basis: freezeForecastBasis(baselineSpecs, frozenBaselineCapabilityEstimates, baselineCapacityBasis),
    simulationItemCount: baselineSpecs.find((candidate) => candidate.scopeId === scope.id)?.items.length ?? 0,
    sourceId: `scenario-pair:${scenario.scenarioId}:reality:${realityRevision}`,
    earliestDate: toDateOnly(baselineResult.earliestDate),
    likelyDate: toDateOnly(baselineResult.likelyDate),
    latestDate: toDateOnly(baselineResult.latestDate),
    confidenceAtTarget: baselineResult.confidenceAtTarget,
    estimateQuality: estimateQualityForItems(scopes.find((candidate) => candidate.scopeId === scope.id)?.items ?? []),
    remainingEffortDays: baselineResult.remainingEffortDays,
    decisionDelayDays: baselineResult.decisionDelayDays,
  };
  realityInput.capacity = {
    ...realityInput.capacity,
    forecastEffectiveFte: baselineSpecs.find((candidate) => candidate.scopeId === scope.id)?.teamCapacity ?? realityInput.capacity.forecastEffectiveFte,
    contextSwitchCostPct: portfolio.contextSwitchCostPct,
  };
  realityInput.dependencies = realityInput.dependencies.map((dependency) => {
    const result = baselineResults.get(dependency.scopeId);
    return result ? { ...dependency, likelyDate: toDateOnly(result.likelyDate) } : dependency;
  });
  const realityBrief = assembleDecisionBrief(realityInput);
  realityBrief.identity.comparisonId = scenario.scenarioId;

  const input = structuredClone(ownerInput);
  input.mode = "scenario";
  input.scenarioId = scenario.scenarioId;
  input.forecast = {
    ...input.forecast,
    basis: freezeForecastBasis(scenarioSpecs, frozenCapabilityEstimates, scenarioCapacityBasis),
    simulationItemCount: scenarioSpecs.find((candidate) => candidate.scopeId === scope.id)?.items.length ?? 0,
    sourceId: `scenario:${scenario.scenarioId}:reality:${realityRevision}`,
    earliestDate: toDateOnly(scenarioResult.earliestDate),
    likelyDate: toDateOnly(scenarioResult.likelyDate),
    latestDate: toDateOnly(scenarioResult.latestDate),
    confidenceAtTarget: scenarioResult.confidenceAtTarget,
    estimateQuality: estimateQualityForItems(scenarioScopes.find((candidate) => candidate.scopeId === scope.id)?.items ?? []),
    remainingEffortDays: scenarioResult.remainingEffortDays,
    decisionDelayDays: scenarioResult.decisionDelayDays,
    scenarios: scenarioOptions,
  };
  input.context.warnings = [...input.context.warnings, `Scenario ${scenario.scenarioId} is hypothetical and based on Reality r${realityRevision}.`, ...causalExplanation];
  input.decisions = input.decisions.map((decision) => decision.gate && resolved.has(decision.gate.id) ? { ...decision, status: "scenario-resolved" } : decision);
  input.dependencies = input.dependencies.map((dependency) => {
    const result = scenarioResults.get(dependency.scopeId);
    return result ? { ...dependency, likelyDate: toDateOnly(result.likelyDate) } : dependency;
  });
  const override = scenario.capacityOverrideByScope[scope.id];
  if (scenario.capacityPlan) {
    const scenarioPeople = [...portfolio.people, ...scenarioDelta.hypotheticalPeople];
    const scenarioForecastEffectiveFte = scenarioSpecs.find((candidate) => candidate.scopeId === scope.id)?.teamCapacity ?? input.capacity.forecastEffectiveFte;
    const resolvedScenarioCapacity = resolveCapacity(
      scope.id,
      scenarioPeople,
      scenarioDelta.allocations,
      scenarioDelta.contextSwitchCostPct,
    );
    const scenarioCapacityContract = capacityForecastContract(
      scope.id,
      scenarioPeople,
      scenarioDelta.allocations,
      scenarioDelta.contextSwitchCostPct,
      scenarioForecastEffectiveFte,
      "allocations",
      "named_exact",
    );
    input.capacity = {
      ...input.capacity,
      ...scenarioCapacityContract,
      contextSwitchCostPct: scenarioDelta.contextSwitchCostPct,
      contributors: resolvedScenarioCapacity.contributors.map((contributor) => ({
        personId: contributor.personId,
        name: contributor.name,
        rawFte: contributor.fte * contributor.fraction,
        effectiveFte: contributor.effectiveFte,
        scopeCount: contributor.scopeCount,
      })),
    };
  } else if (override !== undefined || scenario.contextSwitchCostPct !== null) {
    input.capacity = {
      ...input.capacity,
      status: "aggregate_unreconciled",
      reconciles: false,
      forecastEffectiveFte: scenarioSpecs.find((candidate) => candidate.scopeId === scope.id)?.teamCapacity ?? input.capacity.forecastEffectiveFte,
      contextSwitchCostPct: scenario.contextSwitchCostPct ?? input.capacity.contextSwitchCostPct,
    };
  }
  const brief = assembleDecisionBrief(input);
  brief.identity.comparisonId = scenario.scenarioId;
  brief.headline.keyReason.value = causalExplanation.join(" ");
  const targetItems = new Map([...target.items, ...target.executionItems].map((item) => [item.id, item]));
  brief.movable.scope.value.capabilityOutlooks = Object.entries(scenario.capabilityStaffingById).flatMap(([capabilityId, staffing]) => {
    const capability = target.capabilities.find((candidate) => candidate.id === capabilityId);
    if (!capability || excludedCapabilities.has(capabilityId)) return [];
    const knowledge = scenario.knowledgeEstimateByCapabilityId[capabilityId];
    const acceptedDecision = capability.status === "accepted" && capability.estimateReview
      ? reviewedEstimateSimulationDecision(capability, capability.estimateReview)
      : null;
    const acceptedRange = acceptedDecision?.substitution?.range;
    const effortDays = knowledge
      ? { low: knowledge.low, likely: knowledge.likely, high: knowledge.high }
      : acceptedRange
        ? acceptedRange
      : capability.workLinks
          .filter((link) => link.state === "active" || link.state === "configured")
          .map((link) => targetItems.get(link.externalId))
          .filter((item): item is NonNullable<typeof item> => !!item && !excluded.has(item.id))
          .reduce((sum, item) => {
            const override = scenario.estimateOverrideByItemId[item.id];
            const current = override ?? item;
            return { low: sum.low + current.low, likely: sum.likely + current.likely, high: sum.high + current.high };
          }, { low: 0, likely: 0, high: 0 });
    const outlook = forecastCapability(capabilityId, effortDays, staffing, portfolio.startDate, target.targetDate);
    return outlook ? [{
      capabilityId,
      name: capability.name,
      estimateBasis: knowledge
        ? "knowledge_provisional" as const
        : acceptedRange
          ? "knowledge_accepted" as const
          : "work_rollup" as const,
      effortDays,
      contributors: staffing.contributors,
      staffingFte: outlook.staffingFte,
      earliestDate: outlook.earliestDate,
      likelyDate: outlook.likelyDate,
      latestDate: outlook.latestDate,
      confidenceAtTarget: outlook.confidenceAtTarget,
    }] : [];
  });
  brief.caveats.value.push({ code: "SCENARIO_HYPOTHETICAL", message: `Hypothetical ${scenario.scenarioId}; canonical Reality r${realityRevision} was not mutated.` });
  if (brief.movable.scope.value.capabilityOutlooks.length) {
    brief.caveats.value.push({ code: "CAPABILITY_OUTLOOK_ISOLATED", message: "Capability dates assume the named contributors stay focused on that card. They do not assert sequencing or simultaneous availability across other cards." });
  }
  return {
    realityBrief,
    brief,
    scenarioSnapshot: {
      ...scenario,
      computed: {
        realityLikelyDate: toDateOnly(baselineResult.likelyDate),
        scenarioLikelyDate: toDateOnly(scenarioResult.likelyDate),
        deltaDays,
        causalExplanation,
        capacityLedger,
      },
    },
  };
}

export function scenarioSnapshotJson(snapshot: ScenarioReportSnapshotV1): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}
