"use client";

// THE MASTER BUS -- the physical truth of the instrument, pinned right.
//
// Everything left of here redistributes. Only this panel changes how much
// human capacity exists, and it does so under one honest name: Workforce.
// Raising it means hiring; lowering it means somebody leaves.
//
// Its job in a planning conversation is to be the thing nobody can argue
// with. When a scenario asks for more people than the portfolio contains,
// this is where that shows up -- named, quantified, and impossible to
// mistake for a normal state.

import { useState } from "react";
import type { MasterReading } from "@/lib/capacity/workforce";

interface Props {
  reading: MasterReading;
  contextSwitchCostPct: number;
  onContextSwitch: (pct: number) => void;
  onWorkforce: (fte: number) => void;
  /** Workforce that must be released from projects before the pool can
      shrink to what was asked for. */
  reductionRequired: number;
  /** How much of the workforce is inherited assumption rather than someone
      actually named -- see scripts/migrate-embodied-capacity.ts. */
  inheritedFte: number;
  onExplainSwitchCost: () => void;
}

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
      <div className="i-label">{label}</div>
      <div
        className="mt-1.5 h-[5px] rounded-full overflow-hidden"
        style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
            background: color,
            transition: "width 240ms cubic-bezier(0.22,0.61,0.36,1), background 200ms ease",
          }}
        />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="i-readout text-[15px] leading-none" style={{ color }} data-shoot={shoot}>
          {value}
        </span>
        {suffix && <span className="text-[9px] text-[var(--i-text-faint)]">{suffix}</span>}
      </div>
      {detail && <div className="mt-0.5 text-[9.5px] text-[var(--i-text-faint)]">{detail}</div>}
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
  // The bus wakes when the portfolio is asking for people it does not have.
  const alarm = deficit || shortfall;

  return (
    <aside
      data-shoot="master-bus"
      className="shrink-0 flex flex-col rounded-lg"
      style={{
        width: 224,
        background: "var(--i-panel)",
        border: `1px solid ${alarm ? "var(--i-red)" : "var(--i-border-strong)"}`,
        boxShadow: alarm ? "0 0 0 1px var(--i-red-soft), 0 0 24px var(--i-red-soft)" : undefined,
        transition: "border-color 240ms ease, box-shadow 240ms ease",
      }}
    >
      <div className="px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="i-label">Master · people</div>
      </div>

      <div className="px-3.5 py-2.5 space-y-2.5">
        {/* WORKFORCE -- the only control that changes how many humans exist */}
        <div>
          <div className="flex items-center justify-between">
            <span className="i-label">Workforce</span>
            {!editing && (
              <button
                onClick={() => {
                  setDraft(reading.workforce.toFixed(1));
                  setEditing(true);
                }}
                data-shoot="edit-workforce"
                className="rounded px-1.5 py-0.5 text-[9.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Edit total
              </button>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={1}
                value={draft}
                autoFocus
                aria-label="Total workforce in FTE"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onWorkforce(Number(draft));
                    setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-16 rounded px-1.5 py-1 text-[12px] tabular-nums"
                style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              />
              <button
                onClick={() => {
                  onWorkforce(Number(draft));
                  setEditing(false);
                }}
                data-shoot="save-workforce"
                className="rounded px-2 py-1 text-[9.5px] font-medium"
                style={{ background: "var(--i-text)", color: "var(--i-void)" }}
              >
                Set
              </button>
              <button onClick={() => setEditing(false)} className="text-[9.5px] text-[var(--i-text-faint)]">
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-1">
              <span className="i-readout text-[21px] leading-none" data-shoot="master-workforce">
                {reading.workforce.toFixed(1)}
              </span>
              <span className="text-[10px] text-[var(--i-text-faint)]">FTE</span>
            </div>
          )}
          {inheritedFte > 1e-6 && !editing && (
            <div className="mt-1 text-[9.5px] leading-snug text-[var(--i-text-faint)]">
              {inheritedFte.toFixed(1)} of these came from old per-project numbers, not people you named.
            </div>
          )}
        </div>

        <Meter
          label="Free capacity"
          value={reading.free.toFixed(1)}
          suffix="FTE"
          fraction={reading.workforce > 0 ? reading.free / reading.workforce : 0}
          color={reading.free > 1e-6 ? "var(--i-mint)" : "var(--i-text-faint)"}
          shoot="master-free"
        />

        <Meter
          label="Allocated"
          value={`${reading.allocated.toFixed(1)} / ${reading.workforce.toFixed(1)}`}
          suffix="FTE"
          fraction={reading.workforce > 0 ? reading.allocated / reading.workforce : 0}
          color={deficit ? "var(--i-red)" : "var(--i-violet)"}
          shoot="master-allocated"
        />

        <Meter
          label="Effective capacity"
          value={reading.effective.toFixed(2)}
          suffix="FTE"
          fraction={reading.workforce > 0 ? reading.effective / reading.workforce : 0}
          color="var(--i-amber)"
          shoot="master-effective"
          detail={
            reading.allocated - reading.effective > 1e-6
              ? `${(reading.allocated - reading.effective).toFixed(2)} FTE lost to switching`
              : "no switching loss"
          }
        />

        {/* OVER / UNDER -- balanced, or a named deficit. Never disguised. */}
        <div
          className="rounded-md px-2.5 py-2"
          style={{
            background: alarm ? "var(--i-red-soft)" : "var(--i-panel-raised)",
            border: `1px solid ${alarm ? "rgba(239,107,91,0.4)" : "var(--i-border)"}`,
            transition: "background 240ms ease, border-color 240ms ease",
          }}
        >
          <div className="i-label" style={{ color: alarm ? "var(--i-red)" : undefined }}>
            {deficit ? "Required" : shortfall ? "Must release first" : "Over / under"}
          </div>
          <div
            className="mt-1 i-readout text-[15px] leading-none"
            data-shoot="master-overunder"
            style={{ color: alarm ? "var(--i-red)" : "var(--i-text-soft)" }}
          >
            {deficit
              ? `+${reading.required.toFixed(1)} FTE`
              : shortfall
                ? `${reductionRequired.toFixed(1)} FTE`
                : `— ${Math.abs(reading.overUnder).toFixed(1)} FTE`}
          </div>
          <div className="mt-1 text-[9.5px] leading-snug" style={{ color: alarm ? "var(--i-red)" : "var(--i-text-faint)" }}>
            {deficit
              ? `${reading.required.toFixed(1)} more ${reading.required <= 1 ? "person" : "people"} than the portfolio has. Take it from another project, split someone, or hire.`
              : shortfall
                ? "Bring project allocation down before the workforce can shrink — nobody allocated can just vanish."
                : "Balanced. Every allocated FTE is a person who exists."}
          </div>
        </div>

        {/* ONE global switching assumption, for the whole portfolio */}
        <div style={{ borderTop: "1px solid var(--i-border)" }} className="pt-3">
          <div className="flex items-center justify-between">
            <span className="i-label">Context switch</span>
            <button
              onClick={onExplainSwitchCost}
              className="text-[9.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] underline underline-offset-2"
            >
              what it affects
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="i-readout text-[17px] leading-none" data-shoot="master-switch">
              {contextSwitchCostPct}%
            </span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={contextSwitchCostPct}
              aria-label="Context switch cost percent"
              data-shoot="switch-knob"
              onChange={(e) => onContextSwitch(Number(e.target.value))}
              className="flex-1 accent-[var(--i-violet)]"
            />
          </div>
          <div className="mt-1.5 text-[9.5px] leading-snug text-[var(--i-text-faint)]">
            Cost per extra project a person is split across. Changes effectiveness, never headcount.
          </div>
        </div>
      </div>
    </aside>
  );
}
