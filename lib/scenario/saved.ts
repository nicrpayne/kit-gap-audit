import type { SuiteScenario } from "@/lib/instrument/useProject";
import { parseCapacityScenarioPlan, type CapacityScenarioPlanV1 } from "@/lib/scenario/capacityPlan";
import { parseDecisionPlans, type DecisionPlans } from "@/lib/scenario/decisionPlan";
import { parsePhasedCapacityPlan, type PhasedCapacityPlanV1 } from "@/lib/scenario/phasedCapacity";
import { parseSignalEstimate, type AcceptedSignalEstimate } from "@/lib/scope/signalEstimates";
import { acceptedEstimateIdentity, type AcceptedCapabilityEstimate } from "@/lib/scope/knowledgeEstimates";
import type { CapabilityStaffingPlan } from "@/lib/scope/capabilityForecast";

export const SAVED_SCENARIO_PAYLOAD_VERSION = "saved-scenario-payload.v1" as const;
export const SAVED_SCENARIO_BASELINE_VERSION = "saved-scenario-baseline.v1" as const;

/** JSON limits are enforced after canonical validation as well as at the HTTP
 * stream boundary. This is large enough for reviewed estimate rationale and
 * Scope drafts, without making a named what-if an arbitrary document store. */
export const MAX_SAVED_SCENARIO_BYTES = 256 * 1024;
export const MAX_SAVED_SCENARIO_REQUEST_BYTES = MAX_SAVED_SCENARIO_BYTES + 32 * 1024;
export const MAX_SAVED_SCENARIO_NAME_LENGTH = 120;

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_LEVER_ENTRIES = 2_000;
const MAX_TEXT_LENGTH = 8_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export class SavedScenarioValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "SavedScenarioValidationError";
  }
}

export interface SavedScenarioPayloadV1 {
  version: typeof SAVED_SCENARIO_PAYLOAD_VERSION;
  remainingEstimateByCapabilityId: Record<string, AcceptedSignalEstimate>;
  decisionPlans: DecisionPlans;
  capacityPlan: CapacityScenarioPlanV1 | null;
  phasedCapacityPlan: PhasedCapacityPlanV1 | null;
  capacityOverrideByScope: Record<string, number>;
  excludedItemIds: string[];
  includedItemIds: string[];
  resolvedGateIds: string[];
  estimateOverrideByItemId: Record<string, { low: number; likely: number; high: number }>;
  knowledgeEstimateByCapabilityId: Record<string, {
    estimateId: string;
    contextSnapshotId: string;
    low: number;
    likely: number;
    high: number;
  }>;
  capabilityStaffingById: Record<string, CapabilityStaffingPlan>;
  bypassedFeatureIds: string[];
  includedCapabilityIds: string[];
  draftFeatures: { id: string; name: string; intent: string; itemIds: string[] }[];
  acceptedCandidateIds: string[];
  scopeProposalSelections: SuiteScenario["scopeProposalSelections"];
  contextSwitchCostPct: number | null;
}

export interface SavedScenarioBaselineV1 {
  version: typeof SAVED_SCENARIO_BASELINE_VERSION;
  /** SHA-256 over the canonical, forecast-relevant portfolio structure. */
  fingerprint: string;
  /** Retained separately so a stale response can name revision movement. */
  scopeRevisionById: Record<string, number>;
}

export interface SavedScenarioBaselineSource {
  /** Forecast epoch as a calendar day. Time-of-day noise is deliberately
      discarded, but advancing to another UTC day changes phased timing. */
  startDate: Date | string;
  scopes: Array<{
    scopeId: string;
    targetDate: Date | string | null;
    dependsOnScopeIds: string[];
    items: Array<{
      id: string;
      low: number;
      likely: number;
      high: number;
      state?: string | null;
      status?: string | null;
    }>;
    forecastItems: Array<{ id: string; low: number; likely: number; high: number }>;
    gates: Array<{ id: string; low: number; likely: number; high: number }>;
    teamCapacity: number;
    capacitySource: string;
    explicitTeamCapacity: number | null;
    forecastSource: { provider: string; availability: string };
    executionSource: { provider: string; availability: string };
    forecastCoverage: unknown;
    executionState: string;
    realityState: { realityRevision: number };
    capabilities: Array<{
      id: string;
      status: string;
      revision: number;
      acceptedEstimate: AcceptedCapabilityEstimate | null;
    }>;
    /** Required even when the current package contains no estimates. */
    currentContextSnapshotId: string | null;
  }>;
  decisions?: Array<{
    id: string;
    scopeId: string;
    status: string;
    updatedAt?: Date | string;
    readinessRole?: string;
    gate: null | {
      id: string;
      targetScopeId: string;
      serial: boolean;
      dependency: string;
      evidenceForGate: string;
      low: number;
      likely: number;
      high: number;
    };
  }>;
  people: Array<{
    id: string;
    fte: number;
    externalCommitmentFte?: number;
    active: boolean;
    synthetic?: boolean;
  }>;
  allocations: Array<{ personId: string; scopeId: string; fraction: number }>;
  contextSwitchCostPct: number;
}

