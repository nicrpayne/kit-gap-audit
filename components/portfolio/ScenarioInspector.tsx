"use client";

// The Inspector answers "why", and only "why".
//
// Controls live in the bay and on the field; this panel narrates. It is the
// third of the Instrument's three categories -- CONTROL changes something,
// METER tells you something, INSPECTOR helps you understand why -- and the
// one place where Reality is allowed to be corrected, because correcting
// what the system believes is true is a different act from asking a
// hypothetical, and should not be reachable by dragging.

import { useEffect, useMemo, useRef, useState } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { explainScope, type DependencyDelta, type DependentDelta } from "@/lib/portfolio/explain";
import { switchFactorFor, type CapacityContributor } from "@/lib/capacity/resolve";
import {
  DIRECTION_GLYPH,
  DIRECTION_LABEL,
  directionTone,
  trendPhrase,
  type MomentumTrend,
} from "@/lib/momentum/trend";
import AskChips from "@/components/AskChips";

export type InspectorFocus = "capacity" | "switchCost" | "momentum" | null;

export type CapacityBasisView =
  | { kind: "allocations"; contributors: CapacityContributor[] }
  | { kind: "explicit"; value: number }
  | { kind: "inferred"; assignees: string[]; remainingIssueCount: number; unassignedCount: number };

export interface SwitchCostScopeView {
  scopeId: string;
  name: string;
  source: "allocations" | "explicit" | "inferred";
  trackedPeople: number;
  splitPeople: string[];
}

export interface InspectorScope {
  scopeId: string;
  name: string;
  targetDate: string | null;
  capacitySource: "allocations" | "explicit" | "inferred";
}

