"use client";

// THE COMMAND WORKSPACE — the approved Master Control Room layout,
// implemented.
//
// This file is a PRESENTATION of the reading. It computes nothing. Every
// figure on it arrives already derived from `readControlRoom`, which is
// itself a composition over the instruments that own each number. If a
// value here disagrees with the instrument it links to, that is a bug in
// lib/control-room/read.ts, not a difference of opinion.
//
// The geometry below is the mockup's, transcribed:
//
//   title block      30px uppercase title, one muted line under it
//   telemetry        five 141px panels, 9px gutters, coloured border and a
//                    tinted ground, badge · label · question · two figures
//                    with their captions · a filled trace along the foot
//   working surface  the Timeline instrument, 269px of rail beside it
//   operational rail system status · dependencies · constraints · changes,
//                    each with a coloured header and a full-width door
//   analysis row     198px: capacity · composition · decisions · forecast
//   status bar       48px of stored timestamps
//
// WHERE THE LAYOUT ASKS FOR A VALUE THE MODEL CANNOT PRODUCE, the visual
// pattern is kept exactly and the CONTENT is replaced with the closest true
// reading. Every one of those swaps is listed in
// docs/CONTROL-ROOM-TRUTH-AUDIT.md — "Utilization" is ARRIVING, the health
// donut is release composition, the risk list is current constraints with
// their own real quantities, and "All systems nominal" is the oldest
// reading on the page.

import Link from "next/link";
import type { ReactNode } from "react";
import TimelinePageClient from "@/components/TimelinePageClient";
import type { ControlRoomReading, Point, Series } from "@/lib/control-room/read";
import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import { composeFeatures } from "@/lib/scope/features";

// ── THE APPROVED PALETTE ───────────────────────────────────────────────
//
//   1 REALITY        cyan      2 CHOICES   violet
//   3 CAPACITY       amber     4 OUTCOME   green   (violet under Scenario)
//   5 TIME           periwinkle
//   constraints      amber · red when something is genuinely blocking
export const HUE = {
  reality: "var(--i-signal)",
  choices: "var(--i-violet)",
  capacity: "var(--i-amber)",
  outcome: "var(--i-mint)",
  time: "var(--i-cool)",
} as const;

const HUE_SOFT: Record<keyof typeof HUE, string> = {
  reality: "var(--i-signal-soft)",
  choices: "var(--i-violet-soft)",
  capacity: "var(--i-amber-soft)",
  outcome: "var(--i-mint-soft)",
  time: "var(--i-cool-soft)",
};

