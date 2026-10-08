import { validateAllocations, type AllocationLike } from "@/lib/capacity/resolve";
import { readChannel, readMaster } from "@/lib/capacity/workforce";
import type { ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import {
  createCapacityScenarioPlan,
  parseCapacityPlanBaseline,
  validateCapacityScenarioPlan,
  type CapacityPlanBaselineFingerprintV1,
  type CapacityPlanValidation,
} from "@/lib/scenario/capacityPlan";
import { DATE_ONLY_PATTERN, dateOnlyToUtcDate, toDateOnly, type DateOnly } from "@/lib/time/dateContract";

export const PHASED_CAPACITY_PLAN_VERSION = "phased-capacity-plan.v1" as const;
export const PHASED_CAPACITY_SCHEDULING = "explicit-date-only" as const;

const EPSILON = 1e-6;
const DAY_MS = 86_400_000;

/**
 * A dated movement of one real person's existing allocation. It is not a
 * completion trigger and it never adds a hire: the same fraction leaves one
 * tracked Scope and arrives on another on an owner-selected calendar date.
 */
export interface PhasedCapacityTransferV1 {
  id: string;
  personId: string;
  fromScopeId: string;
  toScopeId: string;
  fraction: number;
  effectiveDate: DateOnly;
}

export interface PhasedCapacityPlanV1 {
  version: typeof PHASED_CAPACITY_PLAN_VERSION;
  baselineFingerprint: CapacityPlanBaselineFingerprintV1;
  transfers: PhasedCapacityTransferV1[];
}

export interface CreatePhasedCapacityPlanInput {
  baseline: CapacityPlanBaselineFingerprintV1;
  transfers: PhasedCapacityTransferV1[];
}

export interface PhasedCapacityLedgerPhaseV1 {
  /** null is Reality before the first explicit dated move. */
  effectiveDate: DateOnly | null;
  workforceFte: number;
  trackedAllocationFte: number;
  externalCommitmentFte: number;
  freeFte: number;
  effectiveFte: number;
  rawByScope: Record<string, number>;
  effectiveByScope: Record<string, number>;
}

export class PhasedCapacityPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhasedCapacityPlanError";
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PhasedCapacityPlanError(`${label} is required.`);
  return value.trim();
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const known = new Set(allowed);
  const unknown = Object.keys(value).filter((field) => !known.has(field));
  if (unknown.length) {
    throw new PhasedCapacityPlanError(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
}

function transferFraction(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= EPSILON || value > 1) {
    throw new PhasedCapacityPlanError(`${label} must be greater than 0 and no more than 1.`);
  }
  return value;
}

function explicitDate(value: unknown, label: string): DateOnly {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) {
    throw new PhasedCapacityPlanError(
      `${label} requires an explicit YYYY-MM-DD date hypothesis. Completion-trigger scheduling is not supported.`,
    );
  }
  try {
    return toDateOnly(value);
  } catch {
    throw new PhasedCapacityPlanError(`${label} is not a valid calendar date.`);
  }
}

function pairKey(personId: string, scopeId: string): string {
  return `${personId}\u0000${scopeId}`;
}

function canonicalAllocations(byPair: Map<string, number>): AllocationLike[] {
  return [...byPair]
    .filter(([, fraction]) => fraction > EPSILON)
    .map(([key, fraction]) => {
      const separator = key.indexOf("\u0000");
      return { personId: key.slice(0, separator), scopeId: key.slice(separator + 1), fraction };
    })
    .sort((a, b) => a.personId.localeCompare(b.personId) || a.scopeId.localeCompare(b.scopeId));
}

