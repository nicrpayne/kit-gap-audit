import type { Prisma, Report, Scope } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildDecisionBriefReadModel } from "./readModel";
import { DECISION_BRIEF_VERSION, isDecisionBriefV1, type BriefMode, type DecisionBriefV1 } from "./decisionBrief";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, type BriefRecipeV1 } from "./composer";
import { normalizeBriefRecipe } from "./composer";
import { buildBriefPresentation } from "./presentation";
import { renderAudienceBriefMarkdown } from "./audienceBriefRender";
import { assertGeneratedReportProse } from "./legacySanitization";
import { buildScenarioDecisionBriefReadModel, scenarioSnapshotJson } from "./scenario";
import { ScenarioReportValidationError, parseScenarioReportSnapshot } from "./scenario";
import { reportOwnerFingerprint } from "./ownerFingerprint";
import { withScopedIssueReadSnapshot } from "@/lib/linear";
import { normalizeReportJsonForPersistence } from "./persistenceNormalization";

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
  options?: { mode?: "reality"; recipe?: unknown }
): Promise<GeneratedReport> {
  // This boundary may persist only a standalone canonical Reality report.
  // Scenario publication must use generateReportComparison so both immutable
  // halves are committed atomically. Keep the runtime check for untyped JS or
  // stale callers in addition to the reality-only TypeScript signature.
  const requestedMode = (options as { mode?: unknown } | undefined)?.mode;
  if (requestedMode !== undefined && requestedMode !== "reality") {
    throw new ScenarioReportValidationError("A Scenario or comparison report must be published as an atomic Reality/Scenario pair.");
  }
  const assembled = await buildDecisionBriefReadModel(scope, {
    contextSnapshotId,
    mode: "reality",
    scenarioId: null,
  });
  const prepared = prepareReport(scope.id, assembled, contextSnapshotId, options?.recipe);
  const report = await prisma.report.create({ data: prepared.data });
  return { report, brief: prepared.brief, recipe: prepared.recipe, presentation: prepared.presentation };
}

export function prepareReport(
  scopeId: string, assembled: DecisionBriefV1, contextSnapshotId?: string | null,
  recipeInput?: unknown, scenarioSnapshot?: Prisma.InputJsonValue,
) {
  // JSONB is the immutable source model. Presentation numbers retain their
  // established stable-rendering normalization, while forecast.basis remains
  // the exact captured replay evidence rather than a rounded approximation.
  const brief = normalizeReportJsonForPersistence(assembled);
  const recipe = normalizeBriefRecipe(recipeInput, brief);
  const presentation = buildBriefPresentation(brief, recipe);
  const markdown = renderAudienceBriefMarkdown(brief, recipe);
  // Fail closed before the immutable write boundary. An upstream HTML error
  // page is evidence of a failed source read, never a report body.
  assertGeneratedReportProse(markdown);
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  const data: Prisma.ReportUncheckedCreateInput = {
      scopeId,
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
      scenarioSnapshot,
  };
  return { data, brief, recipe, presentation };
}

/** Both halves or neither. Provider reads/compilation happen once, outside
 * the short database transaction; changed owners fail closed, never rebase. */
export async function generateReportComparison(
  scope: Scope, scenarioSnapshot: unknown, recipe?: unknown,
): Promise<{ reality: GeneratedReport; scenario: GeneratedReport }> {
  const parsed = parseScenarioReportSnapshot(scenarioSnapshot);
  const requestHash = createHash("sha256").update(JSON.stringify({ scopeId: scope.id, scenario: parsed, recipe: recipe ?? null })).digest("hex");
  const existingPair = async (db: Prisma.TransactionClient) => {
    const rows = await db.report.findMany({ where: {
      scopeId: scope.id,
      briefSnapshot: { path: ["identity", "comparisonId"], equals: parsed.scenarioId },
    } });
    if (!rows.length) return null;
    const restore = (mode: BriefMode): GeneratedReport => {
      const matches = rows.filter((row) => row.mode === mode);
      const report = matches[0];
      if (matches.length !== 1 || !isDecisionBriefV1(report.briefSnapshot) || report.briefSnapshot.identity.comparisonRequestHash !== requestHash) {
        throw new ScenarioReportValidationError("This comparison ID already exists with different or incomplete contents. No reports were changed.");
      }
      const brief = report.briefSnapshot;
      const recipe = normalizeBriefRecipe(report.briefRecipe, brief);
      return { report, brief, recipe, presentation: buildBriefPresentation(brief, recipe) };
    };
    return { reality: restore("reality"), scenario: restore("scenario") };
  };
  const existing = await existingPair(prisma);
  if (existing) return existing;
  const baseline = await reportOwnerFingerprint(prisma);
  // The route's scope read may predate the fingerprint.
  const currentScope = await prisma.scope.findUniqueOrThrow({ where: { id: scope.id } });
  const pair = await withScopedIssueReadSnapshot(() => buildScenarioDecisionBriefReadModel(currentScope, parsed));
  pair.realityBrief.identity.comparisonRequestHash = requestHash;
  pair.brief.identity.comparisonRequestHash = requestHash;
  const reality = prepareReport(scope.id, pair.realityBrief, null, recipe);
  const scenario = prepareReport(scope.id, pair.brief, null, recipe, scenarioSnapshotJson(pair.scenarioSnapshot));
  const saved = await prisma.$transaction(async (tx) => {
    // Serialize retries for this logical comparison without a new schema.
    // PostgreSQL exposes this lock function as `void`, which Prisma cannot
    // deserialize. Casting preserves the blocking side effect while returning
    // a supported scalar type to the query engine.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.id}:${parsed.scenarioId}`}, 0))::text AS lock_result`;
    const existing = await existingPair(tx);
    if (existing) return existing;
    if (await reportOwnerFingerprint(tx) !== baseline) {
      throw new ScenarioReportValidationError("Report inputs changed during generation. Neither comparison report was saved. Refresh, review the Scenario, and retry.");
    }
    const realityReport = await tx.report.create({ data: reality.data });
    const scenarioReport = await tx.report.create({ data: scenario.data });
    return {
      reality: { report: realityReport, brief: reality.brief, recipe: reality.recipe, presentation: reality.presentation },
      scenario: { report: scenarioReport, brief: scenario.brief, recipe: scenario.recipe, presentation: scenario.presentation },
    };
  }, { isolationLevel: "Serializable", timeout: 15_000 });
  return saved;
}
