"use client";

// THE FORECAST FIELD -- the Instrument's hero and its one signature element.
//
// Every Scope lives on one shared temporal axis (that rule predates this
// component and still holds), but a Scope is no longer a thin band with a
// dot on it: it is drawn as the actual shape of its Monte Carlo outcome
// distribution, binned straight out of SimulationResult.completionDaysSorted
// -- the same 5000 trials the forecast is computed from. Nothing here is
// stylised or invented: a wide, flat ridge IS an uncertain project and a
// tall narrow one IS a confident one.
//
// Three things are drawn on top of that mass, and each one is a fact:
//   - the P50 stem, where the outcome balances
//   - Reality's own ridge, hollow and dashed, once a scenario moves things
//   - the tail past the target date, hatched -- that hatched area IS the
//     probability of missing, so "how sure are we" can be read spatially
//     before anyone looks at the percentage
//
// That is what makes the surface playable: raise capacity and you watch the
// mass slide left and the hatched risk shrink, rather than watching a number
// change. Purely presentational -- takes already-simulated results, computes
// no forecast math, reports interaction back up.

import { useId, useMemo, useRef } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { confidenceAtDay } from "@/lib/forecast/simulate";

export interface FieldScope {
  scopeId: string;
  name: string;
  dependsOnScopeIds: string[];
  targetDate: string | null;
}

export interface AxisSpec {
  minDay: number;
  maxDay: number;
  ticks: { day: number; label: string }[];
}

interface ForecastFieldProps {
  scopes: FieldScope[];
  baseline: Map<string, SimulationResult> | null;
  preview: Map<string, SimulationResult> | null;
  axis: AxisSpec | null;
  startDate: Date;
  dirty: boolean;
  selectedScopeId: string | null;
  onSelectScope: (scopeId: string) => void;
  onScrubTarget: (scopeId: string, isoDate: string) => void;
  pendingTargets: Map<string, string>;
  onSaveTarget: (scopeId: string) => void;
  /** Latest likely date across the portfolio -- the page's headline answer
      to "where are we headed", and the delta the scenario moved it by. */
  portfolioLikely: Date | null;
  portfolioDeltaDays: number;
  /** Which Scope is actually setting the portfolio date. Without this, a
      scenario that pulls two scopes in but leaves the headline untouched
      looks broken rather than gated. */
  portfolioGatedBy: string | null;
}

const NAME_COL = 178;
const BINS = 96;
const VB_H = 100; // ridge viewBox height; the SVG stretches to the row
const RIDGE_TOP = 30; // headroom for the target flag to sit clear of the peak
const RIDGE_BOTTOM = 18;
// The tallest bin stops short of the box so the curve reads as a shape with
// air above it rather than a fill clipped by its own container.
const PEAK_FILL = 0.86;

function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
function fmtLong(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d;
}
function dayOffset(startDate: Date, date: Date): number {
  return (date.getTime() - startDate.getTime()) / 86400000;
}
// Move an ISO date (or a full ISO timestamp from the DB) by whole days,
// staying in UTC calendar days and returning a plain YYYY-MM-DD.
function shiftIsoDay(iso: string, days: number): string {
  const d = new Date(iso);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
// Whole calendar days between two instants. Used for the target slider's
// announced value: startDate carries a time-of-day, so the raw fractional
// offset rounds two adjacent dates to the same integer and a screen reader
// would hear the same number twice while the date visibly advanced.
// Positioning still uses the precise fractional offset.
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86400000);
}
function confidenceTone(pct: number): string {
  return pct >= 70 ? "var(--i-mint)" : pct >= 40 ? "var(--i-amber)" : "var(--i-red)";
}

