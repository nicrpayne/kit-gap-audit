"use client";

// FORECAST — the flagship. The synthesized delivery consequence, as an object.
//
// Composition owes its hierarchy to how a good plug-in is laid out: ONE
// enormous focal element, generous emptiness around it, and a thin strip of
// controls that support rather than compete. The date is the answer the
// machine is currently giving; everything statistical is one click away in
// Forecast Detail rather than permanently on screen.
//
// Reality is calm. Scenario opens the macro strip and the object morphs while
// Reality stays behind as a dashed outline. The date is an OUTPUT and is never
// draggable; the target is a boundary you can move, and moving it changes the
// evaluation without touching the distribution.

import { useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import LivingForecast, { dispersionWord, type GateMark } from "@/components/instrument/LivingForecast";
import ForecastDetail from "@/components/instrument/ForecastDetail";
import { useProject, EMPTY_SCENARIO, fmtDay, deltaLabel, deltaTone } from "@/lib/instrument/useProject";
import { confidenceAtDay } from "@/lib/forecast/simulate";
import { DIRECTION_GLYPH, DIRECTION_LABEL, directionTone } from "@/lib/momentum/trend";

export default function ForecastInstrument() {
  const m = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  const [targetOverride, setTargetOverride] = useState<Map<string, number>>(new Map());
  const [detailOpen, setDetailOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);

  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);
  const scopeId = selected ?? m.data?.scopes[0]?.scopeId ?? null;
  const scope = m.data?.scopes.find((s) => s.scopeId === scopeId) ?? null;

  const strip = (
    <ScenarioStrip
      title="Forecast"
      owns="Where we land, given everything we currently believe"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => {
        m.setScenario(EMPTY_SCENARIO);
        setTargetOverride(new Map());
      }}
      right={
        <div className="flex items-center gap-1.5">
          {(m.data?.scopes ?? []).map((s) => (
            <button
              key={s.scopeId}
              onClick={() => setSelected(s.scopeId)}
              data-shoot={`scope-${s.scopeId}`}
              className="rounded px-2.5 py-1 text-[10.5px] transition-colors"
              style={{
                background: s.scopeId === scopeId ? "var(--i-panel-raised)" : "transparent",
                color: s.scopeId === scopeId ? "var(--i-text)" : "var(--i-text-faint)",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      }
    />
  );

  if (!m.data || !scope || !m.startDate)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  const base = m.baseline?.get(scope.scopeId);
  const res = m.preview?.get(scope.scopeId) ?? base;
  if (!res) return <InstrumentShell stateBar={strip}><div className="flex-1" /></InstrumentShell>;

  const moved = m.active && base ? Math.round((res.likelyDate.getTime() - base.likelyDate.getTime()) / 86400000) : 0;
  const savedTargetDay = scope.targetDate
    ? (new Date(scope.targetDate).getTime() - m.startDate.getTime()) / 86400000
    : null;
  const targetDay = targetOverride.get(scope.scopeId) ?? savedTargetDay;
  const confidence = targetDay !== null ? confidenceAtDay(res.completionDaysSorted, targetDay) : null;

  // Framed SYMMETRICALLY about P50, so the object's waist lands dead centre
  // and the date sits inside the form rather than beside it. The axis is a
  // consequence of the composition, not the other way round.
  //
  // The distribution decides the frame; a target or gate only widens it enough
  // to be visible. Padding off the outermost reference instead would let a
  // distant target squeeze the object into a sliver and make a settled project
  // look like nothing at all.
  const centre = res.percentiles.p50;
  // The window is sized by the object being shown, never by whatever else is
  // on the canvas. Everything else may widen it, but only up to a cap — past
  // that a reference becomes an edge marker, because a distant deadline or a
  // sprawling old Reality is not a reason for a settled project to render as
  // a speck.
  // Sized off the object's near-extremes, not p10/p90, so the form always
  // terminates inside the canvas. A tail sliced off by the viewport edge reads
  // as a rendering fault, not as a long tail.
  const cds = res.completionDaysSorted;
  const q = (p: number) => cds[Math.min(cds.length - 1, Math.max(0, Math.round(p * (cds.length - 1))))];
  const objHalf = Math.max(centre - q(0.005), q(0.995) - centre, 1.5);
  const cap = objHalf * 2.6;
  const wantReality = base ? Math.abs(base.percentiles.p50 - centre) * 1.3 : 0;
  const wantTarget = targetDay === null ? 0 : Math.abs(targetDay - centre) * 1.15;
  const halfSpan = Math.max(objHalf * 1.15, Math.min(wantReality, cap), Math.min(wantTarget, cap), 3);
  const minDay = centre - halfSpan;
  const maxDay = centre + halfSpan;

  // The scrub always reaches past the window, so a target can be pushed out of
  // frame and pulled back in.
  const scrubHalf = Math.max(halfSpan, targetDay === null ? 0 : Math.abs(targetDay - centre)) * 1.25;

  // A gate sits at its own likely duration from today — that is the real date
  // the decision is expected to land, and nothing can complete before it.
  const openGates: GateMark[] = scope.gates
    .filter((g) => !m.scenario.resolvedGateIds.has(g.id))
    .map((g) => ({ id: g.id, label: g.label, day: g.likely }));

  const trend = m.momentumByScope.get(scope.scopeId) ?? null;
  const momentumDir = !trend ? 0 : trend.direction === "rising" ? -1 : trend.direction === "falling" ? 1 : 0;

  const month = res.likelyDate.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }).toUpperCase();
  const day = res.likelyDate.toLocaleDateString(undefined, { day: "numeric", timeZone: "UTC" });

  const cutCount = scope.items.filter((i) => m.scenario.excludedItemIds.has(i.id)).length;

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={setSelected}
    >
      <div className="flex-1 min-h-0 relative" style={{ background: "var(--i-void)" }}>
        <LivingForecast
          result={res}
          reality={m.active && base ? base : undefined}
          minDay={minDay}
          maxDay={maxDay}
          startDate={m.startDate}
          targetDay={targetDay}
          confidence={confidence}
          gates={openGates}
          momentumDir={momentumDir}
          scenarioActive={m.active}
        />

        {/* THE ANSWER. Sits at the object's waist. Output only — nothing here
            is draggable, and clicking opens the numbers rather than editing. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <button
            onClick={() => setDetailOpen(true)}
            data-shoot="central-date"
            className="pointer-events-auto text-center group"
            title="Open Forecast Detail"
          >
            <div
              className="i-label"
              style={{ letterSpacing: "0.28em", color: "var(--i-text-soft)", textShadow: "0 2px 14px var(--i-void)" }}
            >
              {scope.name} lands
            </div>
            <div className="flex items-baseline justify-center gap-4 mt-3">
              <span
                className="i-readout leading-[0.8]"
                style={{
                  fontSize: "clamp(56px, 7.5vw, 132px)",
                  color: moved !== 0 ? "var(--i-violet)" : "var(--i-text)",
                  letterSpacing: "-0.045em",
                  // The object passes behind the type. The halo keeps the answer
                  // readable without hiding the form it is sitting in.
                  textShadow: "0 0 26px rgba(6,8,10,0.9)",
                  transition: "color 400ms ease",
                }}
              >
                {month} {day}
              </span>
            </div>
            <div
              className="mt-4 flex items-center justify-center gap-3 flex-wrap"
              style={{ textShadow: "0 2px 16px var(--i-void)" }}
            >
              <span className="i-readout text-[12px] text-[var(--i-text-soft)]">
                {fmtDay(new Date(m.startDate.getTime() + res.percentiles.p10 * 86400000))} —{" "}
                {fmtDay(new Date(m.startDate.getTime() + res.percentiles.p90 * 86400000))}
              </span>
              <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
                {dispersionWord(res)}
              </span>
              {moved !== 0 && (
                <span className="i-readout text-[12px]" style={{ color: deltaTone(moved) }}>
                  {deltaLabel(moved)}
                </span>
              )}
            </div>
            <div className="mt-2.5 text-[10px] text-[var(--i-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity">
              Click for the numbers
            </div>
          </button>
        </div>

        {/* Corner facts. Deliberately three, deliberately in the corners, so
            the middle of the canvas stays empty. */}
        <div className="absolute top-4 left-5 pointer-events-none">
          {confidence !== null ? (
            <>
              <div className="i-label">Chance of hitting target</div>
              <div
                className="i-readout text-[30px] leading-none mt-1.5"
                style={{ color: confidence >= 70 ? "var(--i-mint)" : confidence >= 40 ? "var(--i-amber)" : "var(--i-red)" }}
              >
                {confidence}%
              </div>
            </>
          ) : (
            <>
              <div className="i-label">No target set</div>
              <div className="mt-1.5 text-[11px] text-[var(--i-text-faint)] max-w-[190px] leading-relaxed">
                Nothing to judge this against, so the instrument stays neutral.
              </div>
              <Link
                href="/timeline"
                className="pointer-events-auto mt-2 inline-block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
              >
                Timeline owns targets →
              </Link>
            </>
          )}
        </div>

        {trend && (
          <div className="absolute top-4 right-5 text-right pointer-events-none">
            <div className="i-label">Momentum</div>
            <div className="mt-1.5 flex items-baseline justify-end gap-1.5">
              <span className="i-readout text-[16px] leading-none" style={{ color: directionTone(trend.direction) }}>
                {DIRECTION_GLYPH[trend.direction]}
              </span>
              <span
                className="text-[12px] font-semibold uppercase tracking-wide leading-none"
                style={{ color: directionTone(trend.direction) }}
              >
                {DIRECTION_LABEL[trend.direction]}
              </span>
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">interpretation, not forecast input</div>
          </div>
        )}

        {/* Target scrub — the one thing on the canvas you may move. It changes
            the evaluation; the object does not move. */}
        {targetDay !== null && (
          <input
            type="range"
            min={Math.round(centre - scrubHalf)}
            max={Math.round(centre + scrubHalf)}
            value={Math.round(targetDay)}
            data-shoot="target-scrub"
            aria-label={`${scope.name} target date`}
            onChange={(e) =>
              setTargetOverride((prev) => new Map(prev).set(scope.scopeId, parseInt(e.target.value, 10)))
            }
            style={{ bottom: macrosOpen ? 152 : 62 }}
            className="absolute left-[8%] right-[8%] accent-[var(--i-violet)] opacity-25 hover:opacity-90 focus:opacity-100 focus:outline-none transition-opacity"
          />
        )}

        {/* The macro strip. Closed in Reality; opens when you want to play. */}
        <div className="absolute bottom-0 left-0 right-0">
          {macrosOpen && (
            <div
              className="px-5 py-3.5 flex items-start gap-6 flex-wrap"
              style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
            >
              <div className="min-w-[168px]">
                <div className="i-label mb-2">Assume settled</div>
                <div className="flex flex-wrap gap-1.5">
                  {scope.gates.map((g) => {
                    const on = m.scenario.resolvedGateIds.has(g.id);
                    return (
                      <button
                        key={g.id}
                        data-shoot="macro-gate"
                        onClick={() =>
                          m.setScenario((prev) => {
                            const n = new Set(prev.resolvedGateIds);
                            if (n.has(g.id)) n.delete(g.id);
                            else n.add(g.id);
                            return { ...prev, resolvedGateIds: n };
                          })
                        }
                        className="rounded-full px-2.5 py-1.5 text-[10.5px] max-w-[230px] truncate transition-colors"
                        style={{
                          background: on ? "var(--i-violet)" : "var(--i-panel-raised)",
                          color: on ? "var(--i-void)" : "var(--i-text-soft)",
                          border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                        }}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                  {scope.gates.length === 0 && (
                    <span className="text-[10.5px] text-[var(--i-text-faint)]">No gates on this scope.</span>
                  )}
                </div>
              </div>

              <div className="min-w-[150px]">
                <div className="i-label mb-2">Scope</div>
                <div className="flex items-baseline gap-2">
                  <span className="i-readout text-[15px] text-[var(--i-text)]">
                    {scope.items.length - cutCount}/{scope.items.length}
                  </span>
                  <span className="text-[10px] text-[var(--i-text-faint)]">items in</span>
                </div>
                <Link href="/scope" className="mt-1.5 block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
                  Choose what ships →
                </Link>
              </div>

              <div className="min-w-[150px]">
                <div className="i-label mb-2">People</div>
                <div className="flex items-baseline gap-2">
                  <span className="i-readout text-[15px] text-[var(--i-text)]">{scope.teamCapacity.toFixed(1)} FTE</span>
                  <span className="text-[10px] text-[var(--i-text-faint)]">{m.data.contextSwitchCostPct}% switch</span>
                </div>
                <Link href="/portfolio" className="mt-1.5 block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
                  Portfolio owns these →
                </Link>
              </div>

              <div className="flex-1" />
              <button
                onClick={() => setDetailOpen(true)}
                className="rounded-md px-3 py-2 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Forecast detail
              </button>
            </div>
          )}
          <div className="flex justify-center pb-3 pt-2">
            <button
              onClick={() => setMacrosOpen((v) => !v)}
              data-shoot="toggle-macros"
              className="rounded-full px-3.5 py-1.5 text-[10.5px] transition-colors"
              style={{
                background: macrosOpen ? "var(--i-panel-raised)" : "transparent",
                color: "var(--i-text-faint)",
                border: "1px solid var(--i-border)",
              }}
            >
              {macrosOpen ? "Hide assumptions" : "Play with assumptions"}
            </button>
          </div>
        </div>
      </div>

      <ForecastDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        scopeName={scope.name}
        result={res}
        reality={base}
        startDate={m.startDate}
        targetDay={targetDay}
        confidence={confidence}
        gates={scope.gates}
        resolvedGateIds={m.scenario.resolvedGateIds}
        capacity={scope.teamCapacity}
        capacitySource={scope.capacitySource}
        itemsIn={scope.items.length - cutCount}
        itemsTotal={scope.items.length}
      />
    </InstrumentShell>
  );
}
