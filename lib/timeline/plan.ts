// THE PLAN SIDE OF THE CANVAS.
//
// Timeline holds three different kinds of time on one axis, and they are
// not variations of each other:
//
//   LEFT OF NOW   STORY      what happened. Recorded, effectively immutable.
//   RIGHT OF NOW  PLAN       what we intend. Objects a person composes.
//   FLOATING      FORECAST   what the model computes from Reality. Consequence.
//
// This module owns the middle one. A plan object is a TimelineEvent row and
// nothing else -- the only rows Timeline owns -- so "can I move this?" has
// a structural answer rather than a policy one: if there is no TimelineEvent
// behind it, there is no endpoint to move it with.
//
// It does NOT own the forecast capsule (computed, never dragged) or the
// target flag (a date someone committed to, drawn as a flag, never a bar).
// Keeping those three visually and behaviourally separate is the whole
// point; a plan bar that looks like a forecast band would be a lie about
// which one a person is allowed to change.

import type { TimelineEntry } from "./entries";

/** A span has real duration. A point is a moment. Most landmarks are
    points -- a span is never the default, because a timeline made of bars
    is a Gantt chart, and we only want the readable part of one. */
export type PlanRole = "span" | "point";

export interface PlanObject {
  entry: TimelineEntry;
  role: PlanRole;
  startT: number;
  /** Null for a point. Never inferred -- a span exists only when a real
      endDate was stored. */
  endT: number | null;
  /** Whether the pointer may retime this object directly.
      Occurred landmarks are history and are deliberately excluded: they may
      be selected, inspected and edited through the tool, but they do not
      move because a person happened to drag across them. */
  draggable: boolean;
  planned: boolean;
  overdue: boolean;
}

/** The rows Timeline owns. Everything else on the score belongs to another
    instrument and is drawn as a mark, not as an object. */
export function isPlanObject(e: TimelineEntry): boolean {
  return e.family === "landmark";
}

export function planObjectFor(e: TimelineEntry): PlanObject {
  const planned = e.temporalState === "planned";
  const endT = e.endDate ? new Date(e.endDate).getTime() : null;
  return {
    entry: e,
    role: endT !== null ? "span" : "point",
    startT: new Date(e.date).getTime(),
    endT,
    // STATE DECIDES, not position. A planned object left of NOW is overdue
    // and still a plan -- it stays movable, because rescheduling something
    // that slipped is the most ordinary thing a person does here.
    draggable: e.editable && planned,
    planned,
    overdue: planned && Boolean((e.detail as { overdue?: boolean }).overdue),
  };
}

/** What a drag is changing. `move` conserves duration; the edges do not. */
export type PlanGrip = "move" | "start" | "end";

// ── SUBTRACKS ────────────────────────────────────────────────────────
//
// The useful spatial quality of a Gantt is that two things happening at
// once are visibly happening at once. On one line they would overlap into
// an unreadable smear, so a lane packs its plan objects into as many
// compact rows as it needs -- and no more. A lane with three non-
// overlapping objects stays one row deep.

export interface PlanExtent {
  id: string;
  /** Left and right pixel edges of the object AS DRAWN, label included --
      a point object's title occupies space even though its date does not,
      and packing against the date alone would let two titles collide. */
  x0: number;
  x1: number;
}

/** First-fit packing, left to right. Deterministic: the same objects in
    the same view always produce the same rows, so nothing jumps between
    rows while the score is merely being looked at. */
export function packPlanRows(extents: PlanExtent[], gapPx = 8): { rowOf: Map<string, number>; rowCount: number } {
  const sorted = [...extents].sort((a, b) => a.x0 - b.x0 || a.id.localeCompare(b.id));
  const rowEnds: number[] = [];
  const rowOf = new Map<string, number>();
  for (const e of sorted) {
    let row = rowEnds.findIndex((end) => e.x0 >= end + gapPx);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(e.x1);
    } else {
      rowEnds[row] = e.x1;
    }
    rowOf.set(e.id, row);
  }
  return { rowOf, rowCount: rowEnds.length };
}

/** Roughly how wide a title renders at the plan object's type size. Only
    needs to be close: it decides packing, not layout. */
export function labelWidth(title: string, compact: boolean): number {
  return Math.min(compact ? 118 : 190, title.length * (compact ? 5.1 : 5.9) + 14);
}

