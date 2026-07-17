import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { buildForecastInputs } from "@/lib/forecast/build";
import { runSimulation } from "@/lib/forecast/simulate";

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

  const inputs = buildForecastInputs(issues, findings, scope.teamCapacity ?? null);

  const result = runSimulation(
    { items: inputs.items, gates: inputs.gates, teamCapacity: inputs.teamCapacity },
    scope.targetDate
  );

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
    },
    likelyDate: result.likelyDate,
    earliestDate: result.earliestDate,
    latestDate: result.latestDate,
    confidenceAtTarget: result.confidenceAtTarget,
    breakdown: {
      remainingIssueCount: inputs.remainingIssueCount,
      unticketedFindingCount: inputs.unticketedFindingCount,
      teamCapacity: inputs.teamCapacity,
      teamCapacityInferred: inputs.teamCapacityInferred,
      remainingEffortDays: result.remainingEffortDays,
      decisionDelayDays: result.decisionDelayDays,
      blockingGates: inputs.gates.map((g) => ({ id: g.id, label: g.label })),
      topItems,
    },
  });
}
