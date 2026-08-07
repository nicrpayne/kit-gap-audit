"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCapacity,
  validateAllocations,
  unallocatedCapacity,
  type PersonLike,
  type AllocationLike,
} from "@/lib/capacity/resolve";
import { runPortfolioSimulation, type ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import type { SimulationResult, WorkItem, DecisionGate } from "@/lib/forecast/simulate";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const specsFor = useCallback(
    (people: PersonLike[], allocations: AllocationLike[], costPct: number): ScopeSimulationSpec[] | null => {
      if (!data) return null;
      const startDate = new Date(data.startDate);
      return data.scopes.map((s) => {
        const resolved = resolveCapacity(s.scopeId, s.explicitTeamCapacity, people, allocations, costPct);
        return {
          scopeId: s.scopeId,
          items: s.items,
          gates: s.gates,
          teamCapacity: resolved.capacity ?? s.teamCapacity,
          dependsOnScopeIds: s.dependsOnScopeIds,
          startDate,
          targetDate: s.targetDate ? new Date(s.targetDate) : null,
        };
      });
    },
    [data]
  );

  // Baseline: the saved allocations, computed once per load -- the fixed
  // reference every preview delta is measured against.
  const baseline = useMemo(() => {
    if (!data) return null;
    const people: PersonLike[] = data.people;
    const allocations: AllocationLike[] = data.allocations.map((a) => ({
      personId: a.personId,
      scopeId: a.scopeId,
      fraction: a.fraction,
    }));
    const specs = specsFor(people, allocations, data.contextSwitchCostPct);
    if (!specs) return null;
    try {
      return runPortfolioSimulation(specs);
    } catch {
      return null;
    }
  }, [data, specsFor]);

  const allPeople: PersonLike[] = useMemo(() => {
    if (!data) return [];
    return [...data.people, ...ghosts.map((g) => ({ id: g.id, name: g.name, fte: g.fte, active: true }))];
  }, [data, ghosts]);

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

  // Debounced client-side resimulation -- immediate enough to feel live
  // while dragging without recomputing 5000 trials x every Scope on
  // every single pixel of a drag.
  const [preview, setPreview] = useState<Map<string, SimulationResult> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || overAllocated.length > 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const specs = specsFor(allPeople, currentAllocations, switchCostPct);
      if (!specs) return;
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
  }, [data, allPeople, currentAllocations, switchCostPct, specsFor, overAllocated.length]);

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

  function discard() {
    if (!data) return;
    const initial = new Map<string, number>();
    for (const a of data.allocations) initial.set(pairKey(a.personId, a.scopeId), a.fraction);
    setFractions(initial);
    setSwitchCostPct(data.contextSwitchCostPct);
    setGhosts([]);
    setDirty(false);
    setSaveError(null);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Ghost people become real Person rows only now, at the moment of
      // saving -- until this point they exist only in this component's
      // state and in the client-side preview simulation above.
      const idRemap = new Map<string, string>();
      for (const g of ghosts) {
        const used = [...fractions.entries()].some(([key, f]) => key.startsWith(`${g.id}::`) && f > 1e-6);
        if (!used) continue;
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
      // entry per Scope, explicit zeros included: PUT /api/allocations is
      // a full replace per mentioned person, so this is the only way to
      // make sure a cleared allocation is actually deleted, not just
      // skipped.
      // rowKeyFor(realPersonId) -> the key `fractions` actually has an
      // entry under (a ghost's rows are still keyed by its temp id even
      // after the ghost becomes a real Person above).
      const rowKeyFor = new Map<string, string>();
      for (const [ghostId, realId] of idRemap) rowKeyFor.set(realId, ghostId);

      const personIds = new Set<string>();
      for (const a of data.allocations) personIds.add(a.personId);
      for (const key of fractions.keys()) {
        const [personId] = key.split("::");
        if (personId.startsWith("ghost-")) {
          const real = idRemap.get(personId);
          if (real) personIds.add(real);
        } else {
          personIds.add(personId);
        }
      }

      const payload = [];
      for (const personId of personIds) {
        const rowKeyPersonId = rowKeyFor.get(personId) ?? personId;
        for (const scope of data.scopes) {
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
      {/* Per-scope forecast: baseline vs live preview */}
      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] mb-6 divide-y divide-[var(--color-line)]">
        {data.scopes.map((s) => {
          const b = baseline?.get(s.scopeId);
          const p = preview?.get(s.scopeId) ?? b;
          const deltaDays =
            b && p ? Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000) : 0;
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
                </div>
              </div>
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
            </div>
          );
        })}
      </div>

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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
        </div>
      </div>
    </div>
  );
}
