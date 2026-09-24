import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { commitScopeProposal, ScopeRealityConflictError } from "../lib/scope/reality";

async function main() {
  const scope = await prisma.scope.create({ data: {
    name: "Disposable Scope V2 proof",
    teamKey: "PRF",
    projectNames: ["Disposable proof"],
    executionState: "not_configured",
  } });
  try {
    const capability = await prisma.capability.create({ data: {
      scopeId: scope.id,
      name: "Notifications",
      description: "Existing accepted product shape",
      status: "accepted",
      provenance: { authority: "Scope", source: "proof" },
    } });
    await prisma.capabilityWorkLink.createMany({ data: ["PRF-1", "PRF-2"].map((externalId) => ({
      capabilityId: capability.id,
      provider: "linear",
      externalId,
      state: "active",
      provenance: { authority: "Linear", source: "proof" },
    })) });
    const proposal = await prisma.scopeProposal.create({ data: {
      scopeId: scope.id,
      compilerVersion: "scope-reconciler-three-source-2.1",
      fingerprint: "db-proof-1",
      sourceWatermark: { linearAsOf: "2026-09-15T18:00:00.000Z" },
      summary: { likelyIn: 2, likelyOut: 0, boundaryReview: 0, confidentlyMatched: 2, suggested: 2, unresolved: 0 },
      items: { create: [
        {
          candidateKey: "reality:notifications", title: "Notifications", origins: ["knowledge", "reality", "linear"], reconciliationState: "aligned", conflicts: [], releaseSignal: "likely_in", confidence: "high", confidenceScore: 95,
          matchState: "confidently_matched", action: "link_existing", targetCapabilityId: capability.id, targetRevision: 1,
          workItemIds: ["PRF-1", "PRF-2", "PRF-3"], alreadyLinkedItemIds: ["PRF-1", "PRF-2"], rationale: { headline: "proof" }, provenance: { refs: ["proof"] },
        },
        {
          candidateKey: "knowledge:offline", title: "Offline support", origins: ["knowledge", "linear"], reconciliationState: "aligned", conflicts: [], releaseSignal: "likely_in", confidence: "high", confidenceScore: 90,
          matchState: "confidently_matched", action: "create_capability", workItemIds: ["PRF-11"],
          rationale: { headline: "proof" }, provenance: { refs: ["proof"] },
        },
        {
          candidateKey: "linear:notifications-follow-up", title: "Notifications follow-up", origins: ["linear"], reconciliationState: "execution_exception", conflicts: [], releaseSignal: "likely_in", confidence: "medium", confidenceScore: 70,
          matchState: "operator_corrected", action: "link_existing", targetCapabilityId: capability.id, targetRevision: 1,
          workItemIds: ["PRF-4"], alreadyLinkedItemIds: [], rationale: { headline: "proof" }, provenance: { refs: ["proof"] },
        },
      ] },
    }, include: { items: true } });
    const work = ["PRF-1", "PRF-2", "PRF-3", "PRF-4", "PRF-11"].map((externalId) => ({ externalId, externalUrl: null, title: externalId, state: "Todo", updatedAt: "2026-09-15T18:00:00.000Z" }));
    const selections = proposal.items.map((item) => ({
      itemId: item.id,
      targetCapabilityId: item.targetCapabilityId,
      expectedRevision: item.targetRevision,
      workItemIds: item.candidateKey === "reality:notifications" ? ["PRF-2", "PRF-3"] : item.workItemIds,
      releaseStatus: "accepted" as const,
    }));

    const first = await commitScopeProposal(scope.id, proposal.id, selections, work, "scope-v2-db-proof-commit");
    assert.equal(first.changed, true);
    const replay = await commitScopeProposal(scope.id, proposal.id, selections, work, "scope-v2-db-proof-commit");
    assert.equal(replay.changed, false, "same idempotency key must replay without a second write");

    const reality = await prisma.capability.findMany({ where: { scopeId: scope.id }, include: { workLinks: true, events: true }, orderBy: { name: "asc" } });
    assert.deepEqual(reality.map((item) => item.name), ["Notifications", "Offline support"]);
    assert.equal(reality.flatMap((item) => item.workLinks).length, 4);
    assert.deepEqual(reality.find((item) => item.id === capability.id)?.workLinks.map((link) => link.externalId).sort(), ["PRF-2", "PRF-3", "PRF-4"], "multiple reviewed items may update one capability atomically from the same base revision");
    assert.equal(reality.reduce((count, item) => count + item.events.length, 0), 3);
    assert.equal(await prisma.scopeProposalEvent.count({ where: { proposalId: proposal.id } }), 1);
    assert.equal((await prisma.scopeProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status, "committed");

    const conflicting = await prisma.scopeProposal.create({ data: {
      scopeId: scope.id, compilerVersion: "scope-reconciler-three-source-2.1", fingerprint: "db-proof-2",
      sourceWatermark: {}, summary: {}, items: { create: {
        candidateKey: "reality:notifications:stale", title: "Notifications", origins: ["knowledge", "reality", "linear"], reconciliationState: "aligned", conflicts: [], releaseSignal: "likely_in", confidence: "high", confidenceScore: 90,
        matchState: "confidently_matched", action: "link_existing", targetCapabilityId: capability.id, targetRevision: 1,
        workItemIds: ["PRF-21"], rationale: {}, provenance: {},
      } },
    }, include: { items: true } });
    await assert.rejects(
      () => commitScopeProposal(scope.id, conflicting.id, [{ itemId: conflicting.items[0].id, targetCapabilityId: capability.id, expectedRevision: 1, releaseStatus: "accepted" }], [{ externalId: "PRF-21", externalUrl: null, title: "PRF-21", state: "Todo", updatedAt: updatedAt() }], "scope-v2-db-proof-conflict"),
      ScopeRealityConflictError,
    );

    console.log(JSON.stringify({ ok: true, idempotentReplay: true, reviewedSubsetApplied: true, sharedTargetBatchApplied: true, optimisticConflictRejected: true, capabilityCount: reality.length, workLinkCount: 4, eventCount: 3 }, null, 2));
  } finally {
    await prisma.scope.delete({ where: { id: scope.id } });
    await prisma.$disconnect();
  }
}

function updatedAt() { return "2026-09-15T18:00:00.000Z"; }

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
