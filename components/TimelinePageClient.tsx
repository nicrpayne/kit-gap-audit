"use client";

// TIMELINE — PLAY THE PROJECT.
//
// Timeline owns the project's relationship with TIME. Not what we should
// do (Decisions), not what we ship (Scope), not who does it (Portfolio),
// not what that adds up to (Forecast) — WHEN, and what we believed then.
//
// The signature interaction is PLAY: the playhead travels through actual
// project history, real events wake as they are crossed, and the historical
// forecast changes only at the moments we actually recorded one. By the
// time it reaches NOW the story has visibly unfolded behind it.
//
// Three laws hold the whole surface honest:
//
//   1. NEVER RE-SIMULATE THE PAST. What we believed on a past date is in
//      the Report rows. Running today's engine for a past date would
//      manufacture a belief nobody held. Playback issues no requests.
//
//   2. HOLD, DO NOT INTERPOLATE. Between two Reports the remembered
//      landing does not drift toward the next one. It holds, then steps.
//
//   3. NEVER CLAIM CAUSALITY. A decision settled the day before a Report
//      moved is adjacency. The Report's own stored counts are as far as
//      any attribution goes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  TimelineProjection, TimelineEntry, TimelineCandidate, ForecastSnapshot,
} from "@/lib/timeline/entries";
import { forecastMemoryAt } from "@/lib/timeline/entries";
import { buildPlaybackPlan, playheadAt, crossedAt, type PlaybackPlan } from "@/lib/timeline/playback";
import { momentOf, idsAt } from "@/lib/timeline/moment";
import { DAY, fmtDay, fmtFull, scaleFor, zoomAbout, windowFollowing } from "@/lib/timeline/geometry";
import { mutateReality, subscribeReality } from "@/lib/instrument/reality";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimeField, { HEADER_H, MIN_LANE_H, MAX_LANE_H, LANE_HEADER_W } from "@/components/timeline/TimeField";
import TimelineInspector, { SEAM_W, PANEL_W } from "@/components/timeline/TimelineInspector";
import Transport, { type Speed } from "@/components/timeline/Transport";
import AddEventTool from "@/components/timeline/AddEventTool";
import LayersControl from "@/components/timeline/LayersControl";
import LanesControl, { applyLaneView, EMPTY_LANE_VIEW, type LaneView } from "@/components/timeline/LanesControl";
import { STORY_LAYERS, type LayerState } from "@/lib/timeline/story";
import { layoutLanes, isDormant } from "@/lib/timeline/plan";
import { spokenSourceLabel } from "@/lib/timeline/producer";
import {
  EMPTY_UNDO, record, undoTop, redoTop, describe, remapId,
  type UndoState, type TimelineCommand, type PlanSnapshot,
} from "@/lib/timeline/undo";

const MIN_SPAN = 21 * DAY;
/** How long a crossed event stays articulated before settling back into
    the score. Long enough to read a short title, short enough that a dense
    afternoon does not become a queue. */
const ARTICULATE_MS = 2100;
/** How long the previous memory band lingers as a ghost, and the delta
    chip states the movement. */
const MEMORY_GHOST_MS = 2400;
/** The narrowest a project's readout may become before the display stops
    shrinking and starts scrolling. Wide enough for a truncated name above a
    date at its floor size — below this the cells are present but no longer
    doing their job, which is worse than admitting there are more projects
    than fit. */
const MIN_CELL_W = 128;

