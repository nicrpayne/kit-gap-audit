// WHAT THIS PERSON WANTS TO LOOK AT.
//
// A workspace is a VIEW PREFERENCE and nothing else. It lives in this
// browser's localStorage, it is never sent anywhere, and it is never written
// to the project. Hiding the Capacity panel does not change a single FTE;
// choosing the DEPENDENCIES preset does not change what any project waits
// on. That separation is the whole reason this file is a plain module of
// ids and sets rather than anything that touches the model.
//
// There is deliberately no drag-and-drop, no resizing and no per-panel
// ordering. Position is composition — the page is arranged so the six
// questions read in order — and letting a layout be rearranged would let it
// stop making that argument. Show and hide is enough to make the surface
// fit a job.

export type PanelId =
  | "card-reality"
  | "card-choices"
  | "card-capacity"
  | "card-outcome"
  | "card-time"
  | "time-machine"
  | "dependency-watch"
  | "constraints"
  | "what-changed"
  | "forecast-confidence"
  | "capacity-overview"
  | "system-status"
  | "release-composition"
  | "decisions";

export type PanelGroup = "Summary" | "Centre" | "Rail" | "Lenses";

export interface PanelDef {
  id: PanelId;
  label: string;
  group: PanelGroup;
  /** What this panel is for, in the customize dialog. One sentence. */
  note: string;
}

/** Declaration order is READING order within a group. The page renders each
    group by filtering this list, so a panel can never appear in two places
    or drift out of the order the composition argues for. */
export const PANELS: PanelDef[] = [
  { id: "card-reality", label: "Reality", group: "Summary", note: "Signals raised against the project, and what is blocking." },
  { id: "card-choices", label: "Choices", group: "Summary", note: "Open decisions, and the few that actually hold a date." },
  { id: "card-capacity", label: "Capacity", group: "Summary", note: "How much of the time we committed reaches the work." },
  { id: "card-outcome", label: "Likely outcome", group: "Summary", note: "Where the project lands, and which part lands last." },
  { id: "card-time", label: "Time", group: "Summary", note: "How far ahead we can see, and what is next." },
  { id: "time-machine", label: "Project Time Machine", group: "Centre", note: "The Timeline instrument itself, embedded. Play the project." },
  { id: "dependency-watch", label: "Dependency watch", group: "Rail", note: "What waits on what, so nothing arrives as a surprise." },
  { id: "constraints", label: "Current constraints", group: "Rail", note: "What is holding delivery beyond the work itself." },
  { id: "what-changed", label: "What changed", group: "Rail", note: "The newest thing that happened to each subject." },
  { id: "forecast-confidence", label: "Forecast confidence", group: "Lenses", note: "What every report believed, plotted at the time it ran." },
  { id: "capacity-overview", label: "Capacity overview", group: "Lenses", note: "Committed against arriving, per project. Today only." },
  { id: "system-status", label: "System status", group: "Lenses", note: "How old each feed is. Timestamps, not grades." },
  { id: "release-composition", label: "Release composition", group: "Lenses", note: "What each project is carrying, in capabilities." },
  { id: "decisions", label: "Decisions detail", group: "Lenses", note: "The decision counts broken out in full." },
];

export const PANEL_BY_ID = new Map(PANELS.map((p) => [p.id, p]));

export type PresetId = "control-room" | "delivery" | "capacity" | "dependencies" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  /** The job this preset is for. Shown under the name. */
  note: string;
  /** Null for CUSTOM, which is whatever the person left behind. */
  panels: PanelId[] | null;
}

const ALL = PANELS.map((p) => p.id);

export const PRESETS: Preset[] = [
  {
    id: "control-room",
    label: "Control Room",
    note: "Everything. The daily surface.",
    panels: ALL.filter((p) => p !== "decisions"),
  },
  {
    id: "delivery",
    label: "Delivery",
    note: "Where we land and what moved it.",
    panels: [
      "card-choices",
      "card-outcome",
      "card-time",
      "time-machine",
      "constraints",
      "what-changed",
      "forecast-confidence",
      "release-composition",
    ],
  },
  {
    id: "capacity",
    label: "Capacity",
    note: "Who we have and where it goes.",
    panels: [
      "card-capacity",
      "card-outcome",
      "time-machine",
      "constraints",
      "what-changed",
      "capacity-overview",
      "release-composition",
      "system-status",
    ],
  },
  {
    id: "dependencies",
    label: "Dependencies",
    note: "What waits on what, and what could surprise us.",
    panels: [
      "card-reality",
      "card-choices",
      "card-outcome",
      "time-machine",
      "dependency-watch",
      "constraints",
      "what-changed",
      "forecast-confidence",
      "system-status",
    ],
  },
  { id: "custom", label: "Custom", note: "Your own set.", panels: null },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export interface Workspace {
  preset: PresetId;
  /** Only meaningful for CUSTOM. Kept separately so switching to a preset
      and back does not lose the set somebody built by hand. */
  custom: PanelId[];
}

export const DEFAULT_WORKSPACE: Workspace = {
  preset: "control-room",
  custom: PRESET_BY_ID.get("control-room")!.panels!,
};

export function visiblePanels(w: Workspace): Set<PanelId> {
  const preset = PRESET_BY_ID.get(w.preset);
  return new Set(preset?.panels ?? w.custom);
}

/** Toggling anything while a preset is selected FORKS to Custom, seeded from
    what is on screen. A preset is a named thing; quietly editing one under
    its own name would make the name a lie. */
export function togglePanel(w: Workspace, id: PanelId): Workspace {
  const now = visiblePanels(w);
  if (now.has(id)) now.delete(id);
  else now.add(id);
  return { preset: "custom", custom: ALL.filter((p) => now.has(p)) };
}

// ── PERSISTENCE ────────────────────────────────────────────────────────
//
// localStorage, this browser, this person. Version in the key so a future
// panel set cannot be half-read out of an old one.

export const STORAGE_KEY = "kit.control-room.workspace.v2";

export function loadWorkspace(): Workspace {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE;
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    const preset = PRESET_BY_ID.has(parsed.preset as PresetId) ? (parsed.preset as PresetId) : "control-room";
    // Ids are filtered against the current registry, so a panel that no
    // longer exists cannot resurrect itself and a new one cannot be
    // silently absent from a stored Custom set — it is simply off until
    // somebody turns it on, which is what "custom" means.
    const custom = Array.isArray(parsed.custom)
      ? ALL.filter((p) => (parsed.custom as PanelId[]).includes(p))
      : DEFAULT_WORKSPACE.custom;
    return { preset, custom };
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
