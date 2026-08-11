"use client";

// THE INSTRUMENT BAY. Three groups, and which group a thing is in is a
// claim about what it does:
//
//   SCENARIO · <scope>  (raised)  -- per-scope hypotheticals. Today: the
//                                    bidirectional aggregate Capacity fader.
//   PORTFOLIO MODEL     (raised)  -- assumptions that apply to the whole
//                                    portfolio, not to the selected scope.
//                                    Context-switch cost lives here because
//                                    that is what it actually is; sitting it
//                                    next to the Capacity fader implied
//                                    "JSA's switch cost is 55%", which the
//                                    model has never meant.
//   READOUTS            (recessed)-- consequences. No handles, no onChange.
//
// Reality is shown beside the Capacity fader but is deliberately NOT a
// control: it is what the system believes is true, it explains where it came
// from, and correcting it is a separate, secondary action ("Explain / edit")
// that opens the Inspector rather than something you can nudge by dragging.

import Fader from "@/components/instrument/Fader";
import Knob from "@/components/instrument/Knob";
import { Meter, ArcMeter, TrendSpark } from "@/components/instrument/Meter";
import { switchFactorFor } from "@/lib/capacity/resolve";
import { MIN_SIMULATED_CAPACITY, maxSimulatedCapacity } from "@/lib/capacity/limits";
import {
  DIRECTION_GLYPH,
  DIRECTION_LABEL,
  directionTone,
  trendPhrase,
  type MomentumTrend,
} from "@/lib/momentum/trend";

export interface BayGate {
  id: string;
  label: string;
  likely: number;
}

export type BayCapacitySource = "allocations" | "explicit" | "inferred";

const SOURCE_LABEL: Record<BayCapacitySource, string> = {
  allocations: "named people",
  explicit: "set by hand",
  inferred: "inferred from Linear",
};

interface InstrumentBayProps {
  scopeName: string;
  // --- scenario control ---
  realityCapacity: number;
  realitySource: BayCapacitySource;
  scenarioCapacity: number;
  onCapacityChange: (fte: number) => void;
  onExplainReality: () => void;
  // --- portfolio model ---
  switchCostPct: number;
  savedSwitchCostPct: number;
  onSwitchCostChange: (pct: number) => void;
  trackedScopeCount: number;
  splitPeopleCount: number;
  onExplainSwitchCost: () => void;
  // --- derived readouts ---
  trend: MomentumTrend | null;
  trendSeries: number[];
  confidencePct: number | null;
  targetLabel: string;
  hasTarget: boolean;
  onSetTarget: () => void;
  spreadDays: number | null;
  spreadRange: { earliest: string; latest: string } | null;
  gates: BayGate[];
  sinceLabel: string | null;
  onInspectMomentum: () => void;
}

function confidenceTone(pct: number | null): string {
  if (pct === null) return "var(--i-text-faint)";
  return pct >= 70 ? "var(--i-mint)" : pct >= 40 ? "var(--i-amber)" : "var(--i-red)";
}

