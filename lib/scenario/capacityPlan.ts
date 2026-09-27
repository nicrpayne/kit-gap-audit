import {
  validateAllocations,
  type AllocationLike,
  type PersonLike,
} from "@/lib/capacity/resolve";
import type { ScenarioInputDelta } from "@/lib/scenario/inputDelta";
import { readChannel, readMaster } from "@/lib/capacity/workforce";

export const CAPACITY_SCENARIO_PLAN_VERSION = "capacity-scenario-plan.v1" as const;
export const CAPACITY_PLAN_BASELINE_VERSION = "capacity-plan-baseline.v1" as const;

const EPSILON = 1e-6;

export interface CapacityPlanBaselinePerson {
  id: string;
  name: string;
  fte: number;
  externalCommitmentFte: number;
  active: boolean;
}

/**
 * The exact owner state against which a capacity Scenario was staged.
 *
 * `fingerprint` makes equality cheap; the canonical inputs remain beside it
 * so a saved report preserves the roster, outside commitments, allocations,
 * switch policy, and every project revision it actually validated. This is a
 * consistency fingerprint, not an authentication signature.
 */
export interface CapacityPlanBaselineFingerprintV1 {
  version: typeof CAPACITY_PLAN_BASELINE_VERSION;
  fingerprint: string;
  people: CapacityPlanBaselinePerson[];
  allocations: AllocationLike[];
  contextSwitchCostPct: number;
  scopeRevisionById: Record<string, number>;
}

export interface HypotheticalCapacityPerson extends PersonLike {
  origin: "hypothetical-hire";
}

export interface CapacityScenarioPlanV1 {
  version: typeof CAPACITY_SCENARIO_PLAN_VERSION;
  /** Complete hypothetical allocation picture, not a partial patch. */
  allocations: AllocationLike[];
  /** The only plan entries allowed to increase the finite workforce. */
  hypotheticalPeople: HypotheticalCapacityPerson[];
  /** Requested but unstaffed capacity. It is never passed to simulation. */
  requiredByScope: Record<string, number>;
  contextSwitchCostPct: number;
  baselineFingerprint: CapacityPlanBaselineFingerprintV1;
}

export interface CapacityPlanBaselineInput {
  people: PersonLike[];
  allocations: AllocationLike[];
  contextSwitchCostPct: number;
  scopeRevisionById: Record<string, number>;
}

export interface CreateCapacityScenarioPlanInput {
  baseline: CapacityPlanBaselineFingerprintV1;
  allocations: AllocationLike[];
  hypotheticalPeople: HypotheticalCapacityPerson[];
  requiredByScope: Record<string, number>;
  contextSwitchCostPct: number;
}

export type CapacityPlanValidation = { ok: true } | { ok: false; reason: string };

export interface CapacityAssumptionLedgerV1 {
  version: "capacity-assumption-ledger.v1";
  baseline: {
    workforceFte: number;
    trackedAllocationFte: number;
    externalCommitmentFte: number;
    freeFte: number;
    effectiveFte: number;
    contextSwitchCostPct: number;
  };
  scenario: {
    workforceFte: number;
    trackedAllocationFte: number;
    externalCommitmentFte: number;
    freeFte: number;
    effectiveFte: number;
    contextSwitchCostPct: number;
    hypotheticalHireFte: number;
    requiredFte: number;
    requiredByScope: Record<string, number>;
    effectiveByScope: Record<string, number>;
  };
}

function finiteNumber(value: unknown, label: string, minimum = 0, maximum = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function stringId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function canonicalAllocations(value: unknown, label: string): AllocationLike[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const pairs = new Set<string>();
  const rows = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`${label} row ${index + 1} is invalid.`);
    }
    const row = candidate as Record<string, unknown>;
    const personId = stringId(row.personId, `${label} person`);
    const scopeId = stringId(row.scopeId, `${label} project`);
    const fraction = finiteNumber(row.fraction, `${label} fraction`, 0, 1);
    const pair = `${personId}\u0000${scopeId}`;
    if (pairs.has(pair)) throw new Error(`${label} repeats the allocation for ${personId} on ${scopeId}.`);
    pairs.add(pair);
    return { personId, scopeId, fraction };
  });
  return rows
    .filter((row) => row.fraction > EPSILON)
    .sort((a, b) => a.personId.localeCompare(b.personId) || a.scopeId.localeCompare(b.scopeId));
}

