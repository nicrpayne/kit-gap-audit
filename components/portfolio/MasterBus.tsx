"use client";

// THE MASTER STRIP -- the last channel on the rack, and the physical truth
// of the instrument.
//
// It is built from the same chassis as a project channel: same top rule,
// same engraved label rhythm, same recessed meters, same bottom rail. It is
// wider, because it carries the sum of everything, but it is not a settings
// panel that happens to sit next to a mixer -- it is part of the mixer, and
// it should be impossible to mistake for the project inspector on the far
// right, which explains one project rather than owning the workforce.
//
// Everything left of here redistributes. Only this strip changes how much
// human capacity exists, under one honest name: Workforce.

import { useState } from "react";
import RotaryKnob from "./RotaryKnob";
import { RACK_H } from "./MixerChannel";
import type { MasterReading } from "@/lib/capacity/workforce";

interface Props {
  reading: MasterReading;
  contextSwitchCostPct: number;
  onContextSwitch: (pct: number) => void;
  onWorkforce: (fte: number) => void;
  reductionRequired: number;
  /** How much of the workforce is inherited assumption rather than someone
      actually named -- see scripts/migrate-embodied-capacity.ts. */
  inheritedFte: number;
  onExplainSwitchCost: () => void;
}

// Meters are CUT IN to the chassis, like a recessed VU window.
function Meter({
  label,
  value,
  suffix,
  fraction,
  color,
  shoot,
  detail,
}: {
  label: string;
  value: string;
  suffix?: string;
  fraction: number;
  color: string;
  shoot?: string;
  detail?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">{label}</span>
        <span className="i-readout text-[13px] leading-none" style={{ color }} data-shoot={shoot}>
          {value}
          {suffix && <span className="text-[8px] ml-0.5 text-[var(--i-text-faint)]">{suffix}</span>}
        </span>
      </div>
      <div
        className="mt-1 h-[4px] rounded-full overflow-hidden"
        style={{ background: "var(--i-recess)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
            background: color,
            transition: "width 260ms cubic-bezier(0.22,0.61,0.36,1), background 200ms ease",
          }}
        />
      </div>
      {detail && <div className="mt-1 text-[8.5px] leading-tight text-[var(--i-text-faint)]">{detail}</div>}
    </div>
  );
}

