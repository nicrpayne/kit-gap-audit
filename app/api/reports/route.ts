import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReport, generateReportComparison } from "@/lib/reports/generate";
import { ForecastUnavailableError } from "@/lib/forecast/compute";
import { ForecastCoverageIncompleteError } from "@/lib/forecast/coverage";
import { CapacityReconciliationIncompleteError } from "@/lib/capacity/contract";
import { ScenarioReportValidationError } from "@/lib/reports/scenario";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }
  const reports = await prisma.report.findMany({
    where: { scopeId },
    orderBy: [{ generatedAt: "desc" }, { mode: "asc" }, { id: "desc" }],
  });
  return NextResponse.json({ reports });
}

// Generates one immutable DecisionBriefV1 from canonical owner reads.
export async function POST(req: NextRequest) {
  let body: { scopeId?: string; mode?: "reality" | "scenario" | "comparison"; scenarioId?: string | null; scenarioSnapshot?: unknown; recipe?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }
  if (body.mode && body.mode !== "reality" && body.mode !== "scenario" && body.mode !== "comparison") {
    return NextResponse.json({ error: "mode must be reality, scenario or comparison" }, { status: 400 });
  }
  if ((body.mode === "scenario" || body.mode === "comparison") && (!body.scenarioId || !body.scenarioSnapshot)) {
    return NextResponse.json({ error: "scenarioId and a complete scenarioSnapshot are required for a Scenario report." }, { status: 400 });
  }
  if ((body.mode === "scenario" || body.mode === "comparison") &&
      (typeof body.scenarioSnapshot !== "object" || body.scenarioSnapshot === null ||
       (body.scenarioSnapshot as { scenarioId?: unknown }).scenarioId !== body.scenarioId)) {
    return NextResponse.json({ error: "scenarioId must match the snapshot." }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  let result;
  try {
    if (body.mode === "comparison" || body.mode === "scenario") {
      const pair = await generateReportComparison(scope, body.scenarioSnapshot, body.recipe);
      // Legacy Scenario callers also get an atomic pair. Keep their response
      // fields while exposing the matching Reality explicitly.
      return NextResponse.json({ ...pair, ...pair.scenario, comparisonId: pair.scenario.brief.identity.comparisonId });
    }
    result = await generateReport(scope, null, {
      recipe: body.recipe,
    });
  } catch (error) {
    if (error instanceof ForecastUnavailableError) {
      return NextResponse.json({ unavailable: true, code: error.code, error: `Report unavailable: ${error.reason}. Signal will not fabricate a delivery brief without a reliable Forecast.` }, { status: 409 });
    }
    if (error instanceof ForecastCoverageIncompleteError) {
      return NextResponse.json({
        unavailable: true,
        code: error.code,
        forecastCoverage: error.coverage,
        error: `Report not ready: ${error.coverage.reason}. Signal will not promote a modeled subset into a project delivery brief.`,
      }, { status: 409 });
    }
    if (error instanceof CapacityReconciliationIncompleteError) {
      return NextResponse.json({
        unavailable: true,
        code: error.code,
        capacityContract: error.contract,
        error: "Report not ready: named capacity is not reconciled to Forecast capacity. Signal will not publish a delivery brief from an unowned staffing assumption.",
      }, { status: 409 });
    }
    if (error instanceof ScenarioReportValidationError) {
      return NextResponse.json({ unavailable: true, code: "SCENARIO_STALE_OR_INVALID", error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: `Decision Brief generation failed: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ report: result.report, brief: result.brief, recipe: result.recipe, presentation: result.presentation });
}
