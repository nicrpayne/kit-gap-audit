"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  resolveCapacity,
  validateAllocations,
  unallocatedCapacity,
  type PersonLike,
  type AllocationLike,
  type CapacityContributor,
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
import ScenarioInspector, {
  type InspectorFocus,
  type CapacityBasisView,
  type SwitchCostScopeView,
} from "@/components/portfolio/ScenarioInspector";
import ScenarioBar, { type ScenarioCapacityLine } from "@/components/portfolio/ScenarioBar";
import AllocationDrawer from "@/components/portfolio/AllocationDrawer";
import InstrumentRail from "@/components/instrument/InstrumentRail";
import CommandMenu from "@/components/instrument/CommandMenu";
import { mutateReality } from "@/lib/instrument/reality";
import type { DependencyDelta, DependentDelta } from "@/lib/portfolio/explain";

// The Instrument. GET /api/portfolio/inputs is the one expensive network
// call (Linear + findings + context, per Scope), fetched once on mount;
// every control interaction after that re-runs resolveCapacity and
// runPortfolioSimulation -- the same pure modules the server uses for the
// saved forecast -- entirely in the browser.
//
// Capacity model: the Capacity fader writes an AGGREGATE CAPACITY SCENARIO
// (capacityOverrideByScope, see lib/scenario/inputDelta.ts) -- "simulate
// this scope at N FTE" -- which is bidirectional and deliberately knows
// nothing about who. Named-person reallocation is a separate operation with
// separate commit rules, and lives in the allocation drawer until the
// Resource Mixer exists.

interface CapacityBasisPayload {
  kind: "allocations" | "explicit" | "inferred";
  contributors?: CapacityContributor[];
  value?: number;
  assignees?: string[];
  remainingIssueCount?: number;
  unassignedCount?: number;
}

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
  capacityBasis: CapacityBasisPayload;
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

