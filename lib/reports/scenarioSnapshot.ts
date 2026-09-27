import {
  parseCapacityScenarioPlan,
  type CapacityAssumptionLedgerV1,
  type CapacityScenarioPlanV1,
} from "@/lib/scenario/capacityPlan";
import type { CapabilityStaffingPlan } from "@/lib/scope/capabilityForecast";
import { countScenarioReportLevers } from "./scenarioConflicts";

export const LEGACY_SCENARIO_REPORT_VERSION = "scenario-report.v1" as const;
export const SCENARIO_REPORT_VERSION = "scenario-report.v2" as const;

export interface ScenarioReportSnapshotV1 {
  version: typeof LEGACY_SCENARIO_REPORT_VERSION | typeof SCENARIO_REPORT_VERSION;
  scenarioId: string;
  baseRealityRevision: number;
  excludedItemIds: string[];
  includedItemIds: string[];
  resolvedGateIds: string[];
  estimateOverrideByItemId: Record<string, { low: number; likely: number; high: number }>;
  capacityOverrideByScope: Record<string, number>;
  /** Exact named capacity owner. Null only for legacy aggregate snapshots or
      Scenarios without a capacity lever. */
  capacityPlan: CapacityScenarioPlanV1 | null;
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
    capacityLedger?: CapacityAssumptionLedgerV1;
  };
}

export class ScenarioReportValidationError extends Error {
  readonly status = 409;
}

function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ScenarioReportValidationError(`${label} must be an array of non-empty identifiers. No Scenario changes were dropped.`);
  }
  return [...new Set(value.map((item: string) => item.trim()))];
}

function entries(value: unknown, label: string): [string, unknown][] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new ScenarioReportValidationError(`${label} must be an object keyed by identifier. No Scenario changes were dropped.`);
  }
  const rows = Object.entries(value);
  if (rows.some(([id]) => !id.trim() || ["__proto__", "constructor", "prototype"].includes(id))) {
    throw new ScenarioReportValidationError(`${label} contains an invalid identifier.`);
  }
  return rows;
}

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
  const knownFields = new Set([
    "version", "scenarioId", "baseRealityRevision", "excludedItemIds", "includedItemIds",
    "resolvedGateIds", "estimateOverrideByItemId", "capacityOverrideByScope", "capacityPlan",
    "contextSwitchCostPct", "excludedCapabilityIds", "knowledgeEstimateByCapabilityId",
    "capabilityStaffingById", "computed",
  ]);
  const unknownFields = Object.keys(raw).filter((key) => !knownFields.has(key));
  if (unknownFields.length) {
    throw new ScenarioReportValidationError(`Unsupported Scenario fields: ${unknownFields.join(", ")}. Refresh the controls; no changes were silently dropped.`);
  }
  const version = raw.version;
  if (version !== LEGACY_SCENARIO_REPORT_VERSION && version !== SCENARIO_REPORT_VERSION) {
    throw new ScenarioReportValidationError("Scenario report version is unsupported.");
  }
  const scenarioId = typeof raw.scenarioId === "string" ? raw.scenarioId.trim() : "";
  const baseRealityRevision = raw.baseRealityRevision;
  if (!scenarioId || !/^[a-zA-Z0-9._:-]{3,120}$/.test(scenarioId)) throw new ScenarioReportValidationError("scenarioId must be a stable 3–120 character identifier.");
  if (!Number.isInteger(baseRealityRevision) || (baseRealityRevision as number) < 0) throw new ScenarioReportValidationError("baseRealityRevision is required.");

  const estimates: ScenarioReportSnapshotV1["estimateOverrideByItemId"] = {};
  {
    for (const [id, candidate] of entries(raw.estimateOverrideByItemId, "Estimate overrides")) {
      estimates[id] = range(candidate, `Estimate override ${id}`);
    }
  }
  const capacity: Record<string, number> = {};
  {
    for (const [scopeId, candidate] of entries(raw.capacityOverrideByScope, "Capacity projections")) {
      if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) throw new ScenarioReportValidationError(`Capacity override ${scopeId} must be greater than zero.`);
      capacity[scopeId] = candidate;
    }
  }
  let capacityPlan: CapacityScenarioPlanV1 | null = null;
  if (raw.capacityPlan !== null && raw.capacityPlan !== undefined) {
    try {
      capacityPlan = parseCapacityScenarioPlan(raw.capacityPlan);
    } catch (error) {
      throw new ScenarioReportValidationError(error instanceof Error ? error.message : "Capacity plan is invalid.");
    }
  }
  const contextSwitchCostPct = raw.contextSwitchCostPct === null || raw.contextSwitchCostPct === undefined
    ? null
    : typeof raw.contextSwitchCostPct === "number" && raw.contextSwitchCostPct >= 0 && raw.contextSwitchCostPct <= 100
      ? raw.contextSwitchCostPct
      : (() => { throw new ScenarioReportValidationError("contextSwitchCostPct must be between 0 and 100."); })();
  const knowledge: ScenarioReportSnapshotV1["knowledgeEstimateByCapabilityId"] = {};
  {
    for (const [capabilityId, candidate] of entries(raw.knowledgeEstimateByCapabilityId, "Knowledge estimates")) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new ScenarioReportValidationError(`Knowledge estimate ${capabilityId} is invalid.`);
      const value = candidate as Record<string, unknown>;
      const estimateId = typeof value.estimateId === "string" ? value.estimateId.trim() : "";
      const contextSnapshotId = typeof value.contextSnapshotId === "string" ? value.contextSnapshotId.trim() : "";
      if (!estimateId || !contextSnapshotId) throw new ScenarioReportValidationError(`Knowledge estimate ${capabilityId} must retain its estimate and context snapshot ids.`);
      knowledge[capabilityId] = { estimateId, contextSnapshotId, ...range(value, `Knowledge estimate ${capabilityId}`) };
    }
  }
  const staffing: ScenarioReportSnapshotV1["capabilityStaffingById"] = {};
  {
    for (const [capabilityId, candidate] of entries(raw.capabilityStaffingById, "Capability staffing")) {
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
    version,
    scenarioId,
    baseRealityRevision: baseRealityRevision as number,
    excludedItemIds: strings(raw.excludedItemIds, "Excluded work"),
    includedItemIds: strings(raw.includedItemIds, "Included work"),
    resolvedGateIds: strings(raw.resolvedGateIds, "Resolved gates"),
    estimateOverrideByItemId: estimates,
    capacityOverrideByScope: capacity,
    capacityPlan,
    contextSwitchCostPct,
    excludedCapabilityIds: strings(raw.excludedCapabilityIds, "Excluded capabilities"),
    knowledgeEstimateByCapabilityId: knowledge,
    capabilityStaffingById: staffing,
  };
  const leverCount = countScenarioReportLevers({
    ...snapshot,
    estimateOverrideIds: Object.keys(estimates),
    knowledgeCapabilityIds: Object.keys(knowledge),
    staffingCapabilityIds: Object.keys(staffing),
    capacityOverrideScopeIds: Object.keys(capacity),
    hasCapacityPlan: capacityPlan !== null,
  });
  if (leverCount === 0) throw new ScenarioReportValidationError("Scenario reports require at least one explicit hypothetical lever.");
  return snapshot;
}
