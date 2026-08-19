"use client";

// THE MASTER CONTROL ROOM.
//
// "Tell me what is happening with the project right now, why it matters,
// what changed, what is at risk because of dependencies, and where I should
// look next."
//
// It owns nothing. Every number is read from the instrument that owns it —
// Scope, Portfolio, Decisions, Timeline, Forecast — and every panel is a
// door into that instrument. There is no dashboard-only truth here, no
// second Scenario, no second forecast, and no metric that the model does
// not already compute. Where the concept image asked for a number the
// product cannot honestly produce, the audit says which and why:
// docs/CONTROL-ROOM-TRUTH-AUDIT.md.
//
// The page answers six questions in order, and every visible panel serves
// one of them:
//
//   1 what is real right now      2 what choices are open
//   3 have we enough capacity     4 where do we land
//   5 what could surprise us      6 what changed, what is next
//
// V2 changes HOW those answers read, not what they are:
//
//   · every card leads with a SENTENCE containing its dominant number,
//     and carries the exact model truth underneath it, so the sentence can
//     be checked rather than trusted;
//   · colour is assigned by DOMAIN, from the law the suite already has
//     (see DOMAIN_ACCENT in control-room/Panels);
//   · a trend line is drawn only where real recorded history exists —
//     confidence and shipped counts have one, capacity does not, and the
//     capacity panel says so on its own face instead of inventing one;
//   · which panels are on screen is a preference in this browser, and is
//     never written to the project.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimelinePageClient from "@/components/TimelinePageClient";
import LivingForecast from "@/components/instrument/LivingForecast";
import { Panel, SummaryCard, Row, DOMAIN_ACCENT } from "@/components/control-room/Panels";
import ConfidenceChart from "@/components/control-room/ConfidenceChart";
import Customize from "@/components/control-room/Customize";
import { useProject, EMPTY_SCENARIO } from "@/lib/instrument/useProject";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { subscribeReality } from "@/lib/instrument/reality";
import { readControlRoom, type ControlRoomReading } from "@/lib/control-room/read";
import {
  DEFAULT_WORKSPACE,
  PRESETS,
  loadWorkspace,
  resetWorkspace,
  saveWorkspace,
  togglePanel,
  visiblePanels,
  type PanelId,
  type PresetId,
  type Workspace,
} from "@/lib/control-room/workspace";
import { composeFeatures } from "@/lib/scope/features";
import type { TimelineProjection } from "@/lib/timeline/entries";
import { percentileDay } from "@/lib/forecast/simulate";

