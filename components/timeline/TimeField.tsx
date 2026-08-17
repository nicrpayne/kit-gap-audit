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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEntry, TimelineLane, ForecastSnapshot, TimelineCandidate } from "@/lib/timeline/entries";
import { xFor, tFor, ticksFor, scaleFor, fmtDay, type TimeView } from "@/lib/timeline/geometry";
import { FAMILY_COLOR } from "./familyColor";
import EventModule from "./EventModule";
import PlanObjectView from "./PlanObject";
import {
  isPlanObject, planObjectFor, packPlanRows, labelWidth, laneZones, planRowHeight,
  retime, snapDay, laneAtY, type LaneBox, type PlanGrip, type PlanObject,
} from "@/lib/timeline/plan";
import { prominenceFor, layerFor, type LayerState } from "@/lib/timeline/story";

export const HEADER_H = 34;
export const LANE_HEADER_W = 146;
/** How far a marker's hit area reaches when it has room, and the floor it
    keeps when neighbours crowd it. See `grabByLane`. */
const GRAB_HALF = 8;
const MIN_GRAB_HALF = 2;
/** The field FILLS the instrument. Lanes grow to use the height rather than
    sitting in a short band above a void -- the time field is the hero, and
    a hero that occupies a third of the screen is not one. Clamped so four
    lanes do not become four enormous empty strips, and eight still fit. */
export const MIN_LANE_H = 84;
export const MAX_LANE_H = 198;

export { FAMILY_COLOR };

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
  /** Per-lane geometry. Lanes are no longer uniform: opening one gives it
      the depth to show its plan while its siblings compress. */
  laneBoxes: LaneBox[];
  onToggleExpand: (scopeId: string) => void;
  /** Commit a retimed plan object. Called ONCE, on release -- never per
      pointermove. Everything before that is a local preview. */
  onPlanRetime: (id: string, next: { date: string; endDate: string | null; scopeId?: string }) => void;
  /** Seat a newly composed plan object. Called once, when the name is
      committed — a provisional object that is cancelled writes nothing. */
  onPlanCreate: (next: { scopeId: string; title: string; date: string; endDate: string | null }) => void;
  /** Events the playhead has just crossed and is briefly articulating. */
  articulating: Set<string>;
  /** Per lane, the snapshot the memory band just moved OFF -- drawn as a
      fading ghost so the movement is legible instead of a teleport. */
  ghostByScope: Record<string, ForecastSnapshot | null>;
  deltaByScope: Record<string, { fromLikely: string; toLikely: string; days: number } | null>;
  /** PRESENTATION ONLY. Which layers are drawn; the projection is whole
      whatever this says, and playback crosses every occurred entry either
      way. */
  layers: LayerState;
  hoveredId: string | null;
  onHoverEvent: (id: string | null) => void;
}

/** ONE EVENT OBJECT FAMILY.
 *
 * Every point in time is the same primitive: a small rotated node. What
 * differs is STATE, not type — because a surface where you must remember
 * that amber means Decision is a surface you have to decode before you can
 * read it, and the legend that made that possible was compensating for the
 * interface rather than explaining it.
 *
 * At rest the node is a quiet graphite object carrying only a faint trace
 * of its family's material. Attention is what colours it: woken, selected
 * or articulating, it takes the family colour fully and says its type in
 * words. State that matters at a glance — planned, overdue — keeps its own
 * unmistakable treatment, because "this was supposed to have happened" is
 * worth seeing before you ask anything.
 */
function EventMark({
  entry, x, y, crossed, selected, woken, prominence, grabL, grabR, onSelect, onHover, reducedMotion,
}: {
  entry: TimelineEntry; x: number; y: number; crossed: boolean; selected: boolean;
  woken: boolean; prominence: "primary" | "secondary"; grabL: number; grabR: number;
  onSelect: () => void; onHover: (on: boolean) => void; reducedMotion: boolean;
}) {
  const color = FAMILY_COLOR[entry.family] ?? "var(--i-text-soft)";
  const planned = entry.temporalState === "planned";
  const overdue = planned && Boolean((entry.detail as { overdue?: boolean }).overdue);
  const isReport = entry.kind === "report";
  const lit = woken || selected;
  const secondary = prominence === "secondary";

  // Scale carries prominence; colour carries attention.
  const base = isReport ? { w: 3, h: 22 } : { w: 11, h: 11 };
  const k = lit ? 1.5 : secondary ? 0.72 : 1;
  const w = base.w * k;
  const h = base.h * k;

  // The resting object. Graphite, with the family only as a trace.
  const restFill = "#1b2228";
  const restStroke = crossed ? color : "var(--i-border-strong)";
  const restOpacity = secondary ? (crossed ? 0.5 : 0.26) : crossed ? 0.95 : 0.5;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: "pointer" }}
      data-shoot={`event-${entry.id}`}
      data-crossed={crossed || undefined}
      data-planned={planned || undefined}
      data-overdue={overdue || undefined}
      data-prominence={prominence}
    >
      {/* The ONLY hit target. Everything drawn below is inert, so a lit
          marker's 38px halo can never stand between the pointer and the
          neighbour it is covering. */}
      <rect x={-grabL} y={-14} width={grabL + grabR} height={28} fill="transparent" />
      <g style={{ pointerEvents: "none" }}>
      {lit && <circle r={19} fill={color} opacity={0.13} />}
      {lit && <circle r={14} fill="none" stroke={color} strokeWidth={1} opacity={selected ? 0.95 : 0.65} />}

      {overdue ? (
        // OVERDUE. The one state that outranks everything: a plan whose
        // date has passed, still drawn as a plan, ringed so it cannot be
        // mistaken for history. No legend needed to feel wrong.
        <g data-shoot="overdue-mark">
          <circle r={11} fill="var(--i-red)" opacity={0.12} />
          <circle r={11} fill="none" stroke="var(--i-red)" strokeWidth={1.1} opacity={0.75} />
          <rect
            x={-w / 2} y={-h / 2} width={w} height={h} transform="rotate(45)"
            fill="none" stroke="var(--i-red)" strokeWidth={1.9}
          />
        </g>
      ) : planned ? (
        // INTENT. Hollow and unsettled, because it has not happened.
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h} transform="rotate(45)"
          fill="#0d1114"
          stroke={lit ? color : "var(--i-text-faint)"}
          strokeWidth={1.3}
          strokeDasharray="2.4 1.8"
          opacity={0.95}
        />
      ) : isReport ? (
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5}
          fill={lit ? color : restFill}
          stroke={lit ? color : restStroke}
          strokeWidth={1.1}
          opacity={lit ? 1 : restOpacity}
          style={reducedMotion ? undefined : { transition: "opacity 260ms ease, fill 260ms ease" }}
        />
      ) : (
        <rect
          x={-w / 2} y={-h / 2} width={w} height={h} transform="rotate(45)"
          fill={lit ? color : restFill}
          stroke={lit ? color : restStroke}
          strokeWidth={1.2}
          opacity={lit ? 1 : restOpacity}
          style={reducedMotion ? undefined : { transition: "opacity 260ms ease, fill 260ms ease" }}
        />
      )}
      </g>
    </g>
  );
}