export type SavedScenarioBaselineDifference =
  | { kind: "scope_added"; scopeId: string; currentRevision: number }
  | { kind: "scope_removed"; scopeId: string; savedRevision: number }
  | { kind: "scope_revision_changed"; scopeId: string; savedRevision: number; currentRevision: number }
  | { kind: "portfolio_inputs_changed" };

export type SavedScenarioFreshness =
  | { state: "current"; stale: false; differences: [] }
  | { state: "stale"; stale: true; differences: SavedScenarioBaselineDifference[] }
  | { state: "unavailable"; stale: null; differences: []; reason: string };

export interface SavedScenarioLeverSummary {
  total: number;
  capacityPlans: number;
  phasedTransfers: number;
  capacityOverrides: number;
  workChanges: number;
  decisionChanges: number;
  estimateChanges: number;
  staffingChanges: number;
  capabilityChanges: number;
  scopeProposalChanges: number;
  draftCapabilities: number;
}

export interface SavedScenarioSummary {
  id: string;
  name: string;
  status: "active" | "archived";
  revision: number;
  baseline: SavedScenarioBaselineV1;
  freshness: SavedScenarioFreshness;
  levers: SavedScenarioLeverSummary;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archiveReason: string | null;
}

export interface SavedScenarioDetail extends SavedScenarioSummary {
  payload: SavedScenarioPayloadV1;
}

export interface SavedScenarioListEnvelope {
  scenarios: SavedScenarioSummary[];
  freshnessWarning: string | null;
}

export interface SavedScenarioDetailEnvelope {
  scenario: SavedScenarioDetail;
  reused?: boolean;
}

export interface CreateSavedScenarioRequest {
  name: string;
  payload: SavedScenarioPayloadV1;
  baseline: SavedScenarioBaselineV1;
  idempotencyKey: string;
}

export interface UpdateSavedScenarioRequest {
  expectedRevision: number;
  idempotencyKey: string;
  name?: string;
  archived?: boolean;
  archiveReason?: string | null;
  /** Explicit reviewed rebase: the exact payload and new baseline travel as
      one optimistic update and are never inferred by the server. */
  payload?: SavedScenarioPayloadV1;
  baseline?: SavedScenarioBaselineV1;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SavedScenarioValidationError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new SavedScenarioValidationError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(record: Record<string, unknown>, allowed: readonly string[], label: string) {
  const known = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new SavedScenarioValidationError(`${label} contains unsupported fields: ${unknown.sort().join(", ")}. No Scenario changes were dropped.`);
  }
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new SavedScenarioValidationError(`${label} must be a non-empty identifier up to ${MAX_IDENTIFIER_LENGTH} characters.`);
  }
  return value.trim();
}

function text(value: unknown, label: string, required = true): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH || (required && !value.trim())) {
    throw new SavedScenarioValidationError(`${label} must be ${required ? "non-empty " : ""}text up to ${MAX_TEXT_LENGTH.toLocaleString()} characters.`);
  }
  return value.trim();
}

function nullableIdentifier(value: unknown, label: string): string | null {
  return value === null ? null : identifier(value, label);
}

function recordEntries(value: unknown, label: string): [string, unknown][] {
  const record = plainRecord(value, label);
  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > MAX_LEVER_ENTRIES) throw new SavedScenarioValidationError(`${label} has too many entries.`);
  for (const [key] of entries) identifier(key, `${label} key`);
  if (entries.some(([key]) => FORBIDDEN_KEYS.has(key))) throw new SavedScenarioValidationError(`${label} contains an unsafe key.`);
  return entries;
}

function stringArray(value: unknown, label: string, ordered = false): string[] {
  if (!Array.isArray(value) || value.length > MAX_LEVER_ENTRIES) {
    throw new SavedScenarioValidationError(`${label} must be an array with at most ${MAX_LEVER_ENTRIES.toLocaleString()} identifiers.`);
  }
  const result = value.map((entry, index) => identifier(entry, `${label} item ${index + 1}`));
  if (new Set(result).size !== result.length) throw new SavedScenarioValidationError(`${label} cannot repeat an identifier.`);
  return ordered ? result : result.sort((left, right) => left.localeCompare(right));
}

function finiteNumber(value: unknown, label: string, minimum = 0, maximum = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new SavedScenarioValidationError(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new SavedScenarioValidationError(`${label} must be an integer of at least ${minimum}.`);
  }
  return value as number;
}

function range(value: unknown, label: string): { low: number; likely: number; high: number } {
  const row = plainRecord(value, label);
  rejectUnknown(row, ["low", "likely", "high"], label);
  const low = finiteNumber(row.low, `${label} low`);
  const likely = finiteNumber(row.likely, `${label} likely`);
  const high = finiteNumber(row.high, `${label} high`);
  if (low > likely || likely > high) throw new SavedScenarioValidationError(`${label} must satisfy 0 ≤ low ≤ likely ≤ high.`);
  return { low, likely, high };
}

function capacityOverrides(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [scopeId, candidate] of recordEntries(value, "Capacity overrides")) {
    out[scopeId] = finiteNumber(candidate, `Capacity override ${scopeId}`, Number.EPSILON);
  }
  return out;
}

