// TIME -> PIXELS.
//
// One absolute axis, shared by every lane. That is the whole reason the
// instrument reads as a score rather than a stack of unrelated charts: two
// marks at the same x are at the same moment, always, in every lane.
//
// The projection is deliberately a pure function of a VIEW WINDOW rather
// than of the full range, so zoom and pan are just a narrower window. The
// dead TimelineInstrument's day-indexed `pct` helper worked the same way;
// what has not been carried over is its assumption that everything on the
// axis is a bar with a start and an end.

export interface TimeView {
  /** The visible window, epoch ms. */
  startT: number;
  endT: number;
  /** Pixel width the window is drawn across. */
  width: number;
}

export const DAY = 86400000;

export function xFor(view: TimeView, t: number): number {
  const span = view.endT - view.startT;
  if (span <= 0) return 0;
  return ((t - view.startT) / span) * view.width;
}

export function tFor(view: TimeView, x: number): number {
  const span = view.endT - view.startT;
  return view.startT + (x / Math.max(1, view.width)) * span;
}

export type TickScale = "week" | "month" | "quarter";

/** The scale that gives a readable number of gridlines for the window.
    Adaptive rather than fixed, so zooming never produces either three
    labels or three hundred. */
export function scaleFor(view: TimeView): TickScale {
  const days = (view.endT - view.startT) / DAY;
  if (days <= 80) return "week";
  if (days <= 400) return "month";
  return "quarter";
}

export interface Tick {
  t: number;
  label: string;
  major: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function ticksFor(view: TimeView, scale: TickScale): Tick[] {
  const out: Tick[] = [];
  const start = new Date(view.startT);
  const end = new Date(view.endT);

  if (scale === "week") {
    // Snap to Monday so the grid matches how delivery weeks are counted.
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    while (d.getTime() <= end.getTime()) {
      const first = d.getUTCDate() <= 7;
      out.push({
        t: d.getTime(),
        label: first ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : String(d.getUTCDate()),
        major: first,
      });
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }

  const step = scale === "month" ? 1 : 3;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (d.getTime() <= end.getTime()) {
    const jan = d.getUTCMonth() === 0;
    out.push({
      t: d.getTime(),
      label: jan ? `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` : MONTHS[d.getUTCMonth()],
      major: jan || d.getUTCMonth() % 3 === 0,
    });
    d.setUTCMonth(d.getUTCMonth() + step);
  }
  return out;
}

/**
 * ONE STEP FINER.
 *
 * The field draws a single grid at the scale the window asks for. An OPENED
 * lane is the same window at the next grain down — quarters resolve into
 * months, months into weeks, weeks into days — which is what makes opening
 * a project read as increasing the resolution of one timeline rather than
 * switching to a second chart of the same data.
 *
 * Returns nothing when the finer grain would be too dense to read, so the
 * opened lane never becomes a hatch pattern. Pure, and derived from the same
 * window every other mark is placed against.
 */
export function subTicksFor(view: TimeView, scale: TickScale): Tick[] {
  const span = view.endT - view.startT;
  if (span <= 0 || view.width <= 0) return [];
  const pxPer = (ms: number) => (ms / span) * view.width;

  if (scale === "quarter") return pxPer(30 * DAY) >= 14 ? ticksFor(view, "month") : [];
  if (scale === "month") return pxPer(7 * DAY) >= 12 ? ticksFor(view, "week") : [];

  // week -> days. Every midnight in the window, labelled by day of month.
  if (pxPer(DAY) < 11) return [];
  const out: Tick[] = [];
  const d = new Date(Date.UTC(
    new Date(view.startT).getUTCFullYear(),
    new Date(view.startT).getUTCMonth(),
    new Date(view.startT).getUTCDate()
  ));
  while (d.getTime() <= view.endT) {
    const dow = d.getUTCDay();
    out.push({ t: d.getTime(), label: String(d.getUTCDate()), major: dow === 1 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Zoom about a fixed date, so the moment under the pointer stays put. */
export function zoomAbout(
  view: { startT: number; endT: number },
  anchorT: number,
  factor: number,
  bounds: { startT: number; endT: number },
  minSpanMs = 10 * DAY
): { startT: number; endT: number } {
  const span = view.endT - view.startT;
  const maxSpan = bounds.endT - bounds.startT;
  const next = Math.min(maxSpan, Math.max(minSpanMs, span * factor));
  const p = span === 0 ? 0.5 : (anchorT - view.startT) / span;
  let startT = anchorT - next * p;
  let endT = startT + next;
  if (startT < bounds.startT) { startT = bounds.startT; endT = startT + next; }
  if (endT > bounds.endT) { endT = bounds.endT; startT = endT - next; }
  return { startT, endT };
}

/** Keep a date comfortably inside the window, nudging the window rather
    than teleporting it — used to follow the playhead during playback. */
export function windowFollowing(
  view: { startT: number; endT: number },
  t: number,
  bounds: { startT: number; endT: number }
): { startT: number; endT: number } {
  const span = view.endT - view.startT;
  const lead = span * 0.62; // the playhead rides left of centre
  const lo = view.startT + span * 0.12;
  const hi = view.startT + span * 0.72;
  if (t >= lo && t <= hi) return view;
  let startT = t - (span - lead);
  startT = Math.max(bounds.startT, Math.min(bounds.endT - span, startT));
  return { startT, endT: startT + span };
}

export function fmtDay(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtFull(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
