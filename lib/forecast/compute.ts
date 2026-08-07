import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues, type LinearIssueSummary } from "@/lib/linear";
import { buildForecastInputs, type CapacitySource } from "@/lib/forecast/build";
import { buildScenarios } from "@/lib/forecast/scenarios";
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

// The single Forecast pipeline: Linear issues + Findings + AI estimates +
// release context -> Monte Carlo simulation. Used by GET /api/forecast,
// report generation, and POST /api/refresh so all three always agree --
// there is exactly one place this math happens.
export async function computeForecast(scope: Scope): Promise<ForecastResult> {
  // Throws on Linear failure -- callers convert to a 502, same message
  // used everywhere else in the app.
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

  // Base run and scenario runs share a fixed RNG seed (see scenarios.ts),
  // so scenario deltas are lever-only and repeat calls are stable.
  const startDate = new Date();
  const { base, scenarios } = buildScenarios(inputs, startDate, scope.targetDate);

  const topItems = [...inputs.items]
    .sort((a, b) => b.likely - a.likely)
    .slice(0, 6)
    .map((i) => ({ id: i.id, label: i.label, likelyDays: i.likely }));

  return {
    issues,
    findings,
    notionDocs,
    notionWarning,
    figmaRefs,
    figmaWarning,
    contextDocs: contextDocsInfo,
    contextComplete,
    contextIssues,
    likelyDate: base.likelyDate,
    earliestDate: base.earliestDate,
    latestDate: base.latestDate,
    confidenceAtTarget: base.confidenceAtTarget,
    scenarios: scenarios.map((s) => ({
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
      capacityContributors: resolved.contributors,
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
