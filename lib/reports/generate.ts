import type { Scope, Report } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeForecast, type ForecastResult } from "@/lib/forecast/compute";
import { renderReportMarkdown, type ReportData } from "@/lib/reports/render";
import { computeChangesSince } from "@/lib/reports/changes";

export interface GeneratedReport {
  report: Report;
  forecast: ForecastResult;
}

// Generates a new leadership report: current Forecast + Decision Queue +
// what shipped/resolved since the previous report for this Scope (or
// "first report" framing if there isn't one). Reuses computeForecast so
// the numbers always agree with what's on /forecast. Throws on Linear
// failure -- callers convert to a 502, same message used everywhere else.
export async function generateReport(scope: Scope): Promise<GeneratedReport> {
  const forecast = await computeForecast(scope);
  const { findings, likelyDate, earliestDate, latestDate, confidenceAtTarget, scenarios } = forecast;

  const previousReport = await prisma.report.findFirst({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "desc" },
  });
  const since = previousReport?.generatedAt ?? null;
  const startDate = new Date();

  const changes = await computeChangesSince(scope, forecast, since);
  const shipped = changes.shipped;
  const resolvedSinceLast = changes.resolvedDecisions.map((d) => ({ title: d.title, resolution: d.resolution ?? "" }));

  const blockingDecisions = findings
    .filter((f) => f.type === "decision" && f.status === "open" && f.blocking)
    .map((f) => ({ title: f.title, owner: f.owner, blocks: f.blocks, quote: f.quote }));

  const nonBlockingDecisions = findings
    .filter((f) => f.type === "decision" && f.status === "open" && !f.blocking)
    .map((f) => ({ title: f.title, owner: f.owner, blocks: f.blocks, quote: f.quote }));

  const bestScenario = scenarios.reduce<{ label: string; deltaDays: number } | null>(
    (best, s) => (best === null || s.deltaDays < best.deltaDays ? { label: s.label, deltaDays: s.deltaDays } : best),
    null
  );

  const likelyDateDeltaDays = previousReport
    ? Math.round((likelyDate.getTime() - previousReport.likelyDate.getTime()) / 86400000)
    : null;

  const reportData: ReportData = {
    scopeName: scope.name,
    generatedAt: startDate,
    targetDate: scope.targetDate,
    likelyDate,
    earliestDate,
    latestDate,
    confidenceAtTarget,
    previousReportAt: previousReport?.generatedAt ?? null,
    likelyDateDeltaDays,
    shipped,
    blockingDecisions,
    nonBlockingDecisions,
    resolvedSinceLast,
    bestScenario,
  };

  const summaryMarkdown = renderReportMarkdown(reportData);

  const report = await prisma.report.create({
    data: {
      scopeId: scope.id,
      generatedAt: startDate,
      targetDate: scope.targetDate,
      likelyDate,
      earliestDate,
      latestDate,
      confidenceAtTarget,
      likelyDateDeltaDays,
      shippedCount: shipped.length,
      blockingCount: blockingDecisions.length,
      resolvedSinceLastCount: resolvedSinceLast.length,
      summaryMarkdown,
    },
  });

  return { report, forecast };
}
