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

  let result;
  try {
    result = await generateReport(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ report: result.report });
}