function canonicalScopeRevisions(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capacity baseline project revisions are required.");
  const out: Record<string, number> = {};
  for (const [rawId, candidate] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    const id = stringId(rawId, "Capacity baseline project id");
    if (!Number.isInteger(candidate) || (candidate as number) < 0) throw new Error(`Capacity baseline revision for ${id} is invalid.`);
    out[id] = candidate as number;
  }
  return out;
}

function canonicalBaselinePeople(value: unknown): CapacityPlanBaselinePerson[] {
  if (!Array.isArray(value)) throw new Error("Capacity baseline people must be an array.");
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`Capacity baseline person ${index + 1} is invalid.`);
    const person = candidate as Record<string, unknown>;
    const id = stringId(person.id, "Capacity baseline person id");
    if (ids.has(id)) throw new Error(`Capacity baseline repeats person ${id}.`);
    ids.add(id);
    const fte = finiteNumber(person.fte, `Capacity baseline FTE for ${id}`, Number.EPSILON);
    const externalCommitmentFte = person.externalCommitmentFte === undefined
      ? 0
      : finiteNumber(person.externalCommitmentFte, `Outside commitment for ${id}`, 0, fte);
    if (typeof person.active !== "boolean") throw new Error(`Capacity baseline active state for ${id} is required.`);
    return {
      id,
      name: typeof person.name === "string" && person.name.trim() ? person.name.trim() : id,
      fte,
      externalCommitmentFte,
      active: person.active,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function stableFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}:${text.length}`;
}

function exactBaselineInputs(value: CapacityPlanBaselineFingerprintV1): string {
  return JSON.stringify({
    // Names are labels, not forecast inputs. Preserve the staged labels in
    // the snapshot, but a harmless relabel must not invalidate the plan.
    people: value.people.map(({ id, fte, externalCommitmentFte, active }) => ({ id, fte, externalCommitmentFte, active })),
    allocations: value.allocations,
    contextSwitchCostPct: value.contextSwitchCostPct,
    scopeRevisionById: value.scopeRevisionById,
  });
}

function assertKnownAllocations(
  allocations: AllocationLike[],
  people: PersonLike[],
  scopeRevisionById: Record<string, number>,
) {
  const peopleById = new Set(people.map((person) => person.id));
  const scopeIds = new Set(Object.keys(scopeRevisionById));
  for (const allocation of allocations) {
    if (!peopleById.has(allocation.personId)) throw new Error(`Capacity plan references unknown person ${allocation.personId}.`);
    if (!scopeIds.has(allocation.scopeId)) throw new Error(`Capacity plan references unknown project ${allocation.scopeId}.`);
  }
  const overAllocated = validateAllocations(people, allocations);
  if (overAllocated.length) {
    const first = overAllocated[0];
    throw new Error(`${first.personName} is over-allocated at ${(first.totalFraction * 100).toFixed(0)}%; outside commitments remain reserved.`);
  }
}

export function buildCapacityPlanBaseline(input: CapacityPlanBaselineInput): CapacityPlanBaselineFingerprintV1 {
  const people = canonicalBaselinePeople(input.people);
  const allocations = canonicalAllocations(input.allocations, "Capacity baseline allocations");
  const contextSwitchCostPct = finiteNumber(input.contextSwitchCostPct, "Capacity baseline switch cost", 0, 100);
  const scopeRevisionById = canonicalScopeRevisions(input.scopeRevisionById);
  assertKnownAllocations(allocations, people, scopeRevisionById);
  const payload = { people, allocations, contextSwitchCostPct, scopeRevisionById };
  const baseline: CapacityPlanBaselineFingerprintV1 = {
    version: CAPACITY_PLAN_BASELINE_VERSION,
    fingerprint: "",
    ...payload,
  };
  baseline.fingerprint = stableFingerprint(JSON.parse(exactBaselineInputs(baseline)));
  return baseline;
}

export function parseCapacityPlanBaseline(value: unknown): CapacityPlanBaselineFingerprintV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capacity plan baseline fingerprint is required.");
  const raw = value as Record<string, unknown>;
  if (raw.version !== CAPACITY_PLAN_BASELINE_VERSION) throw new Error("Capacity plan baseline version is unsupported.");
  const baseline = buildCapacityPlanBaseline({
    people: raw.people as PersonLike[],
    allocations: raw.allocations as AllocationLike[],
    contextSwitchCostPct: raw.contextSwitchCostPct as number,
    scopeRevisionById: raw.scopeRevisionById as Record<string, number>,
  });
  if (raw.fingerprint !== baseline.fingerprint) throw new Error("Capacity plan baseline fingerprint does not match its exact inputs.");
  return baseline;
}

function canonicalHypotheticalPeople(value: unknown, baseline: CapacityPlanBaselineFingerprintV1): HypotheticalCapacityPerson[] {
  if (!Array.isArray(value)) throw new Error("Capacity plan hypothetical hires must be an array.");
  const baselineIds = new Set(baseline.people.map((person) => person.id));
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`Hypothetical hire ${index + 1} is invalid.`);
    const person = candidate as Record<string, unknown>;
    const id = stringId(person.id, "Hypothetical hire id");
    if (baselineIds.has(id) || ids.has(id)) throw new Error(`Hypothetical hire id ${id} is not unique.`);
    ids.add(id);
    if (person.origin !== "hypothetical-hire") throw new Error(`Hypothetical hire ${id} must retain its explicit origin.`);
    if (person.active !== true) throw new Error(`Hypothetical hire ${id} must be active for the scenario.`);
    const external = person.externalCommitmentFte ?? 0;
    if (external !== 0) throw new Error(`Hypothetical hire ${id} cannot invent an outside commitment.`);
    return {
      id,
      name: typeof person.name === "string" && person.name.trim() ? person.name.trim() : id,
      fte: finiteNumber(person.fte, `Hypothetical hire FTE for ${id}`, Number.EPSILON),
      active: true,
      origin: "hypothetical-hire" as const,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function canonicalRequired(value: unknown, scopeRevisionById: Record<string, number>): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capacity plan shortfalls must be an object.");
  const out: Record<string, number> = {};
  for (const [scopeId, candidate] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(scopeId in scopeRevisionById)) throw new Error(`Capacity plan shortfall references unknown project ${scopeId}.`);
    const fte = finiteNumber(candidate, `Capacity shortfall for ${scopeId}`, 0);
    if (fte > EPSILON) out[scopeId] = fte;
  }
  return out;
}

export function createCapacityScenarioPlan(input: CreateCapacityScenarioPlanInput): CapacityScenarioPlanV1 {
  return parseCapacityScenarioPlan({
    version: CAPACITY_SCENARIO_PLAN_VERSION,
    allocations: input.allocations,
    hypotheticalPeople: input.hypotheticalPeople,
    requiredByScope: input.requiredByScope,
    contextSwitchCostPct: input.contextSwitchCostPct,
    baselineFingerprint: input.baseline,
  });
}

export function parseCapacityScenarioPlan(value: unknown): CapacityScenarioPlanV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A complete capacity plan is required.");
  const raw = value as Record<string, unknown>;
  if (raw.version !== CAPACITY_SCENARIO_PLAN_VERSION) throw new Error("Capacity plan version is unsupported.");
  const baselineFingerprint = parseCapacityPlanBaseline(raw.baselineFingerprint);
  const hypotheticalPeople = canonicalHypotheticalPeople(raw.hypotheticalPeople, baselineFingerprint);
  const allocations = canonicalAllocations(raw.allocations, "Capacity plan allocations");
  const requiredByScope = canonicalRequired(raw.requiredByScope, baselineFingerprint.scopeRevisionById);
  const contextSwitchCostPct = finiteNumber(raw.contextSwitchCostPct, "Capacity plan switch cost", 0, 100);
  assertKnownAllocations(
    allocations,
    [...baselineFingerprint.people, ...hypotheticalPeople],
    baselineFingerprint.scopeRevisionById,
  );
  return {
    version: CAPACITY_SCENARIO_PLAN_VERSION,
    allocations,
    hypotheticalPeople,
    requiredByScope,
    contextSwitchCostPct,
    baselineFingerprint,
  };
}

export function validateCapacityScenarioPlan(
  plan: CapacityScenarioPlanV1,
  currentBaseline: CapacityPlanBaselineFingerprintV1,
): CapacityPlanValidation {
  try {
    const normalized = parseCapacityScenarioPlan(plan);
    const current = parseCapacityPlanBaseline(currentBaseline);
    if (
      normalized.baselineFingerprint.fingerprint !== current.fingerprint ||
      exactBaselineInputs(normalized.baselineFingerprint) !== exactBaselineInputs(current)
    ) {
      return {
        ok: false,
        reason: "Reality changed after this Capacity scenario was staged. Review the roster, outside commitments, allocations, switch cost, and project revisions, then recreate the capacity plan or return to Reality.",
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Capacity plan is invalid." };
  }
}

/** Same input path for Portfolio preview, Forecast, and server report replay. */
export function resolveCapacityPlan(plan: CapacityScenarioPlanV1): ScenarioInputDelta {
  const normalized = parseCapacityScenarioPlan(plan);
  return {
    allocations: normalized.allocations,
    hypotheticalPeople: normalized.hypotheticalPeople.map((person) => ({
      id: person.id,
      name: person.name,
      fte: person.fte,
      active: person.active,
    })),
    contextSwitchCostPct: normalized.contextSwitchCostPct,
  };
}

export function capacityPlanIsChanged(plan: CapacityScenarioPlanV1): boolean {
  const normalized = parseCapacityScenarioPlan(plan);
  const baseline = normalized.baselineFingerprint;
  return (
    JSON.stringify(normalized.allocations) !== JSON.stringify(baseline.allocations) ||
    normalized.hypotheticalPeople.length > 0 ||
    Object.keys(normalized.requiredByScope).length > 0 ||
    Math.abs(normalized.contextSwitchCostPct - baseline.contextSwitchCostPct) > EPSILON
  );
}

export function capacityPlanAffectedScopeIds(plan: CapacityScenarioPlanV1): string[] {
  const normalized = parseCapacityScenarioPlan(plan);
  const baselineByPair = new Map(normalized.baselineFingerprint.allocations.map((row) => [`${row.personId}\u0000${row.scopeId}`, row.fraction]));
  const scenarioByPair = new Map(normalized.allocations.map((row) => [`${row.personId}\u0000${row.scopeId}`, row.fraction]));
  const affected = new Set<string>(Object.keys(normalized.requiredByScope));
  for (const key of new Set([...baselineByPair.keys(), ...scenarioByPair.keys()])) {
    if (Math.abs((baselineByPair.get(key) ?? 0) - (scenarioByPair.get(key) ?? 0)) > EPSILON) {
      affected.add(key.slice(key.indexOf("\u0000") + 1));
    }
  }
  if (normalized.contextSwitchCostPct !== normalized.baselineFingerprint.contextSwitchCostPct) {
    for (const scopeId of Object.keys(normalized.baselineFingerprint.scopeRevisionById)) affected.add(scopeId);
  }
  return [...affected].sort();
}

export function capacityAssumptionLedger(plan: CapacityScenarioPlanV1): CapacityAssumptionLedgerV1 {
  const normalized = parseCapacityScenarioPlan(plan);
  const baseline = normalized.baselineFingerprint;
  const scopeIds = Object.keys(baseline.scopeRevisionById);
  const baselineState = { people: baseline.people, allocations: baseline.allocations };
  const scenarioPeople: PersonLike[] = [...baseline.people, ...normalized.hypotheticalPeople];
  const scenarioState = { people: scenarioPeople, allocations: normalized.allocations };
  const baselineMaster = readMaster(baselineState, scopeIds, baseline.contextSwitchCostPct);
  const scenarioMaster = readMaster(scenarioState, scopeIds, normalized.contextSwitchCostPct);
  return {
    version: "capacity-assumption-ledger.v1",
    baseline: {
      workforceFte: baselineMaster.workforce,
      trackedAllocationFte: baselineMaster.allocated,
      externalCommitmentFte: baselineMaster.external,
      freeFte: baselineMaster.free,
      effectiveFte: baselineMaster.effective,
      contextSwitchCostPct: baseline.contextSwitchCostPct,
    },
    scenario: {
      workforceFte: scenarioMaster.workforce,
      trackedAllocationFte: scenarioMaster.allocated,
      externalCommitmentFte: scenarioMaster.external,
      freeFte: scenarioMaster.free,
      effectiveFte: scenarioMaster.effective,
      contextSwitchCostPct: normalized.contextSwitchCostPct,
      hypotheticalHireFte: normalized.hypotheticalPeople.reduce((total, person) => total + person.fte, 0),
      requiredFte: Object.values(normalized.requiredByScope).reduce((total, fte) => total + fte, 0),
      requiredByScope: normalized.requiredByScope,
      effectiveByScope: Object.fromEntries(scopeIds.map((scopeId) => [
        scopeId,
        readChannel(scenarioState, scopeId, normalized.contextSwitchCostPct).effective,
      ])),
    },
  };
}
