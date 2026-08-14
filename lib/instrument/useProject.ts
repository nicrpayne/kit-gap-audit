"use client";

// The suite's shared client model: one fetch, one simulation, seven surfaces.
//
// Everything here is REAL. The forecast comes from runPortfolioSimulation
// over the same inputs /portfolio uses; scope items are the actual modelled
// WorkItems; gates are the actual blocking decisions. Nothing is generated
// for demonstration. Where a surface wants a concept the engine doesn't have
// yet (release boundaries, decision options), the surface says so with
// <Prototype/> rather than this module inventing data.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import type { SimulationResult, WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { computeMomentum } from "@/lib/momentum/compute";
import { computeMomentumTrend, type MomentumTrend } from "@/lib/momentum/trend";

export interface ProjectScope {
  scopeId: string;
  name: string;
  targetDate: string | null;
  dependsOnScopeIds: string[];
  items: WorkItem[];
  gates: DecisionGate[];
  teamCapacity: number;
  capacitySource: "allocations" | "explicit" | "inferred";
  explicitTeamCapacity: number | null;
  lastReport: { generatedAt: string; likelyDate: string; confidenceAtTarget: number | null } | null;
  reportHistory: {
    generatedAt: string;
    likelyDate: string;
    confidenceAtTarget: number | null;
    shippedCount: number;
    resolvedSinceLastCount: number;
  }[];
  capacityBasis: {
    kind: "allocations" | "explicit" | "inferred";
    contributors?: { personId: string; name: string; effectiveFte: number; scopeCount: number }[];
    value?: number;
    assignees?: string[];
    remainingIssueCount?: number;
    unassignedCount?: number;
  };
}

