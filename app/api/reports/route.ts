import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReport } from "@/lib/reports/generate";

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

// Generates one immutable DecisionBriefV1 from canonical owner reads.
export async function POST(req: NextRequest) {
  let body: { scopeId?: string; mode?: "reality" | "scenario"; scenarioId?: string | null; scenarioSnapshot?: unknown; recipe?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }
  if (body.mode && body.mode !== "reality" && body.mode !== "scenario") {
    return NextResponse.json({ error: "mode must be reality or scenario" }, { status: 400 });
  }
  if (body.mode === "scenario") {
    return NextResponse.json({
      error: "Scenario Decision Brief generation is UNAVAILABLE until a canonical server-owned scenario read model provides the complete window and provenance. Reports will not relabel live Reality as Scenario.",
    }, { status: 409 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  let result;
  try {
    result = await generateReport(scope, null, {
      mode: body.mode ?? "reality",
      scenarioId: body.scenarioId ?? null,
      scenarioSnapshot: body.scenarioSnapshot as never,
      recipe: body.recipe,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Decision Brief generation failed: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ report: result.report, brief: result.brief, recipe: result.recipe, presentation: result.presentation });
}
