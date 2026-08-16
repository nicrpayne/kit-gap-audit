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
  TimelineProjection, TimelineEntry, ForecastSnapshot, TimelineCandidate,
} from "@/lib/timeline/entries";
import { forecastMemoryAt } from "@/lib/timeline/entries";
import { buildPlaybackPlan, playheadAt, crossedAt, type PlaybackPlan } from "@/lib/timeline/playback";
import { DAY, fmtDay, fmtFull, scaleFor, zoomAbout, windowFollowing } from "@/lib/timeline/geometry";
import { mutateReality, subscribeReality } from "@/lib/instrument/reality";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimeField, { HEADER_H, MIN_LANE_H, MAX_LANE_H, LANE_HEADER_W } from "@/components/timeline/TimeField";
import TimelineInspector from "@/components/timeline/TimelineInspector";
import Transport, { type Speed } from "@/components/timeline/Transport";
import AddEventTool from "@/components/timeline/AddEventTool";

const MIN_SPAN = 21 * DAY;

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
  const laneH = useMemo(() => {
    const n = Math.max(1, data?.lanes.length ?? 1);
    return Math.max(MIN_LANE_H, Math.min(MAX_LANE_H, Math.floor((fieldH - HEADER_H - 8) / n)));
  }, [fieldH, data]);

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

  const atNow = playheadT !== null && Math.abs(playheadT - nowT) < 12 * 3600 * 1000;

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

  const deleteEvent = async (id: string) => {
    const res = await mutateReality(`/api/timeline-events/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not delete");
    setTool(null);
    setSelectedId(null);
    await load();
  };

  const acceptCandidate = async (id: string, date: string | null) => {
    const res = await mutateReality(`/api/timeline-candidates/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(date ? { date } : {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Could not accept");
    const fresh = await load();
    // Seat the selection onto the landmark it became, so acceptance reads
    // as the candidate becoming real rather than as something vanishing.
    if (j.event?.id && fresh) setSelectedId(j.event.id);
  };

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

  const dateless = data.candidates.filter((c) => !c.date);
  const memoryLanes = data.lanes.filter((l) => memoryByScope[l.scopeId]);

  const stateBar = (
    <>
      {/* ── TOP: identity, as-of readout, live vs historical ────────── */}
      <div
        className="shrink-0 flex items-stretch gap-4 px-4"
        style={{
          height: 76,
          borderBottom: "1px solid var(--i-border)",
          background: "linear-gradient(180deg, var(--i-panel) 0%, #12171a 100%)",
        }}
      >
        <div className="flex flex-col justify-center" style={{ minWidth: 128 }}>
          <div className="i-label">Timeline</div>
          <div className="text-[10px] text-[var(--i-text-faint)] mt-0.5">Play the project</div>
        </div>

        {/* THE AS-OF READOUT. The single most important thing on the
            surface during playback: what date are we at, and is the
            forecast being shown a live one or a remembered one. */}
        <div className="flex items-center gap-5 pl-4" style={{ borderLeft: "1px solid var(--i-border)" }}>
          <div>
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)]">
              {atNow ? "Live now" : "Playhead"}
            </div>
            <div className="i-readout text-[19px] leading-none mt-1" style={{ color: atNow ? "var(--i-mint)" : "var(--i-violet)" }}>
              {fmtFull(playheadT)}
            </div>
          </div>
          <div
            data-shoot="memory-banner"
            className="rounded px-2.5 py-1.5"
            style={{
              background: atNow ? "var(--i-mint-soft)" : "var(--i-violet-soft)",
              border: `1px solid ${atNow ? "var(--i-mint)" : "var(--i-violet)"}`,
            }}
          >
            <div className="text-[8px] uppercase tracking-[0.14em]" style={{ color: atNow ? "var(--i-mint)" : "var(--i-violet)" }}>
              {atNow ? "Live forecast" : "Forecast as remembered"}
            </div>
            <div className="text-[9.5px] text-[var(--i-text-soft)] mt-0.5">
              {atNow
                ? "Current project truth"
                : memoryLanes.length === 0
                  ? "No forecast snapshot yet"
                  : `Last report ${fmtDay(new Date(memoryByScope[memoryLanes[0].scopeId]!.generatedAt).getTime())}`}
            </div>
          </div>
        </div>

        {/* per-lane remembered landing — steps only at a Report */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto" data-shoot="memory-readout">
          {data.lanes.map((lane) => {
            const m = memoryByScope[lane.scopeId];
            const stale = m ? Math.floor((playheadT - new Date(m.generatedAt).getTime()) / DAY) : null;
            return (
              <div
                key={lane.scopeId}
                data-shoot={`memory-${lane.scopeId}`}
                className="shrink-0 rounded px-2.5 py-1.5"
                style={{ background: "var(--i-void)", border: "1px solid var(--i-border)", minWidth: 118 }}
              >
                <div className="text-[8px] uppercase tracking-[0.12em] text-[var(--i-text-faint)] truncate">{lane.name}</div>
                {m ? (
                  <>
                    <div className="i-readout text-[13px] leading-none mt-1" data-shoot={`memory-likely-${lane.scopeId}`} style={{ color: "var(--i-violet)" }}>
                      {fmtDay(new Date(m.likelyDate).getTime())}
                    </div>
                    <div className="text-[8px] text-[var(--i-text-faint)] mt-1 tabular-nums">
                      {fmtDay(new Date(m.earliestDate).getTime())} – {fmtDay(new Date(m.latestDate).getTime())}
                      {m.confidenceAtTarget !== null && ` · ${m.confidenceAtTarget}%`}
                    </div>
                    {stale !== null && stale > 0 && (
                      <div className="text-[7.5px] text-[var(--i-text-faint)] mt-0.5">held {stale}d</div>
                    )}
                  </>
                ) : (
                  <div className="text-[9px] text-[var(--i-text-faint)] mt-1.5">no snapshot yet</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {dateless.length > 0 && (
            <button
              onClick={() => setIntakeOpen((v) => !v)}
              data-shoot="event-intake-toggle"
              className="rounded-md px-2.5 py-1.5 text-[10px] hover:brightness-125"
              style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
            >
              Event intake · {dateless.length}
            </button>
          )}
          <button
            onClick={() => setTool({ editing: null })}
            data-shoot="add-event"
            className="rounded-md px-3 py-1.5 text-[10px] font-medium hover:brightness-110"
            style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
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
              lanes={data.lanes}
              entries={data.entries}
              candidates={data.candidates}
              snapshotsByScope={data.snapshotsByScope}
              memoryByScope={memoryByScope}
              view={{ ...view, width: fieldW }}
              nowT={nowT}
              playheadT={playheadT}
              crossed={crossed}
              selectedId={selectedId}
              hoveredLane={hoveredLane}
              onSelect={(id) => { setPlaying(false); setSelectedId(id); }}
              onHoverLane={setHoveredLane}
              onScrub={(t) => { setPlaying(false); setPlayheadT(Math.max(bounds.startT, Math.min(bounds.endT, t))); }}
              onOpenScope={(scopeId) => router.push(`/scope?scopeId=${scopeId}`)}
              onViewChange={setView}
              bounds={bounds}
              reducedMotion={reducedMotion}
              laneH={laneH}
            />
          </div>

          {/* EVENT INTAKE — dateless candidates have no honest position on
              the axis, so they wait here rather than being placed. */}
          {intakeOpen && dateless.length > 0 && (
            <div
              data-shoot="event-intake"
              className="shrink-0 px-4 py-2.5 flex items-center gap-2 overflow-x-auto"
              style={{ borderTop: "1px solid var(--i-violet)", background: "var(--i-bg)" }}
            >
              <div className="shrink-0">
                <div className="i-label" style={{ color: "var(--i-violet)" }}>Event intake</div>
                <div className="text-[8.5px] text-[var(--i-text-faint)]">no date in evidence</div>
              </div>
              {dateless.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(`candidate:${c.id}`)}
                  data-shoot={`intake-${c.id}`}
                  className="shrink-0 text-left rounded-md px-2.5 py-1.5 max-w-[260px] hover:brightness-125"
                  style={{
                    background: "var(--i-panel)",
                    border: `1px solid ${selectedId === `candidate:${c.id}` ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                  }}
                >
                  <div className="text-[10.5px] text-[var(--i-text)] truncate">{c.title}</div>
                  <div className="text-[8.5px] text-[var(--i-text-faint)] truncate mt-0.5">{c.sourceLabel}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ width: 316 }}>
          <TimelineInspector
            entry={selectedEntry}
            candidate={selectedCandidate}
            laneName={laneNameFor(selectedEntry?.scopeId ?? selectedCandidate?.scopeId)}
            onOpenForecast={(scopeId) => router.push(`/forecast?scopeId=${scopeId}`)}
            onOpenDecisions={(decisionId) => router.push(`/decisions?decisionId=${decisionId}`)}
            onAcceptCandidate={acceptCandidate}
            onDismissCandidate={dismissCandidate}
            onEditEvent={(e) => setTool({ editing: e })}
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
