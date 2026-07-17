import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { buildForecastInputs } from "@/lib/forecast/build";
import { buildScenarios } from "@/lib/forecast/scenarios";
import { estimateContentHash } from "@/lib/estimate/run";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  const scope = scopeId
    ? await prisma.scope.findUnique({ where: { id: scopeId } })
    : await prisma.scope.findFirst({ orderBy: { createdAt: "asc" } });

  if (!scope) {
    return NextResponse.json(
      { error: "No Scope configured. Add one at /scopes." },
      { status: 400 }
    );
  }

  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const findings = await prisma.finding.findMany({
    where: { source: { scopeId: scope.id } },
    select: { id: true, type: true, title: true, status: true, blocking: true, estimateHint: true },
  });

  const workEstimates = await prisma.workEstimate.findMany({
    where: { scopeId: scope.id, source: "linear" },
  });
  const estimates = new Map(workEstimates.map((e) => [e.externalId, e]));

  const inputs = buildForecastInputs(issues, findings, scope.teamCapacity ?? null, {
    includeTriage: scope.includeTriage,
    estimates,
    hashFor: estimateContentHash,
  });

  // Base run and scenario runs share a fixed RNG seed (see scenarios.ts),
  // so scenario deltas are lever-only and the page is stable on refresh.
  const startDate = new Date();
  const { base, scenarios } = buildScenarios(inputs, startDate, scope.targetDate);

  const topItems = [...inputs.items]
    .sort((a, b) => b.likely - a.likely)
    .slice(0, 6)
    .map((i) => ({ id: i.id, label: i.label, likelyDays: i.likely }));

  return NextResponse.json({
    scope: {
      id: scope.id,
      name: scope.name,
      targetDate: scope.targetDate,
      teamCapacity: scope.teamCapacity,
      includeTriage: scope.includeTriage,
      estimationContext: scope.estimationContext,
    },
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
      remainingEffortDays: base.remainingEffortDays,
      decisionDelayDays: base.decisionDelayDays,
      blockingGates: inputs.gates.map((g) => ({ id: g.id, label: g.label })),
      topItems,
      estimateQuality: inputs.estimateQuality,
      composition: inputs.composition,
      ai: inputs.ai,
    },
  });
}
