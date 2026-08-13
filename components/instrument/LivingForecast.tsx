"use client";

// THE LIVING FORECAST — the delivery outcome as an object rather than a chart.
//
// Everything drawn here is the real Monte Carlo result. The trial density is
// mirrored about a horizontal centreline into a single form; the likely date
// lives at its waist. No frame, no plot area, no axes — the object floats on
// the canvas, so the composition reads as "this is the project's delivery
// state", not "here is a chart explaining a date".
//
// ─────────────────────────────────────────────────────────────────────────
// VISUAL → SEMANTIC MAP. Every property below is derived; none is invented.
//
//   horizontal position      real completion dates (shared day-space within
//                            a view: the object, the target line and any
//                            gate wall are on the same scale, so distance
//                            between them is a true reading in days)
//   profile at x             trial density at that date, mirrored, so the
//                            visible thickness is 2x density
//   overall LENGTH           the real span of simulated outcomes in days
//   overall SIZE             the same fact again — height is locked to a
//                            fixed fraction of the object's own length. A
//                            settled outcome is a compact, near-spherical
//                            body; an unresolved one is the same body
//                            pulled and stretched across time.
//   NESTED SHELLS            probability concentration. Each inner shell is
//                            the region where density exceeds a fixed
//                            fraction of the peak (28% / 58%) — a threshold
//                            of the SAME density, not new geometry. A
//                            settled outcome's shells almost coincide, so
//                            it reads as one dense body; a diffuse
//                            outcome's shells separate and it visibly loses
//                            coherence.
//   internal illumination    the radial glow is centred on the waist and
//                            sized by the object's own length — brightest
//                            where the trial mass is densest. "It glows in
//                            the middle because that is where the
//                            probability is."
//   striation visibility     dispersion relative to the object's own centre.
//                            Same number the length shows, second channel.
//   outer bloom              target confidence, ONLY when a target exists.
//                            No target = flat neutral glow: the instrument
//                            refuses to judge "good" without a reference.
//   hatched tail             trial mass landing after the target = the real
//                            probability of missing
//   hard vertical wall       a proven serial Gate at its own likely day.
//                            A boundary, not a mark — a gate is not effort
//                            and capacity cannot cross it.
//   dashed outline           Reality's own distribution, held while a
//                            Scenario morphs over it. Deliberately flat and
//                            spectral: it is a memory, not a body.
//   waist connector          the P50 shift between Reality and Scenario —
//                            the days the change actually bought or cost
//   ambient lean             Momentum direction. ±6px on the outer layer,
//                            ±3px extra on the core (a restrained parallax
//                            that gives the body depth), explicitly NEVER
//                            applied to the geometry.
//
// ─────────────────────────────────────────────────────────────────────────
// MOTION. State changes MORPH; they never teleport and they never bounce.
//
// The morph is displacement interpolation in quantile space: the previous
// and next sorted trial arrays are interpolated per-quantile, so the form
// genuinely stretches, slides and settles between two REAL distributions.
// Intermediate frames are interpolation only — both endpoints are exact
// simulation output, and nothing is smoothed beyond the endpoints' own
// binning. The framing window rides the same eased parameter, which keeps
// the waist pinned at canvas centre while day-anchored references (target,
// gates, the Reality ghost) glide through in day-space: the camera tracks
// the object, the world moves past it.
//
// One eased clock (900ms, ease-in-out cubic) drives geometry, window and
// colour together. Interrupting a morph retargets from the currently drawn
// state, so rapid fader drags track smoothly. Scope switches REMOUNT
// instead of morphing — the instrument changed subject, and Design must
// never appear to "become" JSA. Reduced-motion preference snaps every
// morph to its end state.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";

const BINS = 128;
const VB_W = 1000;
const VB_H = 420;
const MID = VB_H / 2;

/** Quantile samples used for morphing — each point is equal probability
    mass, so binning them reproduces the true histogram shape. */
const Q = 384;

/** Half-height as a fraction of the object's own on-screen length. */
const ASPECT = 0.2;
const MIN_HALF_PX = 34;
const MAX_HALF_PX = 168;

const MORPH_MS = 900;

const CYAN: Rgb = [94, 200, 216]; // #5ec8d8 — Reality
const VIOLET: Rgb = [155, 140, 250]; // #9b8cfa — Scenario

