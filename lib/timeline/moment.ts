// WHAT JUST CHANGED, STATED AS FACT.
//
// Playback needs somewhere to say what the playhead just crossed, and the
// only safe way to say it is to READ THE RECORD ALOUD. Everything here is
// field selection: a title that is already stored, a kind word from a fixed
// vocabulary, two dates a Report already held and the subtraction between
// them. No prose is generated, no cause is attributed, and nothing is
// inferred from adjacency — an event next to a forecast movement did not
// necessarily produce it, and this module never suggests that it did.
//
// It is a PURE function of the moment, which is what makes the readout
// deterministic: crossing JUL 14 twice produces the same sentence twice,
// whether it was reached by playing, by scrubbing or by stepping.

import type { TimelineEntry, ForecastSnapshot } from "./entries";

const DAY = 86400000;

/** Events closer together than this are one moment. The same constant the
    playback plan groups by, so what is paced as one beat is also read out
    as one beat. */
export const SAME_MOMENT_MS = 6 * 3600 * 1000;

/**
 * The vocabulary. One map, used by the score's event module, the inspector
 * and the playback readout, so the three surfaces cannot drift into calling
 * the same row three different things.
 */
export const KIND_LABEL: Record<string, string> = {
  report: "Forecast report",
  decision_raised: "Decision raised",
  decision_gated: "Connected to delivery",
  decision_decided: "Decision decided",
  decision_needed_by: "Needed by · advisory",
  finding_raised: "Finding raised",
  finding_resolved: "Finding resolved",
  context_observed: "Context observed",
  work_completed: "Work completed",
  landmark: "Landmark",
};

/** The stored landmark kinds, said as a person would say them. A landmark
    knows what sort of moment it was; "Landmark" is the fallback, not the
    answer, when it does. */
const LANDMARK_KIND: Record<string, string> = {
  kickoff: "Kickoff",
  delivery: "Delivery",
  milestone: "Milestone",
  phase: "Phase",
  event: "Landmark",
};

export function labelFor(entry: TimelineEntry): string {
  if (entry.kind === "landmark") {
    const k = (entry.detail as { landmarkKind?: string } | null)?.landmarkKind;
    if (k && LANDMARK_KIND[k]) return LANDMARK_KIND[k];
  }
  return KIND_LABEL[entry.kind] ?? entry.kind;
}

export interface EventBeat {
  kind: "event";
  id: string;
  t: number;
  scopeId: string;
  title: string;
  label: string;
  family: TimelineEntry["family"];
}

export interface ForecastBeat {
  kind: "forecast";
  id: string;
  t: number;
  scopeId: string;
  /** Both stored p50s, exactly as the two Reports recorded them. */
  fromLikely: string;
  toLikely: string;
  /** Positive = the remembered landing moved later. */
  days: number;
}

export type Beat = EventBeat | ForecastBeat;

export interface Moment {
  /** The date these beats share — the earliest of them. */
  t: number;
  beats: Beat[];
  events: number;
  forecasts: number;
}

/** A forecast movement outranks an event at the same instant: it is the
    rarer beat and the one the eye is least likely to find on its own.
    Beyond that, chronological, then by title — a total order, so the same
    moment always reads in the same sequence. */
const RANK: Record<Beat["kind"], number> = { forecast: 0, event: 1 };

export function orderBeats(beats: Beat[]): Beat[] {
  return [...beats].sort(
    (a, b) =>
      a.t - b.t ||
      RANK[a.kind] - RANK[b.kind] ||
      (a.kind === "event" && b.kind === "event" ? a.title.localeCompare(b.title) : 0) ||
      a.id.localeCompare(b.id)
  );
}

/**
 * WHAT A CROSSED REPORT DID TO THE REMEMBERED LANDING.
 *
 * Both numbers are stored: this Report's p50 and the previous Report's p50,
 * from the same ascending series the memory band steps through. Nothing is
 * recomputed and no simulation is run — the movement is a subtraction
 * between two beliefs that were both actually held.
 *
 * The first Report in a series returns null. It moved nothing, because
 * there was nothing before it to move from, and "0d earlier" would be a
 * claim about a comparison that never existed.
 */