interface ScenarioInspectorProps {
  scope: InspectorScope;
  baseline: SimulationResult | undefined;
  preview: SimulationResult | undefined;
  dirty: boolean;
  /** Scopes carrying a scenario change -- NOT the same as the selected one. */
  changedScopeNames: string[];
  dependsOn: DependencyDelta[];
  dependents: DependentDelta[];
  trend: MomentumTrend | null;
  realityCapacity: number;
  scenarioCapacity: number;
  capacityBasis: CapacityBasisView;
  onSaveRealityCapacity: (fte: number) => Promise<void>;
  onManagePeople: () => void;
  switchCostPct: number;
  switchCostScopes: SwitchCostScopeView[];
  focus: InspectorFocus;
  onCollapse: () => void;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function moveColor(deltaDays: number): string {
  return deltaDays < 0 ? "var(--i-mint)" : deltaDays > 0 ? "var(--i-red)" : "var(--i-text-soft)";
}

export default function ScenarioInspector({
  scope,
  baseline,
  preview,
  dirty,
  changedScopeNames,
  dependsOn,
  dependents,
  trend,
  realityCapacity,
  scenarioCapacity,
  capacityBasis,
  onSaveRealityCapacity,
  onManagePeople,
  switchCostPct,
  switchCostScopes,
  focus,
  onCollapse,
}: ScenarioInspectorProps) {
  const active = preview ?? baseline;
  const deltaDays =
    dirty && baseline && active
      ? Math.round((active.likelyDate.getTime() - baseline.likelyDate.getTime()) / 86400000)
      : 0;

  const capacityRef = useRef<HTMLElement>(null);
  const switchRef = useRef<HTMLElement>(null);
  const momentumRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = focus === "capacity" ? capacityRef : focus === "switchCost" ? switchRef : focus === "momentum" ? momentumRef : null;
    target?.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus]);

  const capacityChanged = Math.abs(scenarioCapacity - realityCapacity) > 1e-6;

  const explanation = useMemo(
    () =>
      explainScope({
        scopeName: scope.name,
        deltaDays,
        // The aggregate fader is not a named-person move; explainScope's
        // person-shaped inputs stay empty and the capacity story is told by
        // the section below instead.
        anonymousFteAdded: 0,
        namedFteChanged: false,
        dependsOn,
        dependents,
      }),
    [scope.name, deltaDays, dependsOn, dependents]
  );

  return (
    <aside
      className="shrink-0 hidden xl:flex flex-col overflow-y-auto"
      style={{ width: 296, background: "var(--i-bg)", borderLeft: "1px solid var(--i-border)" }}
      aria-label={`${scope.name} detail`}
    >
      {/* INSPECTING is structural/neutral. CHANGED is violet. They are
          different questions and must never share a visual state. */}
      <div className="px-4 pt-3.5 pb-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="i-label">Inspecting</div>
            <div className="mt-1.5 text-[13px] font-medium text-[var(--i-text)] truncate">{scope.name}</div>
            {active && (
              <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                <span
                  className="i-readout text-[20px] leading-none"
                  style={{ color: dirty && deltaDays !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
                >
                  {formatDate(active.likelyDate)}
                </span>
                {dirty && deltaDays !== 0 && (
                  <span className="text-[11px] font-medium" style={{ color: moveColor(deltaDays) }}>
                    {deltaDays < 0 ? `${Math.abs(deltaDays)}d earlier` : `${deltaDays}d later`}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onCollapse}
            aria-label="Collapse inspector"
            title="Collapse inspector"
            className="shrink-0 h-6 w-6 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
          >
            ›
          </button>
        </div>

        {changedScopeNames.length > 0 && (
          <div className="mt-3 rounded-md px-2.5 py-2" style={{ background: "var(--i-violet-soft)" }}>
            <div className="i-label" style={{ color: "var(--i-violet)" }}>
              Changed in this scenario
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--i-text)]">{changedScopeNames.join(", ")}</div>
            {!changedScopeNames.includes(scope.name) && (
              <div className="mt-1 text-[10px] text-[var(--i-text-soft)]">
                You&rsquo;re looking at {scope.name}, which you haven&rsquo;t changed.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Reality capacity: where the number came from, and how to fix it ---- */}
      <RealitySection
        ref={capacityRef}
        scope={scope}
        realityCapacity={realityCapacity}
        scenarioCapacity={scenarioCapacity}
        capacityChanged={capacityChanged}
        basis={capacityBasis}
        onSave={onSaveRealityCapacity}
        onManagePeople={onManagePeople}
        highlighted={focus === "capacity"}
      />

      {/* ---- Context switch: what it actually reaches ---- */}
      <section
        ref={switchRef}
        className="px-4 py-3.5"
        style={{
          borderBottom: "1px solid var(--i-border)",
          background: focus === "switchCost" ? "rgba(155,140,250,0.05)" : undefined,
        }}
      >
        {/* Collapsed by default: this is a portfolio-wide assumption, not a
            fact about the scope you selected, so it shouldn't spend a
            screenful every time you inspect something. Opens automatically
            when you arrive here from the knob's own "what does this affect?". */}
        <details open={focus === "switchCost"}>
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <span className="i-label">Context switch · {Math.round(switchCostPct)}%</span>
            <span className="text-[10px] text-[var(--i-text-faint)] underline decoration-dotted underline-offset-2">
              what it affects
            </span>
          </summary>
        <p className="mt-2 text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          A portfolio-wide assumption, not a property of any one scope. Someone working across{" "}
          <strong className="text-[var(--i-text)]">N</strong> scopes keeps{" "}
          <strong className="text-[var(--i-text)]">
            100 − {Math.round(switchCostPct)} × (N − 1)
          </strong>
          % of their time, floored at 10%. It only ever touches scopes whose capacity comes from named people —
          an aggregate number has no individuals to penalise.
        </p>
        <div className="mt-2.5 space-y-1.5">
          {switchCostScopes.map((s) => (
            <div key={s.scopeId} className="text-[11px] flex items-baseline justify-between gap-2">
              <span className="text-[var(--i-text-soft)] truncate">{s.name}</span>
              {s.source === "allocations" ? (
                <span className="shrink-0" style={{ color: s.splitPeople.length > 0 ? "var(--i-amber)" : "var(--i-text-faint)" }}>
                  {s.splitPeople.length > 0
                    ? `${s.splitPeople.length} split · ${Math.round(switchFactorFor(switchCostPct, 2) * 100)}%`
                    : `${s.trackedPeople} tracked · none split`}
                </span>
              ) : (
                <span className="shrink-0 text-[var(--i-text-faint)]">aggregate · no effect</span>
              )}
            </div>
          ))}
        </div>
        </details>
      </section>

      {/* ---- Momentum ---- */}
      {trend && (
        <section
          ref={momentumRef}
          className="px-4 py-3.5"
          style={{
            borderBottom: "1px solid var(--i-border)",
            background: focus === "momentum" ? "rgba(155,140,250,0.05)" : undefined,
          }}
        >
          <div className="i-label mb-2">Why momentum is {DIRECTION_LABEL[trend.direction].toLowerCase()}</div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="i-readout text-[15px] leading-none" style={{ color: directionTone(trend.direction) }}>
              {DIRECTION_GLYPH[trend.direction]}
            </span>
            <span className="text-[11px] text-[var(--i-text-soft)]">{trendPhrase(trend)}</span>
          </div>
          {trend.dateUnchangedButImproving && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-mint)]">
              The headline date hasn&rsquo;t moved yet, but the odds behind it improved — worth saying out loud
              before someone reads &ldquo;no change&rdquo; as &ldquo;no progress.&rdquo;
            </p>
          )}
          {trend.drivers.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {trend.drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                  <span
                    aria-hidden
                    className="mt-[3px] shrink-0"
                    style={{ color: d.tone === "good" ? "var(--i-mint)" : d.tone === "bad" ? "var(--i-red)" : "var(--i-text-faint)" }}
                  >
                    {d.tone === "good" ? "+" : d.tone === "bad" ? "−" : "·"}
                  </span>
                  <span className="text-[var(--i-text-soft)]">{d.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--i-text-faint)]">
              Nothing in the last report moved enough to attribute.
            </p>
          )}
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] list-none">
              <span className="underline decoration-dotted underline-offset-2">What is momentum?</span>
            </summary>
            <p className="mt-2 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
              It compares two things only: today&rsquo;s forecast against the forecast in the last report we
              generated for this scope. If the date moved earlier or the odds of hitting the target went up, that
              reads as rising; later or worse odds reads as falling; movement under a day or under five points is
              treated as no movement at all.
            </p>
            <p className="mt-2 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
              It is a direction, not a score — there is no 0–100 momentum number, because two points in time
              can&rsquo;t support one. It says nothing about effort, morale or velocity, and it can&rsquo;t see
              anything that happened since the last report was written.
            </p>
          </details>
        </section>
      )}

      {dependents.length > 0 && (
        <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label mb-2">Effect on portfolio</div>
          <ul className="space-y-1.5">
            {dependents.map((d) => (
              <li key={d.scopeId} className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--i-text-soft)] truncate pr-2">{d.name}</span>
                <span className="font-medium tabular-nums shrink-0" style={{ color: moveColor(d.deltaDays) }}>
                  {d.deltaDays === 0 ? "no change" : d.deltaDays < 0 ? `${Math.abs(d.deltaDays)}d earlier` : `${d.deltaDays}d later`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="i-label mb-2">Why this date</div>
        {capacityChanged && (
          <p className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed mb-2">
            {scope.name} is being simulated at{" "}
            <strong className="text-[var(--i-violet)]">{scenarioCapacity.toFixed(1)} FTE</strong> instead of its
            real {realityCapacity.toFixed(1)} — an aggregate hypothetical, not a claim about who specifically is
            on it.
          </p>
        )}
        {explanation.length > 0 ? (
          <ul className="space-y-2">
            {explanation.map((line, i) => (
              <li key={i} className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          !capacityChanged && (
            <p className="text-[11.5px] text-[var(--i-text-faint)] leading-relaxed">
              Nothing in this scenario is affecting {scope.name}.
            </p>
          )
        )}
      </section>

      <section className="px-4 py-3.5">
        <div className="i-label mb-2">Ask Hermes</div>
        <p className="text-[10.5px] text-[var(--i-text-faint)] mb-2 leading-relaxed">
          Answers about {scope.name}&rsquo;s saved forecast — Hermes doesn&rsquo;t see this unsaved scenario yet.
        </p>
        <div className="instrument-ask">
          <AskChips scopeId={scope.scopeId} hasTargetDate={!!scope.targetDate} />
        </div>
      </section>
    </aside>
  );
}

// Reality's own section: what the number is, where it came from, and the
// secondary path to correcting it. Deliberately separate from the Scenario
// fader in both place and wording -- "what is actually true" vs "what if".
const RealitySection = function RealitySection({
  ref,
  scope,
  realityCapacity,
  scenarioCapacity,
  capacityChanged,
  basis,
  onSave,
  onManagePeople,
  highlighted,
}: {
  ref: React.RefObject<HTMLElement | null>;
  scope: InspectorScope;
  realityCapacity: number;
  scenarioCapacity: number;
  capacityChanged: boolean;
  basis: CapacityBasisView;
  onSave: (fte: number) => Promise<void>;
  onManagePeople: () => void;
  highlighted: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(realityCapacity.toFixed(1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(realityCapacity.toFixed(1));
  }, [realityCapacity]);

  async function save() {
    const v = parseFloat(draft);
    if (!Number.isFinite(v) || v <= 0) {
      setError("Capacity has to be a number greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(v);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      ref={ref}
      className="px-4 py-3.5"
      style={{ borderBottom: "1px solid var(--i-border)", background: highlighted ? "rgba(155,140,250,0.05)" : undefined }}
    >
      <div className="i-label mb-2">Reality capacity</div>

      <div className="flex items-baseline gap-2">
        <span className="i-readout text-[20px] leading-none text-[var(--i-text)]">
          {realityCapacity.toFixed(1)} <span className="text-[11px] font-normal">FTE</span>
        </span>
        {capacityChanged && (
          <span className="text-[11px]" style={{ color: "var(--i-violet)" }}>
            simulating {scenarioCapacity.toFixed(1)}
          </span>
        )}
      </div>

      {basis.kind === "inferred" && (
        <>
          <p className="mt-2 text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
            Nobody has set a capacity for {scope.name}, so we counted the people currently holding its unfinished
            Linear tickets: <strong className="text-[var(--i-text)]">{basis.assignees.length} distinct assignees</strong>{" "}
            across {basis.remainingIssueCount} remaining tickets
            {basis.unassignedCount > 0 && ` (${basis.unassignedCount} unassigned, counted as nobody)`}.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {basis.assignees.map((a) => (
              <span
                key={a}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{ background: "var(--i-panel-raised)", color: "var(--i-text-soft)" }}
              >
                {a}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
            It counts ticket-holders, not availability — someone with one ticket at 10% of their week counts the
            same as someone full-time. This is a legacy, unstaffed forecast basis: it does not reconcile to named
            Portfolio allocations and must not be reported as named capacity. Allocate real people here to replace it.
          </p>
        </>
      )}

      {basis.kind === "explicit" && (
        <p className="mt-2 text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
          Set by hand to <strong className="text-[var(--i-text)]">{basis.value.toFixed(1)}</strong>. It overrides
          anything we&rsquo;d infer from Linear, and stays put until you change it.
        </p>
      )}

      {basis.kind === "allocations" && (
        <>
          <p className="mt-2 text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
            Tracked by named people — this is the sum of what each person actually gives this scope.
          </p>
          <ul className="mt-2 space-y-1">
            {basis.contributors.map((c) => (
              <li key={c.personId} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-[var(--i-text-soft)] truncate">
                  {c.name}
                  {c.scopeCount > 1 && (
                    <span className="text-[var(--i-amber)]"> · {c.scopeCount} scopes</span>
                  )}
                </span>
                <span className="tabular-nums shrink-0 text-[var(--i-text)]">{c.effectiveFte.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {basis.kind === "allocations" ? (
          <button
            onClick={onManagePeople}
            className="rounded-md px-2.5 py-1.5 text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
            style={{ border: "1px solid var(--i-border-strong)" }}
          >
            Manage people
          </button>
        ) : editing ? (
          <>
            <label className="sr-only" htmlFor="reality-capacity">
              Actual capacity in FTE
            </label>
            <input
              id="reality-capacity"
              type="number"
              min={0.1}
              step={0.1}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-20 rounded-md px-2 py-1.5 text-[12px] tabular-nums"
              style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            />
            <button
              onClick={save}
              disabled={saving}
              data-shoot="save-reality"
              className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium disabled:opacity-40"
              style={{ background: "var(--i-text)", color: "var(--i-void)" }}
            >
              {saving ? "Saving…" : "Set actual capacity"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            data-shoot="edit-reality"
            className="rounded-md px-2.5 py-1.5 text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
            style={{ border: "1px solid var(--i-border-strong)" }}
          >
            Set actual capacity
          </button>
        )}
      </div>
      {error && <div className="mt-2 text-[11px] text-[var(--i-red)]">{error}</div>}
      {editing && (
        <p className="mt-2 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
          This changes what the system believes is true — not a hypothetical. {scope.name}&rsquo;s capacity becomes
          a set number from now on.
        </p>
      )}
    </section>
  );
};