type Rgb = [number, number, number];

export interface GateMark {
  id: string;
  label: string;
  /** Day offset where the gate's serial delay releases the outcome. */
  day: number;
}

export interface LivingForecastProps {
  result: SimulationResult;
  /** Reality's baseline — always supplied; drawn only while a Scenario is on. */
  reality: SimulationResult | null;
  scenarioActive: boolean;
  minDay: number;
  maxDay: number;
  startDate: Date;
  targetDay: number | null;
  confidence: number | null;
  gates: GateMark[];
  /** −1 earlier / 0 steady / +1 later. Ambient only. */
  momentumDir: number;
  onGateOpen?: (id: string) => void;
  onTargetOpen?: () => void;
  onObjectOpen?: () => void;
  onRealityOpen?: () => void;
}

function quantileSample(sorted: number[], n = Q): number[] {
  const out = new Array<number>(n);
  if (sorted.length === 0) return out.fill(0);
  for (let i = 0; i < n; i++) {
    out[i] = sorted[Math.round((i / (n - 1)) * (sorted.length - 1))];
  }
  return out;
}

function density(days: number[], minDay: number, maxDay: number): number[] {
  const span = maxDay - minDay || 1;
  const counts = new Array<number>(BINS).fill(0);
  for (const d of days) {
    const t = (d - minDay) / span;
    if (t < 0 || t > 1) continue;
    counts[Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))] += 1;
  }
  // Light smoothing only — enough to read as a form, never enough to invent
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

/** First and last bin carrying real mass — the object starts and ends at the
    trials, not at the canvas edge. */
function liveRange(d: number[]): [number, number] {
  const peak = Math.max(...d, 1);
  const live = d.map((v) => v / peak > 0.004);
  const first = live.indexOf(true);
  const last = live.lastIndexOf(true);
  return first < 0 ? [0, BINS - 1] : [first, last];
}

/** Height locked to the object's own on-screen length, so the form reads
    horizontally at every scale instead of being stretched into a spike by
    whatever aspect the viewport happens to have. */
function ampFor(range: [number, number], boxW: number, boxH: number): number {
  const lengthPx = ((range[1] - range[0] + 1) / BINS) * boxW;
  const halfPx = Math.max(MIN_HALF_PX, Math.min(MAX_HALF_PX, lengthPx * ASPECT));
  return halfPx * (VB_H / Math.max(1, boxH));
}

/** Closed mirrored form from a per-bin height array, trimmed to the bins
    that carry real height so no baseline ever runs the canvas. */
function formPath(h: number[], eps: number): string | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < BINS; i++) {
    if (h[i] > eps) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  const x = (i: number) => ((i + 0.5) / BINS) * VB_W;
  let top = `M ${x(first).toFixed(1)} ${MID}`;
  for (let i = first; i <= last; i++) top += ` L ${x(i).toFixed(1)} ${(MID - h[i]).toFixed(1)}`;
  top += ` L ${x(last).toFixed(1)} ${MID}`;
  let bot = "";
  for (let i = last; i >= first; i--) bot += ` L ${x(i).toFixed(1)} ${(MID + h[i]).toFixed(1)}`;
  return `${top}${bot} Z`;
}

/** Heights of the density region above a threshold fraction of the peak —
    a true isosurface of the same density, renormalised so τ=0 is the full
    form. This is what makes the body volumetric without inventing shape:
    inner shells are literally "where the probability is denser". */
function shellHeights(d: number[], peak: number, amp: number, tau: number): number[] {
  return d.map((v) => (Math.max(0, v / peak - tau) / (1 - tau)) * amp);
}

