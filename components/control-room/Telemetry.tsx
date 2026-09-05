"use client";

// THE TELEMETRY STRIP.
//
// Five readings across the top, in the approved Master Control Room
// treatment: a numbered badge in the domain's colour, the domain name in
// that colour, one line saying what the reading is for, a dominant figure
// with a second one beside it, and a sparkline underneath drawn in the
// same colour.
//
// It is a STATUS BAR, not five dashboard cards. Consequences of that:
// short, no explanatory paragraph, the number carries the weight, and the
// colour is doing work rather than decorating. The panels share one
// enclosure and are separated by hairlines, so the eye reads a row of
// instruments rather than five competing boxes.
//
// ── THE COLOUR LAW AS OF V4 ────────────────────────────────────────────
//
//   cyan    REALITY — what is true now, and the forecast while it is real
//   violet  CHOICES — decisions and gates; ALSO the Scenario signal
//   mint    CAPACITY — human ability we have
//   amber   CONSTRAINTS — a target, or something obstructing one
//   cool    TIME — the frame the others are read inside
//   red     used only when something is genuinely blocking
//
// Violet now carries two meanings by explicit direction. A hypothetical is
// therefore no longer distinguished by hue alone: Scenario is a page MODE —
// a violet rail across the header, a badge, Reality's own value shown
// beside every changed one, and the ghost on the field. Colour says
// "decision"; the mode says "not real yet". See the truth audit.

import Link from "@/components/instrument/SignalLink";
import type { Point } from "@/lib/control-room/read";

export type Domain = "reality" | "choices" | "capacity" | "outcome" | "time";

export const DOMAIN_ACCENT: Record<Domain, string> = {
  reality: "var(--i-signal)",
  choices: "var(--i-violet)",
  capacity: "var(--i-mint)",
  outcome: "var(--i-signal)",
  time: "var(--i-text-soft)",
};

const DOMAIN_SOFT: Record<Domain, string> = {
  reality: "var(--i-signal-soft)",
  choices: "var(--i-violet-soft)",
  capacity: "var(--i-mint-soft)",
  outcome: "var(--i-signal-soft)",
  time: "rgba(144, 153, 161, 0.14)",
};

export function TelemetryStrip({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div
      data-shoot="cr-reading"
      className="grid shrink-0 gap-2"
      // The strip spans the width whatever a workspace shows. Leaving the
      // columns of readings a workspace deliberately hid would draw the
      // absence rather than the instrument.
      style={{ gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Telemetry({
  index,
  domain,
  label,
  question,
  value,
  unit,
  valueTone,
  second,
  secondLabel,
  series,
  href,
  shoot,
  /** Reality's own figure while a Scenario is running. Drawn beside the
      hypothetical, never instead of it. */
  reality,
}: {
  index: number;
  domain: Domain;
  label: string;
  question: string;
  value: string;
  unit?: string;
  valueTone?: string;
  second?: string | null;
  secondLabel?: string | null;
  series?: Point[] | null;
  href: string;
  shoot: string;
  reality?: string | null;
}) {
  const accent = DOMAIN_ACCENT[domain];
  return (
    <Link
      href={href}
      data-shoot={shoot}
      data-domain={domain}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-md transition-colors"
      style={{
        background: "var(--i-panel)",
        border: "1px solid var(--i-border)",
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div className="flex min-w-0 items-start gap-2 px-3 pt-2">
        <span
          className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold"
          style={{ background: DOMAIN_SOFT[domain], color: accent }}
        >
          {index}
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            {label}
          </span>
          <span className="block truncate pt-[1px] text-[10px]" style={{ color: "var(--i-text-faint)" }}>
            {question}
          </span>
        </span>
      </div>

      <div className="flex min-w-0 items-end gap-3 px-3 pt-1.5">
        <span className="min-w-0">
          <span
            data-shoot={`${shoot}-primary`}
            className="i-readout block truncate text-[27px] leading-none"
            style={{ color: valueTone ?? accent }}
          >
            {value}
          </span>
          {unit && (
            <span className="block truncate pt-[3px] text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
              {unit}
            </span>
          )}
        </span>
        {second && (
          <span className="min-w-0 pb-[1px]">
            <span className="i-readout block truncate text-[15px] leading-none" style={{ color: "var(--i-text)" }}>
              {second}
            </span>
            {secondLabel && (
              <span className="block truncate pt-[3px] text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
                {secondLabel}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Reality, kept beside the hypothetical rather than replaced by it. */}
      {reality && (
        <span
          data-shoot={`${shoot}-reality`}
          className="i-readout mx-3 mt-1.5 truncate rounded-[3px] px-1.5 py-[2px] text-[9.5px]"
          style={{ background: "var(--i-recess)", color: "var(--i-reality)" }}
        >
          Reality {reality}
        </span>
      )}

      {/* The trace is the panel's floor — REAL RECORDED POINTS ONLY. Where
          a reading has no history (capacity has none anywhere in the model,
          and a project nobody has reported on has none either) the floor is
          still drawn, empty. A recess is not a claim; a flat line would be. */}
      <div className="mt-auto h-[26px] w-full" style={{ background: "var(--i-recess)" }}>
        {series && series.length > 0 ? (
          <Trace points={series} colour={accent} shoot={`${shoot}-spark`} />
        ) : null}
      </div>
    </Link>
  );
}

/** A filled trace across the foot of a telemetry panel. Real points only:
    one point is a dot, and it stays a dot, because two dots joined would be
    a direction nobody measured. */
function Trace({ points, colour, shoot }: { points: Point[]; colour: string; shoot: string }) {
  const W = 100;
  const H = 26;
  const PAD = 3;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");

  return (
    <svg
      data-shoot={shoot}
      data-points={points.length}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      {points.length === 1 ? (
        <circle cx={W / 2} cy={H / 2} r={1.6} fill={colour} opacity={0.8} vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <polygon points={`0,${H} ${line} ${W},${H}`} fill={colour} opacity={0.1} />
          <polyline
            points={line}
            fill="none"
            stroke={colour}
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
