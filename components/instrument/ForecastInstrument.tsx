"use client";

// FORECAST — the flagship. The synthesized delivery consequence, as an object.
//
// The default canvas answers exactly four questions:
//   where does this land · how settled is that · is something structurally
//   in the way · how does that relate to my target
// Everything else the model knows is one summons away: the central date
// opens Forecast Detail, a gate wall opens the Gate tool, the target opens
// Target evaluation, and the macro strip can ask "what does the model
// know". Simple is not the same as shallow — the canvas is the meeting
// glance, the tools are the depth.
//
// FRAMING RULE (the critical one): the window is derived from the
// distribution, Reality's ghost and the SAVED target — never from the
// evaluation override. Scrubbing a target must sweep the line through a
// perfectly still object, because a target is evaluation, not forecast
// input, and the composition is how that lesson is taught.

import { useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import LivingForecast, { dispersionWord, type GateMark } from "@/components/instrument/LivingForecast";
import ForecastDetail from "@/components/instrument/ForecastDetail";
import { GateDetail, TargetDetail, ContextDetail, RealityDetail } from "@/components/instrument/ForecastTools";
import { useProject, EMPTY_SCENARIO, fmtDay, deltaLabel, deltaTone } from "@/lib/instrument/useProject";
import { confidenceAtDay } from "@/lib/forecast/simulate";
import { formatCapacity } from "@/lib/capacity/limits";

type Tool =
  | null
  | { kind: "forecast" }
  | { kind: "gate"; id: string }
  | { kind: "target" }
  | { kind: "context" }
  | { kind: "reality" };

export default function ForecastInstrument() {
  const m = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  const [targetOverride, setTargetOverride] = useState<Map<string, number>>(new Map());
  const [tool, setTool] = useState<Tool>(null);
  const [macrosOpen, setMacrosOpen] = useState(false);

  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);
  const scopeId = selected ?? m.data?.scopes[0]?.scopeId ?? null;
  const scope = m.data?.scopes.find((s) => s.scopeId === scopeId) ?? null;

  // Memoised so LivingForecast's gate diffing sees a stable identity — a
  // fresh array every render would re-trigger the enter/leave machinery.
  const openGates = useMemo<GateMark[]>(
    () =>
      (scope?.gates ?? [])
        .filter((g) => !m.scenario.resolvedGateIds.has(g.id))
        .map((g) => ({ id: g.id, label: g.label, day: g.likely })),
    [scope, m.scenario.resolvedGateIds]
  );

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

  const base = m.baseline?.get(scope.scopeId) ?? null;
  const res = m.preview?.get(scope.scopeId) ?? base;
  if (!res) return <InstrumentShell stateBar={strip}><div className="flex-1" /></InstrumentShell>;

  const moved = m.active && base ? Math.round((res.likelyDate.getTime() - base.likelyDate.getTime()) / 86400000) : 0;
  const savedTargetDay = scope.targetDate
    ? (new Date(scope.targetDate).getTime() - m.startDate.getTime()) / 86400000
    : null;
  const targetDay = targetOverride.get(scope.scopeId) ?? savedTargetDay;
  const overridden = targetDay !== null && targetDay !== savedTargetDay;
  const confidence = targetDay !== null ? confidenceAtDay(res.completionDaysSorted, targetDay) : null;

  // Framed symmetrically about P50 so the object's waist sits dead centre.
  // Sized off the object's near-extremes so the form terminates inside the
  // canvas; the SAVED target and Reality may widen the window up to a cap,
  // past which they become edge markers — a distant deadline is not a
  // reason for a settled project to render as a speck. The evaluation
  // override is deliberately absent from this formula.
  const centre = res.percentiles.p50;
  const cds = res.completionDaysSorted;
  const q = (p: number) => cds[Math.min(cds.length - 1, Math.max(0, Math.round(p * (cds.length - 1))))];
  const objHalf = Math.max(centre - q(0.005), q(0.995) - centre, 1.5);
  const cap = objHalf * 2.6;
  // While a Scenario is on, the comparison IS the content: try to hold
  // Reality's whole distribution in frame, with a floor on the cap so a
  // freshly-settled bead can still show the baseline it left. Past that,
  // Reality becomes an edge marker rather than shrinking the object.
  const wantReality =
    m.active && base
      ? Math.max(Math.abs(base.percentiles.p10 - centre), Math.abs(base.percentiles.p90 - centre)) * 1.15
      : 0;
  const wantTarget = savedTargetDay === null ? 0 : Math.abs(savedTargetDay - centre) * 1.15;
  const halfSpan = Math.max(
    objHalf * 1.15,
    Math.min(wantReality, Math.max(cap, 18)),
    Math.min(wantTarget, cap),
    3
  );
  const minDay = centre - halfSpan;
  const maxDay = centre + halfSpan;

  // The scrub always reaches past the window so a target can be pushed out
  // of frame and pulled back in — the range moves, the window does not.
  const scrubHalf = Math.max(halfSpan, targetDay === null ? 0 : Math.abs(targetDay - centre)) * 1.25;

  const trend = m.momentumByScope.get(scope.scopeId) ?? null;
  const momentumDir = !trend ? 0 : trend.direction === "rising" ? -1 : trend.direction === "falling" ? 1 : 0;

  const month = res.likelyDate.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }).toUpperCase();
  const dayNum = res.likelyDate.toLocaleDateString(undefined, { day: "numeric", timeZone: "UTC" });

  const cutCount = scope.items.filter((i) => m.scenario.excludedItemIds.has(i.id)).length;
  // Forecast DISPLAYS capacity; Portfolio owns it. A Portfolio-made override
  // still shows here (tagged), because the shared scenario is one world.
  const capValue = m.scenario.capacityOverrideByScope[scope.scopeId] ?? scope.teamCapacity;
  const capOverridden = m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined;

  const setOverride = (day: number) =>
    setTargetOverride((prev) => new Map(prev).set(scope.scopeId, day));
  const clearOverride = () =>
    setTargetOverride((prev) => {
      const n = new Map(prev);
      n.delete(scope.scopeId);
      return n;
    });

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={setSelected}
    >
      <div className="flex-1 min-h-0 relative" style={{ background: "var(--i-void)" }}>
        <LivingForecast
          key={scope.scopeId}
          result={res}
          reality={base}
          scenarioActive={m.active}
          minDay={minDay}
          maxDay={maxDay}
          startDate={m.startDate}
          targetDay={targetDay}
          confidence={confidence}
          gates={openGates}
          momentumDir={momentumDir}
          onGateOpen={(id) => setTool({ kind: "gate", id })}
          onTargetOpen={() => setTool({ kind: "target" })}
          onObjectOpen={() => setTool({ kind: "forecast" })}
          onRealityOpen={() => setTool({ kind: "reality" })}
        />

        {/* THE ANSWER. Sits at the object's waist. Output only — nothing
            here is draggable, and clicking summons the numbers. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <button
            onClick={() => setTool({ kind: "forecast" })}
            data-shoot="central-date"
            className="pointer-events-auto text-center group"
            title="Open Forecast detail"
          >
            <div
              className="i-label"
              style={{ letterSpacing: "0.28em", color: "var(--i-text-soft)", textShadow: "0 2px 14px var(--i-void)" }}
            >
              {scope.name} lands
            </div>
            <div className="flex items-baseline justify-center gap-4 mt-3">
              <span
                key={`${month}-${dayNum}`}
                className="i-readout i-fadeup inline-block leading-[0.8]"
                style={{
                  fontSize: "clamp(56px, 7.5vw, 132px)",
                  color: moved !== 0 ? "var(--i-violet)" : "var(--i-text)",
                  letterSpacing: "-0.045em",
                  textShadow: "0 0 26px rgba(6,8,10,0.9)",
                  transition: "color 400ms ease",
                }}
              >
                {month} {dayNum}
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

        {/* No corner dashboard. Confidence lives AT the target line and in
            the Target tool; Momentum is the ambient lean and a Detail line.
            The only permanent canvas text beyond the object's own captions
            is this quiet entry when there is no target at all — otherwise
            the tool would be unreachable on a target-less scope. */}
        {confidence === null && (
          <button
            type="button"
            data-shoot="no-target-entry"
            onClick={() => setTool({ kind: "target" })}
            className="absolute top-4 left-5 text-left group"
            aria-label="Open target evaluation"
          >
            <div className="i-label group-hover:text-[var(--i-text-soft)] transition-colors">
              No target — evaluate one →
            </div>
          </button>
        )}
        {overridden && (
          <div className="absolute top-4 left-5 text-[9.5px]" style={{ color: "var(--i-violet)" }}>
            {savedTargetDay !== null
              ? `evaluating a moved target — saved ${fmtDay(new Date(m.startDate.getTime() + savedTargetDay * 86400000))}`
              : "evaluating a hypothetical target"}
          </div>
        )}

        {/* Target scrub — invisible until sought. The Target tool is the
            discoverable path; this is the direct-manipulation shortcut. */}
        {targetDay !== null && (
          <input
            type="range"
            min={Math.round(centre - scrubHalf)}
            max={Math.round(centre + scrubHalf)}
            value={Math.round(targetDay)}
            data-shoot="target-scrub"
            aria-label={`${scope.name} target date`}
            onChange={(e) => setOverride(parseInt(e.target.value, 10))}
            style={{ bottom: macrosOpen ? 196 : 62 }}
            className="absolute left-[8%] right-[8%] accent-[var(--i-violet)] opacity-0 hover:opacity-90 focus:opacity-100 focus:outline-none transition-opacity"
          />
        )}

        {/* The macro strip. Closed in Reality; opens when you want to play.
            Every control here is a real scenario lever or a summons. */}
        <div className="absolute bottom-0 left-0 right-0">
          {macrosOpen && (
            <div
              className="px-5 py-3.5 flex items-start gap-7 flex-wrap"
              style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
            >
              <div className="min-w-[168px]">
                <div className="i-label mb-2">Assume settled</div>
                <div className="flex flex-wrap gap-1.5 max-w-[280px]">
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

              <div className="min-w-[130px]">
                <div className="i-label mb-2">Scope</div>
                <div className="flex items-baseline gap-2">
                  <span className="i-readout text-[15px] text-[var(--i-text)]">
                    {scope.items.length - cutCount}/{scope.items.length}
                  </span>
                  <span className="text-[10px] text-[var(--i-text-faint)]">items in</span>
                  {cutCount > 0 && (
                    <span className="rounded-full px-1.5 py-px text-[8px] font-semibold uppercase" style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}>
                      scenario
                    </span>
                  )}
                </div>
                <Link
                  href="/scope"
                  className="mt-1.5 block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                >
                  Scope owns what ships →
                </Link>
              </div>

              {/* Displayed, not editable: Forecast composes assumptions,
                  Portfolio owns this one. */}
              <div className="min-w-[130px]" data-shoot="macro-people">
                <div className="i-label mb-2">People</div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="i-readout text-[15px]"
                    style={{ color: capOverridden ? "var(--i-violet)" : "var(--i-text)" }}
                  >
                    {formatCapacity(capValue)} FTE
                  </span>
                  <span className="text-[10px] text-[var(--i-text-faint)]">
                    {m.data.contextSwitchCostPct}% switch
                  </span>
                  {capOverridden && (
                    <span className="rounded-full px-1.5 py-px text-[8px] font-semibold uppercase" style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}>
                      scenario
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
                  {capOverridden
                    ? `Reality ${formatCapacity(scope.teamCapacity)} · Portfolio owns this`
                    : "Inherited from Portfolio"}
                </div>
                <Link
                  href="/portfolio"
                  className="mt-1 block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                >
                  Open Portfolio →
                </Link>
              </div>

              <div className="flex-1" />
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={() => setTool({ kind: "forecast" })}
                  data-shoot="open-detail"
                  className="rounded-md px-3 py-2 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] transition-colors"
                  style={{ border: "1px solid var(--i-border-strong)" }}
                >
                  Forecast detail
                </button>
                <button
                  onClick={() => setTool({ kind: "context" })}
                  data-shoot="open-context"
                  className="px-3 py-1.5 text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                >
                  What the model knows →
                </button>
              </div>
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
        open={tool?.kind === "forecast"}
        onClose={() => setTool(null)}
        scope={scope}
        scopeNameById={scopeNameById}
        result={res}
        reality={base}
        startDate={m.startDate}
        targetDay={targetDay}
        confidence={confidence}
        scenario={m.scenario}
        scenarioActive={m.active}
        contextSwitchCostPct={m.data.contextSwitchCostPct}
        momentum={trend}
      />

      {tool?.kind === "gate" && (
        <GateDetail
          gate={scope.gates.find((g) => g.id === tool.id) ?? null}
          resolved={m.scenario.resolvedGateIds.has(tool.id)}
          onToggle={() =>
            m.setScenario((prev) => {
              const n = new Set(prev.resolvedGateIds);
              if (n.has(tool.id)) n.delete(tool.id);
              else n.add(tool.id);
              return { ...prev, resolvedGateIds: n };
            })
          }
          onClose={() => setTool(null)}
        />
      )}

      <TargetDetail
        open={tool?.kind === "target"}
        onClose={() => setTool(null)}
        scope={scope}
        result={res}
        startDate={m.startDate}
        savedTargetDay={savedTargetDay}
        targetDay={targetDay}
        onSetOverride={setOverride}
        onClearOverride={clearOverride}
      />

      <ContextDetail
        open={tool?.kind === "context"}
        onClose={() => setTool(null)}
        scope={scope}
        sources={m.data.sources}
        reportCount={m.data.reports.filter((r) => r.scopeId === scope.scopeId).length}
      />

      {base && (
        <RealityDetail
          open={tool?.kind === "reality"}
          onClose={() => setTool(null)}
          scopeName={scope.name}
          reality={base}
          scenario={res}
          scenarioActive={m.active}
          startDate={m.startDate}
        />
      )}
    </InstrumentShell>
  );
}
