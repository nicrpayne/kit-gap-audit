import { EMPTY_SCENARIO, type ProjectScope, type ProjectPayload, type ProjectModel, type ScopeWorkItem, type SuiteScenario } from "../../lib/instrument/useProject";
import { evaluateForecastCoverage } from "../../lib/forecast/coverage";
import { scenarioForecastCoverage } from "../../lib/scenario/forecastCoverage";
import { scenarioWorkItems } from "../../lib/scenario/workItems";
import { runPortfolioSimulation } from "../../lib/forecast/portfolio";

/** Entirely fictional, deterministic fixture. No project snapshots or DB. */
export function provisionalFixture(): ProjectPayload {
  const item = (id: string, label: string): ScopeWorkItem => ({ id, label, low: 2, likely: 3, high: 5, estimateSource: "issue_placeholder", kind: "ticket", state: "In Progress", assignee: null, points: null, quote: null, rationale: null, parentIdentifier: null, parentTitle: null, projectName: "Fictional planning" });
  const items = [item("DEMO-1", "Reviewed capture"), item("DEMO-2", "Upload reuse integration"), item("DEMO-3", "Notification delivery"), item("DEMO-4", "Later analytics")];
  const card = (id: string, ids: string[], status: string): ProjectScope["capabilities"][number] => ({ id, name: id, status, revision: 1, sortOrder: 0, description: null, updatedAt: "2026-10-27T00:00:00Z", workLinkCount: ids.length, provenance: null, evidenceTrace: [], events: [], knowledgeEstimates: [], acceptedEstimate: null, estimateReview: null, workLinks: ids.map(externalId => ({ id: `link-${externalId}`, provider: "linear", state: "active", externalId, externalUrl: null })) });
  const capabilities = [card("Capture", ["DEMO-1"], "accepted"), card("Later", ["DEMO-4"], "outside")];
  const coverage = evaluateForecastCoverage({ executionState: "configured", issueIds: items.map(item => item.id), capabilities, openShapeDecisionCount: 0 });
  const source = { asOf: "2026-10-26T00:00:00Z", provider: "Linear" as const, temporalRole: "live" as const, availability: "available" as const };
  const scope: ProjectScope = {
    scopeId: "fictional-project", name: "Fictional Northstar", currentContextSnapshotId: "fictional-source", targetDate: "2026-11-15", dependsOnScopeIds: [],
    items: [items[0]], forecastItems: [items[0]], executionItems: items, completedWork: [], gates: [],
    teamCapacity: 1, capacitySource: "explicit", explicitTeamCapacity: 1, capacityBasis: { kind: "explicit", value: 1 },
    capacityContract: { scopeId: "fictional-project", workforceFte: 1, namedRawFte: 1, namedEffectiveFte: 1, forecastEffectiveFte: 1, source: "explicit", status: "named_exact", reconciles: true },
    lastReport: null, reportHistory: [], forecastSource: source, executionSource: source, forecastCoverage: coverage, forecastReadiness: { state: "modeled_subset", reason: coverage.reason },
    executionState: "configured", executionDetail: null, realityState: { realityRevision: 1, computedRevision: 1, status: "current", readiness: null }, capabilities, openShapeQuestions: [],
  };
  const other = structuredClone(scope); other.scopeId = "fictional-other"; other.name = "Fictional Other"; other.capabilities = [];
  other.items = [item("OTHER-1", "Separate project work")]; other.executionItems = other.items; other.forecastItems = other.items;
  other.forecastCoverage = evaluateForecastCoverage({ executionState: "configured", issueIds: ["OTHER-1"], capabilities: [], openShapeDecisionCount: 0 });
  return { startDate: "2026-10-27T00:00:00Z", forecastSource: source, scopes: [scope, other], people: [], allocations: [], contextSwitchCostPct: 0, decisions: [], sources: [], findings: [], reports: [] };
}

export function provisionalModel(data = provisionalFixture(), scenario: SuiteScenario = structuredClone(EMPTY_SCENARIO), active = false): ProjectModel {
  const startDate = new Date(data.startDate);
  const run = (useScenario: boolean) => runPortfolioSimulation(data.scopes.map(scope => ({ scopeId: scope.scopeId, items: useScenario ? scenarioWorkItems(scope, scenario) : scope.forecastItems, gates: scope.gates, dependsOnScopeIds: scope.dependsOnScopeIds, teamCapacity: useScenario ? scenario.capacityOverrideByScope[scope.scopeId] ?? scope.teamCapacity : scope.teamCapacity, startDate, targetDate: scope.targetDate ? new Date(scope.targetDate) : null })));
  return { data, loading: false, error: null, reload() {}, startDate, simulationError: null, scenarioPreviewRefusal: null, capacityPlanError: null, baseline: run(false), preview: run(active), previewPending: false,
    coverageByScope: scenarioForecastCoverage(data.scopes, scenario, active, data.decisions), scenario, setScenario() {}, active, momentumByScope: new Map(), portfolioLikely: { date: null, gatedBy: null, deltaDays: 0 }, floorByScope: null };
}
