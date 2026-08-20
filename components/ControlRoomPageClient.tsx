"use client";

// THE MASTER CONTROL ROOM.
//
// It owns nothing. Every number is read from the instrument that owns it —
// Scope, Portfolio, Decisions, Timeline, Forecast — and every surface is a
// door into that instrument. There is no dashboard-only truth here, no
// second Scenario, no second forecast, and no metric the model does not
// already compute. docs/CONTROL-ROOM-TRUTH-AUDIT.md says, surface by
// surface, which field each reading came from and which of the concept
// image's readings were refused.
//
// ── V4: THE APPROVED LAYOUT, IMPLEMENTED ───────────────────────────────
//
// V3 solved the architecture and then arranged it to its own taste. V4
// implements the approved Master Control Room composition instead:
//
//   APP HEADER      identity, live clock, horizon, last forecast, Views
//   TITLE BLOCK     the room's name and the order its questions run in
//   TELEMETRY       five numbered instruments across the top, not cards
//   WORKING SURFACE the Project Time Machine, dominant, minimal chrome
//   OPERATIONAL RAIL system status · dependencies · constraints · changes
//   ANALYSIS ROW    four compact instruments: forecast, capacity,
//                   decisions, release composition
//   STATUS BAR      stored timestamps along the foot
//
// WHERE THE MOCKUP ASKED FOR SOMETHING THE MODEL CANNOT PRODUCE, the
// VISUAL PATTERN IS KEPT AND THE CONTENT IS REPLACED with the closest
// truthful value. "Portfolio Health" becomes release composition;
// "Risk Signals · High/Medium" becomes current constraints with their own
// real quantities; "Scope Alignment 98%" and "Capacity Health: Good"
// become dated feeds; "All systems nominal" becomes the oldest reading on
// the page. None of those substitutions is silent — each is in the audit.
//
// The mockup's "+ Add event" is deliberately absent: this surface writes
// nothing, and a control that implies otherwise would be the one lie on
// the page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimelinePageClient from "@/components/TimelinePageClient";
import { Panel, PanelDoor, Row } from "@/components/control-room/Panels";
import { Telemetry, TelemetryStrip, DOMAIN_ACCENT } from "@/components/control-room/Telemetry";
import StatusBar from "@/components/control-room/StatusBar";
import ProjectField from "@/components/control-room/ProjectField";
import Inspector from "@/components/control-room/Inspector";
import ConfidenceChart from "@/components/control-room/ConfidenceChart";
import LensEditor from "@/components/control-room/LensEditor";
import { useProject, EMPTY_SCENARIO } from "@/lib/instrument/useProject";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { subscribeReality } from "@/lib/instrument/reality";
import { readControlRoom, type ControlRoomReading } from "@/lib/control-room/read";
import { readProjectField, type Selection } from "@/lib/control-room/field";
import {
  DEFAULT_WORKSPACE,
  LENSES,
  LENS_BY_ID,
  loadWorkspace,
  resetWorkspace,
  saveWorkspace,
  toggleSurface,
  visibleSurfaces,
  type LensId,
  type SurfaceId,
  type Workspace,
} from "@/lib/control-room/lenses";
import { composeFeatures } from "@/lib/scope/features";
import type { TimelineProjection } from "@/lib/timeline/entries";

