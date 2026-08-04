import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeForecast } from "@/lib/forecast/compute";

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

  let result;
  try {
    result = await computeForecast(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    scope: {
      id: scope.id,
      name: scope.name,
      targetDate: scope.targetDate,
      teamCapacity: scope.teamCapacity,
      includeTriage: scope.includeTriage,
      estimationContext: scope.estimationContext,
      notionPageIds: scope.notionPageIds,
      figmaRefs: scope.figmaRefs,
    },
    notion: { docs: result.notionDocs, warning: result.notionWarning },
    figma: { refs: result.figmaRefs, warning: result.figmaWarning },
    contextDocs: result.contextDocs,
    contextComplete: result.contextComplete,
    contextIssues: result.contextIssues,
    likelyDate: result.likelyDate,
    earliestDate: result.earliestDate,
    latestDate: result.latestDate,
    confidenceAtTarget: result.confidenceAtTarget,
    scenarios: result.scenarios,
    breakdown: result.breakdown,
  });
}