function spindlePath(d: number[], amp: number, range: [number, number]): string {
  const peak = Math.max(...d, 1);
  void range;
  return formPath(shellHeights(d, peak, amp, 0), amp * 0.004) ?? `M 0 ${MID}`;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface MorphState {
  q: number[];
  win: [number, number];
  col: Rgb;
}

/** One eased clock for geometry, window and colour. Retargets from the
    currently drawn state when interrupted mid-flight. */
function useMorph(target: MorphState): MorphState {
  const drawn = useRef<MorphState>(target);
  const last = useRef<MorphState>(target);
  const raf = useRef<number | null>(null);
  const [, force] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (last.current === target) return; // mount — drawn already snapped
    last.current = target;
    const from: MorphState = {
      q: drawn.current.q.slice(),
      win: [...drawn.current.win],
      col: [...drawn.current.col],
    };
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : MORPH_MS;
    const t0 = performance.now();
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const e = easeInOutCubic(t);
      const q = from.q.map((v, i) => v + (target.q[i] - v) * e);
      drawn.current = {
        q,
        win: [from.win[0] + (target.win[0] - from.win[0]) * e, from.win[1] + (target.win[1] - from.win[1]) * e],
        col: [0, 1, 2].map((i) => Math.round(from.col[i] + (target.col[i] - from.col[i]) * e)) as Rgb,
      };
      force();
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else raf.current = null;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target]);

  return drawn.current;
}

