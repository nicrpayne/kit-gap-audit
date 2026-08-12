"use client";

// FORECAST — the synthesized delivery consequence. Where do we land?
//
// This is the master output of the machine. It owns no inputs of its own:
// capacity belongs to Portfolio, work belongs to Scope, choices belong to
// Decisions. What it owns is the ANSWER, plus a short rack of project-wide
// assumptions that are cheap to try and that the engine genuinely honours.
//
// The Monte Carlo field is the real one, unchanged. P50 is a readout and is
// not draggable. The target flag is the only thing on the field you can move,
// because moving it re-asks the probability question without re-simulating.

import { useMemo, useState } from "react";
import Link from "next/link";
import ForecastField from "@/components/portfolio/ForecastField";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { InheritedValue, Stat } from "@/components/instrument/Panel";
import { ArcMeter } from "@/components/instrument/Meter";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtDay,
  fmtFull,
  deltaLabel,
  deltaTone,
  confidenceTone,
} from "@/lib/instrument/useProject";
import { confidenceAtDay } from "@/lib/forecast/simulate";

export default function ForecastInstrument() {
  const m = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingTargets, setPendingTargets] = useState<Map<string, string>>(new Map());

  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);
  const scopeId = selected ?? m.data?.scopes[0]?.scopeId ?? null;
  const scope = m.data?.scopes.find((s) => s.scopeId === scopeId) ?? null;

  const fieldScopes = useMemo(
    () =>
      (m.data?.scopes ?? []).map((s) => ({
        scopeId: s.scopeId,
        name: s.name,
        dependsOnScopeIds: s.dependsOnScopeIds,
        targetDate: s.targetDate,
        changed:
          s.scopeId in m.scenario.capacityOverrideByScope ||
          s.items.some((i) => m.scenario.excludedItemIds.has(i.id)) ||
          s.gates.some((g) => m.scenario.resolvedGateIds.has(g.id)),
      })),
    [m.data, m.scenario]
  );

  const axis = useMemo(() => {
    if (!m.data || !m.startDate) return null;
    const days = [0];
    for (const s of m.data.scopes) {
      for (const r of [m.baseline?.get(s.scopeId), m.preview?.get(s.scopeId)]) {
        if (r) days.push(r.percentiles.p10, r.percentiles.p90);
      }
      const t = pendingTargets.get(s.scopeId) ?? s.targetDate;
      if (t) days.push((new Date(t).getTime() - m.startDate.getTime()) / 86400000);
    }
    const minDay = Math.min(0, ...days);
    const maxRaw = Math.max(...days);
    const maxDay = maxRaw + Math.max(8, maxRaw * 0.16);
    const ticks: { day: number; label: string }[] = [];
    const step = maxDay - minDay <= 70 ? 7 : 28;
    for (let d = Math.ceil(minDay / step) * step; d <= maxDay; d += step) {
      const dt = new Date(m.startDate);
      dt.setUTCDate(dt.getUTCDate() + d);
      ticks.push({ day: d, label: fmtDay(dt) });
    }
    return { minDay, maxDay, ticks };
  }, [m.data, m.startDate, m.baseline, m.preview, pendingTargets]);

  const strip = (
    <ScenarioStrip
      title="Forecast"
      owns="Where we land, given everything we currently believe"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
    />
  );

  if (m.loading && !m.data)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">Loading…</div>
      </InstrumentShell>
    );
  if (!m.data || !scope || !m.startDate) return <InstrumentShell stateBar={strip}><div className="flex-1" /></InstrumentShell>;

  const b = m.baseline?.get(scope.scopeId);
  const p = m.preview?.get(scope.scopeId) ?? b;
  const delta = b && p ? Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000) : 0;
  const targetIso = pendingTargets.get(scope.scopeId) ?? scope.targetDate;
  const conf =
    p && targetIso
      ? confidenceAtDay(p.completionDaysSorted, (new Date(targetIso).getTime() - m.startDate.getTime()) / 86400000)
      : null;

  // The assumption rack. Every entry here is something the engine really
  // simulates -- gates disappear, work drops out, capacity is overridden.
  const allGates = m.data.scopes.flatMap((s) => s.gates.map((g) => ({ g, scope: s })));
  const cutItems = m.data.scopes.flatMap((s) => s.items.filter((i) => m.scenario.excludedItemIds.has(i.id)));

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={setSelected}
    >
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col" style={{ background: "var(--i-bg)" }}>
          <ForecastField
            scopes={fieldScopes}
            baseline={m.baseline}
            preview={m.preview}
            axis={axis}
            startDate={m.startDate}
            dirty={m.active}
            selectedScopeId={scopeId}
            onSelectScope={setSelected}
            onScrubTarget={(id, iso) =>
              setPendingTargets((prev) => {
                const n = new Map(prev);
                n.set(id, iso);
                return n;
              })
            }
            pendingTargets={pendingTargets}
            onSaveTarget={() => {}}
            portfolioLikely={m.portfolioLikely.date}
            portfolioDeltaDays={m.portfolioLikely.deltaDays}
            portfolioGatedBy={m.portfolioLikely.gatedBy}
          />
        </div>

        {/* The rack: assumptions in, consequence out. */}
        <aside
          className="shrink-0 w-[320px] flex flex-col overflow-y-auto"
          style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
        >
          <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
            <div className="i-label">Consequence · {scope.name}</div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span
                className="i-readout text-[22px] leading-none"
                style={{ color: delta !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
              >
                {p ? fmtFull(p.likelyDate) : "—"}
              </span>
              {delta !== 0 && (
                <span className="text-[11px] font-medium" style={{ color: deltaTone(delta) }}>
                  {deltaLabel(delta)}
                </span>
              )}
            </div>
            <div className="mt-3">
              <ArcMeter
                pct={conf}
                tone={confidenceTone(conf)}
                caption={targetIso ? `by ${fmtDay(new Date(targetIso))}` : "no target set"}
              />
            </div>
            <p className="mt-3 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
              Drag a target flag on the field to re-ask the probability question. It never re-runs the simulation —
              the distribution stays put.
            </p>
          </div>

          <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
            <div className="i-label mb-2">Assume decisions resolved</div>
            <p className="text-[10px] text-[var(--i-text-faint)] leading-relaxed mb-2.5">
              A blocking decision adds serial delay that more people cannot shorten. Switching one off here removes
              exactly that delay.
            </p>
            <ul className="space-y-1.5">
              {allGates.map(({ g, scope: s }) => {
                const on = m.scenario.resolvedGateIds.has(g.id);
                return (
                  <li key={g.id}>
                    <button
                      data-shoot="assume-gate"
                      onClick={() =>
                        m.setScenario((prev) => {
                          const n = new Set(prev.resolvedGateIds);
                          if (n.has(g.id)) n.delete(g.id);
                          else n.add(g.id);
                          return { ...prev, resolvedGateIds: n };
                        })
                      }
                      className="w-full text-left rounded-md px-2.5 py-2 transition-colors"
                      style={{
                        background: on ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
                        border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border)"}`,
                      }}
                    >
                      <span className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className="mt-[3px] shrink-0 text-[10px]"
                          style={{ color: on ? "var(--i-violet)" : "var(--i-amber)" }}
                        >
                          {on ? "✓" : "○"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] leading-snug text-[var(--i-text)]">{g.label}</span>
                          <span className="block text-[9.5px] text-[var(--i-text-faint)] mt-0.5">
                            {s.name} · {on ? "assumed settled" : `+${Math.round(g.likely)}d while open`}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {allGates.length === 0 && (
                <li className="text-[11px] text-[var(--i-text-faint)]">No blocking decisions in the model.</li>
              )}
            </ul>
            <Link
              href="/decisions"
              className="mt-2.5 inline-block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
            >
              Manage decisions →
            </Link>
          </section>

          <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
            <div className="i-label mb-2">Inputs this forecast reads</div>
            <div className="space-y-2.5">
              <InheritedValue
                label="Capacity"
                value={`${scope.teamCapacity.toFixed(1)} FTE`}
                href="/portfolio"
                hrefLabel="Portfolio"
              />
              <InheritedValue
                label="Switch cost"
                value={`${m.data.contextSwitchCostPct}%`}
                href="/portfolio"
                hrefLabel="Portfolio"
              />
              <InheritedValue
                label="Work in scope"
                value={`${scope.items.filter((i) => !m.scenario.excludedItemIds.has(i.id)).length} / ${scope.items.length}`}
                href="/scope"
                hrefLabel="Scope"
              />
            </div>
            {cutItems.length > 0 && (
              <p className="mt-2.5 text-[10px] leading-relaxed" style={{ color: "var(--i-violet)" }}>
                {cutItems.length} item{cutItems.length === 1 ? " is" : "s are"} cut in this scenario.
              </p>
            )}
          </section>

          <section className="px-4 py-3.5">
            <div className="i-label mb-2">Spread</div>
            {p && (
              <>
                <Stat
                  label=""
                  size={20}
                  value={`${Math.round(p.percentiles.p90 - p.percentiles.p10)}d`}
                  sub="between best and worst case"
                />
                <div className="mt-2 i-readout text-[11px] text-[var(--i-text-soft)]">
                  {fmtDay(new Date(m.startDate.getTime() + p.percentiles.p10 * 86400000))} —{" "}
                  {fmtDay(new Date(m.startDate.getTime() + p.percentiles.p90 * 86400000))}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </InstrumentShell>
  );
}
