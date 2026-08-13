"use client";

// THE LIVING FORECAST — the delivery outcome as an object rather than a chart.
//
// Everything drawn here is the real Monte Carlo result. The change is what
// SHAPE that result takes: instead of a curve sitting in a rectangle with axes
// around it, the trial density is mirrored about a horizontal centreline into
// a single form, and the likely date lives at its waist. There is no frame, no
// plot area, no gridded box -- the object floats on the canvas, so the
// composition reads as "this is the project's delivery state", not "here is a
// chart explaining a date".
//
// ─────────────────────────────────────────────────────────────────────────
// VISUAL → SEMANTIC MAP. Every property below is derived; none is invented.
//
//   horizontal position      real completion dates (shared time axis)
//   profile at x             trial density at that date, from
//                            completionDaysSorted -- mirrored, so the visible
//                            thickness is 2x density
//   overall LENGTH           the real span of simulated outcomes in calendar
//                            days. Horizontal distance is days WITHIN a view,
//                            shared by the object, the target and any gate --
//                            so length against the distance to the target is
//                            a true reading. The window is fitted per scope,
//                            so lengths are not compared between scopes; the
//                            p10—p90 caption carries that.
//   overall SIZE             the same fact again: height is locked to a fixed
//                            fraction of the object's own length, so the form
//                            keeps one aspect at every scale. A settled
//                            outcome is a small dense bead; an unresolved one
//                            is a long low ridge. Height carries no
//                            independent meaning -- it exists so certainty is
//                            legible as presence, not just as extent.
//   striation visibility     dispersion relative to the object's own centre.
//                            Same number the length shows, second channel, so
//                            it is readable without measuring.
//   outer bloom opacity      target confidence, ONLY when a target exists.
//                            With no target the object stays neutral: the
//                            instrument refuses to judge "good" without a
//                            reference the model actually has.
//   hatched tail             trial mass landing after the target = the real
//                            probability of missing
//   hard vertical wall       a proven serial Gate, drawn at the gate's own
//                            likely duration from today. A boundary, not a
//                            mark, because a gate is not effort -- no amount
//                            of capacity crosses it.
//   dashed outline           Reality's own distribution, kept while a Scenario
//                            morphs over it
//   waist connector          the P50 shift between Reality and Scenario, i.e.
//                            the days the change actually bought or cost
//   ambient drift            Momentum direction. Visual only, ±6px, and
//                            explicitly NOT applied to the density geometry.
// ─────────────────────────────────────────────────────────────────────────

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";

const BINS = 128;
const VB_W = 1000;
const VB_H = 420;
const MID = VB_H / 2;

/** Half-height as a fraction of the object's own on-screen length. */
const ASPECT = 0.2;
const MIN_HALF_PX = 26;
const MAX_HALF_PX = 168;

export interface GateMark {
  id: string;
  label: string;
  /** Day offset where the gate's serial delay releases the outcome. */
  day: number;
}

export interface LivingForecastProps {
  result: SimulationResult;
  reality?: SimulationResult;
  minDay: number;
  maxDay: number;
  startDate: Date;
  targetDay: number | null;
  confidence: number | null;
  gates: GateMark[];
  /** −1 earlier / 0 steady / +1 later. Ambient only. */
  momentumDir: number;
  scenarioActive: boolean;
}

function density(days: number[], minDay: number, maxDay: number): number[] {
  const span = maxDay - minDay || 1;
  const counts = new Array<number>(BINS).fill(0);
  for (const d of days) {
    const t = (d - minDay) / span;
    if (t < 0 || t > 1) continue;
    counts[Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))] += 1;
  }
  // Light smoothing only -- enough to read as a form, never enough to invent
  // shape the trials don't have. A genuinely bimodal project stays bimodal.
  const k = [1, 3, 5, 3, 1];
  return counts.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = -2; j <= 2; j++) {
      const n = i + j;
      if (n < 0 || n >= BINS) continue;
      s += counts[n] * k[j + 2];
      w += k[j + 2];
    }
    return w ? s / w : 0;
  });
}

