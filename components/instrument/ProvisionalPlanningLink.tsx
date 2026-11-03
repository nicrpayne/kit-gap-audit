"use client";

import type { ProjectModel } from "@/lib/instrument/useProject";
import { buildPlanningBrief } from "@/lib/reports/planningBrief";
import { formatDateOnly } from "@/lib/time/dateContract";
import Link from "./SignalLink";

/** One project-specific door to the same snapshot shown by Forecast. This is
 * not a second forecast, an all-project date, or permission to publish Reality. */
export default function ProvisionalPlanningLink({ model, scopeId }: { model: ProjectModel; scopeId?: string }) {
  const scope = scopeId
    ? model.data?.scopes.find(row => row.scopeId === scopeId)
    : model.data?.scopes.find(row => !row.forecastCoverage.canonicalForecast && row.forecastCoverage.state !== "unavailable");
  if (!scope || model.scenarioPreviewRefusal || model.simulationError || model.error) return null;
  const coverage = model.coverageByScope.get(scope.scopeId) ?? scope.forecastCoverage;
  if (coverage.state === "unavailable" || (coverage.canonicalForecast && scope.forecastCoverage.canonicalForecast)) return null;
  const projection = buildPlanningBrief(model, scope.scopeId);
  const date = projection.ready ? formatDateOnly(projection.brief.outcome.likelyDate, { month: "short", day: "numeric", year: "numeric" }) : null;
  return <section data-shoot="provisional-planning-link" className="m-3 rounded-lg border border-[var(--i-violet)]/50 bg-[var(--i-panel)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-[var(--i-text)]">{scope.name}: {date ? `provisional planning ~${date}` : "review provisional planning"}</h2>
        <p className="mt-1 text-sm text-[var(--i-text-soft)]">{projection.ready
          ? `${coverage.census.modeledExecutionIssueCount} ticket${coverage.census.modeledExecutionIssueCount === 1 ? "" : "s"} modeled · ${coverage.census.unmappedExecutionIssueCount} ${coverage.workPolicy ? "ungrouped, included by assumption" : "still unclassified in this view"}. ${model.active ? "Scenario assumptions; accepted Reality is unchanged." : coverage.workPolicy ? "Current eligible work, not a delivery commitment." : "Selected work only, not a delivery commitment."}`
          : projection.reason}</p>
        {projection.ready && <p className="mt-1 text-xs text-[var(--i-text-faint)]">Review the ranges and missing inputs before relying on this date. A provisional brief is separate from a reviewed delivery report.</p>}
      </div>
      <Link className="shrink-0 rounded-md border border-[var(--i-violet)] px-3 py-2 text-sm text-[var(--i-violet)] focus-visible:outline focus-visible:outline-2" href={`/forecast?project=${encodeURIComponent(scope.scopeId)}`}>Open provisional planning →</Link>
    </div>
  </section>;
}