export function forecastBeatFor(
  entry: TimelineEntry,
  series: ForecastSnapshot[]
): ForecastBeat | null {
  if (entry.kind !== "report") return null;
  const snap = entry.detail as unknown as ForecastSnapshot;
  const i = series.findIndex((s) => s.reportId === snap.reportId);
  if (i <= 0) return null;
  const prev = series[i - 1];
  return {
    kind: "forecast",
    id: `fc:${snap.reportId}`,
    t: new Date(snap.generatedAt).getTime(),
    scopeId: entry.scopeId,
    fromLikely: prev.likelyDate,
    toLikely: snap.likelyDate,
    days: Math.round(
      (new Date(snap.likelyDate).getTime() - new Date(prev.likelyDate).getTime()) / DAY
    ),
  };
}

/**
 * The moment a set of crossed ids adds up to.
 *
 * ONE function for every way of arriving. Playback passes the ids it has
 * just struck; a held or scrubbed playhead passes the ids of the last group
 * at or before it. Because the answer depends only on WHICH IDS, and never
 * on how the playhead got there, reaching JUL 14 by playing, by dragging
 * backward or by stepping produces the same sentence every time.
 */
export function momentOf(
  entries: TimelineEntry[],
  ids: Set<string>,
  seriesByScope: Record<string, ForecastSnapshot[]>
): Moment | null {
  if (ids.size === 0) return null;

  const beats: Beat[] = [];
  for (const e of entries) {
    if (!ids.has(e.id)) continue;
    const fc = forecastBeatFor(e, seriesByScope[e.scopeId] ?? []);
    if (fc) {
      // ONE LINE PER REPORT, AND IT IS THE USEFUL ONE.
      //
      // A crossed Report is both an event ("Forecast report") and a
      // movement ("SEP 15 → SEP 18, 3d later"). Emitting both put a row
      // saying nothing next to the row saying everything, and four projects
      // reporting in the same week turned the readout into a column of the
      // words "Forecast report". The movement replaces the event; the first
      // Report in a series has no movement to state and keeps its own line.
      beats.push(fc);
      continue;
    }
    beats.push({
      kind: "event",
      id: e.id,
      t: new Date(e.date).getTime(),
      scopeId: e.scopeId,
      title: e.title,
      label: labelFor(e),
      family: e.family,
    });
  }
  if (beats.length === 0) return null;

  const ordered = orderBeats(beats);
  return {
    t: Math.min(...ordered.map((b) => b.t)),
    beats: ordered,
    events: ordered.filter((b) => b.kind === "event").length,
    forecasts: ordered.filter((b) => b.kind === "forecast").length,
  };
}

/**
 * The last group of things that happened at or before `t`.
 *
 * What a HELD playhead is standing in. Playback articulates as it strikes;
 * a stopped or dragged playhead has nothing transient to report, and an
 * empty readout under a playhead that is plainly sitting on top of an event
 * is the wrong answer. Grouped by the same window playback paces by, so the
 * held readout and the played readout describe the same moments.
 *
 * Pure, and a function of position only — which is what makes revisiting a
 * date reproduce its state exactly.
 */
export function idsAt(entries: TimelineEntry[], t: number): Set<string> {
  let latest = -Infinity;
  for (const e of entries) {
    if (e.temporalState !== "occurred") continue;
    const et = new Date(e.date).getTime();
    if (et <= t && et > latest) latest = et;
  }
  const out = new Set<string>();
  if (latest === -Infinity) return out;
  for (const e of entries) {
    if (e.temporalState !== "occurred") continue;
    const et = new Date(e.date).getTime();
    if (et <= t && et >= latest - SAME_MOMENT_MS) out.add(e.id);
  }
  return out;
}
