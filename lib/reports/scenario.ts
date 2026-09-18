import "server-only";

import type { Prisma, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { toDateOnly } from "@/lib/time/dateContract";
import { assembleDecisionBrief, type DecisionBriefV1 } from "./decisionBrief";
import { loadDecisionBriefOwnerInputs } from "./readModel";

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
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new ScenarioReportValidationError(`Estimate override ${id} is invalid.`);
      const point = candidate as Record<string, unknown>;
      if (![point.low, point.likely, point.high].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) || (point.low as number) > (point.likely as number) || (point.likely as number) > (point.high as number)) {
        throw new ScenarioReportValidationError(`Estimate override ${id} must satisfy 0 ≤ low ≤ likely ≤ high.`);
      }
      estimates[id] = { low: point.low as number, likely: point.likely as number, high: point.high as number };
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
  };
  const leverCount = snapshot.excludedItemIds.length + snapshot.includedItemIds.length + snapshot.resolvedGateIds.length + Object.keys(estimates).length + Object.keys(capacity).length + (contextSwitchCostPct === null ? 0 : 1);
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
  const unknownItems = [...scenario.excludedItemIds, ...scenario.includedItemIds, ...Object.keys(scenario.estimateOverrideByItemId)].filter((id) => !allItemIds.has(id));
  const unknownGates = scenario.resolvedGateIds.filter((id) => !allGateIds.has(id));
  const unknownScopes = Object.keys(scenario.capacityOverrideByScope).filter((id) => !allScopeIds.has(id));
  if (unknownItems.length || unknownGates.length || unknownScopes.length) {
    throw new ScenarioReportValidationError(`Scenario references stale owner records: ${[...unknownItems, ...unknownGates, ...unknownScopes].join(", ")}. Refresh and recreate it.`);
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
  const scenarioScopes = scopes.map((candidate) => {
    const owner = portfolio.scopes.find((row) => row.scopeId === candidate.scopeId)!;
    return {
      ...candidate,
      items: [...candidate.items, ...owner.executionItems.filter((item) => included.has(item.id) && !candidate.items.some((base) => base.id === item.id))]
        .filter((item) => !excluded.has(item.id))
        .map((item) => scenario.estimateOverrideByItemId[item.id] ? { ...item, ...scenario.estimateOverrideByItemId[item.id] } : item),
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
  brief.caveats.value.push({ code: "SCENARIO_HYPOTHETICAL", message: `Hypothetical ${scenario.scenarioId}; canonical Reality r${realityRevision} was not mutated.` });
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
