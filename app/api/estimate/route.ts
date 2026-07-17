import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { runEstimation } from "@/lib/estimate/run";

const DONE_STATE_TYPES = new Set(["completed", "canceled"]);

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

  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  // Estimate everything not done -- including Triage, so flipping the
  // include-Triage toggle later doesn't require a new estimation run.
  const openIssues = issues.filter((i) => !DONE_STATE_TYPES.has(i.stateType));

  const releaseContext = [
    `Scope: ${scope.name} (Linear team ${scope.teamKey}${scope.projectName ? `, project "${scope.projectName}"` : ""}).`,
    scope.estimationContext?.trim() ||
      "No further team context provided -- assume a small, competent product team.",
  ].join("\n");

  try {
    const summary = await runEstimation(scope.id, releaseContext, openIssues);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { error: `Estimation failed: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
