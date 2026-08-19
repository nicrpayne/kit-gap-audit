"use client";

// THE MASTER CONTROL ROOM.
//
// "Tell me what is happening with the project right now, why it matters,
// what changed, what is at risk because of dependencies, and where I should
// look next."
//
// It owns nothing. Every number is read from the instrument that owns it —
// Scope, Portfolio, Decisions, Timeline, Forecast — and every surface is a
// door into that instrument. There is no dashboard-only truth here, no
// second Scenario, no second forecast, and no metric the model does not
// already compute. Where a concept image asked for a number the product
// cannot honestly produce, the audit says which and why:
// docs/CONTROL-ROOM-TRUTH-AUDIT.md.
//
// ── WHAT V3 CHANGED, AND WHY ───────────────────────────────────────────
//
// V2 was correct and unreadable in the specific way dashboards are: five
// cards of equal weight, each stating a fact, with the reader left to
// assemble the project in their head. The facts were right; the SHAPE was
// missing.
//
// V3 puts the shape on the screen. The PROJECT FIELD is the centre of
// gravity — one time axis, lanes ordered by declared dependency depth,
// release spines dropping from each upstream landing through everything
// that waits on it, gates drawn as clamps across the lane they block, and
// capacity as material in each lane rather than as topology. Selecting
// anything walks the declared graph and highlights exactly what its
// movement reaches; the CONSEQUENCE rail says what that means in a
// sentence.
//
// The five readings are still here, still traceable to their owners, but
// demoted to a strip above the field — because the field is what you are
// meant to look at, and equal weight is how V2 lost that argument.
//
// Nothing was added to the model to do any of it. No pressure score, no
// risk score, no health, no criticality, no inferred dependency.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimelinePageClient from "@/components/TimelinePageClient";
import { Panel, Row } from "@/components/control-room/Panels";
import { Reading, ReadingStrip, DOMAIN_ACCENT } from "@/components/control-room/Reading";
import ProjectField, { fieldHeight } from "@/components/control-room/ProjectField";
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

  // WHICH LENS THIS PERSON IS USING. Read from localStorage after mount, so
  // the server and the first client render agree; a stored preference is a
  // client fact, and pretending to know it during SSR is how hydration
  // mismatches get born.
  const [workspace, setWorkspace] = useState<Workspace>(DEFAULT_WORKSPACE);
  const [editing, setEditing] = useState(false);
  useEffect(() => setWorkspace(loadWorkspace()), []);
  const commit = useCallback((w: Workspace) => {
    setWorkspace(w);
    saveWorkspace(w);
  }, []);
  const visible = useMemo(() => visibleSurfaces(workspace), [workspace]);
  const on = useCallback((id: SurfaceId) => visible.has(id), [visible]);

  // WHAT IS SELECTED ON THE FIELD. Pure view state: it changes what is
  // highlighted and what the consequence rail is talking about, and nothing
  // else. It is deliberately NOT persisted — a selection is a question you
  // are asking right now, not a preference.
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

  // WHEN THIS BROWSER LAST RECEIVED THE PROJECT PAYLOAD.
  //
  // Nothing on the server knows when a particular client last asked, and the
  // payload carries no stamp of its own — so the only honest answer is the
  // one this page observes. The store hands back a NEW object on every
  // successful fetch, so its identity changing is exactly "a fresh payload
  // landed".
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

  const strip = (
    <div
      data-shoot="cr-strip"
      className="flex shrink-0 items-center gap-5 px-4 py-2.5"
      style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
    >
      <span className="text-[13px] font-medium tracking-tight" style={{ color: "var(--i-text)" }}>
        Master Control Room
      </span>
      {reading && (
        <>
          <Field label="Live now" value={dLong(reading.time.now)} tone="signal" shoot="cr-now" />
          {reading.time.horizonDays !== null && (
            <Field label="Horizon" value={`${reading.time.horizonDays} days`} shoot="cr-horizon" />
          )}
          <Field
            label="Last forecast"
            value={reading.time.lastForecastAt ? dShort(reading.time.lastForecastAt) : "never run"}
            tone={reading.time.lastForecastAt ? "amber" : "faint"}
            shoot="cr-forecast-age"
          />
        </>
      )}
      <div className="flex-1" />

      {/* LENSES. A view preference, kept apart from anything that changes
          the project — the Scenario controls own the right-hand end. */}
      <div data-shoot="cr-lens-bar" className="flex items-center gap-1">
        {LENSES.filter((l) => l.surfaces !== null || workspace.lens === "custom").map((l) => {
          const active = workspace.lens === l.id;
          return (
            <button
              key={l.id}
              data-shoot={`cr-lens-pick-${l.id}`}
              data-on={active}
              title={l.question}
              onClick={() => commit({ ...workspace, lens: l.id })}
              className="rounded px-2 py-1 text-[10.5px] transition-colors"
              style={{
                background: active ? "var(--i-panel-raised)" : "transparent",
                color: active ? "var(--i-text)" : "var(--i-text-faint)",
                border: `1px solid ${active ? "var(--i-border-strong)" : "transparent"}`,
              }}
            >
              {l.label}
            </button>
          );
        })}
        <button
          data-shoot="cr-lens-editor-open"
          onClick={() => setEditing(true)}
          className="ml-1 rounded px-2 py-1 text-[10.5px]"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
        >
          Edit
        </button>
      </div>

      {m.active && (
        <span
          data-shoot="cr-scenario"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
        >
          Scenario
        </span>
      )}
      {m.active && (
        <button
          data-shoot="cr-discard"
          onClick={() => m.setScenario(EMPTY_SCENARIO)}
          className="rounded px-2.5 py-1 text-[11px]"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
        >
          Back to Reality
        </button>
      )}
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

  const readings = (["reality", "choices", "capacity", "outcome", "time"] as const).filter((d) =>
    on(`reading-${d}` as SurfaceId)
  );
  const surfaces = (
    ["forecast-stability", "capacity-overview", "system-status", "release-composition", "decisions"] as const
  ).filter((id) => on(id));
  const railOn = on("inspector") || on("dependency-watch") || on("constraints") || on("what-changed");
  const centreOn = on("field") || on("time-machine");

  return (
    <InstrumentShell stateBar={strip}>
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2"
        style={{ background: "var(--i-void)" }}
      >
        {/* ── THE READING ──────────────────────────────────────────── */}
        {readings.length > 0 && (
          <ReadingStrip>
            {readings.includes("reality") && (
              <Reading
                domain="reality"
                label="Reality"
                {...(r.reality.blockingSignals > 0
                  ? {
                      leadValue: String(r.reality.blockingSignals),
                      leadRest: ` ${plural(r.reality.blockingSignals, "signal is", "signals are")} blocking work`,
                      leadTone: "var(--i-red)",
                    }
                  : r.reality.openSignals > 0
                    ? {
                        leadValue: String(r.reality.openSignals),
                        leadRest: ` open ${plural(r.reality.openSignals, "signal", "signals")}, none blocking`,
                      }
                    : { leadValue: "Clear", leadRest: " — nothing raised", leadTone: "var(--i-mint)" })}
                readout={`${r.reality.openSignals} open · ${r.reality.completedRecently} shipped in 14d · evidence ${
                  r.reality.evidenceAgeDays === null ? "none" : `${age(r.reality.evidenceAgeDays)} old`
                }`}
                spark={{ points: r.reality.shippedSeries, label: "Work each report recorded as shipped" }}
                href="/audit"
                shoot="cr-card-reality"
              />
            )}
            {readings.includes("choices") && (
              <Reading
                domain="choices"
                label="Choices"
                {...(r.choices.gating > 0
                  ? {
                      leadValue: String(r.choices.gating),
                      leadRest: ` ${plural(r.choices.gating, "decision is", "decisions are")} holding the date`,
                    }
                  : {
                      leadValue: String(r.choices.open),
                      leadRest: " open decisions, none holding a date",
                      leadTone: "var(--i-mint)",
                    })}
                readout={`${r.choices.modelledDelayDays}d modelled · ${r.choices.open} open · ${r.choices.overdue} overdue`}
                spark={{ points: r.choices.answeredSeries, label: "Decisions answered per week" }}
                href="/decisions"
                shoot="cr-card-choices"
              />
            )}
            {readings.includes("capacity") && (
              <Reading
                domain="capacity"
                label="Capacity"
                // ARRIVING, not "utilization". Of the time we committed, how
                // much lands on the work rather than being lost crossing
                // between projects. Both terms come from the same call, over
                // the same people — see the truth audit.
                {...(r.capacity.arrivingPct === null
                  ? { leadValue: "—", leadRest: " nobody is allocated", leadTone: "var(--i-text-faint)" }
                  : {
                      leadValue: `${Math.round(r.capacity.arrivingPct)}%`,
                      leadRest: " of committed time reaches the work",
                      leadTone: r.capacity.arrivingPct >= 95 ? "var(--i-mint)" : "var(--i-amber)",
                    })}
                readout={`${r.capacity.effective.toFixed(1)} of ${r.capacity.raw.toFixed(1)} FTE · ${r.capacity.free.toFixed(1)} free${
                  r.capacity.required > 0.01 ? ` · ${r.capacity.required.toFixed(1)} absent` : ""
                }`}
                // No spark: capacity has NO history in the model.
                spark={null}
                href="/portfolio"
                shoot="cr-card-capacity"
              />
            )}
            {readings.includes("outcome") && (
              <Reading
                domain="outcome"
                label="Likely outcome"
                leadValue={r.outcome.likely ? dShort(r.outcome.likely) : "—"}
                leadRest={r.outcome.gatedBy ? ` — ${r.outcome.gatedBy} lands last` : " nothing simulated"}
                leadTone={m.active ? "var(--i-violet)" : "var(--i-signal)"}
                readout={
                  (r.outcome.confidence !== null
                    ? `${r.outcome.confidence}% by its target`
                    : "no target to be confident against") +
                  (r.outcome.spreadDays !== null ? ` · ${r.outcome.spreadDays}d spread` : "") +
                  (r.outcome.gapDays !== null
                    ? ` · ${r.outcome.gapDays > 0 ? `${r.outcome.gapDays}d late` : `${Math.abs(r.outcome.gapDays)}d of room`}`
                    : "")
                }
                spark={
                  gatingConfidence
                    ? { points: gatingConfidence.points, label: `${gatingConfidence.label} confidence, per report` }
                    : null
                }
                href="/forecast"
                shoot="cr-card-outcome"
              />
            )}
            {readings.includes("time") && (
              <Reading
                domain="time"
                label="Time"
                leadValue={
                  r.time.nextLandmark
                    ? `${r.time.nextLandmark.inDays}d`
                    : r.time.nextTarget
                      ? `${r.time.nextTarget.inDays}d`
                      : "—"
                }
                leadRest={
                  r.time.nextLandmark
                    ? ` until ${r.time.nextLandmark.title}`
                    : r.time.nextTarget
                      ? ` until ${r.time.nextTarget.name}'s target`
                      : " nothing planned ahead"
                }
                leadTone="var(--i-text)"
                readout={`${dShort(r.time.now)}${r.time.horizonDays !== null ? ` · ${r.time.horizonDays}d of horizon` : ""}${
                  r.time.nextTarget ? ` · next target ${dShort(r.time.nextTarget.date)}` : ""
                }`}
                spark={null}
                href="/timeline"
                shoot="cr-card-time"
              />
            )}
          </ReadingStrip>
        )}

        {/* ── CENTRE OF GRAVITY + CONSEQUENCE RAIL ─────────────────── */}
        {(centreOn || railOn) && (
          <div className="flex min-h-0 flex-1 gap-2">
            {centreOn && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                {on("field") && (
                  <Panel
                    title="Project field"
                    shoot="cr-field-panel"
                    // Sized to the project, not to the container. When it is
                    // the only surface in the centre it takes the whole
                    // column; when the time machine is with it, the field
                    // takes exactly what it needs and the machine gets the
                    // rest.
                    className={on("time-machine") ? "shrink-0" : "min-h-0 flex-1"}
                    style={on("time-machine") ? { height: fieldHeight(field.lanes.length) + 46 } : undefined}
                    note={fieldNote(field)}
                    accent={m.active ? "var(--i-violet)" : "var(--i-signal)"}
                  >
                    <ProjectField
                      field={field}
                      scenarioActive={m.active}
                      selection={selection}
                      onSelect={setSelection}
                    />
                  </Panel>
                )}

                {/* THE TIMELINE INSTRUMENT ITSELF, embedded. Not a copy of
                    it, not a chart that looks like it — the same component,
                    the same playback, the same read model. */}
                {on("time-machine") && (
                  <section
                    data-shoot="cr-time-machine"
                    className="flex min-h-[228px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg"
                    style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
                  >
                    <header className="flex shrink-0 items-baseline justify-between gap-3 px-3.5 pt-2.5 pb-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="i-label" style={{ color: "var(--i-text-soft)" }}>
                          Project time machine
                        </h2>
                        <span className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                          play the project
                        </span>
                      </div>
                      <Link href="/timeline" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
                        Open Timeline →
                      </Link>
                    </header>
                    <div className="flex min-h-0 flex-1 flex-col">
                      <TimelinePageClient embedded />
                    </div>
                  </section>
                )}
              </div>
            )}

            {railOn && (
              <div className={`flex ${centreOn ? "w-[322px] shrink-0" : "min-w-0 flex-1"} flex-col gap-2`}>
                {on("inspector") && (
                  // The consequence rail carries the most words on the page
                  // and is the thing a selection is FOR; it gets the height.
                  <div className="flex min-h-[212px] flex-[1.75] flex-col">
                    <Inspector
                      field={field}
                      reading={r}
                      selection={selection}
                      onSelect={setSelection}
                      scenarioActive={m.active}
                    />
                  </div>
                )}

                {on("dependency-watch") && (
                  <Panel
                    title="Dependency index"
                    href="/orbit"
                    action="Orbit"
                    shoot="cr-dependency-watch"
                    className="min-h-[130px] flex-1"
                    accent={DOMAIN_ACCENT.outcome}
                  >
                    <div className="flex h-full flex-col">
                      <div className="i-noscrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                        {r.dependencies.length === 0 && (
                          <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                            Nothing waits on anything else. No project can be surprised by another.
                          </p>
                        )}
                        {r.dependencies
                          .filter((d) => d.kind !== "needs_review")
                          .map((d) => (
                            <Row
                              key={d.id}
                              shoot={`cr-dep-${d.kind}`}
                              title={d.subject}
                              detail={d.detail}
                              quantity={d.quantity}
                              tone={d.kind === "shared_upstream" ? "amber" : d.causal ? "soft" : "faint"}
                              dashed={!d.causal}
                              href={
                                d.focusScopeId
                                  ? `/orbit?focus=${d.focusScopeId}${d.selectNodeId ? `&select=${encodeURIComponent(d.selectNodeId)}` : ""}`
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                      {/* PINNED OUTSIDE THE SCROLLER, because it must never
                          scroll out of sight. Dashed and inert — these are
                          unreviewed external claims, and the product has no
                          model for a suspected dependency. */}
                      {r.needsReview > 0 && (
                        <div className="shrink-0 pt-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                          <Row
                            shoot="cr-dep-needs_review"
                            dashed
                            tone="faint"
                            title={`${r.needsReview} external ${plural(r.needsReview, "claim", "claims")} nobody has reviewed`}
                            detail="Suggested from transcripts and Linear. None of it counts towards any date until a person accepts it."
                            href="/timeline"
                          />
                        </div>
                      )}
                    </div>
                  </Panel>
                )}

                {on("constraints") && (
                  <Panel
                    title="Current constraints"
                    shoot="cr-constraints"
                    className="min-h-[112px] flex-1"
                    accent={DOMAIN_ACCENT.choices}
                  >
                    <div className="i-noscrollbar flex h-full flex-col gap-1 overflow-y-auto">
                      {r.constraints.length === 0 && (
                        <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
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
                  </Panel>
                )}

                {on("what-changed") && (
                  <Panel
                    title="What changed"
                    href="/timeline"
                    action="Timeline"
                    shoot="cr-activity"
                    className="min-h-[104px] flex-[0.9]"
                    note="newest first"
                  >
                    <div className="i-noscrollbar flex h-full flex-col gap-0.5 overflow-y-auto">
                      {r.activity.length === 0 && (
                        <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                          Nothing has happened yet.
                        </p>
                      )}
                      {r.activity.map((a) => (
                        <Link
                          key={a.id}
                          href={a.href}
                          data-shoot="cr-activity-row"
                          className="flex items-baseline justify-between gap-2 rounded px-2 py-1 hover:bg-[var(--i-panel-raised)]"
                        >
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span
                              className="mt-[1px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: familyColour(a.family) }}
                            />
                            <span className="truncate text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                              {a.title}
                              {a.count > 1 && <span style={{ color: "var(--i-text-faint)" }}> ×{a.count}</span>}
                            </span>
                          </span>
                          <span className="i-readout shrink-0 text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                            {a.note ? `${a.note} · ` : ""}
                            {ago(a.at, r.time.now)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </Panel>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SUPPORTING SURFACES ──────────────────────────────────── */}
        {surfaces.length > 0 && (
          <div
            className="grid h-[170px] shrink-0 gap-2"
            // The row keeps its columns whatever the lens shows, so a
            // surface that survives is the same object it was rather than a
            // stretched version of itself.
            style={{ gridTemplateColumns: `repeat(${Math.max(surfaces.length, 4)}, minmax(0, 1fr))` }}
            data-shoot="cr-surfaces"
          >
            {on("forecast-stability") && (
              <Panel
                title="Forecast stability"
                href="/forecast"
                action="Forecast"
                shoot="cr-surf-forecast"
                accent={DOMAIN_ACCENT.outcome}
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
                        className="i-readout text-[16px] leading-none"
                        style={{
                          color:
                            r.outcome.confidence === null
                              ? "var(--i-text-faint)"
                              : m.active
                                ? "var(--i-violet)"
                                : "var(--i-signal)",
                        }}
                      >
                        {r.outcome.confidence !== null ? `${r.outcome.confidence}%` : "No target"}
                      </span>
                      <span className="min-w-0 truncate text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                        {r.outcome.confidence !== null
                          ? `now, for ${r.outcome.gatedBy}`
                          : `for ${r.outcome.gatedBy ?? "the last project"}, so no confidence`}
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
                    <div className="min-h-0 flex-1 pt-2">
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
                    className="text-[11px] leading-snug"
                    style={{ color: "var(--i-text-faint)" }}
                  >
                    No report has stored a confidence yet, so there is no history to draw. The field shows today&apos;s
                    P10–P90 spread on every lane.
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
                accent={DOMAIN_ACCENT.capacity}
                // THE GAP, IN THE HEADER. Allocations carry no timestamps and
                // there is no capacity snapshot anywhere in the schema, so no
                // trend can be drawn honestly — and today's value drawn flat
                // would assert a stability nobody measured.
                note="no history · today only"
              >
                <div className="flex h-full flex-col">
                  <div className="i-noscrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    {r.capacity.byScope.map((c) => {
                      // Scaled against the LARGEST channel, not the allocated
                      // total — a project whose capacity is a counted stand-in
                      // can exceed the roster's own sum, and clamping it to
                      // 100% would quietly flatten every real channel.
                      const w = Math.max(0.001, ...r.capacity.byScope.map((x) => Math.max(x.raw, x.effective)));
                      const selected = selection?.kind === "capacity" && selection.id === c.scopeId;
                      return (
                        <button
                          key={c.scopeId}
                          data-shoot={`cr-capacity-row-${c.scopeId}`}
                          onClick={() => setSelection(selected ? null : { kind: "capacity", id: c.scopeId })}
                          className="rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--i-panel-raised)]"
                          style={{ background: selected ? "var(--i-panel-raised)" : undefined }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                              {c.name}
                            </span>
                            <span className="i-readout text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                              {c.effective.toFixed(1)}
                              {c.basis === "allocations" ? ` of ${c.raw.toFixed(1)}` : " counted"}
                            </span>
                          </div>
                          {/* COMMITTED is the track, ARRIVING is the fill.
                              The gap between them is context-switch loss,
                              drawn to scale and never exaggerated. */}
                          <div className="mt-0.5 h-1.5 rounded-full" style={{ background: "var(--i-recess)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (c.raw / w) * 100)}%`,
                                background: "var(--i-mint)",
                                opacity: 0.22,
                              }}
                            />
                            <div
                              className="relative -mt-1.5 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (c.effective / w) * 100)}%`,
                                background: "var(--i-mint)",
                                opacity: c.basis === "allocations" ? 0.85 : 0.4,
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p
                    data-shoot="cr-capacity-nohistory"
                    className="shrink-0 truncate pt-1.5 text-[10px]"
                    style={{ color: "var(--i-text-faint)", borderTop: "1px solid var(--i-border)" }}
                  >
                    {r.capacity.people} people · {r.capacity.free.toFixed(1)} FTE free
                    {r.capacity.inferredScopes > 0 ? ` · ${r.capacity.inferredScopes} counted from assignees` : ""}
                  </p>
                </div>
              </Panel>
            )}

            {on("system-status") && (
              <Panel
                title="System status"
                shoot="cr-surf-system"
                note={
                  r.oldestReading
                    ? `oldest: ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
                    : null
                }
              >
                {/* HOW OLD IS WHAT I AM LOOKING AT. Timestamps only. No
                    green/amber/red verdict, because grading a feed needs a
                    threshold nobody has set — and a feed we cannot date is
                    left out rather than shown as "unknown". */}
                <div className="i-noscrollbar flex h-full flex-col gap-0.5 overflow-y-auto pr-0.5">
                  {r.system.map((s) => (
                    <Link
                      key={s.id}
                      href={s.href}
                      data-shoot={`cr-system-${s.id}`}
                      className="flex items-baseline justify-between gap-2 rounded px-2 py-[3px] hover:bg-[var(--i-panel-raised)]"
                    >
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--i-text)" }}>
                          {s.label}
                        </span>
                        <span className="truncate text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                          {s.state}
                        </span>
                      </span>
                      <span className="i-readout shrink-0 text-[11px]" style={{ color: "var(--i-text-soft)" }}>
                        {s.ageDays === null ? "—" : age(s.ageDays)}
                      </span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}

            {on("release-composition") && (
              <Panel title="Release composition" href="/scope" action="Scope" shoot="cr-surf-scope">
                <div className="i-noscrollbar flex h-full flex-col gap-1.5 overflow-y-auto">
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
                    return (
                      <div key={s.scopeId} className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                          {s.name}
                        </span>
                        <span className="i-readout shrink-0 text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                          {comp.loadDays.toFixed(1)}d · {comp.engaged.length}{" "}
                          {plural(comp.engaged.length, "capability", "capabilities")}
                        </span>
                      </div>
                    );
                  })}
                  {r.needsReview > 0 && (
                    <p className="mt-auto pt-1 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                      {r.needsReview} external {plural(r.needsReview, "claim", "claims")} awaiting review — none of it
                      counts towards a date.
                    </p>
                  )}
                </div>
              </Panel>
            )}

            {on("decisions") && (
              <Panel
                title="Decisions detail"
                href="/decisions"
                action="Decisions"
                shoot="cr-surf-decisions"
                accent={DOMAIN_ACCENT.choices}
              >
                <div className="flex h-full flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="i-readout text-[22px]" style={{ color: "var(--i-text)" }}>
                      {r.choices.open}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                      open decisions
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Stat value={String(r.choices.gating)} label="connected to delivery" tone="amber" />
                    <Stat value={`${r.choices.modelledDelayDays}d`} label="modelled delay in total" tone="amber" />
                    <Stat value={String(r.choices.dueSoon)} label="needed within a fortnight" />
                    <Stat value={String(r.choices.decidedRecently)} label="answered in the last fortnight" tone="mint" />
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}

        {readings.length === 0 && surfaces.length === 0 && !centreOn && !railOn && (
          <div className="flex flex-1 items-center justify-center" data-shoot="cr-nothing-shown">
            <p className="text-[12px]" style={{ color: "var(--i-text-faint)" }}>
              Every surface is hidden. Open Edit to bring some back.
            </p>
          </div>
        )}
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

function Field({
  label,
  value,
  tone = "text",
  shoot,
}: {
  label: string;
  value: string;
  tone?: "text" | "signal" | "amber" | "faint";
  shoot?: string;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="i-label" style={{ color: "var(--i-text-faint)", fontSize: 9 }}>
        {label}
      </span>
      <span
        data-shoot={shoot}
        className="i-readout text-[12px]"
        style={{ color: tone === "text" ? "var(--i-text)" : `var(--i-${tone === "faint" ? "text-faint" : tone})` }}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({ value, label, tone = "soft" }: { value: string; label: string; tone?: "soft" | "amber" | "mint" }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="i-readout w-9 shrink-0 text-[13px]"
        style={{ color: tone === "soft" ? "var(--i-text)" : `var(--i-${tone})` }}
      >
        {value}
      </span>
      <span className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </span>
    </div>
  );
}

/** One colour per source of truth, matching the Timeline's own families so
    the same kind of event reads the same on both surfaces. */
function familyColour(family: string): string {
  switch (family) {
    case "decision":
      return "var(--i-amber)";
    case "forecast":
      return "var(--i-signal)";
    case "finding":
      return "var(--i-red)";
    case "work":
      return "var(--i-mint)";
    case "landmark":
      return "var(--i-violet)";
    default:
      return "var(--i-text-faint)";
  }
}
