"use client";

import type React from "react";
import Link from "@/components/instrument/SignalLink";
import type { DecisionBriefV1, SourceStamp } from "@/lib/reports/decisionBrief";
import { moduleDefinition, type BriefModuleConfig, type BriefModuleId, type BriefRecipeV1 } from "@/lib/reports/composer";
import { buildBriefPresentation, sourceForModule } from "@/lib/reports/presentation";
import { formatDateOnly, formatInstant, toInstant } from "@/lib/time/dateContract";
import { FORECAST_PERCENTILE_COPY } from "@/lib/forecast/claims";
import { capabilityEstimatePresentation } from "@/lib/reports/capabilityEstimatePresentation";
import styles from "./ReportsComposer.module.css";

const date = (iso: string | null) => iso ? formatDateOnly(iso, { month: "short", day: "numeric", year: "numeric" }) : "MISSING";
const instantDate = (iso: string) => formatInstant(toInstant(iso), {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
});
const n = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const tone: Record<string, string> = { reality: "#45bfd2", choice: "#9885ff", capacity: "#e5b84b", outcome: "#42d7aa", time: "#7d9eff", attention: "#e5b84b" };

function Stamp({ source }: { source: SourceStamp }) {
  return <div className={styles.stamp}>{source.owner} · frozen snapshot · source {source.currentness} at generation · source as of {instantDate(source.asOf)}</div>;
}

function SnapshotStamp({ brief, source }: { brief: DecisionBriefV1; source: SourceStamp }) {
  return <div className={styles.stamp}>Snapshot generated {instantDate(brief.identity.generatedAt)} · source {source.currentness} at generation · source as of {instantDate(source.asOf)}</div>;
}

function ForecastAssumptions({ brief }: { brief: DecisionBriefV1 }) {
  const assumptions = brief.forecast?.assumptions;
  if (!assumptions) return <div className={styles.warning} style={{ marginTop: 10 }}>Forecast assumptions unavailable in this legacy snapshot; they are not backfilled from the current model.</div>;
  return <details style={{ marginTop: 10 }} open>
    <summary className={styles.label}>Forecast assumptions · {assumptions.version}</summary>
    <ul className={styles.list} style={{ marginTop: 7 }}>
      {assumptions.items.map((item) => <li className={styles.listItem} key={item.id}><strong>{item.label}</strong><span className={styles.muted}>{item.detail}</span></li>)}
    </ul>
  </details>;
}

function CapabilityEstimateBasis({ brief }: { brief: DecisionBriefV1 }) {
  const records = brief.forecast?.basis?.capabilityEstimates;
  if (!records?.length) return null;
  return <section className={styles.briefModule} data-module-id="forecast-estimate-provenance" aria-labelledby="forecast-estimate-provenance-heading">
    <div className={styles.briefModuleContent} style={{ paddingTop: 14 }}>
      <h2 className={styles.moduleTitle} id="forecast-estimate-provenance-heading">Frozen capability estimate basis</h2>
      <div className={styles.list} style={{ marginTop: 7 }}>
        {records.map((record) => {
          const presentation = capabilityEstimatePresentation(record);
          const range = presentation.range ? `${n(presentation.range.low)} / ${n(presentation.range.likely)} / ${n(presentation.range.high)} developer-days` : "range unavailable";
          const heading = record.auditHref ? <Link href={record.auditHref}>{record.capabilityName}</Link> : record.capabilityName;
          return <div className={styles.listItem} key={`${record.scopeId}:${record.capabilityId}:${presentation.estimateId}`}>
            <span>
              <strong>{heading}</strong>
              <small style={{ display: "block" }}>{presentation.authorityLabel} · {presentation.basisLabel} · {range} · source {presentation.sourceDate ? date(presentation.sourceDate) : "date unavailable"}</small>
              {presentation.reviewSummary && <small className={presentation.reviewRequired ? styles.warning : styles.muted} style={{ display: "block", marginTop: 5 }}>{presentation.reviewSummary}</small>}
              {presentation.interpretation && <small style={{ display: "block", marginTop: 5 }}><strong>Reviewed interpretation:</strong> {presentation.interpretation}</small>}
              {record.review && <small style={{ display: "block" }}>Reviewer {presentation.reviewer ?? "unavailable"} · reviewed {presentation.reviewedAt ? date(presentation.reviewedAt) : "date unavailable"}</small>}
              {record.review && <small style={{ display: "block" }}>Covered tickets: {presentation.coveredItemIds.length ? presentation.coveredItemIds.join(", ") : "none"} · Additional tickets retained separately: {presentation.additionalItemIds.length ? presentation.additionalItemIds.join(", ") : "none"}</small>}
              <small style={{ display: "block", marginTop: 5 }}>Original statement: “{presentation.originalQuote}”</small>
              <small style={{ display: "block" }}>Raw assertion: {presentation.rawAssertion} · immutable snapshot {presentation.contextSnapshotId}</small>
            </span>
            <strong>{record.review ? (presentation.usedInSimulation ? `${presentation.coveredItemIds.length} covered ticket ${presentation.coveredItemIds.length === 1 ? "estimate" : "estimates"} replaced` : "Evidence only; ticket rollup used") : `${record.replacedItemIds.length} ticket ${record.replacedItemIds.length === 1 ? "estimate" : "estimates"} replaced`}</strong>
          </div>;
        })}
      </div>
    </div>
  </section>;
}

