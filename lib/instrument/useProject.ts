"use client";

// The suite's shared client model: one fetch, one simulation, seven surfaces.
//
// Everything here is REAL. The forecast comes from runPortfolioSimulation
// over the same inputs /portfolio uses; scope items are the actual modelled
// WorkItems; gates are the actual blocking decisions. Nothing is generated
// for demonstration. Where a surface wants a concept the engine doesn't have
// yet (release boundaries, decision options), the surface says so with
// <Prototype/> rather than this module inventing data.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import type { SimulationResult, WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { computeMomentum } from "@/lib/momentum/compute";
import { computeMomentumTrend, type MomentumTrend } from "@/lib/momentum/trend";

// The provenance the Scope instrument reads. Produced by describeItems in
// lib/forecast/compute.ts by joining each simulated item back to the Linear
// issue or Finding it was built from -- nothing here is inferred client-side.
export interface ScopeWorkItem extends WorkItem {
  estimateSource: "ai" | "points" | "issue_placeholder" | "hint" | "finding_placeholder";
  kind: "ticket" | "inferred";
  state: string | null;
  assignee: string | null;
  points: number | null;
  quote: string | null;
  rationale: string | null;
  /** The Linear parent, verbatim; resolved to a feature in lib/scope/features.ts. */
  parentIdentifier: string | null;
  parentTitle: string | null;
  projectName: string | null;
}

export interface ProjectScope {
  scopeId: string;
  name: string;
  targetDate: string | null;
  dependsOnScopeIds: string[];
  items: ScopeWorkItem[];
  completedWork: {
    id: string;
    label: string;
    parentIdentifier: string | null;
    parentTitle: string | null;
    completedAt: string | null;
  }[];
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
  sourceId: string;
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
  /** Item id -> a hypothetical three-point range to simulate INSTEAD of the
      stored one. Exactly as real as an exclusion: the simulation reads an
      item's low/likely/high off the spec it is handed, so substituting them
      is a pure input change on the existing path -- no new math, and the
      stored WorkEstimate is never touched. Scope owns this lever. */
  estimateOverrideByItemId: Record<string, { low: number; likely: number; high: number }>;
  // WHICH CAPABILITIES ARE OUT, as opposed to which work items are.
  //
  // excludedItemIds above stays the engine's truth -- the simulation only
  // understands work items, and nothing here changes that. This set records
  // the PRODUCT-LEVEL decision that produced those exclusions, so the suite
  // can say "Offline Capture is out of this release" instead of "3 items out
  // of scope". Scope writes both together, and is the only writer of this one.
  bypassedFeatureIds: Set<string>;
  // Capabilities declared by hand in this session. There is no Feature table
  // yet, so a draft lives here and dies with the Scenario -- the honest
  // behaviour for something that was never saved. See docs/SCOPE-INSTRUMENT.md
  // for the migration this stands in for.
  draftFeatures: { id: string; name: string; intent: string; itemIds: string[] }[];
  contextSwitchCostPct: number | null;
}

export const EMPTY_SCENARIO: SuiteScenario = {
  capacityOverrideByScope: {},
  excludedItemIds: new Set(),
  resolvedGateIds: new Set(),
  estimateOverrideByItemId: {},
  bypassedFeatureIds: new Set(),
  draftFeatures: [],
  contextSwitchCostPct: null,
};

export function scenarioIsActive(s: SuiteScenario): boolean {
  return (
    Object.keys(s.capacityOverrideByScope).length > 0 ||
    s.excludedItemIds.size > 0 ||
    s.resolvedGateIds.size > 0 ||
    Object.keys(s.estimateOverrideByItemId).length > 0 ||
    s.bypassedFeatureIds.size > 0 ||
    s.draftFeatures.length > 0 ||
    s.contextSwitchCostPct !== null
  );
}

