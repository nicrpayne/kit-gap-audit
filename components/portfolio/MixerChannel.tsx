"use client";

// ONE CHANNEL STRIP.
//
// A fixed-width piece of equipment, not a card that grows to fill a page.
// Strips are the same width whether there are two projects or six, because
// a mixer's geometry is a property of the mixer, not of how much work
// happens to be in it -- and because a fader you have learned the throw of
// must not change size when a project is added.
//
// A channel sets RAW physical allocation. The two readouts beneath say what
// that is worth after the portfolio's switching assumption. Both are always
// shown: the gap between them IS the friction, and a reading that only
// appears once it has gone wrong is a reading nobody trusts.
//
// There is no context-switch knob here. Switching cost is one assumption
// about how humans work, and it lives once, on the Master.

import { useMemo } from "react";

export const CHANNEL_W = 148;
export const RACK_H = 292;

export interface ChannelView {
  scopeId: string;
  name: string;
  accent: string;
  likelyDate: string;
  deltaDays: number;
  raw: number;
  effective: number;
  splitRaw: number;
  splitPeople: number;
  required: number;
  changed: boolean;
  gateCount: number;
  completionDays: number[];
}

interface Props {
  index: number;
  view: ChannelView;
  faderMax: number;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onFader: (raw: number) => void;
  onOpenSplits: () => void;
  onOpenGates: () => void;
}

const num = (n: number) => String(n).padStart(2, "0");

// The channel's own miniature of the distribution above it -- the same
// samples the swim lane draws. Not decoration: it is how a channel visibly
// goes from confident to uncertain as you drain it.
function Trace({ days, accent, alive }: { days: number[]; accent: string; alive: boolean }) {
  const path = useMemo(() => {
    if (days.length < 8) return null;
    const lo = days[0];
    const hi = days[days.length - 1];
    const span = Math.max(1, hi - lo);
    const BINS = 22;
    const bins = new Array(BINS).fill(0);
    for (const d of days) bins[Math.min(BINS - 1, Math.floor(((d - lo) / span) * BINS))]++;
    const peak = Math.max(...bins, 1);
    return bins
      .map((b, i) => `${(i / (BINS - 1)) * 100},${20 - (b / peak) * 17}`)
      .reduce((acc, pt, i) => (i === 0 ? `M${pt}` : `${acc} L${pt}`), "");
  }, [days]);

  return (
    <svg viewBox="0 0 100 21" preserveAspectRatio="none" className="w-full h-[21px]" aria-hidden>
      {path && (
        <>
          <path d={`${path} L100,21 L0,21 Z`} fill={accent} opacity={alive ? 0.13 : 0.07} />
          <path d={path} fill="none" stroke={accent} strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity={alive ? 0.9 : 0.5} />
        </>
      )}
    </svg>
  );
}