function ranges(value: unknown): SavedScenarioPayloadV1["estimateOverrideByItemId"] {
  const out: SavedScenarioPayloadV1["estimateOverrideByItemId"] = {};
  for (const [itemId, candidate] of recordEntries(value, "Estimate overrides")) out[itemId] = range(candidate, `Estimate override ${itemId}`);
  return out;
}

function knowledgeEstimates(value: unknown): SavedScenarioPayloadV1["knowledgeEstimateByCapabilityId"] {
  const out: SavedScenarioPayloadV1["knowledgeEstimateByCapabilityId"] = {};
  for (const [capabilityId, candidate] of recordEntries(value, "Knowledge estimates")) {
    const row = plainRecord(candidate, `Knowledge estimate ${capabilityId}`);
    rejectUnknown(row, ["estimateId", "contextSnapshotId", "low", "likely", "high"], `Knowledge estimate ${capabilityId}`);
    out[capabilityId] = {
      estimateId: identifier(row.estimateId, `Knowledge estimate ${capabilityId} estimate`),
      contextSnapshotId: identifier(row.contextSnapshotId, `Knowledge estimate ${capabilityId} snapshot`),
      ...range({ low: row.low, likely: row.likely, high: row.high }, `Knowledge estimate ${capabilityId}`),
    };
  }
  return out;
}

function staffingPlans(value: unknown): Record<string, CapabilityStaffingPlan> {
  const out: Record<string, CapabilityStaffingPlan> = {};
  for (const [capabilityId, candidate] of recordEntries(value, "Capability staffing")) {
    const row = plainRecord(candidate, `Capability staffing ${capabilityId}`);
    rejectUnknown(row, ["contributors"], `Capability staffing ${capabilityId}`);
    if (!Array.isArray(row.contributors) || row.contributors.length === 0 || row.contributors.length > MAX_LEVER_ENTRIES) {
      throw new SavedScenarioValidationError(`Capability staffing ${capabilityId} requires named contributors.`);
    }
    const personIds = new Set<string>();
    const contributors = row.contributors.map((candidate, index) => {
      const contributor = plainRecord(candidate, `Capability staffing ${capabilityId} contributor ${index + 1}`);
      rejectUnknown(contributor, ["personId", "name", "fte"], `Capability staffing ${capabilityId} contributor ${index + 1}`);
      const personId = identifier(contributor.personId, `Capability staffing ${capabilityId} person`);
      if (personIds.has(personId)) throw new SavedScenarioValidationError(`Capability staffing ${capabilityId} repeats person ${personId}.`);
      personIds.add(personId);
      return {
        personId,
        name: text(contributor.name, `Capability staffing ${capabilityId} contributor name`),
        fte: finiteNumber(contributor.fte, `Capability staffing ${capabilityId} contributor FTE`, Number.EPSILON),
      };
    });
    out[capabilityId] = { contributors };
  }
  return out;
}

function remainingEstimates(value: unknown): Record<string, AcceptedSignalEstimate> {
  const out: Record<string, AcceptedSignalEstimate> = {};
  for (const [capabilityId, candidate] of recordEntries(value, "Remaining-work estimates")) {
    const row = plainRecord(candidate, `Remaining-work estimate ${capabilityId}`);
    rejectUnknown(row, ["version", "id", "capabilityId", "capabilityRevisionAtReview", "basis", "unit", "provenance", "input", "acceptedAt"], `Remaining-work estimate ${capabilityId}`);
    const input = plainRecord(row.input, `Remaining-work estimate ${capabilityId} input`);
    rejectUnknown(input, [
      "alreadyDone", "reuseFrom", "remainingWork", "rationale", "evidenceReference", "asOfDate",
      "reviewerDisplayName", "range", "coveredOpenItemIds", "additionalOpenItemIds",
    ], `Remaining-work estimate ${capabilityId} input`);
    range(input.range, `Remaining-work estimate ${capabilityId} range`);
    const parsed = parseSignalEstimate(candidate);
    if (!parsed || parsed.capabilityId !== capabilityId) throw new SavedScenarioValidationError(`Remaining-work estimate ${capabilityId} is invalid.`);
    out[capabilityId] = parsed;
  }
  return out;
}

function draftFeatures(value: unknown): SavedScenarioPayloadV1["draftFeatures"] {
  if (!Array.isArray(value) || value.length > MAX_LEVER_ENTRIES) throw new SavedScenarioValidationError("Draft capabilities must be an array.");
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    const row = plainRecord(candidate, `Draft capability ${index + 1}`);
    rejectUnknown(row, ["id", "name", "intent", "itemIds"], `Draft capability ${index + 1}`);
    const id = identifier(row.id, `Draft capability ${index + 1} id`);
    if (ids.has(id)) throw new SavedScenarioValidationError(`Draft capabilities repeat id ${id}.`);
    ids.add(id);
    return {
      id,
      name: text(row.name, `Draft capability ${id} name`),
      intent: text(row.intent, `Draft capability ${id} intent`, false),
      itemIds: stringArray(row.itemIds, `Draft capability ${id} work`, true),
    };
  });
}

