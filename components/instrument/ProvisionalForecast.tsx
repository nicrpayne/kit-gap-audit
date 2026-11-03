"use client";

import { useState } from "react";
import Link from "./SignalLink";
import type { ProjectModel, ProjectScope } from "@/lib/instrument/useProject";
import { includeProvisionalWork, provisionalWorkCandidates } from "@/lib/forecast/provisional";
import { buildPlanningBrief, renderPlanningBrief, planningEstimateBasisLabel } from "@/lib/reports/planningBrief";
import { formatDateOnly } from "@/lib/time/dateContract";
import { currentWorkBoundary } from "@/lib/forecast/workBoundary";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProvisionalForecast({ model, scope }: { model: ProjectModel; scope: ProjectScope }) {
  const secondaryButton = "rounded-md border border-[var(--i-border)] bg-[var(--i-panel-raised)] px-3 py-2 text-sm hover:border-[var(--i-signal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--i-signal)] disabled:opacity-40 disabled:cursor-not-allowed";
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const candidates = provisionalWorkCandidates(scope, model.scenario);
  const candidateIds = new Set(candidates.map(item => item.id));
  const selectedIds = [...selected].filter(id => candidateIds.has(id));
  const projection = buildPlanningBrief(model, scope.scopeId);
  const brief = projection.ready ? projection.brief : null;
  const coverage = model.coverageByScope.get(scope.scopeId) ?? scope.forecastCoverage;
  const ungroupedIds = new Set(scope.forecastCoverage.workPolicy ? currentWorkBoundary(scope.executionItems.map(item => item.id), scope.capabilities).ungroupedIds : []);
  const ungrouped = scope.executionItems.filter(item => ungroupedIds.has(item.id));
  const assumed = scope.executionItems.filter(item => model.scenario.includedItemIds.has(item.id));
  const date = (value: string) => formatDateOnly(value, { month: "short", day: "numeric", year: "numeric" });

  function include() {
    try {
      // Calculate against the same captured view the user selected. The shared
      // Scenario baseline guard refuses the preview if Reality has changed.
      const next = includeProvisionalWork(model.data!.scopes, scope.scopeId, model.scenario, selectedIds);
      model.setScenario(next); setReviewing(false); setSelected(new Set()); setError(null); setNotice(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review the selected tickets."); }
  }
  function exportBrief(kind: "html" | "json") {
    const current = buildPlanningBrief(model, scope.scopeId);
    if (!current.ready) { setError(current.reason); return; }
    const name = scope.name.replace(/[^a-z0-9_-]/gi, "-");
    download(`${name}-provisional-planning.${kind}`, kind === "html" ? renderPlanningBrief(current.brief) : JSON.stringify(current.brief, null, 2), kind === "html" ? "text/html;charset=utf-8" : "application/json");
    setNotice("Downloaded a frozen provisional brief. No accepted data changed and no site was published. The file contains internal project data.");
  }

  return <section className="w-full max-w-[1020px] rounded-2xl border border-[var(--i-amber)]/40 bg-[var(--i-panel)] p-5 sm:p-7" data-shoot="forecast-modeled-subset">
    <div className="i-label text-[var(--i-amber)]">{brief ? coverage.workPolicy ? "Planning forecast · assumptions to review" : "Provisional forecast" : model.previewPending ? "Updating planning forecast" : "Not enough information to calculate"}</div>
    <h1 className="mt-2 text-2xl font-semibold">{scope.name}</h1>
    <p className="mt-2 max-w-3xl text-sm text-[var(--i-text-soft)]">Plan with what you know, then review the gaps. This is not an approved delivery commitment. Accepted Reality stays unchanged.</p>

    <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_1fr]">
      <div className="rounded-xl border border-[var(--i-border)] bg-[var(--i-recess)] p-5" data-shoot="modeled-subset-outcome">
        <div className="i-label">{model.active ? "Scenario planning outcome" : "Reality-input planning outcome"}</div>
        <div className="i-readout mt-3 text-3xl">{brief ? date(brief.outcome.likelyDate) : "—"}</div>
        {brief ? <>
          <p className="mt-2 text-sm">P10–P90: {date(brief.outcome.earliestDate)}–{date(brief.outcome.latestDate)}</p>
          <p className="mt-2 text-xs text-[var(--i-amber)]">{brief.outcome.basis}</p>
          <p className="mt-2 text-xs text-[var(--i-text-soft)]">Missing information can move the date beyond this range.</p>
          {brief.estimateQuality.placeholderCount > 0 && <p className="mt-2 text-xs text-[var(--i-amber)]">{brief.estimateQuality.placeholderCount} modeled inputs use placeholder estimates. Review these before relying on the date.</p>}
          {brief.outcome.baselineLikelyDate && <p className="mt-3 text-xs text-[var(--i-violet)]" data-shoot="forecast-scenario-impact">Reality-input comparison: {date(brief.outcome.baselineLikelyDate)}. Different work boundaries are not measured progress.</p>}
          <p className="mt-3 border-t border-[var(--i-border)] pt-3 text-xs">Target: {scope.targetDate ? date(scope.targetDate) : "Not set"}. {brief.outcome.targetFrequency === null ? "No project-level target likelihood while required inputs remain unresolved." : `${brief.outcome.targetFrequency}% of simulations meet it under these assumptions — not a measured real-world probability.`}</p>
        </> : <p role="status" className="mt-3 text-sm text-[var(--i-text-soft)]">{projection.ready ? "" : projection.reason}</p>}
      </div>
      <div className="rounded-xl border border-[var(--i-border)] p-5">
        <h2 className="text-base font-semibold">What is this based on?</h2>
        <div className="mt-3 space-y-2 text-sm" data-shoot="provisional-coverage-counts">
          <p><strong>{coverage.census.modeledExecutionIssueCount}</strong> tickets modeled in this view</p>
          <p><strong>{coverage.census.outsideExecutionIssueCount}</strong> classified out/later</p>
          <p><strong>{coverage.census.unmappedExecutionIssueCount}</strong> {coverage.workPolicy ? "ungrouped tickets included by assumption" : "still unclassified in this view"}</p>
          <p className="text-xs text-[var(--i-text-soft)]">Accepted Reality: {scope.forecastCoverage.census.unmappedExecutionIssueCount} unclassified. These counts measure coverage, not accuracy.</p>
        </div>
        {candidates.length > 0 && <button type="button" data-attention="review" className="i-btn-primary mt-4 px-4 py-2 text-sm" onClick={() => { setReviewing(true); setSelected(new Set(candidates.map(item => item.id))); setError(null); }}>Try including {candidates.length} unclassified tickets</button>}
        <Link href={`/scope?project=${encodeURIComponent(scope.scopeId)}`} className="mt-4 block text-sm text-[var(--i-signal)] hover:underline">Review release choices in Scope →</Link>
      </div>
    </div>

    {ungrouped.length > 0 && <details open className="mt-4 rounded border border-[var(--i-violet)]/40 p-4 text-sm" data-shoot="ungrouped-planning-work">
      <summary className="cursor-pointer font-semibold">Ungrouped work — already counted</summary>
      <p className="mt-2 text-xs text-[var(--i-text-soft)]">No feature mapping is required to count this work. Group it in Scope later. Try deferring a ticket below to see the effect on this Scenario only; accepted Reality stays unchanged.</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-auto">{ungrouped.map(item => {
        const excluded = model.scenario.excludedItemIds.has(item.id);
        const ambiguous = (model.data?.scopes.filter(row => row.executionItems.some(other => other.id === item.id)).length ?? 0) > 1;
        return <li key={item.id} className="flex items-center justify-between gap-3 rounded border border-[var(--i-border)] p-3">
          <span>{item.label}<small className="block text-[var(--i-text-soft)]">{item.low} / {item.likely} / {item.high} effort days · {planningEstimateBasisLabel(item.estimateSource)}{excluded ? " · deferred in Scenario" : ""}</small></span>
          <button className={secondaryButton} disabled={ambiguous} title={ambiguous ? "This ticket appears in more than one project. Review ownership in Scope." : undefined}
            aria-label={`${excluded ? "Restore" : "Try deferring"} ${item.label}`} onClick={() => model.setScenario(current => {
              const excludedItemIds = new Set(current.excludedItemIds); const includedItemIds = new Set(current.includedItemIds);
              if (excluded) excludedItemIds.delete(item.id); else { excludedItemIds.add(item.id); includedItemIds.delete(item.id); }
              return { ...current, excludedItemIds, includedItemIds };
            })}>{excluded ? "Restore" : "Try deferring"}</button>
        </li>;
      })}</ul>
    </details>}

    {reviewing && <section className="mt-5 rounded-xl border border-[var(--i-violet)] p-4" aria-label="Choose provisional work">
      <h2 className="font-semibold">Assume these tickets belong in the release?</h2>
      <p className="mt-2 text-sm text-[var(--i-text-soft)]">Selected tickets use their existing estimate ranges as ungrouped work. Out/later choices and already-covered work are left alone. This changes only your Scenario.</p>
      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {candidates.map(item => <label key={item.id} className="flex items-start gap-3 rounded border border-[var(--i-border)] p-3 text-sm">
          <input className="mt-1" type="checkbox" checked={selected.has(item.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
          <span>{item.label}<span className="mt-1 block text-xs text-[var(--i-text-soft)]">{item.low} / {item.likely} / {item.high} effort days · {planningEstimateBasisLabel(item.estimateSource)}</span></span>
        </label>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button className="i-btn-primary px-4 py-2 text-sm" disabled={!selectedIds.length} onClick={include}>Include {selectedIds.length} tickets in Scenario</button><button className={secondaryButton} onClick={() => setReviewing(false)}>Cancel</button></div>
    </section>}

    {assumed.length > 0 && <details className="mt-4 rounded border border-[var(--i-violet)]/40 p-3 text-sm"><summary className="cursor-pointer text-[var(--i-violet)]">{assumed.length} tickets explicitly assumed in — ungrouped work</summary><ul className="mt-2 space-y-2">{assumed.map(item => <li key={item.id} className="flex items-center justify-between gap-3"><span>{item.label}</span><button className={secondaryButton} aria-label={`Undo inclusion of ${item.label}`} onClick={() => model.setScenario(current => { const includedItemIds = new Set(current.includedItemIds); includedItemIds.delete(item.id); return { ...current, includedItemIds }; })}>Undo inclusion</button></li>)}</ul></details>}

    <details className="mt-4 rounded border border-[var(--i-border)] p-3 text-sm" data-shoot="forecast-coverage-reasons"><summary className="cursor-pointer">Assumptions and remaining review</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-[var(--i-text-soft)]">{(brief?.warnings ?? coverage.reasons.map(reason => reason.label)).map(warning => <li key={warning}>{warning}</li>)}</ul></details>
    <div className="mt-5 border-t border-[var(--i-border)] pt-4">
      <h2 className="font-semibold">Take this planning view into the conversation</h2>
      <p className="mt-1 text-xs text-[var(--i-text-soft)]">Download a local brief with the same dates, assumptions and evidence. Or open Reports to save a report with its assumptions; source, estimate and staffing checks still apply. Downloads contain internal data and are not a private report site.</p>
      <div className="mt-3 flex flex-wrap gap-3"><button className={secondaryButton} disabled={!brief} onClick={() => exportBrief("html")}>Download provisional brief</button><button className={secondaryButton} disabled={!brief} onClick={() => exportBrief("json")}>Download captured inputs (JSON)</button><Link className={secondaryButton} href={`/reports?project=${encodeURIComponent(scope.scopeId)}`}>Reviewed delivery reports →</Link></div>
      <p className="mt-2 text-xs text-[var(--i-text-faint)]">Use Saved Scenarios in the top bar to keep a named version of this what-if.</p>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--i-red)]">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-[var(--i-mint)]">{notice}</p>}
  </section>;
}