function ridgePath(
  daysSorted: number[],
  minDay: number,
  maxDay: number,
  width: number,
  height: number,
  close: boolean
): string {
  if (daysSorted.length === 0 || width <= 0) return "";
  const span = maxDay - minDay || 1;
  const counts = new Array<number>(BINS).fill(0);
  for (const d of daysSorted) {
    const t = (d - minDay) / span;
    if (t < 0 || t > 1) continue;
    counts[Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))] += 1;
  }
  // Light 5-tap smoothing -- enough to read as a distribution rather than a
  // comb, not enough to invent shape the trials don't have.
  const kernel = [1, 3, 5, 3, 1];
  const smoothed = counts.map((_, i) => {
    let sum = 0;
    let wsum = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j < 0 || j >= BINS) continue;
      sum += counts[j] * kernel[k + 2];
      wsum += kernel[k + 2];
    }
    return wsum === 0 ? 0 : sum / wsum;
  });
  const peak = Math.max(...smoothed, 1);
  const pts = smoothed.map((v, i) => [((i + 0.5) / BINS) * width, height - (v / peak) * height * PEAK_FILL] as const);

  let d = `M 0 ${height} L ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
    if (i === pts.length - 1) d += ` L ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return close ? d + ` L ${width} ${height} Z` : d;
}