function proposalSelections(value: unknown): SuiteScenario["scopeProposalSelections"] {
  if (!Array.isArray(value) || value.length > MAX_LEVER_ENTRIES) throw new SavedScenarioValidationError("Scope proposal selections must be an array.");
  const identities = new Set<string>();
  return value.map((candidate, index) => {
    const row = plainRecord(candidate, `Scope proposal selection ${index + 1}`);
    rejectUnknown(row, [
      "scopeId", "proposalId", "itemId", "title", "description", "sourceCapabilityId",
      "sourceAlreadyLinkedItemIds", "targetCapabilityId", "expectedRevision", "itemIds", "releaseStatus",
    ], `Scope proposal selection ${index + 1}`);
    const scopeId = identifier(row.scopeId, `Scope proposal selection ${index + 1} project`);
    const proposalId = identifier(row.proposalId, `Scope proposal selection ${index + 1} proposal`);
    const itemId = identifier(row.itemId, `Scope proposal selection ${index + 1} item`);
    const identity = `${scopeId}\u0000${proposalId}\u0000${itemId}`;
    if (identities.has(identity)) throw new SavedScenarioValidationError(`Scope proposal selection ${itemId} is repeated.`);
    identities.add(identity);
    if (row.releaseStatus !== "accepted" && row.releaseStatus !== "outside") {
      throw new SavedScenarioValidationError(`Scope proposal selection ${itemId} must be accepted or outside.`);
    }
    return {
      scopeId,
      proposalId,
      itemId,
      title: text(row.title, `Scope proposal selection ${itemId} title`),
      description: row.description === null ? null : text(row.description, `Scope proposal selection ${itemId} description`, false),
      sourceCapabilityId: nullableIdentifier(row.sourceCapabilityId, `Scope proposal selection ${itemId} source capability`),
      sourceAlreadyLinkedItemIds: stringArray(row.sourceAlreadyLinkedItemIds, `Scope proposal selection ${itemId} existing work`, true),
      targetCapabilityId: nullableIdentifier(row.targetCapabilityId, `Scope proposal selection ${itemId} target capability`),
      expectedRevision: row.expectedRevision === null ? null : integer(row.expectedRevision, `Scope proposal selection ${itemId} expected revision`),
      itemIds: stringArray(row.itemIds, `Scope proposal selection ${itemId} work`, true),
      releaseStatus: row.releaseStatus,
    };
  });
}

function decisionPlanRecord(value: unknown): DecisionPlans {
  try {
    const parsed = parseDecisionPlans(value);
    return Object.fromEntries(Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right)));
  } catch (error) {
    throw new SavedScenarioValidationError(error instanceof Error ? error.message : "Decision assumptions are invalid.");
  }
}

function strictAllocationRows(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new SavedScenarioValidationError(`${label} must be an array.`);
  value.forEach((candidate, index) => rejectUnknown(
    plainRecord(candidate, `${label} row ${index + 1}`),
    ["personId", "scopeId", "fraction"],
    `${label} row ${index + 1}`,
  ));
}

function strictCapacityBaseline(value: unknown, label: string) {
  const baseline = plainRecord(value, label);
  rejectUnknown(baseline, ["version", "fingerprint", "people", "allocations", "contextSwitchCostPct", "scopeRevisionById"], label);
  if (!Array.isArray(baseline.people)) throw new SavedScenarioValidationError(`${label} people must be an array.`);
  baseline.people.forEach((candidate, index) => rejectUnknown(
    plainRecord(candidate, `${label} person ${index + 1}`),
    ["id", "name", "fte", "externalCommitmentFte", "active"],
    `${label} person ${index + 1}`,
  ));
  strictAllocationRows(baseline.allocations, `${label} allocations`);
  plainRecord(baseline.scopeRevisionById, `${label} project revisions`);
}

function capacityPlan(value: unknown): CapacityScenarioPlanV1 | null {
  if (value === null) return null;
  const row = plainRecord(value, "Capacity plan");
  rejectUnknown(row, ["version", "allocations", "hypotheticalPeople", "requiredByScope", "contextSwitchCostPct", "baselineFingerprint"], "Capacity plan");
  strictCapacityBaseline(row.baselineFingerprint, "Capacity plan baseline");
  strictAllocationRows(row.allocations, "Capacity plan allocations");
  if (!Array.isArray(row.hypotheticalPeople)) throw new SavedScenarioValidationError("Capacity plan hypothetical people must be an array.");
  row.hypotheticalPeople.forEach((candidate, index) => rejectUnknown(
    plainRecord(candidate, `Capacity plan hypothetical person ${index + 1}`),
    ["id", "name", "fte", "active", "origin", "externalCommitmentFte"],
    `Capacity plan hypothetical person ${index + 1}`,
  ));
  plainRecord(row.requiredByScope, "Capacity plan shortfalls");
  try { return parseCapacityScenarioPlan(value); }
  catch (error) { throw new SavedScenarioValidationError(error instanceof Error ? error.message : "Capacity plan is invalid."); }
}

