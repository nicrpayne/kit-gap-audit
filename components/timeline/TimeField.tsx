"use client";

// THE TIME FIELD — the hero object.
//
// One absolute axis. Every lane draws against it, so two marks at the same
// x are at the same moment. NOW is a hard boundary in the material, not a
// label: everything left of it is MEMORY (things that happened, evidence
// behind them, light accumulating as the playhead crosses them) and
// everything right of it is INTENT (planned, targeted, forecast — drawn
// outlined and unsettled, because it has not happened).
//
// The one rule that makes the distinction honest: a planned landmark whose
// date is behind NOW is NOT redrawn as memory. It stays outlined and is
// named OVERDUE. Converting it would erase the most useful thing on the
// screen.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { TimelineEntry, TimelineLane, ForecastSnapshot, TimelineCandidate } from "@/lib/timeline/entries";
import { xFor, tFor, ticksFor, scaleFor, fmtDay, type TimeView } from "@/lib/timeline/geometry";

export const HEADER_H = 34;
export const LANE_HEADER_W = 146;
/** The field FILLS the instrument. Lanes grow to use the height rather than
    sitting in a short band above a void -- the time field is the hero, and
    a hero that occupies a third of the screen is not one. Clamped so four
    lanes do not become four enormous empty strips, and eight still fit. */
export const MIN_LANE_H = 84;
export const MAX_LANE_H = 152;

// One material per source of truth. Not a palette — a vocabulary, so the
// score reads as a small closed set rather than a rainbow.
export const FAMILY_COLOR: Record<string, string> = {
  forecast: "var(--i-violet)",
  decision: "var(--i-amber)",
  finding: "var(--i-red)",
  context: "#8fb8e8",
  work: "var(--i-mint)",
  landmark: "var(--i-signal)",
};

interface Props {
  lanes: TimelineLane[];
  entries: TimelineEntry[];
  candidates: TimelineCandidate[];
  snapshotsByScope: Record<string, ForecastSnapshot[]>;
  memoryByScope: Record<string, ForecastSnapshot | null>;
  view: TimeView;
  nowT: number;
  playheadT: number;
  crossed: Set<string>;
  selectedId: string | null;
  hoveredLane: string | null;
  onSelect: (id: string | null) => void;
  onHoverLane: (scopeId: string | null) => void;
  onScrub: (t: number) => void;
  onOpenScope: (scopeId: string) => void;
  onViewChange: (next: { startT: number; endT: number }) => void;
  bounds: { startT: number; endT: number };
  reducedMotion: boolean;
  laneH: number;
}

/** The compact object every event on the score is drawn as. One family,
    six materials, three states (ahead / crossed / selected). */
function EventMark({
  entry, x, y, crossed, selected, onSelect, reducedMotion,
}: {
  entry: TimelineEntry; x: number; y: number; crossed: boolean; selected: boolean;
  onSelect: () => void; reducedMotion: boolean;
}) {
  const color = FAMILY_COLOR[entry.family] ?? "var(--i-text-soft)";
  const planned = entry.temporalState === "planned";
  const overdue = planned && Boolean((entry.detail as { overdue?: boolean }).overdue);
  const isReport = entry.kind === "report";

  // Reports are the spine of forecast memory, so they get a taller, more
  // deliberate mark. Everything else is a compact node.
  const w = isReport ? 3 : 9;
  const h = isReport ? 26 : 9;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ cursor: "pointer" }}
      data-shoot={`event-${entry.id}`}
      data-crossed={crossed || undefined}
      data-planned={planned || undefined}
      data-overdue={overdue || undefined}
    >
      {/* grab area, larger than the drawn mark */}
      <rect x={-6} y={-12} width={12} height={24} fill="transparent" />
      {selected && (
        <circle r={13} fill="none" stroke={color} strokeWidth={1} opacity={0.9} />
      )}
      {isReport ? (
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5}
          fill={crossed ? color : "none"}
          stroke={color}
          strokeWidth={1}
          opacity={crossed ? 0.95 : 0.34}
          style={reducedMotion ? undefined : { transition: "opacity 320ms ease, fill 320ms ease" }}
        />
      ) : planned ? (
        // INTENT: outlined, hollow, unsettled. Overdue keeps the outline
        // and takes a warning stroke — it is still not history.
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h}
          transform="rotate(45)"
          fill="none"
          stroke={overdue ? "var(--i-red)" : color}
          strokeWidth={overdue ? 1.6 : 1.1}
          strokeDasharray={overdue ? undefined : "2 1.6"}
          opacity={0.95}
        />
      ) : (
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h}
          transform="rotate(45)"
          fill={color}
          stroke={color}
          strokeWidth={1}
          opacity={crossed ? 1 : 0.3}
          style={reducedMotion ? undefined : { transition: "opacity 320ms ease" }}
        />
      )}
      {crossed && !planned && (
        <circle r={selected ? 11 : 8} fill={color} opacity={selected ? 0.2 : 0.1} />
      )}
    </g>
  );
}

