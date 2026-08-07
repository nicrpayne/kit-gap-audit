import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ForecastResult } from "@/lib/forecast/compute";

export interface ChangesSinceShipped {
  identifier: string;
  title: string;
}

export interface ChangesSinceResolvedDecision {
  title: string;
  resolution: string | null;
}

// Everything that happened for a Scope since a point in time -- shared by
// lib/reports/generate.ts (diffing against the previous stored Report)
// and lib/momentum/attribution.ts (diffing the live forecast against the
// same). One implementation so "what shipped since last time" can never
// drift between a generated report and the live momentum chip.
export interface ChangesSince {
  shipped: ChangesSinceShipped[];
  resolvedDecisions: ChangesSinceResolvedDecision[];
  // Count of WorkEstimate rows created or refreshed since `since` --
  // WorkEstimate rows only ever exist for AI-produced estimates (see
  // lib/estimate/run.ts), so this count IS "tickets that got a real
  // estimate instead of a placeholder guess" without needing to
  // cross-reference against the current item list.
  freshEstimateCount: number;
}

export async function computeChangesSince(
  scope: Scope,
  forecast: Pick<ForecastResult, "issues" | "findings">,
  since: Date | null
): Promise<ChangesSince> {
  const shipped = forecast.issues
    .filter((i) => i.stateType === "completed" && i.completedAt && (!since || new Date(i.completedAt) > since))
    .map((i) => ({ identifier: i.identifier, title: i.title }));

  const resolvedDecisions = forecast.findings
    .filter(
      (f) => f.type === "decision" && f.status === "resolved" && f.resolvedAt && (!since || f.resolvedAt > since)
    )
    .map((f) => ({ title: f.title, resolution: f.resolution }));

  const freshEstimateCount = since
    ? await prisma.workEstimate.count({ where: { scopeId: scope.id, createdAt: { gt: since } } })
    : 0;

  return { shipped, resolvedDecisions, freshEstimateCount };
}
