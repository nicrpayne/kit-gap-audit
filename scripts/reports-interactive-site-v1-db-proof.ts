import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { BRIEF_PRESENTATION_VERSION, BRIEF_RECIPE_VERSION, buildBriefRecipe } from "../lib/reports/composer";
import { renderAudienceBriefMarkdown } from "../lib/reports/audienceBriefRender";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { stableJson } from "../lib/reports/publication";
import { POST as preparePublication } from "../app/api/reports/[reportId]/publications/route";
import { PATCH as updatePublication } from "../app/api/publications/[publicationId]/route";

if (process.env.REPORTS_DB_PROOF !== "1") throw new Error("Use only with a disposable proof database.");
const prisma = new PrismaClient();
const reportIds: string[] = [];

async function createReport(scopeId: string, suffix: string) {
  const owner = healthyOwnerFixture();
  owner.project.id = scopeId;
  owner.project.name = `JSA ${suffix}`;
  owner.generatedAt = new Date(new Date(owner.generatedAt).getTime() + reportIds.length * 3_600_000).toISOString();
  const brief = assembleDecisionBrief(owner);
  const base = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const recipe = { ...base, promotedAskIds: ["decision-gated"] };
  const report = await prisma.report.create({ data: {
    scopeId,
    generatedAt: new Date(brief.identity.generatedAt),
    targetDate: new Date(brief.headline.targetDate.value!),
    likelyDate: new Date(brief.headline.likelyWindow.value.likely),
    earliestDate: new Date(brief.headline.likelyWindow.value.earliest),
    latestDate: new Date(brief.headline.likelyWindow.value.latest),
    confidenceAtTarget: brief.headline.confidenceAtTarget.value,
    likelyDateDeltaDays: brief.headline.movement.value?.days,
    shippedCount: brief.changes.delivery.value.shipped.length,
    blockingCount: brief.calls.decisions.value.filter((item) => item.gated).length,
    resolvedSinceLastCount: brief.changes.audit.value.resolvedFindings.length,
    summaryMarkdown: renderAudienceBriefMarkdown(brief, recipe),
    briefVersion: brief.version,
    briefSnapshot: brief as unknown as Prisma.InputJsonValue,
    recipeVersion: BRIEF_RECIPE_VERSION,
    briefRecipe: recipe as unknown as Prisma.InputJsonValue,
    presentationVersion: BRIEF_PRESENTATION_VERSION,
    mode: brief.identity.mode,
  } });
  reportIds.push(report.id);
  return report;
}

async function patch(id: string, status: string, extra: Record<string, string> = {}) {
  return updatePublication(new NextRequest(`http://signal.test/api/publications/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, ...extra }),
  }), { params: Promise.resolve({ publicationId: id }) });
}

async function main() {
  const scope = await prisma.scope.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  try {
    const report = await createReport(scope.id, "Publication N");
    const first = await preparePublication(new NextRequest(`http://signal.test/api/reports/${report.id}/publications`, { method: "POST" }), { params: Promise.resolve({ reportId: report.id }) });
    assert.equal(first.status, 201);
    const body = await first.json() as { publication: { id: string; status: string; bundleHash: string }; bundle: unknown; readiness: { ready: boolean }; handoffPrompt: string; revisionContext: { newerProjectTruthAvailable: boolean } };
    assert(body.readiness.ready);
    assert.equal(body.publication.status, "bundle_ready");
    assert.equal(body.publication.bundleHash.length, 64);
    assert.equal(body.revisionContext.newerProjectTruthAvailable, false);
    assert(body.handoffPrompt.includes("Keep the Site private"));
    const frozenBytes = stableJson(body.bundle);

    const duplicate = await preparePublication(new NextRequest(`http://signal.test/api/reports/${report.id}/publications`, { method: "POST" }), { params: Promise.resolve({ reportId: report.id }) });
    assert.equal(duplicate.status, 200, "same report and recipe reuse the exact sealed publication");
    assert.equal((await duplicate.json() as { publication: { id: string } }).publication.id, body.publication.id);

    assert.equal((await patch(body.publication.id, "previewed")).status, 409, "state transitions cannot skip operator attestations");
    assert.equal((await patch(body.publication.id, "handoff_opened")).status, 200);
    assert.equal((await patch(body.publication.id, "draft_generated", { externalArtifactId: "chatgpt-site-draft-proof" })).status, 200);
    assert.equal((await patch(body.publication.id, "previewed")).status, 200);
    assert.equal((await patch(body.publication.id, "published_shared")).status, 400, "publication cannot be claimed without a URL");
    assert.equal((await patch(body.publication.id, "published_shared", { externalUrl: "https://example.invalid/site-proof" })).status, 200);

    await createReport(scope.id, "Publication N+1");
    const afterNewTruth = await preparePublication(new NextRequest(`http://signal.test/api/reports/${report.id}/publications`, { method: "POST" }), { params: Promise.resolve({ reportId: report.id }) });
    assert.equal((await afterNewTruth.json() as { revisionContext: { newerProjectTruthAvailable: boolean } }).revisionContext.newerProjectTruthAvailable, true);
    const saved = await prisma.reportPublication.findUniqueOrThrow({ where: { id: body.publication.id } });
    assert.equal(stableJson(saved.bundleSnapshot), frozenBytes, "newer project truth cannot mutate publication N");
    assert.equal(saved.lastVerifiedState, "operator_attested_published_shared");
    assert.equal(saved.externalUrl, "https://example.invalid/site-proof");
    assert.equal(await prisma.reportPublication.count({ where: { reportId: report.id } }), 1);

    console.log(`PASS publication lifecycle: immutable bundle ${saved.bundleHash.slice(0, 12)} · ordered attestations · URL gate · N/N+1 history`);
  } finally {
    await prisma.reportPublication.deleteMany({ where: { reportId: { in: reportIds } } });
    await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
