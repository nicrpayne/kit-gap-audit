import { readChannel, type WorkforceState } from "./workforce";

export type CapacityReconciliationStatus = "aggregate_unreconciled" | "named_partial" | "named_exact";

export interface RosterAllocationDraft {
  scopeId: string;
  fte: number;
}

export interface RosterPersonDraft {
  id?: string;
  name: string;
  fte: number;
  allocations: RosterAllocationDraft[];
}

export interface RosterValidationIssue {
  code: "duplicate_name" | "invalid_fte" | "unknown_scope" | "overallocated" | "duplicate_scope";
  message: string;
  personName?: string;
}

const EPS = 1e-6;

export function normalizedPersonName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function validateRosterDraft(people: RosterPersonDraft[], scopeIds: Set<string>): RosterValidationIssue[] {
  const issues: RosterValidationIssue[] = [];
  const names = new Map<string, string>();
  for (const person of people) {
    const name = person.name.trim();
    const normalized = normalizedPersonName(name);
    if (normalized && names.has(normalized)) {
      issues.push({ code: "duplicate_name", personName: name, message: `“${name}” appears more than once. Use one roster row per person.` });
    } else if (normalized) names.set(normalized, name);
    if (!name || !Number.isFinite(person.fte) || person.fte <= 0 || person.fte > 1) {
      issues.push({ code: "invalid_fte", personName: name, message: `${name || "Each person"} needs available FTE above 0 and at most 1.0.` });
    }
    const seen = new Set<string>();
    let allocated = 0;
    for (const allocation of person.allocations) {
      if (!scopeIds.has(allocation.scopeId)) {
        issues.push({ code: "unknown_scope", personName: name, message: `${name || "A person"} has an allocation to an unknown project.` });
      }
      if (seen.has(allocation.scopeId)) {
        issues.push({ code: "duplicate_scope", personName: name, message: `${name || "A person"} lists the same project twice.` });
      }
      seen.add(allocation.scopeId);
      if (!Number.isFinite(allocation.fte) || allocation.fte < 0) {
        issues.push({ code: "invalid_fte", personName: name, message: `${name || "A person"} has an invalid project allocation.` });
      } else allocated += allocation.fte;
    }
    if (allocated > person.fte + EPS) {
      issues.push({ code: "overallocated", personName: name, message: `${name || "A person"} is allocated ${allocated.toFixed(2)} FTE but only ${person.fte.toFixed(2)} FTE is available.` });
    }
  }
  return issues;
}

export function rosterReadings(
  people: RosterPersonDraft[],
  scopeIds: string[],
  contextSwitchCostPct: number,
): { workforceFte: number; byScope: Map<string, { raw: number; effective: number }>; freeFte: number } {
  const workforce: WorkforceState = {
    people: people.map((person, index) => ({ id: person.id ?? `draft-${index}`, name: person.name, fte: person.fte, active: true })),
    allocations: people.flatMap((person, index) => person.allocations
      .filter((allocation) => allocation.fte > EPS && person.fte > EPS)
      .map((allocation) => ({
        personId: person.id ?? `draft-${index}`,
        scopeId: allocation.scopeId,
        fraction: allocation.fte / person.fte,
      }))),
  };
  const byScope = new Map(scopeIds.map((scopeId) => {
    const reading = readChannel(workforce, scopeId, contextSwitchCostPct);
    return [scopeId, { raw: reading.raw, effective: reading.effective }];
  }));
  const allocated = people.reduce((total, person) => total + person.allocations.reduce((sum, item) => sum + Math.max(0, item.fte), 0), 0);
  return {
    workforceFte: people.reduce((total, person) => total + Math.max(0, person.fte), 0),
    byScope,
    freeFte: Math.max(0, people.reduce((total, person) => total + Math.max(0, person.fte), 0) - allocated),
  };
}

export function isNamedExact(value: { status: string; completenessConfirmed: boolean } | null | undefined): boolean {
  return value?.status === "named_exact" && value.completenessConfirmed;
}