export default function ForecastField({
  scopes,
  baseline,
  preview,
  axis,
  startDate,
  dirty,
  selectedScopeId,
  onSelectScope,
  onScrubTarget,
  pendingTargets,
  onSaveTarget,
  portfolioLikely,
  portfolioDeltaDays,
  portfolioGatedBy,
}: ForecastFieldProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragScope = useRef<string | null>(null);

  const pct = (day: number): number => {
    if (!axis) return 0;
    const span = Math.max(1, axis.maxDay - axis.minDay);
    return Math.min(100, Math.max(0, ((day - axis.minDay) / span) * 100));
  };

  const dayFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || !axis) return 0;
    const rect = el.getBoundingClientRect();
    const t = (clientX - rect.left - NAME_COL) / (rect.width - NAME_COL);
    return axis.minDay + Math.max(0, Math.min(1, t)) * (axis.maxDay - axis.minDay);
  };

  function beginScrub(scopeId: string, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragScope.current = scopeId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onScrubTarget(scopeId, addDays(startDate, dayFromClientX(e.clientX)).toISOString().slice(0, 10));
  }
  function moveScrub(e: React.PointerEvent) {
    if (!dragScope.current) return;
    onScrubTarget(dragScope.current, addDays(startDate, dayFromClientX(e.clientX)).toISOString().slice(0, 10));
  }
  function endScrub(e: React.PointerEvent) {
    if (!dragScope.current) return;
    dragScope.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const byId = useMemo(() => new Map(scopes.map((s) => [s.scopeId, s])), [scopes]);
  const todayPct = pct(0);

  return (
    <div ref={trackRef} className="relative flex-1 min-h-0 flex flex-col">
      {/* Portfolio headline: the whole point of this page in one line -- the
          last date anything lands on, which is what "when does this all
          ship" actually means across scopes. */}
      <div
        className="shrink-0 flex items-end gap-4 px-4 pt-3 pb-2.5"
        style={{ borderBottom: "1px solid var(--i-border)" }}
      >
        <div>
          <div className="i-label">Portfolio lands</div>
          <div className="flex items-baseline gap-2.5 mt-1.5">
            <span
              className="i-readout text-[27px] leading-none"
              style={{ color: dirty && portfolioDeltaDays !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
            >
              {portfolioLikely ? fmtLong(portfolioLikely) : "—"}
            </span>
            {dirty && portfolioDeltaDays !== 0 && (
              <span
                className="i-readout text-[13px]"
                style={{ color: portfolioDeltaDays < 0 ? "var(--i-mint)" : "var(--i-red)" }}
              >
                {portfolioDeltaDays < 0 ? `${Math.abs(portfolioDeltaDays)}d earlier` : `${portfolioDeltaDays}d later`}
              </span>
            )}
            {dirty && portfolioDeltaDays === 0 && portfolioGatedBy && (
              <span className="text-[11px] text-[var(--i-amber)]">still gated by {portfolioGatedBy}</span>
            )}
          </div>
          {portfolioGatedBy && !(dirty && portfolioDeltaDays === 0) && (
            <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">
              set by {portfolioGatedBy}, the last scope to land
            </div>
          )}
        </div>
        <div className="flex-1" />
        {/* Legend. Four marks, four meanings -- the field uses no colour or
            texture that isn't named here. */}
        <div className="flex items-center gap-4 pb-0.5">
          <LegendItem swatch={<span className="block h-2 w-6 rounded-sm" style={{ background: "var(--i-text)", opacity: 0.3 }} />}>
            outcomes
          </LegendItem>
          <LegendItem
            swatch={
              <span className="block h-2 w-6 i-hatch rounded-sm" style={{ border: "1px solid rgba(224,176,74,0.4)" }} />
            }
          >
            past target
          </LegendItem>
          {dirty && (
            <LegendItem
              swatch={
                <span
                  className="block w-6"
                  style={{ borderTop: "1.5px dashed var(--i-reality)", height: 1 }}
                />
              }
            >
              reality
            </LegendItem>
          )}
        </div>
      </div>

      {/* Ruler */}
      <div className="relative shrink-0" style={{ height: 22, paddingLeft: NAME_COL }}>
        <div className="relative h-full">
          {axis?.ticks.map((t) => (
            <div key={t.day} className="absolute top-0 h-full" style={{ left: `${pct(t.day)}%` }}>
              <div className="i-label absolute top-2 -translate-x-1/2 whitespace-nowrap">{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col justify-center overflow-y-auto">
        {/* One shared coordinate system behind every row. */}
        <div className="absolute inset-0 pointer-events-none" style={{ left: NAME_COL }} aria-hidden>
          {axis?.ticks.map((t) => (
            <div
              key={t.day}
              className="absolute inset-y-0 w-px"
              style={{ left: `${pct(t.day)}%`, background: "var(--i-border)", opacity: 0.35 }}
            />
          ))}
          <div
            className="absolute inset-y-0 w-px"
            style={{ left: `${todayPct}%`, background: "var(--i-text-soft)", opacity: 0.4 }}
          />
        </div>

        {scopes.map((s) => {
          const b = baseline?.get(s.scopeId);
          const p = preview?.get(s.scopeId) ?? b;
          if (!p) return null;

          const selected = s.scopeId === selectedScopeId;
          const deltaDays = dirty && b ? Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000) : 0;
          const moved = dirty && !!b && Math.abs(deltaDays) >= 1;
          const deltaColor = deltaDays < 0 ? "var(--i-mint)" : deltaDays > 0 ? "var(--i-red)" : "var(--i-text-soft)";

          const pendingTarget = pendingTargets.get(s.scopeId);
          const targetIso = pendingTarget ?? s.targetDate;
          const targetDay = targetIso ? dayOffset(startDate, new Date(targetIso)) : null;
          const targetDirty = pendingTarget !== undefined && pendingTarget !== (s.targetDate?.slice(0, 10) ?? "");
          const confAtTarget = targetDay !== null ? confidenceAtDay(p.completionDaysSorted, targetDay) : null;

          return (
            <div
              key={s.scopeId}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${s.name}, likely ${fmtLong(p.likelyDate)}${confAtTarget !== null ? `, ${confAtTarget}% by target` : ""}`}
              onClick={() => onSelectScope(s.scopeId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectScope(s.scopeId);
                }
              }}
              className="relative outline-none transition-colors duration-150"
              style={{
                flex: "1 1 0",
                minHeight: 116,
                maxHeight: 260,
                paddingLeft: NAME_COL,
                background: selected ? "rgba(155,140,250,0.045)" : undefined,
                borderBottom: "1px solid var(--i-border)",
              }}
            >
              {selected && (
                <div className="absolute left-0 inset-y-0 w-[2px] z-10" style={{ background: "var(--i-violet)" }} aria-hidden />
              )}

              <div className="absolute left-0 top-0 h-full flex flex-col justify-center pl-4 pr-3" style={{ width: NAME_COL }}>
                <div
                  className="text-[12px] font-medium truncate uppercase tracking-[0.06em]"
                  style={{ color: selected ? "var(--i-text)" : "var(--i-text-soft)" }}
                >
                  {s.name}
                </div>
                <div
                  className="i-readout text-[21px] mt-1.5 leading-none"
                  style={{ color: moved ? "var(--i-violet)" : "var(--i-text)" }}
                >
                  {fmtShort(p.likelyDate)}
                </div>
                <div className="mt-1.5 h-[13px]">
                  {moved ? (
                    <span className="text-[10.5px] font-medium" style={{ color: deltaColor }}>
                      {deltaDays < 0 ? `${Math.abs(deltaDays)}d earlier` : `${deltaDays}d later`}
                    </span>
                  ) : s.dependsOnScopeIds.length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectScope(s.dependsOnScopeIds[0]);
                      }}
                      className="text-left text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] truncate max-w-full"
                    >
                      waits on {s.dependsOnScopeIds.map((id) => byId.get(id)?.name ?? id).join(", ")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="relative h-full">
                <Ridge
                  result={p}
                  reality={moved ? b : undefined}
                  axis={axis}
                  dirty={dirty}
                  targetPct={targetDay !== null ? pct(targetDay) : null}
                />

                {/* P50 stem */}
                <div
                  className="absolute transition-[left] duration-200 ease-out pointer-events-none z-[2]"
                  style={{ left: `${pct(p.percentiles.p50)}%`, top: RIDGE_TOP, bottom: RIDGE_BOTTOM }}
                  aria-hidden
                >
                  <div className="w-px h-full" style={{ background: moved ? "var(--i-violet)" : "var(--i-text)", opacity: 0.8 }} />
                  <div
                    className="absolute -translate-x-1/2 rounded-full"
                    style={{
                      left: 0.5,
                      bottom: -2.5,
                      width: 5,
                      height: 5,
                      background: moved ? "var(--i-violet)" : "var(--i-text)",
                    }}
                  />
                </div>

                {/* Target flag -- a real control. Drag it or arrow-key it and
                    the probability under it, and the hatched miss-tail
                    behind it, both update live. */}
                {targetDay !== null && (
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label={`${s.name} target date`}
                    aria-valuetext={`${fmtLong(new Date(targetIso!))}, ${confAtTarget ?? 0} percent likely by then`}
                    aria-valuenow={calendarDaysBetween(startDate, new Date(targetIso!))}
                    aria-valuemin={Math.round(axis?.minDay ?? 0)}
                    aria-valuemax={Math.round(axis?.maxDay ?? 0)}
                    onPointerDown={(e) => beginScrub(s.scopeId, e)}
                    onPointerMove={moveScrub}
                    onPointerUp={endScrub}
                    onPointerCancel={endScrub}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 7 : 1;
                      let dir = 0;
                      if (e.key === "ArrowRight") dir = step;
                      if (e.key === "ArrowLeft") dir = -step;
                      if (dir === 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      // Step the DATE, not the day-offset. Going via the
                      // offset meant adding a day to a fractional number
                      // (startDate carries a time, the target does not) and
                      // then truncating back to an ISO date -- which could
                      // resolve to the same day twice and leave the flag
                      // stuck under repeated presses.
                      onScrubTarget(s.scopeId, shiftIsoDay(targetIso!, dir));
                    }}
                    className="absolute inset-y-0 cursor-ew-resize touch-none z-[3]"
                    style={{ left: `${pct(targetDay)}%`, width: 18, marginLeft: -9 }}
                  >
                    <div
                      className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
                      style={{ background: confAtTarget !== null ? confidenceTone(confAtTarget) : "var(--i-amber)", opacity: 0.9 }}
                    />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-1.5 flex items-center gap-1.5 rounded-[3px] px-1.5 py-[3px] whitespace-nowrap"
                      style={{
                        background: "var(--i-void)",
                        border: `1px solid ${confAtTarget !== null ? confidenceTone(confAtTarget) : "var(--i-amber)"}`,
                      }}
                    >
                      <span
                        className="i-readout text-[11px] leading-none"
                        style={{ color: confAtTarget !== null ? confidenceTone(confAtTarget) : "var(--i-amber)" }}
                      >
                        {confAtTarget !== null ? `${confAtTarget}%` : "—"}
                      </span>
                      <span className="text-[9px] text-[var(--i-text-faint)] leading-none uppercase tracking-wider">
                        {fmtShort(new Date(targetIso!))}
                      </span>
                    </div>
                    {targetDirty && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveTarget(s.scopeId);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute left-1/2 -translate-x-1/2 bottom-2 rounded-[3px] px-2 py-[3px] text-[9.5px] whitespace-nowrap font-medium"
                        style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
                      >
                        Save target
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative shrink-0" style={{ height: 15, paddingLeft: NAME_COL }} aria-hidden>
        <div className="relative h-full">
          <div className="i-label absolute -translate-x-1/2" style={{ left: `${todayPct}%` }}>
            Today
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span className="i-label">{children}</span>
    </span>
  );
}

function Ridge({
  result,
  reality,
  axis,
  dirty,
  targetPct,
}: {
  result: SimulationResult;
  reality: SimulationResult | undefined;
  axis: AxisSpec | null;
  dirty: boolean;
  targetPct: number | null;
}) {
  const uid = useId().replace(/:/g, "");
  const W = 1000;
  const paths = useMemo(() => {
    if (!axis) return { active: "", ghost: "" };
    return {
      active: ridgePath(result.completionDaysSorted, axis.minDay, axis.maxDay, W, VB_H, true),
      ghost: reality ? ridgePath(reality.completionDaysSorted, axis.minDay, axis.maxDay, W, VB_H, false) : "",
    };
  }, [result, reality, axis]);

  const fill = dirty ? "var(--i-violet)" : "var(--i-text)";
  const missX = targetPct === null ? null : (targetPct / 100) * W;

  // Wrapped in a positioned div: an <svg> is a replaced element, so giving
  // it both `top` and `bottom` does not stretch it the way it would a div --
  // it keeps its intrinsic aspect ratio and leaves the baseline floating
  // above the row. The wrapper owns the geometry; the svg just fills it.
  return (
    <div className="absolute pointer-events-none" style={{ top: RIDGE_TOP, bottom: RIDGE_BOTTOM, left: 0, right: 0 }}>
      <svg
        className="w-full h-full block"
        viewBox={`0 0 ${W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={dirty ? 0.5 : 0.34} />
          <stop offset="100%" stopColor={fill} stopOpacity={0.06} />
        </linearGradient>
        {/* The hatch is the Instrument's only texture and means exactly one
            thing: outcomes that land after the target. */}
        <pattern id={`h-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="7" height="7" fill="var(--i-red)" fillOpacity="0.1" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--i-red)" strokeWidth="1.4" strokeOpacity="0.5" />
        </pattern>
        {missX !== null && (
          <clipPath id={`c-${uid}`}>
            <rect x={missX} y={0} width={Math.max(0, W - missX)} height={VB_H} />
          </clipPath>
        )}
      </defs>

      <path d={paths.active} fill={`url(#g-${uid})`} />
      {missX !== null && <path d={paths.active} fill={`url(#h-${uid})`} clipPath={`url(#c-${uid})`} />}
      <path d={paths.active} fill="none" stroke={fill} strokeWidth={1.4} vectorEffect="non-scaling-stroke" opacity={0.85} />
        {paths.ghost && (
          <path
            d={paths.ghost}
            fill="none"
            stroke="var(--i-reality)"
            strokeWidth={1.3}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.95}
          />
        )}
      </svg>
    </div>
  );
}