// ── LANE GEOMETRY ────────────────────────────────────────────────────
//
// Lanes are no longer all the same height. Selecting one may open it up to
// show its plan properly while its siblings compress -- which is the only
// way both "eight projects stay legible" and "this project's plan has real
// depth" can be true on the same screen.

export interface LaneBox {
  scopeId: string;
  top: number;
  height: number;
  expanded: boolean;
}

export const COMPACT_LANE_H = 76;
export const MAX_EXPANDED_H = 430;

export function layoutLanes(
  scopeIds: string[],
  expandedId: string | null,
  available: number,
  minH: number,
  maxH: number,
  /** How many plan subtracks each lane could need. Used only to decide how
      much height an OPENED lane actually asks for. */
  rowsFor: (scopeId: string) => number = () => 1
): LaneBox[] {
  const n = scopeIds.length;
  if (n === 0) return [];
  const heights = new Map<string, number>();

  const expanded = expandedId && scopeIds.includes(expandedId) ? expandedId : null;
  if (!expanded) {
    const h = Math.max(minH, Math.min(maxH, Math.floor(available / n)));
    for (const id of scopeIds) heights.set(id, h);
  } else if (n === 1) {
    heights.set(expanded, Math.max(minH, Math.min(maxH, available)));
  } else {
    // THE WELL IS CONSERVED, AND THE OPENED LANE TAKES ONLY WHAT IT USES.
    //
    // Height is asked for by the plan, not by a constant: a project with
    // three plan objects has no honest use for 430px and would become the
    // tall sparse strip this whole layout exists to avoid. Whatever the
    // opened lane cannot use goes back to its siblings, so the field is
    // redistributed rather than shrunk.
    //
    // This is why expanding at four lanes is a modest change and expanding
    // at eight is a dramatic one — which is exactly the truth of it.
    const flat = Math.max(minH, Math.min(maxH, Math.floor(available / n)));
    const wants = Math.max(flat, laneHeightForRows(rowsFor(expanded)));
    const open = Math.max(minH, Math.min(MAX_EXPANDED_H, wants, available - COMPACT_LANE_H * (n - 1)));
    const rest = Math.max(COMPACT_LANE_H * (n - 1), available - open);
    const sibling = Math.floor(rest / (n - 1));
    const slack = rest - sibling * (n - 1);
    let first = true;
    for (const id of scopeIds) {
      if (id === expanded) { heights.set(id, open); continue; }
      // The rounding remainder lands on one sibling rather than leaving a
      // sub-pixel gap at the bottom of the field.
      heights.set(id, sibling + (first ? slack : 0));
      first = false;
    }
  }

  let y = 0;
  return scopeIds.map((scopeId) => {
    const height = heights.get(scopeId)!;
    const box = { scopeId, top: y, height, expanded: scopeId === expanded };
    y += height;
    return box;
  });
}

/** The three horizontal bands inside one lane. */
export interface LaneZones {
  /** The historical score line: derived marks live here. */
  scoreY: number;
  /** Where plan rows begin, and how much vertical room they have. */
  planTop: number;
  planRoom: number;
  /** The forecast capsule's centre. */
  memY: number;
}

/** A comfortable plan row in an opened lane. Compact lanes get whatever
    their remaining room divides into.

    Sized for the object PLUS what an opened lane adds under it: at this
    resolution every plan object states its own dates at rest, and a row
    that only fits the block would have those dates landing on the object
    below. The row is the object and its markings, not just the object. */
export const OPEN_ROW_H = 42;
const OPEN_SCORE_TOP = 42;
const OPEN_PLAN_GAP = 16;
const OPEN_MEM_GAP = 30;
const OPEN_BOTTOM = 30;

/** How tall a lane needs to be to show `rows` plan subtracks properly.
    This is what expanding a lane asks for -- not a fixed large number,
    because a lane with three plan objects has no honest use for 430px and
    would just become the tall empty strip the field-level clamp exists to
    prevent. */
export function laneHeightForRows(rows: number): number {
  return OPEN_SCORE_TOP + OPEN_PLAN_GAP + Math.max(1, rows) * OPEN_ROW_H + OPEN_MEM_GAP + OPEN_BOTTOM;
}