function phasedCapacityPlan(value: unknown): PhasedCapacityPlanV1 | null {
  if (value === null) return null;
  const row = plainRecord(value, "Phased capacity plan");
  rejectUnknown(row, ["version", "baselineFingerprint", "transfers"], "Phased capacity plan");
  strictCapacityBaseline(row.baselineFingerprint, "Phased capacity plan baseline");
  if (!Array.isArray(row.transfers)) throw new SavedScenarioValidationError("Phased capacity transfers must be an array.");
  row.transfers.forEach((candidate, index) => rejectUnknown(
    plainRecord(candidate, `Phased capacity transfer ${index + 1}`),
    ["id", "personId", "fromScopeId", "toScopeId", "fraction", "effectiveDate"],
    `Phased capacity transfer ${index + 1}`,
  ));
  try { return parsePhasedCapacityPlan(value); }
  catch (error) { throw new SavedScenarioValidationError(error instanceof Error ? error.message : "Phased capacity plan is invalid."); }
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function parseSavedScenarioPayload(value: unknown): SavedScenarioPayloadV1 {
  const raw = plainRecord(value, "Saved Scenario payload");
  rejectUnknown(raw, [
    "version", "remainingEstimateByCapabilityId", "decisionPlans", "capacityPlan", "phasedCapacityPlan",
    "capacityOverrideByScope", "excludedItemIds", "includedItemIds", "resolvedGateIds",
    "estimateOverrideByItemId", "knowledgeEstimateByCapabilityId", "capabilityStaffingById",
    "bypassedFeatureIds", "includedCapabilityIds", "draftFeatures", "acceptedCandidateIds",
    "scopeProposalSelections", "contextSwitchCostPct",
  ], "Saved Scenario payload");
  if (raw.version !== SAVED_SCENARIO_PAYLOAD_VERSION) throw new SavedScenarioValidationError("Saved Scenario payload version is unsupported.");
  const contextSwitchCostPct = raw.contextSwitchCostPct === null
    ? null
    : finiteNumber(raw.contextSwitchCostPct, "Scenario switch cost", 0, 100);
  const result: SavedScenarioPayloadV1 = {
    version: SAVED_SCENARIO_PAYLOAD_VERSION,
    remainingEstimateByCapabilityId: remainingEstimates(raw.remainingEstimateByCapabilityId),
    decisionPlans: decisionPlanRecord(raw.decisionPlans),
    capacityPlan: capacityPlan(raw.capacityPlan),
    phasedCapacityPlan: phasedCapacityPlan(raw.phasedCapacityPlan),
    capacityOverrideByScope: capacityOverrides(raw.capacityOverrideByScope),
    excludedItemIds: stringArray(raw.excludedItemIds, "Excluded work"),
    includedItemIds: stringArray(raw.includedItemIds, "Included work"),
    resolvedGateIds: stringArray(raw.resolvedGateIds, "Resolved gates"),
    estimateOverrideByItemId: ranges(raw.estimateOverrideByItemId),
    knowledgeEstimateByCapabilityId: knowledgeEstimates(raw.knowledgeEstimateByCapabilityId),
    capabilityStaffingById: staffingPlans(raw.capabilityStaffingById),
    bypassedFeatureIds: stringArray(raw.bypassedFeatureIds, "Excluded capabilities"),
    includedCapabilityIds: stringArray(raw.includedCapabilityIds, "Included capabilities"),
    draftFeatures: draftFeatures(raw.draftFeatures),
    acceptedCandidateIds: stringArray(raw.acceptedCandidateIds, "Accepted candidates"),
    scopeProposalSelections: proposalSelections(raw.scopeProposalSelections),
    contextSwitchCostPct,
  };
  if (utf8Bytes(result) > MAX_SAVED_SCENARIO_BYTES) throw new SavedScenarioValidationError(`Saved Scenario payload exceeds ${MAX_SAVED_SCENARIO_BYTES.toLocaleString()} bytes.`);
  if (!savedScenarioHasLevers(result)) throw new SavedScenarioValidationError("A named Scenario needs at least one explicit what-if lever.");
  return result;
}

type ScenarioWithPhasedCapacity = SuiteScenario & { phasedCapacityPlan?: PhasedCapacityPlanV1 | null };

export function encodeSavedScenario(scenario: ScenarioWithPhasedCapacity): SavedScenarioPayloadV1 {
  return parseSavedScenarioPayload({
    version: SAVED_SCENARIO_PAYLOAD_VERSION,
    remainingEstimateByCapabilityId: scenario.remainingEstimateByCapabilityId ?? {},
    decisionPlans: scenario.decisionPlans ?? {},
    capacityPlan: scenario.capacityPlan,
    phasedCapacityPlan: scenario.phasedCapacityPlan ?? null,
    capacityOverrideByScope: scenario.capacityOverrideByScope,
    excludedItemIds: [...scenario.excludedItemIds],
    includedItemIds: [...scenario.includedItemIds],
    resolvedGateIds: [...scenario.resolvedGateIds],
    estimateOverrideByItemId: scenario.estimateOverrideByItemId,
    knowledgeEstimateByCapabilityId: scenario.knowledgeEstimateByCapabilityId,
    capabilityStaffingById: scenario.capabilityStaffingById,
    bypassedFeatureIds: [...scenario.bypassedFeatureIds],
    includedCapabilityIds: [...scenario.includedCapabilityIds],
    draftFeatures: scenario.draftFeatures,
    acceptedCandidateIds: [...scenario.acceptedCandidateIds],
    scopeProposalSelections: scenario.scopeProposalSelections,
    contextSwitchCostPct: scenario.contextSwitchCostPct,
  });
}

export function decodeSavedScenario(value: unknown): ScenarioWithPhasedCapacity {
  const payload = parseSavedScenarioPayload(value);
  return {
    remainingEstimateByCapabilityId: payload.remainingEstimateByCapabilityId,
    decisionPlans: payload.decisionPlans,
    capacityPlan: payload.capacityPlan,
    phasedCapacityPlan: payload.phasedCapacityPlan,
    capacityOverrideByScope: payload.capacityOverrideByScope,
    excludedItemIds: new Set(payload.excludedItemIds),
    includedItemIds: new Set(payload.includedItemIds),
    resolvedGateIds: new Set(payload.resolvedGateIds),
    estimateOverrideByItemId: payload.estimateOverrideByItemId,
    knowledgeEstimateByCapabilityId: payload.knowledgeEstimateByCapabilityId,
    capabilityStaffingById: payload.capabilityStaffingById,
    bypassedFeatureIds: new Set(payload.bypassedFeatureIds),
    includedCapabilityIds: new Set(payload.includedCapabilityIds),
    draftFeatures: payload.draftFeatures,
    acceptedCandidateIds: new Set(payload.acceptedCandidateIds),
    scopeProposalSelections: payload.scopeProposalSelections,
    contextSwitchCostPct: payload.contextSwitchCostPct,
  };
}

export function savedScenarioHasLevers(payload: SavedScenarioPayloadV1): boolean {
  return Boolean(
    Object.keys(payload.remainingEstimateByCapabilityId).length ||
    Object.keys(payload.decisionPlans).length ||
    payload.capacityPlan ||
    payload.phasedCapacityPlan ||
    Object.keys(payload.capacityOverrideByScope).length ||
    payload.excludedItemIds.length || payload.includedItemIds.length || payload.resolvedGateIds.length ||
    Object.keys(payload.estimateOverrideByItemId).length ||
    Object.keys(payload.knowledgeEstimateByCapabilityId).length ||
    Object.keys(payload.capabilityStaffingById).length ||
    payload.bypassedFeatureIds.length || payload.includedCapabilityIds.length || payload.draftFeatures.length ||
    payload.acceptedCandidateIds.length || payload.scopeProposalSelections.length ||
    payload.contextSwitchCostPct !== null
  );
}

export function summarizeSavedScenarioLevers(payload: SavedScenarioPayloadV1): SavedScenarioLeverSummary {
  const summary = {
    capacityPlans: payload.capacityPlan ? 1 : 0,
    phasedTransfers: payload.phasedCapacityPlan?.transfers.length ?? 0,
    capacityOverrides: Object.keys(payload.capacityOverrideByScope).length + (payload.contextSwitchCostPct === null ? 0 : 1),
    workChanges: payload.excludedItemIds.length + payload.includedItemIds.length,
    decisionChanges: payload.resolvedGateIds.length + Object.keys(payload.decisionPlans).length,
    estimateChanges: Object.keys(payload.estimateOverrideByItemId).length + Object.keys(payload.knowledgeEstimateByCapabilityId).length + Object.keys(payload.remainingEstimateByCapabilityId).length,
    staffingChanges: Object.keys(payload.capabilityStaffingById).length,
    capabilityChanges: payload.bypassedFeatureIds.length + payload.includedCapabilityIds.length + payload.acceptedCandidateIds.length,
    scopeProposalChanges: payload.scopeProposalSelections.length,
    draftCapabilities: payload.draftFeatures.length,
  };
  return { ...summary, total: Object.values(summary).reduce((total, count) => total + count, 0) };
}

function canonicalJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SavedScenarioValidationError("Scenario baseline contains a non-finite number.");
    return value;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new SavedScenarioValidationError("Scenario baseline contains an invalid date.");
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const candidate = (value as Record<string, unknown>)[key];
      if (candidate !== undefined) result[key] = canonicalJson(candidate);
    }
    return result;
  }
  throw new SavedScenarioValidationError("Scenario baseline contains a non-JSON value.");
}