export default function TimelinePageClient() {
  const router = useRouter();
  const [data, setData] = useState<TimelineProjection | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<{ startT: number; endT: number } | null>(null);
  const [playheadT, setPlayheadT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);
  const [fieldW, setFieldW] = useState(1000);
  const [fieldH, setFieldH] = useState(600);
  const [tool, setTool] = useState<{ editing: TimelineEntry | null } | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // PRESENTATION ONLY. Which layers the score draws. The projection is
  // whole regardless, and playback crosses every occurred entry either way
  // -- a layer decides what the first glance carries, not what is true.
  const [layers, setLayers] = useState<LayerState>(STORY_LAYERS);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // ALSO PRESENTATION ONLY. Which projects this timeline draws, and in what
  // order. Scope owns what is in the release; this owns what is on screen.
  const [laneView, setLaneView] = useState<LaneView>(EMPTY_LANE_VIEW);
  // One project may be opened to the depth its plan needs while its
  // siblings compress. Null means every lane shares the well evenly.
  const [expandedLane, setExpandedLane] = useState<string | null>(null);
  // A destructive act, armed rather than undone. A global undo stack would
  // be a whole architecture; asking once, in place, is the honest small
  // version of the same protection.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // WHAT ⌘Z REVERSES. A local command stack over Timeline-owned rows only,
  // for this editing session only. See lib/timeline/undo.ts for why it is
  // deliberately not an application-wide architecture.
  const [undoState, setUndoState] = useState<UndoState>(EMPTY_UNDO);
  const undoRef = useRef<UndoState>(EMPTY_UNDO);
  /** The single door onto the stack: ref first (authoritative), state after
      (for rendering). Nothing else may call setUndoState. */
  const pushUndo = useCallback((fn: (u: UndoState) => UndoState) => {
    undoRef.current = fn(undoRef.current);
    setUndoState(undoRef.current);
  }, []);
  // Events the playhead has just crossed. Held briefly so the note can be
  // read, then released back into the accumulated score.
  const [articulating, setArticulating] = useState<Set<string>>(new Set());
  const articulateAt = useRef<Map<string, number>>(new Map());
  const prevCrossed = useRef<Set<string>>(new Set());
  // The snapshot each lane's memory band just moved OFF, and by how much.
  const [ghostByScope, setGhost] = useState<Record<string, ForecastSnapshot | null>>({});
  const [deltaByScope, setDelta] = useState<Record<string, { fromLikely: string; toLikely: string; days: number } | null>>({});
  const prevMemory = useRef<Record<string, ForecastSnapshot | null>>({});
  const ghostTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const fieldHost = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const runStart = useRef<number>(0);
  const planRef = useRef<PlaybackPlan | null>(null);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(m.matches);
    const on = () => setReducedMotion(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/timeline", { cache: "no-store" });
      if (!r.ok) throw new Error(`Timeline failed (${r.status})`);
      const j: TimelineProjection = await r.json();
      setData(j);
      setErr(null);
      return j;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the timeline");
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Reality changed somewhere else in the app: re-read the projection.
  useEffect(() => subscribeReality(() => { void load(); }), [load]);

  const nowT = data ? new Date(data.now).getTime() : Date.now();
  const bounds = useMemo(
    () => (data ? { startT: new Date(data.rangeStart).getTime(), endT: new Date(data.rangeEnd).getTime() } : { startT: 0, endT: 1 }),
    [data]
  );

  // Opening view: NOW sits left of centre, because there is more ahead
  // than behind and the future is the part you are deciding about.
  useEffect(() => {
    if (!data || view) return;
    const span = Math.min(bounds.endT - bounds.startT, 150 * DAY);
    let startT = nowT - span * 0.38;
    startT = Math.max(bounds.startT, Math.min(bounds.endT - span, startT));
    setView({ startT, endT: startT + span });
    setPlayheadT(nowT);
  }, [data, view, bounds, nowT]);

  // A CALLBACK REF, not an effect keyed on `data`. The loaded tree does not
  // mount until `view` and `playheadT` exist too, so an effect that runs
  // when `data` arrives finds a null ref, never attaches, and leaves the
  // field measured at its initial guess — which is exactly how the score
  // ended up drawn at 590px inside an 878px well.
  // DOES THE READOUT HAVE MORE THAN IT CAN SHOW? Measured, not guessed from
  // the project count — the answer depends on the window width too.
  const [readoutOverflows, setReadoutOverflows] = useState(false);
  const readoutRO = useRef<ResizeObserver | null>(null);
  const attachReadout = useCallback((el: HTMLDivElement | null) => {
    readoutRO.current?.disconnect();
    if (!el) return;
    const measure = () => setReadoutOverflows(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    readoutRO.current = ro;
    measure();
  }, []);

  const roRef = useRef<ResizeObserver | null>(null);
  const attachField = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    fieldHost.current = el;
    if (!el) return;
    const measure = () => {
      setFieldW(Math.max(200, el.clientWidth - LANE_HEADER_W));
      setFieldH(Math.max(200, el.clientHeight));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, []);

  // The field FILLS the chassis. Lanes take the available height rather
  // than sitting in a short band above a void.
  // Lanes grow into the well up to a ceiling. Past that the score is
  // CENTRED rather than stretched: four lanes at 220px each would be four
  // tall empty strips with a thin line of events adrift in the middle,
  // which is worse than honest margin above and below.
  // THE LANES THIS TIMELINE DRAWS. A view over the projection's lanes —
  // hiding one changes what is on screen and nothing else, so playback,
  // forecast memory and every stored row are unaffected.
  const visibleLanes = useMemo(
    () => (data ? applyLaneView(data.lanes, laneView) : []),
    [data, laneView]
  );

  // How many plan subtracks a lane could need. Its object count is a safe
  // upper bound on its row count without having to know the view width,
  // which is what lets the layout be decided before the field is packed.
  const planCountByScope = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of data?.entries ?? []) if (e.family === "landmark") m[e.scopeId] = (m[e.scopeId] ?? 0) + 1;
    return m;
  }, [data]);

  // WHICH PROJECTS HAVE EARNED DEPTH.
  //
  // A presentation judgement, made from the projection and nothing else —
  // see `isDormant` for why the test is three counts rather than a heuristic.
  // Layers are NOT consulted: dormancy is about whether a project has a story
  // at all, not about which parts of it are currently drawn, so turning the
  // Decisions layer off must never collapse a lane that has decisions.
  const dormantByScope = useMemo(() => {
    const acc: Record<string, { planObjects: number; hasForecast: boolean; decisions: number }> = {};
    for (const lane of data?.lanes ?? []) {
      acc[lane.scopeId] = {
        planObjects: 0,
        hasForecast: (data?.snapshotsByScope[lane.scopeId] ?? []).length > 0,
        decisions: 0,
      };
    }
    for (const e of data?.entries ?? []) {
      const a = acc[e.scopeId];
      if (!a) continue;
      if (e.family === "landmark") a.planObjects += 1;
      else if (e.family === "decision") a.decisions += 1;
    }
    const out: Record<string, boolean> = {};
    for (const [scopeId, a] of Object.entries(acc)) out[scopeId] = isDormant(a);
    return out;
  }, [data]);

  const laneBoxes = useMemo(
    () =>
      layoutLanes(
        visibleLanes.map((l) => l.scopeId),
        expandedLane,
        Math.max(120, fieldH - HEADER_H - 8),
        MIN_LANE_H,
        MAX_LANE_H,
        (scopeId) => planCountByScope[scopeId] ?? 1,
        (scopeId) => dormantByScope[scopeId] ?? false
      ),
    [visibleLanes, expandedLane, fieldH, planCountByScope, dormantByScope]
  );

  // ── the playable set ───────────────────────────────────────────────
  // Only what actually HAPPENED can be crossed by automatic playback.
  // Planned landmarks and advisory needed-by markers are visible ahead of
  // the playhead and are never played through as if they had occurred.
  const pastEvents = useMemo(
    () =>
      (data?.entries ?? [])
        .filter((e) => e.temporalState === "occurred" && new Date(e.date).getTime() <= nowT)
        .map((e) => ({ id: e.id, t: new Date(e.date).getTime() })),
    [data, nowT]
  );

  const firstT = pastEvents.length ? pastEvents[0].t : nowT - 30 * DAY;
  const [crossed, setCrossed] = useState<Set<string>>(new Set());

  // Scrubbing sets crossed from position; playback accumulates it.
  useEffect(() => {
    if (playing || playheadT === null) return;
    setCrossed(crossedAt(pastEvents, playheadT));
    // Articulation belongs to playback. Scrubbing is a different act, and
    // leaving modules open under a dragged playhead would be noise.
    if (articulateAt.current.size > 0) {
      articulateAt.current.clear();
      setArticulating(new Set());
    }
  }, [playheadT, pastEvents, playing]);

  // ── PLAYBACK ───────────────────────────────────────────────────────
  const startPlayback = useCallback(
    (fromT: number) => {
      const plan = buildPlaybackPlan(pastEvents, fromT, nowT);
      planRef.current = plan;
      runStart.current = performance.now();
      setPlaying(true);
    },
    [pastEvents, nowT]
  );

  useEffect(() => {
    if (!playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const tick = () => {
      const plan = planRef.current;
      if (!plan) return;
      const elapsed = (performance.now() - runStart.current) * speed;
      const { t, crossed: c, done } = playheadAt(plan, elapsed);
      setPlayheadT(t);
      setCrossed(c);
      // Newly crossed since the last frame: struck now, readable for a beat.
      const wall = performance.now();
      for (const id of c) if (!prevCrossed.current.has(id)) articulateAt.current.set(id, wall);
      prevCrossed.current = c;
      const live = new Set<string>();
      for (const [id, at] of articulateAt.current) {
        if (wall - at < ARTICULATE_MS) live.add(id);
        else articulateAt.current.delete(id);
      }
      setArticulating((prev) =>
        prev.size === live.size && [...live].every((id) => prev.has(id)) ? prev : live
      );
      if (done) {
        // STOPS AT NOW. Future plans stay visible ahead, un-crossed.
        setPlaying(false);
        setPlayheadT(plan.endT);
        setCrossed(crossedAt(pastEvents, plan.endT));
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed, pastEvents]);

  // Follow the playhead, nudging the window rather than teleporting it.
  useEffect(() => {
    if (!playing || playheadT === null || !view) return;
    const next = windowFollowing(view, playheadT, bounds);
    if (next.startT !== view.startT) setView(next);
  }, [playheadT, playing, view, bounds]);

  // ── FORECAST MEMORY ────────────────────────────────────────────────
  // The last Report at or before the playhead, per lane. Holds between
  // Reports; steps exactly when one is crossed. Never interpolated.
  const memoryByScope = useMemo(() => {
    const out: Record<string, ForecastSnapshot | null> = {};
    if (!data || playheadT === null) return out;
    for (const lane of data.lanes) {
      out[lane.scopeId] = forecastMemoryAt(data.snapshotsByScope[lane.scopeId] ?? [], new Date(playheadT));
    }
    return out;
  }, [data, playheadT]);

  // REPORT TRANSITION CHOREOGRAPHY. When a lane's remembered snapshot
  // changes identity, the one it left becomes a ghost and the movement
  // between the two STORED likely dates is stated. Both settle away.
  useEffect(() => {
    for (const [scopeId, next] of Object.entries(memoryByScope)) {
      const prev = prevMemory.current[scopeId] ?? null;
      // FORWARD ONLY.
      //
      // The chip states a movement in what the project believed. Travelling
      // BACKWARD through the record is not such a movement — jumping from
      // Live Now to the first report announced "OCT 5 → SEP 15, 20d
      // earlier", which reads as the forecast having improved when all that
      // happened is that the playhead went back in time. The bands still
      // visibly change; nothing claims a belief moved that did not.
      const forward =
        prev && next && new Date(next.generatedAt).getTime() > new Date(prev.generatedAt).getTime();
      if (forward && prev && next && prev.reportId !== next.reportId) {
        const days = Math.round(
          (new Date(next.likelyDate).getTime() - new Date(prev.likelyDate).getTime()) / DAY
        );
        setGhost((g) => ({ ...g, [scopeId]: prev }));
        setDelta((d) => ({ ...d, [scopeId]: { fromLikely: prev.likelyDate, toLikely: next.likelyDate, days } }));
        clearTimeout(ghostTimers.current.get(scopeId));
        ghostTimers.current.set(
          scopeId,
          setTimeout(() => {
            setGhost((g) => ({ ...g, [scopeId]: null }));
            setDelta((d) => ({ ...d, [scopeId]: null }));
          }, MEMORY_GHOST_MS)
        );
      }
      prevMemory.current[scopeId] = next;
    }
  }, [memoryByScope]);

  const atNow = playheadT !== null && Math.abs(playheadT - nowT) < 12 * 3600 * 1000;

  // ── WHAT THE INSTRUMENT IS READING ─────────────────────────────────
  //
  // The story readout, from ONE deterministic source. Playing hands it the
  // ids it has just struck; a playhead HELD in history hands it the ids of
  // the last group at or before its position. Both go through the same
  // function, so what the transport says while playing and what it says
  // after you drag back to the same date are the same sentence.
  //
  // Silent at Live Now. This is a playback instrument: it reports what is
  // being REMEMBERED, and the present is not a memory. Leaving it lit at
  // NOW would also leave a lane permanently woken under a resting score,
  // which is the opposite of what the default view is for.
  //
  // Nothing here reads a clock or a previous position. A moment is a
  // function of WHICH IDS, and the ids are a function of WHERE — which is
  // the whole of the determinism claim.
  const moment = useMemo(() => {
    if (!data || playheadT === null) return null;
    if (!playing && atNow) return null;
    const ids = playing ? articulating : idsAt(data.entries, playheadT);
    return momentOf(data.entries, ids, data.snapshotsByScope);
  }, [data, playheadT, playing, atNow, articulating]);

  const laneNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const l of data?.lanes ?? []) out[l.scopeId] = l.name;
    return out;
  }, [data]);

  // WHICH PROJECTS THE STORY IS TOUCHING RIGHT NOW. A crossed mark is small
  // and the eye is looking at the playhead, not at the lane it landed in;
  // waking the whole lane is what makes "this project just did something"
  // visible from anywhere on the screen.
  const wokenLanes = useMemo(() => {
    const out = new Set<string>();
    for (const b of moment?.beats ?? []) out.add(b.scopeId);
    return out;
  }, [moment]);

  /** The panel exists because something is held. Nothing held, no panel. */
  const inspectorOpen = selectedId !== null;

  // ── DELETE, FROM THE SELECTION ─────────────────────────────────────
  //
  // Only a Timeline-owned row can go: a Report, a Decision or a Linear
  // completion has no TimelineEvent behind it, so there is nothing here to
  // delete and Timeline must not pretend otherwise. `editable` is the same
  // flag the projection uses and the same one the API enforces by routing.
  const deletable = useMemo(
    () => (selectedId ? data?.entries.find((e) => e.id === selectedId && e.editable) ?? null : null),
    [selectedId, data]
  );

  useEffect(() => { setPendingDelete(null); }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never steal the key from something being typed into — the inline
      // namer and every form field own Backspace while they have focus.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // ⌘Z / Ctrl+Z reverses the last Timeline-owned edit; shift redoes it.
      // Bound here rather than on the field so it works wherever the eye is,
      // and guarded above so it never steals a key from a text field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (e.key === "Escape") {
        // One key, one meaning: put down whatever is currently held. The
        // armed delete outranks the selection, because it is the more
        // surprising state to be left in.
        if (pendingDelete) { setPendingDelete(null); return; }
        if (selectedId) { setSelectedId(null); return; }
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!deletable) return;
      e.preventDefault();
      if (pendingDelete === deletable.id) {
        setPendingDelete(null);
        void deleteEvent(deletable.id);
      } else {
        setPendingDelete(deletable.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedEntry = useMemo(
    () => (selectedId && !selectedId.startsWith("candidate:") ? data?.entries.find((e) => e.id === selectedId) ?? null : null),
    [selectedId, data]
  );
  const selectedCandidate = useMemo(
    () => (selectedId?.startsWith("candidate:")
      ? data?.candidates.find((c) => c.id === selectedId.slice("candidate:".length)) ?? null
      : null),
    [selectedId, data]
  );

  const laneNameFor = (scopeId: string | undefined) =>
    scopeId ? data?.lanes.find((l) => l.scopeId === scopeId)?.name ?? null : null;

  // ── transport actions ──────────────────────────────────────────────
  const stepEvent = useCallback(
    (dir: 1 | -1) => {
      if (playheadT === null) return;
      setPlaying(false);
      const ts = [...pastEvents].map((e) => e.t).sort((a, b) => a - b);
      const next = dir > 0 ? ts.find((t) => t > playheadT + 1) : [...ts].reverse().find((t) => t < playheadT - 1);
      if (next !== undefined) setPlayheadT(next);
      else setPlayheadT(dir > 0 ? nowT : firstT);
    },
    [playheadT, pastEvents, nowT, firstT]
  );

  const zoomPct = view ? Math.round((1 - (view.endT - view.startT - MIN_SPAN) / Math.max(1, bounds.endT - bounds.startT - MIN_SPAN)) * 100) : 50;
  const onZoomPct = (pct: number) => {
    if (!view) return;
    const span = MIN_SPAN + (1 - pct / 100) * (bounds.endT - bounds.startT - MIN_SPAN);
    setView(zoomAbout(view, playheadT ?? nowT, span / (view.endT - view.startT), bounds, MIN_SPAN));
  };

  const setScale = (s: "week" | "month" | "quarter") => {
    if (!view) return;
    const span = s === "week" ? 56 * DAY : s === "month" ? 200 * DAY : 380 * DAY;
    const clamped = Math.min(bounds.endT - bounds.startT, span);
    setView(zoomAbout(view, playheadT ?? nowT, clamped / (view.endT - view.startT), bounds, MIN_SPAN));
  };

  // ── writes ─────────────────────────────────────────────────────────
  const saveEvent = async (payload: Parameters<NonNullable<Parameters<typeof AddEventTool>[0]["onSave"]>>[0]) => {
    setBusy(true);
    try {
      const res = payload.id
        ? await mutateReality(`/api/timeline-events/${payload.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await mutateReality("/api/timeline-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
      setTool(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  /** The row as it stands, in the shape the API takes back. */
  const snapshotOf = useCallback(
    (e: TimelineEntry): PlanSnapshot => ({
      scopeId: e.scopeId,
      title: e.title,
      date: e.date,
      endDate: e.endDate,
      temporalState: e.temporalState,
      kind: String((e.detail as { landmarkKind?: string }).landmarkKind ?? "event"),
      note: ((e.detail as { note?: string | null }).note ?? null) as string | null,
    }),
    []
  );

  // APPLYING A COMMAND, IN EITHER DIRECTION.
  //
  // Every inverse is expressed as the same API call a person could make by
  // hand — there is no privileged rollback path, and no endpoint here can
  // address a row Timeline does not own. Undoing a create removes the row;
  // redoing it makes a new one, so the stack is remapped onto the new id.
  const applyCommand = useCallback(
    async (cmd: TimelineCommand, dir: "undo" | "redo") => {
      const post = async (snap: PlanSnapshot) => {
        const r = await mutateReality("/api/timeline-events", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.event?.id) pushUndo((u) => remapId(u, cmd.id, j.event.id));
        return j.event?.id ?? null;
      };
      const patch = (id: string, body: Record<string, unknown>) =>
        mutateReality(`/api/timeline-events/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });

      if (cmd.kind === "retime") {
        const to = dir === "undo" ? cmd.before : cmd.after;
        await patch(cmd.id, { date: to.date, endDate: to.endDate, scopeId: to.scopeId });
        setSelectedId(cmd.id);
      } else if (cmd.kind === "create") {
        if (dir === "undo") {
          await mutateReality(`/api/timeline-events/${cmd.id}`, { method: "DELETE" });
          setSelectedId(null);
        } else {
          setSelectedId(await post(cmd.snapshot));
        }
      } else if (cmd.kind === "delete") {
        if (dir === "undo") setSelectedId(await post(cmd.snapshot));
        else {
          await mutateReality(`/api/timeline-events/${cmd.id}`, { method: "DELETE" });
          setSelectedId(null);
        }
      } else {
        // A PLACEMENT, REVERSED AS ONE THING.
        //
        // Undo is a plain DELETE: the API restores the candidate to Event
        // Intake in the same transaction that removes the event, so there is
        // no second call and no window in which the material exists in
        // neither place. Redo re-accepts the SAME candidate at the SAME
        // placement — the row that comes back is new, so the stack is
        // remapped onto its id exactly as it is for a create.
        if (dir === "undo") {
          await mutateReality(`/api/timeline-events/${cmd.id}`, { method: "DELETE" });
          setSelectedId(null);
        } else {
          const r = await mutateReality(`/api/timeline-candidates/${cmd.candidateId}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cmd.placement),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.event?.id) {
            pushUndo((u) => remapId(u, cmd.id, j.event.id));
            setSelectedId(j.event.id);
          }
        }
      }
      await load();
    },
    [load, pushUndo]
  );

  const doUndo = useCallback(() => {
    const { cmd, next } = undoTop(undoRef.current);
    if (!cmd) return;
    undoRef.current = next;
    setUndoState(next);
    void applyCommand(cmd, "undo");
  }, [applyCommand]);

  const doRedo = useCallback(() => {
    const { cmd, next } = redoTop(undoRef.current);
    if (!cmd) return;
    undoRef.current = next;
    setUndoState(next);
    void applyCommand(cmd, "redo");
  }, [applyCommand]);

  // RETIME, COMMITTED ONCE.
  //
  // The drag itself is local: TimeField previews the object against fixed
  // geometry and never touches the network. This runs exactly once, on
  // release, with the dates the hand actually landed on — which is the
  // whole reason dragging a plan feels like moving a part rather than
  // filling in a form.
  //
  // It goes through mutateReality like every other write, so Forecast,
  // Scope and Decisions all see a fresh world without a reload. Moving a
  // plan object does NOT move any forecast: a TimelineEvent feeds no
  // simulation, and planning something is not the same as gating it.
  const retimePlanObject = useCallback(
    async (id: string, next: { date: string; endDate: string | null; scopeId?: string }) => {
      // Captured BEFORE the write, from the projection the drag was drawn
      // against — the only moment the previous timing is still true.
      const was = data?.entries.find((e) => e.id === id) ?? null;
      const res = await mutateReality(`/api/timeline-events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error ?? "Could not move that plan object");
        return;
      }
      if (was) {
        const moved = next.scopeId !== undefined && next.scopeId !== was.scopeId;
        const resized = next.endDate !== was.endDate && next.date === was.date;
        pushUndo((u) =>
          record(u, {
            kind: "retime",
            id,
            before: { scopeId: was.scopeId, date: was.date, endDate: was.endDate },
            after: { scopeId: next.scopeId ?? was.scopeId, date: next.date, endDate: next.endDate },
            label: moved ? `move ${was.title}` : resized ? `resize ${was.title}` : `reschedule ${was.title}`,
          })
        );
      }
      await load();
    },
    [load, data, pushUndo]
  );

  // COMPOSED ON THE CANVAS. The gesture already decided the project, the
  // dates and the shape; all that was missing was the name. State is stored
  // as PLANNED because that is what composing into the future means — and
  // it is still stored explicitly, never inferred from the date afterwards.
  const createPlanObject = useCallback(
    async (next: { scopeId: string; title: string; date: string; endDate: string | null }) => {
      const res = await mutateReality("/api/timeline-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, temporalState: "planned", kind: next.endDate ? "phase" : "milestone" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Could not place that on the timeline");
        return;
      }
      await load();
      if (j.event?.id) {
        pushUndo((u) =>
          record(u, {
            kind: "create",
            id: j.event.id,
            snapshot: { ...next, temporalState: "planned", kind: next.endDate ? "phase" : "milestone", note: null },
            label: `add ${next.title}`,
          })
        );
        // Seat the selection on what was just made, so the thing you composed
        // is the thing the inspector is talking about.
        setSelectedId(j.event.id);
      }
    },
    [load, pushUndo]
  );

  const deleteEvent = async (id: string) => {
    const was = data?.entries.find((e) => e.id === id) ?? null;
    const res = await mutateReality(`/api/timeline-events/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not delete");
    if (was) {
      pushUndo((u) => record(u, { kind: "delete", id, snapshot: snapshotOf(was), label: `remove ${was.title}` }));
    }
    setTool(null);
    setSelectedId(null);
    await load();
  };

  // THE SAME ACT, WITHOUT A POINTER.
  //
  // The inspector's button and the drag land in exactly one place, so a
  // keyboard user gets the same object, the same provenance and the same
  // single undo entry as someone who dragged it. It places at the SUGGESTED
  // project and date, which is the only placement a button can honestly make;
  // choosing a different one is what the drag is for.
  const acceptCandidate = async (id: string, date: string | null) => {
    const c = data?.candidates.find((x) => x.id === id);
    if (!c) return;
    const start = date ?? c.date;
    if (!start) return;
    const held = c.date && c.endDate
      ? new Date(c.endDate).getTime() - new Date(c.date).getTime()
      : 0;
    const failure = await placeCandidate(c, {
      scopeId: c.scopeId,
      date: start,
      endDate: held > 0 ? new Date(new Date(start).getTime() + held).toISOString() : null,
    });
    // Thrown, not swallowed: the inspector owns this message, because it owns
    // the date field the refusal is usually about.
    if (failure) throw new Error(failure);
  };

  // ── A CANDIDATE IN THE HAND ────────────────────────────────────────
  //
  // The page owns WHICH piece is being carried, because the page owns the
  // write. It does not own where the pointer is or what that means: the
  // pointer-to-date-and-project mapping belongs to the field, which owns the
  // axis and the lane geometry, and freezes both at pointerdown exactly as
  // every other drag on this surface does. So this is a two-line handshake —
  // "here is the material" down, "here is where it landed" back.
  const [intake, setIntake] = useState<{ candidate: TimelineCandidate; clientX: number; clientY: number } | null>(null);
  const intakeRef = useRef<TimelineCandidate | null>(null);
  /** The card under the pointer, so the score can show that one candidate's
      suggested position for as long as it is being asked about. */
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);

  // TIMING A PERSON SUPPLIED, HELD BUT NOT ACTED ON.
  //
  // A dateless candidate cannot be placed because nothing in its evidence says
  // when. Supplying that date answers exactly one of the two questions a
  // placement needs — and it must not be read as answering the other. The old
  // path took the typed date and seated the piece at the source's suggested
  // PROJECT in the same keystroke, which is the interface accepting a
  // suggestion on the human's behalf.
  //
  // So the date is held here, in this session, and all it does is make the
  // piece draggable. Nothing is written, no project is chosen, and the
  // candidate row stays dateless until someone actually places it.
  const [suppliedTiming, setSuppliedTiming] = useState<Record<string, string>>({});
  const supplyTiming = useCallback((candidateId: string, iso: string) => {
    setSuppliedTiming((m) => ({ ...m, [candidateId]: iso }));
  }, []);

  const beginIntakeDrag = useCallback((candidate: TimelineCandidate, e: React.PointerEvent) => {
    // NO TIMING, NO PLACEMENT. A candidate with no date is not draggable onto
    // a day nobody stated — but one whose timing a person has just supplied
    // is, and it carries that date rather than the source's silence.
    const date = candidate.date ?? suppliedTiming[candidate.id] ?? null;
    if (!date) return;
    e.preventDefault();
    const held = date === candidate.date ? candidate : { ...candidate, date };
    intakeRef.current = held;
    setIntake({ candidate: held, clientX: e.clientX, clientY: e.clientY });
  }, [suppliedTiming]);

  /** Released. A target means a real project under the pointer at a real
      date; anything else — the header, the chrome, off the field entirely —
      returns the piece to the rack, having written nothing. */
  const endIntakeDrag = useCallback(
    (target: { scopeId: string; date: string; endDate: string | null } | null) => {
      const held = intakeRef.current;
      intakeRef.current = null;
      setIntake(null);
      if (held && target) void placeCandidateRef.current?.(held, target);
    },
    []
  );

  // ── PLACING A CANDIDATE ────────────────────────────────────────────
  //
  // The one write in this whole interaction, and it happens exactly once, on
  // release. Everything before it — the lift, the flight, the preview, the
  // readout — is local. Nothing about a candidate crossing the score changes
  // anything until the pointer comes up on a real project.
  //
  // The placement is stated in full rather than left to the candidate's
  // suggestion, because the point of the gesture is that the human decides:
  // which project, which day, and whether this is a plan or a record of
  // something that already happened. `planned` is read off the drop position
  // against NOW — the same rule the rest of Timeline uses, stored explicitly
  // and never re-derived from the clock afterwards.
  const placeCandidate = useCallback(
    async (
      candidate: TimelineCandidate,
      target: { scopeId: string; date: string; endDate: string | null }
    ) => {
      const temporalState = new Date(target.date).getTime() >= nowT ? "planned" : "occurred";
      const res = await mutateReality(`/api/timeline-candidates/${candidate.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, temporalState }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // RETURNED, NOT LOST. A refusal is handed back to whoever asked
        // rather than blanking the instrument: nothing was written, so the
        // piece is still pending and the next load puts it back on the rack
        // by itself.
        return (j.error as string) ?? "Could not place that on the timeline";
      }
      await load();
      if (j.event?.id) {
        pushUndo((u) =>
          record(u, {
            kind: "place",
            id: j.event.id,
            candidateId: candidate.id,
            placement: { ...target, temporalState },
            label: `place ${candidate.title}`,
          })
        );
        // It is Reality now, and Reality is what the inspector talks about.
        setSelectedId(j.event.id);
      }
      return null;
    },
    [load, pushUndo, nowT]
  );
  // `endIntakeDrag` is handed to the field once and must not change identity
  // mid-gesture, so it reaches the writer through a ref rather than closing
  // over it.
  const placeCandidateRef = useRef(placeCandidate);
  placeCandidateRef.current = placeCandidate;

  const dismissCandidate = async (id: string) => {
    await mutateReality(`/api/timeline-candidates/${id}/dismiss`, { method: "POST" });
    setSelectedId(null);
    await load();
  };

  if (err) {
    return (
      <div className="instrument fixed inset-0 flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--i-red)" }}>{err}</p>
      </div>
    );
  }
  if (!data || !view || playheadT === null) {
    return (
      <div className="instrument fixed inset-0 flex items-center justify-center">
        <p className="i-label">Reading the project&rsquo;s history…</p>
      </div>
    );
  }

  // EVERYTHING WAITING OUTSIDE REALITY.
  //
  // The tray used to hold only the DATELESS candidates, on the reasoning that
  // a dated one already had an honest position on the axis and could be drawn
  // there. That reasoning was about drawing, and it cost the product its
  // rack: the pieces you can actually pick up and place were the ones the
  // tray refused to show. Every pending candidate is material now — the dated
  // ones because they can be placed, the dateless ones because they are still
  // real things the project may need.
  const pending = data.candidates;
  const memoryLanes = visibleLanes.filter((l) => memoryByScope[l.scopeId]);

  const memoryLead = memoryLanes.length > 0 ? memoryByScope[memoryLanes[0].scopeId]! : null;

  // HOW MANY PROJECTS SHARE THE DISPLAY. Four should feel luxurious and
  // eight should still be readable, so the type steps down once rather than
  // every cell shrinking toward illegibility.
  const dense = visibleLanes.length > 5;

  const stateBar = (
    <>
      {/* ── THE MASTER DISPLAY ───────────────────────────────────────
          ONE readout, cut into the chassis. It used to be five separate
          bordered cards — an instrument name, an as-of panel and one tile
          per project — which is a SaaS dashboard header sitting above an
          instrument, and it read like one.
          Now there is a single piece of display glass. Inside it, hierarchy
          is done with type size, an accent cap and one hairline: the
          dominant date is the needle's position, and to its right are the
          landings each project remembers. No cell has a box of its own,
          because a box is what you reach for when spacing and type are not
          doing the work. */}
      <div
        className="shrink-0 flex items-stretch gap-3 pl-4 pr-3"
        style={{
          height: 80,
          borderBottom: "1px solid var(--i-border-strong)",
          background: "linear-gradient(180deg, #1a2126 0%, #12181c 100%)",
          boxShadow: "inset 0 1px 0 rgba(243,240,230,0.05)",
        }}
      >
        <div className="flex flex-col justify-center shrink-0">
          <div className="i-label">Timeline</div>
        </div>

        <div
          data-shoot="master-ribbon"
          className="flex-1 min-w-0 my-2.5 rounded-lg flex items-stretch overflow-hidden"
          style={{
            background: "var(--i-recess)",
            border: "1px solid #1c2227",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.7)",
          }}
        >
          {/* AS-OF. The mode, then the date. The state rides on a cap at
              the edge of the glass — the same "the body stays one material,
              the cap carries the state" rule the plan objects follow — so
              live and remembered are told apart without a second border. */}
          <div data-shoot="memory-banner" className="shrink-0 flex items-stretch">
            <div
              style={{
                width: 3,
                background: atNow ? "var(--i-signal)" : "var(--i-violet)",
                boxShadow: `0 0 10px ${atNow ? "rgba(70,195,214,0.55)" : "rgba(155,140,250,0.55)"}`,
              }}
            />
            <div className="flex flex-col justify-center pl-3.5 pr-5" style={{ minWidth: 214 }}>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{
                    background: atNow ? "var(--i-signal)" : "var(--i-violet)",
                    boxShadow: `0 0 8px ${atNow ? "var(--i-signal)" : "var(--i-violet)"}`,
                  }}
                />
                <span
                  className="text-[8px] uppercase tracking-[0.2em]"
                  style={{ color: atNow ? "var(--i-signal)" : "var(--i-violet)" }}
                >
                  {atNow ? "Live now" : "As remembered"}
                </span>
              </div>
              <div
                data-shoot="master-date"
                className="i-readout text-[25px] leading-none mt-1.5"
                style={{ color: atNow ? "var(--i-signal)" : "var(--i-violet)" }}
              >
                {fmtFull(playheadT)}
              </div>
              <div className="text-[8.5px] text-[var(--i-text-faint)] mt-1.5">
                {atNow
                  ? "Current project truth"
                  : memoryLead
                    ? `Last report ${fmtDay(new Date(memoryLead.generatedAt).getTime())}`
                    : "No forecast snapshot yet"}
              </div>
            </div>
          </div>

          {/* THE ONE HAIRLINE. Position on the axis is a different kind of
              fact from where the projects land, and that is the only
              division this display needs. */}
          <div className="shrink-0 my-2.5" style={{ width: 1, background: "rgba(45,54,61,0.9)" }} />

          {/* THE REMEMBERED LANDINGS. One row of readouts inside the same
              glass — separated by space and a shared baseline, never by a
              box each. Pointing at one wakes its lane below, which is what
              makes the association a thing you do rather than a thing you
              have to be told. */}
          {/* LEGIBILITY HAS A FLOOR.
              Cells used to divide whatever width was left, so the tenth
              project made all ten unreadable — the display degraded quietly
              instead of admitting it had run out of room. Each cell now
              claims MIN_CELL_W and no less; past that the readout SCROLLS
              inside the same piece of glass. It stays one display, one
              baseline, no cards, no wrapping, no dropdown, and the page
              itself never gains a horizontal scrollbar. */}
          <div className="flex-1 min-w-0 relative flex items-stretch">
          <div
            ref={attachReadout}
            className="flex-1 min-w-0 flex items-stretch overflow-x-auto i-noscrollbar"
            data-shoot="memory-readout"
          >
            {visibleLanes.map((lane) => {
              const m = memoryByScope[lane.scopeId];
              const stale = m ? Math.floor((playheadT - new Date(m.generatedAt).getTime()) / DAY) : null;
              const live = hoveredLane === lane.scopeId;
              return (
                <div
                  key={lane.scopeId}
                  data-shoot={`memory-${lane.scopeId}`}
                  className="flex flex-col justify-center transition-colors"
                  onMouseEnter={() => setHoveredLane(lane.scopeId)}
                  onMouseLeave={() => setHoveredLane(null)}
                  style={{
                    flex: `1 1 ${MIN_CELL_W}px`,
                    minWidth: MIN_CELL_W,
                    paddingLeft: dense ? 11 : 18,
                    paddingRight: 6,
                    background: live ? "rgba(155,140,250,0.06)" : undefined,
                  }}
                >
                  <div
                    className="uppercase tracking-[0.14em] truncate transition-colors"
                    style={{ fontSize: dense ? 7.5 : 8, color: live ? "var(--i-text-soft)" : "var(--i-text-faint)" }}
                  >
                    {lane.name}
                  </div>
                  {/* ONE SHAPE PER CELL, WHATEVER IT HAS TO SAY.
                      A project with no report used to render a single short
                      line where its siblings render three, so the flex box
                      centred it differently and its name sat visibly lower
                      than every other name on the display. The empty state
                      keeps the full structure — value line, detail line —
                      so the readout has one baseline across the row. */}
                  {m ? (
                    <>
                      <div
                        className="i-readout leading-none mt-1.5"
                        data-shoot={`memory-likely-${lane.scopeId}`}
                        style={{ fontSize: dense ? 13.5 : 17, color: "var(--i-violet)" }}
                      >
                        {fmtDay(new Date(m.likelyDate).getTime())}
                      </div>
                      {/* SECONDARY DISCLOSURE. The range, the confidence and
                          how long the belief has been held are all true and
                          all kept -- they simply are not things you need
                          before you have asked. Pointing at the project
                          reveals them; so does selecting its Report. */}
                      <div
                        className="text-[8px] mt-1.5 tabular-nums truncate transition-opacity duration-200"
                        data-shoot={`memory-detail-${lane.scopeId}`}
                        style={{ color: "var(--i-text-faint)", opacity: live ? 1 : 0 }}
                      >
                        {fmtDay(new Date(m.earliestDate).getTime())} – {fmtDay(new Date(m.latestDate).getTime())}
                        {m.confidenceAtTarget !== null && ` · ${m.confidenceAtTarget}%`}
                        {stale !== null && stale > 0 && ` · held ${stale}d`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="i-readout leading-none mt-1.5 text-[var(--i-text-faint)]"
                        style={{ fontSize: dense ? 13.5 : 17 }}
                      >
                        —
                      </div>
                      <div className="text-[8px] mt-1.5 truncate" style={{ color: "var(--i-text-faint)", opacity: live ? 1 : 0 }}>
                        no forecast recorded yet
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {/* MORE THAN FITS, SAID WITHOUT SAYING IT. A soft edge where the
              readout runs on — the wordless cue every scrolling surface uses.
              Present only when there is genuinely something under it, and
              never in the way of the pointer. */}
          {readoutOverflows && (
            <div
              data-shoot="memory-readout-more"
              className="absolute inset-y-0 right-0"
              style={{
                width: 34,
                pointerEvents: "none",
                background: "linear-gradient(90deg, rgba(16,21,24,0) 0%, var(--i-recess) 78%)",
              }}
            />
          )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* WHAT ⌘Z WOULD REVERSE, named. A bare "undo" makes a person
              guess whether it is safe; saying "undo move Marketing plan"
              means they never have to. Absent entirely until there is
              something to undo, so the resting header stays quiet. */}
          {undoState.past.length > 0 && (
            <button
              onClick={doUndo}
              data-shoot="undo"
              title={`Undo ${describe(undoState.past[undoState.past.length - 1])} (⌘Z)`}
              className="rounded-md px-2.5 py-2 text-[10px] hover:brightness-125 transition-[filter] flex items-center gap-1.5 max-w-[190px]"
              style={{
                background: "linear-gradient(180deg, #262f35 0%, #131a1e 100%)",
                border: "1px solid var(--i-border-strong)",
                color: "var(--i-text-soft)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 3 L1.5 5.5 L4 8" />
                <path d="M1.5 5.5 H7 a3 3 0 0 1 0 6 H5.5" />
              </svg>
              <span className="truncate">{describe(undoState.past[undoState.past.length - 1])}</span>
            </button>
          )}
          <LanesControl lanes={data.lanes} value={laneView} onChange={setLaneView} />
          <LayersControl value={layers} onChange={setLayers} />
          {pending.length > 0 && (
            <button
              onClick={() => setIntakeOpen((v) => !v)}
              data-shoot="event-intake-toggle"
              data-count={pending.length}
              className="rounded-md px-2.5 py-2 text-[10px] hover:brightness-125"
              style={{
                background: intakeOpen ? "var(--i-violet-soft)" : "linear-gradient(180deg, #262f35 0%, #131a1e 100%)",
                border: "1px solid var(--i-violet)",
                color: "var(--i-violet)",
              }}
            >
              Event intake · {pending.length}
            </button>
          )}
          <button
            onClick={() => setTool({ editing: null })}
            data-shoot="add-event"
            className="rounded-md px-3.5 py-2 text-[10.5px] font-medium hover:brightness-110"
            style={{
              background: "linear-gradient(180deg, #b6a9ff 0%, var(--i-violet) 100%)",
              color: "var(--i-void)",
              boxShadow: "0 2px 8px rgba(155,140,250,0.3), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            + Add event
          </button>
        </div>
      </div>
    </>
  );

  return (
    <InstrumentShell stateBar={stateBar}>
      {/* ── CENTER ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex" style={{ background: "var(--i-void)" }}>
        {/* THE CHASSIS. The time field is cut into the instrument rather
            than floating on it -- the same recessed-well language the
            Decisions circuit and the Portfolio rack are built from. */}
        <div className="flex-1 min-w-0 flex flex-col p-2.5 overflow-hidden">
          <div
            ref={attachField}
            className="flex-1 min-h-0 flex flex-col rounded-lg overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #0a0d0f 0%, #0d1113 55%, #0a0d0f 100%)",
              border: "1px solid #191f24",
              boxShadow: "inset 0 2px 12px rgba(0,0,0,0.75), 0 1px 0 rgba(255,255,255,0.025)",
            }}
          >
            <TimeField
              lanes={visibleLanes}
              entries={data.entries}
              candidates={data.candidates}
              snapshotsByScope={data.snapshotsByScope}
              memoryByScope={memoryByScope}
              view={{ ...view, width: fieldW }}
              nowT={nowT}
              playheadT={playheadT}
              crossed={crossed}
              wokenLanes={wokenLanes}
              selectedId={selectedId}
              hoveredLane={hoveredLane}
              onSelect={(id) => { setPlaying(false); setSelectedId(id); }}
              onHoverLane={setHoveredLane}
              onScrub={(t) => { setPlaying(false); setPlayheadT(Math.max(bounds.startT, Math.min(bounds.endT, t))); }}
              onOpenScope={(scopeId) => router.push(`/scope?scopeId=${scopeId}`)}
              onViewChange={setView}
              bounds={bounds}
              reducedMotion={reducedMotion}
              laneBoxes={laneBoxes}
              onToggleExpand={(scopeId) => setExpandedLane((cur) => (cur === scopeId ? null : scopeId))}
              onPlanRetime={retimePlanObject}
              onPlanCreate={createPlanObject}
              articulating={articulating}
              ghostByScope={ghostByScope}
              deltaByScope={deltaByScope}
              layers={layers}
              hoveredId={hoveredId}
              onHoverEvent={setHoveredId}
              playing={playing}
              intakeCandidate={intake?.candidate ?? null}
              intakeStartX={intake?.clientX ?? 0}
              intakeStartY={intake?.clientY ?? 0}
              onIntakeEnd={endIntakeDrag}
              // ASKED FOR, NOT AMBIENT. Pointing at a card or selecting it is
              // the question "where does this say it goes?"; nothing else puts
              // a pending candidate on the score.
              revealedCandidateId={
                hoveredCandidateId ??
                (selectedId?.startsWith("candidate:") ? selectedId.slice("candidate:".length) : null)
              }
            />
          </div>

          {/* ARMED DELETE. Local, in place, and gone the moment the
              selection changes — no global undo architecture, no toast
              queue, just one question asked where the object is. */}
          {pendingDelete && deletable && (
            <div
              data-shoot="delete-confirm"
              className="shrink-0 px-4 py-2.5 flex items-center gap-3"
              style={{ borderTop: "1px solid var(--i-red)", background: "rgba(239,107,91,0.07)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--i-text)" }}>
                Remove <strong style={{ color: "var(--i-red)" }}>{deletable.title}</strong> from the timeline?
              </span>
              <div className="flex-1" />
              <button
                onClick={() => { setPendingDelete(null); void deleteEvent(deletable.id); }}
                data-shoot="delete-confirm-yes"
                className="rounded px-3 py-1 text-[10px] hover:brightness-110"
                style={{ background: "var(--i-red)", color: "var(--i-void)" }}
              >
                Delete
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                data-shoot="delete-confirm-no"
                className="rounded px-3 py-1 text-[10px]"
                style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
              >
                Keep
              </button>
              <span className="text-[9px]" style={{ color: "var(--i-text-faint)" }}>⌫ again · esc</span>
            </div>
          )}

          {/* ── EVENT INTAKE — A RACK, NOT A REVIEW QUEUE ─────────────────
              Pieces the project might need, sitting outside Reality. They
              rhyme with plan objects because that is what they may become,
              and they are deliberately UNSEATED: no cast shadow, a dashed
              edge, translucent, floating a little off the tray floor. You
              take one off the rack and put it on the score; nothing here is
              part of the project until you do. */}
          {intakeOpen && pending.length > 0 && (
            <div
              data-shoot="event-intake"
              className="shrink-0 px-4 py-3 flex items-stretch gap-2.5 overflow-x-auto i-noscrollbar"
              style={{
                borderTop: "1px solid rgba(155,140,250,0.45)",
                background: "linear-gradient(180deg, rgba(26,21,38,0.9) 0%, var(--i-bg) 100%)",
                boxShadow: "inset 0 6px 14px rgba(0,0,0,0.5)",
              }}
            >
              <div className="shrink-0 pr-2 self-center">
                <div className="i-label" style={{ color: "var(--i-violet)" }}>Event intake</div>
                <div className="text-[8.5px] text-[var(--i-text-faint)] mt-1 max-w-[128px] leading-tight">
                  Not on the timeline. Drag onto a project to place it.
                </div>
              </div>
              {pending.map((c) => {
                const mine = suppliedTiming[c.id] ?? null;
                const placeable = Boolean(c.date || mine);
                const held = intake?.candidate.id === c.id;
                const days = c.date && c.endDate
                  ? Math.max(1, Math.round((new Date(c.endDate).getTime() - new Date(c.date).getTime()) / DAY))
                  : null;
                const suggested = data.lanes.find((l) => l.scopeId === c.scopeId)?.name ?? null;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(`candidate:${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(`candidate:${c.id}`); }
                    }}
                    onPointerDown={(e) => beginIntakeDrag(c, e)}
                    onMouseEnter={() => setHoveredCandidateId(c.id)}
                    onMouseLeave={() => setHoveredCandidateId((v) => (v === c.id ? null : v))}
                    data-shoot={`intake-${c.id}`}
                    data-placeable={placeable || undefined}
                    data-held={held || undefined}
                    className="shrink-0 text-left rounded-md pl-2 pr-3 py-2 flex items-stretch gap-2.5 transition-[filter,opacity,transform]"
                    style={{
                      width: 218,
                      // UNSEATED MATERIAL. Translucent violet with a dashed
                      // edge — the same language a spectral candidate mark on
                      // the score already uses, so the two read as the same
                      // substance in two places.
                      background: "linear-gradient(180deg, rgba(58,48,92,0.55) 0%, rgba(30,26,48,0.75) 100%)",
                      border: `1px dashed ${selectedId === `candidate:${c.id}` ? "var(--i-violet)" : "rgba(155,140,250,0.5)"}`,
                      cursor: placeable ? (held ? "grabbing" : "grab") : "pointer",
                      opacity: held ? 0.25 : 1,
                      touchAction: "none",
                    }}
                  >
                    {/* WHAT SHAPE IT WOULD TAKE. A bar for an activity, a pin
                        for a moment, nothing for something with no timing —
                        so the shape is known before it is picked up. */}
                    <span className="shrink-0 self-center" style={{ width: 4 }} data-timing={mine ? "supplied" : c.date ? "suggested" : "none"}>
                      {days !== null ? (
                        <span className="block rounded-[2px]" style={{ height: 22, background: "var(--i-violet)", opacity: 0.7 }} />
                      ) : placeable ? (
                        <span
                          className="block"
                          style={{ width: 4, height: 4, background: "var(--i-violet)", opacity: 0.85, transform: "rotate(45deg)", marginLeft: 0 }}
                        />
                      ) : (
                        <span className="block rounded-[2px]" style={{ height: 22, border: "1px dashed rgba(155,140,250,0.4)" }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10.5px] text-[var(--i-text)] truncate">{c.title}</span>
                      <span
                        className="block text-[8.5px] truncate mt-1 tabular-nums"
                        style={{ color: placeable ? "var(--i-violet)" : "var(--i-amber)" }}
                      >
                        {/* THREE STATES, THREE SENTENCES.
                            The source proposed both a project and a date · the
                            source proposed neither · YOU supplied the timing
                            and the project is still yours to choose. The third
                            deliberately does not name the suggested project,
                            because naming it here would read as though it had
                            been settled by typing a date. */}
                        {c.date
                          ? `${suggested ?? "—"} · ${fmtDay(new Date(c.date).getTime())}${days !== null ? ` · ${days}d` : ""}`
                          : mine
                            ? `${fmtDay(new Date(mine).getTime())} · drag to a project`
                            : "Needs timing"}
                      </span>
                      <span className="block text-[8px] text-[var(--i-text-faint)] truncate mt-1">{spokenSourceLabel(c.sourceLabel)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ON DEMAND. Selecting is picking something up, so the panel is a
            consequence of holding something — not a permanent third of the
            screen waiting to be given a reason to exist. The field
            re-measures through its own ResizeObserver, and a drag can never
            be in flight while this changes, so the calendar mapping stays
            honest either way. */}
        <div
          className="shrink-0"
          style={{
            width: inspectorOpen ? PANEL_W : SEAM_W,
            transition: reducedMotion ? undefined : "width 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          data-shoot="inspector-dock"
          data-open={inspectorOpen || undefined}
        >
          <TimelineInspector
            entry={selectedEntry}
            candidate={selectedCandidate}
            laneName={laneNameFor(selectedEntry?.scopeId ?? selectedCandidate?.scopeId)}
            onOpenForecast={(scopeId) => router.push(`/forecast?scopeId=${scopeId}`)}
            onOpenDecisions={(decisionId) => router.push(`/decisions?decisionId=${decisionId}`)}
            onAcceptCandidate={acceptCandidate}
            onSupplyTiming={supplyTiming}
            suppliedDate={selectedCandidate ? suppliedTiming[selectedCandidate.id] ?? null : null}
            onDismissCandidate={dismissCandidate}
            onEditEvent={(e) => setTool({ editing: e })}
            onClose={() => setSelectedId(null)}
            busy={busy}
          />
        </div>
      </div>

      {/* ── BOTTOM ──────────────────────────────────────────────────── */}
      <Transport
        playing={playing}
        playheadT={playheadT}
        nowT={nowT}
        atNow={atNow}
        speed={speed}
        scaleLabel={scaleFor({ ...view, width: fieldW })}
        zoomPct={zoomPct}
        crossedCount={crossed.size}
        totalPast={pastEvents.length}
        moment={moment}
        laneNames={laneNames}
        reducedMotion={reducedMotion}
        onPlayPause={() => {
          if (playing) { setPlaying(false); return; }
          // Replaying from NOW would have nothing to cross, so a play from
          // the end restarts the story rather than doing nothing.
          const from = atNow ? firstT : playheadT;
          setPlayheadT(from);
          startPlayback(from);
        }}
        onPrev={() => stepEvent(-1)}
        onNext={() => stepEvent(1)}
        onToBeginning={() => { setPlaying(false); setPlayheadT(firstT); }}
        onToNow={() => { setPlaying(false); setPlayheadT(nowT); }}
        onSpeed={setSpeed}
        onZoom={onZoomPct}
        onScale={setScale}
      />

      {tool && (
        <AddEventTool
          lanes={data.lanes}
          editing={tool.editing}
          defaultScopeId={hoveredLane ?? data.lanes[0]?.scopeId ?? null}
          defaultDate={playheadT}
          onClose={() => setTool(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}
    </InstrumentShell>
  );
}
