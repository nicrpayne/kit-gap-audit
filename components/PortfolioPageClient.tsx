"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  resolveCapacity,
  validateAllocations,
  unallocatedCapacity,
  type PersonLike,
  type AllocationLike,
} from "@/lib/capacity/resolve";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import { confidenceAtDay, type SimulationResult, type WorkItem, type DecisionGate } from "@/lib/forecast/simulate";
import { computeMomentum } from "@/lib/momentum/compute";
import { computeMomentumTrend, type MomentumTrend } from "@/lib/momentum/trend";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { compareToBaseline } from "@/lib/scenario/compare";
import { detectNamedPersonMoves, type NamedTransferScope } from "@/lib/scenario/namedTransfer";
import ForecastField, { type FieldScope } from "@/components/portfolio/ForecastField";
import InstrumentBay from "@/components/portfolio/InstrumentBay";
import ScenarioInspector from "@/components/portfolio/ScenarioInspector";
import ScenarioBar, { type ScenarioCapacityLine } from "@/components/portfolio/ScenarioBar";
import AllocationDrawer from "@/components/portfolio/AllocationDrawer";
import InstrumentRail from "@/components/instrument/InstrumentRail";
import CommandMenu from "@/components/instrument/CommandMenu";
import type { DependencyDelta, DependentDelta } from "@/lib/portfolio/explain";

// The Instrument. GET /api/portfolio/inputs is the one expensive network
// call (Linear + findings + context, per Scope), fetched once on mount;
// every control interaction after that re-runs resolveCapacity and
// runPortfolioSimulation -- the same pure modules the server uses for the
// saved forecast -- entirely in the browser. There is deliberately no
// second "recompute this scope" implementation in this file: reusing those
// exact functions is what guarantees a live preview can't drift from the
// saved path's correlated-risk behaviour.
//
// Presentation: this page is INSTRUMENT MODE and owns the whole viewport
// (see lib/shell/mode.ts and docs/DESIGN-NORTH-STAR.md). The Workbench nav
// stands down; navigation is the 48px rail, which can be hidden outright.

interface ScopeInputRow {
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
}

interface PersonRow {
  id: string;
  name: string;
  fte: number;
  active: boolean;
}

interface AllocationRow {
  id: string;
  personId: string;
  scopeId: string;
  fraction: number;
}

interface PortfolioInputsResponse {
  startDate: string;
  scopes: ScopeInputRow[];
  people: PersonRow[];
  allocations: AllocationRow[];
  contextSwitchCostPct: number;
}

interface GhostPerson {
  id: string; // "ghost-<scopeId>" -- never sent to any API until Commit creates a real Person
  name: string;
  fte: number;
}

function pairKey(personId: string, scopeId: string): string {
  return `${personId}::${scopeId}`;
}
function ghostIdFor(scopeId: string): string {
  return `ghost-${scopeId}`;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d;
}
function dayOffset(startDate: Date, date: Date): number {
  return (date.getTime() - startDate.getTime()) / 86400000;
}

// Ticks for the shared axis, aiming for roughly 6-10 labels however wide
// the range is. A portfolio usually spans weeks, not years, so short spans
// get dated week markers ("Sep 7") -- month boundaries alone left a
// seven-week axis carrying a single label, which is a ruler with no marks
// on it. Long spans (a misconfigured Scope pulling in years of effort) fall
// back to month/quarter steps so labels can't pile into a smear.
function niceDayStep(spanDays: number): number | null {
  for (const step of [2, 3, 7, 14, 28]) {
    if (spanDays / step <= 10) return step;
  }
  return null; // too wide for day steps -- use months
}

function monthStep(spanDays: number): number {
  const spanMonths = spanDays / 30.44;
  if (spanMonths <= 10) return 1;
  if (spanMonths <= 24) return 2;
  if (spanMonths <= 48) return 3;
  if (spanMonths <= 96) return 6;
  return 12;
}

