import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import type { ProjectContextPackage } from "../lib/context/package";
import type { EstimateReviewInput } from "../lib/scope/knowledgeEstimates";
import type { OwnerWorkItem } from "../lib/scope/reality";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";

assertDisposableDatabaseProofEnvironment(process.env, "CAPABILITY_ESTIMATE_DB_PROOF");

process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;

let NextRequest: typeof import("next/server").NextRequest;
let acceptEstimate: typeof import("../app/api/capabilities/[id]/estimate/route").PUT;
let computeForecast: typeof import("../lib/forecast/compute").computeForecast;
let getScopedIssues: typeof import("../lib/linear").getScopedIssues;
let prisma: typeof import("../lib/prisma").prisma;
let capabilityKnowledgeEstimates: typeof import("../lib/scope/knowledgeEstimates").capabilityKnowledgeEstimates;
let isAcceptedCapabilityEstimateV2: typeof import("../lib/scope/knowledgeEstimates").isAcceptedCapabilityEstimateV2;
let reviewCapabilityKnowledgeEstimate: typeof import("../lib/scope/knowledgeEstimates").reviewCapabilityKnowledgeEstimate;
let createCanonicalCapability: typeof import("../lib/scope/reality").createCanonicalCapability;
let ScopeRealityConflictError: typeof import("../lib/scope/reality").ScopeRealityConflictError;
let setCanonicalCapabilityEstimate: typeof import("../lib/scope/reality").setCanonicalCapabilityEstimate;

