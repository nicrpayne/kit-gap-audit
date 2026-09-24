import "server-only";

import type { Prisma, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";
import { estimateQualityForItems } from "@/lib/forecast/build";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { toDateOnly } from "@/lib/time/dateContract";
import { assembleDecisionBrief, type DecisionBriefV1 } from "./decisionBrief";
import { loadDecisionBriefOwnerInputs } from "./readModel";
import { substituteCapabilityKnowledgeEstimates } from "@/lib/scope/knowledgeEstimates";
import {
  forecastCapability,
  type CapabilityStaffingPlan,
} from "@/lib/scope/capabilityForecast";

export const SCENARIO_REPORT_VERSION = "scenario-report.v1" as const;

export interface ScenarioReportSnapshotV1 {
  version: typeof SCENARIO_REPORT_VERSION;
  scenarioId: string;
  baseRealityRevision: number;
  excludedItemIds: string[];
  includedItemIds: string[];
  resolvedGateIds: string[];
  estimateOverrideByItemId: Record<string, { low: number; likely: number; high: number }>;
  capacityOverrideByScope: Record<string, number>;
  contextSwitchCostPct: number | null;
  /** Product-level removal provenance. Item ids remain the engine input. */
  excludedCapabilityIds: string[];
  /** Source-attributed capability estimate staged from the current snapshot. */
  knowledgeEstimateByCapabilityId: Record<string, {
    estimateId: string;
    contextSnapshotId: string;
    low: number;
    likely: number;
    high: number;
  }>;
  /** Named focus assumptions for isolated per-capability outlooks. */
  capabilityStaffingById: Record<string, CapabilityStaffingPlan>;
  computed?: {
    realityLikelyDate: string;
    scenarioLikelyDate: string;
    deltaDays: number;
    causalExplanation: string[];
  };
}

export class ScenarioReportValidationError extends Error {
  readonly status = 409;
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))]
  : [];

function range(value: unknown, label: string): { low: number; likely: number; high: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScenarioReportValidationError(`${label} is invalid.`);
  const point = value as Record<string, unknown>;
  if (![point.low, point.likely, point.high].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) || (point.low as number) > (point.likely as number) || (point.likely as number) > (point.high as number)) {
    throw new ScenarioReportValidationError(`${label} must satisfy 0 ≤ low ≤ likely ≤ high.`);
  }
  return { low: point.low as number, likely: point.likely as number, high: point.high as number };
}

