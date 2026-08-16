// WHAT THE FIRST GLANCE SHOWS.
//
// Timeline knows a great deal. That is a property of the DATA, not a
// licence to draw all of it at equal strength. The default surface answers
// five questions -- where are we in time, what happened, what is coming,
// where do we think each project lands, and how has that belief moved --
// and everything else waits until it is asked for.
//
// This module is the one place that decides prominence. It is PRESENTATION
// ONLY: it filters and ranks entries the projection already produced, and
// it never changes what Timeline knows, stores or returns. Toggling a layer
// changes what is drawn; it changes no row and no entry.
//
// Deterministic by construction. No model, no scoring heuristic that drifts
// -- a rule you can read, so two people looking at the same project see the
// same story.

import type { TimelineEntry } from "./entries";

/** The layers a user can turn on. Story is the quiet default; the rest is
    forensic detail that stays one click away. */
export type LayerKey =
  | "landmarks"
  | "decisions"
  | "reports"
  | "work"
  | "context"
  | "findings"
  | "dependencies";

export interface LayerDef {
  key: LayerKey;
  label: string;
  /** One line, so the control explains itself without a manual. */
  hint: string;
  /** In the quiet default. */
  story: boolean;
}

export const LAYERS: LayerDef[] = [
  { key: "landmarks", label: "Landmarks", hint: "Kickoffs, deliveries, plans", story: true },
  { key: "decisions", label: "Decisions", hint: "Raised, connected, decided", story: true },
  { key: "reports", label: "Forecast history", hint: "Every recorded belief", story: true },
  { key: "work", label: "Work completed", hint: "Issues finished in Linear", story: true },
  { key: "context", label: "Context", hint: "When a source was read", story: false },
  { key: "findings", label: "Findings", hint: "Raised and resolved by audit", story: false },
  { key: "dependencies", label: "Dependencies", hint: "Which project waits on which", story: false },
];

export type LayerState = Record<LayerKey, boolean>;

export const STORY_LAYERS: LayerState = LAYERS.reduce(
  (acc, l) => ({ ...acc, [l.key]: l.story }),
  {} as LayerState
);

export const ALL_LAYERS: LayerState = LAYERS.reduce(
  (acc, l) => ({ ...acc, [l.key]: true }),
  {} as LayerState
);

export const isStoryDefault = (s: LayerState) =>
  LAYERS.every((l) => s[l.key] === l.story);
export const isEverything = (s: LayerState) => LAYERS.every((l) => s[l.key]);

/** Which layer an entry belongs to. One entry, one layer -- no entry can
    hide in two places or be double-counted by a toggle. */
export function layerFor(entry: TimelineEntry): LayerKey {
  switch (entry.family) {
    case "landmark": return "landmarks";
    case "decision": return "decisions";
    case "forecast": return "reports";
    case "work": return "work";
    case "context": return "context";
    case "finding": return "findings";
    default: return "landmarks";
  }
}

/**
 * How loudly to draw it.
 *
 * `primary` earns full presence at rest. `secondary` is present, selectable
 * and crossable, but deliberately quiet -- it is there when you look for it
 * and does not compete when you are not.
 *
 * The one rule worth stating plainly: STATE OUTRANKS TYPE. An overdue plan
 * is primary whatever family it belongs to, because "this was supposed to
 * have happened" is the most useful thing on the screen. That is why the
 * surface can be understood without knowing what any colour means.
 */
export type Prominence = "primary" | "secondary";

export function prominenceFor(entry: TimelineEntry): Prominence {
  // STATE FIRST.
  if (entry.temporalState === "planned") {
    // A plan ahead is intent worth seeing; a plan behind NOW is overdue and
    // is the loudest thing Timeline has to say.
    return "primary";
  }

  switch (entry.family) {
    // A landmark is something a human decided was worth marking. It is the
    // project's own account of itself, so it always reads first.
    case "landmark": return "primary";
    // Raising a question, discovering delivery waits on it, and answering
    // it are the moments a project actually turns on.
    case "decision": return "primary";
    // Work landing is the story's forward motion.
    case "work": return "primary";
    // A Report is the spine of forecast memory and must stay reachable --
    // but a weekly cadence drawn at full strength becomes a metronome that
    // makes the screen look busier than the project was. It is present,
    // quiet, and it still steps the memory band.
    case "forecast": return "secondary";
    // Real, kept, and available in Layers -- but a source being read is a
    // fact about our tooling, not a beat in the project's story.
    case "context": return "secondary";
    case "finding": return "secondary";
    default: return "secondary";
  }
}

/** Entries the score should draw, given the layers currently on. Pure. */
export function visibleEntries(entries: TimelineEntry[], layers: LayerState): TimelineEntry[] {
  return entries.filter((e) => layers[layerFor(e)]);
}
