import { NextRequest, NextResponse } from "next/server";
import { getScopedIssues } from "@/lib/linear";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const scopeId = req.nextUrl.searchParams.get("scopeId");
    const scope = scopeId
      ? await prisma.scope.findUnique({ where: { id: scopeId } })
      : await prisma.scope.findFirst({ orderBy: { createdAt: "asc" } });

    if (!scope) {
      return NextResponse.json(
        { ok: false, error: "No Scope configured. Add one at /scopes." },
        { status: 400 }
      );
    }

    const issues = await getScopedIssues(scope);

    return NextResponse.json({
      ok: true,
      scope: { id: scope.id, name: scope.name, teamKey: scope.teamKey, projectName: scope.projectName },
      issueCount: issues.length,
      sample: issues.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