/** FORECAST MEMORY. p10–p90 is UNCERTAINTY, not duration, so it is drawn
    as a soft tapered band with a hard p50 marker — deliberately unlike the
    solid rectangle a duration span uses. It moves only when the playhead
    crosses a Report; between Reports it holds. */
function MemoryBand({
  snap, view, y, held,
}: { snap: ForecastSnapshot; view: TimeView; y: number; held: boolean }) {
  const x10 = xFor(view, new Date(snap.earliestDate).getTime());
  const x50 = xFor(view, new Date(snap.likelyDate).getTime());
  const x90 = xFor(view, new Date(snap.latestDate).getTime());
  const xT = snap.targetDate ? xFor(view, new Date(snap.targetDate).getTime()) : null;
  const h = 15;
  const id = `mem-${snap.reportId}`;

  return (
    <g data-shoot="forecast-memory" style={{ transition: "transform 420ms cubic-bezier(0.22,0.61,0.36,1)" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--i-violet)" stopOpacity={0.06} />
          <stop offset="50%" stopColor="var(--i-violet)" stopOpacity={held ? 0.3 : 0.42} />
          <stop offset="100%" stopColor="var(--i-violet)" stopOpacity={0.06} />
        </linearGradient>
      </defs>
      <rect x={x10} y={y - h / 2} width={Math.max(2, x90 - x10)} height={h} rx={h / 2} fill={`url(#${id})`} />
      <line x1={x10} y1={y} x2={x90} y2={y} stroke="var(--i-violet)" strokeWidth={0.75} opacity={0.35} />
      {/* p50 — what we believed the likely landing was */}
      <rect x={x50 - 1.2} y={y - 9} width={2.4} height={18} rx={1} fill="var(--i-violet)" opacity={0.95} />
      {/* the target AS IT WAS at that Report. A flag, never a fader. */}
      {xT !== null && (
        <g transform={`translate(${xT},${y})`} data-shoot="memory-target">
          <line x1={0} y1={-13} x2={0} y2={13} stroke="var(--i-amber)" strokeWidth={1} opacity={0.85} strokeDasharray="3 2" />
          <path d="M0,-13 L8,-10 L0,-7 Z" fill="var(--i-amber)" opacity={0.9} />
        </g>
      )}
    </g>
  );
}

export default function TimeField({
  lanes, entries, candidates, memoryByScope, view, nowT, playheadT, crossed,
  selectedId, hoveredLane, onSelect, onHoverLane, onScrub, onOpenScope,
  onViewChange, bounds, reducedMotion, laneH,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const scale = scaleFor(view);
  const ticks = useMemo(() => ticksFor(view, scale), [view, scale]);
  const height = HEADER_H + lanes.length * laneH;

  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.scopeId, i])), [lanes]);
  const byLane = useMemo(() => {
    const m = new Map<string, TimelineEntry[]>();
    for (const e of entries) {
      const list = m.get(e.scopeId) ?? [];
      list.push(e);
      m.set(e.scopeId, list);
    }
    return m;
  }, [entries]);

  const nowX = xFor(view, nowT);
  const playX = xFor(view, playheadT);

  // SCRUBBING. Pointer capture and a rect measured once per gesture, for
  // the same reason the Portfolio fader does it: nothing changing size
  // elsewhere may move the coordinate system mid-drag.
  const rect = useRef<{ left: number; width: number } | null>(null);
  const beginScrub = useCallback((e: React.PointerEvent) => {
    const el = hostRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    rect.current = { left: b.left, width: b.width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    onScrub(tFor({ ...view, width: b.width }, e.clientX - b.left));
  }, [onScrub, view]);

  const moveScrub = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !rect.current) return;
    onScrub(tFor({ ...view, width: rect.current.width }, e.clientX - rect.current.left));
  }, [onScrub, view]);

  const endScrub = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    rect.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // Wheel zoom anchored on the date under the pointer.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const span = view.endT - view.startT;
        const dt = (e.deltaX / Math.max(1, el.clientWidth)) * span;
        const startT = Math.max(bounds.startT, Math.min(bounds.endT - span, view.startT + dt));
        onViewChange({ startT, endT: startT + span });
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const b = el.getBoundingClientRect();
      const anchor = tFor({ ...view, width: b.width }, e.clientX - b.left);
      const span = view.endT - view.startT;
      const next = Math.min(bounds.endT - bounds.startT, Math.max(10 * 86400000, span * (e.deltaY > 0 ? 1.15 : 0.87)));
      const p = (anchor - view.startT) / span;
      let startT = anchor - next * p;
      startT = Math.max(bounds.startT, Math.min(bounds.endT - next, startT));
      onViewChange({ startT, endT: startT + next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, bounds, onViewChange]);

  return (
    <div className="flex-1 min-h-0 flex items-center" data-shoot="time-field">
      {/* LANE HEADERS — identity and one current readout. Not a dashboard. */}
      <div className="shrink-0 select-none" style={{ width: LANE_HEADER_W, borderRight: "1px solid var(--i-border)" }}>
        <div style={{ height: HEADER_H }} />
        {lanes.map((lane) => {
          const mem = memoryByScope[lane.scopeId] ?? null;
          const alive = hoveredLane === lane.scopeId;
          return (
            <button
              key={lane.scopeId}
              onClick={() => onOpenScope(lane.scopeId)}
              onMouseEnter={() => onHoverLane(lane.scopeId)}
              onMouseLeave={() => onHoverLane(null)}
              data-shoot={`lane-header-${lane.scopeId}`}
              className="w-full text-left px-3 flex flex-col justify-center transition-colors"
              style={{
                height: laneH,
                borderBottom: "1px solid var(--i-border)",
                background: alive ? "var(--i-panel)" : "transparent",
              }}
              title="Open in Scope"
            >
              <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--i-text)] truncate">{lane.name}</span>
              {mem ? (
                <span className="i-readout text-[13px] leading-none mt-1" style={{ color: "var(--i-violet)" }}>
                  {fmtDay(new Date(mem.likelyDate).getTime())}
                </span>
              ) : (
                <span className="text-[9px] mt-1 text-[var(--i-text-faint)]">no snapshot yet</span>
              )}
              {lane.dependsOnScopeIds.length > 0 && (
                <span className="text-[8px] mt-1 text-[var(--i-text-faint)] truncate">
                  waits on {lane.dependsOnScopeIds.map((d) => lanes.find((l) => l.scopeId === d)?.name ?? "—").join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* THE FIELD */}
      <div
        ref={hostRef}
        className="relative flex-1 min-w-0 overflow-hidden"
        style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerDown={beginScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onClick={() => onSelect(null)}
      >
        <svg width="100%" height={height} style={{ display: "block" }}>
          {/* FUTURE GROUND. Everything right of NOW sits on a different
              surface — the material difference, before any label. */}
          <defs>
            <pattern id="futureHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--i-border-strong)" strokeWidth="0.8" opacity="0.55" />
            </pattern>
            <linearGradient id="pastGlow" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--i-violet)" stopOpacity={0.0} />
              <stop offset="100%" stopColor="var(--i-violet)" stopOpacity={0.09} />
            </linearGradient>
          </defs>
          {/* INTENT GROUND. Everything right of NOW sits on a lighter,
              hatched surface -- the past/future difference is material,
              readable before any label is read. */}
          <rect x={nowX} y={0} width={Math.max(0, view.width - nowX)} height={height} fill="#0f1418" />
          <rect
            x={nowX} y={0} width={Math.max(0, view.width - nowX)} height={height}
            fill="url(#futureHatch)" opacity={0.75}
          />

          {/* MEMORY GROUND — crossed history sits on a faintly lit surface
              that grows behind the playhead as the story unfolds. */}
          <rect x={0} y={0} width={Math.max(0, Math.min(playX, nowX))} height={height} fill="url(#pastGlow)" />

          {/* time grid */}
          {ticks.map((t) => {
            const x = xFor(view, t.t);
            return (
              <g key={t.t}>
                <line x1={x} y1={HEADER_H - 6} x2={x} y2={height} stroke="var(--i-border)" strokeWidth={t.major ? 1 : 0.5} opacity={t.major ? 0.75 : 0.4} />
                <text x={x + 4} y={14} fontSize={9} fill="var(--i-text-faint)" style={{ letterSpacing: "0.08em" }}>
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* lane separators */}
          {lanes.map((lane, i) => (
            <g key={lane.scopeId}>
              <line
                x1={0} y1={HEADER_H + (i + 1) * laneH} x2={view.width} y2={HEADER_H + (i + 1) * laneH}
                stroke="var(--i-border)" strokeWidth={0.75} opacity={0.7}
              />
              {hoveredLane === lane.scopeId && (
                <rect x={0} y={HEADER_H + i * laneH} width={view.width} height={laneH} fill="var(--i-text)" opacity={0.02} />
              )}
            </g>
          ))}

          {/* CROSS-SCOPE DEPENDENCY. Structural context, drawn once and
              quietly: a relationship exists, and it has no timestamp. */}
          {lanes.map((lane, i) =>
            lane.dependsOnScopeIds.map((depId) => {
              const j = laneIndex.get(depId);
              if (j === undefined) return null;
              const y1 = HEADER_H + j * laneH + laneH / 2;
              const y2 = HEADER_H + i * laneH + laneH / 2;
              const x = Math.max(10, nowX - 26);
              return (
                <path
                  key={`${lane.scopeId}-${depId}`}
                  d={`M${x},${y1} C${x + 16},${y1} ${x + 16},${y2} ${x},${y2}`}
                  fill="none" stroke="var(--i-text-faint)" strokeWidth={0.85} opacity={0.3} strokeDasharray="2 3"
                />
              );
            })
          )}

          {/* per-lane content */}
          {lanes.map((lane, i) => {
            const yMid = HEADER_H + i * laneH + laneH / 2;
            const mem = memoryByScope[lane.scopeId] ?? null;
            const laneEntries = byLane.get(lane.scopeId) ?? [];
            return (
              <g key={lane.scopeId}>
                {mem && <MemoryBand snap={mem} view={view} y={yMid + 20} held />}
                {laneEntries.map((e) => {
                  const t = new Date(e.date).getTime();
                  const x = xFor(view, t);
                  if (x < -30 || x > view.width + 30) return null;
                  // Duration landmarks get a restrained span; nothing else
                  // becomes a bar just to look like a chart.
                  const endT = e.endDate ? new Date(e.endDate).getTime() : null;
                  return (
                    <g key={e.id}>
                      {endT && (
                        <rect
                          x={x} y={yMid - 4} width={Math.max(2, xFor(view, endT) - x)} height={8} rx={2}
                          fill={FAMILY_COLOR[e.family]} opacity={crossed.has(e.id) ? 0.28 : 0.12}
                          stroke={FAMILY_COLOR[e.family]} strokeWidth={0.6} strokeOpacity={0.5}
                          data-shoot="duration-span"
                        />
                      )}
                      <EventMark
                        entry={e} x={x} y={yMid - 12}
                        crossed={crossed.has(e.id)}
                        selected={selectedId === e.id}
                        onSelect={() => onSelect(e.id)}
                        reducedMotion={reducedMotion}
                      />
                    </g>
                  );
                })}
                {/* DATED CANDIDATES — spectral, unmistakably not Reality. */}
                {candidates
                  .filter((c) => c.scopeId === lane.scopeId && c.date)
                  .map((c) => {
                    const x = xFor(view, new Date(c.date!).getTime());
                    if (x < -20 || x > view.width + 20) return null;
                    return (
                      <g
                        key={c.id}
                        transform={`translate(${x},${yMid - 12})`}
                        data-shoot={`candidate-${c.id}`}
                        onClick={(ev) => { ev.stopPropagation(); onSelect(`candidate:${c.id}`); }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect x={-6} y={-11} width={12} height={22} fill="transparent" />
                        <circle r={7} fill="var(--i-violet)" opacity={0.1} />
                        <rect
                          x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)"
                          fill="none" stroke="var(--i-violet)" strokeWidth={1} strokeDasharray="1.6 1.4" opacity={0.95}
                        />
                        {selectedId === `candidate:${c.id}` && (
                          <circle r={13} fill="none" stroke="var(--i-violet)" strokeWidth={1} />
                        )}
                      </g>
                    );
                  })}
              </g>
            );
          })}

          {/* NOW — a hard boundary in the material. */}
          <line x1={nowX} y1={0} x2={nowX} y2={height} stroke="var(--i-mint)" strokeWidth={1} opacity={0.55} />
          <text x={nowX + 5} y={height - 6} fontSize={8} fill="var(--i-mint)" opacity={0.75} style={{ letterSpacing: "0.16em" }}>
            NOW
          </text>

          {/* THE PLAYHEAD — hero object. */}
          <g
            data-shoot="playhead"
            style={reducedMotion ? undefined : { transition: "transform 90ms linear" }}
            transform={`translate(${playX},0)`}
          >
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={14} opacity={0.07} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={6} opacity={0.16} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={1.75} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="#d8d0ff" strokeWidth={0.6} opacity={0.75} />
          </g>
        </svg>

        {/* playhead date flag, in DOM so the type is crisp */}
        <div
          className="absolute pointer-events-none"
          style={{ left: playX, top: 0, transform: "translateX(-50%)" }}
          data-shoot="playhead-flag"
        >
          <div
            className="i-readout text-[10px] px-1.5 py-[3px] rounded-[3px] whitespace-nowrap"
            style={{ background: "var(--i-violet)", color: "var(--i-void)", letterSpacing: "0.02em" }}
          >
            {fmtDay(playheadT)}
          </div>
        </div>
      </div>
    </div>
  );
}
