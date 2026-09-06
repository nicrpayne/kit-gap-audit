"use client";

import type React from "react";
import Link from "@/components/instrument/SignalLink";
import type { DecisionBriefV1, SourceStamp } from "@/lib/reports/decisionBrief";
import { moduleDefinition, type BriefModuleConfig, type BriefModuleId, type BriefRecipeV1 } from "@/lib/reports/composer";
import { buildBriefPresentation, sourceForModule } from "@/lib/reports/presentation";
import styles from "./ReportsComposer.module.css";

const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "MISSING";
const n = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const tone: Record<string, string> = { reality: "#45bfd2", choice: "#9885ff", capacity: "#e5b84b", outcome: "#42d7aa", time: "#7d9eff", attention: "#e5b84b" };

function Stamp({ source }: { source: SourceStamp }) {
  return <div className={styles.stamp}>{source.owner} · {source.temporalRole} · as of {date(source.asOf)} · {source.currentness}</div>;
}

function ModuleContent({ id, brief, recipe }: { id: BriefModuleId; brief: DecisionBriefV1; recipe: BriefRecipeV1 }) {
  const p = buildBriefPresentation(brief, recipe);
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  switch (id) {
    case "delivery-outlook": return <div className={styles.headlineGrid}><div className={styles.metric} style={{ "--tone": "#42d7aa" } as React.CSSProperties}><div className={styles.label}>Likely outcome</div><div className={styles.metricValue}>{date(window.likely)}</div><div className={styles.metricSub}>{date(window.earliest)} – {date(window.latest)}</div></div><div className={styles.metric}><div className={styles.label}>Target</div><div className={styles.metricValue}>{date(brief.headline.targetDate.value)}</div><div className={styles.metricSub}>Planning target</div></div><div className={styles.metric}><div className={styles.label}>Confidence</div><div className={styles.metricValue}>{brief.headline.confidenceAtTarget.value === null ? "—" : `${brief.headline.confidenceAtTarget.value}%`}</div><div className={styles.metricSub}>At target</div></div></div>;
    case "signal-read": return <p className={styles.copy}>{p.signalRead}</p>;
    case "why-this-date": return <ul className={styles.list}>{p.drivers.map((driver) => <li className={styles.listItem} key={driver.id}><Link href={driver.href}>{driver.label}</Link><span className={styles.muted}>{driver.detail}</span></li>)}</ul>;
    case "commitment": return <div className={styles.headlineGrid}><div className={styles.metric}><div className={styles.label}>Likely</div><div className={styles.metricValue}>{date(window.likely)}</div></div><div className={styles.metric}><div className={styles.label}>Target</div><div className={styles.metricValue}>{date(brief.headline.targetDate.value)}</div></div><div className={styles.metric}><div className={styles.label}>Commitment</div><div className={styles.metricValue}>—</div><div className={styles.metricSub}>{p.commitment.label}</div></div></div>;
    case "movement": return <p className={styles.copy}>{movement ? `${Math.abs(movement.days)} days ${movement.days < 0 ? "earlier" : movement.days > 0 ? "later" : "unchanged"} than ${movement.comparedToReportId}${movement.confidencePoints === null ? "" : ` · confidence ${movement.confidencePoints >= 0 ? "+" : ""}${movement.confidencePoints} points`}` : "No comparable saved brief; no trend claim."}</p>;
    case "what-changed": return <ul className={styles.list}><li className={styles.listItem}><span>Audit delta</span><strong>{brief.changes.audit.value.newFindings.length} new · {brief.changes.audit.value.resolvedFindings.length} resolved</strong></li><li className={styles.listItem}><span>Delivery delta</span><strong>{brief.changes.delivery.value.shipped.length} shipped</strong></li></ul>;
    case "acceleration-levers": return brief.movable.scenarioOptions.value.length ? <ul className={styles.list}>{brief.movable.scenarioOptions.value.map((option) => <li className={styles.listItem} key={option.id}><span>{option.label}</span><strong>{date(option.likelyDate)} · {Math.abs(option.deltaDays)}d {option.deltaDays < 0 ? "sooner" : "later"}</strong></li>)}</ul> : <div className={styles.warning}>UNAVAILABLE — no Forecast-owned scenario consequence exists.</div>;
    case "leadership-asks": return <div>{p.leadershipAsks.length ? <ul className={styles.list}>{p.leadershipAsks.map((ask) => <li className={styles.listItem} key={ask.id}><Link href={ask.href}>{ask.label}</Link><strong>Confirmed</strong></li>)}</ul> : <p className={styles.copy}>No operator-confirmed leadership asks.</p>}{p.leadershipAskCandidates.length > 0 && <div className={styles.warning} style={{ marginTop: 8 }}>Candidates require PO confirmation: {p.leadershipAskCandidates.map((ask) => ask.label).join(" · ")}</div>}</div>;
    case "next": return <p className={styles.copy}>{brief.timeline.nextMilestone.value ? `${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "Next milestone MISSING."}</p>;
    case "decisions": return <ul className={styles.list}>{brief.calls.decisions.value.map((decision) => <li className={styles.listItem} key={decision.id}><Link href={decision.href}>{decision.title}</Link><strong>{decision.gated ? `${n(decision.modeledDelay.low)}/${n(decision.modeledDelay.likely)}/${n(decision.modeledDelay.high)}d · ${decision.gate?.targetScopeName}` : "UNGATED · 0d"}</strong></li>)}</ul>;
    case "dependencies": return brief.calls.dependencies.value.length ? <ul className={styles.list}>{brief.calls.dependencies.value.map((dependency) => <li className={styles.listItem} key={dependency.scopeId}><Link href={dependency.href}>{dependency.name}</Link><span>{dependency.likelyDate ? date(dependency.likelyDate) : "UNAVAILABLE"}</span></li>)}</ul> : <p className={styles.copy}>No declared dependencies in this snapshot.</p>;
    case "scope": { const scope = brief.movable.scope.value; return <div className={styles.metric}><div className={styles.label}>Canonical executable work</div><div className={styles.metricValue}>{scope.executableItemCount} items</div><div className={styles.metricSub}>{n(scope.remainingEffortDays.low)} / {n(scope.remainingEffortDays.likely)} / {n(scope.remainingEffortDays.high)} effort days · <Link href={scope.href}>Open Scope</Link></div></div>; }
    case "capacity": { const c = brief.movable.capacity.value; return c.availability === "available" ? <div><div className={styles.metric}><div className={styles.label}>Reconciled named capacity</div><div className={styles.metricValue}>{n(c.namedEffectiveFte!)} FTE</div><div className={styles.metricSub}>{n(c.namedRawFte!)} raw → {n(c.namedEffectiveFte!)} effective → {n(c.forecastEffectiveFte)} Forecast</div></div><ul className={styles.list} style={{ marginTop: 8 }}>{c.contributors.map((person) => <li className={styles.listItem} key={person.personId}><span>{person.name}</span><strong>{n(person.effectiveFte)} effective FTE</strong></li>)}</ul></div> : <div className={styles.warning}>Named Capacity {c.availability.toUpperCase()}. Forecast uses {n(c.forecastEffectiveFte)} FTE; this is not a named-staffing claim.</div>; }
    case "timeline": return <div><div className={styles.metric} style={{ "--tone": "#7d9eff" } as React.CSSProperties}><div className={styles.label}>Current Forecast · LIVE</div><div className={styles.metricValue}>{date(brief.timeline.currentForecast.value.likelyDate)}</div><div className={styles.metricSub}><Link href={brief.timeline.currentForecast.value.href}>Open Forecast</Link></div></div><p className={styles.copy} style={{ marginTop: 8 }}>Next milestone: {brief.timeline.nextMilestone.value ? `${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "MISSING"}</p></div>;
    case "audit-delta": return <p className={styles.copy}>{brief.changes.audit.value.priorRunId ?? "MISSING"} → {brief.changes.audit.value.currentRunId ?? "MISSING"} · {brief.changes.audit.value.newFindings.length} new · {brief.changes.audit.value.resolvedFindings.length} resolved</p>;
    case "evidence": return <ul className={styles.list}>{brief.evidence.references.value.map((ref) => <li className={styles.listItem} key={ref.findingId}><Link href={ref.href}>{ref.title}</Link><strong>{ref.grounding} · {ref.currentness}</strong></li>)}</ul>;
    case "source-health": return <ul className={styles.list}>{brief.identity.sourceSnapshots.map((source, index) => <li className={styles.listItem} key={`${source.owner}-${index}`}><span>{source.owner}</span><strong>{source.temporalRole} · {source.currentness} · {date(source.asOf)}</strong></li>)}</ul>;
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
      <header className={styles.briefHeader}><div className={styles.mode}>{brief.identity.mode} · {p.purposeLabel}</div><h1 className={styles.briefTitle}>{p.projectName}<br />{p.audienceLabel} Brief</h1><div className={styles.fingerprint}>Immutable {brief.version} · {p.version} · {p.snapshotFingerprint} · generated {date(p.generatedAt)}</div></header>
      {p.modules.map((module, index) => <BriefModule key={module.id} module={module} brief={brief} recipe={recipe} open={!sitePreview || index < 3 || module.id === "caveats"} />)}
    </div>
  </article>;
}
