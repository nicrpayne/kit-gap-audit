import type { Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { runEstimation, issueEstimateInputs, findingEstimateInputs, type EstimateRunSummary } from "@/lib/estimate/run";
import { buildReleaseContext, type ReleaseContext } from "@/lib/estimate/context";

const DONE_STATE_TYPES = new Set(["completed", "canceled"]);

export interface EstimateForScopeResult {
  summary: EstimateRunSummary;
  context: ReleaseContext;
}

// Runs the AI estimation pass for a Scope's open tickets + un-ticketed
// findings. Content-hash cached (see runEstimation): unchanged items are
// never re-sent to the model. Used by POST /api/estimate and
// POST /api/refresh. Throws on Linear or model failure -- callers convert
// to a 502.
export async function runEstimationForScope(scope: Scope): Promise<EstimateForScopeResult> {
  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    throw new Error(`Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  // Estimate everything not done -- including Triage, so flipping the
  // include-Triage toggle later doesn't require a new estimation run.
  const openIssues = issues.filter((i) => !DONE_STATE_TYPES.has(i.stateType));

  const openFindings = await prisma.finding.findMany({
    where: { source: { scopeId: scope.id }, status: "open", type: { not: "decision" } },
    select: { id: true, title: true, quote: true, rationale: true, estimateHint: true },
  });

  const contextDocs = await prisma.contextDoc.findMany({
    where: { scopeId: scope.id },
    select: { label: true, content: true },
  });
  const context = await buildReleaseContext({ ...scope, contextDocs });

  try {
    const summary = await runEstimation(scope.id, context.context, [
      ...issueEstimateInputs(openIssues, context.contextHash),
      ...findingEstimateInputs(openFindings, context.contextHash),
    ]);
    return { summary, context };
  } catch (error) {
    throw new Error(`Estimation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
