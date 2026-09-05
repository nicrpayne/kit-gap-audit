import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint } from "../lib/reports/decisionBriefRender";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, buildBriefRecipe, isBriefRecipeV1 } from "../lib/reports/composer";
import { renderAudienceBriefMarkdown } from "../lib/reports/audienceBriefRender";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

if (process.env.REPORTS_DB_PROOF !== "1") throw new Error("Use only with a disposable proof database.");
const prisma = new PrismaClient();

async function main() {
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const before = JSON.stringify(brief);
  const scope = await prisma.scope.findFirstOrThrow({ where: { name: "JSA" } });
  const row = await prisma.report.create({ data: {
    scopeId: scope.id,
    generatedAt: new Date(brief.identity.generatedAt),
    targetDate: new Date(brief.headline.targetDate.value!),
    likelyDate: new Date(brief.headline.likelyWindow.value.likely),
    earliestDate: new Date(brief.headline.likelyWindow.value.earliest),
    latestDate: new Date(brief.headline.likelyWindow.value.latest),
    confidenceAtTarget: brief.headline.confidenceAtTarget.value,
    likelyDateDeltaDays: brief.headline.movement.value?.days,
    shippedCount: brief.changes.delivery.value.shipped.length,
    blockingCount: brief.calls.decisions.value.filter((decision) => decision.gated).length,
    resolvedSinceLastCount: brief.changes.audit.value.resolvedFindings.length,
    summaryMarkdown: renderAudienceBriefMarkdown(brief, recipe),
    briefVersion: brief.version,
    briefSnapshot: brief as unknown as Prisma.InputJsonValue,
    recipeVersion: BRIEF_RECIPE_VERSION,
    briefRecipe: recipe as unknown as Prisma.InputJsonValue,
    presentationVersion: BRIEF_PRESENTATION_VERSION,
    mode: brief.identity.mode,
  } });
  try {
    const saved = await prisma.report.findUniqueOrThrow({ where: { id: row.id } });
    assert.deepEqual(saved.briefSnapshot, JSON.parse(before));
    assert(isBriefRecipeV1(saved.briefRecipe));
    assert.equal(saved.summaryMarkdown, renderAudienceBriefMarkdown(brief, saved.briefRecipe));
    assert(saved.summaryMarkdown.includes(briefPayloadFingerprint(brief)));
    assert.equal(saved.recipeVersion, BRIEF_RECIPE_VERSION);
    assert.equal(saved.presentationVersion, BRIEF_PRESENTATION_VERSION);
    brief.headline.likelyWindow.value.likely = "2027-01-01T00:00:00.000Z";
    const unchanged = await prisma.report.findUniqueOrThrow({ where: { id: row.id } });
    assert.notEqual((unchanged.briefSnapshot as unknown as typeof brief).headline.likelyWindow.value.likely, brief.headline.likelyWindow.value.likely);
    console.log(`PASS Reports composer persistence: immutable snapshot + recipe + presentation version + exact Markdown (${row.id})`);
  } finally {
    await prisma.report.delete({ where: { id: row.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
