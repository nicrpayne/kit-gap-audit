"use client";

// The persistent contextual Inspector -- the right-hand panel of the
// Instrument surface. One panel, not a modal per question (see
// docs/DESIGN-NORTH-STAR.md's "avoid modal overload"). Everything here is
// either a thin display of state the parent (PortfolioPageClient) already
// computed, or a call back up to a handler it owns -- this component does
// not run resolveCapacity/runPortfolioSimulation itself.

import { useMemo, useState } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { percentileDay, confidenceAtDay } from "@/lib/forecast/simulate";
import { explainScope, type DependencyDelta, type DependentDelta } from "@/lib/portfolio/explain";
import { dateDeltaPhrase } from "@/lib/momentum/compute";
import AskChips from "@/components/AskChips";

export interface InspectorScope {
  scopeId: string;
  name: string;
  targetDate: string | null;
  capacitySource: "allocations" | "explicit" | "inferred";
}

export interface InspectorMomentum {
  dateDeltaDays: number;
  stalled: boolean;
  previousGeneratedAt: Date;
}

interface ScenarioInspectorProps {
  scope: InspectorScope;
  baseline: SimulationResult | undefined;
  preview: SimulationResult | undefined;
  dirty: boolean;
  startDate: Date;
  realityCapacity: number;
  scenarioCapacity: number;
  anonymousFteAdded: number;
  namedFteChanged: boolean;
  canDecrement: boolean;
  onIncrement: () => void;
  onIncrementTwice: () => void;
  onDecrement: () => void;
  onResetCapacity: () => void;
  onSaveTargetDate: (scopeId: string, targetDate: string | null) => Promise<void>;
  dependsOn: DependencyDelta[];
  dependents: DependentDelta[];
  momentum: InspectorMomentum | null;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
function moveColor(deltaDays: number): string {
  return deltaDays < 0 ? "var(--i-mint)" : deltaDays > 0 ? "var(--i-red)" : "var(--i-text-soft)";
}

const CAPACITY_SOURCE_LABEL: Record<InspectorScope["capacitySource"], string> = {
  allocations: "tracked by named people",
  explicit: "a set number",
  inferred: "inferred from Linear",
};

function CapacityControl({
  realityCapacity,
  scenarioCapacity,
  anonymousFteAdded,
  canDecrement,
  onIncrement,
  onIncrementTwice,
  onDecrement,
  onResetCapacity,
  sourceLabel,
}: {
  realityCapacity: number;
  scenarioCapacity: number;
  anonymousFteAdded: number;
  canDecrement: boolean;
  onIncrement: () => void;
  onIncrementTwice: () => void;
  onDecrement: () => void;
  onResetCapacity: () => void;
  sourceLabel: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">Capacity</div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-[var(--i-text-soft)]">Reality</span>
        <span className="tabular-nums text-[var(--i-text)]">{realityCapacity.toFixed(1)} FTE</span>
      </div>
      <div className="flex items-baseline justify-between text-sm mb-3">
        <span className="text-[var(--i-text-soft)]">Scenario</span>
        <span className="tabular-nums font-medium" style={{ color: anonymousFteAdded > 1e-6 ? "var(--i-violet)" : "var(--i-text)" }}>
          {scenarioCapacity.toFixed(1)} FTE
        </span>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-md border border-[var(--i-border)] bg-[var(--i-bg)] py-2.5 px-3">
        <button
          onClick={onDecrement}
          disabled={!canDecrement}
          aria-label="Remove 1 FTE of scenario capacity"
          className="h-7 w-7 rounded-md border border-[var(--i-border-strong)] text-[var(--i-text)] hover:bg-[var(--i-panel-raised)] disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-base leading-none"
        >
          −
        </button>
        <div className="text-center min-w-[92px]">
          <div className="text-sm font-medium tabular-nums" style={{ color: anonymousFteAdded > 1e-6 ? "var(--i-violet)" : "var(--i-text-faint)" }}>
            {anonymousFteAdded > 1e-6 ? `+${anonymousFteAdded.toFixed(1)} FTE` : "+0.0 FTE"}
          </div>
          <div className="text-[10px] text-[var(--i-text-faint)] uppercase tracking-wide">anonymous</div>
        </div>
        <button
          onClick={onIncrement}
          aria-label="Add 1 FTE of scenario capacity"
          className="h-7 w-7 rounded-md border border-[var(--i-border-strong)] text-[var(--i-text)] hover:bg-[var(--i-panel-raised)] flex items-center justify-center text-base leading-none"
        >
          +
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          onClick={onIncrementTwice}
          className="text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)]"
        >
          +2 quick add
        </button>
        <button
          onClick={onResetCapacity}
          disabled={!canDecrement}
          className="text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] disabled:opacity-30 disabled:hover:text-[var(--i-text-faint)]"
        >
          Reset
        </button>
      </div>

      <p className="mt-3 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
        Reality&rsquo;s capacity here is {sourceLabel}. The +/− above only adds or removes anonymous scenario
        capacity — it can&rsquo;t remove a specific named person from an aggregate number, since we can&rsquo;t
        know who&rsquo;s already counted in it.
      </p>
    </div>
  );
}

function TargetControl({
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
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">Target</div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="rounded-md border border-[var(--i-border-strong)] bg-[var(--i-bg)] text-[var(--i-text)] px-2 py-1.5 text-sm [color-scheme:dark]"
        />
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-[11px] text-[var(--i-text-faint)]">Probability by target</span>
        <input
          type="number"
          min={0}
          max={100}
          value={confidencePct ?? ""}
          onChange={(e) => onConfidenceChange(e.target.value)}
          placeholder="—"
          className="w-14 rounded-md border border-[var(--i-border-strong)] bg-[var(--i-bg)] text-[var(--i-text)] px-2 py-1 text-sm tabular-nums"
        />
        <span className="text-[11px] text-[var(--i-text-faint)]">%</span>
      </div>
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 rounded-md border border-[var(--i-violet)] text-[var(--i-violet)] px-2.5 py-1 text-xs hover:bg-[var(--i-violet-soft)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save target date"}
        </button>
      )}
      {error && <div className="mt-1 text-xs text-[var(--i-red)]">{error}</div>}
      <p className="mt-2 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
        Changing the target only changes the probability question — it never re-runs the simulation.
      </p>
    </div>
  );
}

