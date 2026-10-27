import type { ProjectModel } from "@/lib/instrument/useProject";
import { scenarioWorkItems } from "@/lib/scenario/workItems";
import { decisionScenarioGates } from "@/lib/scenario/decisionPlan";
import { encodeSavedScenario } from "@/lib/scenario/saved";
import { confidenceAtDay } from "@/lib/forecast/simulate";
import { applyScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { buildCapacityPlanBaseline, resolveCapacityPlan } from "@/lib/scenario/capacityPlan";
import { compilePhasedCapacityPlan } from "@/lib/scenario/phasedCapacity";

export const PLANNING_BRIEF_NOTICE = "Provisional planning brief — not an approved delivery report or commitment. Omitted work and unresolved choices can move the date beyond this range. Ticket coverage is not forecast accuracy.";
export const planningEstimateBasisLabel = (basis: string) => ({
  issue_placeholder: "Placeholder — needs estimate review", finding_placeholder: "Finding placeholder — needs review",
  ai: "AI estimate", points: "Legacy points-based estimate", hint: "Source estimate hint", knowledge: "Source-backed feature estimate",
}[basis] ?? basis);

/** A deliberately separate, local-only export. Never persist these snapshots
 * as canonical Report rows or send them to the executive publishing API. */
export function buildPlanningBrief(model: ProjectModel, scopeId: string, generatedAt = new Date().toISOString()) {
  if (!model.data || !model.startDate) return { ready: false as const, reason: "Waiting for current project inputs." };
  if (model.error || model.scenarioPreviewRefusal || model.simulationError || model.capacityPlanError) {
    return { ready: false as const, reason: model.error ?? model.scenarioPreviewRefusal?.message ?? model.simulationError ?? model.capacityPlanError! };
  }
  if (model.active && model.previewPending) return { ready: false as const, reason: "Recalculating Scenario. Wait for its matching result before exporting." };
  const scope = model.data.scopes.find(row => row.scopeId === scopeId);
  const coverage = model.coverageByScope.get(scopeId) ?? scope?.forecastCoverage;
  const result = (model.active ? model.preview : model.baseline)?.get(scopeId);
  if (!scope || !coverage || coverage.state === "unavailable" || !result || !result.completionDaysSorted.length
    || ![result.likelyDate, result.earliestDate, result.latestDate, model.startDate].every(date => Number.isFinite(date.getTime()))
    || !result.completionDaysSorted.every(Number.isFinite)) {
    return { ready: false as const, reason: coverage?.reason ?? "Not enough information to calculate a planning date." };
  }
  const relevantIds = new Set<string>();
  const collect = (id: string) => { if (relevantIds.has(id)) return; relevantIds.add(id); model.data!.scopes.find(row => row.scopeId === id)?.dependsOnScopeIds.forEach(collect); };
  collect(scopeId);
  const relevant = model.data.scopes.filter(row => relevantIds.has(row.scopeId));
  if (relevant.length !== relevantIds.size || relevant.some(row => row.realityState.status !== "current" || row.realityState.computedRevision !== row.realityState.realityRevision)) {
    return { ready: false as const, reason: "Project or dependency inputs are still recomputing. Wait for a coherent planning snapshot." };
  }
  try {
    const scenario = model.scenario;
    const specs: ScenarioInputScope[] = model.data.scopes.map(row => ({
      scopeId: row.scopeId, items: model.active ? scenarioWorkItems(row, scenario) : row.forecastItems,
      gates: model.active ? decisionScenarioGates(row.scopeId, row.gates, model.data!.decisions ?? [], scenario.decisionPlans, scenario.resolvedGateIds) : row.gates,
      dependsOnScopeIds: row.dependsOnScopeIds, startDate: model.startDate!, targetDate: row.targetDate ? new Date(row.targetDate) : null,
      teamCapacity: row.teamCapacity, capacitySource: row.capacitySource, explicitTeamCapacity: row.explicitTeamCapacity,
    }));
    const capacityDelta = model.active && scenario.capacityPlan ? resolveCapacityPlan(scenario.capacityPlan) : {
      allocations: model.data.allocations, hypotheticalPeople: [],
      contextSwitchCostPct: model.active ? scenario.contextSwitchCostPct ?? model.data.contextSwitchCostPct : model.data.contextSwitchCostPct,
      capacityOverrideByScope: model.active ? scenario.capacityOverrideByScope : undefined,
    };
    let compiled = applyScenarioInputDelta(specs, model.data.people, capacityDelta);
    if (model.active && scenario.phasedCapacityPlan) compiled = compilePhasedCapacityPlan(scenario.phasedCapacityPlan,
      buildCapacityPlanBaseline({ people: model.data.people, allocations: model.data.allocations, contextSwitchCostPct: model.data.contextSwitchCostPct,
        scopeRevisionById: Object.fromEntries(model.data.scopes.map(row => [row.scopeId, row.realityState.realityRevision])) }), compiled, model.data.startDate.slice(0, 10));
    const inputs = relevant.map(row => {
      const spec = compiled.find(candidate => candidate.scopeId === row.scopeId)!;
      const items = spec.items;
      if (items.some(item => ![item.low, item.likely, item.high].every(value => Number.isFinite(value) && value >= 0) || item.low > item.likely || item.likely > item.high)) throw new Error(`${row.name} contains an invalid remaining-work range. Review it before exporting.`);
      if (items.some(item => item.high > 0) && !(spec.capacityPhases?.some(phase => phase.teamCapacity > 0) ?? spec.teamCapacity > 0)) throw new Error(`${row.name} has no funded capacity. Add a staffing assumption before forecasting.`);
      const sourceIds = new Set(row.executionItems.map(item => item.id));
      const rowCoverage = model.coverageByScope.get(row.scopeId) ?? row.forecastCoverage;
      return {
        scopeId: row.scopeId, name: row.name, realityRevision: row.realityState.realityRevision,
        contextSnapshotId: row.currentContextSnapshotId, executionSource: row.executionSource,
        coverage: rowCoverage, realityCoverage: row.forecastCoverage,
        dependsOnScopeIds: [...row.dependsOnScopeIds],
        baselineCapacity: row.teamCapacity, capacitySource: row.capacitySource, capacityReconciles: row.capacityContract.reconciles,
        modeledCapacity: spec.teamCapacity, capacityPhases: spec.capacityPhases ?? null,
        items: items.map(item => {
          const original = row.executionItems.find(source => source.id === item.id);
          return { id: item.id, label: item.label, low: item.low, likely: item.likely, high: item.high,
            estimateBasis: model.active && model.scenario.estimateOverrideByItemId[item.id] ? "Scenario estimate" : original?.estimateSource ?? "Modeled aggregate or finding",
            sourceUrl: original?.externalUrl ?? null, quote: original?.quote ?? null };
        }),
        gates: spec.gates,
        assumedIncludedTickets: model.active ? row.executionItems.filter(item => model.scenario.includedItemIds.has(item.id)).map(item => ({ id: item.id, label: item.label })) : [],
        explicitlyExcludedTicketIds: model.active ? [...model.scenario.excludedItemIds].filter(id => sourceIds.has(id)) : [],
        capabilityEstimateEvidence: row.capabilities.filter(card => card.acceptedEstimate || model.scenario.remainingEstimateByCapabilityId?.[card.id]).map(card => ({
          id: card.id, name: card.name, revision: card.revision, acceptedEstimate: card.acceptedEstimate,
          review: card.estimateReview, evidence: card.evidenceTrace ?? [],
        })),
      };
    });
    const own = inputs.find(row => row.scopeId === scopeId)!;
    if (!own.items.some(item => item.high > 0)) return { ready: false as const, reason: "No positive remaining work is selected. Include work or review estimates before calculating a date." };
    const placeholders = inputs.flatMap(row => row.items).filter(item => item.estimateBasis === "issue_placeholder" || item.estimateBasis === "finding_placeholder").length;
    const capacityUnresolved = relevant.some(row => !row.capacityContract.reconciles || (model.scenario.capacityPlan?.requiredByScope[row.scopeId] ?? 0) > 0
      || (model.active && !model.scenario.capacityPlan && model.scenario.capacityOverrideByScope[row.scopeId] !== undefined));
    const warnings = [...new Set([
      PLANNING_BRIEF_NOTICE,
      ...inputs.flatMap(row => row.coverage.reasons.map(reason => `${row.name}: ${reason.label}`)),
      ...(placeholders ? [`${placeholders} modeled inputs use placeholder ranges, not reviewed developer estimates.`] : []),
      ...(capacityUnresolved ? ["Staffing is not fully reconciled. The date uses the modeled capacity assumptions, not a confirmed staffing commitment."] : []),
      "The range is P10–P90 of simulated outcomes under the listed inputs, not an error bound for missing information.",
      "Source timestamps describe the source records, not a guarantee they were freshly checked. No source, estimate, or decision was approved by creating this brief.",
      "This export contains internal project data. It is a local file, not an access-controlled published site.",
    ])];
    const target = scope.targetDate ? new Date(scope.targetDate) : null;
    // Only assess the target when the hypothetical boundary itself is complete.
    // Otherwise a subset's success frequency would look like release confidence.
    const completeBoundary = coverage.canonicalForecast && inputs.every(input => input.coverage.canonicalForecast);
    const targetFrequency = completeBoundary && !capacityUnresolved && target && Number.isFinite(target.getTime())
      ? confidenceAtDay(result.completionDaysSorted, (target.getTime() - model.startDate.getTime()) / 86_400_000) : null;
    const baseline = model.baseline?.get(scopeId);
    const brief = {
      version: "signal-planning-brief.v1" as const, status: "provisional" as const, notice: PLANNING_BRIEF_NOTICE,
      generatedAt, scopeId, name: scope.name, mode: model.active ? "Scenario" : "Reality inputs",
      startDate: model.startDate.toISOString(),
      outcome: { likelyDate: result.likelyDate.toISOString(), earliestDate: result.earliestDate.toISOString(), latestDate: result.latestDate.toISOString(),
        targetDate: scope.targetDate, targetFrequency, trials: result.completionDaysSorted.length,
        basis: completeBoundary ? "All classified work under these assumptions" : "Selected work only — missing scope is not included",
        baselineLikelyDate: model.active && baseline && scope.forecastCoverage.state !== "unavailable" && scope.forecastItems.some(item => item.high > 0) ? baseline.likelyDate.toISOString() : null },
      coverage: { ...coverage.census, realityUnclassifiedCount: scope.forecastCoverage.census.unmappedExecutionIssueCount },
      estimateQuality: { placeholderCount: placeholders },
      warnings, inputs,
      scenario: model.active ? encodeSavedScenario(model.scenario) : null,
    };
    // Detach from the live store so later edits cannot mutate the snapshot.
    return { ready: true as const, brief: structuredClone(brief) };
  } catch (error) { return { ready: false as const, reason: error instanceof Error ? error.message : "Review the Scenario inputs before exporting." }; }
}

export type PlanningBrief = Extract<ReturnType<typeof buildPlanningBrief>, { ready: true }>["brief"];
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const day = (value: string) => value.slice(0, 10);

export function renderPlanningBrief(brief: PlanningBrief): string {
  const outcome = brief.outcome;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(brief.name)} — provisional planning brief</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f3f6fa;color:#182335}main{max-width:960px;margin:auto;padding:32px 24px}header,section{background:white;border:1px solid #ced8e3;border-radius:12px;padding:24px;margin:20px 0}.notice{border-left:6px solid #a86500;background:#fff6e6;padding:16px}h1{margin:8px 0}h2{font-size:21px}summary{cursor:pointer;font-weight:650}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #dce3eb;padding:9px;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}strong.date{font-size:34px}.scroll{overflow:auto}@media print{details>*{display:block!important}summary{display:block}body{background:white}section{break-inside:avoid}}</style></head><body><main>
  <div class="notice"><strong>PROVISIONAL · ${escape(brief.mode)}</strong><p>${escape(brief.notice)}</p></div>
  <header><h1>${escape(brief.name)}</h1><p>Frozen planning snapshot · generated ${escape(brief.generatedAt)} · model starts ${escape(day(brief.startDate))}</p><strong class="date">${escape(day(outcome.likelyDate))}</strong><p>${escape(outcome.basis)}<br>P10–P90: ${escape(day(outcome.earliestDate))} to ${escape(day(outcome.latestDate))}</p>
  ${outcome.baselineLikelyDate ? `<p>Reality-input comparison: ${escape(day(outcome.baselineLikelyDate))}. The two work boundaries may differ; this is not measured progress.</p>` : ""}
  <p>Planning target: ${escape(outcome.targetDate ? day(outcome.targetDate) : "Not set")}. ${outcome.targetFrequency === null ? "No project target likelihood is claimed while required inputs remain unresolved." : `${outcome.targetFrequency}% of ${outcome.trials} simulations finish by the target under these assumptions — not a calibrated real-world probability.`}</p></header>
  <section><h2>What is included?</h2><p>${brief.coverage.modeledExecutionIssueCount} modeled tickets · ${brief.coverage.outsideExecutionIssueCount} out/later · ${brief.coverage.unmappedExecutionIssueCount} still unclassified in this view. Accepted Reality has ${brief.coverage.realityUnclassifiedCount} unclassified tickets.</p><p>These are ticket counts, not an accuracy percentage. An aggregate estimate can represent several tickets.</p></section>
  <section><h2>Assumptions and limits</h2><ul>${brief.warnings.map(warning => `<li>${escape(warning)}</li>`).join("")}</ul></section>
  ${brief.inputs.map(input => `<section><h2>${escape(input.name)} — captured model inputs</h2><p>Reality r${input.realityRevision} · source records as of ${escape(input.executionSource.asOf)} · baseline capacity ${input.baselineCapacity} FTE (${escape(input.capacitySource)}). Any Scenario staffing changes are captured below.</p><p>Explicitly assumed in: ${escape(input.assumedIncludedTickets.map(item => item.label).join("; ") || "None")}</p><details><summary>Work, estimate basis and source quotes</summary><div class="scroll"><table><thead><tr><th>Work</th><th>Low / likely / high effort days</th><th>Basis</th></tr></thead><tbody>${input.items.map(item => `<tr><td>${escape(item.label)}<br>${escape(item.id)}${item.quote ? `<blockquote>${escape(item.quote)}</blockquote>` : ""}</td><td>${item.low} / ${item.likely} / ${item.high}</td><td>${escape(planningEstimateBasisLabel(item.estimateBasis))}</td></tr>`).join("")}</tbody></table></div></details><details><summary>Evidence, gates, coverage and dependency records</summary><pre>${escape(JSON.stringify(input, null, 2))}</pre></details></section>`).join("")}
  <section><details><summary>Exact Scenario assumptions</summary><pre>${escape(JSON.stringify(brief.scenario, null, 2))}</pre></details><p>No accepted data or saved delivery reports were changed. This file has no live connection and no recipient access controls.</p></section></main></body></html>`;
}
