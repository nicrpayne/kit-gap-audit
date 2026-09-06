import type { Prisma, Report, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDecisionBriefReadModel } from "./readModel";
import { DECISION_BRIEF_VERSION, type BriefMode, type DecisionBriefV1 } from "./decisionBrief";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, type BriefRecipeV1 } from "./composer";
import { normalizeBriefRecipe } from "./composer";
import { buildBriefPresentation } from "./presentation";
import { renderAudienceBriefMarkdown } from "./audienceBriefRender";

export interface GeneratedReport {
  report: Report;
  brief: DecisionBriefV1;
  recipe: BriefRecipeV1;
  presentation: ReturnType<typeof buildBriefPresentation>;
}

/**
 * The only DecisionBrief persistence boundary.
 *
 * One server-owned read model is fully assembled first. The immutable JSON,
 * typed compatibility columns and Markdown export are then inserted together.
 * No renderer or historical reader is allowed to re-read owner state.
 */
export async function generateReport(
  scope: Scope,
  contextSnapshotId?: string | null,
  options?: { mode?: BriefMode; scenarioId?: string | null; scenarioSnapshot?: Prisma.InputJsonValue | null; recipe?: unknown }
): Promise<GeneratedReport> {
  if (options?.mode === "scenario") {
    throw new Error("Scenario Decision Brief generation requires a canonical server-owned scenario read model; live Reality cannot be relabeled as Scenario.");
  }
  const assembled = await buildDecisionBriefReadModel(scope, {
    contextSnapshotId,
    mode: options?.mode ?? "reality",
    scenarioId: options?.scenarioId ?? null,
  });
  // JSONB is the immutable source model. Normalize through the same JSON
  // boundary before rendering so floating-point representations cannot make
  // stored JSON re-render differently from the Markdown saved beside it.
  const brief = JSON.parse(JSON.stringify(assembled, (_key, value) =>
    typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1_000_000_000) / 1_000_000_000 : value
  )) as DecisionBriefV1;
  const recipe = normalizeBriefRecipe(options?.recipe, brief);
  const presentation = buildBriefPresentation(brief, recipe);
  const markdown = renderAudienceBriefMarkdown(brief, recipe);
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  const report = await prisma.report.create({
    data: {
      scopeId: scope.id,
      generatedAt: new Date(brief.identity.generatedAt),
      targetDate: brief.headline.targetDate.value ? new Date(brief.headline.targetDate.value) : null,
      likelyDate: new Date(window.likely),
      earliestDate: new Date(window.earliest),
      latestDate: new Date(window.latest),
      confidenceAtTarget: brief.headline.confidenceAtTarget.value,
      likelyDateDeltaDays: movement?.days ?? null,
      shippedCount: brief.changes.delivery.value.shipped.length,
      blockingCount: brief.calls.decisions.value.filter((decision) => decision.gated).length,
      resolvedSinceLastCount: brief.changes.audit.value.resolvedFindings.length,
      summaryMarkdown: markdown,
      contextSnapshotId: contextSnapshotId ?? brief.identity.sourceSnapshots.find((item) => item.owner === "ContextSnapshot")?.sourceId ?? null,
      briefVersion: DECISION_BRIEF_VERSION,
      briefSnapshot: brief as unknown as Prisma.InputJsonValue,
      recipeVersion: BRIEF_RECIPE_VERSION,
      briefRecipe: recipe as unknown as Prisma.InputJsonValue,
      presentationVersion: BRIEF_PRESENTATION_VERSION,
      mode: brief.identity.mode,
      scenarioSnapshot: options?.scenarioSnapshot ?? undefined,
    },
  });
  return { report, brief, recipe, presentation };
}