export function laneZones(box: LaneBox, rowCount = 1): LaneZones {
  const rows = Math.max(1, rowCount);
  if (box.expanded && box.height >= laneHeightForRows(rows)) {
    // OPENED. The extra height goes to the PLAN BAND -- taller, readable
    // subtracks with the forecast capsule following underneath. An opened
    // lane that merely stretched its empty space would have bought nothing.
    //
    // The stack is CENTRED in whatever height the lane got, for the same
    // reason the field centres its lanes rather than stretching them: the
    // height a lane asks for is an upper bound on what its plan might need,
    // and when the packing turns out tighter than that, balanced margin
    // reads as deliberate where a void at the bottom reads as a bug.
    const natural = laneHeightForRows(rows);
    const pad = Math.max(0, (box.height - natural) / 2);
    const scoreY = box.top + pad + OPEN_SCORE_TOP;
    const planTop = scoreY + OPEN_PLAN_GAP;
    const planRoom = rows * OPEN_ROW_H;
    return { scoreY, planTop, planRoom, memY: planTop + planRoom + OPEN_MEM_GAP };
  }
  // COMPACT. Proportional, so a lane reads the same at 76px as at 198px.
  //
  // The split favours the PLAN. History is a line of small marks and needs
  // only the room to draw them; the plan band has to hold objects a person
  // is meant to see as objects, and at the old 0.30/0.76 split a project
  // with three overlapping activities divided 64px between three rows and
  // produced 16px slivers. Moving the score up and the capsule down buys
  // that band roughly 20px, which is the difference between a bar and a
  // part.
  const scoreY = box.top + box.height * 0.25;
  const memY = box.top + box.height * 0.78;
  const planTop = scoreY + 12;
  return { scoreY, planTop, planRoom: Math.max(12, memY - 15 - planTop), memY };
}

/** Row height that fits `rowCount` rows into the room a lane actually has.
    Compact lanes get slim bars rather than a scrollbar or a clipped row. */
export function planRowHeight(room: number, rowCount: number): number {
  if (rowCount <= 0) return 0;
  return Math.max(11, Math.min(OPEN_ROW_H, Math.floor(room / rowCount)));
}

/** Which lane a y coordinate falls in, in SVG space (header included).
    Used to decide the destination while a plan object is dragged
    vertically out of the lane it started in. */
export function laneAtY(boxes: LaneBox[], yInLanes: number): LaneBox | null {
  for (const b of boxes) if (yInLanes >= b.top && yInLanes < b.top + b.height) return b;
  return null;
}

// ── RETIMING ─────────────────────────────────────────────────────────

export const SNAP_DAY = 86400000;

/**
 * MAGNETIC, NOT SLIPPERY.
 *
 * Days are the unit a plan is expressed in, so a placement lands on one --
 * the NEAREST one. Flooring would make the surface feel like it was fighting
 * the hand: releasing a hair before midnight would silently give you the
 * previous day, and the object would sit one day left of where it was drawn.
 *
 * This is for ABSOLUTE placement (composing something new). Retiming an
 * existing object uses whole-day DELTAS instead -- see `retime`.
 */
export function snapDay(t: number): number {
  const d = new Date(t + SNAP_DAY / 2);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many whole days a drag of `dtMs` asks for. */
export function dayDelta(dtMs: number): number {
  return Math.round(dtMs / SNAP_DAY);
}

export interface Retimed {
  date: number;
  endDate: number | null;
}

/**
 * What a drag of `dtMs` does to an object, per grip.
 *
 * WHOLE DAYS, APPLIED AS A DELTA. The move is `+N days` added to the dates
 * the object already had, NOT a re-snap of an absolute timestamp. That
 * distinction is the difference between "+8 days" meaning +8 days and
 * meaning "+8 days, then rounded to a midnight boundary the object was
 * never on" -- a row stored at noon would drift by half a day the first
 * time anyone touched it, and every subsequent move would inherit the
 * error.
 *
 * MOVE CONSERVES DURATION exactly: the length is carried, never recomputed
 * from two independently rounded ends.
 *
 * Edges may not cross: a span cannot be resized through itself into a
 * negative duration, so each edge stops one day short of the other.
 */
export function retime(obj: PlanObject, grip: PlanGrip, dtMs: number): Retimed {
  const start = obj.startT;
  const end = obj.endT;
  const days = dayDelta(dtMs);

  if (grip === "move" || end === null) {
    const date = start + days * SNAP_DAY;
    return { date, endDate: end === null ? null : date + (end - start) };
  }
  if (grip === "start") {
    return { date: Math.min(start + days * SNAP_DAY, end - SNAP_DAY), endDate: end };
  }
  return { date: start, endDate: Math.max(end + days * SNAP_DAY, start + SNAP_DAY) };
}
