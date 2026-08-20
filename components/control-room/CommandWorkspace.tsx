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

// TWO PROJECTS CAN SHARE A NAME — the seed carries `jsa` and `jsa-seed`,
// both called "JSA" — and two rows reading the same word with different
// numbers looks like a rendering fault rather than like two real projects.
// Where a name repeats, the row states the id that distinguishes them.
// Nothing is invented: the id is the project's own.
function disambiguate<T extends { scopeId: string; name: string }>(rows: T[]): (T & { display: string })[] {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
  // On a collision the ID is the distinguishing fact and it already contains
  // the name — "jsa" and "jsa-seed" — so it replaces the name outright
  // rather than being appended to a word that is no longer telling them apart.
  // A RAW CUID IS NOT A NAME. Where the id is a readable slug ("jsa-seed")
  // it distinguishes; where it is a 25-character database id it is worse
  // than the ambiguity it was meant to fix, so a short ordinal is used and
  // the full id stays in the row's tooltip.
  const ordinals = new Map<string, number>();
  return rows.map((r) => {
    if ((seen.get(r.name) ?? 0) <= 1) return { ...r, display: r.name };
    const nth = (ordinals.get(r.name) ?? 0) + 1;
    ordinals.set(r.name, nth);
    const readable = /^[a-z0-9]+(-[a-z0-9]+)+$/i.test(r.scopeId) && r.scopeId.length <= 24;
    return { ...r, display: readable ? r.scopeId : `${r.name} (${nth})` };
  });
}

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

  // WHAT CHANGED, with its subjects kept distinct. The same work item title
  // can land on two different projects — the seed has `jsa` and `jsa-seed`,
  // both named JSA — and two identical lines read as a duplicated row rather
  // than as two real events. Where a title repeats, the row names its
  // project. The name is the project's own; nothing is invented.
  const scopeNameById = new Map(data.scopes.map((s) => [s.scopeId, s.name] as const));
  const activityRows = (() => {
    const rows = r.activity.slice(0, 3);
    const times = new Map<string, number>();
    for (const a of rows) times.set(a.title, (times.get(a.title) ?? 0) + 1);
    // NAMING THE PROJECT IS NOT ENOUGH when the two projects share a name —
    // which is precisely the case this exists for. The disambiguated label
    // is used, so two rows never read identically.
    const named = disambiguate(
      rows.map((a) => ({ scopeId: a.scopeId, name: scopeNameById.get(a.scopeId) ?? a.scopeId }))
    );
    return rows.map((a, i) => ({
      ...a,
      scopeLabel: (times.get(a.title) ?? 0) > 1 ? named[i].display : null,
    }));
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--i-void)" }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[17px] pt-[18px]">
        {/* ── TITLE ────────────────────────────────────────────────── */}
        <div className="shrink-0 pb-[15px]">
          <h1
            className="text-[30px] font-bold uppercase leading-none tracking-[0.005em]"
            style={{ color: "var(--i-text)" }}
          >
            Master Control Room
          </h1>
          <p className="pt-[8px] text-[12px] leading-none" style={{ color: "var(--i-text-faint)" }}>
            Reality → Choices → Capacity → Likely Outcome → Time
          </p>
        </div>

        {/* ── TELEMETRY ────────────────────────────────────────────── */}
        <div
          data-shoot="cr-reading"
          className="grid h-[134px] shrink-0"
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
        <div className="flex min-h-0 flex-1 pt-[12px]" style={{ gap: 13 }}>
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
            className="grid h-[190px] shrink-0 pt-[10px]"
            style={{ gridTemplateColumns: "1.15fr 1.05fr 0.95fr 1.2fr", gap: 9 }}
          >
            {/* CAPACITY OVERVIEW. The layout wants a multi-line history by
                discipline; the model has NEITHER — `Allocation` carries no
                timestamps and there is no discipline field. So the header
                says "today only" and the panel shows the real current split
                per project: committed as the track, arriving as the fill. */}
            <Bottom title={`Capacity · ${r.capacity.byScope.length} projects`} href="/portfolio" shoot="cr-surf-capacity" hue={HUE.capacity}>
              <p className="flex shrink-0 items-baseline gap-[8px]">
                <span
                  className="i-readout leading-none"
                  style={{
                    color: r.capacity.arrivingPct !== null && r.capacity.arrivingPct >= 95 ? HUE.outcome : HUE.capacity,
                    fontSize: 30,
                    letterSpacing: "-0.015em",
                    textShadow: `0 0 20px color-mix(in srgb, ${HUE.capacity} 24%, transparent)`,
                  }}
                >
                  {r.capacity.arrivingPct === null ? "—" : `${Math.round(r.capacity.arrivingPct)}%`}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[10px] uppercase leading-[12px] tracking-[0.05em]"
                  style={{ color: "var(--i-text-soft)" }}
                >
                  reaching the work
                </span>
                {/* THE GAP IS STATED ON THE PANEL, never in a tooltip. No
                    capacity history exists anywhere in the model, and a
                    surface that quietly omitted that would be implying the
                    bars are a trend. */}
                <span
                  data-shoot="cr-capacity-nohistory"
                  className="w-[52px] shrink-0 text-right text-[9px] leading-[11px]"
                  style={{ color: "var(--i-text-faint)" }}
                  title="Allocation carries no timestamps, so no capacity history exists anywhere in the model."
                >
                  today only
                  <br />
                  no history
                </span>
              </p>
              <div className="i-noscrollbar flex min-h-0 flex-1 flex-col justify-center gap-[4px] overflow-y-auto pt-[7px]">
                {disambiguate(r.capacity.byScope).map((c, i) => {
                  const w = Math.max(0.001, ...r.capacity.byScope.map((x) => Math.max(x.raw, x.effective)));
                  const tone = SERIES[i % 4];
                  return (
                    <div key={c.scopeId} data-shoot={`cr-capacity-row-${c.scopeId}`} className="flex items-center gap-[8px]">
                      <span
                        className="w-[66px] shrink-0 truncate text-[9.5px] uppercase tracking-[0.03em]"
                        style={{ color: "var(--i-text-soft)" }}
                        title={c.display}
                      >
                        {c.display}
                      </span>
                      {/* COMMITTED is the track, ARRIVING is the fill. The gap
                          between them is the switching loss, and it is the
                          only thing this row is trying to make visible. */}
                      <span className="relative h-[9px] min-w-0 flex-1 overflow-hidden rounded-[2px]" style={{ background: "var(--i-recess)" }}>
                        <span
                          className="absolute inset-y-0 left-0 rounded-[2px]"
                          style={{ width: `${Math.min(100, (c.raw / w) * 100)}%`, background: tone, opacity: 0.2 }}
                        />
                        <span
                          className="absolute inset-y-0 left-0 rounded-[2px]"
                          style={{
                            width: `${Math.min(100, (c.effective / w) * 100)}%`,
                            background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 72%, transparent), ${tone})`,
                            opacity: c.basis === "allocations" ? 1 : 0.45,
                          }}
                        />
                      </span>
                      {/* "ct" abbreviated "counted" and was attached to exactly
                          the rows that were NOT counted. A row with real
                          allocations reads effective/committed; an inferred
                          one is marked `est`; one inferred from nobody is not
                          a number at all. */}
                      <span className="i-readout w-[58px] shrink-0 text-right text-[10.5px]" style={{ color: c.known ? "var(--i-text)" : "var(--i-text-faint)" }}>
                        {!c.known ? (
                          <span data-shoot="cr-capacity-unknown" title="No allocations and nobody assigned — capacity is not known for this project.">
                            —<span style={{ color: "var(--i-text-faint)" }}> n/a</span>
                          </span>
                        ) : c.basis === "allocations" ? (
                          <>
                            {c.effective.toFixed(1)}
                            <span style={{ color: "var(--i-text-faint)" }}>/{c.raw.toFixed(1)}</span>
                          </>
                        ) : (
                          <>
                            {c.effective.toFixed(1)}
                            <span style={{ color: "var(--i-amber)" }} title="Inferred from who is assigned, not from allocations."> est</span>
                          </>
                        )}
                      </span>
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
            <Bottom title="Release Composition" href="/scope" shoot="cr-surf-scope" hue={HUE.reality}>
              <Composition data={data} scenario={scenario} />
            </Bottom>

            {/* A DECISION IS NOT A GATE, and the difference is the whole
                point of this panel. V5 led with the backlog — 39 in the
                largest type — which tells you the least useful true thing on
                the surface. The CONSEQUENCE leads now: two decisions are
                holding delivery, for eight modelled days. The backlog is
                still here, still exact, and now correctly sized as context. */}
            <Bottom title="Decisions Summary" href="/decisions" shoot="cr-surf-decisions" hue={HUE.choices}>
              <div className="flex shrink-0 items-baseline gap-[9px]">
                <span
                  className="i-readout leading-none"
                  style={{
                    color: r.choices.gating > 0 ? "var(--i-amber)" : HUE.outcome,
                    fontSize: 30,
                    letterSpacing: "-0.015em",
                    textShadow: `0 0 20px color-mix(in srgb, ${r.choices.gating > 0 ? "var(--i-amber)" : HUE.outcome} 26%, transparent)`,
                  }}
                >
                  {r.choices.gating}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[10px] uppercase leading-[12px] tracking-[0.05em]"
                    style={{ color: "var(--i-text-soft)" }}
                  >
                    holding delivery
                  </span>
                  <span className="block truncate text-[10px] leading-[12px]" style={{ color: "var(--i-text-faint)" }}>
                    <span className="i-readout" style={{ color: "var(--i-amber)" }}>
                      {r.choices.modelledDelayDays}d
                    </span>{" "}
                    modelled
                  </span>
                </span>
              </div>
              <div className="mt-auto grid shrink-0 grid-cols-2 gap-[9px] pt-[10px]">
                <Tally value={String(r.choices.open)} label="Open decisions" tone="var(--i-text-soft)" />
                <Tally value={String(r.choices.dueSoon)} label="Due in 14d" tone="var(--i-text-soft)" />
              </div>
              <Door href="/decisions" label="View decisions" tone="var(--i-amber)" />
            </Bottom>

            {/* FORECAST CONFIDENCE — the one panel whose real history matches
                the layout's line chart exactly: `Report.confidenceAtTarget`,
                plotted at each report's own `generatedAt`. A project nobody
                has reported on is ABSENT, never drawn flat at zero. */}
            <Bottom title="Forecast Confidence" href="/forecast" shoot="cr-surf-forecast" hue={HUE.outcome}>
              {r.outcome.confidence !== null ? (
                <>
                  <p className="flex shrink-0 items-baseline gap-[8px]">
                    <span
                      data-shoot="cr-confidence-now"
                      className="i-readout leading-none"
                      style={{
                        color: outcomeHue,
                        fontSize: 30,
                        letterSpacing: "-0.015em",
                        textShadow: `0 0 20px color-mix(in srgb, ${outcomeHue} 26%, transparent)`,
                      }}
                    >
                      {r.outcome.confidence}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[10px] uppercase leading-[12px] tracking-[0.05em]"
                        style={{ color: "var(--i-text-soft)" }}
                      >
                        {r.outcome.gatedBy ?? "overall"}
                      </span>
                      <span className="block truncate text-[10px] leading-[12px]" style={{ color: "var(--i-text-faint)" }}>
                        simulated now, vs its target
                      </span>
                    </span>
                    {r.outcome.confidenceTrendPts !== null && (
                      <span
                        data-shoot="cr-confidence-trend"
                        className="i-readout shrink-0 rounded-[3px] px-[5px] py-[2px] text-[10px]"
                        style={{
                          color: r.outcome.confidenceTrendPts >= 0 ? HUE.outcome : "var(--i-red)",
                          background: `color-mix(in srgb, ${r.outcome.confidenceTrendPts >= 0 ? HUE.outcome : "var(--i-red)"} 12%, transparent)`,
                        }}
                      >
                        {r.outcome.confidenceTrendPts > 0 ? "+" : ""}
                        {r.outcome.confidenceTrendPts} pts
                      </span>
                    )}
                  </p>
                  <div className="min-h-0 flex-1 pt-[7px]">
                    {r.outcome.confidenceHistory.length > 0 ? (
                      <ConfidenceLines series={r.outcome.confidenceHistory} gatingId={r.outcome.gatedByScopeId} now={r.time.now} />
                    ) : (
                      <p data-shoot="cr-confidence-nohistory" className="text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                        No report has stored a confidence yet, so there is no history to draw.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                // NO TARGET IS AN ANSWER, and it deserves to be presented as
                // one. The chart is not the headline here — the reason the
                // number is unavailable is. Everything below it is context,
                // and it is explicitly labelled as other projects' history so
                // it can never be mistaken for the missing figure.
                <>
                  <div className="shrink-0">
                    <p
                      data-shoot="cr-confidence-now"
                      className="i-readout leading-none"
                      style={{ fontSize: 27, letterSpacing: "-0.015em", color: "var(--i-text-faint)" }}
                    >
                      No target
                    </p>
                    <p className="pt-[6px] text-[10.5px] leading-[13px]" style={{ color: "var(--i-text-soft)" }}>
                      {r.outcome.gatedBy ? (
                        <>
                          <span style={{ color: outcomeHue }}>{r.outcome.gatedBy}</span> lands last and has no target date.
                        </>
                      ) : (
                        "Nothing has been simulated against a target."
                      )}
                    </p>
                    <p className="pt-[2px] text-[10px] leading-[12px]" style={{ color: "var(--i-text-faint)" }}>
                      Set one on Forecast to measure confidence.
                    </p>
                  </div>
                  {r.outcome.confidenceHistory.length > 0 && (
                    <div className="mt-auto flex min-h-0 flex-1 flex-col pt-[7px]">
                      <p className="shrink-0 pb-[3px] text-[9px] uppercase tracking-[0.09em]" style={{ color: "var(--i-text-faint)" }}>
                        Other projects, as reported
                      </p>
                      <div className="min-h-0 flex-1">
                        <ConfidenceLines series={r.outcome.confidenceHistory} gatingId={r.outcome.gatedByScopeId} now={r.time.now} />
                      </div>
                    </div>
                  )}
                </>
              )}
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
                      className="flex items-baseline justify-between gap-[8px] rounded-[3px] hover:bg-[rgba(243,240,230,0.035)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10.5px] leading-[15px]" style={{ color: "var(--i-text-soft)" }}>
                          {d.subject}
                        </span>
                        {d.kind !== "waits_on" && (
                          <span
                            data-shoot="cr-dep-consequence"
                            className="block truncate text-[9.5px] leading-[12px]"
                            style={{ color: "var(--i-amber)", opacity: 0.82 }}
                          >
                            {consequenceOf(d.detail)}
                          </span>
                        )}
                      </span>
                      {/* ACCEPTED is a state, not a measurement, so it reads
                          as a quiet chip. A real quantity — "2 downstream" —
                          reads as a number, because that is what it is. */}
                      <span className="flex shrink-0 items-center gap-[7px]">
                        {d.quantity ? (
                          <span
                            className="i-readout text-[10.5px]"
                            style={{ color: d.kind === "shared_upstream" ? "var(--i-amber)" : "var(--i-mint)" }}
                          >
                            {d.quantity}
                          </span>
                        ) : (
                          <span
                            className="rounded-[3px] px-[5px] py-[1px] text-[9px] uppercase tracking-[0.06em]"
                            style={{
                              color: "var(--i-mint)",
                              background: "color-mix(in srgb, var(--i-mint) 12%, transparent)",
                            }}
                          >
                            declared
                          </span>
                        )}
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
                {/* THE CONSEQUENCE LEADS. V5 put the sentence first and the
                    quantity last, so the eye had to parse "App Store
                    submission timeline decision" before learning it costs
                    four days. The magnitude is now the first thing on the
                    row, in its own unit, and the subject reads after it. */}
                {r.constraints.slice(0, 5).map((c) => {
                  // "4d modelled · JSA" → magnitude "4d", unit "modelled",
                  // and the project it holds. The magnitude leads, its unit
                  // rides beside it so "0.1" is never stranded without "FTE",
                  // and the project it is holding closes the row.
                  const [measure, ...rest] = c.quantity.split(" · ");
                  const holding = rest.join(" · ");
                  const [mag, ...unitWords] = measure.split(" ");
                  const unit = unitWords.join(" ");
                  return (
                    <Link
                      key={c.id}
                      href={c.href}
                      data-shoot="cr-constraint"
                      className="flex items-baseline gap-[8px] rounded-[3px] hover:bg-[color-mix(in_srgb,var(--i-amber)_7%,transparent)]"
                      title={`${c.detail} — ${c.label}`}
                    >
                      <span className="w-[56px] shrink-0 whitespace-nowrap text-right leading-[16px]">
                        <span className="i-readout text-[12.5px]" style={{ color: "var(--i-amber)" }}>
                          {mag}
                        </span>
                        {unit && (
                          <span className="text-[9px]" style={{ color: "color-mix(in srgb, var(--i-amber) 62%, var(--i-text-faint))" }}>
                            {" "}
                            {unit}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10.5px] leading-[16px]" style={{ color: "var(--i-text-soft)" }}>
                        {c.detail}
                      </span>
                      {holding && (
                        <span className="shrink-0 text-[9px] uppercase leading-[16px] tracking-[0.05em]" style={{ color: "var(--i-text-faint)" }}>
                          {holding}
                        </span>
                      )}
                      <Dot colour="var(--i-amber)" />
                    </Link>
                  );
                })}
              </div>
            </RailPanel>

            <RailPanel
              title="What Changed"
              hue="var(--i-amber)"
              shoot="cr-activity"
              door={{ href: "/timeline", label: "View Timeline", tone: "var(--i-violet)" }}
            >
              {/* Less log, more instrument: the event's FAMILY is a colour
                  chip rather than a diamond glyph, and the age sits in a
                  fixed right column so three rows scan as a column of times
                  instead of three ragged sentences. */}
              <div className="flex shrink-0 flex-col gap-[3px] pt-[6px]">
                {activityRows.map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    data-shoot="cr-activity-row"
                    className="flex items-center gap-[8px] rounded-[3px] leading-[15px] hover:bg-[rgba(243,240,230,0.035)]"
                    title={a.note ? `${a.title} — ${a.note}` : a.title}
                  >
                    <span
                      aria-hidden
                      className="h-[10px] w-[2px] shrink-0 rounded-full"
                      style={{ background: familyColour(a.family) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
                      {a.title}
                      {a.scopeLabel && <span style={{ color: "var(--i-text-faint)" }}> · {a.scopeLabel}</span>}
                      {a.count > 1 && <span style={{ color: "var(--i-text-faint)" }}> ×{a.count}</span>}
                    </span>
                    <span className="i-readout w-[46px] shrink-0 text-right text-[10px]" style={{ color: "var(--i-text-faint)" }}>
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
          label="Timeline span"
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

// ── MATERIAL ───────────────────────────────────────────────────────────
//
// Three levels, and the material is what separates them:
//
//   L1  the working surface — the brightest ground, the strongest border
//   L2  readings, constraints, dependencies — a panel ground with a hairline
//       inner highlight along its top edge, the way a machined face catches
//       light
//   L3  supporting detail — no ground of its own, quieter type
//
// The highlight is one pixel at 4% and the shadow is a lift, not a drop.
// Anything heavier reads as a web card rather than an instrument face.
const FACE = {
  background: "linear-gradient(180deg, #171d22 0%, var(--i-panel) 62%)",
  border: "1px solid var(--i-border-strong)",
  boxShadow: "inset 0 1px 0 rgba(243,240,230,0.045), 0 1px 2px rgba(0,0,0,0.45)",
} as const;

/** A panel that belongs to one domain wears a trace of it: a tinted wash
    down from its top edge and a border warmed towards the hue. */
const tinted = (hue: string, soft: string) => ({
  background: `linear-gradient(180deg, ${soft} 0%, rgba(0,0,0,0) 54px), linear-gradient(180deg, #171d22 0%, var(--i-panel) 62%)`,
  border: `1px solid color-mix(in srgb, ${hue} 30%, var(--i-border-strong))`,
  boxShadow: "inset 0 1px 0 rgba(243,240,230,0.05), 0 1px 2px rgba(0,0,0,0.45)",
});

function Dot({ colour }: { colour: string }) {
  return (
    <span
      className="h-[6px] w-[6px] shrink-0 rounded-full"
      style={{ background: colour, boxShadow: `0 0 5px color-mix(in srgb, ${colour} 55%, transparent)` }}
    />
  );
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
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-[8px] px-[15px] pb-0 pt-[11px] transition-[border-color,box-shadow] duration-200"
      style={{
        background: `linear-gradient(180deg, ${HUE_SOFT[hue]} 0%, rgba(0,0,0,0) 62%), linear-gradient(180deg, #171d22 0%, var(--i-panel) 62%)`,
        border: `1px solid color-mix(in srgb, ${c} 46%, var(--i-border-strong))`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${c} 22%, rgba(243,240,230,0.05)), 0 1px 3px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-[8px]">
        <span
          className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold"
          style={{ background: c, color: "var(--i-void)", boxShadow: `0 0 9px color-mix(in srgb, ${c} 38%, transparent)` }}
        >
          {index}
        </span>
        <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: c }}>
          {label}
        </span>
      </div>
      {/* LEVEL 3. The question the instrument answers, kept because the five
          of them read as one sentence across the row — but kept quiet. */}
      <p className="shrink-0 truncate pt-[4px] text-[10.5px] leading-[13px]" style={{ color: "var(--i-text-faint)" }}>
        {question}
      </p>

      {/* THE NUMBER FIRST. The primary is the largest thing in the tile and
          carries the full hue; the second figure is a real reading but a
          smaller, dimmer one, so the eye lands on the headline and only then
          finds the qualifier beside it. Both were 29px in V5, which is why
          neither of them led. */}
      <div className="flex min-w-0 shrink-0 items-baseline gap-[16px] pt-[6px]">
        <span className="min-w-0">
          <span
            data-shoot={`${shoot}-primary`}
            className="i-readout block truncate leading-none"
            style={{
              color: aTone ?? c,
              fontSize: a.length > 7 ? 22 : 33,
              letterSpacing: "-0.015em",
              textShadow: `0 0 22px color-mix(in srgb, ${aTone ?? c} 26%, transparent)`,
            }}
          >
            {a}
          </span>
          <span
            className="block truncate pt-[5px] text-[10px] uppercase leading-[12px] tracking-[0.05em]"
            style={{ color: "var(--i-text-soft)" }}
          >
            {aLabel}
          </span>
        </span>
        <span className="min-w-0">
          <span
            data-shoot={`${shoot}-second`}
            className="i-readout block truncate leading-none"
            style={{
              color: bTone ?? `color-mix(in srgb, ${c} 74%, var(--i-text-faint))`,
              fontSize: b.length > 7 ? 15 : 21,
              letterSpacing: "-0.01em",
            }}
          >
            {b}
          </span>
          <span className="block truncate pt-[5px] text-[10px] leading-[12px]" style={{ color: "var(--i-text-faint)" }}>
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
          not a claim; a flat line would be. The trace sits IN the tile's
          floor, bleeding to all three edges, so it reads as part of the
          instrument face rather than a chart parked on top of it. */}
      <div className="-mx-[15px] mt-auto h-[30px] shrink-0">
        {series && series.length > 0 ? (
          <Trace points={series} colour={c} shoot={`${shoot}-spark`} />
        ) : (
          // Not empty, and not a claim: a hairline in the domain's colour,
          // which says "this instrument has a floor" without drawing data
          // that does not exist.
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, color-mix(in srgb, ${c} 7%, transparent) 100%)`,
              borderTop: `1px solid color-mix(in srgb, ${c} 14%, transparent)`,
            }}
          />
        )}
      </div>
    </Link>
  );
}

function Trace({ points, colour, shoot }: { points: Point[]; colour: string; shoot: string }) {
  const W = 100;
  const H = 30;
  const PAD = 5;
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
      <defs>
        <linearGradient id={`${shoot}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.34} />
          <stop offset="100%" stopColor={colour} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      {points.length === 1 ? (
        <circle cx={W / 2} cy={H / 2} r={1.6} fill={colour} vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${shoot}-fill)`} />
          <polyline
            points={line}
            fill="none"
            stroke={colour}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* The last reading, marked. It is the one point on the trace the
              rest of the page is actually about. */}
          <circle
            cx={x(points.length - 1)}
            cy={y(points[points.length - 1].value)}
            r={1.8}
            fill={colour}
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
        ...tinted(hue, `color-mix(in srgb, ${hue} 7%, transparent)`),
        flex: grow ? `${typeof grow === "string" ? grow : 1} 1 0%` : undefined,
      }}
    >
      <header className="shrink-0">
        <div className="flex items-center gap-[7px]">
          {/* The panel's domain, stated as a mark before its name — the same
              relationship the numbered badge has to a telemetry tile. */}
          <span
            aria-hidden
            className="h-[11px] w-[2px] shrink-0 rounded-full"
            style={{ background: hue, boxShadow: `0 0 6px color-mix(in srgb, ${hue} 45%, transparent)` }}
          />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: hue }}>
            {title}
          </h2>
          <div className="flex-1" />
          {dot && <Dot colour={dot} />}
        </div>
        {sub && (
          <p className="truncate pt-[4px] text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
            {sub}
          </p>
        )}
      </header>
      {children}
      {door && <Door href={door.href} label={door.label} tone={door.tone} />}
    </section>
  );
}

// A DOOR, not a call to action. It is the quietest object on the panel
// until you go near it: a tinted well with a hairline in the panel's own
// colour, which lights up rather than changing shape. The outlined pill it
// replaces read as a form button on every surface it appeared on.
function Door({ href, label, tone }: { href: string; label: string; tone: string }) {
  return (
    <Link
      href={href}
      data-shoot="cr-panel-door"
      className="group/door mt-[9px] flex shrink-0 items-center justify-center gap-[6px] rounded-[5px] py-[5px] text-[10.5px] font-medium tracking-[0.02em] transition-[background,border-color,color] duration-150"
      style={{
        background: `color-mix(in srgb, ${tone} 9%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 34%, transparent)`,
        color: `color-mix(in srgb, ${tone} 88%, var(--i-text))`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${tone} 18%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${tone} 62%, transparent)`;
        e.currentTarget.style.color = tone;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${tone} 9%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${tone} 34%, transparent)`;
        e.currentTarget.style.color = `color-mix(in srgb, ${tone} 88%, var(--i-text))`;
      }}
    >
      {label}
      <span aria-hidden style={{ opacity: 0.7 }}>
        →
      </span>
    </Link>
  );
}

function Bottom({
  title,
  href,
  shoot,
  hue,
  children,
}: {
  title: string;
  href: string;
  shoot: string;
  /** The domain this analysis surface belongs to. It tints the face and
      marks the heading, so the bottom row reads in the same colour language
      as the telemetry above it. */
  hue: string;
  children: ReactNode;
}) {
  return (
    <section
      data-shoot={shoot}
      className="flex min-h-0 flex-col overflow-hidden rounded-[8px] px-[15px] pb-[12px] pt-[11px]"
      style={tinted(hue, `color-mix(in srgb, ${hue} 6%, transparent)`)}
    >
      <header className="flex shrink-0 items-center gap-[7px] pb-[8px]">
        <span
          aria-hidden
          className="h-[11px] w-[2px] shrink-0 rounded-full"
          style={{ background: hue, boxShadow: `0 0 6px color-mix(in srgb, ${hue} 45%, transparent)` }}
        />
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: hue }}>
          {title}
        </h2>
        <div className="flex-1" />
        <Link
          href={href}
          className="shrink-0 text-[10px] transition-colors hover:text-[var(--i-text)]"
          style={{ color: "var(--i-text-faint)" }}
        >
          Open →
        </Link>
      </header>
      {children}
    </section>
  );
}

function Tally({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    // LEVEL 3. A tally is context beneath a headline, so it sits in a well
    // rather than on the panel face — the recess is what tells the eye it is
    // supporting detail without having to shrink the number to illegibility.
    <div
      className="min-w-0 rounded-[4px] px-[8px] py-[6px]"
      style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(243,240,230,0.05)" }}
    >
      <div className="i-readout text-[17px] leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="truncate pt-[4px] text-[9.5px] leading-tight" style={{ color: "var(--i-text-faint)" }}>
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
    return { scopeId: s.scopeId, id: s.scopeId, name: s.name, days: comp.loadDays, features: comp.engaged.length };
  });
  const named = disambiguate(parts);
  const total = parts.reduce((n, p) => n + p.days, 0);

  const R = 34;
  const T = 12;
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
          <span
            className="i-readout text-[20px] leading-none"
            style={{ color: "var(--i-text)", letterSpacing: "-0.015em" }}
          >
            {total.toFixed(0)}d
          </span>
          <span className="pt-[3px] text-[8.5px] uppercase tracking-[0.09em]" style={{ color: "var(--i-text-faint)" }}>
            remaining
          </span>
        </div>
      </div>
      <div className="i-noscrollbar flex min-w-0 flex-1 flex-col justify-center gap-[5px] overflow-y-auto">
        {named.map((p, i) => (
          <div key={p.id} className="flex items-baseline gap-[7px]">
            {/* The chip is the arc, at legend scale — same colour, same
                rounding — so the eye pairs a name with its segment without
                counting round the ring. */}
            <span
              className="h-[8px] w-[3px] shrink-0 rounded-full"
              style={{ background: SERIES[i % 4], boxShadow: `0 0 5px color-mix(in srgb, ${SERIES[i % 4]} 50%, transparent)` }}
            />
            <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: "var(--i-text-soft)" }}>
              {p.display}
            </span>
            <span className="i-readout shrink-0 text-[10.5px]" style={{ color: "var(--i-text)" }}>
              {p.days.toFixed(1)}
              <span style={{ color: "var(--i-text-faint)" }}>d</span>
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