function pairKey(personId: string, scopeId: string): string {
  return `${personId}::${scopeId}`;
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
// the range is. A portfolio usually spans weeks, so short spans get dated
// week markers; long spans fall back to month/quarter steps.
function niceDayStep(spanDays: number): number | null {
  for (const step of [2, 3, 7, 14, 28]) {
    if (spanDays / step <= 10) return step;
  }
  return null;
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
    const first = Math.ceil(minDay / dayStep) * dayStep;
    for (let day = first; day <= maxDay; day += dayStep) {
      ticks.push({
        day,
        label: addDays(startDate, day).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
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

  // The aggregate capacity scenario: scopeId -> simulated FTE. Absent = no
  // hypothetical for that scope.
  const [capacityOverrides, setCapacityOverrides] = useState<Map<string, number>>(new Map());
  const [fractions, setFractions] = useState<Map<string, number>>(new Map());
  const [switchCostPct, setSwitchCostPct] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{ text: string; hadBlocks: boolean } | null>(null);

  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [railHidden, setRailHidden] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorFocus, setInspectorFocus] = useState<InspectorFocus>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);

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
      setCapacityOverrides(new Map());
      setPendingTargets(new Map());
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

  const allPeople: PersonLike[] = useMemo(() => data?.people ?? [], [data]);

  const currentAllocations: AllocationLike[] = useMemo(() => {
    const out: AllocationLike[] = [];
    for (const [key, fraction] of fractions) {
      if (fraction <= 1e-6) continue;
      const [personId, scopeId] = key.split("::");
      out.push({ personId, scopeId, fraction });
    }
    return out;
  }, [fractions]);

  const overAllocated = useMemo(() => validateAllocations(allPeople, currentAllocations), [allPeople, currentAllocations]);
  const unallocated = useMemo(() => unallocatedCapacity(allPeople, currentAllocations), [allPeople, currentAllocations]);

  const namedMoves = useMemo(() => {
    if (!data) return [];
    const scopesForTransfer: NamedTransferScope[] = data.scopes.map((s) => ({
      scopeId: s.scopeId,
      name: s.name,
      capacitySource: s.capacitySource,
    }));
    return detectNamedPersonMoves(data.allocations, currentAllocations, data.people, scopesForTransfer);
  }, [data, currentAllocations]);

  const blockedMoves = useMemo(() => namedMoves.filter((m) => !m.eligible), [namedMoves]);
  const blockedPersonIds = useMemo(() => new Set(blockedMoves.map((m) => m.personId)), [blockedMoves]);

  const overridesRecord = useMemo(() => Object.fromEntries(capacityOverrides), [capacityOverrides]);

  const previewDelta: ScenarioInputDelta = useMemo(
    () => ({
      allocations: currentAllocations,
      hypotheticalPeople: [],
      contextSwitchCostPct: switchCostPct,
      capacityOverrideByScope: overridesRecord,
    }),
    [currentAllocations, switchCostPct, overridesRecord]
  );

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
    const maxDay = maxDayRaw + Math.max(8, maxDayRaw * 0.16);
    return { minDay, maxDay, ticks: axisTicks(startDateObj, minDay, maxDay) };
  }, [data, startDateObj, baseline, preview, pendingTargets]);

  // What each Scope will actually be simulated at, mirroring
  // applyScenarioInputDelta's own branching exactly: an aggregate override
  // wins outright; otherwise Reality's resolution runs with the scenario's
  // current switch-cost and allocations.
  const scenarioCapacityByScope = useMemo(() => {
    const out = new Map<string, number>();
    if (!data) return out;
    for (const s of data.scopes) {
      const override = capacityOverrides.get(s.scopeId);
      if (override !== undefined) {
        out.set(s.scopeId, override);
        continue;
      }
      if (s.capacitySource === "allocations") {
        const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, allPeople, currentAllocations, switchCostPct);
        out.set(s.scopeId, resolved.capacity ?? s.teamCapacity);
      } else {
        out.set(s.scopeId, s.teamCapacity);
      }
    }
    return out;
  }, [data, capacityOverrides, allPeople, currentAllocations, switchCostPct]);

  const effectiveSelectedScopeId = selectedScopeId ?? data?.scopes[0]?.scopeId ?? null;

  // Which scopes carry a scenario change -- the CHANGED set, deliberately
  // distinct from which scope is selected.
  const changedScopeNames = useMemo(() => {
    if (!data) return [];
    const names: string[] = [];
    for (const s of data.scopes) {
      const override = capacityOverrides.get(s.scopeId);
      if (override !== undefined && Math.abs(override - s.teamCapacity) > 1e-6) names.push(s.name);
    }
    return names;
  }, [data, capacityOverrides]);

  const namedFteChangedScopeIds = useMemo(() => {
    const out = new Set<string>();
    for (const m of namedMoves) for (const c of m.changes) out.add(c.scopeId);
    return out;
  }, [namedMoves]);

  const switchCostChanged = !!data && switchCostPct !== data.contextSwitchCostPct;
  const dirty =
    changedScopeNames.length > 0 || namedMoves.length > 0 || switchCostChanged || capacityOverrides.size > 0;

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
      changed: capacityOverrides.has(s.scopeId) || namedFteChangedScopeIds.has(s.scopeId),
    }));
  }, [data, capacityOverrides, namedFteChangedScopeIds]);

  const capacityLinesForBar: ScenarioCapacityLine[] = useMemo(() => {
    if (!data) return [];
    const out: ScenarioCapacityLine[] = [];
    for (const s of data.scopes) {
      const override = capacityOverrides.get(s.scopeId);
      if (override === undefined || Math.abs(override - s.teamCapacity) <= 1e-6) continue;
      out.push({
        scopeId: s.scopeId,
        scopeName: s.name,
        realityFte: s.teamCapacity,
        scenarioFte: override,
      });
    }
    return out;
  }, [data, capacityOverrides]);

  // Aggregate overrides that CAN be committed truthfully: the Scope's
  // Reality is a single number, so a single number is a faithful record of
  // the change.
  const aggregateConversions = useMemo(() => {
    if (!data) return [];
    const out: { scopeId: string; scopeName: string; from: number; to: number; wasInferred: boolean }[] = [];
    for (const s of data.scopes) {
      if (s.capacitySource === "allocations") continue;
      const override = capacityOverrides.get(s.scopeId);
      if (override === undefined || Math.abs(override - s.teamCapacity) <= 1e-6) continue;
      out.push({
        scopeId: s.scopeId,
        scopeName: s.name,
        from: s.teamCapacity,
        to: override,
        wasInferred: s.capacitySource === "inferred",
      });
    }
    return out;
  }, [data, capacityOverrides]);

  // Aggregate overrides that CANNOT be committed: Reality here is a set of
  // named people, and a single total doesn't say who changed. Previewing is
  // fine; writing it back would silently destroy the person-level truth.
  const blockedCapacityScopes = useMemo(() => {
    if (!data) return [];
    const out: { scopeId: string; scopeName: string; realityFte: number; scenarioFte: number }[] = [];
    for (const s of data.scopes) {
      if (s.capacitySource !== "allocations") continue;
      const override = capacityOverrides.get(s.scopeId);
      if (override === undefined || Math.abs(override - s.teamCapacity) <= 1e-6) continue;
      out.push({ scopeId: s.scopeId, scopeName: s.name, realityFte: s.teamCapacity, scenarioFte: override });
    }
    return out;
  }, [data, capacityOverrides]);

  // Context-switch reach, derived entirely from Reality's own sources.
  const switchCostScopes: SwitchCostScopeView[] = useMemo(() => {
    if (!data) return [];
    const scopeCountByPerson = new Map<string, number>();
    for (const a of currentAllocations) {
      if (a.fraction <= 0) continue;
      scopeCountByPerson.set(a.personId, (scopeCountByPerson.get(a.personId) ?? 0) + 1);
    }
    const nameById = new Map(data.people.map((p) => [p.id, p.name]));
    return data.scopes.map((s) => {
      const here = currentAllocations.filter((a) => a.scopeId === s.scopeId && a.fraction > 0);
      return {
        scopeId: s.scopeId,
        name: s.name,
        source: s.capacitySource,
        trackedPeople: here.length,
        splitPeople: here
          .filter((a) => (scopeCountByPerson.get(a.personId) ?? 1) > 1)
          .map((a) => nameById.get(a.personId) ?? a.personId),
      };
    });
  }, [data, currentAllocations]);

  const splitPeopleCount = useMemo(
    () => new Set(switchCostScopes.flatMap((s) => s.splitPeople)).size,
    [switchCostScopes]
  );
  const trackedScopeCount = switchCostScopes.filter((s) => s.source === "allocations").length;

  // ---- interaction handlers -------------------------------------------

  function setFraction(personId: string, scopeId: string, pct: number) {
    setFractions((prev) => {
      const next = new Map(prev);
      next.set(pairKey(personId, scopeId), Math.max(0, Math.min(100, pct)) / 100);
      return next;
    });
  }

  // The Capacity fader's whole write path. Landing back on Reality removes
  // the override entirely rather than storing "an override that happens to
  // equal Reality", so Discard/Commit state stays honest.
  const setScopeCapacity = useCallback(
    (scopeId: string, realityFte: number, fte: number) => {
      setCapacityOverrides((prev) => {
        const next = new Map(prev);
        if (Math.abs(fte - realityFte) <= 1e-6) next.delete(scopeId);
        else next.set(scopeId, fte);
        return next;
      });
    },
    []
  );

  function scrubTarget(scopeId: string, iso: string) {
    setPendingTargets((prev) => {
      const next = new Map(prev);
      next.set(scopeId, iso);
      return next;
    });
  }

  async function saveTargetDate(scopeId: string) {
    const targetDate = pendingTargets.get(scopeId);
    if (targetDate === undefined) return;
    try {
      const res = await mutateReality(`/api/scopes/${scopeId}`, {
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

  // "Set actual capacity" -- corrects REALITY, not a hypothetical. Writes
  // straight through the existing PATCH /api/scopes/:id and reloads, so the
  // Scope's source becomes explicit exactly as it would from Scope settings.
  async function saveRealityCapacity(scopeId: string, fte: number) {
    const res = await mutateReality(`/api/scopes/${scopeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamCapacity: fte }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Couldn't set the capacity.");
    setCapacityOverrides((prev) => {
      const next = new Map(prev);
      next.delete(scopeId);
      return next;
    });
    await load();
  }

  async function removePerson(personId: string) {
    setRemoveError(null);
    setRemovingId(personId);
    try {
      const res = await mutateReality(`/api/people/${personId}`, { method: "DELETE" });
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
    setCapacityOverrides(new Map());
    setPendingTargets(new Map());
    setSaveError(null);
    setSaveSummary(null);
  }

  // Commit rules (docs/SCENARIO-MODEL.md):
  // - An aggregate capacity scenario on an explicit/inferred Scope commits
  //   as a new explicitTeamCapacity. Reality there is one number, so one
  //   number records it faithfully. No Person rows are ever invented.
  // - An aggregate capacity scenario on an allocations-sourced Scope is
  //   BLOCKED: a total can't say which named person changed, and writing it
  //   would silently discard the person-level truth. Preview is allowed;
  //   commit is not.
  // - Named-person allocation changes commit as they always did, with the
  //   same eligibility rules.
  const canCommit = overAllocated.length === 0 && blockedCapacityScopes.length === 0;

  async function save() {
    if (!data || !canCommit) return;
    setSaving(true);
    setSaveError(null);
    setSaveSummary(null);
    try {
      const scopesById = new Map(data.scopes.map((s) => [s.scopeId, s]));
      const allocationsScopeIds = new Set(
        data.scopes.filter((s) => s.capacitySource === "allocations").map((s) => s.scopeId)
      );

      const personIds = new Set<string>();
      for (const a of data.allocations) if (!blockedPersonIds.has(a.personId)) personIds.add(a.personId);
      for (const key of fractions.keys()) {
        const [personId] = key.split("::");
        if (!blockedPersonIds.has(personId)) personIds.add(personId);
      }

      const payload = [];
      for (const personId of personIds) {
        for (const scope of data.scopes) {
          // Never write a person-level allocation onto an aggregate Scope --
          // that would silently flip its capacitySource. (The server
          // enforces this independently too.)
          if (!allocationsScopeIds.has(scope.scopeId)) continue;
          payload.push({ personId, scopeId: scope.scopeId, fraction: fractions.get(pairKey(personId, scope.scopeId)) ?? 0 });
        }
      }

      if (payload.length > 0) {
        const putRes = await mutateReality("/api/allocations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allocations: payload }),
        });
        const putBody = await putRes.json().catch(() => ({}));
        if (!putRes.ok) throw new Error(putBody.error ?? "Couldn't save allocations.");
      }

      for (const conversion of aggregateConversions) {
        const patchRes = await mutateReality(`/api/scopes/${conversion.scopeId}`, {
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
        const settingsRes = await mutateReality("/api/portfolio-settings", {
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

  function openInspector(focus: InspectorFocus) {
    setInspectorOpen(true);
    setInspectorFocus(focus);
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
  const sinceLabel = selectedScope?.lastReport ? fmtDay(new Date(selectedScope.lastReport.generatedAt)) : null;

  const trendSeries: number[] = selectedScope
    ? (() => {
        const pts = selectedScope.reportHistory.map((r) => new Date(r.likelyDate).getTime());
        const b = baseline?.get(selectedScope.scopeId);
        if (b) pts.push(b.likelyDate.getTime());
        return pts;
      })()
    : [];

  // Setting a first target: default it to the current P50, the one date the
  // model can actually justify as a starting point, then let the flag be
  // dragged from there.
  function setInitialTarget() {
    if (!selectedScope || !selectedActive || !startDateObj) return;
    scrubTarget(selectedScope.scopeId, addDays(startDateObj, selectedActive.percentiles.p50).toISOString().slice(0, 10));
  }

  const basisPayload = selectedScope?.capacityBasis;
  const capacityBasis: CapacityBasisView =
    basisPayload?.kind === "allocations"
      ? { kind: "allocations", contributors: basisPayload.contributors ?? [] }
      : basisPayload?.kind === "explicit"
        ? { kind: "explicit", value: basisPayload.value ?? selectedScope!.teamCapacity }
        : {
            kind: "inferred",
            assignees: basisPayload?.assignees ?? [],
            remainingIssueCount: basisPayload?.remainingIssueCount ?? 0,
            unassignedCount: basisPayload?.unassignedCount ?? 0,
          };

  return shell(
    <>
      <div className="flex-1 min-w-0 flex flex-col">
        <ScenarioBar
          dirty={dirty}
          hasPendingTargets={pendingTargets.size > 0}
          saving={saving}
          canCommit={canCommit}
          overAllocated={overAllocated.length > 0}
          capacityLines={capacityLinesForBar}
          namedTransferCount={namedMoves.length - blockedMoves.length}
          switchCostChanged={switchCostChanged}
          aggregateConversions={aggregateConversions}
          blockedCapacityScopes={blockedCapacityScopes}
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
              portfolioLikely={
                (() => {
                  let max: number | null = null;
                  for (const s of data.scopes) {
                    const r = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
                    if (r) max = Math.max(max ?? -Infinity, r.likelyDate.getTime());
                  }
                  return max === null ? null : new Date(max);
                })()
              }
              portfolioDeltaDays={(() => {
                let a: number | null = null;
                let b: number | null = null;
                for (const s of data.scopes) {
                  const pr = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
                  const bl = baseline?.get(s.scopeId);
                  if (pr) a = Math.max(a ?? -Infinity, pr.likelyDate.getTime());
                  if (bl) b = Math.max(b ?? -Infinity, bl.likelyDate.getTime());
                }
                return a !== null && b !== null ? Math.round((a - b) / 86400000) : 0;
              })()}
              portfolioGatedBy={(() => {
                let max: number | null = null;
                let name: string | null = null;
                for (const s of data.scopes) {
                  const r = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
                  if (r && (max === null || r.likelyDate.getTime() > max)) {
                    max = r.likelyDate.getTime();
                    name = s.name;
                  }
                }
                return name;
              })()}
            />

            {selectedScope && (
              <InstrumentBay
                scopeName={selectedScope.name}
                realityCapacity={selectedScope.teamCapacity}
                realitySource={selectedScope.capacitySource}
                scenarioCapacity={scenarioCapacityByScope.get(selectedScope.scopeId) ?? selectedScope.teamCapacity}
                onCapacityChange={(fte) => setScopeCapacity(selectedScope.scopeId, selectedScope.teamCapacity, fte)}
                onExplainReality={() => openInspector("capacity")}
                switchCostPct={switchCostPct}
                savedSwitchCostPct={data.contextSwitchCostPct}
                onSwitchCostChange={(pct) => setSwitchCostPct(Math.round(pct))}
                trackedScopeCount={trackedScopeCount}
                splitPeopleCount={splitPeopleCount}
                onExplainSwitchCost={() => openInspector("switchCost")}
                trend={momentumByScope.get(selectedScope.scopeId) ?? null}
                trendSeries={trendSeries}
                confidencePct={selectedConfidence}
                hasTarget={!!selectedTargetIso}
                onSetTarget={setInitialTarget}
                targetLabel={
                  selectedTargetIso
                    ? `by ${new Date(selectedTargetIso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`
                    : "no target set"
                }
                spreadDays={spreadDays}
                spreadRange={spreadRange}
                sinceLabel={sinceLabel}
                gates={selectedScope.gates.map((g) => ({ id: g.id, label: g.label, likely: g.likely }))}
                onInspectMomentum={() => openInspector("momentum")}
              />
            )}
          </div>

          {/* Below ~1280px there isn't room for a 296px narration panel and
              a legible field at once; the field wins. */}
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
              changedScopeNames={changedScopeNames}
              dependsOn={selectedScopeDeps.dependsOn}
              dependents={selectedScopeDeps.dependents}
              trend={momentumByScope.get(selectedScope.scopeId) ?? null}
              realityCapacity={selectedScope.teamCapacity}
              scenarioCapacity={scenarioCapacityByScope.get(selectedScope.scopeId) ?? selectedScope.teamCapacity}
              capacityBasis={capacityBasis}
              onSaveRealityCapacity={(fte) => saveRealityCapacity(selectedScope.scopeId, fte)}
              onManagePeople={() => setAllocationsOpen(true)}
              switchCostPct={switchCostPct}
              switchCostScopes={switchCostScopes}
              focus={inspectorFocus}
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
        capacityByScope={scenarioCapacityByScope}
        overAllocated={overAllocated}
        unallocated={unallocated}
        onRemovePerson={(personId) => removePerson(personId)}
        removingId={removingId}
        removeError={removeError}
      />
    </>
  );
}