function applyTransferDate(
  allocations: AllocationLike[],
  transfers: PhasedCapacityTransferV1[],
  baseline: CapacityPlanBaselineFingerprintV1,
): AllocationLike[] {
  const current = new Map(allocations.map((row) => [pairKey(row.personId, row.scopeId), row.fraction]));
  const outbound = new Map<string, number>();
  const inbound = new Map<string, number>();

  // All moves on the same date are applied against the same opening state.
  // An incoming fraction therefore cannot silently fund another move on that
  // date; the result is independent of JSON/drag order.
  for (const transfer of transfers) {
    const from = pairKey(transfer.personId, transfer.fromScopeId);
    const to = pairKey(transfer.personId, transfer.toScopeId);
    outbound.set(from, (outbound.get(from) ?? 0) + transfer.fraction);
    inbound.set(to, (inbound.get(to) ?? 0) + transfer.fraction);
  }
  for (const [key, fraction] of outbound) {
    const available = current.get(key) ?? 0;
    if (fraction > available + EPSILON) {
      const separator = key.indexOf("\u0000");
      const personId = key.slice(0, separator);
      const scopeId = key.slice(separator + 1);
      const name = baseline.people.find((person) => person.id === personId)?.name ?? personId;
      throw new PhasedCapacityPlanError(
        `${name} has only ${available.toFixed(2)} of an allocation on ${scopeId} available on ${transfers[0].effectiveDate}; ${fraction.toFixed(2)} cannot be transferred.`,
      );
    }
  }

  for (const key of new Set([...outbound.keys(), ...inbound.keys()])) {
    current.set(key, (current.get(key) ?? 0) - (outbound.get(key) ?? 0) + (inbound.get(key) ?? 0));
  }
  const next = canonicalAllocations(current);
  const overAllocated = validateAllocations(baseline.people, next);
  if (overAllocated.length) {
    const first = overAllocated[0];
    throw new PhasedCapacityPlanError(
      `${first.personName} would be over-allocated at ${(first.totalFraction * 100).toFixed(0)}% on ${transfers[0].effectiveDate}; outside commitments remain reserved.`,
    );
  }
  return next;
}

interface AllocationPhase {
  effectiveDate: DateOnly;
  allocations: AllocationLike[];
}

function allocationTimeline(plan: PhasedCapacityPlanV1): AllocationPhase[] {
  const phases: AllocationPhase[] = [];
  let allocations = plan.baselineFingerprint.allocations.map((row) => ({ ...row }));
  let index = 0;
  while (index < plan.transfers.length) {
    const effectiveDate = plan.transfers[index].effectiveDate;
    const onDate: PhasedCapacityTransferV1[] = [];
    while (index < plan.transfers.length && plan.transfers[index].effectiveDate === effectiveDate) {
      onDate.push(plan.transfers[index]);
      index += 1;
    }
    allocations = applyTransferDate(allocations, onDate, plan.baselineFingerprint);
    phases.push({ effectiveDate, allocations });
  }
  return phases;
}

