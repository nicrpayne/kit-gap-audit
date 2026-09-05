import "server-only";

import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeForecast } from "@/lib/forecast/compute";
import { computeChangesSince } from "@/lib/reports/changes";
import { capacityForecastContract } from "@/lib/capacity/contract";
import type { PolicyEvaluatedCompleteness } from "@/lib/context/sourcePolicy";
import {
  assembleDecisionBrief,
  type AuditObservationInput,
  type BriefMode,
  type Currentness,
  type DecisionBriefOwnerInputs,
  type DecisionBriefV1,
} from "./decisionBrief";

function completeness(value: unknown): PolicyEvaluatedCompleteness | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PolicyEvaluatedCompleteness>;
  return candidate.status === "complete" || candidate.status === "partial"
    ? candidate as PolicyEvaluatedCompleteness
    : null;
}

async function findingsForRun(run: { sourceId: string | null; contextSnapshotId: string | null }) {
  const predicates = [
    ...(run.sourceId ? [{ sourceId: run.sourceId }] : []),
    ...(run.contextSnapshotId ? [{ contextSnapshotId: run.contextSnapshotId }] : []),
  ];
  if (!predicates.length) return [];
  return prisma.finding.findMany({
    where: { OR: predicates },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      severity: true,
      createdAt: true,
      resolvedAt: true,
      sourceId: true,
      contextSnapshotId: true,
      evidenceRefs: true,
      matchedIssues: true,
    },
  });
}

async function auditObservations(scopeId: string): Promise<{ current: AuditObservationInput | null; prior: AuditObservationInput | null; providerChanges: string[]; comparisonCurrentness: Currentness; warnings: string[] }> {
  const [sources, snapshots] = await Promise.all([
    prisma.source.findMany({ where: { scopeId }, select: { id: true } }),
    prisma.contextSnapshot.findMany({ where: { scopeId }, select: { id: true, completenessSummary: true } }),
  ]);
  const sourceIds = sources.map((item) => item.id);
  const snapshotIds = snapshots.map((item) => item.id);
  const predicates = [
    ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
    ...(snapshotIds.length ? [{ contextSnapshotId: { in: snapshotIds } }] : []),
  ];
  if (!predicates.length) return { current: null, prior: null, providerChanges: [], comparisonCurrentness: "missing", warnings: [] };
  const runs = await prisma.auditRun.findMany({
    where: { OR: predicates },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
    select: { id: true, createdAt: true, sourceId: true, contextSnapshotId: true },
  });
  const mapped = await Promise.all(runs.map(async (run): Promise<AuditObservationInput> => ({
    runId: run.id,
    asOf: run.createdAt.toISOString(),
    sourceId: run.sourceId,
    contextSnapshotId: run.contextSnapshotId,
    findings: (await findingsForRun(run)).map((finding) => ({ ...finding, createdAt: finding.createdAt.toISOString(), resolvedAt: finding.resolvedAt?.toISOString() ?? null })),
  })));

  const summaryById = new Map(snapshots.map((snapshot) => [snapshot.id, completeness(snapshot.completenessSummary)]));
  const currentMissing = new Set(summaryById.get(runs[0]?.contextSnapshotId ?? "")?.missingActive.map((item) => item.sourceRef) ?? []);
  const priorMissing = new Set(summaryById.get(runs[1]?.contextSnapshotId ?? "")?.missingActive.map((item) => item.sourceRef) ?? []);
  const providerChanges = [
    ...[...currentMissing].filter((name) => !priorMissing.has(name)).map((name) => `Provider/source became unsupplied since the prior Audit: ${name}.`),
    ...[...priorMissing].filter((name) => !currentMissing.has(name)).map((name) => `Provider/source is supplied again since the prior Audit: ${name}.`),
  ];
  const sharedProvenance = !!runs[0] && !!runs[1] && (
    (!!runs[0].sourceId && runs[0].sourceId === runs[1].sourceId) ||
    (!!runs[0].contextSnapshotId && runs[0].contextSnapshotId === runs[1].contextSnapshotId)
  );
  const warnings = sharedProvenance
    ? ["Current/prior Audit runs share one source snapshot, and Findings have no AuditRun membership key; exact run delta is UNAVAILABLE."]
    : [];
  return {
    current: mapped[0] ?? null,
    prior: mapped[1] ?? null,
    providerChanges,
    comparisonCurrentness: !mapped[0] ? "missing" : sharedProvenance ? "unavailable" : "current",
    warnings,
  };
}

