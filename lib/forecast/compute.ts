import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues, type LinearIssueSummary } from "@/lib/linear";
import { buildForecastInputs, type CapacitySource, type ForecastInputs } from "@/lib/forecast/build";
import { buildScenarios } from "@/lib/forecast/scenarios";
import { runPortfolioSimulation, type ScopeSimulationSpec } from "@/lib/forecast/portfolio";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { estimateContentHash, findingContentHash } from "@/lib/estimate/run";
import { buildReleaseContext } from "@/lib/estimate/context";
import { resolveCapacity, type CapacityContributor } from "@/lib/capacity/resolve";

export interface ForecastFinding {
  id: string;
  type: string;
  title: string;
  status: string;
  blocking: boolean;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  quote: string;
  resolution: string | null;
  resolvedAt: Date | null;
}

export interface ForecastScenario {
  id: string;
  label: string;
  likelyDate: Date;
  deltaDays: number;
  confidenceAtTarget: number | null;
}

export interface ForecastResult {
  issues: LinearIssueSummary[];
  findings: ForecastFinding[];
  notionDocs: { id: string; title: string; chars: number }[];
  notionWarning: string | null;
  figmaRefs: { fileName: string; pageName: string; chars: number }[];
  figmaWarning: string | null;
  contextDocs: { label: string; chars: number }[];
  // False if any configured context source (Notion/Figma) failed to load.
  // A human on /forecast sees the warning text inline; an unattended
  // caller (Hermes via /api/refresh) needs an explicit flag instead --
  // context silently going stale is worse than a build/estimate failure,
  // since nothing else signals it.
  contextComplete: boolean;
  contextIssues: string[];
  likelyDate: Date;
  earliestDate: Date;
  latestDate: Date;
  confidenceAtTarget: number | null;
  scenarios: ForecastScenario[];
  breakdown: {
    remainingIssueCount: number;
    unticketedFindingCount: number;
    teamCapacity: number;
    teamCapacityInferred: boolean;
    capacitySource: CapacitySource;
    capacityContributors: CapacityContributor[];
    remainingEffortDays: { low: number; likely: number; high: number };
    decisionDelayDays: { low: number; likely: number; high: number };
    blockingGates: { id: string; label: string }[];
    topItems: { id: string; label: string; likelyDays: number }[];
    estimateQuality: ReturnType<typeof buildForecastInputs>["estimateQuality"];
    composition: ReturnType<typeof buildForecastInputs>["composition"];
    ai: ReturnType<typeof buildForecastInputs>["ai"];
  };
}

interface ScopeSimBundle {
  inputs: ForecastInputs;
  capacityContributors: CapacityContributor[];
  issues: LinearIssueSummary[];
  findings: ForecastFinding[];
  notionDocs: ForecastResult["notionDocs"];
  notionWarning: string | null;
  figmaRefs: ForecastResult["figmaRefs"];
  figmaWarning: string | null;
  contextDocs: ForecastResult["contextDocs"];
  contextComplete: boolean;
  contextIssues: string[];
}