export default function MixerChannel({
  index,
  view,
  faderMax,
  selected,
  hovered,
  dimmed,
  onSelect,
  onHover,
  onFader,
  onOpenSplits,
  onOpenGates,
}: Props) {
  const { raw, effective, splitRaw, splitPeople, required, changed, accent } = view;
  const friction = raw - effective;
  const alive = hovered || selected;

  return (
    <div
      data-shoot={`channel-${view.scopeId}`}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="shrink-0 flex flex-col rounded-md"
      style={{
        width: CHANNEL_W,
        background: "linear-gradient(180deg, var(--i-panel) 0%, #131719 100%)",
        border: `1px solid ${alive ? "var(--i-border-strong)" : "var(--i-border)"}`,
        // Selection lifts the strip out of the rack; dimming recedes the
        // ones you are not touching, so the pair in a transfer reads as a pair.
        boxShadow: alive ? "0 0 0 1px rgba(243,240,230,0.05), 0 6px 18px rgba(0,0,0,0.4)" : "inset 0 1px 0 rgba(243,240,230,0.03)",
        opacity: dimmed ? 0.42 : 1,
        transform: alive ? "translateY(-1px)" : "none",
        transition: "opacity 200ms ease, box-shadow 220ms ease, border-color 220ms ease, transform 220ms cubic-bezier(0.22,0.61,0.36,1)",
      }}
    >
      {/* engraved channel number + identity */}
      <div className="px-2.5 pt-2 pb-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] tabular-nums tracking-[0.12em] text-[var(--i-text-faint)]">{num(index)}</span>
          {changed && (
            <span
              data-shoot="channel-changed"
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: "var(--i-violet)", boxShadow: "0 0 6px var(--i-violet)" }}
              aria-label="changed"
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-[6px] w-[6px] rounded-full shrink-0" style={{ background: accent }} aria-hidden />
          <span className="text-[10.5px] uppercase tracking-[0.06em] truncate text-[var(--i-text)]">{view.name}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span
            data-shoot="channel-date"
            className="i-readout text-[16px] leading-none"
            style={{ color: changed ? "var(--i-violet)" : "var(--i-text)" }}
          >
            {view.likelyDate}
          </span>
          {changed && view.deltaDays !== 0 && (
            <span className="text-[9px] font-medium" style={{ color: view.deltaDays < 0 ? "var(--i-mint)" : "var(--i-red)" }}>
              {view.deltaDays < 0 ? "−" : "+"}
              {Math.abs(view.deltaDays)}d
            </span>
          )}
        </div>
      </div>

      <div className="px-2.5">
        <Trace days={view.completionDays} accent={accent} alive={alive} />
      </div>

      {/* RAW over EFFECTIVE -- stacked, so the strip stays narrow */}
      <div className="px-2.5 pt-1.5 pb-2" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">raw</span>
          <span className="i-readout text-[13px] leading-none" data-shoot="channel-raw">
            {raw.toFixed(1)}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[8px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">eff</span>
          <span
            className="i-readout text-[13px] leading-none"
            data-shoot="channel-effective"
            style={{ color: friction > 1e-6 ? "var(--i-amber)" : "var(--i-text-soft)" }}
          >
            {effective.toFixed(2)}
          </span>
        </div>
      </div>

      {/* THE FADER -- real travel, fixed slot */}
      <div className="flex-1 px-2.5 py-2.5 flex items-stretch justify-center gap-2">
        <div className="flex flex-col justify-between py-1 text-[7.5px] tabular-nums text-[var(--i-text-faint)]">
          <span>{faderMax}</span>
          <span>{Math.round(faderMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex items-center" style={{ width: 30 }}>
          {/* the slot is CUT IN to the chassis */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: 6,
              top: 2,
              bottom: 2,
              background: "var(--i-recess)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
              border: "1px solid rgba(0,0,0,0.5)",
            }}
            aria-hidden
          />
          {/* filled travel reads as material risen in the slot */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              width: 6,
              bottom: 2,
              height: `calc(${Math.min(100, (raw / faderMax) * 100)}% - 4px)`,
              background: changed ? "var(--i-violet)" : accent,
              opacity: changed ? 0.95 : alive ? 0.7 : 0.5,
              transition: "height 260ms cubic-bezier(0.22,0.61,0.36,1), opacity 200ms ease, background 200ms ease",
            }}
            aria-hidden
          />
          {required > 1e-6 && (
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                width: 6,
                bottom: `${Math.min(100, ((raw - required) / faderMax) * 100)}%`,
                height: `${Math.min(100, (required / faderMax) * 100)}%`,
                background: "repeating-linear-gradient(45deg, var(--i-red) 0 3px, transparent 3px 6px)",
                transition: "height 260ms cubic-bezier(0.22,0.61,0.36,1), bottom 260ms cubic-bezier(0.22,0.61,0.36,1)",
              }}
              aria-hidden
            />
          )}
          <input
            type="range"
            min={0}
            max={faderMax}
            step={0.1}
            value={Math.min(raw, faderMax)}
            aria-label={`${view.name} allocation in FTE`}
            data-shoot={`fader-${view.scopeId}`}
            onChange={(e) => onFader(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="mixer-fader"
          />
        </div>
      </div>

      {/* split exposure, and gates if this project has any */}
      <div style={{ borderTop: "1px solid var(--i-border)" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenSplits();
          }}
          data-shoot={`splits-${view.scopeId}`}
          disabled={splitPeople === 0}
          className="w-full px-2.5 py-1.5 text-left text-[8.5px] leading-tight disabled:cursor-default"
          style={{ color: splitPeople > 0 ? "var(--i-amber)" : "var(--i-text-faint)" }}
        >
          {splitPeople === 0 ? (
            "NO SPLITS"
          ) : (
            <>
              {splitPeople} {splitPeople === 1 ? "PERSON" : "PEOPLE"} SPLIT
              <span className="text-[var(--i-text-faint)]"> · {splitRaw.toFixed(1)} FTE</span>
            </>
          )}
        </button>
        {view.gateCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenGates();
            }}
            data-shoot={`gates-${view.scopeId}`}
            className="w-full px-2.5 pb-1.5 text-left text-[8.5px] text-[var(--i-text-faint)] hover:text-[var(--i-amber)]"
          >
            {view.gateCount} {view.gateCount === 1 ? "GATE" : "GATES"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── DORMANT STRIP ──────────────────────────────────────────────────────
//
// Powered-off hardware, not an empty card. The rack has a fixed number of
// physical positions; the ones nothing is patched into still exist, still
// have a number engraved on them, and still have a fader parked at zero.
// That is what makes the surface read as equipment rather than as a list
// that happens to be short today.
export function DormantChannel({ index, onPatch }: { index: number; onPatch?: () => void }) {
  return (
    <div
      data-shoot={`channel-dormant-${index}`}
      onClick={onPatch}
      className="group shrink-0 flex flex-col rounded-md"
      style={{
        width: CHANNEL_W,
        background: "linear-gradient(180deg, #0e1214 0%, #0b0e10 100%)",
        border: "1px solid #1b2126",
        boxShadow: "inset 0 1px 0 rgba(243,240,230,0.015)",
        cursor: onPatch ? "pointer" : "default",
      }}
    >
      <div className="px-2.5 pt-2 pb-1.5">
        <span className="text-[9px] tabular-nums tracking-[0.12em]" style={{ color: "#2c343a" }}>
          {num(index)}
        </span>
        <div className="mt-1 h-[6px]" aria-hidden />
        <div className="mt-1 h-[16px]" aria-hidden />
      </div>

      {/* engraved blanking plate: the machined lines a blank strip has */}
      <div className="px-2.5" aria-hidden>
        <svg viewBox="0 0 100 21" preserveAspectRatio="none" className="w-full h-[21px]">
          <line x1="0" y1="10.5" x2="100" y2="10.5" stroke="#161b1f" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="px-2.5 pt-1.5 pb-2" style={{ borderBottom: "1px solid #161b1f" }}>
        <div className="h-[13px]" />
        <div className="mt-1 h-[13px]" />
      </div>

      {/* the parked fader */}
      <div className="flex-1 px-2.5 py-2.5 flex items-stretch justify-center gap-2">
        <div className="w-[10px]" aria-hidden />
        <div className="relative flex items-center" style={{ width: 30 }} aria-hidden>
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{ width: 6, top: 2, bottom: 2, background: "#080a0c", border: "1px solid rgba(0,0,0,0.5)" }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-[2px]"
            style={{ width: 12, height: 22, bottom: 2, background: "#12171a", border: "1px solid #1b2126" }}
          />
        </div>
      </div>

      <div
        className="px-2.5 py-1.5 text-[8px] tracking-[0.16em] transition-colors"
        style={{ borderTop: "1px solid #161b1f", color: "#2c343a" }}
      >
        <span className="group-hover:hidden">UNPATCHED</span>
        {onPatch && <span className="hidden group-hover:inline text-[var(--i-text-soft)]">PATCH PROJECT</span>}
      </div>
    </div>
  );
}
