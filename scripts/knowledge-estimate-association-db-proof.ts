import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import type { ProjectContextPackage } from "../lib/context/package";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";
assertDisposableDatabaseProofEnvironment(process.env, "CAPABILITY_ESTIMATE_DB_PROOF");
process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { NextRequest } = await import("next/server");
  const { PUT } = await import("../app/api/capabilities/[id]/estimate/route");
  const { buildPortfolioInputs } = await import("../lib/forecast/compute");
  const { acceptedCapabilityEstimate, reviewedCapabilityEstimate, reviewCapabilityKnowledgeEstimate } = await import("../lib/scope/knowledgeEstimates");
  const { setCanonicalCapabilityEstimate } = await import("../lib/scope/reality");
  try {
    const scope = await prisma.scope.create({ data: { name: "QA source binding only", teamKey: "JSA", projectNames: ["KIT JSA"], executionState: "configured" } });
    const first = await prisma.capability.create({ data: { scopeId: scope.id, name: "Fixture renamed card", status: "accepted", provenance: {}, workLinks: { create: { provider: "linear", externalId: "JSA-100", state: "active", provenance: {} } } } });
    const pkg: ProjectContextPackage = {
      version: "1.1", packageId: `association-db-proof:${scope.id}`, producer: "manual", generatedAt: new Date().toISOString(), scopeId: scope.id,
      sources: [], evidence: [{ id: "quote", sourceRef: "fixture://association", kind: "passage", excerpt: "Only the mapped slice has four to six developer days remaining, after the fixture dependency." }],
      intelligenceObjects: [{ id: "source-estimate", intelligenceType: "Observation", trust: "external_intelligence", isCurrent: true,
        statement: "Synthetic bounded slice, not a business estimate", evidenceRefs: ["quote"],
        fields: { capability_id: "wiki-semantic-key", capability_name: "Different source name", feature_id: "JSA-100", estimate: "4–6 developer days", estimate_covers: "remaining_work", estimate_range: "Only the mapped slice", note: "After the fixture dependency" } }],
      completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
    };
    const snapshot = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, packageId: pkg.packageId, packageVersion: pkg.version, producer: pkg.producer, package: pkg as unknown as Prisma.InputJsonValue, contextHash: "association-db-proof", completenessSummary: {} } });
    const body = { expectedRevision: first.revision, estimateId: "source-estimate", contextSnapshotId: snapshot.id, idempotencyKey: `association:${scope.id}:accepted`, review: {
      passageId: "quote", sourceWorkMeaning: "remaining", range: { low: 4, likely: 5, high: 6 }, rangeOrigin: { low: "verbatim", likely: "operator", high: "verbatim" },
      rationale: "Fixture reviewer supplied only midpoint.", quoteSupportsInterpretation: true, coveredOpenItemIds: ["JSA-100"], additionalOpenItemIds: [], boundaryStatement: "Only this fixture slice, after the stated dependency.", reviewerDisplayName: "Synthetic QA",
    } };
    const put = (id: string, value: unknown) => PUT(new NextRequest(`http://localhost/api/capabilities/${id}/estimate`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }), { params: Promise.resolve({ id }) });
    const read = async () => (await buildPortfolioInputs()).scopes.find((item) => item.scopeId === scope.id)!;
    const before = await read();
    assert.equal(before.capabilities.flatMap((card) => card.knowledgeEstimates).find((estimate) => estimate.id === "source-estimate")?.capabilityId, first.id, "real forecast read discovers foreign ID association");
    assert.equal((await prisma.capability.findUniqueOrThrow({ where: { id: first.id } })).acceptedEstimate, null, "read never accepts evidence");
    const candidate = before.capabilities.flatMap((card) => card.knowledgeEstimates).find((estimate) => estimate.id === "source-estimate")!;
    const reviewed = reviewCapabilityKnowledgeEstimate(candidate, body.review as Parameters<typeof reviewCapabilityKnowledgeEstimate>[1], { capabilityRevisionAtReview: first.revision, currentOpenItemIds: ["JSA-100"] });
    const racingInput = { expectedRevision: first.revision, estimate: reviewed, reviewedOpenItemIds: ["JSA-100"], expectedContextSnapshotId: snapshot.id, expectedScopeCapabilities: [{ id: first.id, revision: first.revision }], idempotencyKey: `association:${scope.id}:race` };
    const peer = await prisma.capability.create({ data: { scopeId: scope.id, name: "Unrelated peer added during review", status: "outside", provenance: {} } });
    await assert.rejects(setCanonicalCapabilityEstimate(first.id, racingInput), /Scope cards changed/);
    const census = [...racingInput.expectedScopeCapabilities, { id: peer.id, revision: peer.revision }];
    await prisma.capability.update({ where: { id: peer.id }, data: { revision: { increment: 1 } } });
    await assert.rejects(setCanonicalCapabilityEstimate(first.id, { ...racingInput, expectedScopeCapabilities: census }), /Scope cards changed/);
    assert.equal(await prisma.capabilityEvent.count({ where: { capabilityId: first.id } }), 0, "neither stale source match creates an acceptance event");
    const missingBoundary = await put(first.id, { ...body, idempotencyKey: `association:${scope.id}:missing`, review: { ...body.review, boundaryStatement: "" } });
    assert.equal(missingBoundary.status, 400);
    const acceptedResponse = await put(first.id, body);
    assert.equal(acceptedResponse.status, 200, await acceptedResponse.text());
    const row = await prisma.capability.findUniqueOrThrow({ where: { id: first.id } });
    const accepted = acceptedCapabilityEstimate(row.acceptedEstimate)!;
    assert.equal(accepted.version, "accepted-capability-estimate.v2");
    if (accepted.version !== "accepted-capability-estimate.v2") throw new Error("Wrong acceptance version");
    assert.equal(accepted.source.association?.sourceCapabilityId, "wiki-semantic-key");
    assert.equal(accepted.source.sourceConditions, "After the fixture dependency");
    assert.equal(accepted.source.exactQuote, pkg.evidence[0].excerpt);
    const afterAcceptance = await read();
    assert.equal(reviewedCapabilityEstimate(accepted, ["JSA-100"], afterAcceptance.capabilities.find((card) => card.id === first.id)!.knowledgeEstimates)?.status, "reviewed", "database JSON key ordering must not create false source drift");
    const second = await prisma.capability.create({ data: { scopeId: scope.id, name: "Fixture later slice", status: "outside", provenance: {}, workLinks: { create: { provider: "linear", externalId: "JSA-100", state: "active", provenance: {} } } } });
    const overlapping = await read();
    const current = overlapping.capabilities.find((card) => card.id === first.id)!.knowledgeEstimates;
    assert.equal(current[0].association?.candidateCapabilityIds.length, 2);
    assert.equal(reviewedCapabilityEstimate(accepted, ["JSA-100"], current)?.status, "review_required");
    const rejected = await put(second.id, { ...body, expectedRevision: second.revision, idempotencyKey: `association:${scope.id}:ambiguous` });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /multiple Scope cards/);
    assert.equal(await prisma.capabilityEvent.count({ where: { capabilityId: second.id } }), 0);
    assert.equal((await prisma.capability.findUniqueOrThrow({ where: { id: second.id } })).acceptedEstimate, null);
    const retry = await put(first.id, body);
    assert.equal(retry.status, 200, "lost-response retry still returns original receipt, not a new acceptance");
    assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: body.idempotencyKey } }), 1);
    console.log(JSON.stringify({ pass: true, disposableDatabaseOnly: true, scopeId: scope.id, foreignIdReadWriteParity: true, boundaryRequiredOnServer: true, frozenConditions: true, peerCardRaceRejected: true, outLaterAmbiguityRejected: true, ambiguityDriftBlocksPublishableBasis: true, retryCreatesNoNewAcceptance: true }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main();