/**
 * First and last bin carrying real mass. The object starts and ends at the
 * trials, not at the canvas edge: a baseline running the full width would read
 * as a stray rule and would imply the object extends into dates no trial ever
 * produced.
 */
function liveRange(d: number[]): [number, number] {
  const peak = Math.max(...d, 1);
  const live = d.map((v) => v / peak > 0.004);
  const first = live.indexOf(true);
  const last = live.lastIndexOf(true);
  return first < 0 ? [0, BINS - 1] : [first, last];
}

/**
 * Height is locked to a fraction of the object's own on-screen length, so the
 * form reads horizontally at every scale instead of being stretched into a
 * spike by whatever aspect the viewport happens to have.
 */
function ampFor(range: [number, number], boxW: number, boxH: number): number {
  const lengthPx = ((range[1] - range[0] + 1) / BINS) * boxW;
  const halfPx = Math.max(MIN_HALF_PX, Math.min(MAX_HALF_PX, lengthPx * ASPECT));
  return halfPx * (VB_H / Math.max(1, boxH));
}

// Mirrored form: the density becomes a closed shape about the centreline.
function spindlePath(d: number[], amp: number, range: [number, number]): string {
  const peak = Math.max(...d, 1);
  const x = (i: number) => ((i + 0.5) / BINS) * VB_W;
  const h = (v: number) => (v / peak) * amp;
  const [first, last] = range;
  let top = `M ${x(first).toFixed(1)} ${MID}`;
  for (let i = first; i <= last; i++) top += ` L ${x(i).toFixed(1)} ${(MID - h(d[i])).toFixed(1)}`;
  top += ` L ${x(last).toFixed(1)} ${MID}`;
  let bot = "";
  for (let i = last; i >= first; i--) bot += ` L ${x(i).toFixed(1)} ${(MID + h(d[i])).toFixed(1)}`;
  return `${top}${bot} Z`;
}

