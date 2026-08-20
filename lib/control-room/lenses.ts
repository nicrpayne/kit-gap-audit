// ONE PROJECT. MANY LENSES.
//
// A lens is not a layout preset and it is not a dashboard tab. It is a
// QUESTION, and the surfaces it turns on are the ones needed to answer that
// question and no others:
//
//   COMMAND     what is happening, and where should I look?
//   DELIVERY    are we going to ship?
//   CAPACITY    do we have the ability to execute?
//   DEPENDENCY  what can surprise us?
//   DECISION    what choices are holding movement?
//
// The Project Field is in every one of them, because the project is the
// object and a lens changes how you INSPECT it, never what it is. What
// moves between lenses is the supporting apparatus.
//
// A lens is a VIEW PREFERENCE and nothing else. It lives in this browser's
// localStorage, is never sent anywhere, and is never written to the
// project. Hiding the capacity surface does not change a single FTE.
//
// There is deliberately no drag-and-drop, no resizing and no reordering.
// Position is composition — the field is the centre of gravity and the
// reading sits above it because that is the order the argument runs in —
// and a rearrangeable layout stops making that argument.

export type SurfaceId =
  // the centre of gravity
  | "field"
  | "time-machine"
  // the rail
  | "inspector"
  | "dependency-watch"
  | "constraints"
  | "what-changed"
  // the reading strip
  | "reading-reality"
  | "reading-choices"
  | "reading-capacity"
  | "reading-outcome"
  | "reading-time"
  // the supporting surfaces
  | "forecast-stability"
  | "capacity-overview"
  | "system-status"
  | "release-composition"
  | "decisions";

export type SurfaceGroup = "Field" | "Reading" | "Rail" | "Surfaces";

export interface SurfaceDef {
  id: SurfaceId;
  label: string;
  group: SurfaceGroup;
  /** What this surface is for. One sentence, shown in the lens editor. */
  note: string;
}

/** Declaration order is READING order within a group. */
export const SURFACES: SurfaceDef[] = [
  { id: "field", label: "Project field", group: "Field", note: "The project itself: lanes, dependencies, clamps and where each one lands." },
  { id: "time-machine", label: "Project time machine", group: "Field", note: "The Timeline instrument, embedded. Play the project forward and back." },

  { id: "reading-reality", label: "Reality", group: "Reading", note: "Signals raised against the project, and what is blocking." },
  { id: "reading-choices", label: "Choices", group: "Reading", note: "Open decisions, and the few actually holding a date." },
  { id: "reading-capacity", label: "Capacity", group: "Reading", note: "How much of the time we committed reaches the work." },
  { id: "reading-outcome", label: "Likely outcome", group: "Reading", note: "Where the project lands, and which part lands last." },
  { id: "reading-time", label: "Time", group: "Reading", note: "How far ahead we can see, and what is next." },

  { id: "inspector", label: "Consequence", group: "Rail", note: "What the thing you selected on the field actually causes." },
  { id: "dependency-watch", label: "Dependency index", group: "Rail", note: "The same edges as the field, listed, with unreviewed claims kept apart." },
  { id: "constraints", label: "Current constraints", group: "Rail", note: "What is holding delivery beyond the work itself." },
  { id: "what-changed", label: "What changed", group: "Rail", note: "The newest thing that happened to each subject." },

  { id: "forecast-stability", label: "Forecast stability", group: "Surfaces", note: "What every report believed, plotted at the time it ran." },
  { id: "capacity-overview", label: "Capacity overview", group: "Surfaces", note: "Committed against arriving, per project. Today only." },
  { id: "system-status", label: "System status", group: "Surfaces", note: "How old each feed is. Timestamps, not grades." },
  { id: "release-composition", label: "Release composition", group: "Surfaces", note: "What each project is carrying, in capabilities." },
  { id: "decisions", label: "Decisions detail", group: "Surfaces", note: "The decision counts broken out in full." },
];

export const SURFACE_BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

export type LensId = "command" | "delivery" | "capacity" | "dependency" | "decision" | "custom";

export interface Lens {
  id: LensId;
  label: string;
  /** The question this lens is for. Shown under its name. */
  question: string;
  /** Null for CUSTOM, which is whatever the person left behind. */
  surfaces: SurfaceId[] | null;
}

const ALL = SURFACES.map((s) => s.id);