const DAY = 86400000;
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

  // WHICH PANELS THIS PERSON WANTS. Read from localStorage after mount, so
  // the server and the first client render agree; a stored preference is a
  // client fact and pretending to know it during SSR is how hydration
  // mismatches get born.
  const [workspace, setWorkspace] = useState<Workspace>(DEFAULT_WORKSPACE);
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => setWorkspace(loadWorkspace()), []);
  const commit = useCallback((w: Workspace) => {
    setWorkspace(w);
    saveWorkspace(w);
  }, []);
  const visible = useMemo(() => visiblePanels(workspace), [workspace]);
  const on = useCallback((id: PanelId) => visible.has(id), [visible]);

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

      {/* WORKSPACE. A view preference, sitting apart from anything that
          changes the project — the Scenario controls keep the right-hand
          end of the strip to themselves. */}
      <div data-shoot="cr-workspace" className="flex items-center gap-1">
        {PRESETS.filter((p) => p.panels !== null || workspace.preset === "custom").map((p) => {
          const active = workspace.preset === p.id;
          return (
            <button
              key={p.id}
              data-shoot={`cr-workspace-${p.id}`}
              data-on={active}
              title={p.note}
              onClick={() => commit({ ...workspace, preset: p.id })}
              className="rounded px-2 py-1 text-[10.5px] transition-colors"
              style={{
                background: active ? "var(--i-panel-raised)" : "transparent",
                color: active ? "var(--i-text)" : "var(--i-text-faint)",
                border: `1px solid ${active ? "var(--i-border-strong)" : "transparent"}`,
              }}
            >
              {p.label}
            </button>
          );
        })}
        <button
          data-shoot="cr-customize-open"
          onClick={() => setCustomizing(true)}
          className="ml-1 rounded px-2 py-1 text-[10.5px]"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
        >
          Customize
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

  const dialog = customizing ? (
    <Customize
      workspace={workspace}
      onToggle={(id) => commit(togglePanel(workspace, id))}
      onPreset={(id: PresetId) => commit({ ...workspace, preset: id })}
      onReset={() => setWorkspace(resetWorkspace())}
      onClose={() => setCustomizing(false)}
    />
  ) : null;

  if (!reading || !m.startDate) {
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex flex-1 items-center justify-center i-label" data-shoot="cr-empty">
          {m.error ?? dec.error ?? tlError ?? "Reading the project…"}
        </div>
        {dialog}
      </InstrumentShell>
    );
  }

  const r = reading;
  const gatingSim = r.outcome.gatedByScopeId ? m.preview?.get(r.outcome.gatedByScopeId) ?? null : null;
  const gatingReality = r.outcome.gatedByScopeId ? m.baseline?.get(r.outcome.gatedByScopeId) ?? null : null;
  const gatingScope = m.data?.scopes.find((s) => s.scopeId === r.outcome.gatedByScopeId) ?? null;
  const gatingConfidence = r.outcome.confidenceHistory.find((s) => s.id === r.outcome.gatedByScopeId) ?? null;

  const cards = ["card-reality", "card-choices", "card-capacity", "card-outcome", "card-time"].filter((id) =>
    on(id as PanelId)
  );
  const lenses = ["forecast-confidence", "capacity-overview", "system-status", "release-composition", "decisions"].filter(
    (id) => on(id as PanelId)
  );
  const railOn = on("dependency-watch") || on("constraints") || on("what-changed");
  const centreOn = on("time-machine");

  return (
    <InstrumentShell stateBar={strip}>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5" style={{ background: "var(--i-void)" }}>
        {/* ── 1–5. THE FIVE QUESTIONS, ANSWERED IN ORDER ───────────── */}
        {cards.length > 0 && (
          <div
            className="grid shrink-0 gap-2.5"
            // ALWAYS THE FULL FIVE COLUMNS, even when fewer cards are shown.
            // A card is sized for the sentence it carries; letting two cards
            // stretch across the whole screen would make the same reading
            // look like a different, more important one.
            style={{ gridTemplateColumns: `repeat(${Math.max(cards.length, 5)}, minmax(0, 1fr))` }}
            data-shoot="cr-summary"
          >
            {on("card-reality") && (
              <SummaryCard
                index={1}
                domain="reality"
                title="Reality"
                {...(r.reality.blockingSignals > 0
                  ? {
                      leadValue: String(r.reality.blockingSignals),
                      leadRest: ` ${plural(r.reality.blockingSignals, "signal is", "signals are")} blocking work`,
                    }
                  : r.reality.openSignals > 0
                    ? {
                        leadValue: String(r.reality.openSignals),
                        leadRest: ` open ${plural(r.reality.openSignals, "signal", "signals")}, none blocking`,
                        leadTone: "var(--i-text)",
                      }
                    : { leadValue: "Clear", leadRest: " — nothing raised against the project", leadTone: "var(--i-mint)" })}
                readout={`${r.reality.openSignals} open · ${r.reality.blockingSignals} blocking · ${r.reality.completedRecently} shipped in 14d`}
                footnote={
                  r.reality.evidenceAgeDays === null
                    ? "No evidence recorded yet"
                    : `Newest evidence ${age(r.reality.evidenceAgeDays)} old · ${r.reality.newestEvidenceLabel ?? "context"}`
                }
                spark={{ points: r.reality.shippedSeries, label: "Work each report recorded as shipped" }}
                href="/audit"
                shoot="cr-card-reality"
              />
            )}
            {on("card-choices") && (
              <SummaryCard
                index={2}
                domain="choices"
                title="Choices"
                {...(r.choices.gating > 0
                  ? {
                      leadValue: String(r.choices.gating),
                      leadRest: ` ${plural(r.choices.gating, "decision is", "decisions are")} holding the delivery date`,
                    }
                  : {
                      leadValue: String(r.choices.open),
                      leadRest: ` open ${plural(r.choices.open, "decision", "decisions")}, none holding a date`,
                      leadTone: "var(--i-mint)",
                    })}
                readout={`${r.choices.modelledDelayDays}d modelled delay · ${r.choices.open} open · ${r.choices.dueSoon} due in 14d · ${r.choices.overdue} overdue`}
                // A DECISION IS NOT A GATE, and the difference is the point.
                footnote={`${r.choices.open - r.choices.gating} open decisions are not holding any date · ${r.choices.decidedRecently} answered in the last fortnight`}
                spark={{ points: r.choices.answeredSeries, label: "Decisions answered per week" }}
                href="/decisions"
                shoot="cr-card-choices"
              />
            )}
            {on("card-capacity") && (
              <SummaryCard
                index={3}
                domain="capacity"
                title="Capacity"
                // ARRIVING, not "utilization". Of the time we committed, how
                // much lands on the work rather than being lost crossing
                // between projects. Both terms come from the same call, over
                // the same people, in the same unit — see the truth audit.
                {...(r.capacity.arrivingPct === null
                  ? { leadValue: "—", leadRest: " nobody is allocated to a project", leadTone: "var(--i-text-faint)" }
                  : {
                      leadValue: `${Math.round(r.capacity.arrivingPct)}%`,
                      leadRest: " of committed time reaches the work",
                      leadTone: r.capacity.arrivingPct >= 95 ? "var(--i-mint)" : "var(--i-amber)",
                    })}
                readout={`${r.capacity.effective.toFixed(1)} of ${r.capacity.raw.toFixed(1)} FTE committed · ${r.capacity.free.toFixed(1)} free${
                  r.capacity.required > 0.01 ? ` · ${r.capacity.required.toFixed(1)} asked for and absent` : ""
                }`}
                footnote={
                  r.capacity.switchLoss > 0.05
                    ? `${r.capacity.switchLoss.toFixed(1)} FTE goes to context switching at ${r.capacity.switchCostPct}% · ${r.capacity.people} on the roster`
                    : `Nobody is split across projects · ${r.capacity.people} on the roster`
                }
                // No spark: capacity has NO history in the model. See the
                // Capacity overview panel, which says so out loud.
                spark={null}
                href="/portfolio"
                shoot="cr-card-capacity"
              />
            )}
            {on("card-outcome") && (
              <SummaryCard
                index={4}
                domain="outcome"
                title="Likely outcome"
                leadValue={r.outcome.likely ? dShort(r.outcome.likely) : "—"}
                leadRest={r.outcome.gatedBy ? ` — ${r.outcome.gatedBy} lands last` : " nothing simulated yet"}
                leadTone={m.active ? "var(--i-violet)" : "var(--i-signal)"}
                readout={
                  // Confidence needs a target to be measured against. When
                  // the last-landing project has none, this says so rather
                  // than borrowing another project's number.
                  (r.outcome.confidence !== null
                    ? `${r.outcome.confidence}% by ${r.outcome.gatedBy}'s target`
                    : "No target to be confident against") +
                  (r.outcome.p10 && r.outcome.p90
                    ? ` · P10 ${dShort(r.outcome.p10)} → P90 ${dShort(r.outcome.p90)}`
                    : "")
                }
                footnote={
                  (r.outcome.gapDays === null
                    ? `${r.outcome.gatedBy ?? "It"} has no target`
                    : r.outcome.gapDays > 0
                      ? `${r.outcome.gapDays}d after its target`
                      : `${Math.abs(r.outcome.gapDays)}d of room before its target`) +
                  (r.outcome.confidenceTrendPts !== null
                    ? ` · ${r.outcome.confidenceTrendPts > 0 ? "+" : ""}${r.outcome.confidenceTrendPts} pts since the previous report`
                    : "") +
                  ` · ${r.outcome.scopesPastTarget} ${plural(r.outcome.scopesPastTarget, "project", "projects")} past target`
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
            {on("card-time") && (
              <SummaryCard
                index={5}
                domain="time"
                title="Time"
                leadValue={
                  r.time.nextLandmark ? `${r.time.nextLandmark.inDays}d` : r.time.nextTarget ? `${r.time.nextTarget.inDays}d` : "—"
                }
                leadRest={
                  r.time.nextLandmark
                    ? ` until ${r.time.nextLandmark.title}`
                    : r.time.nextTarget
                      ? ` until ${r.time.nextTarget.name}'s target`
                      : " nothing planned ahead"
                }
                leadTone="var(--i-text)"
                readout={`Now ${dShort(r.time.now)}${r.time.horizonDays !== null ? ` · ${r.time.horizonDays}d of horizon` : ""}${
                  r.time.lastForecastAt ? ` · forecast ${dShort(r.time.lastForecastAt)}` : ""
                }`}
                footnote={
                  r.time.nextTarget
                    ? `Next target ${dShort(r.time.nextTarget.date)} · ${r.time.nextTarget.name}`
                    : "No target ahead of now"
                }
                spark={null}
                href="/timeline"
                shoot="cr-card-time"
              />
            )}
          </div>
        )}

        {/* ── CENTRE + RIGHT RAIL ──────────────────────────────────── */}
        {(centreOn || railOn) && (
          <div className="flex min-h-0 flex-1 gap-2.5">
            {/* THE TIMELINE INSTRUMENT ITSELF, embedded. Not a copy of it,
                not a chart that looks like it — the same component, the same
                playback, the same read model. */}
            {centreOn && (
              <section
                data-shoot="cr-time-machine"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg"
                style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
              >
                <header className="flex shrink-0 items-baseline justify-between gap-3 px-3.5 pt-3 pb-1">
                  <h2 className="i-label" style={{ color: "var(--i-text-soft)" }}>
                    Project Time Machine
                  </h2>
                  <Link href="/timeline" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
                    Open Timeline →
                  </Link>
                </header>
                <div className="flex min-h-0 flex-1 flex-col">
                  <TimelinePageClient embedded />
                </div>
              </section>
            )}

            {railOn && (
              <div className={`flex ${centreOn ? "w-[318px] shrink-0" : "min-w-0 flex-1"} flex-col gap-2.5`}>
                {/* ── 5. WHAT COULD SURPRISE US ────────────────────── */}
                {on("dependency-watch") && (
                  <Panel
                    title="Dependency watch"
                    href="/orbit"
                    action="Investigate in Orbit"
                    shoot="cr-dependency-watch"
                    className="min-h-[150px] flex-[1.5]"
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
                          scroll out of sight: the whole point of this panel
                          is that nothing consequential is invisible. Dashed
                          and inert — these are unreviewed external claims,
                          and the product has no model for a suspected
                          dependency. */}
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

                {/* ── 6a. WHAT IS HOLDING US ───────────────────────── */}
                {on("constraints") && (
                  <Panel
                    title="Current constraints"
                    shoot="cr-constraints"
                    className="min-h-[126px] flex-1"
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

                {/* ── 6b. WHAT CHANGED ─────────────────────────────── */}
                {on("what-changed") && (
                  <Panel
                    title="What changed"
                    href="/timeline"
                    action="Timeline"
                    shoot="cr-activity"
                    className="min-h-[126px] flex-1"
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

        {/* ── BOTTOM LENSES ────────────────────────────────────────── */}
        {lenses.length > 0 && (
          <div
            className="grid h-[186px] shrink-0 gap-2.5"
            // Same rule as the cards: the row keeps its columns so a lens
            // that survives a preset is the same object it was, not a
            // stretched version of itself.
            style={{ gridTemplateColumns: `repeat(${Math.max(lenses.length, 4)}, minmax(0, 1fr))` }}
            data-shoot="cr-lenses"
          >
            {on("forecast-confidence") && (
              <Panel
                title="Forecast confidence"
                href="/forecast"
                action="Open Forecast"
                shoot="cr-lens-forecast"
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
                  // Refusing to draw is the honest answer. The current
                  // distribution is shown instead, because that IS known.
                  <div className="flex h-full flex-col" data-shoot="cr-confidence-nohistory">
                    <p className="text-[11px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                      No report has stored a confidence yet, so there is no history to draw. Today&apos;s distribution:
                    </p>
                    {gatingSim && m.startDate && (
                      <div className="relative min-h-0 flex-1 overflow-hidden pt-1">
                        <LivingForecast
                          result={gatingSim}
                          reality={gatingReality}
                          scenarioActive={m.active}
                          minDay={percentileDay(gatingSim.completionDaysSorted, 0) - 4}
                          maxDay={percentileDay(gatingSim.completionDaysSorted, 100) + 4}
                          startDate={m.startDate}
                          targetDay={
                            gatingScope?.targetDate
                              ? (new Date(gatingScope.targetDate).getTime() - m.startDate.getTime()) / DAY
                              : null
                          }
                          confidence={r.outcome.confidence}
                          gates={[]}
                          momentumDir={0}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {on("capacity-overview") && (
              <Panel
                title="Capacity overview"
                href="/portfolio"
                action="Open Portfolio"
                shoot="cr-lens-capacity"
                accent={DOMAIN_ACCENT.capacity}
                // THE GAP, IN THE HEADER. Allocations carry no timestamps and
                // there is no capacity snapshot anywhere in the schema, so no
                // trend can be drawn honestly — and today's value drawn flat
                // would assert a stability nobody measured. The panel says so
                // where a person reads its name.
                note="no history · today only"
              >
                <div className="flex h-full flex-col">
                <div className="i-noscrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  {/* Scaled against the LARGEST channel, not the allocated
                      total — a project whose capacity is a counted stand-in
                      can exceed the roster's own sum, and clamping it to
                      100% would quietly flatten every real channel. */}
                  {r.capacity.byScope.map((c) => {
                    const w = Math.max(0.001, ...r.capacity.byScope.map((x) => Math.max(x.raw, x.effective)));
                    return (
                      <div key={c.scopeId}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                            {c.name}
                          </span>
                          <span className="i-readout text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                            {c.effective.toFixed(1)}
                            {c.basis === "allocations" ? ` of ${c.raw.toFixed(1)}` : " counted"}
                          </span>
                        </div>
                        {/* COMMITTED is the track, ARRIVING is the fill. The
                            gap between them is context-switch loss, drawn to
                            scale and never exaggerated. */}
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
                      </div>
                    );
                  })}
                </div>
                {/* THE GAP, STATED. Allocations carry no timestamps and
                    there is no capacity snapshot anywhere in the schema, so
                    no trend line can be drawn honestly — and drawing today's
                    value as a flat line would assert a stability nobody
                    measured. See docs/CONTROL-ROOM-TRUTH-AUDIT.md. */}
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
                shoot="cr-lens-system"
                note={
                  r.oldestReading
                    ? `oldest: ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
                    : null
                }
              >
                {/* HOW OLD IS WHAT I AM LOOKING AT. Timestamps only. There
                    is no green/amber/red verdict, because grading a feed
                    needs a threshold nobody has set — and a feed we cannot
                    date is left out rather than shown as "unknown". */}
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
              <Panel title="Release composition" href="/scope" action="Open Scope" shoot="cr-lens-scope">
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
                action="Open Decisions"
                shoot="cr-lens-decisions"
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

        {cards.length === 0 && lenses.length === 0 && !centreOn && !railOn && (
          <div className="flex flex-1 items-center justify-center" data-shoot="cr-nothing-shown">
            <p className="text-[12px]" style={{ color: "var(--i-text-faint)" }}>
              Every panel is hidden. Open Customize to bring some back.
            </p>
          </div>
        )}
      </div>
      {dialog}
    </InstrumentShell>
  );
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
