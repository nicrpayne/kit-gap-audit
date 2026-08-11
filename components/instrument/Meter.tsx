"use client";

// Derived readouts. The counterpart to <Fader>, and the visual opposite of
// it on purpose: a Meter is CUT INTO the panel (inset shadow, no bevel, no
// cap, default cursor) because it reports what the model computed and there
// is nothing here to grab. Nothing in this file takes an onChange.
//
// The rule this enforces, from the build brief: if it looks grabbable it
// must do something -- so anything that does nothing must not look
// grabbable. Momentum, Confidence, Spread and Gates are all consequences of
// the simulation, never inputs to it.

import type { ReactNode } from "react";

export function Meter({
  label,
  children,
  width,
  dataShoot,
  onClick,
  selected,
}: {
  label: string;
  children: ReactNode;
  width?: number;
  dataShoot?: string;
  /** Optional: opens this readout's detail in the Inspector. Inspecting is
      not manipulating -- it never changes a model value. */
  onClick?: () => void;
  selected?: boolean;
}) {
  const inner = (
    <>
      <div className="i-label mb-2">{label}</div>
      <div className="w-full">{children}</div>
    </>
  );
  // flex-col/justify-start on both branches: a stretched <button> would
  // otherwise centre its content vertically (UA default), so the Momentum
  // readout would sit lower than every neighbouring meter's.
  // justify-between: the label is etched at the top of the recess and the
  // readout sits at the bottom, so a meter fills its height by design
  // rather than trailing off into dead panel.
  const style = { minWidth: width, borderColor: selected ? "var(--i-border-strong)" : undefined };
  const cls = "i-meter px-3 py-2.5 flex flex-col items-start justify-between text-left flex-1 min-w-0";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      data-shoot={dataShoot}
      aria-label={`${label} — show detail`}
      className={`${cls} hover:brightness-125 transition-[filter] duration-150 w-full`}
      style={style}
    >
      {inner}
    </button>
  ) : (
    <div className={cls} style={style} data-shoot={dataShoot}>
      {inner}
    </div>
  );
}

// Confidence against the target date, as a filled arc. Not a "gauge with a
// needle" -- there is no pointer to grab and no dial to turn; it is a
// proportion drawn as a proportion.
export function ArcMeter({
  pct,
  tone,
  caption,
  size = 58,
}: {
  pct: number | null;
  tone: string;
  caption: string;
  size?: number;
}) {
  const r = size / 2 - 5;
  const cx = size / 2;
  const cy = size / 2;
  // 240deg sweep, opening downward -- an incomplete ring reads as a scale
  // with ends, where a full circle reads as a pie chart of nothing.
  const START = 150;
  const SWEEP = 240;
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = toXY(fromDeg);
    const [x2, y2] = toXY(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const filled = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100;

  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} aria-hidden className="shrink-0">
        <path d={arc(START, START + SWEEP)} fill="none" stroke="#1b2126" strokeWidth={6} strokeLinecap="round" />
        {pct !== null && filled > 0 && (
          <path
            d={arc(START, START + SWEEP * filled)}
            fill="none"
            stroke={tone}
            strokeWidth={6}
            strokeLinecap="round"
            style={{ transition: "d 200ms ease-out" }}
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const [x, y] = toXY(START + SWEEP * t);
          const [xi, yi] = [cx + (r - 7) * Math.cos(((START + SWEEP * t) * Math.PI) / 180), cy + (r - 7) * Math.sin(((START + SWEEP * t) * Math.PI) / 180)];
          return <line key={t} x1={xi} y1={yi} x2={x} y2={y} stroke="#2b3238" strokeWidth={1} />;
        })}
      </svg>
      <div className="min-w-0">
        <div className="i-readout text-[22px] leading-none" style={{ color: pct === null ? "var(--i-text-faint)" : tone }}>
          {pct === null ? "—" : `${Math.round(pct)}%`}
        </div>
        <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-tight">{caption}</div>
      </div>
    </div>
  );
}

// A real series, drawn as a real line. Points come from stored Reports --
// if there is no history there is no sparkline, rather than a decorative
// squiggle.
export function TrendSpark({
  points,
  tone,
  width = 74,
  height = 26,
  invert = false,
}: {
  points: number[];
  tone: string;
  width?: number;
  height?: number;
  /** true = lower is better (a falling line should read as improvement). */
  invert?: boolean;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xs = (i: number) => (i / (points.length - 1)) * (width - 2) + 1;
  const ys = (v: number) => {
    const t = (v - min) / span;
    return height - 2 - (invert ? 1 - t : t) * (height - 4);
  };
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(p).toFixed(1)}`).join(" ");
  const area = `${d} L ${xs(points.length - 1).toFixed(1)} ${height} L ${xs(0).toFixed(1)} ${height} Z`;
  const lastX = xs(points.length - 1);
  const lastY = ys(points[points.length - 1]);

  return (
    <svg width={width} height={height} aria-hidden className="shrink-0 overflow-visible">
      <path d={area} fill={tone} opacity={0.1} />
      <path d={d} fill="none" stroke={tone} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.4} fill={tone} />
    </svg>
  );
}
