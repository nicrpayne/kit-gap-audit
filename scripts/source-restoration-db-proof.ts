import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { currentContextSnapshot } from "../lib/context/currentSnapshot";
import { refreshScopeProposal } from "../lib/scope/proposal-store";
import { commitScopeProposal } from "../lib/scope/reality";
import { harvestTimelineCandidates, currentTimelineCandidates } from "../lib/timeline/candidates";
import { harvestCandidates, currentDecisionCandidates } from "../lib/decisions/candidates";
import { POST as acceptTimeline } from "../app/api/timeline-candidates/[id]/accept/route";
import { POST as acceptDecision } from "../app/api/decision-candidates/[id]/accept/route";
import { NextRequest } from "next/server";
import { syncRefreshChangeProposals, getAuditChangeInbox, readKnowledgeStatus } from "../lib/audit/changeInbox";
import { acceptAuditChange } from "../lib/audit/acceptChange";
import { toContextPackage } from "../lib/bootstrap/refresh";
import type { ProjectBootstrapPackageV1 } from "../lib/bootstrap/contracts";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && url.pathname === "/signal_t0_test_1004", "Disposable repair DB only");
  const key = randomUUID();
  const scope = await prisma.scope.create({ data: { name: `Source restoration ${key}`, teamKey: "PRF", executionState: "not_configured" } });
  const bootstrap = await prisma.projectBootstrap.create({ data: { canonicalName: scope.name, normalizedName: scope.name, sourceHints: {}, status: "activated" } });
  try {
    const snapshots: Array<{ id: string }> = [];
    const packages: Array<{ id: string }> = [];
    for (const [index, name] of ["A", "B"].entries()) {
      const packageId = `${key}-${name}`;
      const scan = await prisma.bootstrapScanRun.create({ data: { bootstrapId: bootstrap.id, sequence: index + 1, status: "complete", stage: "complete", providerCoverage: {}, metrics: {}, warnings: [] } });
      const pkg = await prisma.bootstrapPackage.create({ data: { bootstrapId: bootstrap.id, scanRunId: scan.id, packageId, packageVersion: "1.1", producer: "repair-proof", compilerVersion: "proof", packageHash: packageId, package: { producer: "repair-proof", packageId }, generatedAt: new Date() } });
      const snapshot = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "gap_app", packageId: `bootstrap-refresh:repair-proof:${packageId}`, packageVersion: "1.1", contextHash: packageId, completenessSummary: {}, package: { sources: [], evidence: [], derivedClaims: [{ id: name, kind: "capability", statement: `${name} capability`, evidenceRefs: [], extra: { capability: `${name} capability` } }], intelligenceObjects: [] } } });
      snapshots.push(snapshot); packages.push(pkg);
      await prisma.contextSnapshot.update({ where: { id: snapshot.id }, data: { package: {
        sources: [], evidence: [{ id: `quote-${name}`, excerpt: `Review ${name} on October 15.`, sourceRef: `meeting-${name}`, data: { eventDate: "2026-10-15" } }],
        derivedClaims: [
          { id: name, kind: "capability", statement: `${name} capability`, evidenceRefs: [], extra: { capability: `${name} capability` } },
          { id: `plan-${name}`, kind: "milestone", statement: `Review ${name}`, evidenceRefs: [`quote-${name}`] },
          { id: `choice-${name}`, kind: "decision", statement: `Choose ${name}`, evidenceRefs: [`quote-${name}`] },
        ], intelligenceObjects: [],
      } } });
    }
    const audit = await prisma.auditRun.create({ data: { contextSnapshotId: snapshots[0].id, issueCount: 0, findingCount: 0, model: "repair-proof" } });
    await prisma.projectActivation.create({ data: { bootstrapId: bootstrap.id, scopeId: scope.id, reviewRevision: 0, manifestVersion: "proof", manifest: {}, contextSnapshotId: snapshots[0].id, firstAuditRunId: audit.id } });
    const choose = (index: number) => prisma.projectBootstrap.update({ where: { id: bootstrap.id }, data: { activePackageId: packages[index].id } });
    await choose(0);
    assert.equal((await currentContextSnapshot(scope.id))?.id, snapshots[0].id, "newer B is not current while A is selected");
    const proposalA = await refreshScopeProposal(scope.id);
    assert.equal(proposalA?.proposal.contextSnapshotId, snapshots[0].id);
    await harvestTimelineCandidates({ scopeId: scope.id });
    await harvestCandidates({ scopeId: scope.id });
    await choose(1);
    const proposalB = await refreshScopeProposal(scope.id);
    assert.equal(proposalB?.proposal.contextSnapshotId, snapshots[1].id);
    await harvestTimelineCandidates({ scopeId: scope.id });
    await harvestCandidates({ scopeId: scope.id });
    const timelineB = (await currentTimelineCandidates([scope.id]))[0];
    const decisionB = (await currentDecisionCandidates([scope.id]))[0];
    assert.equal(timelineB.contextSnapshotId, snapshots[1].id);
    assert.equal(decisionB.contextSnapshotId, snapshots[1].id);
    await choose(0);
    await assert.rejects(commitScopeProposal(scope.id, proposalB!.proposal.id, [{ itemId: "unused", workItemIds: [], releaseStatus: "accepted" }], [], `stale-${key}`), /Knowledge changed/);
    const restored = await refreshScopeProposal(scope.id);
    assert.equal(restored?.proposal.id, proposalA?.proposal.id, "A restored by identity, not duplicated");
    assert.equal((await prisma.scopeProposal.findUniqueOrThrow({ where: { id: proposalB!.proposal.id } })).status, "superseded");
    assert.equal(await prisma.scopeProposal.count({ where: { scopeId: scope.id, status: "active" } }), 1);
    assert.equal(await prisma.contextSnapshot.count({ where: { scopeId: scope.id } }), 2, "history is untouched");
    const timelineA = await currentTimelineCandidates([scope.id]);
    const decisionA = await currentDecisionCandidates([scope.id]);
    assert.deepEqual(timelineA.map((row) => row.contextSnapshotId), [snapshots[0].id]);
    assert.deepEqual(decisionA.map((row) => row.contextSnapshotId), [snapshots[0].id]);
    const request = (body: unknown = {}) => new NextRequest("http://127.0.0.1/api/test", { method: "POST", body: JSON.stringify(body) });
    assert.equal((await acceptTimeline(request({ temporalState: "planned" }), { params: Promise.resolve({ id: timelineB.id }) })).status, 409);
    assert.equal((await acceptDecision(request(), { params: Promise.resolve({ id: decisionB.id }) })).status, 409);
    assert.equal((await acceptTimeline(request(), { params: Promise.resolve({ id: timelineA[0].id }) })).status, 422, "no inferred occurred state");
    assert.equal((await acceptTimeline(request({ temporalState: "planned" }), { params: Promise.resolve({ id: timelineA[0].id }) })).status, 201);
    assert.equal((await acceptTimeline(request(), { params: Promise.resolve({ id: timelineA[0].id }) })).status, 200, "accepted history remains idempotent");
    const acceptedDecision = await acceptDecision(request(), { params: Promise.resolve({ id: decisionA[0].id }) });
    assert.equal(acceptedDecision.status, 200);
    assert.equal((await acceptedDecision.json()).created, true);
    assert.equal((await acceptDecision(request(), { params: Promise.resolve({ id: decisionA[0].id }) })).status, 200);
    assert.equal(await prisma.decision.count({ where: { scopeId: scope.id } }), 1);
    assert.equal(await prisma.timelineEvent.count({ where: { scopeId: scope.id } }), 1);
    const auditPackage = (name: string): ProjectBootstrapPackageV1 => ({
      version: "1.1", packageId: `${key}-${name}`, producer: "manual", compilerVersion: "proof", generatedAt: new Date().toISOString(), bootstrapId: bootstrap.id,
      requestedIdentity: { canonicalName: scope.name, aliases: [], sourceHints: [] }, discovery: { strategies: [], partial: false }, artifacts: [], evidence: [], intelligenceHeads: [], coverage: [], ambiguities: [], gaps: [], warnings: [],
      proposals: [{ proposalId: "audit-cap", candidateKey: "audit-cap", fingerprint: "proof", kind: "capability", title: `${scope.name} capability`, statement: `${scope.name} capability ${name}`, whyProposed: "Synthetic restoration proof", matchBasis: "exact identity", basis: "direct", evidenceRefs: [], intelligenceRefs: [], relevance: "high", currentness: "current", grounding: { directEvidenceCount: 0, independentLineageRootCount: 0, derivativeOnly: false, unresolvedContradiction: false }, payload: { description: name, date: "2026-10-15" } }],
    });
    const syncAudit = (index: number, name: string) => syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshots[index].id, auditRunId: audit.id, pkg: auditPackage(name) });
    await syncAudit(0, "A");
    const changeA = await prisma.auditChangeProposal.findFirstOrThrow({ where: { scopeId: scope.id, category: "scope", contextSnapshotId: snapshots[0].id } });
    await choose(1);
    await syncAudit(1, "B");
    const changeB = await prisma.auditChangeProposal.findFirstOrThrow({ where: { scopeId: scope.id, category: "scope", contextSnapshotId: snapshots[1].id } });
    await choose(0);
    await assert.rejects(acceptAuditChange(changeB.id, { idempotencyKey: `${key}-stale-audit` }), /Knowledge changed/);
    await syncAudit(0, "A");
    assert.equal((await prisma.auditChangeProposal.findUniqueOrThrow({ where: { id: changeA.id } })).status, "pending", "restored Audit proposal reopens only automated supersession");
    const inbox = await getAuditChangeInbox(scope.id);
    assert.equal(inbox.proposals.find((row) => row.id === changeB.id)?.status, "information_only", "old source remains history, not actionable Inbox work");
    const acceptedAudit = await acceptAuditChange(changeA.id, { idempotencyKey: `${key}-audit` });
    assert.equal(acceptedAudit.created, true);
    assert.equal((await acceptAuditChange(changeA.id, { idempotencyKey: `${key}-audit` })).created, false);
    await choose(1);
    await syncAudit(1, "A");
    const sameMeaningNewSource = await prisma.auditChangeProposal.findFirstOrThrow({ where: { scopeId: scope.id, category: "scope", contextSnapshotId: snapshots[1].id, proposedState: { path: ["description"], equals: "A" } } });
    assert.equal(sameMeaningNewSource.status, "information_only", "refresh does not reapply an already accepted owner change");
    assert.equal((await prisma.auditChangeProposal.findUniqueOrThrow({ where: { id: changeA.id } })).status, "accepted", "accepted history is immutable across restoration");
    const rematerialized = toContextPackage(scope.id, auditPackage("A"));
    assert.match(rematerialized.packageId, /^bootstrap-refresh-v2:/);
    assert.equal((rematerialized.derivedClaims?.[0].extra?.fields as { date: string }).date, "2026-10-15", "schedule fields cross the actual package boundary");
    const schedulePackage = auditPackage("B");
    schedulePackage.proposals = ["audit-first", "timeline-first"].map((order) => ({
      ...schedulePackage.proposals[0], proposalId: order, candidateKey: order, kind: "milestone", title: `${scope.name} ${order}`, statement: `${scope.name} ${order}`,
      payload: { date: "2026-10-15", endDate: "2026-10-17", temporalState: "planned" },
    }));
    const v2 = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "gap_app", packageId: `bootstrap-refresh-v2:repair-proof:${key}-B`, packageVersion: "1.1", contextHash: "v2", completenessSummary: {}, package: JSON.parse(JSON.stringify(toContextPackage(scope.id, schedulePackage))) } });
    assert.equal((await currentContextSnapshot(scope.id))?.id, v2.id, "new materialization is selected without changing immutable v1");
    await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: v2.id, auditRunId: audit.id, pkg: schedulePackage });
    await harvestTimelineCandidates({ id: v2.id });
    for (const order of ["audit-first", "timeline-first"]) {
      const auditCandidate = await prisma.auditChangeProposal.findFirstOrThrow({ where: { contextSnapshotId: v2.id, sourceKey: `refresh:${order}` } });
      const timelineCandidate = await prisma.timelineEventCandidate.findUniqueOrThrow({ where: { claimKey: `timeline:${v2.id}:refresh:${order}` } });
      if (order === "timeline-first") assert.equal((await acceptTimeline(request({ temporalState: "planned" }), { params: Promise.resolve({ id: timelineCandidate.id }) })).status, 201);
      await acceptAuditChange(auditCandidate.id, { idempotencyKey: `${key}-${order}` });
      assert.equal((await acceptTimeline(request({ temporalState: "planned" }), { params: Promise.resolve({ id: timelineCandidate.id }) })).status, 200);
      assert.equal(await prisma.timelineEvent.count({ where: { contextSnapshotId: v2.id, title: `${scope.name} ${order}` } }), 1, "one source accepted from two surfaces creates only one landmark");
      const landmark = await prisma.timelineEvent.findUniqueOrThrow({ where: { sourceClaimKey: timelineCandidate.claimKey } });
      assert.equal(landmark.endDate?.toISOString().slice(0, 10), "2026-10-17", "activity end survives either owner path");
      assert.equal(landmark.temporalState, "planned");
    }
    await prisma.timelineEvent.deleteMany({ where: { contextSnapshotId: v2.id } });
    await prisma.contextSnapshot.delete({ where: { id: v2.id } });
    await prisma.$transaction(async (tx) => {
      await tx.projectBootstrap.update({ where: { id: bootstrap.id }, data: { activePackageId: packages[1].id } });
      assert.equal((await currentContextSnapshot(scope.id, tx))?.id, snapshots[1].id, "acceptance transaction sees its current pointer");
    });
    await prisma.contextSnapshot.delete({ where: { id: snapshots[1].id } });
    await assert.rejects(currentContextSnapshot(scope.id), /still being processed/, "missing active materialization must not use historical A");
    const processing = await readKnowledgeStatus(scope.id);
    assert.equal(processing.lastAuditAt, null, "historical Audit is not the current processing receipt");
    assert.notEqual(processing.latestRun?.stages.audit.status, "complete");
    assert.notEqual(processing.latestRun?.stages.scope.status, "complete");
    console.log("PASS source restoration: A/B/A in Scope/Audit/Decisions/Timeline, stale acceptance refused, one active Scope proposal, current Audit queue, immutable accepted history, transaction read, in-flight refusal, accepted retries, explicit plan state, versioned schedule materialization, one canonical schedule across both acceptance surfaces");
  } finally {
    await prisma.projectActivation.deleteMany({ where: { scopeId: scope.id } });
    await prisma.scopeProposal.deleteMany({ where: { scopeId: scope.id } });
    await prisma.timelineEvent.deleteMany({ where: { scopeId: scope.id } });
    await prisma.decision.deleteMany({ where: { scopeId: scope.id } });
    await prisma.auditRun.deleteMany({ where: { contextSnapshot: { scopeId: scope.id } } });
    await prisma.contextSnapshot.deleteMany({ where: { scopeId: scope.id } });
    await prisma.projectBootstrap.delete({ where: { id: bootstrap.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}
main().finally(() => prisma.$disconnect());
