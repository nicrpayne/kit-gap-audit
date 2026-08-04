import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runEstimationForScope } from "@/lib/estimate/runForScope";

// Runs the AI estimation pass for a Scope's open tickets. Content-hash
// cached: unchanged tickets are never re-sent to the model, so re-running
// after a Linear sync only costs calls for what actually changed.
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

  try {
    const { summary, context } = await runEstimationForScope(scope);
    return NextResponse.json({
      ok: true,
      ...summary,
      notionDocs: context.notionDocs,
      notionWarning: context.notionWarning,
      figmaRefs: context.figmaRefs,
      figmaWarning: context.figmaWarning,
      contextDocs: context.contextDocs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Estimation failed" },
      { status: 502 }
    );
  }
}