export interface ProjectFinding {
  id: string;
  // Nullable since Context Package Foundation Phase 1b: a package-derived
  // Finding is evidenced by a ContextSnapshot and never gets a fabricated
  // Source. The instrument surfaces already treat a missing source
  // optionally (no link, no "· title" suffix); this makes the type say so.
  sourceId: string | null;
  type: string;
  title: string;
  quote: string;
  rationale: string;
  severity: string;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  blocking: boolean;
  matchedIssues: string[];
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ProjectSource {
  id: string;
  kind: string;
  title: string;
  scopeId: string | null;
  createdAt: string;
}

export interface ProjectReport {
  id: string;
  scopeId: string;
  generatedAt: string;
  likelyDate: string;
  confidenceAtTarget: number | null;
  likelyDateDeltaDays: number | null;
  shippedCount: number;
  blockingCount: number;
  resolvedSinceLastCount: number;
  summaryMarkdown: string;
}

export interface ProjectPayload {
  startDate: string;
  scopes: ProjectScope[];
  people: { id: string; name: string; fte: number; active: boolean }[];
  allocations: { id: string; personId: string; scopeId: string; fraction: number }[];
  contextSwitchCostPct: number;
  sources: ProjectSource[];
  findings: ProjectFinding[];
  reports: ProjectReport[];
}

// The scenario levers the ENGINE genuinely honours today. Anything not in
// this shape is not simulable, and the UI must say so rather than pretend.
export interface SuiteScenario {
  /** scopeId -> simulated total FTE (Portfolio's aggregate override). */
  capacityOverrideByScope: Record<string, number>;
  /** Work item ids excluded from the simulation -- real: items simply drop. */
  excludedItemIds: Set<string>;
  /** Gate ids treated as resolved -- real: the serial delay disappears. */
  resolvedGateIds: Set<string>;
  contextSwitchCostPct: number | null;
}

export const EMPTY_SCENARIO: SuiteScenario = {
  capacityOverrideByScope: {},
  excludedItemIds: new Set(),
  resolvedGateIds: new Set(),
  contextSwitchCostPct: null,
};

export function scenarioIsActive(s: SuiteScenario): boolean {
  return (
    Object.keys(s.capacityOverrideByScope).length > 0 ||
    s.excludedItemIds.size > 0 ||
    s.resolvedGateIds.size > 0 ||
    s.contextSwitchCostPct !== null
  );
}

export interface ProjectModel {
  data: ProjectPayload | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  startDate: Date | null;
  /** Reality: what the app currently accepts as true. */
  baseline: Map<string, SimulationResult> | null;
  /** Scenario: the hypothetical, or Reality when nothing is set. */
  preview: Map<string, SimulationResult> | null;
  scenario: SuiteScenario;
  setScenario: React.Dispatch<React.SetStateAction<SuiteScenario>>;
  active: boolean;
  momentumByScope: Map<string, MomentumTrend>;
  /** Latest likely date across scopes, and which scope sets it. */
  portfolioLikely: { date: Date | null; gatedBy: string | null; deltaDays: number };
}

export function useProject(): ProjectModel {
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<SuiteScenario>(EMPTY_SCENARIO);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/instrument/project");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load the project model.");
      }
      setData(await res.json());
      setScenario(EMPTY_SCENARIO);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const startDate = useMemo(() => (data ? new Date(data.startDate) : null), [data]);

  const scenarioScopes: ScenarioInputScope[] | null = useMemo(() => {
    if (!data || !startDate) return null;
    return data.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates,
      dependsOnScopeIds: s.dependsOnScopeIds,
      explicitTeamCapacity: s.explicitTeamCapacity,
      teamCapacity: s.teamCapacity,
      capacitySource: s.capacitySource,
      startDate,
      targetDate: s.targetDate ? new Date(s.targetDate) : null,
    }));
  }, [data, startDate]);

  const baseline = useMemo(() => {
    if (!data || !scenarioScopes) return null;
    const delta: ScenarioInputDelta = {
      allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
      hypotheticalPeople: [],
      contextSwitchCostPct: data.contextSwitchCostPct,
    };
    try {
      return runPortfolioSimulation(applyScenarioInputDelta(scenarioScopes, data.people, delta));
    } catch {
      return null;
    }
  }, [data, scenarioScopes]);

  // Scenario simulation. Scope exclusions and gate resolutions are applied by
  // FILTERING the spec's items/gates -- which is exactly what the engine
  // already means by "this work isn't in the release" and "that decision is
  // settled". No new math.
  const [preview, setPreview] = useState<Map<string, SimulationResult> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || !scenarioScopes) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const filtered = scenarioScopes.map((s) => ({
        ...s,
        items: s.items.filter((i) => !scenario.excludedItemIds.has(i.id)),
        gates: s.gates.filter((g) => !scenario.resolvedGateIds.has(g.id)),
      }));
      const delta: ScenarioInputDelta = {
        allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
        hypotheticalPeople: [],
        contextSwitchCostPct: scenario.contextSwitchCostPct ?? data.contextSwitchCostPct,
        capacityOverrideByScope: scenario.capacityOverrideByScope,
      };
      try {
        setPreview(runPortfolioSimulation(applyScenarioInputDelta(filtered, data.people, delta)));
      } catch {
        /* a dependency cycle can't be created from these surfaces */
      }
    }, 110);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [data, scenarioScopes, scenario]);

  const momentumByScope = useMemo(() => {
    const out = new Map<string, MomentumTrend>();
    if (!data) return out;
    for (const s of data.scopes) {
      if (!s.lastReport) continue;
      const b = baseline?.get(s.scopeId);
      if (!b) continue;
      const m = computeMomentum(
        { generatedAt: new Date(), likelyDate: b.likelyDate, confidenceAtTarget: b.confidenceAtTarget },
        {
          generatedAt: new Date(s.lastReport.generatedAt),
          likelyDate: new Date(s.lastReport.likelyDate),
          confidenceAtTarget: s.lastReport.confidenceAtTarget,
        }
      );
      const latest = s.reportHistory[s.reportHistory.length - 1];
      out.set(
        s.scopeId,
        computeMomentumTrend(
          m,
          latest
            ? {
                generatedAt: new Date(latest.generatedAt),
                shippedCount: latest.shippedCount,
                resolvedSinceLastCount: latest.resolvedSinceLastCount,
              }
            : null
        )
      );
    }
    return out;
  }, [data, baseline]);

  const portfolioLikely = useMemo(() => {
    if (!data) return { date: null as Date | null, gatedBy: null as string | null, deltaDays: 0 };
    let active: number | null = null;
    let base: number | null = null;
    let gatedBy: string | null = null;
    for (const s of data.scopes) {
      const p = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
      const b = baseline?.get(s.scopeId);
      if (p && (active === null || p.likelyDate.getTime() > active)) {
        active = p.likelyDate.getTime();
        gatedBy = s.name;
      }
      if (b) base = Math.max(base ?? -Infinity, b.likelyDate.getTime());
    }
    return {
      date: active === null ? null : new Date(active),
      gatedBy,
      deltaDays: active !== null && base !== null ? Math.round((active - base) / 86400000) : 0,
    };
  }, [data, baseline, preview]);

  return {
    data,
    loading,
    error,
    reload,
    startDate,
    baseline,
    preview,
    scenario,
    setScenario,
    active: scenarioIsActive(scenario),
    momentumByScope,
    portfolioLikely,
  };
}

// Shared formatting so seven surfaces can't disagree about what a date or a
// delta looks like.
export const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
export const fmtFull = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const deltaLabel = (days: number) =>
  days === 0 ? "no change" : days < 0 ? `${Math.abs(days)}d earlier` : `${days}d later`;
export const deltaTone = (days: number) =>
  days === 0 ? "var(--i-text-soft)" : days < 0 ? "var(--i-mint)" : "var(--i-red)";
export const confidenceTone = (pct: number | null) =>
  pct === null ? "var(--i-text-faint)" : pct >= 70 ? "var(--i-mint)" : pct >= 40 ? "var(--i-amber)" : "var(--i-red)";
