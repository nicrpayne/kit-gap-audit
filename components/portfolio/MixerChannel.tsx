"use client";

// ONE PROJECT CHANNEL.
//
// A channel is a place where human capacity is pointed at work. Its fader
// sets RAW physical allocation -- how many people-worth of human being are
// on this -- and the two numbers beneath it say what that is worth after
// the portfolio's context-switching assumption.
//
// Raw and effective are deliberately shown together, always, even when they
// are equal. The gap between them is the only honest way to see that a
// channel holding "four people" is delivering less than four, and a reading
// that only appeared once it went wrong would be a reading nobody trusts.
//
// There is NO context-switch knob here. Switching cost is a portfolio-wide
// assumption about how humans work, not a per-project setting -- it lives
// once, on the Master.

import { useMemo } from "react";

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
  /** Sorted completion-day samples, for the channel's own small outcome trace. */
  completionDays: number[];
}

interface Props {
  index: number;
  view: ChannelView;
  faderMax: number;
  selected: boolean;
  onSelect: () => void;
  onFader: (raw: number) => void;
  onOpenSplits: () => void;
}

// The channel's own miniature of the distribution above it -- the same
// samples the swim lane draws, at a glance-scale. Not decoration: it is how
// you see a channel go from confident to uncertain as you drain it.
function Trace({ days, accent }: { days: number[]; accent: string }) {
  const path = useMemo(() => {
    if (days.length < 8) return null;
    const lo = days[0];
    const hi = days[days.length - 1];
    const span = Math.max(1, hi - lo);
    const BINS = 26;
    const bins = new Array(BINS).fill(0);
    for (const d of days) bins[Math.min(BINS - 1, Math.floor(((d - lo) / span) * BINS))]++;
    const peak = Math.max(...bins, 1);
    return bins
      .map((b, i) => `${(i / (BINS - 1)) * 100},${28 - (b / peak) * 24}`)
      .reduce((acc, pt, i) => (i === 0 ? `M${pt}` : `${acc} L${pt}`), "");
  }, [days]);

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-[30px]" aria-hidden>
      {path && (
        <>
          <path d={`${path} L100,30 L0,30 Z`} fill={accent} opacity="0.10" />
          <path d={path} fill="none" stroke={accent} strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity="0.85" />
        </>
      )}
    </svg>
  );
}

export default function MixerChannel({ index, view, faderMax, selected, onSelect, onFader, onOpenSplits }: Props) {
  const { raw, effective, splitRaw, splitPeople, required, changed, accent } = view;
  const friction = raw - effective;

  return (
    <div
      data-shoot={`channel-${view.scopeId}`}
      onClick={onSelect}
      className="shrink-0 flex flex-col rounded-lg transition-colors duration-200"
      style={{
        width: 188,
        background: "var(--i-panel)",
        border: `1px solid ${selected ? "var(--i-border-strong)" : "var(--i-border)"}`,
        boxShadow: selected ? "inset 0 0 0 1px rgba(243,240,230,0.04)" : undefined,
      }}
    >
      {/* identity */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] tabular-nums text-[var(--i-text-faint)]">{index}</span>
          {changed && (
            <span
              data-shoot="channel-changed"
              className="rounded-sm px-1 py-[1px] text-[8px] uppercase tracking-[0.1em] font-semibold"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              changed
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ background: accent }} aria-hidden />
          <span className="text-[11.5px] truncate text-[var(--i-text)]">{view.name}</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span
            data-shoot="channel-date"
            className="i-readout text-[20px] leading-none"
            style={{ color: changed ? "var(--i-violet)" : "var(--i-text)" }}
          >
            {view.likelyDate}
          </span>
          {changed && view.deltaDays !== 0 && (
            <span
              className="text-[10px] font-medium"
              style={{ color: view.deltaDays < 0 ? "var(--i-mint)" : "var(--i-red)" }}
            >
              {view.deltaDays < 0 ? "▲" : "▼"}
              {Math.abs(view.deltaDays)}d
            </span>
          )}
        </div>
      </div>

      <div className="px-3">
        <Trace days={view.completionDays} accent={accent} />
      </div>

      {/* RAW vs EFFECTIVE -- the channel's whole lesson, side by side */}
      <div className="px-3 pt-1.5 pb-2.5 flex items-start justify-between gap-2">
        <div>
          <div className="i-readout text-[14px] leading-none" data-shoot="channel-raw">
            {raw.toFixed(1)}
            <span className="text-[9px] ml-0.5 text-[var(--i-text-faint)]">FTE</span>
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">allocated</div>
        </div>
        <div className="text-right">
          <div
            className="i-readout text-[14px] leading-none"
            data-shoot="channel-effective"
            style={{ color: friction > 1e-6 ? "var(--i-amber)" : "var(--i-text)" }}
          >
            {effective.toFixed(2)}
            <span className="text-[9px] ml-0.5 text-[var(--i-text-faint)]">FTE</span>
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">effective</div>
        </div>
      </div>

      {/* the fader */}
      <div className="flex-1 px-3 pb-2 flex items-stretch justify-center gap-2.5" style={{ minHeight: 150 }}>
        <div className="flex flex-col justify-between py-0.5 text-[8.5px] tabular-nums text-[var(--i-text-faint)]">
          <span>{faderMax}</span>
          <span>{Math.round(faderMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex items-center" style={{ width: 34 }}>
          {/* the slot is CUT IN; the filled column reads as material rising */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{ width: 7, top: 2, bottom: 2, background: "var(--i-recess)", border: "1px solid var(--i-border)" }}
            aria-hidden
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              width: 7,
              bottom: 2,
              height: `calc(${Math.min(100, (raw / faderMax) * 100)}% - 4px)`,
              background: changed ? "var(--i-violet)" : accent,
              opacity: changed ? 0.9 : 0.55,
              transition: "height 220ms cubic-bezier(0.22,0.61,0.36,1), background 220ms ease",
              boxShadow: changed ? "0 0 12px var(--i-violet-soft)" : undefined,
            }}
            aria-hidden
          />
          {required > 1e-6 && (
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                width: 7,
                bottom: `calc(${Math.min(100, ((raw - required) / faderMax) * 100)}%)`,
                height: `${Math.min(100, (required / faderMax) * 100)}%`,
                background: "repeating-linear-gradient(45deg, var(--i-red) 0 3px, transparent 3px 6px)",
                opacity: 0.9,
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

      {/* split exposure */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenSplits();
        }}
        data-shoot={`splits-${view.scopeId}`}
        disabled={splitPeople === 0}
        className="px-3 py-2 text-left text-[9.5px] transition-colors disabled:cursor-default"
        style={{ borderTop: "1px solid var(--i-border)", color: splitPeople > 0 ? "var(--i-amber)" : "var(--i-text-faint)" }}
      >
        {splitPeople === 0 ? (
          "No splits"
        ) : (
          <>
            {splitPeople} {splitPeople === 1 ? "person" : "people"} split · {splitRaw.toFixed(1)} FTE
          </>
        )}
      </button>
    </div>
  );
}
