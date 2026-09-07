import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Bridge/Hermes discovery after activation: return accepted identity and
// aliases without exposing or requiring Linear configuration.
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  const scope = await prisma.scope.findUnique({
    where: { id: scopeId },
    include: { aliases: { orderBy: { createdAt: "asc" } }, activation: { select: { bootstrapId: true, reviewRevision: true } } },
  });
  if (!scope) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({
    project: { scopeId: scope.id, canonicalName: scope.name, aliases: scope.aliases.map((item) => item.alias) },
    bootstrap: scope.activation,
    execution: { state: scope.executionState, detail: scope.executionDetail },
  });
}