export function parsePhasedCapacityPlan(value: unknown): PhasedCapacityPlanV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PhasedCapacityPlanError("A complete phased capacity plan is required.");
  }
  const raw = value as Record<string, unknown>;
  rejectUnknownFields(raw, ["version", "baselineFingerprint", "transfers"], "Phased capacity plan");
  if (raw.version !== PHASED_CAPACITY_PLAN_VERSION) {
    throw new PhasedCapacityPlanError("Phased capacity plan version is unsupported.");
  }
  const baselineFingerprint = parseCapacityPlanBaseline(raw.baselineFingerprint);
  if (!Array.isArray(raw.transfers)) throw new PhasedCapacityPlanError("Phased capacity transfers must be an array.");

  const peopleById = new Map(baselineFingerprint.people.map((person) => [person.id, person]));
  const scopeIds = new Set(Object.keys(baselineFingerprint.scopeRevisionById));
  const ids = new Set<string>();
  const transfers = raw.transfers.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new PhasedCapacityPlanError(`Phased transfer ${index + 1} is invalid.`);
    }
    const row = candidate as Record<string, unknown>;
    if ("trigger" in row || "afterScopeId" in row || "afterCompletionOfScopeId" in row) {
      throw new PhasedCapacityPlanError(
        `Phased transfer ${index + 1} must use an explicit date hypothesis. Completion-trigger scheduling is not supported.`,
      );
    }
    rejectUnknownFields(
      row,
      ["id", "personId", "fromScopeId", "toScopeId", "fraction", "effectiveDate"],
      `Phased transfer ${index + 1}`,
    );
    const id = requiredString(row.id, `Phased transfer ${index + 1} id`);
    if (ids.has(id)) throw new PhasedCapacityPlanError(`Phased capacity plan repeats transfer id ${id}.`);
    ids.add(id);
    const personId = requiredString(row.personId, `Phased transfer ${id} person`);
    const person = peopleById.get(personId);
    if (!person) throw new PhasedCapacityPlanError(`Phased transfer ${id} references unknown person ${personId}.`);
    if (!person.active) throw new PhasedCapacityPlanError(`Phased transfer ${id} cannot move inactive person ${person.name}.`);
    const fromScopeId = requiredString(row.fromScopeId, `Phased transfer ${id} source project`);
    const toScopeId = requiredString(row.toScopeId, `Phased transfer ${id} destination project`);
    if (!scopeIds.has(fromScopeId)) throw new PhasedCapacityPlanError(`Phased transfer ${id} references unknown project ${fromScopeId}.`);
    if (!scopeIds.has(toScopeId)) throw new PhasedCapacityPlanError(`Phased transfer ${id} references unknown project ${toScopeId}.`);
    if (fromScopeId === toScopeId) throw new PhasedCapacityPlanError(`Phased transfer ${id} must move between two different projects.`);
    return {
      id,
      personId,
      fromScopeId,
      toScopeId,
      fraction: transferFraction(row.fraction, `Phased transfer ${id} fraction`),
      effectiveDate: explicitDate(row.effectiveDate, `Phased transfer ${id}`),
    };
  }).sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
    || a.personId.localeCompare(b.personId)
    || a.fromScopeId.localeCompare(b.fromScopeId)
    || a.toScopeId.localeCompare(b.toScopeId)
    || a.id.localeCompare(b.id)
  );

  const plan = { version: PHASED_CAPACITY_PLAN_VERSION, baselineFingerprint, transfers };
  allocationTimeline(plan); // validates funding, conservation, and outside commitments at every date
  return plan;
}

export function createPhasedCapacityPlan(input: CreatePhasedCapacityPlanInput): PhasedCapacityPlanV1 {
  return parsePhasedCapacityPlan({
    version: PHASED_CAPACITY_PLAN_VERSION,
    baselineFingerprint: input.baseline,
    transfers: input.transfers,
  });
}

/** Reuses the existing exact Capacity baseline/fingerprint staleness contract. */
export function validatePhasedCapacityPlan(
  plan: PhasedCapacityPlanV1,
  currentBaseline: CapacityPlanBaselineFingerprintV1,
): CapacityPlanValidation {
  try {
    const normalized = parsePhasedCapacityPlan(plan);
    const baseline = normalized.baselineFingerprint;
    const noOpStaticPlan = createCapacityScenarioPlan({
      baseline,
      allocations: baseline.allocations,
      hypotheticalPeople: [],
      requiredByScope: {},
      contextSwitchCostPct: baseline.contextSwitchCostPct,
    });
    return validateCapacityScenarioPlan(noOpStaticPlan, currentBaseline);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Phased capacity plan is invalid." };
  }
}

export function phasedCapacityPlanAffectedScopeIds(plan: PhasedCapacityPlanV1): string[] {
  const normalized = parsePhasedCapacityPlan(plan);
  const movedPeople = new Set(normalized.transfers.map((transfer) => transfer.personId));
  const affected = new Set<string>();
  for (const transfer of normalized.transfers) {
    affected.add(transfer.fromScopeId);
    affected.add(transfer.toScopeId);
  }
  // A person's transfer may change their number of simultaneous projects,
  // so context-switch effectiveness can also change on a third project.
  for (const allocation of normalized.baselineFingerprint.allocations) {
    if (movedPeople.has(allocation.personId)) affected.add(allocation.scopeId);
  }
  return [...affected].sort();
}

function dayOffset(startDate: DateOnly, effectiveDate: DateOnly): number {
  return Math.round((dateOnlyToUtcDate(effectiveDate).getTime() - dateOnlyToUtcDate(startDate).getTime()) / DAY_MS);
}

/**
 * Compile named allocation states into the effective FTE schedule consumed by
 * the forecast. The passed simulationStartDate is the single calendar-day
 * origin; it is never inferred from whichever Scope happens to appear first.
 */
