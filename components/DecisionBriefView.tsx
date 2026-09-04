"use client";

import React from "react";
import Link from "@/components/instrument/SignalLink";
import type { DecisionBriefV1, SourceStamp } from "@/lib/reports/decisionBrief";
import { briefPayloadFingerprint } from "@/lib/reports/decisionBriefRender";

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "MISSING";
const fte = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

function Stamp({ value }: { value: SourceStamp }) {
  return (
    <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">
      {value.owner} · {value.temporalRole} · as of {date(value.asOf)} · {value.currentness}
    </span>
  );
}

function Section({ title, source, children }: { title: string; source?: SourceStamp; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--i-border)] py-6 first:border-t-0 first:pt-0 break-inside-avoid-page">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] text-[var(--i-text)]">{title}</h2>
        {source && <Stamp value={source} />}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--i-text-faint)]">{children}</p>;
}

export default function DecisionBriefView({ brief }: { brief: DecisionBriefV1 }) {
  const project = brief.identity.project.value;
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  const capacity = brief.movable.capacity.value;
  return (
    <article
      className="decision-brief-print mx-auto max-w-[920px] text-[var(--i-text)]"
      data-brief-version={brief.version}
      data-brief-fingerprint={briefPayloadFingerprint(brief)}
    >
      <header className="mb-6 border-b border-[var(--i-border)] pb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${brief.identity.mode === "reality" ? "border-[var(--i-mint)] text-[var(--i-mint)]" : "border-[var(--i-violet)] text-[var(--i-violet)]"}`}>
            {brief.identity.mode}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">
            Immutable {brief.version} · {briefPayloadFingerprint(brief)}
          </span>
        </div>
        <h1 className="font-display text-3xl">{project.name} — Decision Brief</h1>
        <p className="mt-2 text-xs text-[var(--i-text-faint)]">Generated {date(brief.identity.generatedAt)}{brief.identity.scenarioId ? ` · scenario ${brief.identity.scenarioId}` : ""}</p>
      </header>

      <Section title="As-of / trust">
        <div className="grid gap-2 sm:grid-cols-2">
          {brief.identity.sourceSnapshots.map((item, index) => (
            <div key={`${item.owner}-${index}`} className="rounded-md border border-[var(--i-border)] bg-[var(--i-panel)] px-3 py-2">
              <div className="text-[11px] font-medium">{item.owner}</div>
              <Stamp value={item} />
              {item.sourceId && <div className="mt-1 truncate font-mono text-[9px] text-[var(--i-text-faint)]">{item.sourceId}</div>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Headline" source={brief.headline.likelyWindow.source}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--i-signal)] bg-[var(--i-panel)] p-4 sm:col-span-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Live likely window</div>
            <div className="mt-1 font-display text-2xl">{date(window.likely)}</div>
            <div className="mt-1 text-xs text-[var(--i-text-faint)]">{date(window.earliest)} – {date(window.latest)}</div>
          </div>
          <div className="rounded-lg border border-[var(--i-border)] bg-[var(--i-panel)] p-4">
            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Target confidence</div>
            <div className="mt-1 font-display text-2xl">{brief.headline.confidenceAtTarget.value === null ? "—" : `${brief.headline.confidenceAtTarget.value}%`}</div>
            <div className="mt-1 text-xs text-[var(--i-text-faint)]">target {date(brief.headline.targetDate.value)}</div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed">{brief.headline.keyReason.value}</p>
        <p className="mt-1 text-xs text-[var(--i-text-faint)]">
          {movement ? `Since ${movement.comparedToReportId}: ${Math.abs(movement.days)} day${Math.abs(movement.days) === 1 ? "" : "s"} ${movement.days > 0 ? "later" : movement.days < 0 ? "earlier" : "unchanged"}.` : "No prior saved brief; no trend claim."}
        </p>
      </Section>

      <Section title="What changed" source={brief.changes.audit.source}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider">Audit delta</h3>
            <p className="mb-2 text-[10px] text-[var(--i-text-faint)]">{brief.changes.audit.value.priorRunId ? `${brief.changes.audit.value.priorRunId} → ${brief.changes.audit.value.currentRunId ?? "MISSING"}` : brief.changes.audit.value.currentRunId ? `First comparable Audit · ${brief.changes.audit.value.currentRunId}` : "Audit comparison MISSING"}</p>
            {brief.changes.audit.value.newFindings.map((finding) => {
              const ref = brief.evidence.references.value.find((item) => item.findingId === finding.id);
              return <Link key={finding.id} href={ref?.href ?? "/audit"} className="mb-2 block rounded border border-[var(--i-border)] p-2 text-xs hover:border-[var(--i-signal)]">+ {finding.title}<span className="ml-2 text-[9px] uppercase text-[var(--i-text-faint)]">{ref?.grounding ?? "none"}</span></Link>;
            })}
            {!brief.changes.audit.value.newFindings.length && <Empty>No new Findings in the comparable delta.</Empty>}
            {brief.changes.audit.value.resolvedFindings.map((finding) => <div key={finding.id} className="mt-2 text-xs text-[var(--i-mint)]">✓ {finding.title}</div>)}
          </div>
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider">Delivery delta</h3>
            {brief.changes.delivery.value.shipped.map((item) => <Link key={item.identifier} href={item.href} className="mb-2 block text-xs text-[var(--i-signal)] hover:underline">{item.identifier} · {item.title}</Link>)}
            {!brief.changes.delivery.value.shipped.length && <Empty>No shipped work supported by the canonical delta.</Empty>}
            {[...brief.changes.currentness.value.missingSources, ...brief.changes.currentness.value.warnings].map((warning) => <div key={warning} className="mt-2 text-xs text-[var(--i-amber)]">⚠ {warning}</div>)}
          </div>
        </div>
      </Section>

      <Section title="What needs a call" source={brief.calls.decisions.source}>
        <div className="space-y-3">
          {brief.calls.decisions.value.map((decision) => (
            <div key={decision.id} className="rounded-lg border border-[var(--i-border)] bg-[var(--i-panel)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={decision.href} className="text-sm font-medium hover:text-[var(--i-signal)]">{decision.title}</Link>
                <span className={`text-[9px] font-semibold uppercase tracking-wider ${decision.gated ? "text-[var(--i-red)]" : "text-[var(--i-amber)]"}`}>{decision.gated ? "Gated" : "Ungated · 0 modeled days"}</span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--i-text-faint)]">Owner {decision.owner ?? "UNASSIGNED"} · needed by {date(decision.neededBy)} · {decision.evidenceCount} evidence reference{decision.evidenceCount === 1 ? "" : "s"}</p>
              {decision.gate && <div className="mt-3 border-l-2 border-[var(--i-red)] pl-3 text-xs"><Link href={decision.targetScopeHref!} className="text-[var(--i-signal)]">Target {decision.gate.targetScopeName}</Link><div className="mt-1">{fte(decision.modeledDelay.low)} / {fte(decision.modeledDelay.likely)} / {fte(decision.modeledDelay.high)} days low / likely / high</div><div className="mt-1 text-[var(--i-text-faint)]">{decision.gate.dependency}</div></div>}
            </div>
          ))}
          {!brief.calls.decisions.value.length && <Empty>No first-class open Decisions.</Empty>}
        </div>
      </Section>

      <Section title="What can move" source={brief.movable.capacity.source}>
        {capacity.availability === "available" ? (
          <div>
            <p className="text-sm">{fte(capacity.namedRawFte!)} raw FTE → {fte(capacity.namedEffectiveFte!)} effective FTE → {fte(capacity.forecastEffectiveFte)} Forecast FTE</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{capacity.contributors.map((person) => <div key={person.personId} className="rounded border border-[var(--i-border)] p-2 text-xs"><span className="font-medium">{person.name}</span><span className="float-right tabular-nums">{fte(person.effectiveFte)} effective</span></div>)}</div>
          </div>
        ) : <div className="rounded-lg border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-4 text-sm"><strong>Named Capacity {capacity.availability.toUpperCase()}.</strong> Forecast uses {fte(capacity.forecastEffectiveFte)} FTE from {capacity.source}; Reports makes no named-staffing claim.</div>}
        <div className="mt-4"><Link href={capacity.href} className="text-xs text-[var(--i-signal)] hover:underline">Open Capacity →</Link></div>
        <h3 className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider">Existing Forecast scenarios</h3>
        {brief.movable.scenarioOptions.value.map((option) => <div key={option.id} className="mb-2 flex flex-wrap justify-between gap-2 border-b border-[var(--i-border)] pb-2 text-xs"><span>{option.label}</span><span className="tabular-nums text-[var(--i-text-faint)]">{date(option.likelyDate)} · {Math.abs(option.deltaDays)}d {option.deltaDays < 0 ? "sooner" : option.deltaDays > 0 ? "later" : "unchanged"}</span></div>)}
        {!brief.movable.scenarioOptions.value.length && <Empty>No owner-provided scenario consequence is available.</Empty>}
      </Section>

      <Section title="Timeline" source={brief.timeline.currentForecast.source}>
        <Link href={brief.timeline.currentForecast.value.href} className="block rounded-lg border border-[var(--i-signal)] bg-[var(--i-panel)] p-4">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--i-mint)]">Current Forecast · LIVE</div>
          <div className="mt-1 font-display text-lg">Likely {date(brief.timeline.currentForecast.value.likelyDate)}</div>
        </Link>
        <div className="mt-4 text-sm">Next committed/current milestone: {brief.timeline.nextMilestone.value ? `${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "MISSING"}</div>
        {brief.timeline.conflicts.value.map((conflict) => <div key={conflict.id} className="mt-2 text-xs text-[var(--i-red)]">Conflict · {conflict.title} was planned for {date(conflict.date)}</div>)}
      </Section>

      <Section title="Evidence / provenance / data quality" source={brief.evidence.references.source}>
        <div className="space-y-2">{brief.evidence.references.value.map((reference) => <Link key={reference.findingId} href={reference.href} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--i-border)] p-2 text-xs hover:border-[var(--i-signal)]"><span>{reference.title}</span><span className={reference.grounding === "passage" ? "text-[var(--i-mint)]" : "text-[var(--i-amber)]"}>{reference.grounding} · {reference.currentness}</span></Link>)}</div>
        {!brief.evidence.references.value.length && <Empty>Audit evidence references MISSING.</Empty>}
        {brief.evidence.warnings.value.map((warning) => <div key={warning} className="mt-2 text-xs text-[var(--i-amber)]">⚠ {warning}</div>)}
        <div className="mt-4 rounded border border-[var(--i-border)] p-3 text-xs">Forecast boundary: {brief.boundaries.findingsForecastEffect.value.unacceptedFindingCount} unaccepted Finding{brief.boundaries.findingsForecastEffect.value.unacceptedFindingCount === 1 ? "" : "s"} → <strong>{brief.boundaries.findingsForecastEffect.value.modeledBaselineWorkItems} baseline work items</strong>.</div>
      </Section>

      <Section title="Caveats / missing decision inputs" source={brief.caveats.source}>
        <div className="space-y-2">{brief.caveats.value.map((caveat) => <div key={caveat.code} className="rounded border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3 text-xs"><strong>{caveat.code}</strong> · {caveat.message}</div>)}</div>
        {!brief.caveats.value.length && <Empty>No explicit caveats from owner reads.</Empty>}
      </Section>
    </article>
  );
}