export default function InstrumentBay({
  scopeName,
  realityCapacity,
  realitySource,
  scenarioCapacity,
  onCapacityChange,
  onExplainReality,
  switchCostPct,
  savedSwitchCostPct,
  onSwitchCostChange,
  trackedScopeCount,
  splitPeopleCount,
  onExplainSwitchCost,
  trend,
  trendSeries,
  confidencePct,
  targetLabel,
  hasTarget,
  onSetTarget,
  spreadDays,
  spreadRange,
  gates,
  sinceLabel,
  onInspectMomentum,
}: InstrumentBayProps) {
  const gateDays = gates.reduce((sum, g) => sum + g.likely, 0);
  const capacityDelta = scenarioCapacity - realityCapacity;
  const capacityChanged = Math.abs(capacityDelta) > 1e-6;

  return (
    <div
      className="shrink-0 flex items-stretch gap-3 px-4 py-3 overflow-x-auto"
      style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
    >
      {/* ---------------- SCENARIO (per scope) ---------------- */}
      <div className="i-control flex items-stretch gap-3 px-3.5 py-3 shrink-0">
        <div className="flex flex-col w-[136px]">
          <div className="i-label" style={{ color: "var(--i-violet)" }}>
            Scenario
          </div>
          <div className="mt-1.5 text-[12px] text-[var(--i-text)] font-medium leading-tight truncate">{scopeName}</div>

          {/* Reality: a statement, not a control. */}
          <div className="mt-3 pt-2.5" style={{ borderTop: "1px solid var(--i-border)" }}>
            <div className="i-label">Reality</div>
            <div className="i-readout mt-1 text-[16px] leading-none text-[var(--i-text)]">
              {realityCapacity.toFixed(1)} <span className="text-[10px] font-normal">FTE</span>
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-tight">
              {SOURCE_LABEL[realitySource]}
            </div>
            <button
              onClick={onExplainReality}
              data-shoot="explain-reality"
              className="mt-1.5 text-[10px] underline decoration-dotted underline-offset-2 text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
            >
              Explain / edit
            </button>
          </div>

          <div className="mt-auto pt-2 text-[9px] text-[var(--i-text-faint)] leading-snug">
            Drag or arrow-key. Shift = fine. Double-click resets to Reality.
          </div>
        </div>

        <Fader
          label="Capacity"
          value={scenarioCapacity}
          min={MIN_SIMULATED_CAPACITY}
          max={maxSimulatedCapacity(realityCapacity)}
          step={0.5}
          fineStep={0.1}
          resetValue={realityCapacity}
          onChange={onCapacityChange}
          format={(v) => `${v.toFixed(1)}`}
          formatAria={(v) =>
            `${v.toFixed(1)} FTE simulated, Reality is ${realityCapacity.toFixed(1)} FTE`
          }
          sub={
            capacityChanged
              ? `${capacityDelta > 0 ? "+" : "−"}${Math.abs(capacityDelta).toFixed(1)} FTE vs reality`
              : "same as reality"
          }
          subTone={capacityChanged ? "var(--i-violet)" : undefined}
          height={104}
          dataShoot="capacity-fader"
        />
      </div>

      {/* ---------------- PORTFOLIO MODEL (global) ---------------- */}
      <div className="i-control flex items-stretch gap-3 px-3.5 py-3 shrink-0">
        <Knob
          label="Context switch"
          value={switchCostPct}
          min={0}
          max={100}
          step={5}
          fineStep={1}
          resetValue={savedSwitchCostPct}
          onChange={onSwitchCostChange}
          format={(v) => `${Math.round(v)}%`}
          formatAria={(v) => `${Math.round(v)} percent lost per additional scope a person is split across`}
          dataShoot="switch-knob"
        />
        <div className="flex flex-col w-[132px]">
          <div className="i-label">Portfolio model</div>
          {/* The formula's own output, not a paraphrase of it. */}
          <table className="mt-2 text-[10px] tabular-nums" data-shoot="switch-table">
            <tbody>
              {[1, 2, 3].map((n) => (
                <tr key={n}>
                  <td className="pr-2 text-[var(--i-text-faint)] whitespace-nowrap">
                    {n} scope{n === 1 ? "" : "s"}
                  </td>
                  <td className="text-[var(--i-text-soft)]">
                    {Math.round(switchFactorFor(switchCostPct, n) * 100)}% effective
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-auto pt-2">
            <div className="text-[9px] text-[var(--i-text-faint)] leading-snug">
              {trackedScopeCount === 0
                ? "No scope is tracked by named people, so this currently changes nothing."
                : splitPeopleCount === 0
                  ? `Nobody is split across scopes, so this currently changes nothing.`
                  : `${splitPeopleCount} person${splitPeopleCount === 1 ? "" : "s"} split across scopes.`}
            </div>
            <button
              onClick={onExplainSwitchCost}
              data-shoot="explain-switch"
              className="mt-1 text-[10px] underline decoration-dotted underline-offset-2 text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
            >
              What does this affect?
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- READOUTS ---------------- */}
      <div className="flex-1 min-w-0 flex items-stretch gap-3">
        <Meter label="Momentum" width={206} onClick={onInspectMomentum} dataShoot="momentum">
          {trend ? (
            <>
              <div className="flex items-end justify-between gap-2 w-full">
                <div className="flex items-baseline gap-1.5">
                  <span className="i-readout text-[22px] leading-none" style={{ color: directionTone(trend.direction) }}>
                    {DIRECTION_GLYPH[trend.direction]}
                  </span>
                  <span
                    className="text-[15px] font-semibold leading-none uppercase tracking-wide"
                    style={{ color: directionTone(trend.direction) }}
                  >
                    {DIRECTION_LABEL[trend.direction]}
                  </span>
                </div>
                <TrendSpark points={trendSeries} tone={directionTone(trend.direction)} invert width={76} height={28} />
              </div>
              <div className="mt-2 text-[10.5px] text-[var(--i-text-soft)] leading-tight">{trendPhrase(trend)}</div>
              {sinceLabel && <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">since {sinceLabel}</div>}
            </>
          ) : (
            <div className="text-[10.5px] text-[var(--i-text-faint)] leading-snug">
              No prior report for this scope yet, so there is nothing to measure movement against.
            </div>
          )}
        </Meter>

        <Meter label="Confidence" width={182}>
          {hasTarget ? (
            <ArcMeter pct={confidencePct} tone={confidenceTone(confidencePct)} caption={targetLabel} />
          ) : (
            // Not a failure state -- there is simply nothing to be confident
            // *about* until a date exists to be measured against.
            <div className="w-full">
              <div className="i-readout text-[15px] leading-none text-[var(--i-text-faint)]">No target</div>
              <div className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)] leading-tight">
                Confidence needs a date to measure against.
              </div>
              <button
                onClick={onSetTarget}
                data-shoot="set-target"
                className="mt-2 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium"
                style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
              >
                Set target
              </button>
            </div>
          )}
        </Meter>

        <Meter label="Spread" width={158}>
          <div className="i-readout text-[24px] leading-none text-[var(--i-text)]">
            {spreadDays === null ? "—" : `${spreadDays}d`}
          </div>
          {spreadRange && (
            <div className="mt-2 i-readout text-[11px] text-[var(--i-text-soft)] leading-tight">
              {spreadRange.earliest} — {spreadRange.latest}
            </div>
          )}
          <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-tight">best to worst case</div>
        </Meter>

        <Meter label="Open gates" width={196}>
          <div className="flex items-baseline gap-2">
            <span
              className="i-readout text-[24px] leading-none"
              style={{ color: gates.length > 0 ? "var(--i-amber)" : "var(--i-text-soft)" }}
            >
              {gates.length}
            </span>
            {gates.length > 0 && (
              <span className="text-[11px] text-[var(--i-text-soft)]">+{Math.round(gateDays)}d modelled</span>
            )}
          </div>
          <ul className="mt-2 space-y-1 w-full">
            {gates.length === 0 && <li className="text-[10px] text-[var(--i-text-faint)]">Nothing blocking.</li>}
            {gates.slice(0, 2).map((g) => (
              <li key={g.id} className="flex items-baseline gap-1.5 text-[10px] leading-tight">
                <span className="shrink-0 text-[var(--i-amber)] tabular-nums">+{Math.round(g.likely)}d</span>
                <span className="truncate text-[var(--i-text-faint)]">{g.label}</span>
              </li>
            ))}
            {gates.length > 2 && <li className="text-[10px] text-[var(--i-text-faint)]">+{gates.length - 2} more</li>}
          </ul>
        </Meter>
      </div>
    </div>
  );
}
