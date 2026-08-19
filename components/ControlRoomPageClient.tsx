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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import TimelinePageClient from "@/components/TimelinePageClient";
import LivingForecast from "@/components/instrument/LivingForecast";
import { Panel, SummaryCard, Row } from "@/components/control-room/Panels";
import { useProject, EMPTY_SCENARIO } from "@/lib/instrument/useProject";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { subscribeReality } from "@/lib/instrument/reality";
import { readControlRoom, type ControlRoomReading } from "@/lib/control-room/read";
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

export default function ControlRoomPageClient() {
  const m = useProject();
  const dec = useDecisions();
  const [timeline, setTimeline] = useState<TimelineProjection | null>(null);
  const [tlError, setTlError] = useState<string | null>(null);

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

  const reading: ControlRoomReading | null = useMemo(() => {
    if (!m.data || !m.preview || !m.baseline || !timeline) return null;
    return readControlRoom({
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

  if (!reading || !m.startDate) {
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex flex-1 items-center justify-center i-label" data-shoot="cr-empty">
          {m.error ?? dec.error ?? tlError ?? "Reading the project…"}
        </div>
      </InstrumentShell>
    );
  }

  const r = reading;
  const gatingSim = r.outcome.gatedByScopeId ? m.preview?.get(r.outcome.gatedByScopeId) ?? null : null;
  const gatingReality = r.outcome.gatedByScopeId ? m.baseline?.get(r.outcome.gatedByScopeId) ?? null : null;
  const gatingScope = m.data?.scopes.find((s) => s.scopeId === r.outcome.gatedByScopeId) ?? null;

  return (
    <InstrumentShell stateBar={strip}>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5" style={{ background: "var(--i-void)" }}>
        {/* ── 1–5. THE FIVE QUESTIONS, ANSWERED IN ORDER ───────────── */}
        <div className="grid shrink-0 grid-cols-5 gap-2.5" data-shoot="cr-summary">
          <SummaryCard
            index={1}
            title="Reality"
            question="What is actually happening"
            primary={String(r.reality.openSignals)}
            primaryUnit={r.reality.openSignals === 1 ? "open signal" : "open signals"}
            primaryTone={r.reality.blockingSignals > 0 ? "amber" : "text"}
            secondary={[
              { value: String(r.reality.blockingSignals), label: "blocking" },
              { value: String(r.reality.completedRecently), label: "shipped, 14d" },
            ]}
            footnote={
              r.reality.evidenceAgeDays === null
                ? "No evidence recorded yet"
                : `Newest evidence ${Math.round(r.reality.evidenceAgeDays)}d old · ${r.reality.newestEvidenceLabel ?? "context"}`
            }
            href="/audit"
            shoot="cr-card-reality"
          />
          <SummaryCard
            index={2}
            title="Choices"
            question="What is open, and what is holding delivery"
            primary={String(r.choices.gating)}
            primaryUnit={r.choices.gating === 1 ? "gate" : "gates"}
            primaryTone={r.choices.gating > 0 ? "amber" : "mint"}
            secondary={[
              { value: `${r.choices.modelledDelayDays}d`, label: "modelled" },
              { value: String(r.choices.open), label: "open in all" },
            ]}
            footnote={
              // A DECISION IS NOT A GATE, and the difference is the point.
              `${r.choices.open - r.choices.gating} open decisions are not holding any date${r.choices.overdue > 0 ? ` · ${r.choices.overdue} past their needed-by` : ""}`
            }
            href="/decisions"
            shoot="cr-card-choices"
          />
          <SummaryCard
            index={3}
            title="Capacity"
            question="What we can actually do"
            primary={r.capacity.effective.toFixed(1)}
            primaryUnit="FTE arriving"
            primaryTone={r.capacity.required > 0.01 ? "amber" : "signal"}
            secondary={[
              { value: r.capacity.raw.toFixed(1), label: "allocated" },
              { value: r.capacity.free.toFixed(1), label: "free" },
              ...(r.capacity.required > 0.01 ? [{ value: r.capacity.required.toFixed(1), label: "missing" }] : []),
            ]}
            footnote={
              r.capacity.switchLoss > 0.05
                ? `${r.capacity.switchLoss.toFixed(1)} FTE goes to context switching at ${r.capacity.switchCostPct}%`
                : "Nobody is split across projects"
            }
            href="/portfolio"
            shoot="cr-card-capacity"
          />
          <SummaryCard
            index={4}
            title="Likely outcome"
            question="Where we land"
            primary={r.outcome.likely ? dShort(r.outcome.likely) : "—"}
            primaryUnit={r.outcome.gatedBy ? `· ${r.outcome.gatedBy} last` : undefined}
            primaryTone={m.active ? "violet" : "signal"}
            secondary={[
              // Confidence needs a target to be measured against. When the
              // last-landing project has none, the card says so rather than
              // borrowing another project's number and calling it the
              // project's confidence.
              ...(r.outcome.confidence !== null
                ? [{ value: `${r.outcome.confidence}%`, label: `by ${r.outcome.gatedBy}'s target` }]
                : []),
              ...(r.outcome.spreadDays !== null ? [{ value: `${r.outcome.spreadDays}d`, label: "spread" }] : []),
              {
                value: `${r.outcome.scopesPastTarget}`,
                label: r.outcome.scopesPastTarget === 1 ? "project past target" : "projects past target",
              },
            ]}
            footnote={
              r.outcome.gapDays === null
                ? `${r.outcome.gatedBy} has no target, so there is nothing to be confident against`
                : r.outcome.gapDays > 0
                  ? `${r.outcome.gapDays}d after its target`
                  : `${Math.abs(r.outcome.gapDays)}d of room before its target`
            }
            href="/forecast"
            shoot="cr-card-outcome"
          />
          <SummaryCard
            index={5}
            title="Time"
            question="Where we are, and what is next"
            primary={r.time.nextLandmark ? `${r.time.nextLandmark.inDays}d` : r.time.nextTarget ? `${r.time.nextTarget.inDays}d` : "—"}
            primaryUnit={r.time.nextLandmark ? "to next landmark" : "to next target"}
            secondary={[
              ...(r.time.nextTarget
                ? [{ value: dShort(r.time.nextTarget.date), label: `${r.time.nextTarget.name} target` }]
                : []),
            ]}
            footnote={r.time.nextLandmark ? r.time.nextLandmark.title : "No planned landmark ahead"}
            href="/timeline"
            shoot="cr-card-time"
          />
        </div>

        {/* ── CENTRE + RIGHT RAIL ──────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 gap-2.5">
          {/* THE TIMELINE INSTRUMENT ITSELF, embedded. Not a copy of it,
              not a chart that looks like it — the same component, the same
              playback, the same read model. */}
          <section
            data-shoot="cr-time-machine"
            className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg overflow-hidden"
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

          <div className="flex w-[318px] shrink-0 flex-col gap-2.5">
            {/* ── 5. WHAT COULD SURPRISE US ────────────────────────── */}
            <Panel
              title="Dependency watch"
              href="/orbit"
              action="Investigate in Orbit"
              shoot="cr-dependency-watch"
              className="min-h-[150px] flex-[1.5]"
            >
              <div className="flex h-full flex-col gap-1 overflow-y-auto i-noscrollbar">
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
                {/* PINNED, because it must never scroll out of sight: the
                    whole point of this panel is that nothing consequential
                    is invisible. Dashed and inert — these are unreviewed
                    external claims, and the product has no model for a
                    suspected dependency. See the truth audit. */}
                {r.needsReview > 0 && (
                  <div className="mt-auto pt-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                    <Row
                      shoot="cr-dep-needs_review"
                      dashed
                      tone="faint"
                      title={`${r.needsReview} external ${r.needsReview === 1 ? "claim" : "claims"} nobody has reviewed`}
                      detail="Suggested from transcripts and Linear. None of it counts towards any date until a person accepts it."
                      href="/timeline"
                    />
                  </div>
                )}
              </div>
            </Panel>

            {/* ── 6a. WHAT IS HOLDING US ───────────────────────────── */}
            <Panel title="Current constraints" shoot="cr-constraints" className="min-h-[126px] flex-1">
              <div className="flex h-full flex-col gap-1 overflow-y-auto i-noscrollbar">
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

            {/* ── 6b. WHAT CHANGED ─────────────────────────────────── */}
            <Panel title="Recent activity" href="/timeline" action="Timeline" shoot="cr-activity" className="min-h-[126px] flex-1">
              <div className="flex h-full flex-col gap-0.5 overflow-y-auto i-noscrollbar">
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
                        {a.count > 1 && (
                          <span style={{ color: "var(--i-text-faint)" }}> ×{a.count}</span>
                        )}
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
          </div>
        </div>

        {/* ── BOTTOM LENSES ────────────────────────────────────────── */}
        <div className="grid h-[172px] shrink-0 grid-cols-4 gap-2.5" data-shoot="cr-lenses">
          <Panel title="Forecast" href="/forecast" action="Open Forecast" shoot="cr-lens-forecast">
            {gatingSim && m.startDate && r.outcome.gatedByScopeId ? (
              <div className="flex h-full flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="i-readout text-[15px]" style={{ color: m.active ? "var(--i-violet)" : "var(--i-signal)" }}>
                    {dShort(gatingSim.likelyDate)}
                  </span>
                  <span className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                    {r.outcome.gatedBy} · P10 {r.outcome.p10 ? dShort(r.outcome.p10) : "—"} → P90{" "}
                    {r.outcome.p90 ? dShort(r.outcome.p90) : "—"}
                  </span>
                </div>
                {/* The real Living Forecast, over the real trials. It draws
                    itself absolutely, so it needs a box of its own to be
                    absolute inside — without one it escapes onto the page. */}
                <div className="relative min-h-0 flex-1 overflow-hidden">
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
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                No simulation yet.
              </p>
            )}
          </Panel>

          <Panel title="Capacity" href="/portfolio" action="Open Portfolio" shoot="cr-lens-capacity">
            <div className="flex h-full flex-col gap-1.5 overflow-y-auto i-noscrollbar">
              {/* Scaled against the LARGEST channel, not the allocated
                  total — a project whose capacity is a counted stand-in can
                  exceed the roster's own sum, and clamping it to 100% would
                  quietly flatten every real channel next to it. */}
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
                    {/* RAW is the track, EFFECTIVE is the fill. The gap
                        between them is context-switch loss, drawn to scale
                        and never exaggerated. */}
                    <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--i-recess)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (c.raw / w) * 100)}%`,
                          background: "var(--i-signal)",
                          opacity: 0.22,
                        }}
                      />
                      <div
                        className="relative -mt-1.5 h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (c.effective / w) * 100)}%`,
                          background: "var(--i-signal)",
                          opacity: c.basis === "allocations" ? 0.85 : 0.4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-0.5 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                {r.capacity.people} people · {r.capacity.free.toFixed(1)} FTE free
                {r.capacity.inferredScopes > 0
                  ? ` · ${r.capacity.inferredScopes} projects counted from assignees, not staffed`
                  : ""}
              </p>
            </div>
          </Panel>

          <Panel title="Decisions" href="/decisions" action="Open Decisions" shoot="cr-lens-decisions">
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

          <Panel title="Release composition" href="/scope" action="Open Scope" shoot="cr-lens-scope">
            <div className="flex h-full flex-col gap-1.5 overflow-y-auto i-noscrollbar">
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
                      {comp.engaged.length === 1 ? "capability" : "capabilities"}
                    </span>
                  </div>
                );
              })}
              {r.needsReview > 0 && (
                <p className="mt-auto pt-1 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                  {r.needsReview} external {r.needsReview === 1 ? "claim" : "claims"} awaiting review — none of it counts
                  towards a date.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
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