export function parseScenarioReportSnapshot(value: unknown): ScenarioReportSnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScenarioReportValidationError("A complete scenario snapshot is required.");
  const raw = value as Record<string, unknown>;
  const scenarioId = typeof raw.scenarioId === "string" ? raw.scenarioId.trim() : "";
  const baseRealityRevision = raw.baseRealityRevision;
  if (!scenarioId || !/^[a-zA-Z0-9._:-]{3,120}$/.test(scenarioId)) throw new ScenarioReportValidationError("scenarioId must be a stable 3–120 character identifier.");
  if (!Number.isInteger(baseRealityRevision) || (baseRealityRevision as number) < 0) throw new ScenarioReportValidationError("baseRealityRevision is required.");

  const estimates: ScenarioReportSnapshotV1["estimateOverrideByItemId"] = {};
  if (raw.estimateOverrideByItemId && typeof raw.estimateOverrideByItemId === "object" && !Array.isArray(raw.estimateOverrideByItemId)) {
    for (const [id, candidate] of Object.entries(raw.estimateOverrideByItemId as Record<string, unknown>)) {
      estimates[id] = range(candidate, `Estimate override ${id}`);
    }
  }
  const capacity: Record<string, number> = {};
  if (raw.capacityOverrideByScope && typeof raw.capacityOverrideByScope === "object" && !Array.isArray(raw.capacityOverrideByScope)) {
    for (const [scopeId, candidate] of Object.entries(raw.capacityOverrideByScope as Record<string, unknown>)) {
      if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) throw new ScenarioReportValidationError(`Capacity override ${scopeId} must be greater than zero.`);
      capacity[scopeId] = candidate;
    }
  }
  const contextSwitchCostPct = raw.contextSwitchCostPct === null || raw.contextSwitchCostPct === undefined
    ? null
    : typeof raw.contextSwitchCostPct === "number" && raw.contextSwitchCostPct >= 0 && raw.contextSwitchCostPct <= 100
      ? raw.contextSwitchCostPct
      : (() => { throw new ScenarioReportValidationError("contextSwitchCostPct must be between 0 and 100."); })();
  const knowledge: ScenarioReportSnapshotV1["knowledgeEstimateByCapabilityId"] = {};
  if (raw.knowledgeEstimateByCapabilityId && typeof raw.knowledgeEstimateByCapabilityId === "object" && !Array.isArray(raw.knowledgeEstimateByCapabilityId)) {
    for (const [capabilityId, candidate] of Object.entries(raw.knowledgeEstimateByCapabilityId as Record<string, unknown>)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new ScenarioReportValidationError(`Knowledge estimate ${capabilityId} is invalid.`);
      const value = candidate as Record<string, unknown>;
      const estimateId = typeof value.estimateId === "string" ? value.estimateId.trim() : "";
      const contextSnapshotId = typeof value.contextSnapshotId === "string" ? value.contextSnapshotId.trim() : "";
      if (!estimateId || !contextSnapshotId) throw new ScenarioReportValidationError(`Knowledge estimate ${capabilityId} must retain its estimate and context snapshot ids.`);
      knowledge[capabilityId] = { estimateId, contextSnapshotId, ...range(value, `Knowledge estimate ${capabilityId}`) };
    }
  }
  const staffing: ScenarioReportSnapshotV1["capabilityStaffingById"] = {};
  if (raw.capabilityStaffingById && typeof raw.capabilityStaffingById === "object" && !Array.isArray(raw.capabilityStaffingById)) {
    for (const [capabilityId, candidate] of Object.entries(raw.capabilityStaffingById as Record<string, unknown>)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new ScenarioReportValidationError(`Capability staffing ${capabilityId} is invalid.`);
      const contributors = (candidate as Record<string, unknown>).contributors;
      if (!Array.isArray(contributors) || contributors.length === 0) throw new ScenarioReportValidationError(`Capability staffing ${capabilityId} requires at least one named contributor.`);
      staffing[capabilityId] = {
        contributors: contributors.map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new ScenarioReportValidationError(`Capability staffing ${capabilityId} contributor ${index + 1} is invalid.`);
          const person = entry as Record<string, unknown>;
          const personId = typeof person.personId === "string" ? person.personId.trim() : "";
          const name = typeof person.name === "string" ? person.name.trim() : "";
          const fte = person.fte;
          if (!personId || !name || typeof fte !== "number" || !Number.isFinite(fte) || fte <= 0) throw new ScenarioReportValidationError(`Capability staffing ${capabilityId} contributor ${index + 1} must have a person, name, and positive FTE.`);
          return { personId, name, fte };
        }),
      };
    }
  }
  const snapshot: ScenarioReportSnapshotV1 = {
    version: SCENARIO_REPORT_VERSION,
    scenarioId,
    baseRealityRevision: baseRealityRevision as number,
    excludedItemIds: strings(raw.excludedItemIds),
    includedItemIds: strings(raw.includedItemIds),
    resolvedGateIds: strings(raw.resolvedGateIds),
    estimateOverrideByItemId: estimates,
    capacityOverrideByScope: capacity,
    contextSwitchCostPct,
    excludedCapabilityIds: strings(raw.excludedCapabilityIds),
    knowledgeEstimateByCapabilityId: knowledge,
    capabilityStaffingById: staffing,
  };
  const leverCount = snapshot.excludedItemIds.length + snapshot.includedItemIds.length + snapshot.resolvedGateIds.length + Object.keys(estimates).length + Object.keys(capacity).length + Object.keys(knowledge).length + Object.keys(staffing).length + (contextSwitchCostPct === null ? 0 : 1);
  if (leverCount === 0) throw new ScenarioReportValidationError("Scenario reports require at least one explicit hypothetical lever.");
  return snapshot;
}

const day = 86_400_000;

