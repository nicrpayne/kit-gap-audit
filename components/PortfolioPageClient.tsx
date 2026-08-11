"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCapacity,
  validateAllocations,
  unallocatedCapacity,
  type PersonLike,
  type AllocationLike,
} from "@/lib/capacity/resolve";
import { runPortfolioSimulation } from "@/lib/forecast/portfolio";
import type { SimulationResult, WorkItem, DecisionGate } from "@/lib/forecast/simulate";
import { computePortfolioInsights, type ScopeInsightInput } from "@/lib/portfolio/insights";
import { computeMomentum } from "@/lib/momentum/compute";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { compareToBaseline } from "@/lib/scenario/compare";
import { detectNamedPersonMoves, type NamedTransferScope } from "@/lib/scenario/namedTransfer";
import ForecastCanvas, { type CanvasScope } from "@/components/portfolio/ForecastCanvas";
import ScenarioInspector from "@/components/portfolio/ScenarioInspector";
import InstrumentFooter, { type ScenarioCapacityLine } from "@/components/portfolio/InstrumentFooter";
import type { DependencyDelta, DependentDelta } from "@/lib/portfolio/explain";

// This entire file is the "cheap, every slider frame" half of Phase 2's
// performance split (see ROADMAP.md): GET /api/portfolio/inputs is the one
// expensive network call (Linear + findings + context, per Scope), fetched
// once on mount. Every allocation edit after that re-runs resolveCapacity
// and runPortfolioSimulation -- imported directly from the same pure
// modules the server uses for the saved forecast -- entirely in the
// browser. There is deliberately no second "recompute this scope"
// implementation anywhere in this file: reusing these exact functions is
// what guarantees a preview can't silently drift from the saved path's
// correlated-risk behavior.
//
// Visually, this component renders the dark "Instrument" surface (Canvas +
// Inspector + Footer, see docs/DESIGN-NORTH-STAR.md) plus a collapsed,
// unchanged-in-substance "Per-person allocation detail" section in the
// original light Workbench styling underneath it. The Instrument is a
// presentation layer over exactly the same state and handlers the old
// single-card layout used -- no new persistence semantics, no new
// simulation path.

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
  id: string; // "ghost-<n>" -- never sent to any API until Save creates a real Person
  name: string;
  fte: number;
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

// Month-boundary ticks for the shared axis, e.g. "Jan '26", "Feb '26" --
// only the ones that actually fall inside [minDay, maxDay].
// Step size adapts to how wide the axis actually is -- a fixed
// one-tick-per-month pace looked fine against this page's original
// ~1-year test fixtures, but a Scope simulating years out (a
// misconfigured Scope pulling in far more effort than intended, or
// legitimately just a long way off) pushed the range wide enough that
// one label per month piled into an unreadable overlapping mess. Aim
// for roughly 6-12 ticks regardless of how wide the range is.
function monthStep(spanDays: number): number {
  const spanMonths = spanDays / 30.44;
  if (spanMonths <= 10) return 1;
  if (spanMonths <= 24) return 2;
  if (spanMonths <= 48) return 3;
  if (spanMonths <= 96) return 6;
  return 12;
}