export async function loadDecisionBriefOwnerInputs(
  scope: Scope,
  options?: { contextSnapshotId?: string | null; mode?: BriefMode; scenarioId?: string | null }
): Promise<DecisionBriefOwnerInputs> {
  const generatedAt = new Date().toISOString();
  const forecast = await computeForecast(scope);
  const [previousReport, audit, decisions, dependencyScopes, people, allocations, settings, timelineEvents, contextSnapshot, kitConstruct] = await Promise.all([
    prisma.report.findFirst({
      where: { scopeId: scope.id },
      orderBy: { generatedAt: "desc" },
      select: { id: true, generatedAt: true, likelyDate: true, confidenceAtTarget: true },
    }),
    auditObservations(scope.id),
    prisma.decision.findMany({
      where: { OR: [{ scopeId: scope.id }, { gate: { targetScopeId: scope.id } }] },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        gate: { include: { targetScope: { select: { id: true, name: true } } } },
        evidence: { select: { id: true } },
      },
    }),
    prisma.scope.findMany({
      where: { id: { in: scope.dependsOnScopeIds } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.allocation.findMany(),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
    prisma.timelineEvent.findMany({
      where: { scopeId: scope.id },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, title: true, date: true, endDate: true, temporalState: true, sourceLabel: true },
    }),
    options?.contextSnapshotId
      ? prisma.contextSnapshot.findFirst({ where: { id: options.contextSnapshotId, scopeId: scope.id } })
      : prisma.contextSnapshot.findFirst({ where: { scopeId: scope.id }, orderBy: { createdAt: "desc" } }),
    prisma.scope.findFirst({ where: { name: { contains: "KIT Construct", mode: "insensitive" } }, select: { id: true } }),
  ]);
  const changes = await computeChangesSince(scope, forecast, previousReport?.generatedAt ?? null);
  const contextHealth = completeness(contextSnapshot?.completenessSummary);
  const missingSources = contextHealth?.missingActive.map((item) => item.sourceRef) ?? [];
  const contextCurrentness: Currentness = !contextSnapshot ? "missing" : contextHealth?.status === "partial" ? "stale" : "current";
  const capacityContract = capacityForecastContract(
    scope.id,
    people,
    allocations,
    settings?.contextSwitchCostPct ?? 0,
    forecast.breakdown.teamCapacity,
    forecast.breakdown.capacitySource
  );
  const contributors = forecast.breakdown.capacityContributors.map((contributor) => ({
    personId: contributor.personId,
    name: contributor.name,
    rawFte: contributor.fte * contributor.fraction,
    effectiveFte: contributor.effectiveFte,
    scopeCount: contributor.scopeCount,
  }));

  return {
    generatedAt,
    mode: options?.mode ?? "reality",
    scenarioId: options?.scenarioId ?? null,
    project: { id: scope.id, name: scope.name, targetDate: scope.targetDate?.toISOString() ?? null, asOf: generatedAt },
    context: {
      snapshotId: contextSnapshot?.id ?? null,
      packageId: contextSnapshot?.packageId ?? null,
      asOf: contextSnapshot?.createdAt.toISOString() ?? null,
      currentness: contextCurrentness,
      missingSources,
      warnings: [...forecast.contextIssues, ...audit.providerChanges],
    },
    forecast: {
      sourceId: `forecast:${scope.id}:${generatedAt}`,
      asOf: generatedAt,
      earliestDate: forecast.earliestDate.toISOString(),
      likelyDate: forecast.likelyDate.toISOString(),
      latestDate: forecast.latestDate.toISOString(),
      confidenceAtTarget: forecast.confidenceAtTarget,
      remainingIssueCount: forecast.breakdown.remainingIssueCount,
      unticketedFindingCount: forecast.breakdown.unticketedFindingCount,
      remainingEffortDays: forecast.breakdown.remainingEffortDays,
      decisionDelayDays: forecast.breakdown.decisionDelayDays,
      scenarios: forecast.scenarios.map((scenario) => ({ ...scenario, likelyDate: scenario.likelyDate.toISOString() })),
    },
    previousReport: previousReport ? {
      id: previousReport.id,
      generatedAt: previousReport.generatedAt.toISOString(),
      likelyDate: previousReport.likelyDate.toISOString(),
      confidenceAtTarget: previousReport.confidenceAtTarget,
    } : null,
    audit: { current: audit.current, prior: audit.prior, comparisonCurrentness: audit.comparisonCurrentness, warnings: audit.warnings },
    delivery: { shipped: changes.shipped },
    decisions: decisions.map((decision) => ({
      id: decision.id,
      scopeId: decision.scopeId,
      title: decision.title,
      status: decision.status,
      owner: decision.owner,
      neededBy: decision.neededBy?.toISOString() ?? null,
      createdAt: decision.createdAt.toISOString(),
      evidenceCount: decision.evidence.length,
      gate: decision.gate ? {
        id: decision.gate.id,
        targetScopeId: decision.gate.targetScopeId,
        targetScopeName: decision.gate.targetScope.name,
        dependency: decision.gate.dependency,
        evidenceForGate: decision.gate.evidenceForGate,
        low: decision.gate.low,
        likely: decision.gate.likely,
        high: decision.gate.high,
        serial: decision.gate.serial,
        provenance: decision.gate.provenance,
      } : null,
    })),
    dependencies: dependencyScopes.map((dependency) => ({ scopeId: dependency.id, name: dependency.name, likelyDate: null, currentness: "unavailable" })),
    capacity: {
      ...capacityContract,
      contextSwitchCostPct: settings?.contextSwitchCostPct ?? 0,
      contributors,
      asOf: generatedAt,
    },
    timeline: {
      asOf: generatedAt,
      events: timelineEvents.map((event) => ({
        ...event,
        date: event.date.toISOString(),
        endDate: event.endDate?.toISOString() ?? null,
        temporalState: event.temporalState === "planned" ? "planned" as const : "occurred" as const,
      })),
    },
    kitConstructAvailable: !!kitConstruct,
  };
}

export async function buildDecisionBriefReadModel(
  scope: Scope,
  options?: { contextSnapshotId?: string | null; mode?: BriefMode; scenarioId?: string | null }
): Promise<DecisionBriefV1> {
  return assembleDecisionBrief(await loadDecisionBriefOwnerInputs(scope, options));
}