// Everything needed to simulate ONE Scope: Linear issues + Findings +
// resolved capacity + release context -> ForecastInputs. Extracted so
// computeForecast can reuse it both for the Scope being forecast and
// (when it has dependencies) for every Scope in its dependency closure,
// without duplicating the Linear-fetch / capacity-resolution / context-
// build logic. Throws on Linear failure -- callers convert to a 502.
async function buildScopeSimInputs(scope: Scope): Promise<ScopeSimBundle> {
  const issues = await getScopedIssues(scope);

  const findings = await prisma.finding.findMany({
    where: { source: { scopeId: scope.id } },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      blocking: true,
      estimateHint: true,
      owner: true,
      blocks: true,
      quote: true,
      resolution: true,
      resolvedAt: true,
    },
  });

  const workEstimates = await prisma.workEstimate.findMany({ where: { scopeId: scope.id } });
  const estimates = new Map(
    workEstimates.filter((e) => e.source === "linear").map((e) => [e.externalId, e])
  );
  const findingEstimates = new Map(
    workEstimates.filter((e) => e.source === "finding").map((e) => [e.externalId, e])
  );

  let contextHash: string | undefined;
  let notionDocs: ForecastResult["notionDocs"] = [];
  let notionWarning: string | null = null;
  let figmaRefs: ForecastResult["figmaRefs"] = [];
  let figmaWarning: string | null = null;
  let contextDocsInfo: ForecastResult["contextDocs"] = [];
  try {
    const contextDocs = await prisma.contextDoc.findMany({
      where: { scopeId: scope.id },
      select: { label: true, content: true },
    });
    const ctx = await buildReleaseContext({ ...scope, contextDocs });
    contextHash = ctx.contextHash;
    notionDocs = ctx.notionDocs;
    notionWarning = ctx.notionWarning;
    figmaRefs = ctx.figmaRefs;
    figmaWarning = ctx.figmaWarning;
    contextDocsInfo = ctx.contextDocs;
  } catch (error) {
    notionWarning = error instanceof Error ? error.message : "Couldn't build release context";
  }

  // "Complete" means every configured source actually loaded, not just
  // "no warning" -- a Scope with zero Notion/Figma links configured has
  // nothing to fail, so it's trivially complete.
  const notionFailed = scope.notionPageIds.length > 0 && notionDocs.length === 0;
  const figmaFailed = scope.figmaRefs.length > 0 && figmaRefs.length === 0;
  const contextIssues = [notionWarning, figmaWarning].filter((w): w is string => !!w);
  const contextComplete = !notionFailed && !figmaFailed && contextIssues.length === 0;

  // Capacity fallback chain, stage 1: named-person Allocations override a
  // Scope's own explicit teamCapacity. Stage 2 (explicit-or-null ->
  // inferred from assignees) happens inside buildForecastInputs, which is
  // the only place with the Linear issue data that inference needs.
  // With zero Person rows anywhere (every Scope predating this feature),
  // resolveCapacity always returns { capacity: null, source: null },
  // making this whole block a no-op -- scope.teamCapacity flows through
  // exactly as it did before Allocations existed.
  const [people, allocations, portfolioSettings] = await Promise.all([
    prisma.person.findMany({ where: { active: true } }),
    prisma.allocation.findMany(),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const resolved = resolveCapacity(
    scope.id,
    scope.teamCapacity ?? null,
    people,
    allocations,
    portfolioSettings?.contextSwitchCostPct ?? 0
  );

  const inputs = buildForecastInputs(issues, findings, resolved.capacity, {
    includeTriage: scope.includeTriage,
    estimates,
    hashFor: (i) => estimateContentHash(i, contextHash),
    findingEstimates,
    findingHashFor: (f) => findingContentHash(f, contextHash),
    capacitySource: resolved.source ?? undefined,
  });

  return {
    inputs,
    capacityContributors: resolved.contributors,
    issues,
    findings,
    notionDocs,
    notionWarning,
    figmaRefs,
    figmaWarning,
    contextDocs: contextDocsInfo,
    contextComplete,
    contextIssues,
  };
}

export interface PortfolioScopeInput {
  scopeId: string;
  name: string;
  targetDate: Date | null;
  dependsOnScopeIds: string[];
  items: ForecastInputs["items"];
  gates: ForecastInputs["gates"];
  teamCapacity: number;
  capacitySource: CapacitySource;
  capacityContributors: CapacityContributor[];
  // Raw Scope.teamCapacity (or null), separate from the fully-resolved
  // `teamCapacity` above -- a hypothetical-override recompute (see
  // POST /api/portfolio/preview) needs this as resolveCapacity's own
  // "explicit" fallback rung when a preview removes every Allocation for
  // a Scope, rather than re-deriving it from scratch.
  explicitTeamCapacity: number | null;
}

export interface PortfolioInputs {
  startDate: Date;
  scopes: PortfolioScopeInput[];
  people: Awaited<ReturnType<typeof prisma.person.findMany>>;
  allocations: Awaited<ReturnType<typeof prisma.allocation.findMany>>;
  contextSwitchCostPct: number;
}

// The "expensive, once per page load" half of the Phase 2 performance
// split (see ROADMAP.md): fetches every Scope's Linear issues, findings,
// and release context -- exactly buildScopeSimInputs, reused verbatim,
// never a second implementation of that fetch -- plus every Person,
// Allocation, and the portfolio-wide switch-cost setting. The "cheap,
// every slider frame" half lives entirely client-side: lib/capacity/
// resolve.ts and lib/forecast/portfolio.ts are both pure/isomorphic, so
// the browser re-runs resolveCapacity + runPortfolioSimulation directly
// against this payload rather than round-tripping to a server route.
export async function buildPortfolioInputs(): Promise<PortfolioInputs> {
  const [scopes, people, allocations, portfolioSettings] = await Promise.all([
    prisma.scope.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    prisma.allocation.findMany(),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const startDate = new Date();
  const scopeInputs: PortfolioScopeInput[] = [];
  for (const scope of scopes) {
    const bundle = await buildScopeSimInputs(scope);
    scopeInputs.push({
      scopeId: scope.id,
      name: scope.name,
      targetDate: scope.targetDate,
      dependsOnScopeIds: scope.dependsOnScopeIds,
      items: bundle.inputs.items,
      gates: bundle.inputs.gates,
      teamCapacity: bundle.inputs.teamCapacity,
      capacitySource: bundle.inputs.capacitySource,
      capacityContributors: bundle.capacityContributors,
      explicitTeamCapacity: scope.teamCapacity,
    });
  }

  return {
    startDate,
    scopes: scopeInputs,
    people,
    allocations,
    contextSwitchCostPct: portfolioSettings?.contextSwitchCostPct ?? 0,
  };
}

// Collects a Scope's full transitive dependency closure (itself + every
// Scope it (in)directly depends on via dependsOnScopeIds), so
// runPortfolioSimulation has everything it needs to detect a cycle
// across the whole graph, not just a direct edge. Exported for testing
// against real Postgres without needing Linear (this only touches
// prisma.scope). Throws a clear error naming the unknown id rather than
// letting a later lookup silently produce undefined.
export async function collectDependencyClosure(rootScope: Scope): Promise<Scope[]> {
  const byId = new Map<string, Scope>();
  byId.set(rootScope.id, rootScope);
  const queue: Scope[] = [rootScope];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const depId of current.dependsOnScopeIds) {
      if (byId.has(depId)) continue;
      const dep = await prisma.scope.findUnique({ where: { id: depId } });
      if (!dep) {
        throw new Error(`Scope "${current.name}" depends on an unknown Scope id: ${depId}`);
      }
      byId.set(depId, dep);
      queue.push(dep);
    }
  }

  return [...byId.values()];
}

// The single Forecast pipeline: Linear issues + Findings + AI estimates +
// release context -> Monte Carlo simulation. Used by GET /api/forecast,
// report generation, and POST /api/refresh so all three always agree --
// there is exactly one place this math happens.
//
// A Scope with no dependsOnScopeIds (every Scope before Phase 1.5, and
// every Scope that doesn't opt in afterward) takes EXACTLY the code path
// this function always ran: buildScenarios computes both the base result
// and the scenario rows in one call, untouched. Only a Scope that
// explicitly sets dependsOnScopeIds takes the portfolio-aware branch,
// which threads its dependencies' own simulated completion days into its
// base result via lib/forecast/portfolio.ts. Scenario levers ("Paths to
// a sooner date") are NOT yet dependency-aware in either branch -- a
// known, deliberate limitation, since making the interactive levers
// respect dependencies too is Phase 2 territory, not this one.
export async function computeForecast(scope: Scope): Promise<ForecastResult> {
  const own = await buildScopeSimInputs(scope);
  const { inputs } = own;
  const startDate = new Date();

  let base: SimulationResult;
  let rawScenarios: ForecastScenario[];

  if (scope.dependsOnScopeIds.length === 0) {
    const scenarioRun = buildScenarios(inputs, startDate, scope.targetDate);
    base = scenarioRun.base;
    rawScenarios = scenarioRun.scenarios;
  } else {
    const closure = await collectDependencyClosure(scope);
    const specs: ScopeSimulationSpec[] = [];
    for (const s of closure) {
      const bundle = s.id === scope.id ? own : await buildScopeSimInputs(s);
      specs.push({
        scopeId: s.id,
        items: bundle.inputs.items,
        gates: bundle.inputs.gates,
        teamCapacity: bundle.inputs.teamCapacity,
        dependsOnScopeIds: s.dependsOnScopeIds,
        startDate,
        targetDate: s.targetDate,
      });
    }
    // Throws DependencyCycleError / MissingDependencyError on a bad
    // configuration -- surfaces to the caller the same way a Linear
    // failure does today (see route handlers), not yet given its own
    // distinct error status. Worth doing once a real UI can create a
    // cycle; today nothing can, since no Scope has a dependency set yet.
    const results = runPortfolioSimulation(specs);
    base = results.get(scope.id)!;
    rawScenarios = buildScenarios(inputs, startDate, scope.targetDate).scenarios;
  }

  const topItems = [...inputs.items]
    .sort((a, b) => b.likely - a.likely)
    .slice(0, 6)
    .map((i) => ({ id: i.id, label: i.label, likelyDays: i.likely }));

  return {
    issues: own.issues,
    findings: own.findings,
    notionDocs: own.notionDocs,
    notionWarning: own.notionWarning,
    figmaRefs: own.figmaRefs,
    figmaWarning: own.figmaWarning,
    contextDocs: own.contextDocs,
    contextComplete: own.contextComplete,
    contextIssues: own.contextIssues,
    likelyDate: base.likelyDate,
    earliestDate: base.earliestDate,
    latestDate: base.latestDate,
    confidenceAtTarget: base.confidenceAtTarget,
    scenarios: rawScenarios.map((s) => ({
      id: s.id,
      label: s.label,
      likelyDate: s.likelyDate,
      deltaDays: s.deltaDays,
      confidenceAtTarget: s.confidenceAtTarget,
    })),
    breakdown: {
      remainingIssueCount: inputs.remainingIssueCount,
      unticketedFindingCount: inputs.unticketedFindingCount,
      teamCapacity: inputs.teamCapacity,
      teamCapacityInferred: inputs.teamCapacityInferred,
      capacitySource: inputs.capacitySource,
      capacityContributors: own.capacityContributors,
      remainingEffortDays: base.remainingEffortDays,
      decisionDelayDays: base.decisionDelayDays,
      blockingGates: inputs.gates.map((g) => ({ id: g.id, label: g.label })),
      topItems,
      estimateQuality: inputs.estimateQuality,
      composition: inputs.composition,
      ai: inputs.ai,
    },
  };
}
