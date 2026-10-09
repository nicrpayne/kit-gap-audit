import React from "react";
import type { RecipientSnapshot } from "@/lib/reports/recipientSnapshot";
import styles from "./RecipientReport.module.css";

const day = (v: string | null) => !v ? "Not recorded" : !Number.isFinite(Date.parse(v)) ? v : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(v));
const n = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);
const phaseDay = (start: string | null, offset: number) => start && Number.isFinite(Date.parse(start)) ? day(new Date(Date.parse(start) + offset * 86400_000).toISOString()) : "start date not captured";

export default function RecipientReportView({ snapshot }: { snapshot: RecipientSnapshot }) {
  return <div className={styles.wrap}>
    <p className={styles.notice}>Frozen report, not live project access. Targets, modeled outcomes and commitments are different. Percentages describe simulated runs—not a measured real-world probability.</p>
    {snapshot.comparisonId && snapshot.reports.length === 2 && <section className={styles.panel} aria-label="Reality and Scenario at a glance"><h2>Reality vs. what-if</h2><p>Same captured baseline. The Scenario is hypothetical; it has not changed accepted Reality.</p><div className={styles.metrics}>{snapshot.reports.map((r, i) => <div className={styles.metric} key={r.reportId}><span>{r.mode === "reality" ? "Reality" : "Scenario · what-if"}</span><strong>{day(r.outcome.likely)}</strong><p>{r.targetFrequency === null ? "Target frequency unavailable" : `${r.targetFrequency}% of simulated runs at target`}</p><a href={`#snapshot-${i}-outlook`}>Inspect this snapshot</a></div>)}</div></section>}
    {snapshot.reports.map((r, index) => {
      const prefix = `snapshot-${index}`;
      const times = (r.schedule ?? []).flatMap(e => [Date.parse(e.date), Date.parse(e.endDate ?? e.date)]).filter(Number.isFinite);
      const start = Math.min(...times), span = Math.max(86400_000, Math.max(...times) - start);
      return <article className={styles.snapshot} key={r.reportId} aria-labelledby={`${prefix}-title`}>
        <p className={styles.label}>{r.mode} · captured {day(r.generatedAt)}</p><h1 id={`${prefix}-title`}>{r.project}</h1>
        <nav className={`${styles.nav} ${styles.noPrint}`} aria-label={`${r.mode} report sections`}>
          {["Outlook", "Scope", "People", "Choices", "Timeline", "Evidence", "Limits"].map(label => <a key={label} href={`#${prefix}-${label.toLowerCase()}`}>{label}</a>)}
        </nav>
        <section className={styles.panel} id={`${prefix}-outlook`}><h2>Delivery outlook</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}><span>P50 modeled outcome</span><strong>{day(r.outcome.likely)}</strong><small>P10–P90: {day(r.outcome.earliest)} – {day(r.outcome.latest)}</small></div>
            <div className={styles.metric}><span>Planning target</span><strong>{day(r.target)}</strong><small>{r.commitment.label}</small></div>
            <div className={styles.metric}><span>Simulated runs at target</span><strong>{r.targetFrequency === null ? "Not available" : `${r.targetFrequency}%`}</strong><small>Conditional on the captured inputs and assumptions.</small></div>
          </div>
          <p>{r.reason}</p>
          {r.movement && <p>Compared with the report&apos;s saved baseline: {r.movement.days === 0 ? "no date change" : `${Math.abs(r.movement.days)} day${Math.abs(r.movement.days) === 1 ? "" : "s"} ${r.movement.days < 0 ? "earlier" : "later"}`}.</p>}
          <details><summary>Why this date? See captured assumptions</summary>{r.assumptions.length ? <ul>{r.assumptions.map((a, i) => <li key={i}><strong>{a.label}:</strong> {a.detail}</li>)}</ul> : <p>No assumptions were captured in this older report.</p>}</details>
        </section>
        <section className={styles.panel} id={`${prefix}-scope`}><h2>Scope and remaining work</h2>
          <p>{r.scope.tickets} tracked tickets · {n(r.scope.effort.low)} / {n(r.scope.effort.likely)} / {n(r.scope.effort.high)} remaining effort days (low / likely / high).</p>
          <p className={styles.muted}>Effort days are not elapsed delivery time. Capacity, concurrency and dependencies are part of the captured forecast.</p>
          {r.scope.estimateQuality && <p className={styles.notice}>{r.scope.estimateQuality.placeholderEffortSharePct}% of the captured effort came from placeholder estimates.</p>}
          {r.evidence && <ul>{r.evidence.capabilities.map((c, i) => <li key={i}>{c.name}{c.excluded ? " — removed in this Scenario" : " — accepted at report generation"}</li>)}</ul>}
          <details><summary>Remaining-work estimates and evidence</summary>{r.estimates.length ? r.estimates.map((e, i) => <div key={i}><h3>{e.name}</h3><p><strong>{e.usedInSimulation === false ? "Evidence only; ticket rollup used" : e.usedInSimulation === true ? "Used in the captured simulation" : "Historical estimate; explicit usage flag not recorded"}</strong></p><p>{e.authority} · {e.basis}</p><p>{e.range ? `${n(e.range.low)} / ${n(e.range.likely)} / ${n(e.range.high)} developer-days` : "No range captured"} · source {day(e.sourceDate)}</p><p>Covered tickets: {e.coveredItemIds.join(", ") || "none recorded"}. Additional tickets retained separately: {e.additionalItemIds.join(", ") || "none recorded"}.</p>{e.quote ? <blockquote>{e.quote}</blockquote> : <p>Operator judgment; no transcript quote asserted.</p>}<p>Raw assertion: {e.rawAssertion}</p>{e.interpretation && <p>{e.interpretation}</p>}{e.review && <p>{e.review} Reviewer: {e.reviewer ?? "not recorded"} · reviewed {day(e.reviewedAt)}.</p>}</div>) : <p>No separate capability estimate receipts were captured. The saved ticket rollup remains the basis.</p>}</details>
        </section>
        <section className={styles.panel} id={`${prefix}-people`}><h2>People and capacity</h2><p>{n(r.capacity.forecastFte)} effective FTE used in the forecast. Named capacity: {r.capacity.availability}.</p>
          <ul>{r.capacity.people.map((p, i) => <li key={i}>{p.name}: {n(p.effectiveFte)} effective FTE at the captured baseline.</li>)}</ul>
          {r.capacityPhases.length > 0 && <details open><summary>Phased capacity used in this Scenario</summary><p className={styles.muted}>Saved forecast start: {day(r.forecastStart)}. These calendar-day offsets are explicit planning assumptions, not confirmed moves.</p><ul>{r.capacityPhases.map((p, i) => <li key={i}>From {phaseDay(r.forecastStart, p.startDay)} (day {p.startDay}): {n(p.teamCapacity)} FTE.</li>)}</ul></details>}
        </section>
        <section className={styles.panel} id={`${prefix}-choices`}><h2>Choices, dependencies and asks</h2>
          {r.asks.length ? <ul>{r.asks.map((a, i) => <li key={i}><strong>{a.label}</strong> · {a.owner ?? "Owner not recorded"} · needed {day(a.neededBy)}</li>)}</ul> : <p>No operator-confirmed leadership asks were captured.</p>}
          <details><summary>Decision detail ({r.decisions.length})</summary>{r.decisions.length ? <ul>{r.decisions.map((d, i) => <li key={i}><strong>{d.title}</strong> — {d.status}; {d.owner ?? "owner not recorded"}. {d.gated ? `Modeled delay: ${n(d.delay.low)} / ${n(d.delay.likely)} / ${n(d.delay.high)} days.` : "No modeled delay attached."}</li>)}</ul> : <p>No decision records captured.</p>}</details>
          <details><summary>Dependency detail ({r.dependencies.length})</summary>{r.dependencies.length ? <ul>{r.dependencies.map((d, i) => <li key={i}>{d.name} · P50 {day(d.likelyDate)} · {d.currentness} at generation. Own work may proceed concurrently; completion cannot precede the dependency&apos;s completion.</li>)}</ul> : <p>No declared dependency finish floors captured.</p>}</details>
        </section>
        <section className={styles.panel} id={`${prefix}-timeline`}><h2>Timeline snapshot</h2><p className={styles.muted}>Accepted plans and landmarks at generation. These do not themselves schedule resources or change the forecast.</p>
          {!r.schedule ? <p>Full schedule was not captured in this historical report.</p> : !r.schedule.length ? <p>No accepted schedule landmarks were recorded.</p> : <div className={styles.schedule}>{r.schedule.map((e, i) => <div key={i}><h3>{e.title}</h3><p>{day(e.date)}{e.endDate ? ` – ${day(e.endDate)}` : ""} · {e.state} · {e.meaning}</p><div className={styles.bar} aria-hidden><span style={{ left: `${(Date.parse(e.date) - start) / span * 95}%`, width: `${Math.max(1, (Date.parse(e.endDate ?? e.date) - Date.parse(e.date)) / span * 95)}%` }} /></div><details><summary>Schedule source</summary><p>{e.source}</p>{e.evidence.length ? e.evidence.map((q, j) => <blockquote key={j}>{q.quote}<footer>{q.source} · {q.passage}</footer></blockquote>) : <p>No exact passage was captured for this landmark.</p>}</details></div>)}</div>}
        </section>
        <section className={styles.panel} id={`${prefix}-evidence`}><h2>Evidence you can inspect</h2><p>These are original passages captured at acceptance. They are not automatically proof of today&apos;s status or of an operator-entered numerical estimate.</p>
          {!r.evidence ? <p>Scope evidence was not captured in this older report and has not been backfilled.</p> : r.evidence.capabilities.map((c, i) => <details key={i}><summary>{c.name}{c.excluded ? " · removed in Scenario; historical only" : ""}</summary>{c.references.length ? c.references.map((q, j) => q.quote !== null ? <div key={j}><blockquote>{q.quote}</blockquote><p className={styles.muted}>Source: {q.source} · source date: {q.sourceDate ?? "not recorded"} · accepted: {q.acceptedAt}</p><details><summary>Original evidence locator</summary><p>Snapshot: {q.snapshot} · Evidence: {q.evidenceId}</p><p>{JSON.stringify(q.locator)}</p></details></div> : <p key={j}>Reference only; no verified captured quote.</p>) : <p>No evidence references recorded.</p>}</details>)}
        </section>
        <section className={styles.panel} id={`${prefix}-limits`}><h2>Limits and source freshness</h2>
          {r.caveats.length ? <ul>{r.caveats.map((c, i) => <li key={i}><strong>{c.code}:</strong> {c.message}</li>)}</ul> : <p>No additional caveats were recorded in this snapshot.</p>}
          {r.sourceWarnings.length > 0 && <ul>{r.sourceWarnings.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          <details><summary>Source dates at generation</summary><ul>{r.sources.map((s, i) => <li key={i}>{s.owner}: {s.currentness} at generation; source as of {day(s.asOf)}. {s.note}</li>)}</ul></details>
          <p className={styles.muted}>Report {r.reportId} · fingerprint {r.fingerprint}. This site does not fetch current project data or provide planning controls.</p>
        </section>
      </article>;
    })}
  </div>;
}