function axisTicks(startDate: Date, minDay: number, maxDay: number): { day: number; label: string }[] {
  const span = Math.max(1, maxDay - minDay);
  const ticks: { day: number; label: string }[] = [];
  const dayStep = niceDayStep(span);

  if (dayStep !== null) {
    // Align to a week boundary so markers land on the same weekday, which
    // reads as a calendar rather than as an arbitrary interval.
    const first = Math.ceil(minDay / dayStep) * dayStep;
    for (let day = first; day <= maxDay; day += dayStep) {
      const d = addDays(startDate, day);
      ticks.push({
        day,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
    return ticks;
  }

  const step = monthStep(span);
  const first = addDays(startDate, minDay);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  let guard = 0;
  while (guard++ < 200) {
    const day = dayOffset(startDate, cursor);
    if (day > maxDay) break;
    if (day >= minDay) {
      ticks.push({
        day,
        label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }
  return ticks;
}

export default function PortfolioPageClient() {
  const pathname = usePathname();

  const [data, setData] = useState<PortfolioInputsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ghosts, setGhosts] = useState<GhostPerson[]>([]);
  const [fractions, setFractions] = useState<Map<string, number>>(new Map());
  const [switchCostPct, setSwitchCostPct] = useState(0);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{ text: string; hadBlocks: boolean } | null>(null);

  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Shell state. Hiding the rail and collapsing the inspector both exist so
  // the forecast can take the whole screen when it's being presented.
  const [railHidden, setRailHidden] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);

  // Target dates scrubbed on the field but not yet written back.
  const [pendingTargets, setPendingTargets] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/inputs");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't load portfolio data.");
      }
      const body: PortfolioInputsResponse = await res.json();
      setData(body);
      const initial = new Map<string, number>();
      for (const a of body.allocations) initial.set(pairKey(a.personId, a.scopeId), a.fraction);
      setFractions(initial);
      setSwitchCostPct(body.contextSwitchCostPct);
      setGhosts([]);
      setPendingTargets(new Map());
      setDirty(false);
      setSaveSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (meta && e.key === "\\") {
        e.preventDefault();
        setRailHidden((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scenarioScopes: ScenarioInputScope[] | null = useMemo(() => {
    if (!data) return null;
    const startDate = new Date(data.startDate);
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
  }, [data]);

  // Baseline: the saved allocations, computed once per load -- the fixed
  // reference every preview delta is measured against.
  const baseline = useMemo(() => {
    if (!data || !scenarioScopes) return null;
    const baselineDelta: ScenarioInputDelta = {
      allocations: data.allocations.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
      hypotheticalPeople: [],
      contextSwitchCostPct: data.contextSwitchCostPct,
    };
    try {
      return runPortfolioSimulation(applyScenarioInputDelta(scenarioScopes, data.people, baselineDelta));
    } catch {
      return null;
    }
  }, [data, scenarioScopes]);

  const ghostsAsPersonLike: PersonLike[] = useMemo(
    () => ghosts.map((g) => ({ id: g.id, name: g.name, fte: g.fte, active: true })),
    [ghosts]
  );

  const allPeople: PersonLike[] = useMemo(() => {
    if (!data) return [];
    return [...data.people, ...ghostsAsPersonLike];
  }, [data, ghostsAsPersonLike]);

  const currentAllocations: AllocationLike[] = useMemo(() => {
    const out: AllocationLike[] = [];
    for (const [key, fraction] of fractions) {
      if (fraction <= 1e-6) continue;
      const [personId, scopeId] = key.split("::");
      out.push({ personId, scopeId, fraction });
    }
    return out;
  }, [fractions]);

  // Allocations with every scenario ghost removed -- the "what would this
  // Scope resolve to if I hadn't added anything" number the Capacity fader
  // measures its own addition against, and resets to.
  const realPersonAllocations: AllocationLike[] = useMemo(
    () => currentAllocations.filter((a) => !a.personId.startsWith("ghost-")),
    [currentAllocations]
  );

  const overAllocated = useMemo(() => validateAllocations(allPeople, currentAllocations), [allPeople, currentAllocations]);
  const unallocated = useMemo(() => unallocatedCapacity(allPeople, currentAllocations), [allPeople, currentAllocations]);

  const namedMoves = useMemo(() => {
    if (!data) return [];
    const realPersonIds = new Set(data.people.map((p) => p.id));
    const scenarioAllocationsForRealPeople = currentAllocations.filter((a) => realPersonIds.has(a.personId));
    const scopesForTransfer: NamedTransferScope[] = data.scopes.map((s) => ({
      scopeId: s.scopeId,
      name: s.name,
      capacitySource: s.capacitySource,
    }));
    return detectNamedPersonMoves(data.allocations, scenarioAllocationsForRealPeople, data.people, scopesForTransfer);
  }, [data, currentAllocations]);

  const blockedMoves = useMemo(() => namedMoves.filter((m) => !m.eligible), [namedMoves]);
  const blockedPersonIds = useMemo(() => new Set(blockedMoves.map((m) => m.personId)), [blockedMoves]);

  const aggregateConversions = useMemo(() => {
    if (!data) return [];
    const hypotheticalIds = new Set(ghosts.map((g) => g.id));
    const hypotheticalAllocations = currentAllocations.filter((a) => hypotheticalIds.has(a.personId));
    const out: { scopeId: string; scopeName: string; from: number; to: number; wasInferred: boolean }[] = [];
    for (const s of data.scopes) {
      if (s.capacitySource === "allocations") continue;
      const additive = resolveCapacity(s.scopeId, null, ghostsAsPersonLike, hypotheticalAllocations, switchCostPct);
      const contribution = additive.capacity ?? 0;
      if (contribution <= 1e-6) continue;
      out.push({
        scopeId: s.scopeId,
        scopeName: s.name,
        from: s.teamCapacity,
        to: s.teamCapacity + contribution,
        wasInferred: s.capacitySource === "inferred",
      });
    }
    return out;
  }, [data, ghosts, currentAllocations, ghostsAsPersonLike, switchCostPct]);

  const previewDelta: ScenarioInputDelta = useMemo(
    () => ({
      allocations: currentAllocations,
      hypotheticalPeople: ghostsAsPersonLike,
      contextSwitchCostPct: switchCostPct,
    }),
    [currentAllocations, ghostsAsPersonLike, switchCostPct]
  );

  // Debounced client-side resimulation -- immediate enough to feel live
  // while dragging a fader without recomputing 5000 trials x every Scope on
  // every pixel of the drag.
  const [preview, setPreview] = useState<Map<string, SimulationResult> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || !scenarioScopes || overAllocated.length > 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const specs = applyScenarioInputDelta(scenarioScopes, data.people, previewDelta);
      try {
        setPreview(runPortfolioSimulation(specs));
      } catch {
        // A hypothetical dependsOnScopeIds cycle can't happen from this UI.
      }
    }, 110);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [data, scenarioScopes, previewDelta, overAllocated.length]);

  const startDateObj = useMemo(() => (data ? new Date(data.startDate) : null), [data]);

  const axis = useMemo(() => {
    if (!data || !startDateObj) return null;
    const days: number[] = [0];
    for (const s of data.scopes) {
      for (const r of [baseline?.get(s.scopeId), preview?.get(s.scopeId)]) {
        if (!r) continue;
        days.push(r.percentiles.p10, r.percentiles.p90);
      }
      const t = pendingTargets.get(s.scopeId) ?? s.targetDate;
      if (t) days.push(dayOffset(startDateObj, new Date(t)));
    }
    const minDay = Math.min(0, ...days);
    const maxDayRaw = Math.max(...days);
    // Generous right padding: the density curve is drawn across the whole
    // axis, so a fat right tail needs somewhere to land instead of being
    // sliced off by the panel edge.
    const maxDay = maxDayRaw + Math.max(8, maxDayRaw * 0.16);
    return { minDay, maxDay, ticks: axisTicks(startDateObj, minDay, maxDay) };
  }, [data, startDateObj, baseline, preview, pendingTargets]);

  // Live effective capacity per Scope. Branches on capacitySource exactly
  // like applyScenarioInputDelta -- NOT a plain resolveCapacity call. For an
  // explicit/inferred Scope, resolveCapacity alone would return only the
  // scenario's own contribution and silently drop the preserved aggregate
  // baseline, displaying e.g. "1.0 FTE" for a Scope simulating at 5.0.
  const capacityFor = useCallback(
    (allocations: AllocationLike[], people: PersonLike[], pct: number) => {
      const out = new Map<string, number>();
      if (!data) return out;
      for (const s of data.scopes) {
        if (s.capacitySource === "allocations") {
          const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, people, allocations, pct);
          out.set(s.scopeId, resolved.capacity ?? s.teamCapacity);
        } else {
          const additive = resolveCapacity(s.scopeId, null, people, allocations, pct);
          out.set(s.scopeId, s.teamCapacity + (additive.capacity ?? 0));
        }
      }
      return out;
    },
    [data]
  );

  const capacityByScope = useMemo(
    () => capacityFor(currentAllocations, allPeople, switchCostPct),
    [capacityFor, currentAllocations, allPeople, switchCostPct]
  );
  // The same resolution with scenario ghosts excluded: the Capacity fader's
  // zero point, so "how much did I add" stays truthful even after the
  // switch-cost lever has moved everyone's effective contribution.
  const baseCapacityByScope = useMemo(
    () => capacityFor(realPersonAllocations, data?.people ?? [], switchCostPct),
    [capacityFor, realPersonAllocations, data?.people, switchCostPct]
  );

  const effectiveSelectedScopeId = selectedScopeId ?? data?.scopes[0]?.scopeId ?? null;

  const scenarioAnonymousFteByScope = useMemo(() => {
    const out = new Map<string, number>();
    const ghostById = new Map(ghosts.map((g) => [g.id, g]));
    for (const [key, fraction] of fractions) {
      if (fraction <= 1e-6) continue;
      const [personId, scopeId] = key.split("::");
      const g = ghostById.get(personId);
      if (!g) continue;
      out.set(scopeId, (out.get(scopeId) ?? 0) + fraction * g.fte);
    }
    return out;
  }, [ghosts, fractions]);

  const namedFteChangedScopeIds = useMemo(() => {
    const out = new Set<string>();
    for (const m of namedMoves) for (const c of m.changes) out.add(c.scopeId);
    return out;
  }, [namedMoves]);

  const selectedScopeDeps = useMemo(() => {
    const empty: { dependsOn: DependencyDelta[]; dependents: DependentDelta[] } = { dependsOn: [], dependents: [] };
    if (!data || !effectiveSelectedScopeId) return empty;
    const scope = data.scopes.find((s) => s.scopeId === effectiveSelectedScopeId);
    if (!scope) return empty;
    const deltaFor = (scopeId: string): number => {
      const b = baseline?.get(scopeId);
      const p = preview?.get(scopeId) ?? b;
      return compareToBaseline(b, p).deltaDays;
    };
    const dependsOn: DependencyDelta[] = scope.dependsOnScopeIds.map((id) => ({
      scopeId: id,
      name: data.scopes.find((s) => s.scopeId === id)?.name ?? id,
      deltaDays: deltaFor(id),
    }));
    const dependents: DependentDelta[] = data.scopes
      .filter((s) => s.dependsOnScopeIds.includes(effectiveSelectedScopeId))
      .map((s) => ({ scopeId: s.scopeId, name: s.name, deltaDays: deltaFor(s.scopeId) }));
    return { dependsOn, dependents };
  }, [data, baseline, preview, effectiveSelectedScopeId]);

  // Momentum: the SAVED baseline against the most recent stored Report --
  // same semantics and the same computeMomentum /forecast and /reports use.
  // Deliberately not the live preview: an unsaved scenario has its own "vs
  // Reality" delta already, and this answers a different question (has this
  // Scope actually moved since it was last reported on).
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

  const fieldScopes: FieldScope[] = useMemo(() => {
    if (!data) return [];
    return data.scopes.map((s) => ({
      scopeId: s.scopeId,
      name: s.name,
      dependsOnScopeIds: s.dependsOnScopeIds,
      targetDate: s.targetDate,
    }));
  }, [data]);

  // "When does this all ship" across scopes = the last scope to land. The
  // page's headline answer, and the number a scenario is ultimately judged
  // on -- pulling one scope in doesn't matter if a later one still gates.
  const portfolio = useMemo(() => {
    if (!data) return { likely: null as Date | null, deltaDays: 0, gatedBy: null as string | null };
    let activeMax: number | null = null;
    let baseMax: number | null = null;
    let gatedBy: string | null = null;
    for (const s of data.scopes) {
      const b = baseline?.get(s.scopeId);
      const p = preview?.get(s.scopeId) ?? b;
      if (p && (activeMax === null || p.likelyDate.getTime() > activeMax)) {
        activeMax = p.likelyDate.getTime();
        gatedBy = s.name;
      }
      if (b) baseMax = Math.max(baseMax ?? -Infinity, b.likelyDate.getTime());
    }
    return {
      likely: activeMax === null ? null : new Date(activeMax),
      deltaDays: activeMax !== null && baseMax !== null ? Math.round((activeMax - baseMax) / 86400000) : 0,
      gatedBy,
    };
  }, [data, baseline, preview]);

  const capacityLinesForBar: ScenarioCapacityLine[] = useMemo(() => {
    if (!data) return [];
    const out: ScenarioCapacityLine[] = [];
    for (const s of data.scopes) {
      const fte = scenarioAnonymousFteByScope.get(s.scopeId) ?? 0;
      if (fte > 1e-6) out.push({ scopeId: s.scopeId, scopeName: s.name, fteAdded: fte });
    }
    return out;
  }, [data, scenarioAnonymousFteByScope]);

  const eligibleNamedMoveCount = namedMoves.length - blockedMoves.length;

  // ---- interaction handlers -------------------------------------------

  function setFraction(personId: string, scopeId: string, pct: number) {
    setFractions((prev) => {
      const next = new Map(prev);
      next.set(pairKey(personId, scopeId), Math.max(0, Math.min(100, pct)) / 100);
      return next;
    });
    setDirty(true);
  }

  // The Capacity fader's write path. One scenario ghost per Scope, whose FTE
  // *is* the added amount -- so a continuous fader maps onto exactly one
  // hypothetical person rather than a pile of 1.0-FTE placeholders. Commit
  // semantics are untouched: on an allocations-sourced Scope this ghost
  // becomes a real Person + Allocation; on an aggregate Scope it is folded
  // into a new explicitTeamCapacity and never becomes a Person row (see
  // docs/SCENARIO-MODEL.md).
  const setScopeCapacity = useCallback(
    (scopeId: string, scopeName: string, targetFte: number) => {
      const base = baseCapacityByScope.get(scopeId) ?? 0;
      const added = Math.max(0, parseFloat((targetFte - base).toFixed(3)));
      const id = ghostIdFor(scopeId);
      setGhosts((prev) => {
        const rest = prev.filter((g) => g.id !== id);
        return added > 1e-6 ? [...rest, { id, name: `Added capacity — ${scopeName}`, fte: added }] : rest;
      });
      setFractions((prev) => {
        const next = new Map(prev);
        if (added > 1e-6) next.set(pairKey(id, scopeId), 1.0);
        else next.delete(pairKey(id, scopeId));
        return next;
      });
      setDirty(true);
    },
    [baseCapacityByScope]
  );

  function scrubTarget(scopeId: string, iso: string) {
    setPendingTargets((prev) => {
      const next = new Map(prev);
      next.set(scopeId, iso);
      return next;
    });
  }

  // Unlike the batched Commit, this writes ONE Scope's targetDate straight
  // away -- reusing the existing PATCH /api/scopes/:id rather than a new
  // endpoint -- and updates `data` in place so the axis and confidence
  // readouts pick up the saved value without a full reload.
  async function saveTargetDate(scopeId: string) {
    const targetDate = pendingTargets.get(scopeId);
    if (targetDate === undefined) return;
    try {
      const res = await fetch(`/api/scopes/${scopeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save the target date.");
      setData((prev) =>
        prev ? { ...prev, scopes: prev.scopes.map((s) => (s.scopeId === scopeId ? { ...s, targetDate } : s)) } : prev
      );
      setPendingTargets((prev) => {
        const next = new Map(prev);
        next.delete(scopeId);
        return next;
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the target date.");
    }
  }

  async function removePerson(personId: string, isGhost: boolean) {
    setRemoveError(null);
    if (isGhost) {
      setGhosts((prev) => prev.filter((g) => g.id !== personId));
      setFractions((prev) => {
        const next = new Map(prev);
        for (const key of next.keys()) if (key.startsWith(`${personId}::`)) next.delete(key);
        return next;
      });
      setDirty(true);
      return;
    }
    setRemovingId(personId);
    try {
      const res = await fetch(`/api/people/${personId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't remove that person.");
      }
      await load();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Couldn't remove that person.");
    } finally {
      setRemovingId(null);
    }
  }

  function discard() {
    if (!data) return;
    const initial = new Map<string, number>();
    for (const a of data.allocations) initial.set(pairKey(a.personId, a.scopeId), a.fraction);
    setFractions(initial);
    setSwitchCostPct(data.contextSwitchCostPct);
    setGhosts([]);
    setPendingTargets(new Map());
    setDirty(false);
    setSaveError(null);
    setSaveSummary(null);
  }

  // Commit rules (docs/SCENARIO-MODEL.md's "Save / Commit" section):
  // - A Scope's capacitySource never flips as a side effect. An anonymous
  //   contribution to an allocations-sourced Scope becomes a real Person +
  //   Allocation; to an explicit/inferred Scope it is folded into a new
  //   explicitTeamCapacity and never gets a Person row.
  // - A real person's allocation change commits normally when every Scope
  //   they'd land on is allocations-sourced; if ANY touched Scope is
  //   aggregate-sourced the whole person is excluded, both legs of the move,
  //   so Reality never shows someone at under 100% with the rest vanished.
  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    setSaveSummary(null);
    try {
      const scopesById = new Map(data.scopes.map((s) => [s.scopeId, s]));
      const allocationsScopeIds = new Set(
        data.scopes.filter((s) => s.capacitySource === "allocations").map((s) => s.scopeId)
      );

      const idRemap = new Map<string, string>();
      for (const g of ghosts) {
        const usedOnAllocationsScope = [...fractions.entries()].some(([key, f]) => {
          if (!key.startsWith(`${g.id}::`) || f <= 1e-6) return false;
          return allocationsScopeIds.has(key.split("::")[1]);
        });
        if (!usedOnAllocationsScope) continue;
        const res = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: g.name, fte: g.fte }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Couldn't create "${g.name}"`);
        idRemap.set(g.id, body.person.id);
      }

      const rowKeyFor = new Map<string, string>();
      for (const [ghostId, realId] of idRemap) rowKeyFor.set(realId, ghostId);

      const personIds = new Set<string>();
      for (const a of data.allocations) if (!blockedPersonIds.has(a.personId)) personIds.add(a.personId);
      for (const key of fractions.keys()) {
        const [personId] = key.split("::");
        if (personId.startsWith("ghost-")) {
          const real = idRemap.get(personId);
          if (real) personIds.add(real);
        } else if (!blockedPersonIds.has(personId)) {
          personIds.add(personId);
        }
      }

      const payload = [];
      for (const personId of personIds) {
        const rowKeyPersonId = rowKeyFor.get(personId) ?? personId;
        for (const scope of data.scopes) {
          // Never write a person-level allocation onto an aggregate Scope --
          // that would silently flip its capacitySource. (The server
          // enforces this independently too.)
          if (!allocationsScopeIds.has(scope.scopeId)) continue;
          const fraction = fractions.get(pairKey(rowKeyPersonId, scope.scopeId)) ?? 0;
          payload.push({ personId, scopeId: scope.scopeId, fraction });
        }
      }

      const putRes = await fetch("/api/allocations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: payload }),
      });
      const putBody = await putRes.json().catch(() => ({}));
      if (!putRes.ok) throw new Error(putBody.error ?? "Couldn't save allocations.");

      for (const conversion of aggregateConversions) {
        const patchRes = await fetch(`/api/scopes/${conversion.scopeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamCapacity: conversion.to }),
        });
        if (!patchRes.ok) {
          const b = await patchRes.json().catch(() => ({}));
          throw new Error(b.error ?? `Couldn't update ${scopesById.get(conversion.scopeId)?.name ?? conversion.scopeId}'s capacity.`);
        }
      }

      if (switchCostPct !== data.contextSwitchCostPct) {
        const settingsRes = await fetch("/api/portfolio-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextSwitchCostPct: switchCostPct }),
        });
        if (!settingsRes.ok) {
          const b = await settingsRes.json().catch(() => ({}));
          throw new Error(b.error ?? "Couldn't save the context-switch setting.");
        }
      }

      const summaryParts: string[] = [];
      if (aggregateConversions.length > 0) {
        summaryParts.push(aggregateConversions.map((c) => `${c.scopeName} capacity set to ${c.to.toFixed(2)} (explicit)`).join("; "));
      }
      if (blockedMoves.length > 0) {
        summaryParts.push(
          `${blockedMoves.length} change${blockedMoves.length === 1 ? "" : "s"} not saved: ${blockedMoves.map((m) => m.personName).join(", ")}`
        );
      }
      if (summaryParts.length > 0) setSaveSummary({ text: summaryParts.join(" · "), hadBlocks: blockedMoves.length > 0 });

      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  // ---- render ----------------------------------------------------------

  const shell = (children: React.ReactNode) => (
    <div className="instrument fixed inset-0 flex overflow-hidden">
      <InstrumentRail
        pathname={pathname}
        hidden={railHidden}
        onToggle={() => setRailHidden((v) => !v)}
        onOpenCommand={() => setCommandOpen(true)}
      />
      {children}
    </div>
  );

  if (loading && !data) {
    return shell(
      <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
        Loading portfolio…
      </div>
    );
  }
  if (error) {
    return shell(<div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-red)]">{error}</div>);
  }
  if (!data) return null;

  if (data.scopes.length === 0) {
    return shell(
      <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
        No Scope configured yet. Add one at /scopes to see a portfolio view.
      </div>
    );
  }

  const selectedScope = effectiveSelectedScopeId
    ? data.scopes.find((s) => s.scopeId === effectiveSelectedScopeId) ?? null
    : null;
  const selectedBaseline = effectiveSelectedScopeId ? baseline?.get(effectiveSelectedScopeId) : undefined;
  const selectedPreview = effectiveSelectedScopeId ? preview?.get(effectiveSelectedScopeId) : undefined;
  const selectedActive = selectedPreview ?? selectedBaseline;

  // Confidence shown in the bay comes from wherever the target currently
  // sits -- including an unsaved scrub -- so the meter can never disagree
  // with the flag the user is dragging on the field.
  const selectedTargetIso = selectedScope
    ? pendingTargets.get(selectedScope.scopeId) ?? selectedScope.targetDate
    : null;
  const selectedConfidence =
    selectedActive && selectedTargetIso && startDateObj
      ? confidenceAtDay(selectedActive.completionDaysSorted, dayOffset(startDateObj, new Date(selectedTargetIso)))
      : null;
  const spreadDays = selectedActive
    ? Math.round(selectedActive.percentiles.p90 - selectedActive.percentiles.p10)
    : null;
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const spreadRange =
    selectedActive && startDateObj
      ? {
          earliest: fmtDay(addDays(startDateObj, selectedActive.percentiles.p10)),
          latest: fmtDay(addDays(startDateObj, selectedActive.percentiles.p90)),
        }
      : null;
  const sinceLabel = selectedScope?.lastReport
    ? fmtDay(new Date(selectedScope.lastReport.generatedAt))
    : null;

  // The trend line ends on the value the Momentum headline is talking about.
  // Plotting only stored reports let the line trend one way while the words
  // ("44 days sooner") described the live-vs-last-report step, which is a
  // different comparison -- so the last point here IS today's baseline, and
  // the final segment is exactly the delta being named.
  // Plain computation, not useMemo: this sits below the early returns above,
  // so a hook here would violate the rules of hooks. It is a map over <=10
  // rows and costs nothing.
  const trendSeries: number[] = selectedScope
    ? (() => {
        const pts = selectedScope.reportHistory.map((r) => new Date(r.likelyDate).getTime());
        const b = baseline?.get(selectedScope.scopeId);
        if (b) pts.push(b.likelyDate.getTime());
        return pts;
      })()
    : [];

  return shell(
    <>
      <div className="flex-1 min-w-0 flex flex-col">
        <ScenarioBar
          dirty={dirty}
          saving={saving}
          canCommit={overAllocated.length === 0}
          capacityLines={capacityLinesForBar}
          namedTransferCount={eligibleNamedMoveCount}
          switchCostChanged={switchCostPct !== data.contextSwitchCostPct}
          aggregateConversions={aggregateConversions}
          blockedMoves={blockedMoves.map((m) => ({
            personId: m.personId,
            personName: m.personName,
            blockedReason: m.blockedReason ?? "",
          }))}
          onCommit={save}
          onDiscard={discard}
          onOpenAllocations={() => setAllocationsOpen(true)}
          saveError={saveError}
          saveSummary={saveSummary}
        />

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col" style={{ background: "var(--i-bg)" }}>
            <ForecastField
              scopes={fieldScopes}
              baseline={baseline}
              preview={preview}
              axis={axis}
              startDate={startDateObj!}
              dirty={dirty}
              selectedScopeId={effectiveSelectedScopeId}
              onSelectScope={setSelectedScopeId}
              onScrubTarget={scrubTarget}
              pendingTargets={pendingTargets}
              onSaveTarget={saveTargetDate}
              portfolioLikely={portfolio.likely}
              portfolioDeltaDays={portfolio.deltaDays}
              portfolioGatedBy={portfolio.gatedBy}
            />

            {selectedScope && (
              <InstrumentBay
                scopeName={selectedScope.name}
                realityCapacity={selectedScope.teamCapacity}
                scenarioCapacity={capacityByScope.get(selectedScope.scopeId) ?? selectedScope.teamCapacity}
                onCapacityChange={(fte) => setScopeCapacity(selectedScope.scopeId, selectedScope.name, fte)}
                capacityDisabled={overAllocated.length > 0}
                switchCostPct={switchCostPct}
                savedSwitchCostPct={data.contextSwitchCostPct}
                onSwitchCostChange={(pct) => {
                  setSwitchCostPct(Math.round(pct));
                  setDirty(true);
                }}
                trend={momentumByScope.get(selectedScope.scopeId) ?? null}
                trendSeries={trendSeries}
                confidencePct={selectedConfidence}
                targetLabel={
                  selectedTargetIso
                    ? `by ${new Date(selectedTargetIso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`
                    : "no target set"
                }
                spreadDays={spreadDays}
                spreadRange={spreadRange}
                sinceLabel={sinceLabel}
                gates={selectedScope.gates.map((g) => ({ id: g.id, label: g.label, likely: g.likely }))}
                onInspectMomentum={() => setInspectorOpen(true)}
              />
            )}
          </div>

          {/* Below ~1280px there isn't room for a 296px narration panel and
              a legible field at the same time; the field wins, and every
              fact in here is still reachable from the bay's readouts. */}
          {selectedScope && inspectorOpen ? (
            <ScenarioInspector
              scope={{
                scopeId: selectedScope.scopeId,
                name: selectedScope.name,
                targetDate: selectedScope.targetDate,
                capacitySource: selectedScope.capacitySource,
              }}
              baseline={selectedBaseline}
              preview={selectedPreview}
              dirty={dirty}
              anonymousFteAdded={scenarioAnonymousFteByScope.get(selectedScope.scopeId) ?? 0}
              namedFteChanged={namedFteChangedScopeIds.has(selectedScope.scopeId)}
              dependsOn={selectedScopeDeps.dependsOn}
              dependents={selectedScopeDeps.dependents}
              trend={momentumByScope.get(selectedScope.scopeId) ?? null}
              onCollapse={() => setInspectorOpen(false)}
            />
          ) : (
            <button
              onClick={() => setInspectorOpen(true)}
              aria-label="Show inspector"
              title="Show inspector"
              className="shrink-0 w-6 hidden xl:flex items-start justify-center pt-3.5 text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
              style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
            >
              ‹
            </button>
          )}
        </div>
      </div>

      <CommandMenu
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        scopes={data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
        onSelectScope={setSelectedScopeId}
      />

      <AllocationDrawer
        open={allocationsOpen}
        onClose={() => setAllocationsOpen(false)}
        scopes={data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
        people={allPeople}
        fractionFor={(personId, scopeId) => fractions.get(pairKey(personId, scopeId)) ?? 0}
        onSetFraction={setFraction}
        capacityByScope={capacityByScope}
        overAllocated={overAllocated}
        unallocated={unallocated}
        onRemovePerson={removePerson}
        removingId={removingId}
        removeError={removeError}
      />
    </>
  );
}
