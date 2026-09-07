import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { compileBootstrapPackage, executeBootstrapScan, persistCompiledPackage } from "../lib/bootstrap/scan";
import { readBootstrap } from "../lib/bootstrap/read";
import { richHistoricalCorpus, sparseCorpus } from "../lib/bootstrap/fixtures";

async function protectedCounts() {
  const [scope, contextSnapshot, decision, decisionGate, timelineEvent, person, allocation, report, sourceRegistration, finding, workEstimate] = await Promise.all([
    prisma.scope.count(), prisma.contextSnapshot.count(), prisma.decision.count(), prisma.decisionGate.count(),
    prisma.timelineEvent.count(), prisma.person.count(), prisma.allocation.count(), prisma.report.count(),
    prisma.sourceRegistration.count(), prisma.finding.count(), prisma.workEstimate.count(),
  ]);
  return { scope, contextSnapshot, decision, decisionGate, timelineEvent, person, allocation, report, sourceRegistration, finding, workEstimate };
}

async function main() {
const before = await protectedCounts();
const bootstrap = await prisma.projectBootstrap.create({ data: {
  canonicalName: "Disposable Phase One Proof", normalizedName: "disposable phase one proof", aliases: ["DPOP"],
  ownerHint: null, sourceHints: [], searchExistingKnowledge: true, status: "draft",
} });

try {
  const scan1 = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: bootstrap.id, sequence: 1, providerCoverage: [], metrics: {}, warnings: [],
  } });
  await executeBootstrapScan(scan1.id);
  const first = await readBootstrap(bootstrap.id);
  assert.equal(first?.bootstrap.status, "reviewing");
  assert.ok(first?.activePackage);
  assert.ok(first?.candidates.some((candidate) => candidate.kind === "missing_information"));

  const reviewed = first!.candidates[0];
  await prisma.$transaction([
    prisma.bootstrapCandidate.update({ where: { id: reviewed.id }, data: { status: "accepted" } }),
    prisma.bootstrapReviewEvent.create({ data: { bootstrapId: bootstrap.id, candidateId: reviewed.id, action: "disposition", fromStatus: "pending", toStatus: "accepted", detail: { proof: true } } }),
    prisma.projectBootstrap.update({ where: { id: bootstrap.id }, data: { reviewRevision: { increment: 1 } } }),
  ]);

  const scan2 = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: bootstrap.id, sequence: 2, providerCoverage: [], metrics: {}, warnings: [],
  } });
  await executeBootstrapScan(scan2.id);
  const reloaded = await readBootstrap(bootstrap.id);
  assert.equal(reloaded?.candidates.find((candidate) => candidate.id === reviewed.id)?.status, "accepted");
  assert.equal(reloaded?.scans[0].resultPackageId, reloaded?.activePackage?.id);
  assert.equal(reloaded?.boundary.canonicalWrites, 0);
  assert.equal(reloaded?.boundary.forecastEffect, 0);

  const identity = { canonicalName: "Harbor Relay", aliases: ["HR", "Relay"], sourceHints: [] };
  const richScan = await prisma.bootstrapScanRun.create({ data: { bootstrapId: bootstrap.id, sequence: 3, providerCoverage: [], metrics: {}, warnings: [] } });
  await persistCompiledPackage(richScan.id, compileBootstrapPackage(bootstrap.id, identity, richHistoricalCorpus, new Date("2026-09-06T18:00:00.000Z")));
  const richRead = await readBootstrap(bootstrap.id);
  const capability = richRead!.candidates.find((candidate) => candidate.kind === "capability")!;
  assert.ok(capability);
  await prisma.bootstrapCandidate.update({ where: { id: capability.id }, data: { status: "accepted" } });

  const sparseScan = await prisma.bootstrapScanRun.create({ data: { bootstrapId: bootstrap.id, sequence: 4, providerCoverage: [], metrics: {}, warnings: [] } });
  await persistCompiledPackage(sparseScan.id, compileBootstrapPackage(bootstrap.id, identity, sparseCorpus, new Date("2026-09-06T18:01:00.000Z")));
  assert.equal((await readBootstrap(bootstrap.id))!.candidates.some((candidate) => candidate.kind === "capability"), false);

  const returnScan = await prisma.bootstrapScanRun.create({ data: { bootstrapId: bootstrap.id, sequence: 5, providerCoverage: [], metrics: {}, warnings: [] } });
  await persistCompiledPackage(returnScan.id, compileBootstrapPackage(bootstrap.id, identity, richHistoricalCorpus, new Date("2026-09-06T18:02:00.000Z")));
  const returned = await readBootstrap(bootstrap.id);
  assert.equal(returned!.candidates.find((candidate) => candidate.kind === "capability")?.status, "accepted", "a reviewed candidate must not resurrect as pending after temporarily disappearing");

  const after = await protectedCounts();
  assert.deepEqual(after, before, "bootstrap scan and review must not write any protected Reality/Forecast owner");
  console.log(JSON.stringify({ bootstrapId: bootstrap.id, packageId: returned?.activePackage?.packageId, candidates: returned?.candidates.length, reviewRevision: returned?.bootstrap.reviewRevision, disappearanceReturnDisposition: "accepted", protectedBefore: before, protectedAfter: after }, null, 2));
} finally {
  await prisma.projectBootstrap.delete({ where: { id: bootstrap.id } });
  await prisma.$disconnect();
}
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