function monthTicks(startDate: Date, minDay: number, maxDay: number): { day: number; label: string }[] {
  const step = monthStep(Math.max(1, maxDay - minDay));
  const ticks: { day: number; label: string }[] = [];
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

let ghostCounter = 0;

export default function PortfolioPageClient() {
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

  // Per-scope simulation inputs, normalized to the ScenarioInputScope
  // shape applyScenarioInputDelta expects (Date conversions done once
  // here, not repeated in every baseline/preview computation). Recomputed
  // only when a fresh load() replaces `data`, not on every drag frame.
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
  // reference every preview delta is measured against. Reproduces the
  // originally-resolved capacity exactly (see applyScenarioInputDelta's
  // doc comment) since this delta is built from Reality's own saved
  // allocations/people/contextSwitchCostPct, not a hypothetical one.
  const baseline = useMemo(() => {
    if (!data || !scenarioScopes) return null;
    const baselineDelta: ScenarioInputDelta = {
      allocations: data.allocations.map((a) => ({
        personId: a.personId,
        scopeId: a.scopeId,
        fraction: a.fraction,
      })),
      hypotheticalPeople: [],
      contextSwitchCostPct: data.contextSwitchCostPct,
    };
    try {
      return runPortfolioSimulation(applyScenarioInputDelta(scenarioScopes, data.people, baselineDelta));
    } catch {
      return null;
    }
  }, [data, scenarioScopes]);

  // Ghosts as PersonLike -- shared by allPeople (needed flat, for
  // validateAllocations/unallocatedCapacity/the grid render, none of
  // which care about the Reality/hypothetical split) and previewDelta
  // below (which does care, per ScenarioInputDelta's shape).
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

  const overAllocated = useMemo(
    () => validateAllocations(allPeople, currentAllocations),
    [allPeople, currentAllocations]
  );
  const overAllocatedIds = useMemo(() => new Set(overAllocated.map((o) => o.personId)), [overAllocated]);

  const unallocated = useMemo(
    () => unallocatedCapacity(allPeople, currentAllocations),
    [allPeople, currentAllocations]
  );

  // Commit-eligibility for real, named people: does a real person's
  // scenario allocation differ from Reality's saved one, and can every
  // Scope they'd end up on truthfully represent that (see
  // docs/SCENARIO-MODEL.md's "named-person transfer" section, and
  // lib/scenario/namedTransfer.ts). Deliberately excludes ghosts --
  // hypothetical/anonymous people are a completely separate, always-
  // committable case handled by aggregateConversions below. Recomputed
  // live (not just at Save time) so the "Committing this will..." summary
  // can show BEFORE the user clicks Commit, matching this page's existing
  // live-preview philosophy rather than surprising them with a
  // confirmation dialog after the fact.
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

  // Aggregate (explicit/inferred) Scopes: how much anonymous/hypothetical
  // capacity would be committed as a new explicitTeamCapacity if Commit
  // were clicked now. Deliberately computed from hypothetical
  // people/allocations ONLY -- a real person's contribution to an
  // aggregate Scope is NEVER folded in here, whether or not that specific
  // move happens to be "eligible" elsewhere, because there is no eligible
  // path for a named person into an aggregate Scope at all (see
  // blockedMoves above); committing it anonymously would silently
  // discard exactly the identity information the approved model says not
  // to discard.
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

  // The live hypothetical, as a ScenarioInputDelta -- an explicit adapter
  // from the fine-grained interaction state above (fractions/ghosts/
  // switchCostPct, each its own useState for cheap point updates on every
  // slider frame) to the one domain shape applyScenarioInputDelta takes.
  // Assembling this object is O(scopes-with-nonzero-fractions), the same
  // cost `currentAllocations` above already pays every render -- it does
  // not change the interaction layer's performance characteristics.
  const previewDelta: ScenarioInputDelta = useMemo(
    () => ({
      allocations: currentAllocations,
      hypotheticalPeople: ghostsAsPersonLike,
      contextSwitchCostPct: switchCostPct,
    }),
    [currentAllocations, ghostsAsPersonLike, switchCostPct]
  );

  // Debounced client-side resimulation -- immediate enough to feel live
  // while dragging without recomputing 5000 trials x every Scope on
  // every single pixel of a drag.
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
        // A hypothetical dependsOnScopeIds cycle can't happen from this UI
        // (dependencies aren't editable here), but stay defensive.
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [data, scenarioScopes, previewDelta, overAllocated.length]);

  const startDateObj = useMemo(() => (data ? new Date(data.startDate) : null), [data]);

  // Shared date axis across every Scope's band: the union of every known
  // percentile extent (baseline AND preview, so the axis doesn't jump
  // around mid-drag more than necessary) plus any target dates, padded a
  // little for breathing room.
  const axis = useMemo(() => {
    if (!data || !startDateObj) return null;
    const days: number[] = [0];
    for (const s of data.scopes) {
      for (const r of [baseline?.get(s.scopeId), preview?.get(s.scopeId)]) {
        if (!r) continue;
        days.push(r.percentiles.p10, r.percentiles.p90);
      }
      if (s.targetDate) days.push(dayOffset(startDateObj, new Date(s.targetDate)));
    }
    const minDay = Math.min(0, ...days);
    const maxDayRaw = Math.max(...days);
    const maxDay = maxDayRaw + Math.max(5, maxDayRaw * 0.05);
    return { minDay, maxDay, ticks: monthTicks(startDateObj, minDay, maxDay) };
  }, [data, startDateObj, baseline, preview]);

  // Live effective capacity per Scope -- deliberately NOT read off
  // `preview`/`baseline` (SimulationResult doesn't carry capacity), just
  // resolveCapacity again directly. Cheap (no simulation trials), so it
  // updates on every keystroke, not debounced like the band recompute
  // above. This is the Instrument's "Scenario" capacity number; a Scope's
  // own `teamCapacity` as loaded from Reality (untouched by any of this)
  // is the "Reality" number next to it.
  //
  // Branches on capacitySource exactly like applyScenarioInputDelta (see
  // lib/scenario/inputDelta.ts) -- NOT a plain resolveCapacity call.
  // resolveCapacity alone has no notion of "an aggregate baseline plus an
  // additive scenario contribution": for an explicit/inferred Scope, the
  // moment any allocation-shaped row exists (an added ghost, a moved
  // person), it would return ONLY that row's own contribution and
  // silently drop the preserved aggregate baseline -- displaying, say,
  // "1.0 FTE" for a Scope actually simulating at 5.0. That's the same bug
  // class the capacity-scenario fix exists to prevent, just re-appearing
  // in a display number instead of the simulation itself. Mirroring the
  // branch here keeps what this control SHOWS truthful to what
  // applyScenarioInputDelta actually feeds the simulation for this Scope.
  const capacityByScope = useMemo(() => {
    if (!data) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const s of data.scopes) {
      if (s.capacitySource === "allocations") {
        const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, allPeople, currentAllocations, switchCostPct);
        out.set(s.scopeId, resolved.capacity ?? s.teamCapacity);
      } else {
        const additive = resolveCapacity(s.scopeId, null, allPeople, currentAllocations, switchCostPct);
        out.set(s.scopeId, s.teamCapacity + (additive.capacity ?? 0));
      }
    }
    return out;
  }, [data, allPeople, currentAllocations, switchCostPct]);

  const insights = useMemo(() => {
    if (!data) return [];
    const scopeInputs: ScopeInsightInput[] = data.scopes
      .map((s) => {
        const r = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
        if (!r) return null;
        return { scopeId: s.scopeId, name: s.name, dependsOnScopeIds: s.dependsOnScopeIds, likelyDays: r.percentiles.p50 };
      })
      .filter((x): x is ScopeInsightInput => x !== null);
    return computePortfolioInsights(scopeInputs, overAllocated, unallocated);
  }, [data, baseline, preview, overAllocated, unallocated]);

  // Compact per-scope momentum: "vs. the last time we told someone a
  // number" -- the SAVED-allocations baseline against the most recent
  // stored Report, same semantics and the same computeMomentum function
  // /forecast and /reports use. Deliberately NOT the live preview: an
  // in-progress unsaved scenario already has its own "vs Reality" delta
  // right next to this in the Inspector; this answers a different
  // question (has this Scope actually moved since it was last reported
  // on) and shouldn't flicker while previewing.
  const reportMomentum = useMemo(() => {
    if (!data) return new Map<string, ReturnType<typeof computeMomentum>>();
    const out = new Map<string, ReturnType<typeof computeMomentum>>();
    for (const s of data.scopes) {
      if (!s.lastReport) continue;
      const b = baseline?.get(s.scopeId);
      if (!b) continue;
      out.set(
        s.scopeId,
        computeMomentum(
          { generatedAt: new Date(), likelyDate: b.likelyDate, confidenceAtTarget: b.confidenceAtTarget },
          {
            generatedAt: new Date(s.lastReport.generatedAt),
            likelyDate: new Date(s.lastReport.likelyDate),
            confidenceAtTarget: s.lastReport.confidenceAtTarget,
          }
        )
      );
    }
    return out;
  }, [data, baseline]);

  // Forecast Canvas's row data -- a thin projection of ScopeInputRow, so
  // the Canvas component stays ignorant of everything else this page
  // knows about a Scope (capacity source, gates, items...).
  const canvasScopes: CanvasScope[] = useMemo(() => {
    if (!data) return [];
    return data.scopes.map((s) => ({
      scopeId: s.scopeId,
      name: s.name,
      dependsOnScopeIds: s.dependsOnScopeIds,
      targetDate: s.targetDate,
    }));
  }, [data]);

  const effectiveSelectedScopeId = selectedScopeId ?? data?.scopes[0]?.scopeId ?? null;

  // Anonymous (ghost) FTE currently contributing to each Scope in this
  // scenario -- what the Inspector's Capacity Control and the footer's
  // per-scope chips both read. Ghosts are single-scope by construction
  // (addHypotheticalDeveloper mints a fresh id per click, allocated only
  // to the Scope it was added for), so this is a direct sum, not an
  // apportionment across scopes.
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
    for (const m of namedMoves) {
      for (const c of m.changes) out.add(c.scopeId);
    }
    return out;
  }, [namedMoves]);

  // Dependency/dependent deltas for whichever Scope the Inspector is
  // currently showing -- the same baseline/preview deltas the Canvas
  // already renders per row, gathered for one Scope's neighbors so
  // explainScope() can narrate them in plain language.
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

  const capacityLinesForFooter: ScenarioCapacityLine[] = useMemo(() => {
    if (!data) return [];
    const out: ScenarioCapacityLine[] = [];
    for (const s of data.scopes) {
      const fte = scenarioAnonymousFteByScope.get(s.scopeId) ?? 0;
      if (fte > 1e-6) out.push({ scopeId: s.scopeId, scopeName: s.name, fteAdded: fte });
    }
    return out;
  }, [data, scenarioAnonymousFteByScope]);

  const eligibleNamedMoveCount = namedMoves.length - blockedMoves.length;

  function setFraction(personId: string, scopeId: string, pct: number) {
    setFractions((prev) => {
      const next = new Map(prev);
      next.set(pairKey(personId, scopeId), Math.max(0, Math.min(100, pct)) / 100);
      return next;
    });
    setDirty(true);
  }

  function addHypotheticalDeveloper(scopeId: string) {
    ghostCounter += 1;
    const id = `ghost-${ghostCounter}`;
    setGhosts((prev) => [...prev, { id, name: `New developer ${ghostCounter}`, fte: 1.0 }]);
    setFractions((prev) => {
      const next = new Map(prev);
      next.set(pairKey(id, scopeId), 1.0);
      return next;
    });
    setDirty(true);
  }

  // Removes a person from the grid entirely. A ghost (never persisted --
  // see the addHypotheticalDeveloper comment) is just local-state
  // cleanup: drop it from `ghosts` and clear its fraction entries so it
  // can't leak into a later Commit. A real Person is actually deleted via
  // the existing DELETE /api/people/:id (cascades to their Allocations)
  // and the page reloads from the server -- this is the one place in the
  // UI that can clean up a person who got persisted by mistake (e.g. an
  // exploratory "+1 developer" click that was still allocated when
  // Commit was pressed), since there was previously no way to undo that
  // short of a raw API call.
  async function removePerson(personId: string, isGhost: boolean) {
    setRemoveError(null);
    if (isGhost) {
      setGhosts((prev) => prev.filter((g) => g.id !== personId));
      setFractions((prev) => {
        const next = new Map(prev);
        for (const key of next.keys()) {
          if (key.startsWith(`${personId}::`)) next.delete(key);
        }
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

  // Capacity Control's decrement: removes the most recently added ghost
  // currently contributing to this Scope -- the smallest safe operation,
  // since it can only ever remove scenario-added anonymous capacity,
  // never touch a real person or Reality's own aggregate number (see
  // docs/SCENARIO-MODEL.md). Ghosts are single-scope by construction, so
  // in the common case ("+1 developer" then undo it) this affects only
  // `scopeId`; it's still scoped correctly even if the per-person detail
  // grid was used to hand-spread one ghost's time across multiple scopes,
  // since removing that ghost only ever removes scenario-added capacity.
  function decrementScopeCapacity(scopeId: string) {
    let latest: GhostPerson | null = null;
    let latestN = -1;
    for (const g of ghosts) {
      if ((fractions.get(pairKey(g.id, scopeId)) ?? 0) <= 1e-6) continue;
      const n = parseInt(g.id.replace("ghost-", ""), 10) || 0;
      if (n > latestN) {
        latestN = n;
        latest = g;
      }
    }
    if (latest) removePerson(latest.id, true);
  }

  // Capacity Control's reset: removes every ghost currently contributing
  // to this one Scope, returning just its scenario capacity to Reality
  // without touching any other Scope's scenario changes -- global Discard
  // (below) is what resets the whole Scenario.
  function resetScopeCapacity(scopeId: string) {
    for (const g of ghosts) {
      if ((fractions.get(pairKey(g.id, scopeId)) ?? 0) > 1e-6) removePerson(g.id, true);
    }
  }

  // Target-date lever's Save: unlike the allocation grid's big Commit
  // (which batches everything behind one explicit action), this saves
  // ONE Scope's targetDate immediately when its own "Save target date"
  // button is clicked -- reuses the existing PATCH /api/scopes/:id
  // (already supports targetDate) rather than a new endpoint. Updates
  // `data` in place so the axis/confidence badges elsewhere on the page
  // pick up the new saved value without a full reload.
  async function saveTargetDate(scopeId: string, targetDate: string | null) {
    const res = await fetch(`/api/scopes/${scopeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDate }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Couldn't save the target date.");
    setData((prev) =>
      prev
        ? { ...prev, scopes: prev.scopes.map((s) => (s.scopeId === scopeId ? { ...s, targetDate } : s)) }
        : prev
    );
  }

  function discard() {
    if (!data) return;
    const initial = new Map<string, number>();
    for (const a of data.allocations) initial.set(pairKey(a.personId, a.scopeId), a.fraction);
    setFractions(initial);
    setSwitchCostPct(data.contextSwitchCostPct);
    setGhosts([]);
    setDirty(false);
    setSaveError(null);
    setSaveSummary(null);
  }

  // Commit rules (see docs/SCENARIO-MODEL.md's "Save / Commit" section):
  //
  // - A Scope's capacitySource never flips as a side effect of this
  //   Commit. An anonymous/hypothetical contribution to an
  //   allocations-sourced Scope still becomes a real Person + Allocation
  //   row, exactly as before. An anonymous contribution to an
  //   explicit/inferred Scope is folded into a NEW explicitTeamCapacity
  //   (aggregateConversions, computed above) -- it never gets a
  //   Person/Allocation row, and that Scope's source becomes/stays
  //   "explicit" going forward.
  // - A real, named person's allocation change is committed normally when
  //   every Scope they'd end up on is allocations-sourced. If ANY touched
  //   Scope is aggregate-sourced, the ENTIRE person's allocation set is
  //   excluded from this Commit (blockedPersonIds, from namedMoves above)
  //   -- both legs of a move, not just the aggregate-destination leg, so
  //   Reality never ends up with a person shown at less than 100% while
  //   the remainder silently vanishes.
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

      // Ghost people become real Person rows only when they're used on an
      // allocations-sourced Scope -- a ghost used only on an aggregate
      // Scope stays anonymous forever; its contribution is folded into
      // that Scope's explicitTeamCapacity below instead (never a Person
      // row -- see aggregateConversions above).
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

      // Every real (post-remap) person who has -- or previously had -- an
      // allocation anywhere gets their FULL current row set sent, one
      // entry per allocations-sourced Scope, explicit zeros included: PUT
      // /api/allocations is a full replace per mentioned person, so this
      // is the only way to make sure a cleared allocation is actually
      // deleted, not just skipped. Blocked real people (blockedPersonIds)
      // are excluded entirely -- neither their reduction nor their
      // increase is sent, so their existing Reality rows are untouched.
      // rowKeyFor(realPersonId) -> the key `fractions` actually has an
      // entry under (a ghost's rows are still keyed by its temp id even
      // after the ghost becomes a real Person above).
      const rowKeyFor = new Map<string, string>();
      for (const [ghostId, realId] of idRemap) rowKeyFor.set(realId, ghostId);

      const personIds = new Set<string>();
      for (const a of data.allocations) {
        if (!blockedPersonIds.has(a.personId)) personIds.add(a.personId);
      }
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
          // Never write a person-level allocation onto an aggregate
          // Scope -- that would silently flip its capacitySource, the
          // exact bug this fix exists to prevent. (The server enforces
          // this too, independently -- see PUT /api/allocations.)
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

      // Aggregate Scopes: fold anonymous/hypothetical contributions into
      // a new explicitTeamCapacity via the existing PATCH /api/scopes/:id
      // (already supports teamCapacity) -- never a Person/Allocation row.
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
        summaryParts.push(
          aggregateConversions.map((c) => `${c.scopeName} capacity set to ${c.to.toFixed(2)} (explicit)`).join("; ")
        );
      }
      if (blockedMoves.length > 0) {
        summaryParts.push(
          `${blockedMoves.length} change${blockedMoves.length === 1 ? "" : "s"} not saved: ${blockedMoves
            .map((m) => m.personName)
            .join(", ")}`
        );
      }
      if (summaryParts.length > 0) {
        setSaveSummary({ text: summaryParts.join(" · "), hadBlocks: blockedMoves.length > 0 });
      }

      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-[var(--color-ink-soft)]">Loading portfolio…</div>;
  }
  if (error) {
    return <div className="text-sm text-[var(--color-danger)]">{error}</div>;
  }
  if (!data) return null;

  if (data.scopes.length === 0) {
    return (
      <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
        No Scope configured yet. Add one at /scopes to see a portfolio view.
      </div>
    );
  }

  const selectedScope = effectiveSelectedScopeId
    ? data.scopes.find((s) => s.scopeId === effectiveSelectedScopeId) ?? null
    : null;
  const selectedBaseline = effectiveSelectedScopeId ? baseline?.get(effectiveSelectedScopeId) : undefined;
  const selectedPreview = effectiveSelectedScopeId ? preview?.get(effectiveSelectedScopeId) : undefined;

  const scenarioSummaryParts: string[] = capacityLinesForFooter.map(
    (l) => `${l.scopeName} +${l.fteAdded.toFixed(1)} FTE`
  );
  if (namedMoves.length > 0) {
    scenarioSummaryParts.push(`${namedMoves.length} ${namedMoves.length === 1 ? "person" : "people"} reallocated`);
  }

  return (
    <div>
      {/* The Instrument: a precision simulation surface opened inside the
          Workbench shell. Toolbar (state) -> Canvas + Inspector (the
          primary interaction) -> Footer (commit). See
          docs/DESIGN-NORTH-STAR.md. */}
      <div className="instrument rounded-xl border border-[var(--i-border)] overflow-hidden">
        <div className="flex items-center gap-3 flex-wrap px-5 py-3.5 border-b border-[var(--i-border)] bg-[var(--i-panel)]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
              dirty ? "bg-[var(--i-violet-soft)] text-[var(--i-violet)]" : "bg-[var(--i-panel-raised)] text-[var(--i-text-soft)]"
            }`}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: dirty ? "var(--i-violet)" : "var(--i-text-faint)" }}
            />
            {dirty ? "Scenario · Unsaved" : "Current"}
          </span>
          {dirty && scenarioSummaryParts.length > 0 && (
            <span className="text-xs text-[var(--i-text-soft)]">{scenarioSummaryParts.join(" · ")}</span>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 320px" }}>
          <div className="min-w-0 border-r border-[var(--i-border)]">
            <ForecastCanvas
              scopes={canvasScopes}
              baseline={baseline}
              preview={preview}
              axis={axis}
              startDate={startDateObj!}
              dirty={dirty}
              selectedScopeId={effectiveSelectedScopeId}
              onSelectScope={setSelectedScopeId}
            />
            {insights.length > 0 && (
              <div className="border-t border-[var(--i-border)] px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">
                  Portfolio insights
                </div>
                <ul className="space-y-1.5">
                  {insights.map((insight) => (
                    <li
                      key={insight.id}
                      className="text-xs flex items-start gap-2"
                      style={{ color: insight.tone === "warning" ? "var(--i-red)" : "var(--i-text-soft)" }}
                    >
                      <span aria-hidden>{insight.tone === "warning" ? "⚠" : "•"}</span>
                      <span>{insight.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="min-w-0">
            {selectedScope ? (
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
                startDate={startDateObj!}
                realityCapacity={selectedScope.teamCapacity}
                scenarioCapacity={capacityByScope.get(selectedScope.scopeId) ?? selectedScope.teamCapacity}
                anonymousFteAdded={scenarioAnonymousFteByScope.get(selectedScope.scopeId) ?? 0}
                namedFteChanged={namedFteChangedScopeIds.has(selectedScope.scopeId)}
                canDecrement={ghosts.some((g) => (fractions.get(pairKey(g.id, selectedScope.scopeId)) ?? 0) > 1e-6)}
                onIncrement={() => addHypotheticalDeveloper(selectedScope.scopeId)}
                onIncrementTwice={() => {
                  addHypotheticalDeveloper(selectedScope.scopeId);
                  addHypotheticalDeveloper(selectedScope.scopeId);
                }}
                onDecrement={() => decrementScopeCapacity(selectedScope.scopeId)}
                onResetCapacity={() => resetScopeCapacity(selectedScope.scopeId)}
                onSaveTargetDate={saveTargetDate}
                dependsOn={selectedScopeDeps.dependsOn}
                dependents={selectedScopeDeps.dependents}
                momentum={reportMomentum.get(selectedScope.scopeId) ?? null}
              />
            ) : (
              <div className="p-5 text-sm text-[var(--i-text-faint)]">Select a scope to inspect it.</div>
            )}
          </div>
        </div>

        <InstrumentFooter
          dirty={dirty}
          saving={saving}
          canCommit={overAllocated.length === 0}
          capacityLines={capacityLinesForFooter}
          namedTransferCount={eligibleNamedMoveCount}
          aggregateConversions={aggregateConversions}
          blockedMoves={blockedMoves.map((m) => ({
            personId: m.personId,
            personName: m.personName,
            blockedReason: m.blockedReason ?? "",
          }))}
          onCommit={save}
          onDiscard={discard}
          saveError={saveError}
          saveSummary={saveSummary}
        />
      </div>

      {/* Deep-on-demand: the full per-person allocation grid, unchanged in
          substance from before the Instrument existed. Commit/Discard
          live once, above, in the Footer -- this section is for editing
          and for the detail the main surface deliberately keeps off-Canvas. */}
      <details className="mt-6 border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] group">
        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-medium flex items-center justify-between">
          <span>Per-person allocation detail</span>
          <span className="text-xs text-[var(--color-ink-soft)] group-open:hidden">Show</span>
          <span className="text-xs text-[var(--color-ink-soft)] hidden group-open:inline">Hide</span>
        </summary>
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between mb-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
              <span>Context-switch cost</span>
              <input
                type="range"
                min={0}
                max={100}
                value={switchCostPct}
                onChange={(e) => {
                  setSwitchCostPct(parseInt(e.target.value, 10));
                  setDirty(true);
                }}
                className="w-24"
              />
              <span className="w-9 text-right">{switchCostPct}%</span>
            </div>
          </div>

          {allPeople.length === 0 ? (
            <div className="text-xs text-[var(--color-ink-soft)] py-6 text-center">
              No people yet -- use a scope&rsquo;s Capacity Control above, or add people via POST /api/people.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left font-medium py-1.5 pr-3">Person</th>
                    {data.scopes.map((s) => (
                      <th key={s.scopeId} className="text-left font-medium py-1.5 px-2 whitespace-nowrap">
                        {s.name}
                      </th>
                    ))}
                    <th className="text-left font-medium py-1.5 px-2">Total</th>
                    <th className="py-1.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {allPeople.map((person) => {
                    const isGhost = person.id.startsWith("ghost-");
                    const total = data.scopes.reduce(
                      (sum, s) => sum + (fractions.get(pairKey(person.id, s.scopeId)) ?? 0),
                      0
                    );
                    const over = overAllocatedIds.has(person.id);
                    return (
                      <tr key={person.id} className="border-t border-[var(--color-line)]">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {person.name}
                          {isGhost && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                              preview
                            </span>
                          )}
                          <span className="text-[var(--color-ink-soft)]"> · {person.fte} FTE</span>
                        </td>
                        {data.scopes.map((s) => {
                          const pct = Math.round((fractions.get(pairKey(person.id, s.scopeId)) ?? 0) * 100);
                          return (
                            <td key={s.scopeId} className="py-1.5 px-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={pct}
                                  onChange={(e) => setFraction(person.id, s.scopeId, parseInt(e.target.value, 10))}
                                  className="w-16"
                                />
                                <span className="w-8 text-right tabular-nums">{pct}%</span>
                              </div>
                            </td>
                          );
                        })}
                        <td
                          className="py-1.5 px-2 font-medium"
                          style={{ color: over ? "var(--color-danger)" : undefined }}
                        >
                          {Math.round(total * 100)}%
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            onClick={() => removePerson(person.id, isGhost)}
                            disabled={removingId === person.id}
                            className="text-[var(--color-danger)] hover:underline whitespace-nowrap disabled:opacity-50"
                          >
                            {removingId === person.id ? "Removing…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-line)]">
                    <td className="py-1.5 pr-3 font-medium">Effective capacity</td>
                    {data.scopes.map((s) => (
                      <td key={s.scopeId} className="py-1.5 px-2 font-medium">
                        {(capacityByScope.get(s.scopeId) ?? 0).toFixed(2)}
                      </td>
                    ))}
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-[var(--color-ink-soft)]">
            Capacity scales linearly here (2x the people, half the time) -- real teams rarely hit that in
            practice, so treat these as an optimistic floor, not a promise.
          </p>

          {overAllocated.length > 0 && (
            <div className="mt-3 text-xs text-[var(--color-danger)]">
              Over-allocated:{" "}
              {overAllocated.map((o) => `${o.personName} at ${Math.round(o.totalFraction * 100)}%`).join(", ")} --
              fix before previewing further.
            </div>
          )}

          {unallocated.length > 0 && (
            <div className="mt-3 text-xs text-[var(--color-ink-soft)]">
              Unallocated:{" "}
              {unallocated.map((u) => `${u.name} (${u.unallocatedFte.toFixed(2)} FTE free)`).join(", ")}
            </div>
          )}

          {removeError && <div className="mt-3 text-xs text-[var(--color-danger)]">{removeError}</div>}
        </div>
      </details>
    </div>
  );
}