export default function MasterBus({
  reading,
  contextSwitchCostPct,
  onContextSwitch,
  onWorkforce,
  reductionRequired,
  inheritedFte,
  onExplainSwitchCost,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(reading.workforce));

  const deficit = reading.required > 1e-6;
  const shortfall = reductionRequired > 1e-6;
  const alarm = deficit || shortfall;

  return (
    <aside
      data-shoot="master-bus"
      className="shrink-0 flex flex-col rounded-md"
      style={{
        width: 208,
        minHeight: RACK_H,
        alignSelf: "stretch",
        background: "linear-gradient(180deg, #1a2025 0%, #101417 100%)",
        border: `1px solid ${alarm ? "var(--i-red)" : "var(--i-border-strong)"}`,
        boxShadow: alarm
          ? "0 0 0 1px var(--i-red-soft), 0 0 28px var(--i-red-soft)"
          : "inset 0 1px 0 rgba(243,240,230,0.05), 0 6px 18px rgba(0,0,0,0.35)",
        transition: "border-color 260ms ease, box-shadow 260ms ease",
      }}
    >
      <div className="px-2.5 pt-2 pb-1.5">
        <span className="text-[9px] tabular-nums tracking-[0.12em] text-[var(--i-text-faint)]">M</span>
        <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--i-text)]">Master</div>
      </div>

      {/* WORKFORCE -- the only control that creates or removes humans */}
      <div className="px-2.5 pb-2" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Workforce</span>
          {!editing && (
            <button
              onClick={() => {
                setDraft(reading.workforce.toFixed(1));
                setEditing(true);
              }}
              data-shoot="edit-workforce"
              className="text-[8.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] underline underline-offset-2"
            >
              set actual
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5 flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft}
              autoFocus
              aria-label="Actual workforce in FTE"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onWorkforce(Number(draft));
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-14 rounded px-1.5 py-1 text-[11px] tabular-nums"
              style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            />
            <button
              onClick={() => {
                onWorkforce(Number(draft));
                setEditing(false);
              }}
              data-shoot="save-workforce"
              className="rounded px-1.5 py-1 text-[8.5px] font-medium"
              style={{ background: "var(--i-text)", color: "var(--i-void)" }}
            >
              Set
            </button>
            <button onClick={() => setEditing(false)} className="text-[8.5px] text-[var(--i-text-faint)]">
              Esc
            </button>
          </div>
        ) : (
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="i-readout text-[22px] leading-none" data-shoot="master-workforce">
              {reading.workforce.toFixed(1)}
            </span>
            <span className="text-[9px] text-[var(--i-text-faint)]">FTE</span>
          </div>
        )}
        {/* RECONCILIATION. The migration preserved old per-project numbers
            rather than guessing who was shared, so some of this workforce is
            inherited assumption. Said plainly, with the control to correct it
            right above. */}
        {inheritedFte > 1e-6 && !editing && (
          <div className="mt-1 text-[8.5px] leading-tight" style={{ color: "var(--i-amber)" }} data-shoot="inherited">
            {inheritedFte.toFixed(1)} inherited from legacy project capacity
          </div>
        )}
      </div>

      <div className="px-2.5 py-2 space-y-2.5 flex-1">
        <Meter
          label="Free"
          value={reading.free.toFixed(1)}
          suffix="FTE"
          fraction={reading.workforce > 0 ? reading.free / reading.workforce : 0}
          color={reading.free > 1e-6 ? "var(--i-mint)" : "var(--i-text-faint)"}
          shoot="master-free"
        />
        <Meter
          label="Allocated"
          value={`${reading.allocated.toFixed(1)}/${reading.workforce.toFixed(1)}`}
          fraction={reading.workforce > 0 ? reading.allocated / reading.workforce : 0}
          color={deficit ? "var(--i-red)" : "var(--i-violet)"}
          shoot="master-allocated"
        />
        <Meter
          label="Effective"
          value={reading.effective.toFixed(2)}
          suffix="FTE"
          fraction={reading.workforce > 0 ? reading.effective / reading.workforce : 0}
          color="var(--i-amber)"
          shoot="master-effective"
          detail={
            reading.allocated - reading.effective > 1e-6
              ? `−${(reading.allocated - reading.effective).toFixed(2)} to switching`
              : undefined
          }
        />

        {/* OVER / UNDER -- balanced, or a named deficit. Never disguised. */}
        <div
          className="rounded px-2 py-1.5"
          style={{
            background: alarm ? "var(--i-red-soft)" : "var(--i-recess)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
            transition: "background 260ms ease",
          }}
        >
          <div className="text-[8px] uppercase tracking-[0.14em]" style={{ color: alarm ? "var(--i-red)" : "var(--i-text-faint)" }}>
            {deficit ? "Required" : shortfall ? "Rebalance" : "Over / under"}
          </div>
          <div
            className="mt-0.5 i-readout text-[14px] leading-none"
            data-shoot="master-overunder"
            style={{ color: alarm ? "var(--i-red)" : "var(--i-text-soft)" }}
          >
            {deficit
              ? `+${reading.required.toFixed(1)}`
              : shortfall
                ? `${reductionRequired.toFixed(1)}`
                : `— ${Math.abs(reading.overUnder).toFixed(1)}`}
            <span className="text-[8px] ml-0.5 text-[var(--i-text-faint)]">FTE</span>
          </div>
        </div>
      </div>

      {/* ONE global switching assumption, on the Master, as a real knob */}
      <div className="px-2.5 py-2 flex items-center gap-2.5" style={{ borderTop: "1px solid var(--i-border)" }}>
        <RotaryKnob
          value={contextSwitchCostPct}
          min={0}
          max={50}
          step={1}
          size={50}
          label="Context switch cost percent"
          display={`${contextSwitchCostPct}%`}
          shoot="switch-knob"
          onChange={(v) => onContextSwitch(Math.round(v))}
        />
        <div className="min-w-0">
          <div className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Context switch</div>
          <p className="mt-1 text-[8.5px] leading-tight text-[var(--i-text-faint)]">
            Per extra project a person is split across. Moves effectiveness, never headcount.
          </p>
          <button
            onClick={onExplainSwitchCost}
            className="mt-1 text-[8.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] underline underline-offset-2"
          >
            what it affects
          </button>
        </div>
      </div>
    </aside>
  );
}