export async function buildScenarioDecisionBriefReadModel(
  scope: Scope,
  value: unknown,
  contextSnapshotId?: string | null
): Promise<{ brief: DecisionBriefV1; scenarioSnapshot: ScenarioReportSnapshotV1 }> {
  const scenario = parseScenarioReportSnapshot(value);
  const derived = await prisma.projectDerivedState.findUnique({ where: { scopeId: scope.id }, select: { realityRevision: true, computedRevision: true, status: true } });
  const realityRevision = derived?.realityRevision ?? 0;
  if (scenario.baseRealityRevision !== realityRevision || derived && (derived.computedRevision !== derived.realityRevision || derived.status !== "current")) {
    throw new ScenarioReportValidationError(`Scenario is based on Reality r${scenario.baseRealityRevision}, but current coherent Reality is r${realityRevision}. Return to Reality, refresh, and recreate the scenario.`);
  }

  const portfolio = await buildPortfolioInputs();
  const target = portfolio.scopes.find((candidate) => candidate.scopeId === scope.id);
  if (!target) throw new ScenarioReportValidationError("Scenario project is no longer in the active portfolio.");
  const allItemIds = new Set(portfolio.scopes.flatMap((candidate) => [...candidate.items, ...candidate.executionItems].map((item) => item.id)));
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
    items: candidate.items,
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
  const excluded = new Set(scenario.excludedItemIds);
  const included = new Set(scenario.includedItemIds);
  const resolved = new Set(scenario.resolvedGateIds);
  const excludedCapabilities = new Set(scenario.excludedCapabilityIds);
  const scenarioScopes = scopes.map((candidate) => {
    const owner = portfolio.scopes.find((row) => row.scopeId === candidate.scopeId)!;
    const knowledgeSubstitutions = Object.entries(scenario.knowledgeEstimateByCapabilityId).flatMap(([capabilityId, selected]) => {
      const capability = owner.capabilities.find((row) => row.id === capabilityId);
      if (!capability || excludedCapabilities.has(capabilityId)) return [];
      return [{
        capabilityId,
        capabilityName: capability.name,
        estimateId: selected.estimateId,
        range: { low: selected.low, likely: selected.likely, high: selected.high },
        replacedItemIds: capability.workLinks.map((link) => link.externalId),
      }];
    });
    const baseItems = [...candidate.items, ...owner.executionItems.filter((item) => included.has(item.id) && !candidate.items.some((base) => base.id === item.id))]
      .filter((item) => !excluded.has(item.id))
      .map((item) => scenario.estimateOverrideByItemId[item.id] ? { ...item, ...scenario.estimateOverrideByItemId[item.id], estimateSource: "hint" as const } : item);
    return {
      ...candidate,
      items: substituteCapabilityKnowledgeEstimates(baseItems, knowledgeSubstitutions),
      gates: candidate.gates.filter((gate) => !resolved.has(gate.id)),
    };
  });
  const scenarioDelta: ScenarioInputDelta = {
    ...baselineDelta,
    contextSwitchCostPct: scenario.contextSwitchCostPct ?? portfolio.contextSwitchCostPct,
    capacityOverrideByScope: scenario.capacityOverrideByScope,
  };
  const scenarioSpecs = applyScenarioInputDelta(scenarioScopes, portfolio.people, scenarioDelta);
  const baselineResult = runPortfolioSimulation(baselineSpecs).get(scope.id)!;
  const scenarioResult = runPortfolioSimulation(scenarioSpecs).get(scope.id)!;
  const deltaDays = Math.round((scenarioResult.likelyDate.getTime() - baselineResult.likelyDate.getTime()) / day);
  const causalExplanation = [
    ...(scenario.excludedItemIds.length ? [`Removed ${scenario.excludedItemIds.length} executable work item${scenario.excludedItemIds.length === 1 ? "" : "s"}.`] : []),
    ...(scenario.includedItemIds.length ? [`Added ${scenario.includedItemIds.length} mapped execution item${scenario.includedItemIds.length === 1 ? "" : "s"}.`] : []),
    ...(scenario.resolvedGateIds.length ? [`Assumed ${scenario.resolvedGateIds.length} decision gate${scenario.resolvedGateIds.length === 1 ? "" : "s"} resolved.`] : []),
    ...(Object.keys(scenario.estimateOverrideByItemId).length ? [`Changed ${Object.keys(scenario.estimateOverrideByItemId).length} governed estimate assumption${Object.keys(scenario.estimateOverrideByItemId).length === 1 ? "" : "s"}.`] : []),
    ...(Object.keys(scenario.knowledgeEstimateByCapabilityId).length ? [`Used ${Object.keys(scenario.knowledgeEstimateByCapabilityId).length} source-attributed meeting estimate${Object.keys(scenario.knowledgeEstimateByCapabilityId).length === 1 ? "" : "s"} provisionally, replacing rather than adding to ticket rollups.`] : []),
    ...(Object.keys(scenario.capabilityStaffingById).length ? [`Added ${Object.keys(scenario.capabilityStaffingById).length} isolated capability staffing outlook${Object.keys(scenario.capabilityStaffingById).length === 1 ? "" : "s"}; these do not claim the same people can execute multiple cards simultaneously.`] : []),
    ...(Object.keys(scenario.capacityOverrideByScope).length ? [`Changed aggregate capacity for ${Object.keys(scenario.capacityOverrideByScope).length} project${Object.keys(scenario.capacityOverrideByScope).length === 1 ? "" : "s"}.`] : []),
    ...(scenario.contextSwitchCostPct === null ? [] : [`Set context-switch cost to ${scenario.contextSwitchCostPct}%.`]),
    `The protected forecast engine moved the likely date ${Math.abs(deltaDays)} day${Math.abs(deltaDays) === 1 ? "" : "s"} ${deltaDays < 0 ? "earlier" : deltaDays > 0 ? "later" : "(no net movement)"}.`,
  ];

  const input = await loadDecisionBriefOwnerInputs(scope, { contextSnapshotId, mode: "scenario", scenarioId: scenario.scenarioId });
  input.forecast = {
    ...input.forecast,
    sourceId: `scenario:${scenario.scenarioId}:reality:${realityRevision}`,
    earliestDate: toDateOnly(scenarioResult.earliestDate),
    likelyDate: toDateOnly(scenarioResult.likelyDate),
    latestDate: toDateOnly(scenarioResult.latestDate),
    confidenceAtTarget: scenarioResult.confidenceAtTarget,
    remainingIssueCount: scenarioSpecs.find((candidate) => candidate.scopeId === scope.id)?.items.length ?? 0,
    estimateQuality: estimateQualityForItems(scenarioScopes.find((candidate) => candidate.scopeId === scope.id)?.items ?? []),
    remainingEffortDays: scenarioResult.remainingEffortDays,
    decisionDelayDays: scenarioResult.decisionDelayDays,
  };
  input.context.warnings = [...input.context.warnings, `Scenario ${scenario.scenarioId} is hypothetical and based on Reality r${realityRevision}.`, ...causalExplanation];
  input.decisions = input.decisions.map((decision) => decision.gate && resolved.has(decision.gate.id) ? { ...decision, status: "scenario-resolved" } : decision);
  const override = scenario.capacityOverrideByScope[scope.id];
  if (override !== undefined || scenario.contextSwitchCostPct !== null) {
    input.capacity = {
      ...input.capacity,
      status: "aggregate_unreconciled",
      reconciles: false,
      forecastEffectiveFte: scenarioSpecs.find((candidate) => candidate.scopeId === scope.id)?.teamCapacity ?? input.capacity.forecastEffectiveFte,
      contextSwitchCostPct: scenario.contextSwitchCostPct ?? input.capacity.contextSwitchCostPct,
    };
  }
  const brief = assembleDecisionBrief(input);
  brief.headline.keyReason.value = causalExplanation.join(" ");
  const targetItems = new Map([...target.items, ...target.executionItems].map((item) => [item.id, item]));
  brief.movable.scope.value.capabilityOutlooks = Object.entries(scenario.capabilityStaffingById).flatMap(([capabilityId, staffing]) => {
    const capability = target.capabilities.find((candidate) => candidate.id === capabilityId);
    if (!capability || excludedCapabilities.has(capabilityId)) return [];
    const knowledge = scenario.knowledgeEstimateByCapabilityId[capabilityId];
    const effortDays = knowledge
      ? { low: knowledge.low, likely: knowledge.likely, high: knowledge.high }
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
      estimateBasis: knowledge ? "knowledge_provisional" as const : "work_rollup" as const,
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
    brief,
    scenarioSnapshot: {
      ...scenario,
      computed: {
        realityLikelyDate: toDateOnly(baselineResult.likelyDate),
        scenarioLikelyDate: toDateOnly(scenarioResult.likelyDate),
        deltaDays,
        causalExplanation,
      },
    },
  };
}

export function scenarioSnapshotJson(snapshot: ScenarioReportSnapshotV1): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}
