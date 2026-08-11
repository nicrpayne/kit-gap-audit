import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildProjectIntelligenceEnvelope } from "@/lib/context/envelope";

// Read-only composition endpoint: "give another tool/agent the Gap App's
// current delivery intelligence for this Scope." Never persists anything
// -- reading this endpoint creates no ContextSnapshot, Report, or Finding,
// no matter how many times it's called. Not MCP, not a Hermes push/pull
// path -- just a plain GET composing existing computeForecast/Momentum/
// Finding/capacity data plus whatever the latest deliberate ContextSnapshot
// (if any) says about this Scope's context health.
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  try {
    const envelope = await buildProjectIntelligenceEnvelope(scope);
    return NextResponse.json(envelope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