export const LENSES: Lens[] = [
  {
    id: "command",
    label: "Command",
    question: "What is happening?",
    // THE APPROVED MASTER CONTROL ROOM LAYOUT. Telemetry across the top,
    // the Project Time Machine as the working surface, the operational rail
    // on the right, the analysis row along the bottom.
    surfaces: [
      "time-machine",
      "reading-reality",
      "reading-choices",
      "reading-capacity",
      "reading-outcome",
      "reading-time",
      "system-status",
      "dependency-watch",
      "constraints",
      "what-changed",
      "forecast-stability",
      "capacity-overview",
      "decisions",
      "release-composition",
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    question: "Will we ship?",
    surfaces: [
      "time-machine",
      "reading-choices",
      "reading-outcome",
      "reading-time",
      "constraints",
      "what-changed",
      "forecast-stability",
      "decisions",
      "release-composition",
    ],
  },
  {
    id: "capacity",
    label: "Capacity",
    question: "Can we execute?",
    surfaces: [
      "time-machine",
      "reading-capacity",
      "reading-outcome",
      "reading-time",
      "constraints",
      "system-status",
      "capacity-overview",
      "release-composition",
    ],
  },
  {
    id: "dependency",
    label: "Dependency",
    question: "What can surprise us?",
    // The PROJECT FIELD is the working surface here, because blast radius
    // is a shape and the Time Machine cannot draw one.
    surfaces: [
      "field",
      "reading-reality",
      "reading-choices",
      "reading-outcome",
      "inspector",
      "dependency-watch",
      "constraints",
      "forecast-stability",
      "system-status",
    ],
  },
  {
    id: "decision",
    label: "Decision",
    question: "What choices matter?",
    // The field again, because a gate is drawn there as a clamp across the
    // lane it blocks — an obstruction you can see rather than a row.
    surfaces: [
      "field",
      "reading-choices",
      "reading-outcome",
      "reading-time",
      "inspector",
      "constraints",
      "what-changed",
      "decisions",
      "forecast-stability",
    ],
  },
  { id: "custom", label: "Custom", question: "Your own set.", surfaces: null },
];

export const LENS_BY_ID = new Map(LENSES.map((l) => [l.id, l]));

export interface Workspace {
  lens: LensId;
  /** Only meaningful for CUSTOM. Kept separately so switching to a lens and
      back does not lose a set somebody built by hand. */
  custom: SurfaceId[];
}

export const DEFAULT_WORKSPACE: Workspace = {
  lens: "command",
  custom: LENS_BY_ID.get("command")!.surfaces!,
};

export function visibleSurfaces(w: Workspace): Set<SurfaceId> {
  const lens = LENS_BY_ID.get(w.lens);
  return new Set(lens?.surfaces ?? w.custom);
}

/** Toggling anything while a named lens is selected FORKS to Custom, seeded
    from what is on screen. A lens is a question with a name; quietly
    editing one under its own name would make the name a lie. */
export function toggleSurface(w: Workspace, id: SurfaceId): Workspace {
  const now = visibleSurfaces(w);
  if (now.has(id)) now.delete(id);
  else now.add(id);
  return { lens: "custom", custom: ALL.filter((s) => now.has(s)) };
}

// ── PERSISTENCE ────────────────────────────────────────────────────────
//
// localStorage, this browser, this person. Versioned in the key so a future
// surface set cannot be half-read out of an old one — V2 stored panels
// under a different vocabulary, and that key is deliberately not read.

export const STORAGE_KEY = "kit.control-room.lens.v3";

export function loadWorkspace(): Workspace {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE;
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    const lens = LENS_BY_ID.has(parsed.lens as LensId) ? (parsed.lens as LensId) : "command";
    // Ids are filtered against the current registry, so a surface that no
    // longer exists cannot resurrect itself, and a newly added one is
    // simply off until somebody turns it on — which is what "custom" means.
    const custom = Array.isArray(parsed.custom)
      ? ALL.filter((s) => (parsed.custom as SurfaceId[]).includes(s))
      : DEFAULT_WORKSPACE.custom;
    return { lens, custom };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function saveWorkspace(w: Workspace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
  } catch {
    // A browser with storage denied still gets a working page for this
    // session. A view preference is not worth an error state.
  }
}

export function resetWorkspace(): Workspace {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* see saveWorkspace */
    }
  }
  return DEFAULT_WORKSPACE;
}