function ModuleContent({ id, brief, recipe }: { id: BriefModuleId; brief: DecisionBriefV1; recipe: BriefRecipeV1 }) {
  const p = buildBriefPresentation(brief, recipe);
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  const forecastSource = brief.headline.likelyWindow.source;
  const forecastTone = forecastSource.currentness === "stale" ? "#e5b84b" : "#42d7aa";
  switch (id) {
    case "delivery-outlook": return <div><div className={styles.headlineGrid}><div className={styles.metric} style={{ "--tone": forecastTone } as React.CSSProperties}><div className={styles.label}>P50 snapshot outcome</div><div className={styles.metricValue}>{date(window.likely)}</div><div className={styles.metricSub}>P10–P90 · {date(window.earliest)} – {date(window.latest)} · middle 80%</div></div><div className={styles.metric}><div className={styles.label}>Target</div><div className={styles.metricValue}>{date(brief.headline.targetDate.value)}</div><div className={styles.metricSub}>Planning target</div></div><div className={styles.metric}><div className={styles.label}>Target simulated frequency</div><div className={styles.metricValue}>{brief.headline.confidenceAtTarget.value === null ? "—" : `${brief.headline.confidenceAtTarget.value}%`}</div><div className={styles.metricSub}>Simulated runs at target · frozen assumptions · not measured probability</div></div></div><div className={styles.muted} style={{ marginTop: 8 }}>{FORECAST_PERCENTILE_COPY.p10}. {FORECAST_PERCENTILE_COPY.p50}. {FORECAST_PERCENTILE_COPY.p90}.</div><SnapshotStamp brief={brief} source={forecastSource} /><ForecastAssumptions brief={brief} /></div>;
    case "signal-read": return <p className={styles.copy}>{p.signalRead}</p>;
    case "why-this-date": return <ul className={styles.list}>{p.drivers.map((driver) => <li className={styles.listItem} key={driver.id}><Link href={driver.href}>{driver.label}</Link><span className={styles.muted}>{driver.detail}</span></li>)}</ul>;
    case "commitment": return <div className={styles.headlineGrid}><div className={styles.metric}><div className={styles.label}>Likely</div><div className={styles.metricValue}>{date(window.likely)}</div></div><div className={styles.metric}><div className={styles.label}>Target</div><div className={styles.metricValue}>{date(brief.headline.targetDate.value)}</div></div><div className={styles.metric}><div className={styles.label}>Commitment</div><div className={styles.metricValue}>—</div><div className={styles.metricSub}>{p.commitment.label}</div></div></div>;
    case "movement": return <p className={styles.copy}>{movement ? `${movement.days === 0 ? `Unchanged from ${movement.comparedToReportId}` : `${Math.abs(movement.days)} day${Math.abs(movement.days) === 1 ? "" : "s"} ${movement.days < 0 ? "earlier" : "later"} than ${movement.comparedToReportId}`}${movement.confidencePoints === null ? "" : ` · stored target-frequency change ${movement.confidencePoints >= 0 ? "+" : ""}${movement.confidencePoints} points`}` : "No comparable saved brief; no trend claim."}</p>;
    case "what-changed": return <ul className={styles.list}><li className={styles.listItem}><span>Audit delta</span><strong>{brief.changes.audit.value.newFindings.length} new · {brief.changes.audit.value.resolvedFindings.length} resolved</strong></li><li className={styles.listItem}><span>Delivery delta</span><strong>{brief.changes.delivery.value.shipped.length} shipped</strong></li></ul>;
    case "acceleration-levers": return brief.movable.scenarioOptions.value.length ? <ul className={styles.list}>{brief.movable.scenarioOptions.value.map((option) => <li className={styles.listItem} key={option.id}><span>{option.label}</span><strong>{date(option.likelyDate)} · {Math.abs(option.deltaDays)}d {option.deltaDays < 0 ? "sooner" : option.deltaDays > 0 ? "later" : "unchanged"}</strong></li>)}</ul> : <div className={styles.warning}>UNAVAILABLE — no Forecast-owned scenario consequence exists.</div>;
    case "leadership-asks": return <div>{p.leadershipAsks.length ? <ul className={styles.list}>{p.leadershipAsks.map((ask) => <li className={styles.listItem} key={ask.id}><Link href={ask.href}>{ask.label}</Link><strong>Confirmed</strong></li>)}</ul> : <p className={styles.copy}>No operator-confirmed leadership asks.</p>}{p.leadershipAskCandidates.length > 0 && <div className={styles.warning} style={{ marginTop: 8 }}>Candidates require PO confirmation: {p.leadershipAskCandidates.map((ask) => ask.label).join(" · ")}</div>}</div>;
    case "next": return <p className={styles.copy}>{brief.timeline.nextMilestone.value ? `${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "Next milestone MISSING."}</p>;
    case "decisions": return <ul className={styles.list}>{brief.calls.decisions.value.map((decision) => <li className={styles.listItem} key={decision.id}><Link href={decision.href}>{decision.title}</Link><strong>{decision.gated ? `${n(decision.modeledDelay.low)}/${n(decision.modeledDelay.likely)}/${n(decision.modeledDelay.high)}d · ${decision.gate?.targetScopeName}` : "UNGATED · 0d"}</strong></li>)}</ul>;
    case "dependencies": return brief.calls.dependencies.value.length ? <ul className={styles.list}>{brief.calls.dependencies.value.map((dependency) => <li className={styles.listItem} key={dependency.scopeId}><span><Link href={dependency.href}>{dependency.name}</Link><small style={{ display: "block" }}>Completion floor · own work may proceed concurrently; each run uses the later completion.</small></span><strong>{dependency.likelyDate ? `P50 ${date(dependency.likelyDate)}` : "SNAPSHOT CONSEQUENCE UNAVAILABLE"}</strong></li>)}</ul> : <p className={styles.copy}>No declared dependency finish floors in this snapshot.</p>;
    case "scope": { const scope = brief.movable.scope.value; const quality = scope.estimateQuality; return <div><div className={styles.metric}><div className={styles.label}>Forecast work basis</div><div className={styles.metricValue}>{scope.executableItemCount} tracked source tickets</div><div className={styles.metricSub}>{scope.simulationItemCount ?? "Legacy unknown"} simulated estimate-basis items · {n(scope.remainingEffortDays.low)} / {n(scope.remainingEffortDays.likely)} / {n(scope.remainingEffortDays.high)} effort days · <Link href={scope.href}>Open Scope</Link></div>{quality && <div className={styles.metricSub} style={{ marginTop: 6 }}>Estimate quality · {quality.pointsIssueCount} Linear · {quality.aiCount} AI · {quality.placeholderIssueCount + quality.placeholderFindingCount} placeholders · {quality.placeholderEffortSharePct}% placeholder effort</div>}</div>{scope.capabilityOutlooks?.length ? <div className={styles.list} style={{ marginTop: 10 }}>{scope.capabilityOutlooks.map((outlook) => <div className={styles.listItem} key={outlook.capabilityId}><span><strong>{outlook.name}</strong><small style={{ display: "block" }}>{outlook.contributors.map((person) => `${person.name} ${n(person.fte)} FTE`).join(" · ")} · isolated · P10–P90 {date(outlook.earliestDate)}–{date(outlook.latestDate)}</small></span><strong>P50 {date(outlook.likelyDate)}</strong></div>)}</div> : null}</div>; }
    case "capacity": { const c = brief.movable.capacity.value; return c.availability === "available" ? <div><div className={styles.metric}><div className={styles.label}>Reconciled named capacity</div><div className={styles.metricValue}>{n(c.namedEffectiveFte!)} FTE</div><div className={styles.metricSub}>{n(c.namedRawFte!)} raw → {n(c.namedEffectiveFte!)} effective → {n(c.forecastEffectiveFte)} Forecast</div></div><ul className={styles.list} style={{ marginTop: 8 }}>{c.contributors.map((person) => <li className={styles.listItem} key={person.personId}><span>{person.name}</span><strong>{n(person.effectiveFte)} effective FTE</strong></li>)}</ul></div> : <div className={styles.warning}>Named Capacity {c.availability.toUpperCase()}. Forecast uses {n(c.forecastEffectiveFte)} FTE; this is not a named-staffing claim.</div>; }
    case "timeline": return <div><div className={styles.metric} style={{ "--tone": brief.timeline.currentForecast.source.currentness === "stale" ? "#e5b84b" : "#7d9eff" } as React.CSSProperties}><div className={styles.label}>Snapshot P50 forecast</div><div className={styles.metricValue}>{date(brief.timeline.currentForecast.value.likelyDate)}</div><div className={styles.metricSub}>P10–P90 {date(brief.timeline.currentForecast.value.earliestDate)}–{date(brief.timeline.currentForecast.value.latestDate)} · <Link href={brief.timeline.currentForecast.value.href}>Open Forecast</Link></div></div><SnapshotStamp brief={brief} source={brief.timeline.currentForecast.source} /><p className={styles.copy} style={{ marginTop: 8 }}>Next milestone: {brief.timeline.nextMilestone.value ? `${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "MISSING"}</p></div>;
    case "audit-delta": return <p className={styles.copy}>{brief.changes.audit.value.priorRunId ?? "MISSING"} → {brief.changes.audit.value.currentRunId ?? "MISSING"} · {brief.changes.audit.value.newFindings.length} new · {brief.changes.audit.value.resolvedFindings.length} resolved</p>;
    case "evidence": return <ul className={styles.list}>{brief.evidence.references.value.map((ref) => <li className={styles.listItem} key={ref.findingId}><Link href={ref.href}>{ref.title}</Link><strong>{ref.grounding} · {ref.currentness}</strong></li>)}</ul>;
    case "source-health": return <ul className={styles.list}>{brief.identity.sourceSnapshots.map((source, index) => <li className={styles.listItem} key={`${source.owner}-${index}`}><span>{source.owner}{source.note && <small style={{ display: "block" }}>{source.note}</small>}</span><strong>{source.currentness} at generation · source {instantDate(source.asOf)}</strong></li>)}</ul>;
    case "caveats": return brief.caveats.value.length ? <div style={{ display: "grid", gap: 7 }}>{brief.caveats.value.map((caveat) => <div className={styles.warning} key={caveat.code}><strong>{caveat.code}</strong> · {caveat.message}</div>)}</div> : <p className={styles.copy}>No explicit caveats from owner reads.</p>;
    case "operator-note": return <p className={styles.copy}>{recipe.operatorNote ?? "No operator-authored note."}</p>;
  }
}

export function BriefModule({ module, brief, recipe, open = true, onSelect, draggable = false, onDragStart, onDrop }: { module: BriefModuleConfig; brief: DecisionBriefV1; recipe: BriefRecipeV1; open?: boolean; onSelect?: () => void; draggable?: boolean; onDragStart?: () => void; onDrop?: () => void }) {
  const definition = moduleDefinition(module.id);
  const color = tone[definition.tone];
  return <details className={styles.briefModule} style={{ "--tone": color } as React.CSSProperties} open={open} draggable={draggable} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={onSelect} data-module-id={module.id} data-density={module.density}>
    <summary><span className={styles.tone} /><span className={styles.moduleTitle}>{definition.label}</span><span className={styles.moduleMeta}>{module.density} · {definition.owner}</span></summary>
    <div className={styles.briefModuleContent}><ModuleContent id={module.id} brief={brief} recipe={recipe} /><Stamp source={sourceForModule(brief, module.id)} /></div>
  </details>;
}

export default function AudienceBriefView({ brief, recipe, sitePreview = false }: { brief: DecisionBriefV1; recipe: BriefRecipeV1; sitePreview?: boolean }) {
  const p = buildBriefPresentation(brief, recipe);
  return <article className={`${styles.shell} decision-brief-print`} data-brief-fingerprint={p.snapshotFingerprint} data-recipe-version={recipe.version} data-site-preview={sitePreview ? "true" : "false"}>
    <div className={styles.preview}>
      <header className={styles.briefHeader}><div className={styles.mode}>{brief.identity.mode} · {p.purposeLabel}</div><h1 className={styles.briefTitle}>{p.projectName}<br />{p.audienceLabel} Brief</h1><div className={styles.fingerprint}>Immutable {brief.version} · {p.version} · {p.snapshotFingerprint} · generated {instantDate(p.generatedAt)}</div></header>
      {p.modules.map((module, index) => <BriefModule key={module.id} module={module} brief={brief} recipe={recipe} open={!sitePreview || index < 3 || module.id === "caveats"} />)}
      <CapabilityEstimateBasis brief={brief} />
    </div>
  </article>;
}
