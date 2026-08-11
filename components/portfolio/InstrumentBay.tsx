"use client";

// THE INSTRUMENT BAY. Two halves that must never look alike:
//
//   CONTROLS (left, raised)  -- every one of these writes a variable the
//                               simulation reads on the next frame. There
//                               are exactly as many faders here as there
//                               are real levers in the model; when a lever
//                               does not exist yet, no fader is drawn for
//                               it.
//   READOUTS (right, recessed) -- consequences. Momentum, confidence,
//                               spread and gates are computed from the run
//                               and cannot be set. None of them has a cap,
//                               a handle, or a grab cursor.
//
// The two levers that exist today are capacity (per Scope, via anonymous
// scenario FTE) and context-switch cost (portfolio-wide). Target date is a
// real lever too, but it belongs on the timeline where the date lives --
// it is scrubbed directly on the Forecast Field, not abstracted into a
// knob over here.

import Fader from "@/components/instrument/Fader";
import { Meter, ArcMeter, TrendSpark } from "@/components/instrument/Meter";
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

interface InstrumentBayProps {
  scopeName: string;
  // --- real controls ---
  realityCapacity: number;
  scenarioCapacity: number;
  onCapacityChange: (fte: number) => void;
  capacityDisabled: boolean;
  switchCostPct: number;
  savedSwitchCostPct: number;
  onSwitchCostChange: (pct: number) => void;
  // --- derived readouts ---
  trend: MomentumTrend | null;
  trendSeries: number[];
  confidencePct: number | null;
  targetLabel: string;
  spreadDays: number | null;
  /** The actual P10 and P90 dates behind the spread number. */
  spreadRange: { earliest: string; latest: string } | null;
  gates: BayGate[];
  /** When the report Momentum is measured against was generated. */
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
  scenarioCapacity,
  onCapacityChange,
  capacityDisabled,
  switchCostPct,
  savedSwitchCostPct,
  onSwitchCostChange,
  trend,
  trendSeries,
  confidencePct,
  targetLabel,
  spreadDays,
  spreadRange,
  gates,
  sinceLabel,
  onInspectMomentum,
}: InstrumentBayProps) {
  const gateDays = gates.reduce((sum, g) => sum + g.likely, 0);

  return (
    // overflow-x-auto: on a narrow screen the bay scrolls sideways rather
    // than crushing the faders below a usable throw -- a control you can't
    // hit accurately is worse than one you have to scroll to.
    <div
      className="shrink-0 flex items-stretch gap-3 px-4 py-3 overflow-x-auto"
      style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
    >
      {/* ---------------- CONTROLS ---------------- */}
      <div className="i-control flex items-stretch gap-2 px-3.5 py-3">
        <div className="flex flex-col pr-3.5 mr-0.5 w-[112px]" style={{ borderRight: "1px solid var(--i-border)" }}>
          <div className="i-label" style={{ color: "var(--i-violet)" }}>
            Controls
          </div>
          <div className="mt-1.5 text-[12px] text-[var(--i-text)] font-medium leading-tight truncate">{scopeName}</div>
          <div className="mt-auto text-[9.5px] text-[var(--i-text-faint)] leading-snug">
            Drag or arrow-key. Shift = fine. Double-click resets.
          </div>
        </div>

        <Fader
          label="Capacity"
          value={scenarioCapacity}
          min={0}
          max={Math.max(8, Math.ceil(realityCapacity) + 6)}
          step={0.5}
          fineStep={0.1}
          resetValue={realityCapacity}
          onChange={onCapacityChange}
          format={(v) => `${v.toFixed(1)}`}
          formatAria={(v) => `${v.toFixed(1)} FTE, reality ${realityCapacity.toFixed(1)}`}
          disabled={capacityDisabled}
          sub={`FTE · reality ${realityCapacity.toFixed(1)}`}
          dataShoot="capacity-fader"
        />

        <Fader
          label={"Switch cost"}
          value={switchCostPct}
          min={0}
          max={100}
          step={5}
          fineStep={1}
          resetValue={savedSwitchCostPct}
          onChange={onSwitchCostChange}
          format={(v) => `${Math.round(v)}%`}
          formatAria={(v) => `${Math.round(v)} percent capacity lost per extra scope`}
          sub="lost per extra scope"
          height={82}
          dataShoot="switch-fader"
        />
      </div>

      {/* ---------------- READOUTS ---------------- */}
      <div className="flex-1 min-w-0 flex items-stretch gap-3">
        {/* Momentum: direction first, the factual delta second, the record
            third. No score -- see lib/momentum/trend.ts. */}
        <Meter label="Momentum" width={230} onClick={onInspectMomentum} dataShoot="momentum">
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
                <TrendSpark points={trendSeries} tone={directionTone(trend.direction)} invert width={86} height={30} />
              </div>
              <div className="mt-2 text-[10.5px] text-[var(--i-text-soft)] leading-tight">{trendPhrase(trend)}</div>
              {sinceLabel && <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">since {sinceLabel}</div>}
            </>
          ) : (
            <div className="text-[11px] text-[var(--i-text-faint)]">No prior report to compare against.</div>
          )}
        </Meter>

        <Meter label="Confidence" width={196}>
          <ArcMeter pct={confidencePct} tone={confidenceTone(confidencePct)} caption={targetLabel} />
        </Meter>

        <Meter label="Spread" width={168}>
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

        <Meter label="Open gates" width={210}>
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
            {gates.length > 2 && (
              <li className="text-[10px] text-[var(--i-text-faint)]">+{gates.length - 2} more</li>
            )}
          </ul>
        </Meter>
      </div>
    </div>
  );
}
