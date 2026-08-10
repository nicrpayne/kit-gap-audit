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
import { computeMomentum, dateDeltaPhrase } from "@/lib/momentum/compute";
import { percentileDay, confidenceAtDay } from "@/lib/forecast/simulate";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { compareToBaseline } from "@/lib/scenario/compare";
import { detectNamedPersonMoves, type NamedTransferScope } from "@/lib/scenario/namedTransfer";

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

function formatDate(iso: Date): string {
  return iso.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function confidenceColor(pct: number): string {
  return pct >= 70 ? "var(--color-accent)" : pct >= 35 ? "var(--color-amber)" : "var(--color-danger)";
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d;
}

function dayOffset(startDate: Date, date: Date): number {
  return (date.getTime() - startDate.getTime()) / 86400000;
}

function toDateStr(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// Scenario lever #1 (target date, both directions -- see
// PORTFOLIO_SCENARIO_LEVERS_BUILD_BRIEF): a hypothetical date and a
// hypothetical confidence percentage, kept in sync purely by looking
// either up on `sortedDays` -- the SAME per-scope SimulationResult.
// completionDaysSorted the rest of this page already has in memory, via
// the exact percentileDay/confidenceAtDay functions simulate.ts uses
// internally. No new simulation run, no network call while previewing;
// confidencePct is a derived value (not separate state) so editing
// either field can never drift out of sync with the other -- there is
// exactly one source of truth (dateStr) and one pure read of it.
function TargetDateLever({
  scopeId,
  savedTargetDate,
  sortedDays,
  startDate,
  onSave,
}: {
  scopeId: string;
  savedTargetDate: string | null;
  sortedDays: number[];
  startDate: Date;
  onSave: (scopeId: string, targetDate: string | null) => Promise<void>;
}) {
  const [dateStr, setDateStr] = useState(toDateStr(savedTargetDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confidencePct = useMemo(() => {
    if (!dateStr) return null;
    const days = dayOffset(startDate, new Date(dateStr + "T00:00:00Z"));
    return confidenceAtDay(sortedDays, days);
  }, [dateStr, sortedDays, startDate]);

  function onConfidenceChange(raw: string) {
    if (raw === "") {
      setDateStr("");
      return;
    }
    const pct = Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
    const days = percentileDay(sortedDays, pct);
    setDateStr(addDays(startDate, days).toISOString().slice(0, 10));
  }

  const dirty = dateStr !== toDateStr(savedTargetDate);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(scopeId, dateStr || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-[var(--color-ink-soft)]">Target date</span>
      <input
        type="date"
        value={dateStr}
        onChange={(e) => setDateStr(e.target.value)}
        className="rounded-md border border-[var(--color-line)] px-2 py-1"
      />
      <span className="text-[var(--color-ink-soft)]">for</span>
      <input
        type="number"
        min={0}
        max={100}
        value={confidencePct ?? ""}
        onChange={(e) => onConfidenceChange(e.target.value)}
        placeholder="—"
        className="w-14 rounded-md border border-[var(--color-line)] px-2 py-1"
      />
      <span className="text-[var(--color-ink-soft)]">% confidence</span>
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md border border-[var(--color-accent)] text-[var(--color-accent-dark)] px-2 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save target date"}
        </button>
      )}
      {error && <span className="text-[var(--color-danger)]">{error}</span>}
    </div>
  );
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

// A small, fixed palette drawn from existing design tokens (no charting
// library, no categorical-color system in this app) -- cycles if there
// are more Scopes than colors.
const SCOPE_COLORS = [
  "var(--color-accent)",
  "var(--color-amber)",
  "var(--color-danger)",
  "var(--color-accent-dark)",
  "var(--color-ink-soft)",
];

const BAND_GRID_COLS = "180px 1fr";

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

  const [overlay, setOverlay] = useState(false);
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
  // live (not just at Save time) so the "Saving this will..." summary
  // below can show BEFORE the user clicks Save, matching this page's
  // existing live-preview philosophy rather than surprising them with a
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
  // capacity would be committed as a new explicitTeamCapacity if Save
  // were clicked now. Deliberately computed from hypothetical
  // people/allocations ONLY -- a real person's contribution to an
  // aggregate Scope is NEVER folded in here, whether or not that specific
  // move happens to be "eligible" elsewhere, because there is no eligible
  // path for a named person into an aggregate Scope at all (see
  // blockedMoves above); committing it anonymously would silently
  // discard exactly the identity information Decision 2 said not to
  // discard.
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

  function axisPct(day: number): number {
    if (!axis) return 0;
    const span = Math.max(1, axis.maxDay - axis.minDay);
    return Math.min(100, Math.max(0, ((day - axis.minDay) / span) * 100));
  }

  // Live effective capacity per Scope for the grid's column-totals row --
  // deliberately NOT read off `preview`/`baseline` (SimulationResult
  // doesn't carry capacity), just resolveCapacity again directly. Cheap
  // (no simulation trials), so it updates on every keystroke, not
  // debounced like the band recompute above.
  const capacityByScope = useMemo(() => {
    if (!data) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const s of data.scopes) {
      const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, allPeople, currentAllocations, switchCostPct);
      out.set(s.scopeId, resolved.capacity ?? s.teamCapacity);
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

  // Compact per-scope momentum (design brief #9): "vs. the last time we
  // told someone a number" -- the SAVED-allocations baseline against the
  // most recent stored Report, same semantics and the same computeMomentum
  // function /forecast and /reports use. Deliberately NOT the live
  // preview: an in-progress unsaved drag already has its own "vs saved"
  // delta text right next to this; this pill answers a different
  // question (has this Scope actually moved since it was last reported
  // on) and shouldn't flicker while dragging.
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
  // can't leak into a later Save. A real Person is actually deleted via
  // the existing DELETE /api/people/:id (cascades to their Allocations)
  // and the page reloads from the server -- this is the one place in the
  // UI that can clean up a person who got persisted by mistake (e.g. an
  // exploratory "+1 developer" click that was still allocated when Save
  // was pressed), since there was previously no way to undo that short
  // of a raw API call.
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

  // Target-date lever's Save: unlike the allocation grid's big Save
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
  // - A Scope's capacitySource never flips as a side effect of this Save.
  //   An anonymous/hypothetical contribution to an allocations-sourced
  //   Scope still becomes a real Person + Allocation row, exactly as
  //   before. An anonymous contribution to an explicit/inferred Scope is
  //   folded into a NEW explicitTeamCapacity (aggregateConversions,
  //   computed above) -- it never gets a Person/Allocation row, and that
  //   Scope's source becomes/stays "explicit" going forward.
  // - A real, named person's allocation change is committed normally when
  //   every Scope they'd end up on is allocations-sourced. If ANY touched
  //   Scope is aggregate-sourced, the ENTIRE person's allocation set is
  //   excluded from this Save (blockedPersonIds, from namedMoves above) --
  //   both legs of a move, not just the aggregate-destination leg, so
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

  return (
    <div>
      {/* Per-scope forecast: baseline vs live preview, confidence bands on
          a shared date axis. */}
      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] mb-6">
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="text-sm font-medium">Release dates</div>
          <button
            onClick={() => setOverlay((v) => !v)}
            className={`text-xs rounded-md border px-2 py-1 ${
              overlay
                ? "border-[var(--color-accent)] text-[var(--color-accent-dark)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-line)] hover:bg-white"
            }`}
          >
            {overlay ? "Show separate rows" : "Overlay all on one axis"}
          </button>
        </div>

        {axis && (
          <div className="px-5 pt-3" style={{ display: "grid", gridTemplateColumns: BAND_GRID_COLS }}>
            <div />
            <div className="relative h-4">
              {axis.ticks.map((t) => (
                <div
                  key={t.day}
                  className="absolute text-[10px] text-[var(--color-ink-soft)] -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${axisPct(t.day)}%` }}
                >
                  {t.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {!overlay ? (
          <div className="divide-y divide-[var(--color-line)] mt-2">
            {data.scopes.map((s, i) => {
              const b = baseline?.get(s.scopeId);
              const p = preview?.get(s.scopeId) ?? b;
              const { deltaDays } = compareToBaseline(b, p);
              const targetDay = s.targetDate && startDateObj ? dayOffset(startDateObj, new Date(s.targetDate)) : null;
              const color = SCOPE_COLORS[i % SCOPE_COLORS.length];
              return (
                <div key={s.scopeId} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="font-medium">{s.name}</div>
                    <div className="flex items-center gap-4 text-sm">
                      {p && (
                        <>
                          <span className="font-display text-lg">{formatDate(p.likelyDate)}</span>
                          {dirty && b && (
                            <span
                              className={`text-xs whitespace-nowrap ${
                                deltaDays < 0
                                  ? "text-[var(--color-accent-dark)]"
                                  : deltaDays > 0
                                  ? "text-[var(--color-danger)]"
                                  : "text-[var(--color-ink-soft)]"
                              }`}
                            >
                              {deltaDays === 0 ? "no change" : deltaDays < 0 ? `${deltaDays}d` : `+${deltaDays}d`} vs
                              saved
                            </span>
                          )}
                          {p.confidenceAtTarget !== null && (
                            <span
                              className="text-xs font-medium whitespace-nowrap"
                              style={{ color: confidenceColor(p.confidenceAtTarget) }}
                            >
                              {p.confidenceAtTarget}% at target
                            </span>
                          )}
                        </>
                      )}
                      {(() => {
                        const rm = reportMomentum.get(s.scopeId);
                        if (!rm) return null;
                        const daysSinceReport = Math.max(
                          0,
                          Math.round((Date.now() - rm.previousGeneratedAt.getTime()) / 86400000)
                        );
                        return (
                          <span
                            title={`Since the last report (${formatDate(rm.previousGeneratedAt)})`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                              rm.stalled
                                ? "bg-[var(--color-line)]/60 text-[var(--color-ink-soft)]"
                                : rm.dateDeltaDays < 0
                                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]"
                                : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                            }`}
                          >
                            <span aria-hidden>{rm.stalled ? "●" : rm.dateDeltaDays < 0 ? "↓" : "↑"}</span>
                            {rm.stalled ? `unchanged ${daysSinceReport}d` : dateDeltaPhrase(rm.dateDeltaDays)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {axis && p && (
                    <div className="mt-2" style={{ display: "grid", gridTemplateColumns: BAND_GRID_COLS }}>
                      <div className="text-[10px] text-[var(--color-ink-soft)] pr-3 self-center">
                        P10&ndash;P90 / P50&ndash;P85
                      </div>
                      <div className="relative h-6">
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
                          style={{
                            left: `${axisPct(p.percentiles.p10)}%`,
                            right: `${100 - axisPct(p.percentiles.p90)}%`,
                            background: color,
                            opacity: 0.25,
                          }}
                          title={`P10 ${formatDate(addDays(startDateObj!, p.percentiles.p10))} -- P90 ${formatDate(addDays(startDateObj!, p.percentiles.p90))}`}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
                          style={{
                            left: `${axisPct(p.percentiles.p50)}%`,
                            right: `${100 - axisPct(p.percentiles.p85)}%`,
                            background: color,
                            opacity: 0.6,
                          }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-white shadow"
                          style={{ left: `${axisPct(p.percentiles.p50)}%`, background: color }}
                          title={`P50: ${formatDate(p.likelyDate)}`}
                        />
                        {targetDay !== null && (
                          <div
                            className="absolute inset-y-0 border-l border-dashed"
                            style={{ left: `${axisPct(targetDay)}%`, borderColor: "var(--color-ink-soft)" }}
                            title={`Target: ${formatDate(new Date(s.targetDate!))}`}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => addHypotheticalDeveloper(s.scopeId)}
                      className="text-xs rounded-md border border-[var(--color-line)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
                    >
                      +1 developer
                    </button>
                    <button
                      onClick={() => {
                        addHypotheticalDeveloper(s.scopeId);
                        addHypotheticalDeveloper(s.scopeId);
                      }}
                      className="text-xs rounded-md border border-[var(--color-line)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
                    >
                      +2 developers
                    </button>
                    {s.dependsOnScopeIds.length > 0 && (
                      <span className="text-[11px] text-[var(--color-ink-soft)]">
                        depends on{" "}
                        {s.dependsOnScopeIds
                          .map((id) => data.scopes.find((x) => x.scopeId === id)?.name ?? id)
                          .join(", ")}
                      </span>
                    )}
                  </div>

                  {p && (
                    <div className="mt-2">
                      <TargetDateLever
                        scopeId={s.scopeId}
                        savedTargetDate={s.targetDate}
                        sortedDays={p.completionDaysSorted}
                        startDate={startDateObj!}
                        onSave={saveTargetDate}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-4">
            {axis && startDateObj && (
              <div style={{ display: "grid", gridTemplateColumns: BAND_GRID_COLS }}>
                <div />
                <div className="relative" style={{ height: `${Math.max(28, data.scopes.length * 14 + 14)}px` }}>
                  {data.scopes.map((s, i) => {
                    const p = preview?.get(s.scopeId) ?? baseline?.get(s.scopeId);
                    if (!p) return null;
                    const color = SCOPE_COLORS[i % SCOPE_COLORS.length];
                    const topPx = 6 + i * 14;
                    return (
                      <div key={s.scopeId} className="absolute h-1.5" style={{ top: `${topPx}px`, left: 0, right: 0 }}>
                        <div
                          className="absolute h-1.5 rounded-full"
                          style={{
                            left: `${axisPct(p.percentiles.p10)}%`,
                            right: `${100 - axisPct(p.percentiles.p90)}%`,
                            background: color,
                            opacity: 0.3,
                          }}
                        />
                        <div
                          className="absolute h-1.5 rounded-full"
                          style={{
                            left: `${axisPct(p.percentiles.p50)}%`,
                            right: `${100 - axisPct(p.percentiles.p85)}%`,
                            background: color,
                            opacity: 0.75,
                          }}
                        />
                        <div
                          className="absolute -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-white shadow"
                          style={{ left: `${axisPct(p.percentiles.p50)}%`, top: "-2px", background: color }}
                          title={`${s.name} P50: ${formatDate(p.likelyDate)}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 flex-wrap mt-3 pt-3 border-t border-[var(--color-line)]">
              {data.scopes.map((s, i) => (
                <div key={s.scopeId} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full inline-block"
                    style={{ background: SCOPE_COLORS[i % SCOPE_COLORS.length] }}
                  />
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {insights.length > 0 && (
        <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-5 mb-6">
          <div className="text-sm font-medium mb-3">Portfolio insights</div>
          <ul className="space-y-1.5">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="text-xs flex items-start gap-2"
                style={{ color: insight.tone === "warning" ? "var(--color-danger)" : "var(--color-ink)" }}
              >
                <span aria-hidden>{insight.tone === "warning" ? "⚠" : "•"}</span>
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Allocation grid */}
      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium">Allocations</div>
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
            No people yet -- use a preset above, or add people via POST /api/people.
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

        {/* Save-impact summary -- computed live off the current drag
            state, not just at Save time, so nothing about a capacity-
            source conversion or a blocked named-person move is a
            surprise after the fact. See docs/SCENARIO-MODEL.md. */}
        {dirty && (aggregateConversions.length > 0 || blockedMoves.length > 0) && (
          <div className="mt-3 text-xs space-y-1.5 rounded-md border border-[var(--color-line)] bg-white px-3 py-2.5">
            <div className="font-medium text-[var(--color-ink)]">Saving this will:</div>
            {aggregateConversions.map((c) => (
              <div key={c.scopeId} className="text-[var(--color-ink-soft)]">
                Set <strong className="text-[var(--color-ink)]">{c.scopeName}</strong>&rsquo;s capacity explicitly
                to <strong className="text-[var(--color-ink)]">{c.to.toFixed(2)}</strong> ({c.from.toFixed(2)} +{" "}
                {(c.to - c.from).toFixed(2)} anonymous) — it will no longer be{" "}
                {c.wasInferred ? "inferred from Linear" : "a plain flat number with nothing added"}, and stays an
                explicit value going forward.
              </div>
            ))}
            {blockedMoves.map((m) => (
              <div key={m.personId} className="text-[var(--color-danger)]">
                Can&rsquo;t save {m.personName}&rsquo;s allocation change — {m.blockedReason}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={save}
            disabled={saving || !dirty || overAllocated.length > 0}
            className="rounded-md bg-[var(--color-ink)] text-white px-3.5 py-2 text-xs font-medium hover:bg-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save this allocation"}
          </button>
          <button
            onClick={discard}
            disabled={saving || !dirty}
            className="rounded-md border border-[var(--color-line)] px-3.5 py-2 text-xs font-medium hover:bg-white disabled:opacity-50"
          >
            Discard preview
          </button>
          {saveError && <span className="text-xs text-[var(--color-danger)]">{saveError}</span>}
          {saveSummary && (
            <span
              className={`text-xs ${saveSummary.hadBlocks ? "text-[var(--color-amber)]" : "text-[var(--color-ink-soft)]"}`}
            >
              {saveSummary.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