async function loadDatabaseRuntime() {
  ({ NextRequest } = await import("next/server"));
  ({ PUT: acceptEstimate } = await import("../app/api/capabilities/[id]/estimate/route"));
  ({ computeForecast } = await import("../lib/forecast/compute"));
  ({ getScopedIssues } = await import("../lib/linear"));
  ({ prisma } = await import("../lib/prisma"));
  ({
    capabilityKnowledgeEstimates,
    isAcceptedCapabilityEstimateV2,
    reviewCapabilityKnowledgeEstimate,
  } = await import("../lib/scope/knowledgeEstimates"));
  ({
    createCanonicalCapability,
    ScopeRealityConflictError,
    setCanonicalCapabilityEstimate,
  } = await import("../lib/scope/reality"));
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

function owner(issue: Awaited<ReturnType<typeof getScopedIssues>>[number]): OwnerWorkItem {
  return {
    externalId: issue.identifier,
    externalUrl: issue.url ?? null,
    title: issue.title,
    state: issue.state,
    updatedAt: issue.updatedAt ?? null,
  };
}

function packageA(scopeId: string, firstCapabilityId: string, secondCapabilityId: string): ProjectContextPackage {
  return {
    version: "1.1",
    packageId: "estimate-acceptance-proof:A",
    producer: "manual",
    generatedAt: "2026-09-27T12:00:00.000Z",
    scopeId,
    sources: [{
      sourceType: "transcript",
      sourceRef: "fixture://estimate-review",
      registrationId: null,
      role: "estimate_evidence",
      status: "candidate",
      observedAt: "2026-09-27T11:00:00.000Z",
      succeeded: true,
      detail: "Synthetic exact-quote fixture.",
    }],
    evidence: [{
      id: "first-context-passage",
      sourceRef: "fixture://estimate-review",
      kind: "passage",
      excerpt: "The team first discussed notification scope without estimating it.",
    }, {
      id: "selected-exact-passage",
      sourceRef: "fixture://estimate-review",
      kind: "passage",
      excerpt: "The remaining notification work is four to six developer-days.",
      data: { speaker: "Synthetic developer", surroundingContext: "A fixture-only refinement excerpt." },
    }, {
      id: "second-capability-passage",
      sourceRef: "fixture://estimate-review",
      kind: "passage",
      excerpt: "The second capability has two to three developer-days remaining.",
    }],
    intelligenceObjects: [{
      id: "estimate-notifications",
      intelligenceType: "Commitment",
      trust: "external_intelligence",
      statement: "A bounded notification estimate was stated.",
      isCurrent: true,
      observedDate: "2026-09-27",
      evidenceRefs: ["first-context-passage", "selected-exact-passage"],
      fields: { capability_id: firstCapabilityId, duration_stated: "4–6 developer days" },
      provenance: { fixture: true },
    }, {
      id: "estimate-second",
      intelligenceType: "Commitment",
      trust: "external_intelligence",
      statement: "A bounded second estimate was stated.",
      isCurrent: true,
      observedDate: "2026-09-27",
      evidenceRefs: ["second-capability-passage"],
      fields: { capability_id: secondCapabilityId, duration_stated: "2–3 developer days" },
      provenance: { fixture: true },
    }],
    intelligenceRelations: [],
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
    warnings: ["Synthetic fixture; no provider read."],
  };
}

function packageB(scopeId: string, firstCapabilityId: string): ProjectContextPackage {
  return {
    version: "1.1",
    packageId: "estimate-acceptance-proof:B",
    producer: "manual",
    generatedAt: "2026-09-27T13:00:00.000Z",
    scopeId,
    sources: [{
      sourceType: "transcript", sourceRef: "fixture://estimate-review:B", registrationId: null,
      role: "estimate_evidence", status: "candidate", observedAt: "2026-09-27T12:30:00.000Z",
      succeeded: true, detail: "Newer changed-source fixture.",
    }],
    evidence: [{
      // Deliberately reuse both object and passage IDs across snapshots. The
      // immutable package contract makes these snapshot-scoped identities;
      // changed content must not inherit the prior review.
      id: "selected-exact-passage", sourceRef: "fixture://estimate-review:B", kind: "passage",
      excerpt: "The notification work is now nine to twelve developer-days.",
      data: { speaker: "Synthetic developer", surroundingContext: "A materially changed later assertion." },
    }],
    intelligenceObjects: [{
      id: "estimate-notifications", intelligenceType: "Commitment", trust: "external_intelligence",
      statement: "A materially different notification estimate was stated.", isCurrent: true,
      observedDate: "2026-09-27", evidenceRefs: ["selected-exact-passage"],
      fields: { capability_id: firstCapabilityId, duration_stated: "9–12 developer days" },
      provenance: { fixture: true },
    }],
    intelligenceRelations: [],
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
    warnings: ["Newer synthetic snapshot deliberately omits the prior estimate source."],
  };
}

async function snapshot(scopeId: string, pkg: ProjectContextPackage, createdAt: string) {
  return prisma.contextSnapshot.create({ data: {
    scopeId,
    packageId: pkg.packageId,
    packageVersion: pkg.version,
    producer: pkg.producer,
    package: json(pkg),
    contextHash: `fixture-hash:${pkg.packageId}`,
    completenessSummary: json({ status: "complete", activeSupplied: [], missingActive: [], paused: [], excluded: [], adHoc: [] }),
    createdAt: new Date(createdAt),
  } });
}

function reviewFor(passageId: string, coveredOpenItemIds: string[], low: number, likely: number, high: number): EstimateReviewInput {
  return {
    passageId,
    sourceWorkMeaning: "remaining",
    range: { low, likely, high },
    rangeOrigin: { low: "verbatim", likely: "operator", high: "verbatim" },
    rationale: "The quote explicitly states remaining developer-days; the reviewer supplied only the midpoint.",
    quoteSupportsInterpretation: true,
    coveredOpenItemIds,
    additionalOpenItemIds: [],
    reviewerDisplayName: "Synthetic delivery reviewer",
  };
}

function request(capabilityId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://signal.test/api/capabilities/${capabilityId}/estimate`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  await loadDatabaseRuntime();
  assert(!process.env.LINEAR_API_KEY, "proof must not have a live Linear credential");
  const scope = await prisma.scope.create({ data: {
    name: "Estimate acceptance DB fixture",
    teamKey: "JSA",
    projectNames: ["KIT JSA"],
    executionState: "configured",
  } });
  const issues = await getScopedIssues(scope);
  assert.equal(issues.length, 10, "fixture-only owner read must supply the synthetic JSA catalog");
  const firstWork = owner(issues.find((issue) => issue.identifier === "JSA-100")!);
  const secondWork = owner(issues.find((issue) => issue.identifier === "JSA-107")!);
  const first = await createCanonicalCapability(scope.id, {
    name: "Notifications acceptance fixture",
    work: [firstWork],
    idempotencyKey: "estimate-proof:create:first",
  });
  const second = await createCanonicalCapability(scope.id, {
    name: "Second acceptance fixture",
    work: [secondWork],
    idempotencyKey: "estimate-proof:create:second",
  });
  const source = packageA(scope.id, first.capability.id, second.capability.id);
  const sourceSnapshot = await snapshot(scope.id, source, "2026-09-27T12:00:00.000Z");
  const firstRevision = first.capability.revision;
  const acceptanceKey = "estimate-proof:accept:first";
  const validBody = {
    expectedRevision: firstRevision,
    estimateId: "estimate-notifications",
    contextSnapshotId: sourceSnapshot.id,
    idempotencyKey: acceptanceKey,
    review: reviewFor("selected-exact-passage", [firstWork.externalId], 4, 5, 6),
  };

  const invalidBody = {
    ...validBody,
    idempotencyKey: "estimate-proof:invalid-passage",
    review: { ...validBody.review, passageId: "not-a-real-passage" },
  };
  const invalid = await acceptEstimate(request(first.capability.id, invalidBody), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(invalid.status, 400, "an untraceable passage selection must be rejected");
  assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: invalidBody.idempotencyKey } }), 0);

  const crossActionKey = await acceptEstimate(request(first.capability.id, {
    ...validBody,
    idempotencyKey: "estimate-proof:create:first",
  }), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(crossActionKey.status, 409, "an earlier create event cannot masquerade as an estimate acceptance replay");

  const acceptedResponse = await acceptEstimate(request(first.capability.id, validBody), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(acceptedResponse.status, 200);
  const acceptedBody = await acceptedResponse.json() as { changed: boolean; capability: { revision: number; acceptedEstimate: unknown } };
  assert.equal(acceptedBody.changed, true);
  assert(isAcceptedCapabilityEstimateV2(acceptedBody.capability.acceptedEstimate));
  assert.equal(acceptedBody.capability.acceptedEstimate.source.passageId, "selected-exact-passage");
  assert.equal(acceptedBody.capability.acceptedEstimate.source.exactQuote, "The remaining notification work is four to six developer-days.");
  assert.notEqual(acceptedBody.capability.acceptedEstimate.source.exactQuote, source.evidence[0].excerpt, "selection must not silently use the first evidence ref");

  const event = await prisma.capabilityEvent.findUniqueOrThrow({ where: { idempotencyKey: acceptanceKey } });
  assert.equal(event.action, "accept_estimate_v2");
  const eventAfter = event.afterState as Record<string, unknown>;
  const eventEstimate = eventAfter.acceptedEstimate as { source: { passageId: string; exactQuote: string }; boundary: { coveredOpenItemIds: string[] } };
  assert.equal(eventEstimate.source.passageId, "selected-exact-passage");
  assert.equal(eventEstimate.source.exactQuote, "The remaining notification work is four to six developer-days.");
  assert.deepEqual(eventEstimate.boundary.coveredOpenItemIds, [firstWork.externalId]);

  const acceptedEstimate = acceptedBody.capability.acceptedEstimate;
  await assert.rejects(
    () => setCanonicalCapabilityEstimate(first.capability.id, {
      expectedRevision: firstRevision,
      estimate: acceptedEstimate,
      reviewedOpenItemIds: [firstWork.externalId],
      expectedContextSnapshotId: sourceSnapshot.id,
      idempotencyKey: "estimate-proof:stale-revision",
    }),
    (error) => error instanceof ScopeRealityConflictError && /current revision/.test(error.message),
  );
  await assert.rejects(
    () => setCanonicalCapabilityEstimate(first.capability.id, {
      expectedRevision: acceptedBody.capability.revision,
      estimate: acceptedEstimate,
      reviewedOpenItemIds: [],
      expectedContextSnapshotId: sourceSnapshot.id,
      idempotencyKey: "estimate-proof:boundary-conflict",
    }),
    (error) => error instanceof ScopeRealityConflictError && /open-work boundary changed/.test(error.message),
  );
  assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: { in: ["estimate-proof:stale-revision", "estimate-proof:boundary-conflict"] } } }), 0);

  const sourceEstimates = capabilityKnowledgeEstimates(source, sourceSnapshot.id, [
    { id: first.capability.id, name: first.capability.name },
    { id: second.capability.id, name: second.capability.name },
  ]);
  const secondSourceEstimate = sourceEstimates.find((estimate) => estimate.id === "estimate-second")!;
  const secondReviewed = reviewCapabilityKnowledgeEstimate(
    secondSourceEstimate,
    reviewFor("second-capability-passage", [secondWork.externalId], 2, 2.5, 3),
    { capabilityRevisionAtReview: second.capability.revision, currentOpenItemIds: [secondWork.externalId] },
  );
  const newerSnapshot = await snapshot(scope.id, packageB(scope.id, first.capability.id), "2026-09-27T13:00:00.000Z");
  await assert.rejects(
    () => setCanonicalCapabilityEstimate(second.capability.id, {
      expectedRevision: second.capability.revision,
      estimate: secondReviewed,
      reviewedOpenItemIds: [secondWork.externalId],
      expectedContextSnapshotId: sourceSnapshot.id,
      idempotencyKey: "estimate-proof:source-race",
    }),
    (error) => error instanceof ScopeRealityConflictError && /Knowledge changed while/.test(error.message),
  );
  assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: "estimate-proof:source-race" } }), 0);
  assert.equal((await prisma.capability.findUniqueOrThrow({ where: { id: second.capability.id } })).acceptedEstimate, null);

  const changedSourceForecast = await computeForecast(scope);
  assert.equal(changedSourceForecast.forecastCoverage.canonicalForecast, false, "same object ID with changed immutable source content must not inherit the old review");
  assert(changedSourceForecast.forecastCoverage.reasons.some((reason) => reason.code === "capability_estimate_review_required"));

  const staleNewRequest = await acceptEstimate(request(first.capability.id, {
    ...validBody,
    idempotencyKey: "estimate-proof:new-key-after-refresh",
  }), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(staleNewRequest.status, 409, "a new write from an old source snapshot must fail after refresh");

  const retry = await acceptEstimate(request(first.capability.id, validBody), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(retry.status, 200, "response-loss retry must resolve before today's source revalidation");
  const retryBody = await retry.json() as { changed: boolean; capability: { acceptedEstimate: unknown } };
  assert.equal(retryBody.changed, false);
  assert.deepEqual(retryBody.capability.acceptedEstimate, acceptedEstimate);
  assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: acceptanceKey } }), 1);

  const changedRetryRequest = await acceptEstimate(request(first.capability.id, {
    ...validBody,
    review: { ...validBody.review, range: { low: 4, likely: 5.5, high: 6 }, rationale: "A different reviewed midpoint under the same key." },
  }), { params: Promise.resolve({ id: first.capability.id }) });
  assert.equal(changedRetryRequest.status, 409, "the same idempotency key cannot acknowledge materially different review input");

  const stolenKey = await acceptEstimate(request(second.capability.id, { ...validBody }), { params: Promise.resolve({ id: second.capability.id }) });
  assert.equal(stolenKey.status, 409, "an idempotency key cannot replay a different capability's write");

  const storedFirst = await prisma.capability.findUniqueOrThrow({ where: { id: first.capability.id } });
  assert.deepEqual(storedFirst.acceptedEstimate, acceptedEstimate, "source refresh and rejected attempts must not mutate the accepted immutable package");
  assert.equal(newerSnapshot.scopeId, scope.id);

  console.log(JSON.stringify({
    ok: true,
    fixtureOnly: { linearCredentialPresent: false, issueCount: issues.length },
    exactQuote: { passageId: "selected-exact-passage", firstEvidenceRefIgnored: true },
    invalidReview: { status: invalid.status, eventRows: 0 },
    optimisticConflicts: { staleRevision: "rejected", boundaryMismatch: "rejected", eventRows: 0 },
    sourceBeforeCommitRace: { newerSnapshotId: newerSnapshot.id, staleSnapshotId: sourceSnapshot.id, eventRows: 0 },
    sameObjectIdChangedSource: { canonicalForecast: false, reviewRequired: true },
    responseLossRetry: { afterLaterSourceChange: "reused", changed: false, eventRows: 1 },
    idempotencyIdentity: { crossAction: "rejected", changedReview: "rejected", crossCapability: "rejected" },
    persistedEvent: { action: event.action, quote: eventEstimate.source.exactQuote, covered: eventEstimate.boundary.coveredOpenItemIds },
  }, null, 2));
}

main().finally(async () => {
  if (prisma) await prisma.$disconnect();
});