const dLong = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const dShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const MONTH = (d: Date) => d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
const ago = (d: Date, now: Date) => {
  const h = (now.getTime() - d.getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const age = (days: number) => {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m ago`;
  if (days < 2) return `${Math.round(days * 24)}h ago`;
  return `${Math.round(days)}d ago`;
};
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// The last sentence of a dependency's `detail` is the consequence — "If it
// slips, they both slip", "Answering this releases 2 projects at once". The
// sentences before it name the projects, which the row's subject and its
// quantity already carry. Nothing is invented here; a real sentence is
// selected out of one the read model already wrote.
const consequenceOf = (detail: string) => {
  const parts = detail.split(/(?<=\.)\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? detail;
};

export default function CommandWorkspace({
  r,
  data,
  scenario,
  scenarioActive,
  realityLikely,
}: {
  r: ControlRoomReading;
  data: ProjectPayload;
  scenario: SuiteScenario;
  scenarioActive: boolean;
  realityLikely: Date | null;
}) {
  const outcomeHue = scenarioActive ? "var(--i-violet)" : HUE.outcome;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--i-void)" }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[17px] pt-[18px]">
        {/* ── TITLE ────────────────────────────────────────────────── */}
        <div className="shrink-0 pb-[22px]">
          <h1
            className="text-[30px] font-bold uppercase leading-none tracking-[0.005em]"
            style={{ color: "var(--i-text)" }}
          >
            Master Control Room
          </h1>
          <p className="pt-[9px] text-[12.5px] leading-none" style={{ color: "var(--i-text-faint)" }}>
            Reality → Choices → Capacity → Likely Outcome → Time
          </p>
        </div>

        {/* ── TELEMETRY ────────────────────────────────────────────── */}
        <div
          data-shoot="cr-reading"
          className="grid h-[141px] shrink-0"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 9 }}
        >
          <Tile
            index={1}
            hue="reality"
            label="Reality"
            question="What's actually happening"
            a={String(r.reality.openSignals)}
            aLabel={plural(r.reality.openSignals, "Active Signal", "Active Signals")}
            b={String(r.reality.blockingSignals)}
            bLabel="Blocking"
            // RED BELONGS TO THE BLOCKING COUNT, not to the total beside it.
            // Painting "4 active signals" red because three of them block
            // would be colouring one quantity with another's state.
            bTone={r.reality.blockingSignals > 0 ? "var(--i-red)" : undefined}
            series={r.reality.shippedSeries}
            href="/audit"
            shoot="cr-card-reality"
          />
          <Tile
            index={2}
            hue="choices"
            label="Choices"
            question="What we've decided"
            a={String(r.choices.open)}
            // Decisions calls this lane "Open". The mockup's word was
            // "Active"; the owner's word wins.
            aLabel="Open Decisions"
            b={String(r.choices.gating)}
            bLabel="Holding Delivery"
            series={r.choices.answeredSeries}
            href="/decisions"
            shoot="cr-card-choices"
          />
          <Tile
            index={3}
            hue="capacity"
            label="Capacity"
            question="What we can do"
            // ARRIVING, not "utilization": of the time we committed, how much
            // lands on the work rather than being lost crossing between
            // projects. Both terms come from one readMaster call.
            a={r.capacity.arrivingPct === null ? "—" : `${Math.round(r.capacity.arrivingPct)}%`}
            aLabel="Reaching the Work"
            b={r.capacity.effective.toFixed(1)}
            bLabel={`of ${r.capacity.raw.toFixed(1)} FTE`}
            series={null}
            href="/portfolio"
            shoot="cr-card-capacity"
          />
          <Tile
            index={4}
            hue="outcome"
            label="Likely Outcome"
            question="What we believe will happen"
            a={r.outcome.likely ? dShort(r.outcome.likely) : "—"}
            aLabel={r.outcome.gatedBy ? `${r.outcome.gatedBy} Lands Last` : "Nothing Simulated"}
            aTone={outcomeHue}
            // Confidence is per project, against that project's own target.
            // When the last-landing project has none, this says so rather
            // than borrowing another project's number.
            b={r.outcome.confidence !== null ? `${r.outcome.confidence}%` : "No target"}
            bLabel={r.outcome.confidence !== null ? "Confidence" : "to measure against"}
            bTone={outcomeHue}
            series={r.outcome.confidenceHistory.find((s) => s.id === r.outcome.gatedByScopeId)?.points ?? null}
            reality={
              scenarioActive && realityLikely
                ? r.outcome.likely && dShort(realityLikely) === dShort(r.outcome.likely)
                  ? `${dShort(realityLikely)} · unchanged`
                  : dShort(realityLikely)
                : null
            }
            href="/forecast"
            shoot="cr-card-outcome"
          />
          <Tile
            index={5}
            hue="time"
            label="Time"
            question="Where we are in time"
            a={dShort(r.time.now)}
            aLabel="Live Now"
            b={r.time.horizonDays !== null ? `${r.time.horizonDays}d` : "—"}
            bLabel="to Horizon"
            series={null}
            href="/timeline"
            shoot="cr-card-time"
          />
        </div>

        {/* ── WORKING SURFACE + ANALYSIS + OPERATIONAL RAIL ────────── */}
        <div className="flex min-h-0 flex-1 pt-[15px]" style={{ gap: 13 }}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ gap: 12 }}>
          {/* THE TIMELINE INSTRUMENT ITSELF, embedded. Not a copy of it and
              not a chart that looks like it — the same component, the same
              playback, the same read model. */}
          <section
            data-shoot="cr-time-machine"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[8px]"
            style={{
              background:
                "linear-gradient(180deg, var(--i-cool-soft) 0%, rgba(0,0,0,0) 64px), var(--i-panel)",
              border: "1px solid var(--i-border)",
            }}
          >
            <header className="flex shrink-0 items-center gap-2.5 px-[16px] pb-[10px] pt-[13px]">
              <span className="text-[11px]" style={{ color: HUE.time }}>
                ◆
              </span>
              <h2
                className="text-[12.5px] font-semibold uppercase tracking-[0.09em]"
                style={{ color: HUE.time }}
              >
                Project Time Machine
              </h2>
              <span className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                ◇ As remembered
              </span>
              <div className="flex-1" />
              <Link href="/timeline" className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                Open Timeline →
              </Link>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <TimelinePageClient embedded />
            </div>
          </section>

        {/* ── ANALYSIS ROW ─────────────────────────────────────────── */}
          <div
            data-shoot="cr-surfaces"
            className="grid h-[198px] shrink-0 pt-[12px]"
            style={{ gridTemplateColumns: "1.15fr 1.05fr 0.95fr 1.2fr", gap: 9 }}
          >
            {/* CAPACITY OVERVIEW. The layout wants a multi-line history by
                discipline; the model has NEITHER — `Allocation` carries no
                timestamps and there is no discipline field. So the header
                says "today only" and the panel shows the real current split
                per project: committed as the track, arriving as the fill. */}
            <Bottom title="Capacity Overview" href="/portfolio" shoot="cr-surf-capacity">
              <p className="flex items-baseline gap-[7px]">
                <span
                  className="i-readout text-[24px] leading-none"
                  style={{ color: r.capacity.arrivingPct !== null && r.capacity.arrivingPct >= 95 ? HUE.outcome : HUE.capacity }}
                >
                  {r.capacity.arrivingPct === null ? "—" : `${Math.round(r.capacity.arrivingPct)}%`}
                </span>
                <span className="min-w-0 flex-1 self-center">
                  <span className="block text-[11px] leading-[12px]" style={{ color: "var(--i-text-soft)" }}>
                    effective capacity
                  </span>
                  <span
                    data-shoot="cr-capacity-nohistory"
                    className="block text-[10px] leading-[12px]"
                    style={{ color: "var(--i-text-faint)" }}
                  >
                    today only · no history exists
                  </span>
                </span>
              </p>
              <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto pt-[7px]">
                {r.capacity.byScope.map((c, i) => {
                  const w = Math.max(0.001, ...r.capacity.byScope.map((x) => Math.max(x.raw, x.effective)));
                  return (
                    <div key={c.scopeId} data-shoot={`cr-capacity-row-${c.scopeId}`}>
                      <div className="flex items-baseline gap-[7px]">
                        <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: SERIES[i % 4] }} />
                        <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
                          {c.name}
                        </span>
                        <span className="i-readout shrink-0 text-[10.5px]" style={{ color: "var(--i-text)" }}>
                          {c.effective.toFixed(1)}
                          {c.basis === "allocations" ? ` / ${c.raw.toFixed(1)}` : " counted"}
                        </span>
                      </div>
                      <div className="ml-[14px] mt-[2px] h-[4px] rounded-full" style={{ background: "var(--i-recess)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (c.raw / w) * 100)}%`, background: SERIES[i % 4], opacity: 0.22 }}
                        />
                        <div
                          className="relative -mt-[4px] h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (c.effective / w) * 100)}%`,
                            background: SERIES[i % 4],
                            opacity: c.basis === "allocations" ? 0.9 : 0.42,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Bottom>

            {/* RELEASE COMPOSITION. The layout's health donut, with a truthful
                subject: there are no On Track / At Risk / Blocked states in
                this product, so the ring is the remaining load each project
                carries, from composeFeatures. Colour is project IDENTITY —
                every segment is named, so no state is implied. */}
            <Bottom title="Release Composition" href="/scope" shoot="cr-surf-scope">
              <Composition data={data} scenario={scenario} />
            </Bottom>

            <Bottom title="Decisions Summary" href="/decisions" shoot="cr-surf-decisions">
              <p className="flex items-baseline gap-[7px]">
                <span className="i-readout text-[26px] leading-none" style={{ color: "var(--i-text)" }}>
                  {r.choices.open}
                </span>
                <span className="text-[13px]" style={{ color: HUE.choices }}>
                  Open
                </span>
              </p>
              <p className="pt-[4px] text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                Decisions
              </p>
              {/* A DECISION IS NOT A GATE, and the difference is the point.
                  Both numbers sit side by side because "36 open" without "2
                  actually holding delivery" is the exact misreading this
                  product exists to prevent. */}
              <div className="grid flex-1 grid-cols-3 items-center gap-2 pt-[8px]">
                <Tally value={String(r.choices.gating)} label="Holding" tone="var(--i-amber)" />
                <Tally value={`${r.choices.modelledDelayDays}d`} label="Modelled" tone="var(--i-amber)" />
                <Tally value={String(r.choices.dueSoon)} label="Due 14d" tone="var(--i-text)" />
              </div>
              <Link
                href="/decisions"
                className="mt-auto flex shrink-0 items-center justify-center gap-1.5 rounded-[5px] py-[6px] text-[11px]"
                style={{ border: "1px solid var(--i-amber)", color: "var(--i-amber)" }}
              >
                View Decisions →
              </Link>
            </Bottom>

            {/* FORECAST CONFIDENCE — the one panel whose real history matches
                the layout's line chart exactly: `Report.confidenceAtTarget`,
                plotted at each report's own `generatedAt`. A project nobody
                has reported on is ABSENT, never drawn flat at zero. */}
            <Bottom title="Forecast Confidence" href="/forecast" shoot="cr-surf-forecast">
              <p className="text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
                {r.outcome.confidence !== null && r.outcome.gatedBy
                  ? `${r.outcome.gatedBy}, against its target`
                  : r.outcome.gatedBy
                    ? `${r.outcome.gatedBy} lands last`
                    : "Overall confidence"}
              </p>
              <p className="flex items-baseline gap-2 pt-[5px]">
                <span
                  data-shoot="cr-confidence-now"
                  className="i-readout text-[26px] leading-none"
                  style={{ color: r.outcome.confidence === null ? "var(--i-text-faint)" : outcomeHue }}
                >
                  {r.outcome.confidence !== null ? `${r.outcome.confidence}%` : "No target"}
                </span>
                {r.outcome.confidenceTrendPts !== null && (
                  <span
                    data-shoot="cr-confidence-trend"
                    className="i-readout text-[11px]"
                    style={{ color: r.outcome.confidenceTrendPts >= 0 ? HUE.outcome : "var(--i-red)" }}
                  >
                    {r.outcome.confidenceTrendPts > 0 ? "+" : ""}
                    {r.outcome.confidenceTrendPts} pts
                  </span>
                )}
              </p>
              <div className="min-h-0 flex-1 pt-[6px]">
                {r.outcome.confidenceHistory.length > 0 ? (
                  <ConfidenceLines
                    series={r.outcome.confidenceHistory}
                    gatingId={r.outcome.gatedByScopeId}
                    now={r.time.now}
                  />
                ) : (
                  <p
                    data-shoot="cr-confidence-nohistory"
                    className="text-[10.5px] leading-snug"
                    style={{ color: "var(--i-text-faint)" }}
                  >
                    No report has stored a confidence yet, so there is no history to draw.
                  </p>
                )}
              </div>
            </Bottom>
          </div>
          </div>

          <div data-shoot="cr-rail" className="flex w-[269px] shrink-0 flex-col" style={{ gap: 11 }}>
            {/* SYSTEM STATUS — ages, never grades. There is no health model,
                so the header states the OLDEST reading as a fact rather
                than inventing a verdict for the whole page. */}
            <RailPanel
              title="System Status"
              hue="var(--i-text)"
              sub={
                r.oldestReading
                  ? `Oldest ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
                  : "Nothing is dated"
              }
              dot="var(--i-mint)"
              shoot="cr-system-panel"
            >
              <div className="flex flex-col gap-[2px] pt-[6px]">
                {r.system.map((s) => (
                  <Link
                    key={s.id}
                    href={s.href}
                    data-shoot={`cr-system-${s.id}`}
                    className="flex items-baseline justify-between gap-2 leading-[15px] hover:opacity-80"
                  >
                    <span className="truncate text-[11px]" style={{ color: "var(--i-text-soft)" }}>
                      {s.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-[7px]">
                      <span className="i-readout text-[11px]" style={{ color: "var(--i-text)" }}>
                        {s.ageDays === null ? "—" : age(s.ageDays)}
                      </span>
                      <Dot colour="var(--i-mint)" />
                    </span>
                  </Link>
                ))}
              </div>
            </RailPanel>

            {/* DEPENDENCY WATCH — declared edges only. Nothing in the
                pipeline proposes a dependency, so the unreviewed external
                claims are kept apart, dashed, and counted for nothing. */}
            <RailPanel
              title="Dependency Watch"
              hue="var(--i-signal)"
              shoot="cr-dependency-watch"
              door={{ href: "/orbit", label: "Investigate in Orbit", tone: "var(--i-signal)" }}
              grow="1.28"
            >
              <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pt-[8px]">
                {r.dependencies.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                    Nothing waits on anything else.
                  </p>
                )}
                {/* A SINGLE POINT OF FAILURE GOES FIRST, and it is the one
                    row that gets to spend a second line saying what happens
                    if it slips. A plain edge is a fact; an upstream two
                    projects wait on is the thing this panel exists to
                    prevent being a surprise, and "2 downstream" on its own
                    does not say that both of them move. */}
                {[...r.dependencies]
                  .filter((d) => d.kind !== "needs_review")
                  .sort((a, b) => Number(b.kind !== "waits_on") - Number(a.kind !== "waits_on"))
                  .map((d) => (
                    <Link
                      key={d.id}
                      data-shoot={`cr-dep-${d.kind}`}
                      data-candidate={d.causal ? "false" : "true"}
                      title={d.detail}
                      href={
                        d.focusScopeId
                          ? `/orbit?focus=${d.focusScopeId}${d.selectNodeId ? `&select=${encodeURIComponent(d.selectNodeId)}` : ""}`
                          : "/orbit"
                      }
                      className="flex items-baseline justify-between gap-2 hover:opacity-80"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] leading-[15px]" style={{ color: "var(--i-text-soft)" }}>
                          {d.subject}
                        </span>
                        {d.kind !== "waits_on" && (
                          <span
                            data-shoot="cr-dep-consequence"
                            className="block truncate text-[10px] leading-[12px]"
                            style={{ color: "var(--i-text-faint)" }}
                          >
                            {consequenceOf(d.detail)}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-[7px]">
                        <span
                          className="i-readout text-[11px]"
                          style={{ color: d.kind === "shared_upstream" ? "var(--i-amber)" : "var(--i-mint)" }}
                        >
                          {d.quantity ?? "accepted"}
                        </span>
                        <Dot colour={d.kind === "shared_upstream" ? "var(--i-amber)" : "var(--i-mint)"} />
                      </span>
                    </Link>
                  ))}
              </div>
              {r.needsReview > 0 && (
                <Link
                  href="/timeline"
                  data-shoot="cr-dep-needs_review"
                  data-candidate="true"
                  title="Suggested from transcripts and Linear. Counts towards no date until a person accepts it."
                  className="mt-[6px] shrink-0 truncate rounded-[4px] px-[6px] py-[3px] text-[9.5px] hover:opacity-80"
                  style={{ border: "1px dashed var(--i-border-strong)", color: "var(--i-text-faint)" }}
                >
                  {r.needsReview} unreviewed external {plural(r.needsReview, "claim", "claims")} — counts towards no date
                  until a person accepts it
                </Link>
              )}
            </RailPanel>

            {/* CURRENT CONSTRAINTS — the layout's "Risk Signals" slot. There
                is NO severity model in this product, so there is no
                High/Medium: each row carries its own real quantity in its
                own unit, and names the project it is holding. */}
            <RailPanel
              title="Current Constraints"
              hue="var(--i-amber)"
              shoot="cr-constraints"
              door={{ href: "/decisions", label: "View Decisions", tone: "var(--i-amber)" }}
              grow
            >
              <div className="i-noscrollbar i-fade-b flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pt-[8px]">
                {r.constraints.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
                    Nothing is constraining delivery beyond the work itself.
                  </p>
                )}
                {r.constraints.slice(0, 5).map((c) => (
                  <Link
                    key={c.id}
                    href={c.href}
                    data-shoot="cr-constraint"
                    className="flex items-baseline justify-between gap-2 hover:opacity-80"
                    title={`${c.detail} — ${c.label}`}
                  >
                    <span className="truncate text-[11px]" style={{ color: "var(--i-text-soft)" }}>
                      {c.detail}
                    </span>
                    <span className="flex shrink-0 items-center gap-[7px]">
                      <span className="i-readout text-[11px]" style={{ color: "var(--i-amber)" }}>
                        {c.quantity}
                      </span>
                      <Dot colour="var(--i-amber)" />
                    </span>
                  </Link>
                ))}
              </div>
            </RailPanel>

            <RailPanel
              title="What Changed"
              hue="var(--i-amber)"
              shoot="cr-activity"
              door={{ href: "/timeline", label: "View Timeline", tone: "var(--i-violet)" }}
            >
              <div className="flex shrink-0 flex-col gap-[2px] pt-[6px]">
                {r.activity.slice(0, 3).map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    data-shoot="cr-activity-row"
                    className="flex items-baseline justify-between gap-2 leading-[15px] hover:opacity-80"
                  >
                    <span className="flex min-w-0 items-baseline gap-[7px]">
                      <span className="shrink-0 text-[8px]" style={{ color: familyColour(a.family) }}>
                        ◆
                      </span>
                      <span className="truncate text-[11px]" style={{ color: "var(--i-text-soft)" }}>
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
            </RailPanel>
          </div>
        </div>

      </div>

      {/* ── STATUS BAR ─────────────────────────────────────────────── */}
      <div
        data-shoot="cr-statusbar"
        className="mt-[16px] flex h-[48px] shrink-0 items-center gap-[34px] px-[17px]"
        style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
      >
        <StatusCell
          id="system"
          label="System"
          value={
            r.oldestReading
              ? `Oldest reading ${r.oldestReading.label.toLowerCase()}, ${age(r.oldestReading.ageDays ?? 0)}`
              : "Nothing is dated"
          }
          tone="var(--i-mint)"
        />
        <StatusCell
          id="data"
          label="Data"
          value={age(r.system.find((s) => s.id === "project")?.ageDays ?? 0)}
          tone="var(--i-mint)"
          href="/portfolio"
        />
        <StatusCell
          id="forecast"
          label="Forecast"
          value={r.time.lastForecastAt ? dLong(r.time.lastForecastAt) : "never run"}
          tone="var(--i-amber)"
          href="/forecast"
        />
        <StatusCell
          id="horizon"
          label="Horizon"
          value={r.time.horizonDays !== null ? `${r.time.horizonDays} Days` : "—"}
          tone="var(--i-cool)"
          href="/timeline"
        />
        <StatusCell
          id="mode"
          label="Mode"
          value={scenarioActive ? "Scenario — Reality preserved" : "Reality"}
          tone={scenarioActive ? "var(--i-violet)" : "var(--i-signal)"}
        />
        <div className="flex-1" />
        <Link href="/timeline" className="text-[11.5px]" style={{ color: "var(--i-text-faint)" }}>
          Timeline
        </Link>
        <Link href="/forecast" className="text-[11.5px]" style={{ color: "var(--i-text-faint)" }}>
          Forecast
        </Link>
        <span className="text-[11.5px]" style={{ color: "var(--i-text-faint)" }}>
          Control Room
        </span>
      </div>
    </div>
  );
}

// ── PIECES ─────────────────────────────────────────────────────────────

/** Project identity colours for the composition ring and the capacity bars.
    Every segment is named beside its value, so a hue here is a label, not a
    state — this product has no state model to encode. */
const SERIES = ["var(--i-signal)", "var(--i-mint)", "var(--i-violet)", "var(--i-amber)"];

function Dot({ colour }: { colour: string }) {
  return <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: colour }} />;
}

function Tile({
  index,
  hue,
  label,
  question,
  a,
  aLabel,
  aTone,
  b,
  bLabel,
  bTone,
  series,
  reality,
  href,
  shoot,
}: {
  index: number;
  hue: keyof typeof HUE;
  label: string;
  question: string;
  a: string;
  aLabel: string;
  aTone?: string;
  b: string;
  bLabel: string;
  bTone?: string;
  series: Point[] | null;
  reality?: string | null;
  href: string;
  shoot: string;
}) {
  const c = HUE[hue];
  return (
    <Link
      href={href}
      data-shoot={shoot}
      data-domain={hue}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[8px] px-[15px] pb-[3px] pt-[12px] transition-opacity hover:opacity-95"
      style={{
        background: `linear-gradient(180deg, ${HUE_SOFT[hue]} 0%, rgba(0,0,0,0) 58%), var(--i-panel)`,
        border: `1px solid color-mix(in srgb, ${c} 62%, var(--i-border))`,
        opacity: 0.999,
      }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-[8px]">
        <span
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-[10.5px] font-bold"
          style={{ background: c, color: "var(--i-void)" }}
        >
          {index}
        </span>
        <span className="truncate text-[12.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: c }}>
          {label}
        </span>
      </div>
      <p className="shrink-0 truncate pt-[5px] text-[11.5px] leading-[14px]" style={{ color: "var(--i-text-faint)" }}>
        {question}
      </p>

      <div className="flex min-w-0 shrink-0 items-baseline gap-[20px] pt-[7px]">
        <span className="min-w-0">
          <span
            data-shoot={`${shoot}-primary`}
            className="i-readout block truncate leading-none"
            style={{ color: aTone ?? c, fontSize: a.length > 7 ? 20 : 29 }}
          >
            {a}
          </span>
          <span className="block truncate pt-[5px] text-[11px] leading-[13px]" style={{ color: "var(--i-text-faint)" }}>
            {aLabel}
          </span>
        </span>
        <span className="min-w-0">
          <span
            data-shoot={`${shoot}-second`}
            className="i-readout block truncate leading-none"
            style={{ color: bTone ?? c, fontSize: b.length > 7 ? 20 : 29 }}
          >
            {b}
          </span>
          <span className="block truncate pt-[5px] text-[11px] leading-[13px]" style={{ color: "var(--i-text-faint)" }}>
            {bLabel}
          </span>
        </span>
      </div>

      {reality && (
        <span
          data-shoot={`${shoot}-reality`}
          className="i-readout absolute right-[14px] top-[13px] truncate rounded-[3px] px-[6px] py-[2px] text-[9.5px]"
          style={{ background: "var(--i-recess)", color: "var(--i-reality)" }}
        >
          Reality {reality}
        </span>
      )}

      {/* REAL RECORDED POINTS ONLY. Where a reading has no history — capacity
          has none anywhere in the model — the floor stays empty. A recess is
          not a claim; a flat line would be. */}
      <div className="-mx-[15px] mt-auto h-[26px] shrink-0">
        {series && series.length > 0 ? <Trace points={series} colour={c} shoot={`${shoot}-spark`} /> : null}
      </div>
    </Link>
  );
}

function Trace({ points, colour, shoot }: { points: Point[]; colour: string; shoot: string }) {
  const W = 100;
  const H = 26;
  const PAD = 4;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  return (
    <svg
      data-shoot={shoot}
      data-points={points.length}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      {points.length === 1 ? (
        <circle cx={W / 2} cy={H / 2} r={1.4} fill={colour} vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <polygon points={`0,${H} ${line} ${W},${H}`} fill={colour} opacity={0.13} />
          <polyline
            points={line}
            fill="none"
            stroke={colour}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

function RailPanel({
  title,
  hue,
  sub,
  dot,
  shoot,
  door,
  grow,
  children,
}: {
  title: string;
  hue: string;
  sub?: string;
  dot?: string;
  shoot: string;
  door?: { href: string; label: string; tone: string };
  grow?: boolean | string;
  children: ReactNode;
}) {
  return (
    <section
      data-shoot={shoot}
      className={`flex min-h-0 flex-col overflow-hidden rounded-[8px] px-[15px] pb-[11px] pt-[12px] ${grow ? "min-h-[104px]" : "shrink-0"}`}
      style={{
        background: "var(--i-panel)",
        border: "1px solid var(--i-border)",
        flex: grow ? `${typeof grow === "string" ? grow : 1} 1 0%` : undefined,
      }}
    >
      <header className="shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: hue }}>
            {title}
          </h2>
          <div className="flex-1" />
          {dot && <Dot colour={dot} />}
        </div>
        {sub && (
          <p className="truncate pt-[5px] text-[11px]" style={{ color: "var(--i-text-faint)" }}>
            {sub}
          </p>
        )}
      </header>
      {children}
      {door && (
        <Link
          href={door.href}
          data-shoot="cr-panel-door"
          className="mt-[10px] flex shrink-0 items-center justify-center gap-1.5 rounded-[5px] py-[6px] text-[11px] transition-opacity hover:opacity-80"
          style={{ border: `1px solid ${door.tone}`, color: door.tone }}
        >
          {door.label} →
        </Link>
      )}
    </section>
  );
}

function Bottom({
  title,
  href,
  shoot,
  children,
}: {
  title: string;
  href: string;
  shoot: string;
  children: ReactNode;
}) {
  return (
    <section
      data-shoot={shoot}
      className="flex min-h-0 flex-col overflow-hidden rounded-[8px] px-[16px] pb-[13px] pt-[13px]"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <header className="flex shrink-0 items-baseline gap-2 pb-[9px]">
        <h2 className="truncate text-[11.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--i-text)" }}>
          {title}
        </h2>
        <div className="flex-1" />
        <Link href={href} className="shrink-0 text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
          Open →
        </Link>
      </header>
      {children}
    </section>
  );
}

function Tally({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className="i-readout text-[21px] leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="truncate pt-[6px] text-[10px] leading-tight" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

function StatusCell({
  id,
  label,
  value,
  tone,
  href,
}: {
  id: string;
  label: string;
  value: string;
  tone: string;
  href?: string;
}) {
  const body = (
    <span className="flex items-center gap-[8px]" data-shoot={`cr-status-${id}`}>
      <Dot colour={tone} />
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </span>
      <span className="text-[11.5px]" style={{ color: "var(--i-text-soft)" }}>
        {value}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

/** The layout's health donut, carrying the one composition this product
    genuinely has: remaining load days per project, from composeFeatures. */
function Composition({ data, scenario }: { data: ProjectPayload; scenario: SuiteScenario }) {
  const parts = data.scopes.map((s) => {
    const comp = composeFeatures(
      s.items,
      s.completedWork,
      scenario.capacityOverrideByScope[s.scopeId] ?? s.teamCapacity,
      scenario.bypassedFeatureIds,
      scenario.estimateOverrideByItemId,
      scenario.draftFeatures,
      scenario.acceptedCandidateIds
    );
    return { id: s.scopeId, name: s.name, days: comp.loadDays, features: comp.engaged.length };
  });
  const total = parts.reduce((n, p) => n + p.days, 0);

  const R = 34;
  const T = 11;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex min-h-0 flex-1 items-center gap-[14px]">
      <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
        <svg viewBox="0 0 88 88" width={88} height={88} aria-hidden>
          <circle cx={44} cy={44} r={R} fill="none" stroke="var(--i-recess)" strokeWidth={T} />
          {parts.map((p, i) => {
            const frac = total > 0 ? p.days / total : 0;
            const len = frac * C;
            const el = (
              <circle
                key={p.id}
                cx={44}
                cy={44}
                r={R}
                fill="none"
                stroke={SERIES[i % 4]}
                strokeWidth={T}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 44 44)"
                opacity={0.92}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="i-readout text-[17px] leading-none" style={{ color: "var(--i-text)" }}>
            {total.toFixed(0)}d
          </span>
          <span className="pt-[3px] text-[9px]" style={{ color: "var(--i-text-faint)" }}>
            remaining
          </span>
        </div>
      </div>
      <div className="i-noscrollbar flex min-w-0 flex-1 flex-col justify-center gap-[7px] overflow-y-auto">
        {parts.map((p, i) => (
          <div key={p.id} className="flex items-baseline gap-[7px]">
            <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: SERIES[i % 4] }} />
            <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
              {p.name}
            </span>
            <span className="i-readout shrink-0 text-[10.5px]" style={{ color: "var(--i-text)" }}>
              {p.days.toFixed(1)}d
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The layout's confidence line chart, on the one series that genuinely
    matches its shape: what every report stored when it ran. */
function ConfidenceLines({
  series,
  gatingId,
  now,
}: {
  series: Series[];
  gatingId: string | null;
  now: Date;
}) {
  const all = series.flatMap((s) => s.points);
  const t0 = Math.min(...all.map((p) => +p.at));
  const t1 = Math.max(+now, ...all.map((p) => +p.at));
  const span = t1 - t0 || 1;

  const L = 13; // room for the axis labels
  const B = 14; // room for the month rule
  const W = 100;
  const H = 100;
  const x = (at: Date) => L + ((+at - t0) / span) * (W - L);
  const y = (v: number) => 4 + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - B - 8);

  const months: { at: number; label: string }[] = [];
  {
    const d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth(), 1);
    for (let k = 0; k < 24; k++) {
      const t = d.getTime();
      if (t > t1) break;
      if (t >= t0) months.push({ at: x(new Date(t)), label: MONTH(d) });
      d.setMonth(d.getMonth() + 1);
    }
  }

  const anyLead = series.some((s) => s.id === gatingId);

  return (
    <div className="relative h-full w-full" data-shoot="cr-confidence-chart" data-series={series.length}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {[100, 75, 50, 25].map((g) => (
          <line
            key={g}
            x1={L}
            x2={W}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--i-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={g === 50 ? 0.9 : 0.45}
            strokeDasharray={g === 50 ? "2 3" : undefined}
          />
        ))}
        {/* NOW, on the same axis the lines are drawn against. */}
        <line
          x1={x(now)}
          x2={x(now)}
          y1={2}
          y2={H - B}
          stroke="var(--i-signal)"
          strokeWidth={1}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
        {[...series]
          .sort((a, b) => (a.id === gatingId ? 1 : 0) - (b.id === gatingId ? 1 : 0))
          .map((s, i) => {
            const lead = s.id === gatingId;
            const colour = lead ? "var(--i-mint)" : anyLead ? "var(--i-text-faint)" : `color-mix(in srgb, var(--i-mint) ${88 - i * 18}%, var(--i-text-faint))`;
            if (s.points.length === 1) {
              return (
                <circle
                  key={s.id}
                  data-shoot={`cr-conf-dot-${s.id}`}
                  cx={x(s.points[0].at)}
                  cy={y(s.points[0].value)}
                  r={1.6}
                  fill={colour}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            return (
              <polyline
                key={s.id}
                data-shoot={`cr-conf-line-${s.id}`}
                data-points={s.points.length}
                points={s.points.map((p) => `${x(p.at)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={colour}
                strokeWidth={lead ? 1.9 : 1.3}
                opacity={lead ? 1 : 0.7}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
      </svg>

      {/* Type lives in HTML so the plot can stretch without scaling it. */}
      <div className="pointer-events-none absolute inset-0">
        {[100, 75, 50, 25].map((g) => (
          <span
            key={g}
            className="i-readout absolute -translate-y-1/2 text-[8px]"
            style={{ left: 0, top: `${y(g)}%`, color: "var(--i-text-faint)" }}
          >
            {g}%
          </span>
        ))}
        {months.map((mo, i) => (
          <span
            key={i}
            className="absolute bottom-0 -translate-x-1/2 text-[8.5px] tracking-[0.08em]"
            style={{ left: `${mo.at}%`, color: "var(--i-text-faint)" }}
          >
            {mo.label}
          </span>
        ))}
        <span
          className="absolute bottom-0 -translate-x-1/2 text-[8px] font-semibold tracking-[0.1em]"
          style={{ left: `${x(now)}%`, color: "var(--i-signal)" }}
        >
          TODAY
        </span>
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          const lead = s.id === gatingId;
          if (anyLead && !lead) return null;
          return (
            <span
              key={s.id}
              data-shoot={`cr-conf-label-${s.id}`}
              className="i-readout absolute -translate-y-1/2 whitespace-nowrap pl-1 text-[9px]"
              style={{ left: `${x(last.at)}%`, top: `${y(last.value)}%`, color: "var(--i-mint)", opacity: 0.9 }}
            >
              {last.value}%
            </span>
          );
        })}
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