export default function ScenarioInspector({
  scope,
  baseline,
  preview,
  dirty,
  startDate,
  realityCapacity,
  scenarioCapacity,
  anonymousFteAdded,
  namedFteChanged,
  canDecrement,
  onIncrement,
  onIncrementTwice,
  onDecrement,
  onResetCapacity,
  onSaveTargetDate,
  dependsOn,
  dependents,
  momentum,
}: ScenarioInspectorProps) {
  const active = preview ?? baseline;
  const deltaDays =
    dirty && baseline && active ? Math.round((active.likelyDate.getTime() - baseline.likelyDate.getTime()) / 86400000) : 0;

  const explanation = useMemo(
    () =>
      explainScope({
        scopeName: scope.name,
        deltaDays,
        anonymousFteAdded,
        namedFteChanged,
        dependsOn,
        dependents,
      }),
    [scope.name, deltaDays, anonymousFteAdded, namedFteChanged, dependsOn, dependents]
  );

  return (
    <div className="flex flex-col gap-6 p-5 h-full overflow-y-auto">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-1">Selected scope</div>
        <div className="font-display text-lg text-[var(--i-text)]">{scope.name}</div>
        {active && (
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-display" style={{ color: dirty ? "var(--i-violet)" : "var(--i-text)" }}>
              {formatDate(active.likelyDate)}
            </span>
            {dirty && (
              <span className="text-xs font-medium" style={{ color: moveColor(deltaDays) }}>
                {deltaDays === 0 ? "no change" : deltaDays < 0 ? `${Math.abs(deltaDays)} days earlier` : `${deltaDays} days later`}
              </span>
            )}
          </div>
        )}
        {momentum && (
          <div className="mt-1.5 text-[11px] text-[var(--i-text-faint)]">
            {momentum.stalled ? "Unchanged since last report" : `${dateDeltaPhrase(momentum.dateDeltaDays)} than last report`}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--i-border)] pt-5">
        <CapacityControl
          realityCapacity={realityCapacity}
          scenarioCapacity={scenarioCapacity}
          anonymousFteAdded={anonymousFteAdded}
          canDecrement={canDecrement}
          onIncrement={onIncrement}
          onIncrementTwice={onIncrementTwice}
          onDecrement={onDecrement}
          onResetCapacity={onResetCapacity}
          sourceLabel={CAPACITY_SOURCE_LABEL[scope.capacitySource]}
        />
      </div>

      {active && (
        <div className="border-t border-[var(--i-border)] pt-5">
          <TargetControl
            scopeId={scope.scopeId}
            savedTargetDate={scope.targetDate}
            sortedDays={active.completionDaysSorted}
            startDate={startDate}
            onSave={onSaveTargetDate}
          />
        </div>
      )}

      {dependents.length > 0 && (
        <div className="border-t border-[var(--i-border)] pt-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">Effect on portfolio</div>
          <ul className="space-y-1.5">
            {dependents.map((d) => (
              <li key={d.scopeId} className="flex items-center justify-between text-sm">
                <span className="text-[var(--i-text-soft)]">{d.name}</span>
                <span className="font-medium" style={{ color: moveColor(d.deltaDays) }}>
                  {d.deltaDays === 0 ? "no change" : d.deltaDays < 0 ? `${Math.abs(d.deltaDays)}d earlier` : `${d.deltaDays}d later`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-[var(--i-border)] pt-5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">Why</div>
        {explanation.length > 0 ? (
          <ul className="space-y-2">
            {explanation.map((line, i) => (
              <li key={i} className="text-sm text-[var(--i-text-soft)] leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--i-text-faint)]">
            No scenario changes are affecting {scope.name} right now.
          </p>
        )}
      </div>

      <div className="border-t border-[var(--i-border)] pt-5 mt-auto">
        <div className="text-[10px] uppercase tracking-wider text-[var(--i-text-faint)] mb-2">Ask Hermes</div>
        <p className="text-[11px] text-[var(--i-text-faint)] mb-2 leading-relaxed">
          Answers about {scope.name}&rsquo;s current saved forecast — Hermes doesn&rsquo;t see this unsaved
          scenario yet.
        </p>
        <div className="instrument-ask">
          <AskChips scopeId={scope.scopeId} hasTargetDate={!!scope.targetDate} />
        </div>
      </div>
    </div>
  );
}
