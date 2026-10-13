import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint } from "../lib/reports/decisionBriefRender";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, buildBriefRecipe, isBriefRecipeV1 } from "../lib/reports/composer";
import { renderAudienceBriefMarkdown } from "../lib/reports/audienceBriefRender";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";

if (process.env.REPORTS_DB_PROOF !== "1") throw new Error("Use only with a disposable proof database.");
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(database.hostname === "127.0.0.1" && database.port === "55434" && (database.pathname === "/signal_t0_test_1004" || (["/signal_t0_test_1008", "/signal_t0_test_1012"].includes(database.pathname) && database.username === "signal_t0_local")), "Disposable repair DB only");
const prisma = new PrismaClient();

async function main() {
  const scope = await prisma.scope.create({ data: { name: `Report persistence proof ${randomUUID()}`, teamKey: "PRF", executionState: "not_configured" } });
  try {
  const owner = healthyOwnerFixture(); owner.project.id = scope.id; owner.project.name = scope.name;
  const brief = assembleDecisionBrief(owner);
  const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const before = JSON.stringify(brief);
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
  }
  } finally { await prisma.scope.delete({ where: { id: scope.id } }); await prisma.$disconnect(); }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