function dateOnly(value: Date | string | null, label: string): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new SavedScenarioValidationError(`${label} is invalid.`);
  return parsed.toISOString().slice(0, 10);
}

function isoDate(value: Date | string | undefined, label: string): string | null {
  if (value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new SavedScenarioValidationError(`${label} is invalid.`);
  return parsed.toISOString();
}

async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalJson(value)));
  if (!globalThis.crypto?.subtle) throw new SavedScenarioValidationError("This runtime cannot fingerprint Scenario inputs safely.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Build the exact baseline shared by browser staging and server validation.
 * It deliberately excludes read timestamps, report history and display-only
 * labels, while retaining every structural input that can change the modeled
 * what-if or its coverage claim. */
export async function buildSavedScenarioBaseline(source: SavedScenarioBaselineSource): Promise<SavedScenarioBaselineV1> {
  const scopeIds = new Set<string>();
  const scopeRevisionById: Record<string, number> = {};
  const scopes = source.scopes.map((scope) => {
    const scopeId = identifier(scope.scopeId, "Scenario baseline project id");
    if (scopeIds.has(scopeId)) throw new SavedScenarioValidationError(`Scenario baseline repeats project ${scopeId}.`);
    scopeIds.add(scopeId);
    const realityRevision = integer(scope.realityState.realityRevision, `Scenario baseline revision for ${scopeId}`);
    scopeRevisionById[scopeId] = realityRevision;
    return {
      scopeId,
      realityRevision,
      targetDate: dateOnly(scope.targetDate, `Scenario baseline target for ${scopeId}`),
      dependsOnScopeIds: [...new Set(scope.dependsOnScopeIds.map((id) => identifier(id, `Scenario baseline dependency for ${scopeId}`)))].sort(),
      items: scope.items.map((item) => ({
        id: identifier(item.id, `Scenario baseline work for ${scopeId}`),
        ...range({ low: item.low, likely: item.likely, high: item.high }, `Scenario baseline work ${item.id}`),
        status: item.state ?? item.status ?? null,
      })).sort((left, right) => left.id.localeCompare(right.id)),
      forecastItems: scope.forecastItems.map((item) => ({
        id: identifier(item.id, `Scenario baseline forecast work for ${scopeId}`),
        ...range({ low: item.low, likely: item.likely, high: item.high }, `Scenario baseline forecast work ${item.id}`),
      })).sort((left, right) => left.id.localeCompare(right.id)),
      gates: scope.gates.map((gate) => ({
        id: identifier(gate.id, `Scenario baseline gate for ${scopeId}`),
        ...range({ low: gate.low, likely: gate.likely, high: gate.high }, `Scenario baseline gate ${gate.id}`),
      })).sort((left, right) => left.id.localeCompare(right.id)),
      // Baseline capture must also work while Reality is honestly unstaffed;
      // preview/refusal owns forecast viability. Fingerprinting a zero does
      // not invent capacity or make the Scenario applicable.
      teamCapacity: finiteNumber(scope.teamCapacity, `Scenario baseline capacity for ${scopeId}`, 0),
      capacitySource: identifier(scope.capacitySource, `Scenario baseline capacity source for ${scopeId}`),
      explicitTeamCapacity: scope.explicitTeamCapacity === null ? null : finiteNumber(scope.explicitTeamCapacity, `Scenario baseline explicit capacity for ${scopeId}`, 0),
      forecastSource: { provider: scope.forecastSource.provider, availability: scope.forecastSource.availability },
      executionSource: { provider: scope.executionSource.provider, availability: scope.executionSource.availability },
      forecastCoverage: canonicalJson(scope.forecastCoverage),
      executionState: scope.executionState,
      capabilities: scope.capabilities.map((capability) => ({
        id: identifier(capability.id, `Scenario baseline capability for ${scopeId}`),
        status: capability.status,
        revision: integer(capability.revision, `Scenario baseline capability revision for ${capability.id}`),
        acceptedEstimate: capability.acceptedEstimate ? acceptedEstimateIdentity(capability.acceptedEstimate) : null,
      })).sort((left, right) => left.id.localeCompare(right.id)),
      currentContextSnapshotId: scope.currentContextSnapshotId,
    };
  }).sort((left, right) => left.scopeId.localeCompare(right.scopeId));

  const decisions = (source.decisions ?? []).map((decision) => ({
    id: identifier(decision.id, "Scenario baseline Decision id"),
    scopeId: identifier(decision.scopeId, `Scenario baseline Decision ${decision.id} project`),
    status: decision.status,
    updatedAt: isoDate(decision.updatedAt, `Scenario baseline Decision ${decision.id} timestamp`),
    readinessRole: decision.readinessRole ?? "needs_review",
    gate: decision.gate ? {
      id: identifier(decision.gate.id, `Scenario baseline Decision ${decision.id} gate`),
      targetScopeId: identifier(decision.gate.targetScopeId, `Scenario baseline Decision ${decision.id} target`),
      serial: decision.gate.serial,
      dependency: decision.gate.dependency,
      evidenceForGate: decision.gate.evidenceForGate,
      ...range({ low: decision.gate.low, likely: decision.gate.likely, high: decision.gate.high }, `Scenario baseline Decision ${decision.id} gate`),
    } : null,
  })).sort((left, right) => left.id.localeCompare(right.id));

  const people = source.people.map((person) => ({
    id: identifier(person.id, "Scenario baseline person id"),
    fte: finiteNumber(person.fte, `Scenario baseline FTE for ${person.id}`, 0),
    externalCommitmentFte: finiteNumber(person.externalCommitmentFte ?? 0, `Scenario baseline outside commitment for ${person.id}`),
    active: person.active,
    synthetic: person.synthetic ?? false,
  })).sort((left, right) => left.id.localeCompare(right.id));

  const allocations = source.allocations.map((allocation) => ({
    personId: identifier(allocation.personId, "Scenario baseline allocation person"),
    scopeId: identifier(allocation.scopeId, "Scenario baseline allocation project"),
    fraction: finiteNumber(allocation.fraction, "Scenario baseline allocation fraction", 0, 1),
  })).sort((left, right) => left.personId.localeCompare(right.personId) || left.scopeId.localeCompare(right.scopeId));

  const structuralInputs = {
    startDate: dateOnly(source.startDate, "Scenario baseline forecast start"),
    scopes,
    decisions,
    people,
    allocations,
    contextSwitchCostPct: finiteNumber(source.contextSwitchCostPct, "Scenario baseline switch cost", 0, 100),
  };
  return {
    version: SAVED_SCENARIO_BASELINE_VERSION,
    fingerprint: await sha256(structuralInputs),
    scopeRevisionById: Object.fromEntries(Object.entries(scopeRevisionById).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function parseSavedScenarioBaseline(value: unknown): SavedScenarioBaselineV1 {
  const raw = plainRecord(value, "Saved Scenario baseline");
  rejectUnknown(raw, ["version", "fingerprint", "scopeRevisionById"], "Saved Scenario baseline");
  if (raw.version !== SAVED_SCENARIO_BASELINE_VERSION) throw new SavedScenarioValidationError("Saved Scenario baseline version is unsupported.");
  if (typeof raw.fingerprint !== "string" || !SHA256_PATTERN.test(raw.fingerprint)) throw new SavedScenarioValidationError("Saved Scenario baseline fingerprint is invalid.");
  const scopeRevisionById: Record<string, number> = {};
  for (const [scopeId, revision] of recordEntries(raw.scopeRevisionById, "Saved Scenario project revisions")) {
    scopeRevisionById[scopeId] = integer(revision, `Saved Scenario project revision for ${scopeId}`);
  }
  return { version: SAVED_SCENARIO_BASELINE_VERSION, fingerprint: raw.fingerprint, scopeRevisionById };
}

export function compareSavedScenarioBaseline(savedValue: unknown, currentValue: unknown): Exclude<SavedScenarioFreshness, { state: "unavailable" }> {
  const saved = parseSavedScenarioBaseline(savedValue);
  const current = parseSavedScenarioBaseline(currentValue);
  const differences: SavedScenarioBaselineDifference[] = [];
  const ids = [...new Set([...Object.keys(saved.scopeRevisionById), ...Object.keys(current.scopeRevisionById)])].sort();
  for (const scopeId of ids) {
    const savedRevision = saved.scopeRevisionById[scopeId];
    const currentRevision = current.scopeRevisionById[scopeId];
    if (savedRevision === undefined) differences.push({ kind: "scope_added", scopeId, currentRevision });
    else if (currentRevision === undefined) differences.push({ kind: "scope_removed", scopeId, savedRevision });
    else if (savedRevision !== currentRevision) differences.push({ kind: "scope_revision_changed", scopeId, savedRevision, currentRevision });
  }
  if (saved.fingerprint !== current.fingerprint) differences.push({ kind: "portfolio_inputs_changed" });
  return differences.length ? { state: "stale", stale: true, differences } : { state: "current", stale: false, differences: [] };
}

export function unavailableSavedScenarioFreshness(error: unknown): SavedScenarioFreshness {
  return {
    state: "unavailable",
    stale: null,
    differences: [],
    reason: error instanceof Error ? error.message : "Current Reality could not be read, so Scenario freshness is unknown.",
  };
}

export function parseSavedScenarioName(value: unknown): { name: string; normalizedName: string } {
  if (typeof value !== "string") throw new SavedScenarioValidationError("Scenario name is required.");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_SAVED_SCENARIO_NAME_LENGTH) {
    throw new SavedScenarioValidationError(`Scenario name must be 1–${MAX_SAVED_SCENARIO_NAME_LENGTH} characters.`);
  }
  return { name, normalizedName: name.toLocaleLowerCase("en-US") };
}

export function parseSavedScenarioIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") throw new SavedScenarioValidationError("idempotencyKey is required.");
  const key = value.trim();
  if (key.length < 8 || key.length > 200 || !/^[a-zA-Z0-9._:-]+$/.test(key)) {
    throw new SavedScenarioValidationError("idempotencyKey must be 8–200 URL-safe characters.");
  }
  return key;
}

export async function savedScenarioRequestFingerprint(value: unknown): Promise<string> {
  return sha256(value);
}

export async function readSavedScenarioJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SAVED_SCENARIO_REQUEST_BYTES) {
    throw new SavedScenarioValidationError(`Request exceeds ${MAX_SAVED_SCENARIO_REQUEST_BYTES.toLocaleString()} bytes.`);
  }
  if (!request.body) throw new SavedScenarioValidationError("A JSON request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_SAVED_SCENARIO_REQUEST_BYTES) {
      await reader.cancel();
      throw new SavedScenarioValidationError(`Request exceeds ${MAX_SAVED_SCENARIO_REQUEST_BYTES.toLocaleString()} bytes.`);
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try { return JSON.parse(body); }
  catch { throw new SavedScenarioValidationError("Request body must be valid JSON."); }
}