const dLong = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const dShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ago = (d: Date, now: Date) => {
  const h = (now.getTime() - d.getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
/** Fractional days into the shortest true phrase. Used for feed ages, where
    "0d" would read as "we do not know" rather than "moments ago". */
const age = (days: number) => {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m`;
  if (days < 2) return `${Math.round(days * 24)}h`;
  return `${Math.round(days)}d`;
};
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function ControlRoomPageClient() {
  const m = useProject();
  const dec = useDecisions();
  const [timeline, setTimeline] = useState<TimelineProjection | null>(null);
  const [tlError, setTlError] = useState<string | null>(null);

  // WHICH WORKSPACE THIS PERSON IS IN. Read from localStorage after mount,
  // so the server and the first client render agree; a stored preference is
  // a client fact, and pretending to know it during SSR is how hydration
  // mismatches get born.
  const [workspace, setWorkspace] = useState<Workspace>(DEFAULT_WORKSPACE);
  const [editing, setEditing] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  useEffect(() => setWorkspace(loadWorkspace()), []);
  const commit = useCallback((w: Workspace) => {
    setWorkspace(w);
    saveWorkspace(w);
  }, []);
  const visible = useMemo(() => visibleSurfaces(workspace), [workspace]);
  const on = useCallback((id: SurfaceId) => visible.has(id), [visible]);

  // WHAT IS SELECTED ON THE FIELD. Pure view state: it changes what is
  // highlighted and what the consequence rail is talking about, and nothing
  // else. Deliberately NOT persisted — a selection is a question you are
  // asking right now, not a preference.
  const [selection, setSelection] = useState<Selection | null>(null);

  // THE SAME READ THE TIMELINE INSTRUMENT MAKES, on the same bus. Not a
  // dashboard cache: a Reality change anywhere re-reads this, exactly as it
  // re-reads every owner instrument.
  const loadTimeline = useCallback(async () => {
    try {
      const r = await fetch("/api/timeline", { cache: "no-store" });
      if (!r.ok) throw new Error(`Timeline unavailable (${r.status})`);
      setTimeline((await r.json()) as TimelineProjection);
      setTlError(null);
    } catch (e) {
      setTlError(e instanceof Error ? e.message : "Timeline unavailable");
    }
  }, []);
  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);
  useEffect(() => subscribeReality(() => void loadTimeline()), [loadTimeline]);

  // WHEN THIS BROWSER LAST RECEIVED THE PROJECT PAYLOAD. Nothing on the
  // server knows when a particular client last asked, and the payload
  // carries no stamp of its own — so the only honest answer is the one this
  // page observes. The store hands back a NEW object on every successful
  // fetch, so its identity changing is exactly "a fresh payload landed".
  const received = useRef<{ of: unknown; at: Date }>({ of: null, at: new Date() });
  if (m.data && received.current.of !== m.data) received.current = { of: m.data, at: new Date() };

  const reading: ControlRoomReading | null = useMemo(() => {
    if (!m.data || !m.preview || !m.baseline || !timeline) return null;
    return readControlRoom({
      dataReceivedAt: received.current.at,
      // The Timeline's own NOW, so the whole page agrees with the score at
      // its centre rather than with whatever the browser clock says.
      now: new Date(timeline.now),
      data: m.data,
      scenario: m.scenario,
      scenarioActive: m.active,
      preview: m.preview,
      baseline: m.baseline,
      floorByScope: m.floorByScope,
      decisions: dec.data?.decisions ?? [],
      entries: timeline.entries,
      lanes: timeline.lanes,
      timelineCandidates: timeline.candidates ?? [],
      timelineRangeEnd: timeline.rangeEnd ? new Date(timeline.rangeEnd) : null,
    });
  }, [m.data, m.preview, m.baseline, m.floorByScope, m.scenario, m.active, dec.data, timeline]);

  const field = useMemo(() => {
    if (!m.data || !m.preview || !m.baseline || !timeline) return null;
    return readProjectField({
      now: new Date(timeline.now),
      data: m.data,
      scenario: m.scenario,
      scenarioActive: m.active,
      preview: m.preview,
      baseline: m.baseline,
      floorByScope: m.floorByScope,
      decisions: dec.data?.decisions ?? [],
    });
  }, [m.data, m.preview, m.baseline, m.floorByScope, m.scenario, m.active, dec.data, timeline]);

  // A selection that no longer exists (the Scenario removed its gate, a
  // project went away) must not leave the rail talking about a ghost.
  useEffect(() => {
    if (!field || !selection) return;
    const alive =
      selection.kind === "gate"
        ? field.gates.some((g) => g.id === selection.id)
        : selection.kind === "edge"
          ? field.edges.some((e) => e.id === selection.id)
          : field.lanes.some((l) => l.scopeId === selection.id);
    if (!alive) setSelection(null);
  }, [field, selection]);

  const lens = LENS_BY_ID.get(workspace.lens);

  // ── APPLICATION HEADER ─────────────────────────────────────────────────
  const strip = (
    <div
      data-shoot="cr-strip"
      className="relative flex shrink-0 items-center gap-0 px-3.5"
      style={{
        background: "var(--i-panel)",
        borderBottom: `1px solid ${m.active ? "var(--i-violet)" : "var(--i-border)"}`,
        height: 46,
      }}
    >
      <span className="text-[12.5px] font-semibold uppercase tracking-[0.11em]" style={{ color: "var(--i-text)" }}>
        Master Control Room
      </span>
      <Divider />
      {reading && (
        <>
          <HeaderField label="Live now" value={dLong(reading.time.now)} tone="var(--i-signal)" shoot="cr-now" />
          <Divider />
          <HeaderField
            label="Forecast horizon"
            value={reading.time.horizonDays !== null ? `${reading.time.horizonDays} days` : "—"}
            tone="var(--i-signal)"
            shoot="cr-horizon"
          />
          <Divider />
          <HeaderField
            label="Last forecast update"
            value={reading.time.lastForecastAt ? dLong(reading.time.lastForecastAt) : "never run"}
            tone={reading.time.lastForecastAt ? "var(--i-amber)" : "var(--i-text-faint)"}
            shoot="cr-forecast-age"
          />
        </>
      )}
      <div className="flex-1" />

      {m.active && (
        <>
          <span
            data-shoot="cr-scenario"
            className="mr-2 inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em]"
            style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
          >
            Scenario
          </span>
          <button
            data-shoot="cr-discard"
            onClick={() => m.setScenario(EMPTY_SCENARIO)}
            className="mr-3 rounded-[3px] px-2.5 py-1 text-[10.5px]"
            style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
          >
            Back to Reality
          </button>
        </>
      )}

      {/* VIEWS. The workspace switcher, exactly the role Premiere gives it:
          one control that changes which tools are on the desk, and never
          anything about the project. */}
      <div className="relative">
        <button
          data-shoot="cr-views"
          onClick={() => setViewsOpen((v) => !v)}
          className="flex items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-[11px] transition-colors"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        >
          <span style={{ color: "var(--i-text-faint)" }}>Views</span>
          <span className="font-medium">{lens?.label ?? "Custom"}</span>
          <span className="text-[8px]" style={{ color: "var(--i-text-faint)" }}>
            ▼
          </span>
        </button>
        {viewsOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setViewsOpen(false)} />
            <div
              data-shoot="cr-views-menu"
              className="absolute right-0 z-50 mt-1.5 w-[268px] overflow-hidden rounded-md"
              style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-border-strong)" }}
            >
              {LENSES.filter((l) => l.surfaces !== null || workspace.lens === "custom").map((l) => {
                const active = workspace.lens === l.id;
                return (
                  <button
                    key={l.id}
                    data-shoot={`cr-lens-pick-${l.id}`}
                    data-on={active}
                    onClick={() => {
                      commit({ ...workspace, lens: l.id });
                      setViewsOpen(false);
                    }}
                    className="flex w-full items-baseline gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--i-panel)]"
                    style={{ background: active ? "var(--i-panel)" : "transparent" }}
                  >
                    <span
                      className="w-[78px] shrink-0 text-[11.5px]"
                      style={{ color: active ? "var(--i-signal)" : "var(--i-text)" }}
                    >
                      {l.label}
                    </span>
                    <span className="min-w-0 truncate text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                      {l.question}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <button
        data-shoot="cr-lens-editor-open"
        onClick={() => setEditing(true)}
        title="Customize this workspace"
        className="ml-2 flex h-[28px] w-[28px] items-center justify-center rounded-[3px] text-[13px]"
        style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
      >
        ⚙
      </button>
    </div>
  );

  const dialog = editing ? (
    <LensEditor
      workspace={workspace}
      onToggle={(id) => commit(toggleSurface(workspace, id))}
      onLens={(id: LensId) => commit({ ...workspace, lens: id })}
      onReset={() => setWorkspace(resetWorkspace())}
      onClose={() => setEditing(false)}
    />
  ) : null;

  if (!reading || !field || !m.startDate) {
    return (
      <InstrumentShell stateBar={strip}>
        <div className="i-label flex flex-1 items-center justify-center" data-shoot="cr-empty">
          {m.error ?? dec.error ?? tlError ?? "Reading the project…"}
        </div>
        {dialog}
      </InstrumentShell>
    );
  }

  const r = reading;
  const gatingConfidence = r.outcome.confidenceHistory.find((s) => s.id === r.outcome.gatedByScopeId) ?? null;
  const forecastTone = m.active ? "var(--i-violet)" : "var(--i-signal)";

  const readings = (["reality", "choices", "capacity", "outcome", "time"] as const).filter((d) =>
    on(`reading-${d}` as SurfaceId)
  );
  const railIds = (["system-status", "inspector", "dependency-watch", "constraints", "what-changed"] as const).filter(
    (id) => on(id)
  );
  const analysis = (
    ["forecast-stability", "capacity-overview", "decisions", "release-composition", "system-status"] as const
    // System status lives in the rail when there is a rail; it only falls
    // down to the analysis row in a workspace that has no rail at all.
  ).filter((id) => on(id) && !(id === "system-status" && railIds.includes("system-status")));
  const heroOn = on("time-machine") || on("field");

  return (
    <InstrumentShell stateBar={strip}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--i-void)" }}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-2 pt-2">
          {/* ── TITLE BLOCK ──────────────────────────────────────────── */}
          <div className="flex shrink-0 items-end justify-between gap-4">
            <div>
              <h1
                className="text-[19px] font-bold uppercase leading-none tracking-[0.045em]"
                style={{ color: "var(--i-text)" }}
              >
                Master Control Room
              </h1>
              <p className="pt-1 text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                Reality → Choices → Capacity → Likely Outcome → Time
              </p>
            </div>
            <p className="pb-0.5 text-[10.5px]" data-shoot="cr-lens-question" style={{ color: "var(--i-text-faint)" }}>
              <span style={{ color: "var(--i-text-soft)" }}>{lens?.label ?? "Custom"}</span>
              {lens?.question ? ` — ${lens.question}` : ""}
            </p>
          </div>

          {/* ── TELEMETRY ────────────────────────────────────────────── */}
          {readings.length > 0 && (
            <TelemetryStrip count={readings.length}>
              {readings.includes("reality") && (
                <Telemetry
                  index={1}
                  domain="reality"
                  label="Reality"
                  question="What's actually happening"
                  {...(r.reality.blockingSignals > 0
                    ? {
                        value: String(r.reality.blockingSignals),
                        unit: plural(r.reality.blockingSignals, "Blocking signal", "Blocking signals"),
                        valueTone: "var(--i-red)",
                      }
                    : {
                        value: String(r.reality.openSignals),
                        unit: plural(r.reality.openSignals, "Open signal", "Open signals"),
                      })}
                  second={String(r.reality.completedRecently)}
                  secondLabel="Shipped, 14d"
                  series={r.reality.shippedSeries}
                  href="/audit"
                  shoot="cr-card-reality"
                />
              )}
              {readings.includes("choices") && (
                <Telemetry
                  index={2}
                  domain="choices"
                  label="Choices"
                  question="What's holding the date"
                  value={String(r.choices.gating)}
                  unit={r.choices.gating === 1 ? "Gate holding delivery" : "Gates holding delivery"}
                  valueTone={r.choices.gating > 0 ? "var(--i-violet)" : "var(--i-mint)"}
                  second={String(r.choices.open)}
                  secondLabel="Open decisions"
                  series={r.choices.answeredSeries}
                  href="/decisions"
                  shoot="cr-card-choices"
                />
              )}
              {readings.includes("capacity") && (
                <Telemetry
                  index={3}
                  domain="capacity"
                  label="Capacity"
                  question="What we can do"
                  // ARRIVING, not "utilization". Of the time we committed,
                  // how much lands on the work rather than being lost
                  // crossing between projects. Both terms come from the same
                  // call over the same people — see the truth audit.
                  value={r.capacity.arrivingPct === null ? "—" : `${Math.round(r.capacity.arrivingPct)}%`}
                  unit="Reaching the work"
                  valueTone={
                    r.capacity.arrivingPct === null
                      ? "var(--i-text-faint)"
                      : r.capacity.arrivingPct >= 95
                        ? "var(--i-mint)"
                        : "var(--i-amber)"
                  }
                  second={`${r.capacity.effective.toFixed(1)}`}
                  secondLabel={`of ${r.capacity.raw.toFixed(1)} FTE`}
                  // No trace: capacity has NO history in the model.
                  series={null}
                  href="/portfolio"
                  shoot="cr-card-capacity"
                />
              )}
              {readings.includes("outcome") && (
                <Telemetry
                  index={4}
                  domain="outcome"
                  label="Likely outcome"
                  question="What we believe will happen"
                  value={r.outcome.likely ? dShort(r.outcome.likely) : "—"}
                  unit={r.outcome.gatedBy ? `${r.outcome.gatedBy} lands last` : "Nothing simulated"}
                  valueTone={forecastTone}
                  second={r.outcome.confidence !== null ? `${r.outcome.confidence}%` : "No target"}
                  secondLabel={r.outcome.confidence !== null ? "Confidence" : "to measure against"}
                  series={gatingConfidence?.points ?? null}
                  // REALITY IS ALWAYS VISIBLE UNDER A SCENARIO. When the
                  // hypothetical did not move the project's date, the chip
                  // says so rather than repeating the same date twice and
                  // leaving a person to spot that they match.
                  reality={
                    m.active && r.outcome.realityLikely
                      ? r.outcome.likely && dShort(r.outcome.realityLikely) === dShort(r.outcome.likely)
                        ? `${dShort(r.outcome.realityLikely)} · unchanged`
                        : dShort(r.outcome.realityLikely)
                      : null
                  }
                  href="/forecast"
                  shoot="cr-card-outcome"
                />
              )}
              {readings.includes("time") && (
                <Telemetry
                  index={5}
                  domain="time"
                  label="Time"
                  question="Where we are in time"
                  value={
                    r.time.nextLandmark
                      ? `${r.time.nextLandmark.inDays}d`
                      : r.time.nextTarget
                        ? `${r.time.nextTarget.inDays}d`
                        : "—"
                  }
                  unit={
                    r.time.nextLandmark
                      ? r.time.nextLandmark.title
                      : r.time.nextTarget
                        ? `${r.time.nextTarget.name} target`
                        : "Nothing planned ahead"
                  }
                  valueTone="var(--i-text)"
                  second={r.time.nextTarget ? dShort(r.time.nextTarget.date) : dShort(r.time.now)}
                  secondLabel={r.time.nextTarget ? "Next target" : "Today"}
                  series={null}
                  href="/timeline"
                  shoot="cr-card-time"
                />
              )}
            </TelemetryStrip>
          )}

          {/* ── WORKING SURFACE + OPERATIONAL RAIL ───────────────────── */}
          {(heroOn || railIds.length > 0) && (
            <div className="flex min-h-0 flex-1 gap-2">
              {heroOn && (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                  {/* THE TIMELINE INSTRUMENT ITSELF, embedded. Not a copy of
                      it, not a chart that looks like it — the same
                      component, the same playback, the same read model. */}
                  {on("time-machine") && (
                    <section
                      data-shoot="cr-time-machine"
                      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md ${on("field") ? "flex-1" : "flex-1"}`}
                      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
                    >
                      <header
                        className="flex shrink-0 items-center justify-between gap-3 px-3 py-2"
                        style={{ borderBottom: "1px solid var(--i-border)" }}
                      >
                        <div className="flex items-center gap-2">
                          <span style={{ color: forecastTone }}>◆</span>
                          <h2
                            className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
                            style={{ color: "var(--i-text)" }}
                          >
                            Project Time Machine
                          </h2>
                          <span
                            className="rounded-[3px] px-1.5 py-[2px] text-[9px]"
                            style={{ background: "var(--i-recess)", color: "var(--i-text-faint)" }}
                          >
                            ◇ As remembered
                          </span>
                        </div>
                        <Link href="/timeline" className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                          Open Timeline →
                        </Link>
                      </header>
                      <div className="flex min-h-0 flex-1 flex-col">
                        <TimelinePageClient embedded />
                      </div>
                    </section>
                  )}

                  {on("field") && (
                    <Panel
                      title="Project field"
                      shoot="cr-field-panel"
                      className={on("time-machine") ? "h-[300px] shrink-0" : "min-h-0 flex-1"}
                      note={fieldNote(field)}
                      accent={forecastTone}
                    >
                      <ProjectField
                        field={field}
                        scenarioActive={m.active}
                        selection={selection}
                        onSelect={setSelection}
                      />
                    </Panel>
                  )}
                </div>
              )}

              {railIds.length > 0 && (
                <div
                  data-shoot="cr-rail"
                  className={`flex ${heroOn ? "w-[276px] shrink-0" : "min-w-0 flex-1"} flex-col gap-2`}
                >
                  {railIds.includes("system-status") && (
                    <Panel
                      title="System status"
                      shoot="cr-system-panel"
                      className="shrink-0"
                      accent="var(--i-mint)"
                      note={
                        r.oldestReading
                          ? `oldest ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
                          : null
                      }
                    >
                      {/* HOW OLD IS WHAT I AM LOOKING AT. Timestamps only —
                          no green/amber/red verdict, because grading a feed
                          needs a threshold nobody has set, and a feed we
                          cannot date is left out rather than guessed at.
                          Two columns, so five feeds cost three rows of the
                          rail instead of five. */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-[3px]">
                        {r.system.map((s) => (
                          <Link
                            key={s.id}
                            href={s.href}
                            data-shoot={`cr-system-${s.id}`}
                            className="flex min-w-0 items-baseline justify-between gap-1.5 rounded px-1 py-[1px] hover:bg-[var(--i-panel-raised)]"
                          >
                            <span className="truncate text-[10px]" style={{ color: "var(--i-text-soft)" }}>
                              {s.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="i-readout text-[10px]" style={{ color: "var(--i-text)" }}>
                                {s.ageDays === null ? "—" : age(s.ageDays)}
                              </span>
                              <span
                                className="h-[5px] w-[5px] rounded-full"
                                style={{ background: "var(--i-mint)", opacity: 0.85 }}
                              />
                            </span>
                          </Link>
                        ))}
                      </div>
                    </Panel>
                  )}

                  {railIds.includes("inspector") && (
                    <div className="flex min-h-[170px] flex-1 flex-col">
                      <Inspector
                        field={field}
                        reading={r}
                        selection={selection}
                        onSelect={setSelection}
                        scenarioActive={m.active}
                      />
                    </div>
                  )}

                  {railIds.includes("dependency-watch") && (
                    <Panel
                      title="Dependency watch"
                      href="/orbit"
                      action="Orbit"
                      shoot="cr-dependency-watch"
                      className="max-h-[168px] shrink-0"
                      accent="var(--i-signal)"
                    >
                      <div className="flex h-full flex-col">
                        <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto">
                          {r.dependencies.length === 0 && (
                            <p className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                              Nothing waits on anything else.
                            </p>
                          )}
                          {r.dependencies
                            .filter((d) => d.kind !== "needs_review")
                            .map((d) => (
                              <Row
                                key={d.id}
                                shoot={`cr-dep-${d.kind}`}
                                title={d.subject}
                                detail={d.kind === "shared_upstream" ? d.detail : null}
                                quantity={d.quantity}
                                tone={d.kind === "shared_upstream" ? "amber" : d.causal ? "mint" : "faint"}
                                dashed={!d.causal}
                                href={
                                  d.focusScopeId
                                    ? `/orbit?focus=${d.focusScopeId}${d.selectNodeId ? `&select=${encodeURIComponent(d.selectNodeId)}` : ""}`
                                    : undefined
                                }
                              />
                            ))}
                        </div>
                        {/* PINNED OUTSIDE THE SCROLLER: unreviewed external
                            claims must never scroll out of sight, and are
                            drawn as not-yet-real because the product has no
                            model for a suspected dependency. */}
                        {r.needsReview > 0 && (
                          <div className="shrink-0 pt-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                            <Row
                              shoot="cr-dep-needs_review"
                              dashed
                              tone="faint"
                              title={`${r.needsReview} unreviewed external ${plural(r.needsReview, "claim", "claims")} — counts towards no date until a person accepts it`}
                              href="/timeline"
                            />
                          </div>
                        )}
                      </div>
                    </Panel>
                  )}

                  {railIds.includes("constraints") && (
                    <Panel
                      title="Current constraints"
                      shoot="cr-constraints"
                      className="min-h-[112px] flex-1"
                      accent="var(--i-amber)"
                      note={`${r.constraints.length} active`}
                    >
                      <div className="flex h-full flex-col">
                        <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto">
                          {r.constraints.length === 0 && (
                            <p className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                              Nothing is constraining delivery beyond the work itself.
                            </p>
                          )}
                          {r.constraints.slice(0, 6).map((c) => (
                            <Row
                              key={c.id}
                              shoot="cr-constraint"
                              title={c.detail}
                              detail={c.label}
                              quantity={c.quantity}
                              tone="amber"
                              href={c.href}
                            />
                          ))}
                        </div>
                        <PanelDoor href="/decisions" label="View decisions" tone="var(--i-amber)" />
                      </div>
                    </Panel>
                  )}

                  {railIds.includes("what-changed") && (
                    <Panel
                      title="What changed"
                      shoot="cr-activity"
                      className="min-h-[112px] flex-1"
                      accent="var(--i-text-soft)"
                      note="newest first"
                    >
                      <div className="flex h-full flex-col">
                        <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
                          {r.activity.length === 0 && (
                            <p className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                              Nothing has happened yet.
                            </p>
                          )}
                          {r.activity.map((a) => (
                            <Link
                              key={a.id}
                              href={a.href}
                              data-shoot="cr-activity-row"
                              className="flex items-baseline justify-between gap-2 rounded px-1 py-[3px] hover:bg-[var(--i-panel-raised)]"
                            >
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="shrink-0 text-[7px]" style={{ color: familyColour(a.family) }}>
                                  ◆
                                </span>
                                <span className="truncate text-[11px]" style={{ color: "var(--i-text-soft)" }}>
                                  {a.title}
                                  {a.count > 1 && <span style={{ color: "var(--i-text-faint)" }}> ×{a.count}</span>}
                                </span>
                              </span>
                              <span
                                className="i-readout shrink-0 text-[10px]"
                                style={{ color: "var(--i-text-faint)" }}
                              >
                                {a.note ? `${a.note} · ` : ""}
                                {ago(a.at, r.time.now)}
                              </span>
                            </Link>
                          ))}
                        </div>
                        <PanelDoor href="/timeline" label="View timeline" />
                      </div>
                    </Panel>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ANALYSIS ROW ─────────────────────────────────────────── */}
          {analysis.length > 0 && (
            <div
              className="grid h-[178px] shrink-0 gap-2"
              style={{ gridTemplateColumns: `repeat(${analysis.length}, minmax(0, 1fr))` }}
              data-shoot="cr-surfaces"
            >
              {on("forecast-stability") && (
                <Panel
                  title="Forecast confidence"
                  href="/forecast"
                  action="Forecast"
                  shoot="cr-surf-forecast"
                  accent="var(--i-signal)"
                  note={r.outcome.confidenceHistory.length > 0 ? "as reported" : null}
                >
                  {r.outcome.confidenceHistory.length > 0 ? (
                    <div className="flex h-full flex-col">
                      <div className="flex shrink-0 items-baseline gap-1.5">
                        {/* The headline belongs to the project that LANDS
                            LAST, because that is the one whose confidence is
                            the project's confidence. When it has no target
                            there is no percentage to state, and this says so
                            rather than borrowing another project's number. */}
                        <span
                          data-shoot="cr-confidence-now"
                          className="i-readout text-[22px] leading-none"
                          style={{ color: r.outcome.confidence === null ? "var(--i-text-faint)" : forecastTone }}
                        >
                          {r.outcome.confidence !== null ? `${r.outcome.confidence}%` : "No target"}
                        </span>
                        <span className="min-w-0 truncate text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
                          {r.outcome.confidence !== null
                            ? `for ${r.outcome.gatedBy}`
                            : `for ${r.outcome.gatedBy ?? "the last project"}`}
                        </span>
                        {r.outcome.confidenceTrendPts !== null && (
                          <span
                            data-shoot="cr-confidence-trend"
                            className="i-readout shrink-0 text-[10px]"
                            style={{ color: r.outcome.confidenceTrendPts >= 0 ? "var(--i-mint)" : "var(--i-red)" }}
                          >
                            {r.outcome.confidenceTrendPts > 0 ? "+" : ""}
                            {r.outcome.confidenceTrendPts} pts
                          </span>
                        )}
                      </div>
                      <div className="min-h-0 flex-1 pt-1.5">
                        <ConfidenceChart
                          series={r.outcome.confidenceHistory}
                          gatingId={r.outcome.gatedByScopeId}
                          shoot="cr-confidence-chart"
                        />
                      </div>
                    </div>
                  ) : (
                    // Refusing to draw is the honest answer.
                    <p
                      data-shoot="cr-confidence-nohistory"
                      className="text-[10.5px] leading-snug"
                      style={{ color: "var(--i-text-faint)" }}
                    >
                      No report has stored a confidence yet, so there is no history to draw.
                    </p>
                  )}
                </Panel>
              )}

              {on("capacity-overview") && (
                <Panel
                  title="Capacity overview"
                  href="/portfolio"
                  action="Portfolio"
                  shoot="cr-surf-capacity"
                  accent="var(--i-mint)"
                  // THE GAP, IN THE HEADER. Allocations carry no timestamps
                  // and there is no capacity snapshot anywhere in the schema,
                  // so no trend can be drawn honestly — and today's value
                  // drawn flat would assert a stability nobody measured.
                  note="today only · no history"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex shrink-0 items-baseline gap-1.5 pb-1.5">
                      <span
                        className="i-readout text-[22px] leading-none"
                        style={{
                          color:
                            r.capacity.arrivingPct !== null && r.capacity.arrivingPct >= 95
                              ? "var(--i-mint)"
                              : "var(--i-amber)",
                        }}
                      >
                        {r.capacity.arrivingPct === null ? "—" : `${Math.round(r.capacity.arrivingPct)}%`}
                      </span>
                      <span className="truncate text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
                        reaching work · {r.capacity.people} people · {r.capacity.free.toFixed(1)} free
                      </span>
                    </div>
                    <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                      {r.capacity.byScope.map((c) => {
                        // Scaled against the LARGEST channel, not the
                        // allocated total — a project whose capacity is a
                        // counted stand-in can exceed the roster's own sum,
                        // and clamping would flatten every real channel.
                        const w = Math.max(0.001, ...r.capacity.byScope.map((x) => Math.max(x.raw, x.effective)));
                        const selected = selection?.kind === "capacity" && selection.id === c.scopeId;
                        return (
                          <button
                            key={c.scopeId}
                            data-shoot={`cr-capacity-row-${c.scopeId}`}
                            onClick={() => setSelection(selected ? null : { kind: "capacity", id: c.scopeId })}
                            className="rounded px-1 text-left transition-colors hover:bg-[var(--i-panel-raised)]"
                            style={{ background: selected ? "var(--i-panel-raised)" : undefined }}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
                                {c.name}
                              </span>
                              <span className="i-readout text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                                {c.effective.toFixed(1)}
                                {c.basis === "allocations" ? ` / ${c.raw.toFixed(1)}` : " counted"}
                              </span>
                            </div>
                            {/* COMMITTED is the track, ARRIVING is the fill.
                                The gap between them is context-switch loss,
                                drawn to scale and never exaggerated. */}
                            <div className="mt-[3px] h-[5px] rounded-full" style={{ background: "var(--i-recess)" }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, (c.raw / w) * 100)}%`,
                                  background: "var(--i-mint)",
                                  opacity: 0.22,
                                }}
                              />
                              <div
                                className="relative -mt-[5px] h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, (c.effective / w) * 100)}%`,
                                  background: "var(--i-mint)",
                                  opacity: c.basis === "allocations" ? 0.9 : 0.4,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Panel>
              )}

              {on("decisions") && (
                <Panel
                  title="Decisions summary"
                  href="/decisions"
                  action="Decisions"
                  shoot="cr-surf-decisions"
                  accent="var(--i-violet)"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex shrink-0 items-baseline gap-1.5">
                      <span className="i-readout text-[22px] leading-none" style={{ color: "var(--i-violet)" }}>
                        {r.choices.open}
                      </span>
                      <span className="text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
                        Active decisions
                      </span>
                    </div>
                    {/* A DECISION IS NOT A GATE. Both numbers are shown side
                        by side because "36 open" without "2 actually holding
                        delivery" is the exact misreading this product exists
                        to prevent. */}
                    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-3 gap-y-2 pt-2">
                      <Tally value={String(r.choices.gating)} label="Holding delivery" tone="var(--i-violet)" />
                      <Tally value={`${r.choices.modelledDelayDays}d`} label="Modelled delay" tone="var(--i-amber)" />
                      <Tally value={String(r.choices.dueSoon)} label="Due in 14d" tone="var(--i-text)" />
                      <Tally value={String(r.choices.decidedRecently)} label="Answered, 14d" tone="var(--i-mint)" />
                    </div>
                    <PanelDoor href="/decisions" label="View decisions" tone="var(--i-violet)" />
                  </div>
                </Panel>
              )}

              {on("release-composition") && (
                <Panel
                  title="Release composition"
                  href="/scope"
                  action="Scope"
                  shoot="cr-surf-scope"
                  accent="var(--i-text-soft)"
                  note="load remaining"
                >
                  <div className="i-noscrollbar i-fade-b flex h-full flex-col gap-1 overflow-y-auto">
                    {(m.data?.scopes ?? []).map((s) => {
                      const comp = composeFeatures(
                        s.items,
                        s.completedWork,
                        m.scenario.capacityOverrideByScope[s.scopeId] ?? s.teamCapacity,
                        m.scenario.bypassedFeatureIds,
                        m.scenario.estimateOverrideByItemId,
                        m.scenario.draftFeatures,
                        m.scenario.acceptedCandidateIds
                      );
                      const all = (m.data?.scopes ?? []).map((x) =>
                        composeFeatures(
                          x.items,
                          x.completedWork,
                          m.scenario.capacityOverrideByScope[x.scopeId] ?? x.teamCapacity,
                          m.scenario.bypassedFeatureIds,
                          m.scenario.estimateOverrideByItemId,
                          m.scenario.draftFeatures,
                          m.scenario.acceptedCandidateIds
                        ).loadDays
                      );
                      const w = Math.max(0.001, ...all);
                      return (
                        <div key={s.scopeId}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
                              {s.name}
                            </span>
                            <span className="i-readout shrink-0 text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                              {comp.loadDays.toFixed(1)}d · {comp.engaged.length}
                            </span>
                          </div>
                          <div className="mt-[3px] h-[5px] rounded-full" style={{ background: "var(--i-recess)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (comp.loadDays / w) * 100)}%`,
                                background: forecastTone,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {analysis.includes("system-status") && (
                <Panel
                  title="System status"
                  shoot="cr-surf-system"
                  accent="var(--i-mint)"
                  note={
                    r.oldestReading
                      ? `oldest ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
                      : null
                  }
                >
                  <div className="i-noscrollbar i-fade-b flex h-full flex-col gap-[3px] overflow-y-auto">
                    {r.system.map((s) => (
                      <Link
                        key={s.id}
                        href={s.href}
                        data-shoot={`cr-system-${s.id}`}
                        className="flex items-baseline justify-between gap-2 rounded px-1 py-[2px] hover:bg-[var(--i-panel-raised)]"
                      >
                        <span className="truncate text-[11px]" style={{ color: "var(--i-text-soft)" }}>
                          {s.label}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="i-readout text-[10.5px]" style={{ color: "var(--i-text)" }}>
                            {s.ageDays === null ? "—" : age(s.ageDays)}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--i-mint)", opacity: 0.85 }} />
                        </span>
                      </Link>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}

          {readings.length === 0 && analysis.length === 0 && !heroOn && railIds.length === 0 && (
            <div className="flex flex-1 items-center justify-center" data-shoot="cr-nothing-shown">
              <p className="text-[12px]" style={{ color: "var(--i-text-faint)" }}>
                Every surface is hidden. Open the gear to bring some back.
              </p>
            </div>
          )}
        </div>

        {/* ── STATUS BAR ───────────────────────────────────────────── */}
        <StatusBar
          cells={[
            {
              id: "oldest",
              label: "Oldest reading",
              value: r.oldestReading
                ? `${r.oldestReading.label}, ${age(r.oldestReading.ageDays ?? 0)}`
                : "nothing dated",
              tone: "var(--i-mint)",
            },
            {
              id: "data",
              label: "Data",
              value: age(r.system.find((s) => s.id === "project")?.ageDays ?? 0),
              tone: "var(--i-mint)",
              href: "/portfolio",
            },
            {
              id: "forecast",
              label: "Forecast",
              value: r.time.lastForecastAt ? dLong(r.time.lastForecastAt) : "never run",
              tone: "var(--i-amber)",
              href: "/forecast",
            },
            {
              id: "horizon",
              label: "Horizon",
              value: r.time.horizonDays !== null ? `${r.time.horizonDays} days` : "—",
              tone: "var(--i-signal)",
              href: "/timeline",
            },
            {
              id: "mode",
              label: "Mode",
              value: m.active ? "Scenario — Reality preserved" : "Reality",
              tone: m.active ? "var(--i-violet)" : "var(--i-signal)",
            },
          ]}
        />
      </div>
      {dialog}
    </InstrumentShell>
  );
}

/** A fact about the field, stated in its own header. A count of declared
    edges and stored gates — never a grade. */
function fieldNote(field: ReturnType<typeof readProjectField>): string {
  const open = field.gates.filter((g) => !g.released).length;
  const shared = field.sharedUpstreamIds.length;
  const bits = [`${field.lanes.length} projects`];
  if (field.edges.length) bits.push(`${field.edges.length} declared ${field.edges.length === 1 ? "edge" : "edges"}`);
  if (open) bits.push(`${open} ${open === 1 ? "clamp" : "clamps"}`);
  if (shared) bits.push(`${shared} shared upstream`);
  return bits.join(" · ");
}

function Divider() {
  return <span className="mx-3.5 h-[26px] w-px shrink-0" style={{ background: "var(--i-border)" }} />;
}

function HeaderField({
  label,
  value,
  tone,
  shoot,
}: {
  label: string;
  value: string;
  tone: string;
  shoot?: string;
}) {
  return (
    <div className="flex flex-col justify-center leading-none">
      <span className="text-[8.5px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </span>
      <span data-shoot={shoot} className="i-readout pt-[3px] text-[12.5px]" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}

function Tally({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="i-readout text-[16px] leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="truncate pt-1 text-[9px] leading-tight" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

/** One colour per source of truth, matching the Timeline's own families so
    the same kind of event reads the same on both surfaces. */
function familyColour(family: string): string {
  switch (family) {
    case "decision":
      return "var(--i-violet)";
    case "forecast":
      return "var(--i-signal)";
    case "finding":
      return "var(--i-red)";
    case "work":
      return "var(--i-mint)";
    case "landmark":
      return "var(--i-amber)";
    default:
      return "var(--i-text-faint)";
  }
}
