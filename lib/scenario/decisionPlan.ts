import type { DecisionGate } from "@/lib/forecast/simulate";

export interface DecisionGateDraft {
  targetScopeId: string; dependency: string; evidenceForGate: string;
  low: number; likely: number; high: number;
}
export interface DecisionScenarioInput {
  id: string; scopeId: string; title: string; status: string;
  updatedAt?: string | Date; readinessRole?: string;
  gate: (DecisionGateDraft & { id: string; serial: boolean }) | null;
}
export interface DecisionPlan {
  basis: string;
  state: "open" | "resolved" | "gating";
  gate?: DecisionGateDraft;
}
export type DecisionPlans = Record<string, DecisionPlan>;

export function decisionScenarioBasis(d: DecisionScenarioInput): string {
  return JSON.stringify([d.id, d.scopeId, d.status, d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    d.readinessRole ?? "needs_review", d.gate ? [d.gate.id, d.gate.targetScopeId, d.gate.serial,
      d.gate.dependency, d.gate.evidenceForGate, d.gate.low, d.gate.likely, d.gate.high] : null]);
}
export function gateDraftError(gate: DecisionGateDraft): string | null {
  if (!gate.targetScopeId?.trim() || !gate.dependency?.trim() || !gate.evidenceForGate?.trim()) return "Say what waits, why it must wait, and what supports this assumption.";
  if (![gate.low, gate.likely, gate.high].every(value => typeof value === "number" && Number.isFinite(value))
    || gate.low <= 0 || gate.low > gate.likely || gate.likely > gate.high) return "Enter a delay range with 0 < low ≤ likely ≤ high.";
  return null;
}
export function parseDecisionPlans(value: unknown): DecisionPlans {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Decision assumptions must be an object.");
  const result: DecisionPlans = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!id || ["__proto__", "constructor", "prototype"].includes(id) || !entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid Decision assumption.");
    const plan = entry as DecisionPlan;
    if (Object.keys(plan).some(key => !["basis", "state", "gate"].includes(key)) || typeof plan.basis !== "string" || !plan.basis
      || !["open", "resolved", "gating"].includes(plan.state)) throw new Error("Invalid Decision assumption or missing Reality basis.");
    if (plan.state === "gating") {
      if (!plan.gate || typeof plan.gate !== "object" || Array.isArray(plan.gate)
        || Object.keys(plan.gate).some(key => !["targetScopeId", "dependency", "evidenceForGate", "low", "likely", "high"].includes(key))) throw new Error("Invalid Decision delay assumption.");
      const error = gateDraftError(plan.gate);
      if (error) throw new Error(error);
    } else if (plan.gate !== undefined) throw new Error("Only a gating assumption can carry a delay.");
    result[id] = plan;
  }
  return result;
}
export function validateDecisionPlans(plans: DecisionPlans | undefined, decisions: DecisionScenarioInput[], scopeIds: string[], resolvedGateIds: Iterable<string> = []): string | null {
  try { parseDecisionPlans(plans); } catch (error) { return error instanceof Error ? error.message : "Invalid Decision assumptions."; }
  const legacyResolved = new Set(resolvedGateIds);
  for (const [id, plan] of Object.entries(plans ?? {})) {
    const decision = decisions.find(row => row.id === id);
    if (!decision || decision.status !== "open" || decisionScenarioBasis(decision) !== plan.basis) return "A Decision changed since this what-if was created. Return to Reality and review it; no Scenario input was applied.";
    if (plan.gate && !scopeIds.includes(plan.gate.targetScopeId)) return "The assumed delay targets a missing project.";
    if (decision.gate && legacyResolved.has(decision.gate.id)) return "Conflicting assumptions target the same Decision. Return to Reality and recreate it.";
  }
  return null;
}

/** Shared by browser simulation and report replay. Gate delays remain serial;
 * moving an open non-gating choice never invents a time saving. */
export function decisionScenarioGates(scopeId: string, gates: DecisionGate[], decisions: DecisionScenarioInput[], plans: DecisionPlans | undefined, resolvedGateIds: Iterable<string>): DecisionGate[] {
  const removed = new Set(resolvedGateIds);
  for (const decision of decisions) if (plans?.[decision.id] && decision.gate) removed.add(decision.gate.id);
  return [...gates.filter(gate => !removed.has(gate.id)), ...Object.entries(plans ?? {}).flatMap(([id, plan]) =>
    plan.state === "gating" && plan.gate?.targetScopeId === scopeId ? [{ id: `scenario-decision:${id}`, label: decisions.find(row => row.id === id)?.title ?? id,
      low: plan.gate.low, likely: plan.gate.likely, high: plan.gate.high }] : [])];
}

export function decisionScenarioOpenCount(scopeId: string, baseline: { id: string }[], decisions: DecisionScenarioInput[], plans: DecisionPlans | undefined): number {
  const open = new Set(baseline.map(row => row.id));
  for (const [id, plan] of Object.entries(plans ?? {})) {
    const decision = decisions.find(row => row.id === id);
    if (!decision || decision.scopeId !== scopeId) continue;
    open.delete(id);
    if (plan.state === "open" && decision.readinessRole !== "reference") open.add(id);
  }
  return open.size;
}
