import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeForecast } from "@/lib/forecast/compute";
import { computeChangesSince } from "@/lib/reports/changes";
import { computeMomentum } from "@/lib/momentum/compute";
import { attributionSentence } from "@/lib/momentum/attribution";

// How many most-recent Reports feed the sparkline -- small on purpose,
// it's an at-a-glance trend line, not a chart worth panning/zooming.
const SPARKLINE_REPORT_COUNT = 10;

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

  // Momentum: live current forecast vs. the most recently STORED Report
  // (not a second live computation) -- Report is already the durable
  // snapshot history this Scope has, so comparing against it is exactly
  // "vs. last time we told someone a number", which is the honest
  // meaning of "moved since last report".
  const recentReports = await prisma.report.findMany({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "desc" },
    take: SPARKLINE_REPORT_COUNT,
    select: { generatedAt: true, likelyDate: true, confidenceAtTarget: true, targetDate: true },
  });
  const previousReport = recentReports[0] ?? null;

  let momentum = null;
  if (previousReport) {
    const changes = await computeChangesSince(scope, result, previousReport.generatedAt);
    const m = computeMomentum(
      { generatedAt: new Date(), likelyDate: result.likelyDate, confidenceAtTarget: result.confidenceAtTarget },
      previousReport
    );
    momentum = {
      ...m,
      attribution: attributionSentence(changes),
      sparkline: [
        ...[...recentReports].reverse().map((r) => ({
          generatedAt: r.generatedAt,
          likelyDate: r.likelyDate,
          targetDate: r.targetDate,
        })),
        { generatedAt: new Date(), likelyDate: result.likelyDate, targetDate: scope.targetDate },
      ],
    };
  }

  // Calibration track record (brief #8): stubbed until there's enough
  // history to say anything meaningful -- 4+ reports spanning 4+ weeks
  // for THIS Scope. No partial/approximate version in between; either
  // there's enough to be honest about, or there isn't.
  const reportCount = await prisma.report.count({ where: { scopeId: scope.id } });
  const oldestReport = await prisma.report.findFirst({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "asc" },
    select: { generatedAt: true },
  });
  const spanDays = oldestReport ? (Date.now() - oldestReport.generatedAt.getTime()) / 86400000 : 0;
  const calibration = {
    available: reportCount >= 4 && spanDays >= 28,
    reportCount,
    spanDays: Math.round(spanDays),
  };

  return NextResponse.json({
    momentum,
    calibration,
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
