import { Prisma, PrismaClient } from "@prisma/client";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, buildBriefRecipe } from "../lib/reports/composer";
import { renderAudienceBriefMarkdown } from "../lib/reports/audienceBriefRender";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

if (process.env.REPORTS_DB_PROOF !== "1") throw new Error("Use only with a disposable demo database.");
const prisma = new PrismaClient();

async function main() {
  const scope = await prisma.scope.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  await prisma.reportPublication.deleteMany({ where: { report: { summaryMarkdown: { contains: "REPORTS_SITE_DEMO" } } } });
  await prisma.report.deleteMany({ where: { summaryMarkdown: { contains: "REPORTS_SITE_DEMO" } } });
  const owner = healthyOwnerFixture();
  owner.project.id = scope.id;
  owner.project.name = scope.name;
  const brief = assembleDecisionBrief(owner);
  const recipe = { ...buildBriefRecipe("delivery-leadership", "weekly-update", brief), promotedAskIds: ["decision-gated"] };
  const report = await prisma.report.create({ data: {
    scopeId: scope.id,
    generatedAt: new Date(brief.identity.generatedAt), targetDate: new Date(brief.headline.targetDate.value!),
    likelyDate: new Date(brief.headline.likelyWindow.value.likely), earliestDate: new Date(brief.headline.likelyWindow.value.earliest),
    latestDate: new Date(brief.headline.likelyWindow.value.latest), confidenceAtTarget: brief.headline.confidenceAtTarget.value,
    likelyDateDeltaDays: brief.headline.movement.value?.days, shippedCount: brief.changes.delivery.value.shipped.length,
    blockingCount: brief.calls.decisions.value.filter((item) => item.gated).length,
    resolvedSinceLastCount: brief.changes.audit.value.resolvedFindings.length,
    summaryMarkdown: `${renderAudienceBriefMarkdown(brief, recipe)}\n<!-- REPORTS_SITE_DEMO -->`,
    briefVersion: brief.version, briefSnapshot: brief as unknown as Prisma.InputJsonValue,
    recipeVersion: BRIEF_RECIPE_VERSION, briefRecipe: recipe as unknown as Prisma.InputJsonValue,
    presentationVersion: BRIEF_PRESENTATION_VERSION, mode: brief.identity.mode,
  } });
  console.log(JSON.stringify({ scopeId: scope.id, reportId: report.id }));
}

main().finally(() => prisma.$disconnect());