export default function LivingForecast({
  result,
  reality,
  scenarioActive,
  minDay,
  maxDay,
  startDate,
  targetDay,
  confidence,
  gates,
  momentumDir,
  onGateOpen,
  onTargetOpen,
  onObjectOpen,
  onRealityOpen,
}: LivingForecastProps) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 680 });

  // Proportions are decided in real pixels — the canvas is stretched
  // non-uniformly, so viewBox units alone would let the viewport's aspect
  // decide how the forecast reads.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const morphTarget = useMemo<MorphState>(
    () => ({
      q: quantileSample(result.completionDaysSorted),
      win: [minDay, maxDay],
      col: scenarioActive ? VIOLET : CYAN,
    }),
    [result, minDay, maxDay, scenarioActive]
  );
  const drawn = useMorph(morphTarget);

  const [dLo, dHi] = drawn.win;
  const pctX = (day: number) => ((day - dLo) / (dHi - dLo || 1)) * 100;

  // Everything below derives from the DRAWN state, so grain, edge weight,
  // the shells and the waist all evolve continuously through a morph.
  const drawnP10 = drawn.q[Math.round(0.1 * (Q - 1))];
  const drawnP50 = drawn.q[Math.round(0.5 * (Q - 1))];
  const drawnP90 = drawn.q[Math.round(0.9 * (Q - 1))];
  const grain = Math.max(0, Math.min(1, (drawnP90 - drawnP10) / Math.max(1, drawnP50) / 0.9));

  const d = density(drawn.q, dLo, dHi);
  const range = liveRange(d);
  const amp = ampFor(range, box.w, box.h);
  const peak = Math.max(...d, 1);
  const eps = amp * 0.004;
  const path = formPath(shellHeights(d, peak, amp, 0), eps) ?? `M 0 ${MID}`;
  // Density isosurfaces — the volumetric interior. A settled body's shells
  // nearly coincide; a diffuse one visibly comes apart.
  const midPath = formPath(shellHeights(d, peak, amp, 0.28), eps);
  const corePath = formPath(shellHeights(d, peak, amp, 0.58), eps);

  const core = `rgb(${drawn.col[0]},${drawn.col[1]},${drawn.col[2]})`;
  // The illumination is anchored to the drawn waist and sized by the drawn
  // length, so the light stays inside the body through every morph.
  const waistX = (((drawnP50 - dLo) / (dHi - dLo || 1))) * VB_W;
  const halfLenVb = Math.max(((range[1] - range[0] + 1) / (2 * BINS)) * VB_W, 60);

  // The Reality ghost is binned into the same drawn window, so it glides in
  // day-space with everything else. Its visibility is a slow CSS fade.
  const ghost = useMemo(() => {
    if (!reality) return null;
    const gd = density(quantileSample(reality.completionDaysSorted), dLo, dHi);
    // A Reality that lies entirely outside this window must simply be
    // absent — the liveRange fallback would otherwise paint a full-width
    // rule at the centreline. The edge marker below carries it instead.
    if (!gd.some((v) => v > 0)) return null;
    const gr = liveRange(gd);
    return spindlePath(gd, ampFor(gr, box.w, box.h), gr);
  }, [reality, dLo, dHi, box.w, box.h]);

  // Bloom only means something against a target. No target = no judgement.
  // Capped at 0.5 so coherence never turns into fog that eats the edge.
  const bloom = confidence === null ? 0.16 : 0.1 + (confidence / 100) * 0.4;
  const missing = confidence === null ? null : 100 - confidence;

  // Waist connector: how far the P50 has actually moved, drawn from the
  // ghost's waist to the DRAWN waist so it extends with the morph.
  const shift = reality ? drawnP50 - reality.percentiles.p50 : 0;
  const showShift = scenarioActive && reality !== null && Math.abs(shift) >= 0.75;

  // Gate walls enter and leave the canvas as structures, not as reused DOM:
  // an assumed-resolved gate flashes once and releases.
  const [drawGates, setDrawGates] = useState<{ g: GateMark; leaving: boolean; entering: boolean }[]>(() =>
    gates.map((g) => ({ g, leaving: false, entering: false }))
  );
  useEffect(() => {
    setDrawGates((prev) => {
      const nextIds = new Set(gates.map((g) => g.id));
      const prevIds = new Set(prev.map((e) => e.g.id));
      const kept = prev
        .filter((e) => !(e.leaving && !nextIds.has(e.g.id) && e.entering)) // never resurrect
        .map((e) =>
          nextIds.has(e.g.id)
            ? { g: gates.find((g) => g.id === e.g.id)!, leaving: false, entering: e.entering }
            : { ...e, leaving: true }
        );
      const added = gates.filter((g) => !prevIds.has(g.id)).map((g) => ({ g, leaving: false, entering: true }));
      return [...kept, ...added];
    });
    const t = setTimeout(() => setDrawGates((cur) => cur.filter((e) => !e.leaving)), 760);
    return () => clearTimeout(t);
  }, [gates]);

  const inFrame = (day: number) => pctX(day) > 3 && pctX(day) < 97;
  const passedGates = drawGates.filter((e) => !e.leaving && !inFrame(e.g.day) && pctX(e.g.day) <= 3);
  const targetInFrame = targetDay !== null && targetDay >= dLo && targetDay <= dHi;
  const fmtTarget =
    targetDay === null
      ? ""
      : new Date(startDate.getTime() + targetDay * 86400000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

  return (
    <div ref={wrapRef} className="lf-subject absolute inset-0 overflow-hidden">
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{
          // Ambient momentum lean: geometry untouched, the layer simply
          // leans a little in the direction the project is trending.
          transform: `translateX(${momentumDir * -6}px)`,
          transition: "transform 1200ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <defs>
          <radialGradient
            id={`core-${uid}`}
            gradientUnits="userSpaceOnUse"
            cx={waistX}
            cy={MID}
            r={halfLenVb}
          >
            <stop offset="0%" stopColor={core} stopOpacity={0.5} />
            <stop offset="55%" stopColor={core} stopOpacity={0.2} />
            <stop offset="100%" stopColor={core} stopOpacity={0.04} />
          </radialGradient>
          {/* userSpaceOnUse: a percentage filter region is relative to the
              path's own bbox, so a small object would clip its own bloom
              into a visible rectangle. */}
          <filter
            id={`bloom-${uid}`}
            filterUnits="userSpaceOnUse"
            x={-VB_W}
            y={-VB_H}
            width={VB_W * 3}
            height={VB_H * 3}
          >
            <feGaussianBlur stdDeviation={11} />
          </filter>
          {/* Melts the isosurface boundaries into internal light — the
              shells stay where the density puts them, but read as volume
              rather than as contour bands. */}
          <filter
            id={`soft-${uid}`}
            filterUnits="userSpaceOnUse"
            x={-VB_W}
            y={-VB_H}
            width={VB_W * 3}
            height={VB_H * 3}
          >
            <feGaussianBlur stdDeviation={7} />
          </filter>
          <pattern id={`miss-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--i-red)" strokeWidth="1.6" strokeOpacity="0.55" />
          </pattern>
          {targetDay !== null && (
            <clipPath id={`tail-${uid}`}>
              {/* Extends well past the right edge: a target dragged off-frame
                  left must still hatch the whole object. */}
              <rect x={(pctX(targetDay) / 100) * VB_W} y={0} width={VB_W * 4} height={VB_H} />
            </clipPath>
          )}
        </defs>

        {/* Outer bloom — coherence. Bright and soft when the target is
            likely, nearly absent when it is not. The 9s breath is the only
            motion Reality is allowed at rest. */}
        <g style={{ animation: "i-breath 9s ease-in-out infinite" }}>
          <path
            d={path}
            fill={core}
            filter={`url(#bloom-${uid})`}
            style={{ opacity: bloom, transition: "opacity 450ms ease-out" }}
          />
        </g>

        {/* The body — internally illuminated, then two density isosurfaces.
            The interior brightens exactly where the trial mass concentrates,
            and the core rides a slightly deeper momentum lean than the
            outer layer: a restrained parallax, geometry untouched. */}
        <path d={path} fill={`url(#core-${uid})`} />
        {midPath && <path d={midPath} fill={core} opacity={0.15} filter={`url(#soft-${uid})`} />}
        {corePath && (
          <g
            style={{
              transform: `translateX(${momentumDir * -3}px)`,
              transition: "transform 1200ms cubic-bezier(.4,0,.2,1)",
            }}
          >
            <path d={corePath} fill={core} opacity={0.22} filter={`url(#soft-${uid})`} />
          </g>
        )}

        {/* Grain — a diffuse outcome resolves into visible striations; a
            tight one fuses. Opacity IS the dispersion ratio. */}
        {grain > 0.06 &&
          d.map((v, i) =>
            i % 2 === 0 && i >= range[0] && i <= range[1] ? (
              <line
                key={i}
                x1={((i + 0.5) / BINS) * VB_W}
                y1={MID - (v / peak) * amp}
                x2={((i + 0.5) / BINS) * VB_W}
                y2={MID + (v / peak) * amp}
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

        {/* Reality, held as a quiet outline while a Scenario morphs. */}
        {ghost && (
          <path
            d={ghost}
            fill="none"
            stroke="var(--i-reality)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            style={{ opacity: scenarioActive ? 0.55 : 0, transition: "opacity 700ms ease-out" }}
          />
        )}

        {/* Waist connector — ties Scenario to the Reality it left. Only
            drawn when both waists are on the canvas. */}
        {showShift && reality && pctX(reality.percentiles.p50) > 1 && pctX(reality.percentiles.p50) < 99 && (
          <line
            x1={(pctX(reality.percentiles.p50) / 100) * VB_W}
            y1={MID}
            x2={(pctX(drawnP50) / 100) * VB_W}
            y2={MID}
            stroke={core}
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Direct summons — the instrument itself is explorable. Pointer
            affordances only; the accessible paths are the on-canvas
            buttons and the macro strip. The ghost's hit area sits UNDER
            the body's, so where the two forms overlap the body wins and
            the ghost answers only in its own territory. */}
        {ghost && scenarioActive && (
          <path
            d={ghost}
            fill="rgba(0,0,0,0)"
            data-shoot="ghost-hit"
            style={{ pointerEvents: "fill", cursor: "pointer" }}
            onClick={() => onRealityOpen?.()}
          />
        )}
        <path
          d={path}
          fill="rgba(0,0,0,0)"
          data-shoot="object-hit"
          style={{ pointerEvents: "fill", cursor: "pointer" }}
          onClick={() => onObjectOpen?.()}
        />
      </svg>

      {/* Gate walls. Structurally different from everything else: a hard
          boundary with pressure banked against it, because a serial gate is
          not effort and capacity cannot cross it. Resolving one in Scenario
          flashes the wall once and releases the structure. */}
      {drawGates
        .filter((e) => e.leaving || inFrame(e.g.day))
        .map(({ g, leaving, entering }) => (
          <div
            key={g.id}
            className={`absolute inset-y-0 ${leaving ? "lf-gate-leave" : entering ? "lf-gate-enter" : ""}`}
            style={{ left: `${pctX(g.day)}%` }}
          >
            <div
              className="lf-press absolute inset-y-0"
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
            <button
              type="button"
              data-shoot={`gate-wall-${g.id}`}
              onClick={() => onGateOpen?.(g.id)}
              disabled={leaving || !onGateOpen}
              aria-label={`Open decision: ${g.label}`}
              className="absolute text-left group"
              style={{ top: "26%", left: 12, maxWidth: 200 }}
            >
              <div className="i-label whitespace-nowrap" style={{ color: "var(--i-amber)" }}>
                Hard constraint
              </div>
              <div className="mt-1 text-[10.5px] text-[var(--i-text-soft)] leading-snug line-clamp-2 group-hover:text-[var(--i-text)] transition-colors">
                {g.label}
              </div>
              <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">nothing lands before this</div>
            </button>
          </div>
        ))}

      {/* Decisions that land before this window opens. Their delay is
          already inside every trial, so the honest thing is to say so. */}
      {passedGates.length > 0 && (
        <button
          type="button"
          onClick={() => onGateOpen?.(passedGates[0].g.id)}
          className="absolute left-5 text-left"
          style={{ bottom: 104, maxWidth: 180 }}
        >
          <div className="i-label whitespace-nowrap" style={{ color: "var(--i-amber)" }}>
            {passedGates.length} open decision{passedGates.length > 1 ? "s" : ""}
          </div>
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
            resolve before this window — their delay is already inside this date
          </div>
        </button>
      )}

      {/* Target boundary — the one thing on the canvas you may move. The
          object holds still; only the evaluation responds. */}
      {targetDay !== null && targetInFrame && (
        <div className="absolute inset-y-0" style={{ left: `${pctX(targetDay)}%` }}>
          <div
            className="absolute inset-y-0 w-px -translate-x-1/2"
            style={{
              background: missing !== null && missing > 50 ? "var(--i-red)" : "var(--i-text-soft)",
              opacity: 0.55,
              transition: "background 300ms ease",
            }}
          />
          <button
            type="button"
            data-shoot="target-caption"
            onClick={() => onTargetOpen?.()}
            aria-label="Open target evaluation"
            className="absolute top-[86px] -translate-x-1/2 text-center whitespace-nowrap group"
          >
            <div className="i-label group-hover:text-[var(--i-text-soft)] transition-colors">Target</div>
            <div className="mt-1 i-readout text-[12px] text-[var(--i-text-soft)] group-hover:text-[var(--i-text)] transition-colors">
              {fmtTarget}
            </div>
            {confidence !== null && (
              <div
                className="mt-0.5 i-readout text-[13px]"
                style={{
                  color:
                    confidence >= 70 ? "var(--i-mint)" : confidence >= 40 ? "var(--i-amber)" : "var(--i-red)",
                  transition: "color 300ms ease",
                }}
              >
                {confidence}%
              </div>
            )}
          </button>
        </div>
      )}

      {/* A target far outside the object's own range does not get to shrink
          the object — it is marked at the edge with the real distance. */}
      {targetDay !== null && !targetInFrame && (
        <button
          type="button"
          data-shoot="target-caption"
          onClick={() => onTargetOpen?.()}
          className="absolute top-[86px]"
          style={{
            textAlign: targetDay > dHi ? "right" : "left",
            right: targetDay > dHi ? 20 : undefined,
            left: targetDay > dHi ? undefined : 20,
          }}
        >
          <div className="i-label whitespace-nowrap">Target {targetDay > dHi ? "→" : "←"}</div>
          <div className="mt-1 i-readout text-[12px] text-[var(--i-text-soft)] whitespace-nowrap">{fmtTarget}</div>
          {confidence !== null && (
            <div
              className="mt-0.5 i-readout text-[13px]"
              style={{
                color: confidence >= 70 ? "var(--i-mint)" : confidence >= 40 ? "var(--i-amber)" : "var(--i-red)",
              }}
            >
              {confidence}%
            </div>
          )}
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)] whitespace-nowrap">
            {Math.abs(Math.round(targetDay - result.percentiles.p50))}d {targetDay > dHi ? "after" : "before"} the
            likely date
          </div>
        </button>
      )}

      {/* Reality pushed off the canvas by a large scenario move still gets
          named — the baseline never silently disappears. */}
      {scenarioActive && reality && (reality.percentiles.p50 < dLo || reality.percentiles.p50 > dHi) && (
        <div
          className="absolute top-[150px]"
          style={{
            textAlign: reality.percentiles.p50 > dHi ? "right" : "left",
            right: reality.percentiles.p50 > dHi ? 20 : undefined,
            left: reality.percentiles.p50 > dHi ? undefined : 20,
          }}
        >
          <div className="i-label whitespace-nowrap" style={{ color: "var(--i-reality)" }}>
            {reality.percentiles.p50 > dHi ? "Reality →" : "← Reality"}
          </div>
          <div className="mt-1 i-readout text-[12px] whitespace-nowrap" style={{ color: "var(--i-reality)" }}>
            {new Date(startDate.getTime() + reality.percentiles.p50 * 86400000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </div>
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)] whitespace-nowrap">
            the baseline this scenario left
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