export default function LivingForecast({
  result,
  reality,
  minDay,
  maxDay,
  startDate,
  targetDay,
  confidence,
  gates,
  momentumDir,
  scenarioActive,
}: LivingForecastProps) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 680 });

  // The object's proportions are decided in real pixels, not viewBox units --
  // the canvas is stretched non-uniformly, so viewBox units alone would let the
  // viewport's aspect decide how the forecast reads.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pctX = (day: number) => ((day - minDay) / (maxDay - minDay || 1)) * 100;

  const { path, ghostPath, grain, bars } = useMemo(() => {
    const d = density(result.completionDaysSorted, minDay, maxDay);
    const range = liveRange(d);
    const amp = ampFor(range, box.w, box.h);
    const g = reality ? density(reality.completionDaysSorted, minDay, maxDay) : null;
    const gRange = g ? liveRange(g) : null;

    const spread = result.percentiles.p90 - result.percentiles.p10;
    const centre = Math.max(1, result.percentiles.p50);
    // How dispersed this outcome is relative to its own scale. 0 = knife
    // sharp, 1 = very diffuse. Same fact the length shows, second channel.
    const ratio = Math.max(0, Math.min(1, spread / centre / 0.9));
    const peak = Math.max(...d, 1);
    return {
      path: spindlePath(d, amp, range),
      ghostPath: g && gRange ? spindlePath(g, ampFor(gRange, box.w, box.h), gRange) : null,
      grain: ratio,
      bars: d
        .map((v, i) => ({ i, x: ((i + 0.5) / BINS) * VB_W, h: (v / peak) * amp }))
        .filter((b) => b.i >= range[0] && b.i <= range[1]),
    };
  }, [result, reality, minDay, maxDay, box.w, box.h]);

  const core = scenarioActive ? "#9b8cfa" : "#5ec8d8";
  // Bloom only means something against a target. No target = no judgement.
  const bloom = confidence === null ? 0.16 : 0.1 + (confidence / 100) * 0.55;
  const missing = confidence === null ? null : 100 - confidence;

  // The waist connector: how far the P50 actually moved. Drawn only when the
  // shift is real, so it never decorates a scenario that changed nothing.
  const shift = reality ? result.percentiles.p50 - reality.percentiles.p50 : 0;
  const showShift = reality !== undefined && Math.abs(shift) >= 0.75;

  // A gate only earns a wall if the object can actually press against it.
  const inFrameGates = gates.filter((g) => pctX(g.day) > 3 && pctX(g.day) < 97);
  const passedGates = gates.filter((g) => pctX(g.day) <= 3);
  const targetInFrame = targetDay !== null && targetDay >= minDay && targetDay <= maxDay;
  const fmtTarget =
    targetDay === null
      ? ""
      : new Date(startDate.getTime() + targetDay * 86400000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{
          // Ambient momentum drift: geometry is untouched, the whole layer
          // simply leans a little in the direction the project is trending.
          transform: `translateX(${momentumDir * -6}px)`,
          transition: "transform 1200ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={core} stopOpacity={0.05} />
            <stop offset="50%" stopColor={core} stopOpacity={0.32} />
            <stop offset="100%" stopColor={core} stopOpacity={0.05} />
          </linearGradient>
          {/* userSpaceOnUse: a percentage filter region is a percentage of the
              path's own bbox, so a small object clips its own bloom into a
              visible rectangle. */}
          <filter
            id={`bloom-${uid}`}
            filterUnits="userSpaceOnUse"
            x={-VB_W}
            y={-VB_H}
            width={VB_W * 3}
            height={VB_H * 3}
          >
            <feGaussianBlur stdDeviation={14} />
          </filter>
          <pattern id={`miss-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--i-red)" strokeWidth="1.6" strokeOpacity="0.55" />
          </pattern>
          {targetDay !== null && (
            <clipPath id={`tail-${uid}`}>
              {/* Extends well past the right edge: a target dragged off-canvas
                  to the left must still hatch the whole object, not a slice of
                  it the width of the canvas. */}
              <rect x={(pctX(targetDay) / 100) * VB_W} y={0} width={VB_W * 4} height={VB_H} />
            </clipPath>
          )}
        </defs>

        {/* Outer bloom — coherence. Bright and soft when the target is likely,
            nearly absent when it is not. */}
        <path d={path} fill={core} opacity={bloom} filter={`url(#bloom-${uid})`} />

        {/* The body */}
        <path d={path} fill={`url(#fill-${uid})`} />

        {/* Grain — a diffuse outcome resolves into visible striations; a tight
            one fuses. Opacity IS the dispersion ratio. */}
        {grain > 0.06 &&
          bars.map((b) =>
            b.i % 2 === 0 ? (
              <line
                key={b.i}
                x1={b.x}
                y1={MID - b.h}
                x2={b.x}
                y2={MID + b.h}
                stroke={core}
                strokeWidth={1}
                opacity={0.05 + grain * 0.3}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}

        {/* Edge */}
        <path
          d={path}
          fill="none"
          stroke={core}
          strokeWidth={1.4}
          opacity={0.55 + (1 - grain) * 0.35}
          vectorEffect="non-scaling-stroke"
        />

        {/* Miss tail — real probability mass past the target. */}
        {targetDay !== null && (
          <path d={path} fill={`url(#miss-${uid})`} clipPath={`url(#tail-${uid})`} opacity={0.85} />
        )}

        {/* Reality, kept as a quiet outline while a Scenario morphs. */}
        {ghostPath && (
          <path
            d={ghostPath}
            fill="none"
            stroke="var(--i-reality)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            opacity={0.55}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Waist connector — ties the two forms together so the ghost reads as
            "where this was", not as a second unrelated object. */}
        {showShift && reality && (
          <line
            x1={(pctX(reality.percentiles.p50) / 100) * VB_W}
            y1={MID}
            x2={(pctX(result.percentiles.p50) / 100) * VB_W}
            y2={MID}
            stroke={core}
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Gate walls. Structurally different from everything else: a hard
          boundary with pressure banked against it, because a serial gate is
          not effort and capacity cannot cross it. */}
      {inFrameGates.map((g) => (
        <div key={g.id} className="absolute inset-y-0" style={{ left: `${pctX(g.day)}%` }}>
          <div
            className="absolute inset-y-0"
            style={{
              width: 54,
              transform: "translateX(-54px)",
              background: "linear-gradient(90deg, transparent, rgba(224,176,74,0.14))",
            }}
          />
          <div
            className="absolute inset-y-0 w-px"
            style={{ background: "var(--i-amber)", opacity: 0.85, boxShadow: "0 0 12px rgba(224,176,74,0.45)" }}
          />
          <div className="absolute" style={{ top: "26%", left: 12, maxWidth: 200 }}>
            <div className="i-label whitespace-nowrap" style={{ color: "var(--i-amber)" }}>
              Hard constraint
            </div>
            <div className="mt-1 text-[10.5px] text-[var(--i-text-soft)] leading-snug line-clamp-2">{g.label}</div>
            <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">nothing lands before this</div>
          </div>
        </div>
      ))}

      {/* Decisions that land before this window opens. Their delay is already
          inside every trial, so the honest thing is to say so rather than
          stretch the canvas back to draw a wall nothing presses against. */}
      {passedGates.length > 0 && (
        <div className="absolute left-5" style={{ bottom: 104, maxWidth: 180 }}>
          <div className="i-label whitespace-nowrap" style={{ color: "var(--i-amber)" }}>
            {passedGates.length} open decision{passedGates.length > 1 ? "s" : ""}
          </div>
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
            resolve before this window — their delay is already inside this date
          </div>
        </div>
      )}

      {/* Target boundary. Captioned at the TOP so the macro strip can never
          sit on top of the one date you are allowed to move. */}
      {targetDay !== null && targetInFrame && (
        <div className="absolute inset-y-0" style={{ left: `${pctX(targetDay)}%` }}>
          <div
            className="absolute inset-y-0 w-px -translate-x-1/2"
            style={{
              background: missing !== null && missing > 50 ? "var(--i-red)" : "var(--i-text-soft)",
              opacity: 0.55,
            }}
          />
          <div className="absolute top-[86px] -translate-x-1/2 text-center whitespace-nowrap">
            <div className="i-label">Target</div>
            <div className="mt-1 i-readout text-[12px] text-[var(--i-text-soft)]">{fmtTarget}</div>
          </div>
        </div>
      )}

      {/* A target far outside the object's own range does not get to shrink the
          object. It is marked at the edge with the real distance instead. */}
      {targetDay !== null && !targetInFrame && (
        <div
          className="absolute top-[86px]"
          style={{
            textAlign: targetDay > maxDay ? "right" : "left",
            right: targetDay > maxDay ? 20 : undefined,
            left: targetDay > maxDay ? undefined : 20,
          }}
        >
          <div className="i-label whitespace-nowrap">Target {targetDay > maxDay ? "→" : "←"}</div>
          <div className="mt-1 i-readout text-[12px] text-[var(--i-text-soft)] whitespace-nowrap">{fmtTarget}</div>
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)] whitespace-nowrap">
            {Math.abs(Math.round(targetDay - result.percentiles.p50))}d{" "}
            {targetDay > maxDay ? "after" : "before"} the likely date
          </div>
        </div>
      )}
    </div>
  );
}

export function dispersionWord(result: SimulationResult): string {
  const spread = result.percentiles.p90 - result.percentiles.p10;
  const ratio = spread / Math.max(1, result.percentiles.p50);
  if (ratio < 0.18) return "settled";
  if (ratio < 0.38) return "holding shape";
  if (ratio < 0.7) return "loose";
  return "unresolved";
}
