// ProjectIntelligenceEnvelope v1 -- a read-only OUTPUT contract: "given
// current Reality (Linear, capacity, forecast) plus the latest deliberate
// context snapshot, what does the Gap App currently believe about
// delivery for this Scope." Composed on every read from data that already
// exists; NOTHING here is persisted, and building an envelope never
// creates a ContextSnapshot, Report, or Finding -- see
// docs/CONTEXT-MODEL.md.
//
// Deliberately does not duplicate any computation: forecast/momentum/
// capacity all come from the exact functions the rest of the app already
// uses (computeForecast, computeMomentum, capacityBasisFor via
// ForecastResult.breakdown.capacityBasis).

import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeForecast, type CapacityBasis } from "@/lib/forecast/compute";
import type { CapacitySource } from "@/lib/forecast/build";
import { computeMomentum } from "@/lib/momentum/compute";
import type { PolicyEvaluatedCompleteness } from "@/lib/context/sourcePolicy";

export interface EnvelopeFinding {
  id: string;
  type: string;
  title: string;
  blocking: boolean;
  owner: string | null;
  status: string;
  matchedIssues: string[];
  contextSnapshotId: string | null;
  evidenceRefs: string[];
}

export interface EnvelopeContextHealth {
  status: "complete" | "partial" | "unknown";
  missingSources: string[];
  pausedSources: string[];
  excludedSources: string[];
  adHocSources: string[];
}

export interface ProjectIntelligenceEnvelope {
  version: "1.0";
  scopeId: string;
  // When THIS envelope was composed -- distinct from context.
  // latestSnapshotCreatedAt below, which can be arbitrarily older. Never
  // implied to be the same instant.
  generatedAt: string;

  forecast: {
    likelyDate: string;
    earliestDate: string;
    latestDate: string;
    targetDate: string | null;
    confidenceAtTarget: number | null;
  };

  momentum: {
    previousGeneratedAt: string;
    dateDeltaDays: number;
    confidenceDeltaPct: number | null;
    stalled: boolean;
  } | null;

  capacity: {
    teamCapacity: number;
    source: CapacitySource;
    basis: CapacityBasis;
  };

  findings: {
    openCount: number;
    items: EnvelopeFinding[];
  };

  context: {
    // The most recent DELIBERATE ContextSnapshot for this Scope, if any --
    // never created by reading this endpoint. null means no package has
    // ever been accepted for this Scope, not that context is "fine."
    latestSnapshotId: string | null;
    latestSnapshotCreatedAt: string | null;
    producer: string | null;
    packageId: string | null;
    // Read verbatim from the snapshot's own GAP-APP-EVALUATED
    // completenessSummary (lib/context/sourcePolicy.ts) -- never
    // recomputed live against current SourceRegistration state, and never
    // trusted from the producer's own package.completeness. "unknown"
    // (not "complete") when no snapshot exists at all.
    health: EnvelopeContextHealth;
  };

  // Linear is a direct, structural execution source the Gap App owns --
  // never routed through Hermes or the package contract. Kept as its own
  // section so a caller can't confuse "package context health" with
  // "can we even read Linear right now."
  directSources: {
    linear: {
      configured: boolean;
      availableForCurrentComputation: boolean;
    };
  };

  warnings: string[];
}

function healthFromCompletenessSummary(summary: PolicyEvaluatedCompleteness): EnvelopeContextHealth {
  return {
    status: summary.status,
    missingSources: summary.missingActive.map((s) => s.sourceRef),
    pausedSources: summary.paused.map((s) => s.sourceRef),
    excludedSources: summary.excluded.map((s) => s.sourceRef),
    adHocSources: summary.adHoc.map((s) => s.sourceRef),
  };
}

// Throws on Linear failure, exactly like computeForecast (its own
// consumer) -- callers convert to a 502, same as every other route that
// wraps computeForecast.
export async function buildProjectIntelligenceEnvelope(scope: Scope): Promise<ProjectIntelligenceEnvelope> {
  const forecast = await computeForecast(scope);

  const previousReport = await prisma.report.findFirst({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "desc" },
  });
  const momentum = previousReport
    ? (() => {
        const m = computeMomentum(
          { generatedAt: new Date(), likelyDate: forecast.likelyDate, confidenceAtTarget: forecast.confidenceAtTarget },
          previousReport
        );
        return {
          previousGeneratedAt: m.previousGeneratedAt.toISOString(),
          dateDeltaDays: m.dateDeltaDays,
          confidenceDeltaPct: m.confidenceDeltaPct,
          stalled: m.stalled,
        };
      })()
    : null;

  // Same OR as lib/forecast/compute.ts/lib/estimate/runForScope.ts/
  // lib/audit/run.ts -- a Finding reaches this Scope via a legacy Source
  // or a package-derived ContextSnapshot.
  const openFindings = await prisma.finding.findMany({
    where: { OR: [{ source: { scopeId: scope.id } }, { contextSnapshot: { scopeId: scope.id } }], status: "open" },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, title: true, blocking: true, owner: true, status: true, matchedIssues: true, contextSnapshotId: true, evidenceRefs: true },
  });

  const latestSnapshot = await prisma.contextSnapshot.findFirst({
    where: { scopeId: scope.id },
    orderBy: { createdAt: "desc" },
  });

  const health: EnvelopeContextHealth = latestSnapshot
    ? healthFromCompletenessSummary(latestSnapshot.completenessSummary as unknown as PolicyEvaluatedCompleteness)
    : { status: "unknown", missingSources: [], pausedSources: [], excludedSources: [], adHocSources: [] };

  return {
    version: "1.0",
    scopeId: scope.id,
    generatedAt: new Date().toISOString(),
    forecast: {
      likelyDate: forecast.likelyDate.toISOString(),
      earliestDate: forecast.earliestDate.toISOString(),
      latestDate: forecast.latestDate.toISOString(),
      targetDate: scope.targetDate ? scope.targetDate.toISOString() : null,
      confidenceAtTarget: forecast.confidenceAtTarget,
    },
    momentum,
    capacity: {
      teamCapacity: forecast.breakdown.teamCapacity,
      source: forecast.breakdown.capacitySource,
      basis: forecast.breakdown.capacityBasis,
    },
    findings: {
      openCount: openFindings.length,
      items: openFindings,
    },
    context: {
      latestSnapshotId: latestSnapshot?.id ?? null,
      latestSnapshotCreatedAt: latestSnapshot?.createdAt.toISOString() ?? null,
      producer: latestSnapshot?.producer ?? null,
      packageId: latestSnapshot?.packageId ?? null,
      health,
    },
    // Linear is structural (Scope.projectNames/teamKey) and always
    // "configured" -- every Scope has one. availableForCurrentComputation
    // is true here because computeForecast() above only returns
    // successfully when its own Linear fetch succeeded; a Linear failure
    // throws before this point and the route converts it to a 502 rather
    // than returning a partial envelope pretending Linear was fine.
    directSources: { linear: { configured: true, availableForCurrentComputation: true } },
    warnings: forecast.contextIssues,
  };
}
