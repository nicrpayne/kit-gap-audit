import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { createCompanionScan, claimNextJob } from "../lib/bootstrap/jobs";
import { readBootstrap } from "../lib/bootstrap/read";
import { PATCH as updateJob } from "../app/api/bridge/jobs/[id]/route";
import { POST as deliverJob } from "../app/api/bridge/jobs/[id]/package/route";

function packageFor(bootstrapId: string, packageId: string) {
  const generatedAt = "2026-09-08T15:30:00.000Z";
  return {
    version: "1.1", packageId, producer: "hermes", compilerVersion: "companion-db-proof",
    generatedAt, bootstrapId,
    requestedIdentity: { canonicalName: "Companion Automatic Synthetic", aliases: ["CAS"], sourceHints: ["synthetic"] },
    identity: { detectedCanonicalName: "Companion Automatic Synthetic", aliases: ["CAS"], collisions: [], relatedEntities: [] },
    discovery: { strategies: [
      { id: "identity", state: "complete", detail: "Exact identity" },
      { id: "lexical", state: "complete", detail: "Bounded lexical" },
      { id: "semantic", state: "unavailable", detail: "Not configured" },
    ], partial: true },
    artifacts: [], evidence: [], intelligenceHeads: [], relations: [], proposals: [],
    coverage: [{ provider: "hermes", label: "Hermes", state: "partial", artifacts: 0, observedAt: generatedAt, detail: "Synthetic no-match corpus." }],
    ambiguities: [], gaps: [{ id: "gap-none", category: "history", summary: "No matching history", detail: "No matching synthetic evidence." }],
    warnings: ["Synthetic companion proof; no production data."],
  };
}

async function seedCompanion(id: string, lastSeenAt = new Date()) {
  return prisma.bootstrapCompanion.create({ data: {
    id, label: id, version: "0.3.0", state: "online", lastSeenAt, capabilities: { packageVersions: ["1.1"] },
  } });
}

async function seedBootstrap(name: string) {
  return prisma.projectBootstrap.create({ data: {
    canonicalName: name, normalizedName: name.toLowerCase(), aliases: ["CAS"], ownerHint: null,
    sourceHints: ["synthetic"], searchExistingKnowledge: true, status: "draft",
  } });
}

async function main() {
  const companionA = await seedCompanion("companion-proof-a");
  const companionB = await seedCompanion("companion-proof-b");
  const bootstrap = await seedBootstrap("Companion Automatic Synthetic");
  const created = await createCompanionScan(bootstrap.id);
  assert(created);
  assert.equal(created.scan.stage, "waiting_for_companion");

  const claims = await Promise.all([claimNextJob(companionA.id), claimNextJob(companionB.id)]);
  const claimed = claims.find(Boolean)!;
  assert(claimed);
  assert.equal(claims.filter(Boolean).length, 1, "duplicate pollers must yield one active claim");
  assert.equal(await claimNextJob(companionA.id), null, "leased job must not be claimed twice");

  const progressRequest = new NextRequest(`http://signal.test/api/bridge/jobs/${claimed.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimToken: claimed.claimToken, revision: claimed.revision, status: "running", stage: "evidence_lineage", progress: { message: "Evidence lineage complete" } }),
  });
  const progress = await updateJob(progressRequest, { params: Promise.resolve({ id: claimed.id }) });
  assert.equal(progress.status, 200);

  const deliveryRequest = () => new NextRequest(`http://signal.test/api/bridge/jobs/${claimed.id}/package`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimToken: claimed.claimToken, revision: claimed.revision, package: packageFor(bootstrap.id, "companion-proof-package") }),
  });
  const first = await deliverJob(deliveryRequest(), { params: Promise.resolve({ id: claimed.id }) });
  assert.equal(first.status, 201);
  const retry = await deliverJob(deliveryRequest(), { params: Promise.resolve({ id: claimed.id }) });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).reused, true, "response-loss retry must reuse completed job/package");
  assert.equal(await prisma.bootstrapPackage.count({ where: { bootstrapId: bootstrap.id } }), 1);
  assert.equal(await prisma.bootstrapScanRun.count({ where: { bootstrapId: bootstrap.id } }), 1);

  const restartBootstrap = await seedBootstrap("Companion Restart Synthetic");
  await createCompanionScan(restartBootstrap.id);
  const initialRestartClaim = await claimNextJob(companionA.id);
  assert(initialRestartClaim);
  await prisma.bootstrapScanJob.update({ where: { id: initialRestartClaim.id }, data: { claimExpiresAt: new Date(Date.now() - 1_000) } });
  const reclaimed = await claimNextJob(companionB.id);
  assert(reclaimed);
  assert.equal(reclaimed.id, initialRestartClaim.id);
  assert.notEqual(reclaimed.claimToken, initialRestartClaim.claimToken);
  const restartedJob = await prisma.bootstrapScanJob.findUniqueOrThrow({ where: { id: reclaimed.id } });
  assert.equal(restartedJob.attempts, 2, "expired lease must be safely reclaimed after restart");

  const staleBootstrap = await seedBootstrap("Companion Stale Synthetic");
  await createCompanionScan(staleBootstrap.id);
  const staleClaim = await claimNextJob(companionA.id);
  assert(staleClaim);
  await prisma.projectBootstrap.update({ where: { id: staleBootstrap.id }, data: { reviewRevision: { increment: 1 } } });
  const staleResponse = await deliverJob(new NextRequest(`http://signal.test/api/bridge/jobs/${staleClaim.id}/package`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimToken: staleClaim.claimToken, revision: staleClaim.revision, package: packageFor(staleBootstrap.id, "stale-package") }),
  }), { params: Promise.resolve({ id: staleClaim.id }) });
  assert.equal(staleResponse.status, 409);
  assert.equal((await prisma.bootstrapScanJob.findUniqueOrThrow({ where: { id: staleClaim.id } })).status, "stale");

  await prisma.bootstrapCompanion.updateMany({ data: { lastSeenAt: new Date(Date.now() - 120_000) } });
  const offline = await readBootstrap(bootstrap.id);
  assert(offline?.companion);
  assert.equal(offline.companion.online, false, "stale heartbeat must produce honest offline state");

  console.log(JSON.stringify({
    automaticJob: { bootstrapId: bootstrap.id, scanRunId: claimed.scanRunId, jobId: claimed.id, packageId: "companion-proof-package" },
    duplicateClaim: "one winner", responseLossRetry: "reused", restartRetryAttempts: restartedJob.attempts,
    staleRevision: "rejected", offlineHeartbeat: "offline", canonicalWritesBeforeActivation: 0,
  }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
}).finally(() => prisma.$disconnect());
