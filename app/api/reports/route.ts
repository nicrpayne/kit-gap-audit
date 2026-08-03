import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { buildForecastInputs } from "@/lib/forecast/build";
import { buildScenarios } from "@/lib/forecast/scenarios";
import { estimateContentHash, findingContentHash } from "@/lib/estimate/run";
import { buildReleaseContext } from "@/lib/estimate/context";
import { renderReportMarkdown, type ReportData } from "@/lib/reports/render";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }
  const reports = await prisma.report.findMany({
    where: { scopeId },
    orderBy: { generatedAt: "desc" },
  });
  return NextResponse.json({ reports });
}

// Generates a new leadership report: current Forecast + Decision Queue +
// what shipped/resolved since the previous report for this Scope (or
// "first report" framing if there isn't one). Reuses the same Forecast
// pipeline as GET /api/forecast so the numbers always agree with what's
// on that page.
export async function POST(req: NextRequest) {
  let body: { scopeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
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
  const estimates = new Map(workEstimates.filter((e) => e.source === "linear").map((e) => [e.externalId, e]));
  const findingEstimates = new Map(
    workEstimates.filter((e) => e.source === "finding").map((e) => [e.externalId, e])
  );

  let contextHash: string | undefined;
  try {
    contextHash = (await buildReleaseContext(scope)).contextHash;
  } catch {
    // Same fallback as /api/forecast: proceed without context rather than
    // failing the whole report if Notion/Figma are unreachable right now.
  }

  const inputs = buildForecastInputs(issues, findings, scope.teamCapacity ?? null, {
    includeTriage: scope.includeTriage,
    estimates,
    hashFor: (i) => estimateContentHash(i, contextHash),
    findingEstimates,
    findingHashFor: (f) => findingContentHash(f, contextHash),
  });

  const startDate = new Date();
  const { base, scenarios } = buildScenarios(inputs, startDate, scope.targetDate);

  const previousReport = await prisma.report.findFirst({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "desc" },
  });
  const since = previousReport?.generatedAt ?? null;

  const shipped = issues
    .filter((i) => i.stateType === "completed" && i.completedAt && (!since || new Date(i.completedAt) > since))
    .map((i) => ({ identifier: i.identifier, title: i.title }));

  const blockingDecisions = findings
    .filter((f) => f.type === "decision" && f.status === "open" && f.blocking)
    .map((f) => ({ title: f.title, owner: f.owner, blocks: f.blocks, quote: f.quote }));

  const nonBlockingDecisions = findings
    .filter((f) => f.type === "decision" && f.status === "open" && !f.blocking)
    .map((f) => ({ title: f.title, owner: f.owner, blocks: f.blocks, quote: f.quote }));

  const resolvedSinceLast = findings
    .filter(
      (f) =>
        f.type === "decision" &&
        f.status === "resolved" &&
        f.resolvedAt &&
        (!since || f.resolvedAt > since)
    )
    .map((f) => ({ title: f.title, resolution: f.resolution ?? "" }));

  const bestScenario = scenarios.reduce<{ label: string; deltaDays: number } | null>(
    (best, s) => (best === null || s.deltaDays < best.deltaDays ? { label: s.label, deltaDays: s.deltaDays } : best),
    null
  );

  const likelyDateDeltaDays = previousReport
    ? Math.round((base.likelyDate.getTime() - previousReport.likelyDate.getTime()) / 86400000)
    : null;

  const reportData: ReportData = {
    scopeName: scope.name,
    generatedAt: startDate,
    targetDate: scope.targetDate,
    likelyDate: base.likelyDate,
    earliestDate: base.earliestDate,
    latestDate: base.latestDate,
    confidenceAtTarget: base.confidenceAtTarget,
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
      likelyDate: base.likelyDate,
      earliestDate: base.earliestDate,
      latestDate: base.latestDate,
      confidenceAtTarget: base.confidenceAtTarget,
      likelyDateDeltaDays,
      shippedCount: shipped.length,
      blockingCount: blockingDecisions.length,
      resolvedSinceLastCount: resolvedSinceLast.length,
      summaryMarkdown,
    },
  });

  return NextResponse.json({ report });
}