export function compilePhasedCapacityPlan(
  plan: PhasedCapacityPlanV1,
  currentBaseline: CapacityPlanBaselineFingerprintV1,
  specs: ScopeSimulationSpec[],
  simulationStartDate: Date | string,
): ScopeSimulationSpec[] {
  const normalized = parsePhasedCapacityPlan(plan);
  const validation = validatePhasedCapacityPlan(normalized, currentBaseline);
  if (!validation.ok) throw new PhasedCapacityPlanError(validation.reason);
  if (simulationStartDate instanceof Date && !Number.isFinite(simulationStartDate.getTime())) {
    throw new PhasedCapacityPlanError("Simulation start date is invalid.");
  }
  let startDate: DateOnly;
  try {
    startDate = toDateOnly(simulationStartDate);
  } catch {
    throw new PhasedCapacityPlanError("Simulation start date must be a valid YYYY-MM-DD calendar date or offset-bearing instant.");
  }
  const specsById = new Map(specs.map((spec) => [spec.scopeId, spec]));
  for (const scopeId of phasedCapacityPlanAffectedScopeIds(normalized)) {
    if (!specsById.has(scopeId)) {
      throw new PhasedCapacityPlanError(
        `Phased transfer affects ${scopeId}, but that project was not provided to the portfolio simulation. Include every affected project so capacity cannot disappear off-screen.`,
      );
    }
  }

  const timeline = allocationTimeline(normalized);
  const affected = new Set(phasedCapacityPlanAffectedScopeIds(normalized));
  const allocationAtStart = [...timeline]
    .reverse()
    .find((phase) => phase.effectiveDate <= startDate)?.allocations
    ?? normalized.baselineFingerprint.allocations;
  const afterStart = timeline.filter((phase) => phase.effectiveDate > startDate);
  const people = normalized.baselineFingerprint.people;
  const switchCost = normalized.baselineFingerprint.contextSwitchCostPct;

  return specs.map((spec) => {
    if (!affected.has(spec.scopeId)) return spec;
    const capacityPhases = [{
      startDay: 0,
      teamCapacity: readChannel({ people, allocations: allocationAtStart }, spec.scopeId, switchCost).effective,
    }];
    for (const phase of afterStart) {
      const teamCapacity = readChannel({ people, allocations: phase.allocations }, spec.scopeId, switchCost).effective;
      const previous = capacityPhases[capacityPhases.length - 1];
      if (Math.abs(teamCapacity - previous.teamCapacity) <= EPSILON) continue;
      capacityPhases.push({ startDay: dayOffset(startDate, phase.effectiveDate), teamCapacity });
    }
    return { ...spec, teamCapacity: capacityPhases[0].teamCapacity, capacityPhases };
  });
}

/** Auditable physical/effective totals for Reality and every dated phase. */
export function phasedCapacityLedger(plan: PhasedCapacityPlanV1): PhasedCapacityLedgerPhaseV1[] {
  const normalized = parsePhasedCapacityPlan(plan);
  const baseline = normalized.baselineFingerprint;
  const scopeIds = Object.keys(baseline.scopeRevisionById).sort();
  const states: { effectiveDate: DateOnly | null; allocations: AllocationLike[] }[] = [
    { effectiveDate: null, allocations: baseline.allocations },
    ...allocationTimeline(normalized),
  ];
  return states.map((phase) => {
    const state = { people: baseline.people, allocations: phase.allocations };
    const master = readMaster(state, scopeIds, baseline.contextSwitchCostPct);
    return {
      effectiveDate: phase.effectiveDate,
      workforceFte: master.workforce,
      trackedAllocationFte: master.allocated,
      externalCommitmentFte: master.external,
      freeFte: master.free,
      effectiveFte: master.effective,
      rawByScope: Object.fromEntries(scopeIds.map((scopeId) => [scopeId, readChannel(state, scopeId, baseline.contextSwitchCostPct).raw])),
      effectiveByScope: Object.fromEntries(scopeIds.map((scopeId) => [scopeId, readChannel(state, scopeId, baseline.contextSwitchCostPct).effective])),
    };
  });
}