// ── ONE WORLD, SEVEN SURFACES ──────────────────────────────────────────
// The suite's snapshot and its scenario live in a module store rather than in
// each instrument's local state. Two reasons, both product reasons:
//
//   1. A scenario is a statement about the PROJECT, not about the screen you
//      happened to make it on. Cutting scope and walking to Forecast to see
//      the consequence is the whole point of a suite; per-surface state made
//      that walk silently discard the hypothetical.
//   2. The payload costs a Linear round-trip. Re-fetching it on every
//      navigation made moving between instruments feel like loading pages
//      instead of turning to look at something.
//
// Deliberately not React context: useProject's signature is unchanged, so all
// seven surfaces got this by existing, and none of them had to be rewired.
interface ProjectStore {
  data: ProjectPayload | null;
  loading: boolean;
  error: string | null;
  scenario: SuiteScenario;
}

let store: ProjectStore = { data: null, loading: true, error: null, scenario: EMPTY_SCENARIO };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(patch: Partial<ProjectStore>) {
  store = { ...store, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// force = an explicit user-driven refresh, which DOES drop the scenario: the
// hypothetical was built against facts that just changed underneath it.
// Mounting a second instrument is not that, and must never clear it.
function load(force: boolean): Promise<void> {
  if (inFlight && !force) return inFlight;
  publish({ loading: true, error: null });
  inFlight = (async () => {
    try {
      const res = await fetch("/api/instrument/project");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load the project model.");
      }
      const data: ProjectPayload = await res.json();
      publish({ data, loading: false, scenario: force ? EMPTY_SCENARIO : store.scenario });
    } catch (err) {
      publish({ error: err instanceof Error ? err.message : "Something went wrong.", loading: false });
    }
  })();
  return inFlight;
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
  /** Per scope: where it would still land with EVERY one of its work items
      cut. The honest ceiling on what cutting scope can buy -- gates and a
      dependency's own completion survive an empty backlog. Simulated on the
      same path as everything else, under the CURRENT scenario, so a gate
      assumed resolved in Decisions correctly lowers it. */
  floorByScope: Map<string, SimulationResult> | null;
}

export function useProject(): ProjectModel {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store);
  const { data, loading, error, scenario } = snapshot;

  const reload = useCallback(() => {
    void load(true);
  }, []);

  const setScenario = useCallback<React.Dispatch<React.SetStateAction<SuiteScenario>>>((update) => {
    publish({ scenario: typeof update === "function" ? update(store.scenario) : update });
  }, []);

  useEffect(() => {
    void load(false);
  }, []);

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
  // settled". An estimate override MAPS one item's three-point range to the
  // hypothetical one. All three are input substitutions on the existing spec;
  // no new math, and runPortfolioSimulation is called exactly as before.
  const [preview, setPreview] = useState<Map<string, SimulationResult> | null>(null);
  const [floorByScope, setFloorByScope] = useState<Map<string, SimulationResult> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || !scenarioScopes) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const delta: ScenarioInputDelta = {
        allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
        hypotheticalPeople: [],
        contextSwitchCostPct: scenario.contextSwitchCostPct ?? data.contextSwitchCostPct,
        capacityOverrideByScope: scenario.capacityOverrideByScope,
      };
      // emptyScopeId: additionally drop every item of that one scope, which
      // is how the irreducible floor is measured -- what survives an empty
      // backlog is, by definition, what cutting scope cannot reach.
      const specsFor = (emptyScopeId?: string) =>
        applyScenarioInputDelta(
          scenarioScopes.map((s) => ({
            ...s,
            items:
              s.scopeId === emptyScopeId
                ? []
                : s.items
                    .filter((i) => !scenario.excludedItemIds.has(i.id))
                    .map((i) => {
                      const o = scenario.estimateOverrideByItemId[i.id];
                      return o ? { ...i, low: o.low, likely: o.likely, high: o.high } : i;
                    }),
            gates: s.gates.filter((g) => !scenario.resolvedGateIds.has(g.id)),
          })),
          data.people,
          delta
        );
      try {
        setPreview(runPortfolioSimulation(specsFor()));
        const floors = new Map<string, SimulationResult>();
        for (const s of scenarioScopes) {
          floors.set(s.scopeId, runPortfolioSimulation(specsFor(s.scopeId)).get(s.scopeId)!);
        }
        setFloorByScope(floors);
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
    floorByScope,
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