/** FORECAST MEMORY — the remembered future, and a hero object.
 *
 * p10–p90 is UNCERTAINTY, not duration. It is drawn as a machined capsule
 * cut into the lane, with hard end terminals and a dominant p50 blade —
 * deliberately unlike the flat rectangle a duration span uses, so the two
 * can never be confused. Only three stored numbers are drawn; there is no
 * synthesized density curve, because p10/p50/p90 is all a Report kept.
 *
 * It moves only when the playhead crosses a Report. Between Reports it
 * holds, and the ghost of the previous band is what makes that movement
 * readable rather than a teleport.
 */
function MemoryBand({
  snap, view, y, ghost, reducedMotion,
}: { snap: ForecastSnapshot; view: TimeView; y: number; ghost?: boolean; reducedMotion?: boolean }) {
  const x10 = xFor(view, new Date(snap.earliestDate).getTime());
  const x50 = xFor(view, new Date(snap.likelyDate).getTime());
  const x90 = xFor(view, new Date(snap.latestDate).getTime());
  const xT = snap.targetDate ? xFor(view, new Date(snap.targetDate).getTime()) : null;
  const h = 26;
  const id = `mem-${snap.reportId}${ghost ? "-g" : ""}`;
  const op = ghost ? 0.3 : 1;

  return (
    <g
      data-shoot={ghost ? "forecast-memory-ghost" : "forecast-memory"}
      opacity={op}
      style={reducedMotion ? undefined : { transition: "opacity 520ms ease" }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--i-violet)" stopOpacity={0.05} />
          <stop offset="26%" stopColor="var(--i-violet)" stopOpacity={0.3} />
          <stop offset="50%" stopColor="var(--i-violet)" stopOpacity={0.46} />
          <stop offset="74%" stopColor="var(--i-violet)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--i-violet)" stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id={`${id}-d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.1} />
          <stop offset="55%" stopColor="#000000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.28} />
        </linearGradient>
      </defs>
      {/* the recess the band sits in */}
      <rect
        x={x10 - 2} y={y - h / 2 - 2} width={Math.max(6, x90 - x10 + 4)} height={h + 4} rx={(h + 4) / 2}
        fill="#070a0c" opacity={ghost ? 0 : 0.75}
      />
      <rect x={x10} y={y - h / 2} width={Math.max(2, x90 - x10)} height={h} rx={h / 2} fill={`url(#${id})`} />
      <rect x={x10} y={y - h / 2} width={Math.max(2, x90 - x10)} height={h} rx={h / 2} fill={`url(#${id}-d)`} />
      <rect
        x={x10} y={y - h / 2} width={Math.max(2, x90 - x10)} height={h} rx={h / 2}
        fill="none" stroke="var(--i-violet)" strokeWidth={0.9} opacity={0.4}
      />
      {/* p10 / p90 terminals — the range has ends, and they are stated */}
      {[x10, x90].map((x, i) => (
        <g key={i}>
          <rect x={x - 1} y={y - h / 2 + 3} width={2} height={h - 6} rx={1} fill="var(--i-violet)" opacity={0.7} />
        </g>
      ))}
      {/* p50 — DOMINANT. What we believed the likely landing was. */}
      <rect x={x50 - 2} y={y - h / 2 - 5} width={4} height={h + 10} rx={1.5} fill="var(--i-violet)" />
      <rect x={x50 - 2} y={y - h / 2 - 5} width={4} height={h + 10} rx={1.5} fill="#ffffff" opacity={0.18} />
      {!ghost && (
        <text x={x50} y={y - h / 2 - 9} fontSize={8.5} textAnchor="middle" fill="var(--i-violet)" style={{ letterSpacing: "0.06em" }}>
          {fmtDay(new Date(snap.likelyDate).getTime())}
        </text>
      )}
      {/* the target AS IT WAS at that Report. A flag, never a fader. */}
      {xT !== null && !ghost && (
        <g transform={`translate(${xT},${y})`} data-shoot="memory-target">
          <line x1={0} y1={-h / 2 - 4} x2={0} y2={h / 2 + 4} stroke="var(--i-amber)" strokeWidth={1} opacity={0.85} strokeDasharray="3 2" />
          <path d={`M0,${-h / 2 - 4} L9,${-h / 2 - 1} L0,${-h / 2 + 2} Z`} fill="var(--i-amber)" opacity={0.95} />
        </g>
      )}
    </g>
  );
}

export default function TimeField({
  lanes, entries, candidates, memoryByScope, view, nowT, playheadT, crossed,
  selectedId, hoveredLane, onSelect, onHoverLane, onScrub, onOpenScope,
  onViewChange, bounds, reducedMotion, laneBoxes, onToggleExpand,
  onPlanRetime, onPlanCreate, articulating, ghostByScope, deltaByScope,
  layers, hoveredId, onHoverEvent,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const scale = scaleFor(view);
  const ticks = useMemo(() => ticksFor(view, scale), [view, scale]);
  const boxOf = useMemo(() => new Map(laneBoxes.map((b) => [b.scopeId, b])), [laneBoxes]);
  const height = HEADER_H + laneBoxes.reduce((s, b) => s + b.height, 0);

  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.scopeId, i])), [lanes]);
  // THE SCORE AND THE PLAN ARE DIFFERENT SURFACES.
  //
  // Derived entries -- Reports, decisions, work, context, findings -- are
  // marks on the historical score line: things that happened, owned
  // elsewhere, arranged in time by this instrument and by nobody else.
  //
  // Landmarks are the rows Timeline owns, and they become PLAN OBJECTS in
  // their own band: named, sized to their real duration, and arrangeable.
  // The split is by source of truth, not by whether the date is ahead --
  // an occurred landmark stays the same object with its face filled in.
  const byLane = useMemo(() => {
    const m = new Map<string, TimelineEntry[]>();
    // Layer filtering is a DRAWING decision. `entries` is untouched, and
    // the client still hands playback the full occurred set, so turning a
    // layer off never changes what the story crosses.
    for (const e of entries.filter((x) => layers[layerFor(x)] && !isPlanObject(x))) {
      const list = m.get(e.scopeId) ?? [];
      list.push(e);
      m.set(e.scopeId, list);
    }
    return m;
  }, [entries, layers]);

  const planByLane = useMemo(() => {
    const m = new Map<string, PlanObject[]>();
    for (const e of entries.filter((x) => layers[layerFor(x)] && isPlanObject(x))) {
      const list = m.get(e.scopeId) ?? [];
      list.push(planObjectFor(e));
      m.set(e.scopeId, list);
    }
    return m;
  }, [entries, layers]);

  // POINT AT A THING, GET THAT THING.
  //
  // An 11px diamond is too small to catch reliably, so every marker carries
  // a transparent grab rect wider than the shape it stands for. At a dense
  // zoom two neighbours sit closer together than that rect is wide, and the
  // one drawn later swallows the earlier one's own centre — the marker
  // becomes literally unreachable by pointer, which is how a resting event
  // stops being able to explain itself.
  //
  // Each marker therefore claims only up to the midpoint between itself and
  // its nearest neighbour on that lane, separately on each side. The cells
  // tile the lane instead of overlapping it, so the nearest event always
  // wins and every drawn event owns the pixels directly above it.
  const grabByLane = useMemo(() => {
    const out = new Map<string, Map<string, { l: number; r: number }>>();
    for (const [scopeId, list] of byLane) {
      const xs = list
        .map((e) => ({ id: e.id, x: xFor(view, new Date(e.date).getTime()) }))
        .sort((a, b) => a.x - b.x);
      const cells = new Map<string, { l: number; r: number }>();
      for (let i = 0; i < xs.length; i++) {
        const left = i > 0 ? (xs[i].x - xs[i - 1].x) / 2 : GRAB_HALF;
        const right = i < xs.length - 1 ? (xs[i + 1].x - xs[i].x) / 2 : GRAB_HALF;
        cells.set(xs[i].id, {
          l: Math.max(MIN_GRAB_HALF, Math.min(GRAB_HALF, left)),
          r: Math.max(MIN_GRAB_HALF, Math.min(GRAB_HALF, right)),
        });
      }
      out.set(scopeId, cells);
    }
    return out;
  }, [byLane, view]);

  const nowX = xFor(view, nowT);
  const playX = xFor(view, playheadT);

  // ── PLAN LAYOUT ────────────────────────────────────────────────────
  //
  // Two activities running at the same time must LOOK like two activities
  // running at the same time. Each lane packs its plan objects into as many
  // compact subtracks as the overlap actually requires -- one row when
  // nothing overlaps, more only when something does. That is the useful
  // half of a Gantt; the rest of a Gantt is a task tracker.
  const planLayout = useMemo(() => {
    const out = new Map<string, { obj: PlanObject; x0: number; x1: number; row: number }[]>();
    const rows = new Map<string, number>();
    for (const [scopeId, objs] of planByLane) {
      const compact = (boxOf.get(scopeId)?.height ?? 0) < 130;
      const extents = objs.map((o) => {
        const x0 = xFor(view, o.startT);
        const x1 = o.endT !== null
          ? Math.max(x0 + 14, xFor(view, o.endT))
          : x0 + labelWidth(o.entry.title, compact);
        return { id: o.entry.id, x0, x1 };
      });
      const { rowOf, rowCount } = packPlanRows(extents);
      rows.set(scopeId, rowCount);
      out.set(
        scopeId,
        objs.map((o, i) => ({ obj: o, x0: extents[i].x0, x1: extents[i].x1, row: rowOf.get(o.entry.id) ?? 0 }))
      );
    }
    return { placed: out, rowCount: rows };
  }, [planByLane, view, boxOf]);

  /** A lane's bands, sized to the plan subtracks it actually carries — so
      an opened lane spends its extra height on readable rows rather than on
      a taller empty strip. */
  const zonesOf = useCallback(
    (box: LaneBox) => laneZones(box, planLayout.rowCount.get(box.scopeId) ?? 1),
    [planLayout]
  );

  // ── RETIMING A PLAN OBJECT ─────────────────────────────────────────
  //
  // The Portfolio fader's law, applied to a horizontal axis: the pixels-to-
  // time conversion is fixed at pointerdown and never re-read, because
  // anything that resizes elsewhere mid-gesture would move the coordinate
  // system under the hand. Pointer capture keeps the gesture attached to the
  // object even when the pointer leaves it.
  //
  // NOTHING GOES OVER THE NETWORK UNTIL RELEASE. While dragging, the object
  // is drawn from local preview state at 60fps; on release the retimed dates
  // are committed once, deliberately.
  const [planDrag, setPlanDrag] = useState<{
    id: string; grip: PlanGrip; date: number; endDate: number | null; moved: boolean;
    /** The row the object sits on, so the readout can appear beside the
        hand rather than in a fixed corner of a different project's lane. */
    y: number;
    /** The lane the object would land in. Only a body drag may change it —
        an edge grip is retiming one end, not rehoming the activity. */
    scopeId: string;
  } | null>(null);
  const dragGeom = useRef<{
    msPerPx: number; clientX0: number; obj: PlanObject; fieldTop: number; homeScopeId: string;
  } | null>(null);

  const beginPlanDrag = useCallback(
    (obj: PlanObject, grip: PlanGrip, y: number, e: React.PointerEvent) => {
      const el = hostRef.current;
      if (!el || !obj.draggable) return;
      // A plan drag is not a scrub. Stopping here is what keeps the playhead
      // from chasing the pointer while an object is being placed.
      e.stopPropagation();
      e.preventDefault();
      const b = el.getBoundingClientRect();
      dragGeom.current = {
        msPerPx: (view.endT - view.startT) / Math.max(1, b.width),
        clientX0: e.clientX,
        obj,
        // FROZEN ONCE. Both axes are converted through geometry measured at
        // pointerdown, so a lane resizing mid-gesture can never move the
        // coordinate system under the hand.
        fieldTop: b.top,
        homeScopeId: obj.entry.scopeId,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setPlanDrag({
        id: obj.entry.id, grip, date: obj.startT, endDate: obj.endT,
        moved: false, y, scopeId: obj.entry.scopeId,
      });
    },
    [view]
  );

  const movePlanDrag = useCallback((e: React.PointerEvent) => {
    const g = dragGeom.current;
    if (!g || !planDrag) return;
    const dt = (e.clientX - g.clientX0) * g.msPerPx;
    const next = retime(g.obj, planDrag.grip, dt);
    // WHICH PROJECT IS UNDER THE HAND. Dragging an activity into another
    // lane says it belongs to that project — the dates come with it, because
    // moving a thing sideways is not the same as rescheduling it.
    const overLane = planDrag.grip === "move"
      ? laneAtY(laneBoxes, e.clientY - g.fieldTop - HEADER_H)
      : null;
    const scopeId = overLane?.scopeId ?? (planDrag.grip === "move" ? planDrag.scopeId : g.homeScopeId);
    setPlanDrag((p) =>
      p && p.date === next.date && p.endDate === next.endDate && p.scopeId === scopeId
        ? p
        : p && {
            ...p,
            date: next.date,
            endDate: next.endDate,
            scopeId,
            moved: p.moved || next.date !== g.obj.startT || next.endDate !== g.obj.endT || scopeId !== g.homeScopeId,
          }
    );
  }, [planDrag, laneBoxes]);

  const endPlanDrag = useCallback((e: React.PointerEvent) => {
    const g = dragGeom.current;
    const d = planDrag;
    dragGeom.current = null;
    setPlanDrag(null);
    if (e.currentTarget instanceof Element && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!g || !d) return;
    // A press that never moved is a SELECTION, not a retime. So is a drag
    // that snapped back to the day it started on, in the lane it started in.
    // Either way there is nothing to write, and writing anyway would burn a
    // mutation on a click.
    if (!d.moved) return;
    const sameDates = d.date === g.obj.startT && d.endDate === g.obj.endT;
    const sameLane = d.scopeId === g.homeScopeId;
    if (sameDates && sameLane) return;
    onPlanRetime(d.id, {
      date: new Date(d.date).toISOString(),
      endDate: d.endDate === null ? null : new Date(d.endDate).toISOString(),
      // Only sent when it actually changed, so an ordinary reschedule never
      // carries a redundant claim about which project owns the row.
      scopeId: sameLane ? undefined : d.scopeId,
    });
  }, [planDrag, onPlanRetime]);

  // ── COMPOSING ON THE CANVAS ────────────────────────────────────────
  //
  // The plan bed of each lane, right of NOW, IS the creation surface. Press
  // it and a moment appears at that date; drag it and an activity appears
  // across those dates; either way the object arrives already asking for
  // its name. No modal, because reaching into next month and naming what
  // goes there should not route through a form.
  //
  // The bed is a visible recess rather than an invisible hot zone, and it
  // is the ONLY place that creates — pressing the score line, the forecast
  // row or anywhere left of NOW still scrubs, so the transport keeps
  // working everywhere it used to.
  const [creating, setCreating] = useState<{
    scopeId: string; t0: number; t1: number; y: number; phase: "dragging" | "naming";
  } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  /** Which lane's bed the pointer is over, so the composing surface can
      say it is composable without every lane glowing all the time. */
  const [bedLive, setBedLive] = useState<string | null>(null);
  const createGeom = useRef<{ msPerPx: number; left: number } | null>(null);
  const draftInput = useRef<HTMLInputElement>(null);

  const beginCreate = useCallback(
    (scopeId: string, y: number, e: React.PointerEvent) => {
      const el = hostRef.current;
      if (!el) return;
      e.stopPropagation();
      e.preventDefault();
      const b = el.getBoundingClientRect();
      createGeom.current = { msPerPx: (view.endT - view.startT) / Math.max(1, b.width), left: b.left };
      const t = snapDay(tFor({ ...view, width: b.width }, e.clientX - b.left));
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDraftTitle("");
      setCreating({ scopeId, t0: t, t1: t, y, phase: "dragging" });
    },
    [view]
  );

  const moveCreate = useCallback((e: React.PointerEvent) => {
    const g = createGeom.current;
    if (!g || !creating || creating.phase !== "dragging") return;
    const t = snapDay(view.startT + (e.clientX - g.left) * g.msPerPx);
    setCreating((c) => (c && c.t1 === t ? c : c && { ...c, t1: t }));
  }, [creating, view]);

  const endCreate = useCallback((e: React.PointerEvent) => {
    if (e.currentTarget instanceof Element && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    createGeom.current = null;
    // The gesture is over; the object now exists provisionally and wants a
    // name. Nothing has been written — a provisional object that is never
    // named leaves no trace at all.
    setCreating((c) => (c && c.phase === "dragging" ? { ...c, phase: "naming" } : c));
  }, []);

  // Focus follows creation, so the very next thing a person does is type.
  useEffect(() => {
    if (creating?.phase === "naming") draftInput.current?.focus();
  }, [creating?.phase]);

  const commitCreate = useCallback(() => {
    const c = creating;
    const title = draftTitle.trim();
    if (!c || !title) return;
    const lo = Math.min(c.t0, c.t1);
    const hi = Math.max(c.t0, c.t1);
    setCreating(null);
    setDraftTitle("");
    onPlanCreate({
      scopeId: c.scopeId,
      title,
      // A press is a moment; a drag is an activity. The shape comes from the
      // gesture, which is the whole reason this path needs no shape control.
      date: new Date(lo).toISOString(),
      endDate: hi > lo ? new Date(hi).toISOString() : null,
    });
  }, [creating, draftTitle, onPlanCreate]);

  const cancelCreate = useCallback(() => {
    setCreating(null);
    setDraftTitle("");
  }, []);

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
          const box = boxOf.get(lane.scopeId);
          const open = box?.expanded ?? false;
          const tight = (box?.height ?? 0) < 108;
          const planned = (planByLane.get(lane.scopeId) ?? []).filter((o) => o.planned).length;
          return (
            <div
              key={lane.scopeId}
              onMouseEnter={() => onHoverLane(lane.scopeId)}
              onMouseLeave={() => onHoverLane(null)}
              data-shoot={`lane-header-${lane.scopeId}`}
              data-expanded={open || undefined}
              className="w-full px-3 flex flex-col justify-center transition-colors relative"
              style={{
                height: box?.height ?? 0,
                borderBottom: "1px solid var(--i-border)",
                background: open ? "var(--i-panel)" : alive ? "rgba(38,47,53,0.5)" : "transparent",
              }}
            >
              {/* THE DOOR IS THE NAME. The header now carries two
                  affordances, so the whole row can no longer navigate away
                  — clicking dead space should not throw you into another
                  instrument while you are reaching for the chevron. */}
              <button
                onClick={() => onOpenScope(lane.scopeId)}
                data-shoot={`lane-open-${lane.scopeId}`}
                className="text-left hover:brightness-125 transition-[filter]"
                title="Open in Scope"
              >
                <span className="block text-[11px] uppercase tracking-[0.1em] text-[var(--i-text)] truncate">{lane.name}</span>
              </button>
              {mem ? (
                <span className="i-readout text-[13px] leading-none mt-1" style={{ color: "var(--i-violet)" }}>
                  {fmtDay(new Date(mem.likelyDate).getTime())}
                </span>
              ) : (
                <span className="text-[9px] mt-1 text-[var(--i-text-faint)]">no snapshot yet</span>
              )}
              {!tight && lane.dependsOnScopeIds.length > 0 && (
                <span className="text-[8px] mt-1 text-[var(--i-text-faint)] truncate">
                  waits on {lane.dependsOnScopeIds.map((d) => lanes.find((l) => l.scopeId === d)?.name ?? "—").join(", ")}
                </span>
              )}
              {/* SHOW ME MORE OF THIS PROJECT.
                  A disclosure chevron and nothing else. It used to carry the
                  subtrack count, which asked the reader to think about a
                  layout mechanism they should never have to know exists —
                  the number was the implementation leaking into the control. */}
              <button
                onClick={() => onToggleExpand(lane.scopeId)}
                data-shoot={`lane-expand-${lane.scopeId}`}
                aria-expanded={open}
                aria-label={open ? `Collapse ${lane.name}` : `Show more of ${lane.name}`}
                title={open ? `Collapse ${lane.name}` : `Show more of ${lane.name}`}
                className="absolute right-1.5 top-1.5 rounded p-1.5 hover:brightness-150 transition-[filter]"
                style={{
                  background: open ? "var(--i-violet-soft)" : "transparent",
                  opacity: open || alive || planned > 0 ? 1 : 0.35,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  stroke={open ? "var(--i-violet)" : "var(--i-text-soft)"} strokeWidth="1.5"
                  style={{ transform: open ? "rotate(180deg)" : undefined, transition: reducedMotion ? undefined : "transform 200ms ease" }}>
                  <path d="M2 3.6 L5 6.6 L8 3.6" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* THE FIELD */}
      <div
        ref={hostRef}
        className="relative flex-1 min-w-0 overflow-hidden"
        style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerDown={beginScrub}
        // Pointer capture retargets to the grip and the event still bubbles
        // here, so one pair of handlers serves both gestures. A plan drag
        // always wins: it stopped propagation at pointerdown, so the
        // scrubber never armed.
        onPointerMove={(e) => (creating ? moveCreate(e) : planDrag ? movePlanDrag(e) : moveScrub(e))}
        onPointerUp={(e) => (creating ? endCreate(e) : planDrag ? endPlanDrag(e) : endScrub(e))}
        onPointerCancel={(e) => (creating ? endCreate(e) : planDrag ? endPlanDrag(e) : endScrub(e))}
        onClick={() => { if (!creating) onSelect(null); }}
      >
        <svg width="100%" height={height} style={{ display: "block" }}>
          {/* FUTURE GROUND. Everything right of NOW sits on a different
              surface — the material difference, before any label. */}
          <defs>
            <pattern id="futureHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--i-border-strong)" strokeWidth="0.8" opacity="0.55" />
            </pattern>
            <linearGradient id="pastGlow" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--i-violet)" stopOpacity={0.05} />
              <stop offset="72%" stopColor="var(--i-violet)" stopOpacity={0.13} />
              <stop offset="100%" stopColor="var(--i-violet)" stopOpacity={0.26} />
            </linearGradient>
            <linearGradient id="playedEdge" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--i-violet)" stopOpacity={0} />
              <stop offset="100%" stopColor="var(--i-violet)" stopOpacity={0.3} />
            </linearGradient>
            <pattern id="playedGrain" width="3" height="3" patternUnits="userSpaceOnUse">
              <rect width="3" height="3" fill="none" />
              <circle cx="0.6" cy="0.6" r="0.4" fill="var(--i-violet)" opacity="0.16" />
            </pattern>
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
          {/* PLAYED HISTORY. The part of the story already told carries a
              developed-film material that the un-played part does not —
              the narrative arc from BEGINNING to NOW, made physical. */}
          <rect x={0} y={0} width={Math.max(0, Math.min(playX, nowX))} height={height} fill="url(#pastGlow)" />
          <rect x={0} y={0} width={Math.max(0, Math.min(playX, nowX))} height={height} fill="url(#playedGrain)" />
          <rect
            x={Math.max(0, Math.min(playX, nowX)) - 26} y={0} width={26} height={height}
            fill="url(#playedEdge)" opacity={0.5}
          />

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

          {/* LANE TRACKS. Each lane carries a resting score line so events
              are articulations ON a track rather than marks floating in a
              void — and so a quiet stretch still reads as a track that
              nothing happened on, which is information. */}
          {laneBoxes.map((box) => {
            const z = zonesOf(box);
            const yTrack = HEADER_H + z.scoreY;
            return (
              <g key={`track-${box.scopeId}`}>
                <rect x={0} y={yTrack - 3} width={view.width} height={6} rx={3} fill="#070a0c" opacity={0.6} />
                <line x1={0} y1={yTrack} x2={view.width} y2={yTrack} stroke="var(--i-border-strong)" strokeWidth={0.9} opacity={0.5} />
                <line
                  x1={0} y1={yTrack} x2={Math.max(0, Math.min(playX, nowX))} y2={yTrack}
                  stroke="var(--i-violet)" strokeWidth={1.4} opacity={0.42}
                />
                {/* THE PLAN BED. The band the lane's plan objects are
                    seated in, cut into the surface so an object reads as
                    sitting IN the project rather than floating over it. It
                    runs the full width — a plan that has happened is still
                    a plan object, and it must not look unseated merely for
                    being behind NOW — and deepens on the intent side. */}
                <rect
                  x={0} y={HEADER_H + z.planTop - 3}
                  width={view.width} height={z.planRoom + 6} rx={4}
                  fill="#080b0d" opacity={0.34}
                />
                {/* THE COMPOSING SURFACE. Right of NOW the bed is live:
                    press it for a moment, drag it for an activity. It wakes
                    under the pointer so the affordance is discovered by
                    moving the mouse, not by reading a tip. */}
                <rect
                  data-shoot={`plan-bed-${box.scopeId}`}
                  x={nowX} y={HEADER_H + z.planTop - 3}
                  width={Math.max(0, view.width - nowX)} height={z.planRoom + 6} rx={4}
                  fill="#080b0d"
                  opacity={box.expanded ? 0.5 : 0.34}
                  style={{ cursor: "cell" }}
                  onPointerDown={(e) => beginCreate(box.scopeId, HEADER_H + z.planTop, e)}
                  onMouseEnter={() => setBedLive(box.scopeId)}
                  onMouseLeave={() => setBedLive((v) => (v === box.scopeId ? null : v))}
                />
                {bedLive === box.scopeId && !creating && !planDrag && (
                  <rect
                    x={nowX} y={HEADER_H + z.planTop - 3}
                    width={Math.max(0, view.width - nowX)} height={z.planRoom + 6} rx={4}
                    fill="none" stroke="var(--i-violet)" strokeWidth={0.9} opacity={0.28}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            );
          })}

          {/* lane separators */}
          {laneBoxes.map((box) => (
            <g key={box.scopeId}>
              <line
                x1={0} y1={HEADER_H + box.top + box.height} x2={view.width} y2={HEADER_H + box.top + box.height}
                stroke="var(--i-border)" strokeWidth={0.75} opacity={0.7}
              />
              {(hoveredLane === box.scopeId || box.expanded) && (
                <rect
                  x={0} y={HEADER_H + box.top} width={view.width} height={box.height}
                  fill="var(--i-text)" opacity={box.expanded ? 0.028 : 0.02}
                />
              )}
              {/* THE DESTINATION. While an activity is carried out of its
                  lane, the one it would land in wakes — a lane rather than a
                  drop zone, because the lane already is the target. */}
              {planDrag && planDrag.grip === "move" && planDrag.scopeId === box.scopeId && (
                <g data-shoot={`lane-destination-${box.scopeId}`} style={{ pointerEvents: "none" }}>
                  <rect
                    x={0} y={HEADER_H + box.top} width={view.width} height={box.height}
                    fill="var(--i-violet)" opacity={0.05}
                  />
                  <rect
                    x={0} y={HEADER_H + box.top + 0.5} width={view.width} height={box.height - 1}
                    fill="none" stroke="var(--i-violet)" strokeWidth={1} opacity={0.4}
                  />
                </g>
              )}
            </g>
          ))}

          {/* CROSS-SCOPE DEPENDENCY. Structural context, drawn once and
              quietly: a relationship exists, and it has no timestamp. */}
          {lanes.map((lane, i) =>
            lane.dependsOnScopeIds.map((depId) => {
              const j = laneIndex.get(depId);
              if (j === undefined) return null;
              // Structural context, not a beat in the story. Off unless the
              // layer is on or this lane is under the pointer — connecting
              // geometry should never be something you must read to follow
              // what happened.
              const show = layers.dependencies || hoveredLane === lane.scopeId || hoveredLane === depId;
              if (!show) return null;
              const bj = laneBoxes[j];
              const bi = laneBoxes[i];
              if (!bj || !bi) return null;
              const y1 = HEADER_H + bj.top + bj.height / 2;
              const y2 = HEADER_H + bi.top + bi.height / 2;
              const x = Math.max(10, nowX - 26);
              return (
                <path
                  key={`${lane.scopeId}-${depId}`}
                  d={`M${x},${y1} C${x + 16},${y1} ${x + 16},${y2} ${x},${y2}`}
                  fill="none"
                  stroke={hoveredLane === lane.scopeId || hoveredLane === depId ? "var(--i-signal)" : "var(--i-text-faint)"}
                  strokeWidth={0.9}
                  opacity={hoveredLane === lane.scopeId || hoveredLane === depId ? 0.6 : 0.24}
                  strokeDasharray="2 3"
                />
              );
            })
          )}

          {/* per-lane content */}
          {lanes.map((lane, i) => {
            const box = laneBoxes[i];
            if (!box) return null;
            const z = zonesOf(box);
            const yTrack = HEADER_H + z.scoreY;
            const yMem = HEADER_H + z.memY;
            const mem = memoryByScope[lane.scopeId] ?? null;
            const laneEntries = byLane.get(lane.scopeId) ?? [];
            const grabCells = grabByLane.get(lane.scopeId) ?? new Map();
            const placed = planLayout.placed.get(lane.scopeId) ?? [];
            const rowCount = planLayout.rowCount.get(lane.scopeId) ?? 0;
            const rowH = planRowHeight(z.planRoom, Math.max(1, rowCount));
            const objH = Math.max(9, rowH - 4);
            const compact = box.height < 130;
            return (
              <g key={lane.scopeId}>
                {ghostByScope[lane.scopeId] && (
                  <MemoryBand snap={ghostByScope[lane.scopeId]!} view={view} y={yMem} ghost reducedMotion={reducedMotion} />
                )}
                {mem && <MemoryBand snap={mem} view={view} y={yMem} reducedMotion={reducedMotion} />}
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
                          x={x} y={yTrack - 5} width={Math.max(2, xFor(view, endT) - x)} height={10} rx={3}
                          fill={FAMILY_COLOR[e.family]} opacity={crossed.has(e.id) ? 0.28 : 0.12}
                          stroke={FAMILY_COLOR[e.family]} strokeWidth={0.6} strokeOpacity={0.5}
                          data-shoot="duration-span"
                        />
                      )}
                      <EventMark
                        entry={e} x={x} y={yTrack}
                        crossed={crossed.has(e.id)}
                        selected={selectedId === e.id}
                        woken={articulating.has(e.id) || hoveredId === e.id}
                        prominence={prominenceFor(e)}
                        grabL={grabCells.get(e.id)?.l ?? GRAB_HALF}
                        grabR={grabCells.get(e.id)?.r ?? GRAB_HALF}
                        onSelect={() => onSelect(e.id)}
                        onHover={(on) => onHoverEvent(on ? e.id : null)}
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
                        transform={`translate(${x},${yTrack})`}
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

                {/* ── THE PLAN ─────────────────────────────────────────
                    Named objects at real calendar width, stacked into as
                    many subtracks as the overlap needs. Drawn last within
                    the lane so a plan object is always reachable above the
                    marks and the bed it sits in. */}
                {placed.map(({ obj, x0, x1, row }) => {
                  const live = planDrag?.id === obj.entry.id ? planDrag : null;
                  // While dragging, geometry comes from the LOCAL preview.
                  // Nothing has been written yet, and nothing will be until
                  // the pointer is released.
                  const sx = live ? xFor(view, live.date) : x0;
                  const ex = live
                    ? (live.endDate !== null ? Math.max(sx + 14, xFor(view, live.endDate)) : sx + labelWidth(obj.entry.title, compact))
                    : x1;
                  if (ex < -60 || sx > view.width + 60) return null;
                  return (
                    <PlanObjectView
                      key={obj.entry.id}
                      obj={obj}
                      x0={sx}
                      x1={ex}
                      y={HEADER_H + z.planTop + row * rowH}
                      h={objH}
                      selected={selectedId === obj.entry.id}
                      hovered={hoveredId === obj.entry.id}
                      dragging={!!live}
                      compact={compact}
                      reducedMotion={reducedMotion}
                      onSelect={() => onSelect(obj.entry.id)}
                      onHover={(on) => onHoverEvent(on ? obj.entry.id : null)}
                      onGrip={(grip, ev) => beginPlanDrag(obj, grip, HEADER_H + z.planTop + row * rowH, ev)}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* NOW — the seam between MEMORY and INTENT. A landmark, with a
              terminal at each end, not a hairline. Restrained, never neon. */}
          <g data-shoot="now-seam">
            <rect x={nowX - 3} y={0} width={6} height={height} fill="var(--i-signal)" opacity={0.05} />
            <line x1={nowX} y1={0} x2={nowX} y2={height} stroke="var(--i-signal)" strokeWidth={1.4} opacity={0.75} />
            <rect x={nowX - 3.5} y={0} width={7} height={5} rx={1} fill="var(--i-signal)" opacity={0.85} />
            <rect x={nowX - 3.5} y={height - 5} width={7} height={5} rx={1} fill="var(--i-signal)" opacity={0.85} />
            <text
              x={nowX + 7} y={height - 8} fontSize={8.5} fill="var(--i-signal)" opacity={0.95}
              style={{ letterSpacing: "0.22em", fontWeight: 600 }}
            >
              NOW
            </text>
          </g>

          {/* THE PLAYHEAD — hero object. */}
          <g
            data-shoot="playhead"
            style={reducedMotion ? undefined : { transition: "transform 90ms linear" }}
            transform={`translate(${playX},0)`}
          >
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={22} opacity={0.05} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={9} opacity={0.13} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="var(--i-violet)" strokeWidth={2} />
            <line x1={0} y1={0} x2={0} y2={height} stroke="#e2dcff" strokeWidth={0.7} opacity={0.85} />
            {/* the needle makes contact with every track it passes */}
            {laneBoxes.map((box) => {
              const cy = HEADER_H + zonesOf(box).scoreY;
              return (
                <g key={`contact-${box.scopeId}`}>
                  <circle cx={0} cy={cy} r={4.5} fill="var(--i-violet)" opacity={0.9} />
                  <circle cx={0} cy={cy} r={9} fill="var(--i-violet)" opacity={0.14} />
                </g>
              );
            })}
            <rect x={-5} y={0} width={10} height={7} rx={1.5} fill="var(--i-violet)" />
          </g>
        </svg>

        {/* ARTICULATED EVENTS. The transient readable module a note gets
            as it is struck, plus the held module for the selection. Both
            stay attached to their exact date and lane. */}
        {laneBoxes.map((box) => {
          const yTrack = HEADER_H + zonesOf(box).scoreY;
          const compact = box.height < 110;
          return (byLane.get(box.scopeId) ?? []).map((e) => {
            const held = selectedId === e.id;
            const live = articulating.has(e.id);
            // HOVER EXPLAINS. Pointing at a mark says what it is in words,
            // which is what makes a colour key unnecessary.
            const peek = hoveredId === e.id && !held && !live;
            if (!held && !live && !peek) return null;
            const x = xFor(view, new Date(e.date).getTime());
            if (x < -40 || x > view.width + 40) return null;
            const modW = compact ? 176 : 208;
            const clamped = Math.min(view.width - modW / 2 - 6, Math.max(modW / 2 + 6, x));
            return (
              <EventModule
                key={`mod-${e.id}`}
                entry={e}
                x={clamped}
                stemDx={x - clamped}
                y={yTrack - 18}
                phase={held ? "held" : live ? "articulating" : "peek"}
                reducedMotion={reducedMotion}
                compact={compact}
              />
            );
          });
        })}

        {/* THE REPORT TRANSITION. What the remembered future just did,
            stated as the movement between two stored numbers. Never
            attributed to anything — the adjacent event did not cause it. */}
        {laneBoxes.map((box) => {
          const lane = { scopeId: box.scopeId };
          const d = deltaByScope[lane.scopeId];
          if (!d) return null;
          const yMem = HEADER_H + zonesOf(box).memY;
          const later = d.days > 0;
          return (
            <div
              key={`delta-${lane.scopeId}`}
              data-shoot="memory-delta"
              className="absolute pointer-events-none rounded-md px-2.5 py-1.5 whitespace-nowrap"
              style={{
                left: Math.min(view.width - 190, Math.max(6, xFor(view, new Date(d.toLikely).getTime()) - 84)),
                top: yMem - 54,
                background: "linear-gradient(180deg, #1a1526 0%, #12101a 100%)",
                border: "1px solid var(--i-violet)",
                boxShadow: "0 10px 26px rgba(0,0,0,0.7)",
                animation: reducedMotion ? undefined : "tl-delta 2400ms ease forwards",
                zIndex: 28,
              }}
            >
              <div className="text-[7.5px] uppercase tracking-[0.16em]" style={{ color: "var(--i-violet)" }}>
                Forecast memory updated
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="i-readout text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                  {fmtDay(new Date(d.fromLikely).getTime())}
                </span>
                <span className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>→</span>
                <span className="i-readout text-[13px]" style={{ color: "var(--i-violet)" }}>
                  {fmtDay(new Date(d.toLikely).getTime())}
                </span>
                {d.days !== 0 && (
                  <span className="text-[9px]" style={{ color: later ? "var(--i-red)" : "var(--i-mint)" }}>
                    {Math.abs(d.days)}d {later ? "later" : "earlier"}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* THE PROVISIONAL OBJECT. It exists on the canvas the instant the
            gesture starts and is stored nowhere until it has a name — so
            sketching a shape and changing your mind costs exactly nothing. */}
        {creating && (() => {
          const lo = Math.min(creating.t0, creating.t1);
          const hi = Math.max(creating.t0, creating.t1);
          const x0 = xFor(view, lo);
          const x1 = xFor(view, hi);
          const isSpan = hi > lo;
          const w = Math.max(isSpan ? 20 : 0, x1 - x0);
          const days = Math.round((hi - lo) / 86400000);
          return (
            <div
              data-shoot="plan-draft"
              data-draft-span={isSpan || undefined}
              className="absolute"
              style={{ left: x0, top: creating.y, zIndex: 32, pointerEvents: creating.phase === "naming" ? "auto" : "none" }}
            >
              <div
                className="rounded-[3px] flex items-center"
                style={{
                  width: creating.phase === "naming" ? Math.max(w, 168) : Math.max(w, 6),
                  height: 22,
                  background: "linear-gradient(180deg, #2c3740 0%, #1a2127 100%)",
                  border: "1px solid var(--i-violet)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
                }}
              >
                <span className="shrink-0 rounded-[1.4px]" style={{ width: 3, height: 20, background: "var(--i-violet)", marginLeft: 1 }} />
                {creating.phase === "naming" ? (
                  <input
                    ref={draftInput}
                    data-shoot="plan-draft-input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitCreate(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelCreate(); }
                      e.stopPropagation();
                    }}
                    onBlur={cancelCreate}
                    placeholder={isSpan ? "Name this activity" : "Name this moment"}
                    className="flex-1 min-w-0 bg-transparent outline-none px-2 text-[10px]"
                    style={{ color: "var(--i-text)" }}
                  />
                ) : null}
              </div>
              {/* What the gesture is describing, stated while it happens. */}
              <div
                className="mt-1 whitespace-nowrap text-[9px] tabular-nums"
                style={{ color: "var(--i-violet)", letterSpacing: "0.04em" }}
              >
                {isSpan ? `${fmtDay(lo)} → ${fmtDay(hi)} · ${days}d` : fmtDay(lo)}
                {creating.phase === "naming" && (
                  <span style={{ color: "var(--i-text-faint)" }}> · ⏎ to place · esc to discard</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* THE DATES UNDER THE HAND. While a plan object is being retimed it
            states exactly where it will land — a drag that only shows a
            block sliding is asking you to guess. */}
        {planDrag && (
          <div
            data-shoot="plan-drag-readout"
            className="absolute pointer-events-none rounded-md px-2.5 py-1.5 whitespace-nowrap"
            style={{
              left: Math.min(view.width - 180, Math.max(6, xFor(view, planDrag.date) - 10)),
              top: Math.max(4, planDrag.y - 52),
              background: "linear-gradient(180deg, #1a1526 0%, #12101a 100%)",
              border: "1px solid var(--i-violet)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.72)",
              zIndex: 30,
            }}
          >
            <div className="text-[7.5px] uppercase tracking-[0.16em]" style={{ color: "var(--i-violet)" }}>
              {planDrag.grip === "move"
                ? planDrag.scopeId !== dragGeom.current?.homeScopeId
                  ? `Moving to ${lanes.find((l) => l.scopeId === planDrag.scopeId)?.name ?? "another project"}`
                  : "Rescheduling"
                : "Resizing"}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="i-readout text-[12.5px]" style={{ color: "var(--i-violet)" }}>
                {fmtDay(planDrag.date)}
              </span>
              {planDrag.endDate !== null && (
                <>
                  <span className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>→</span>
                  <span className="i-readout text-[12.5px]" style={{ color: "var(--i-violet)" }}>
                    {fmtDay(planDrag.endDate)}
                  </span>
                  <span className="text-[9px]" style={{ color: "var(--i-text-faint)" }}>
                    {Math.round((planDrag.endDate - planDrag.date) / 86400000)}d
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* playhead date flag, in DOM so the type is crisp */}
        <div
          className="absolute pointer-events-none"
          style={{ left: playX, top: 0, transform: "translateX(-50%)" }}
          data-shoot="playhead-flag"
        >
          <div
            className="i-readout text-[11.5px] px-2 py-[4px] rounded-[4px] whitespace-nowrap"
            style={{
              background: "linear-gradient(180deg, #b1a4ff 0%, var(--i-violet) 100%)",
              color: "var(--i-void)",
              letterSpacing: "0.02em",
              boxShadow: "0 3px 12px rgba(155,140,250,0.4), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            {fmtDay(playheadT)}
          </div>
        </div>
      </div>
    </div>
  );
}
