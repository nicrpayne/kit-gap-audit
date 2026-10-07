import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { compileBootstrapPackage } from "../lib/bootstrap/scan";
import { richHistoricalCorpus } from "../lib/bootstrap/fixtures";
import { toContextPackage } from "../lib/bootstrap/refresh";
import { getAuditChangeInbox, syncRefreshChangeProposals } from "../lib/audit/changeInbox";
import { acceptAuditChange, dispositionAuditChange } from "../lib/audit/acceptChange";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55436" && url.pathname === "/signal_evidence_repair_1007", "Disposable repair DB only");
  const key = randomUUID();
  const scope = await prisma.scope.create({ data: { name: `Harbor Relay ${key}`, teamKey: "PRF", executionState: "not_configured" } });
  try {
    const pkg = compileBootstrapPackage(key, { canonicalName: "Harbor Relay", aliases: [], sourceHints: [] }, richHistoricalCorpus, new Date("2026-10-07"));
    const original = pkg.proposals.find(p => p.kind === "capability")!;
    const id = "hermes:opportunity-context";
    const head = { ...pkg.intelligenceHeads[0], intelligenceId: id, type: "opportunity", status: "rejected", fields: {}, statement: "Harbor Relay: tell the launch owner about an existing audit process." };
    pkg.intelligenceHeads = [head];
    pkg.relations = [];
    const legacy = { ...original, candidateKey: `hermes:capability:${id}`, intelligenceRefs: [id], title: head.statement, statement: head.statement, payload: { name: head.statement } };
    pkg.proposals = [legacy];
    const snapshot = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "gap_app", packageId: key, packageVersion: "1.1", contextHash: key, completenessSummary: {}, package: JSON.parse(JSON.stringify(toContextPackage(scope.id, pkg))) } });
    const audit = await prisma.auditRun.create({ data: { contextSnapshotId: snapshot.id, issueCount: 0, findingCount: 0, model: "admission-proof" } });
    const common = { scopeId: scope.id, contextSnapshotId: snapshot.id, auditRunId: audit.id, sourceKind: "refresh", sourceKey: `refresh:${legacy.candidateKey}`, title: head.statement, summary: head.statement, whyProposed: "Legacy companion inference", category: "scope", owner: "scope", changeType: "capability_changed", proposedState: { action: "upsert_capability", name: head.statement, status: "accepted" }, currentState: {}, evidence: [{ excerpt: "Keep this exact supporting quote." }], relevanceClass: "project_local", relevanceReason: "fixture", currentness: "current", retrievalBasis: "structured_current_head", retrievalConfidence: "strong", recommendedAction: "review", targetHref: `/scope?project=${scope.id}`, completionRequirements: [] };
    const old = await prisma.auditChangeProposal.create({ data: { ...common, fingerprint: `${key}-old`, status: "pending" } });
    const accepted = await prisma.auditChangeProposal.create({ data: { ...common, fingerprint: `${key}-accepted`, status: "accepted" } });
    const rejected = await prisma.auditChangeProposal.create({ data: { ...common, fingerprint: `${key}-rejected`, status: "rejected" } });
    const before = await prisma.auditChangeProposal.findMany({ where: { scopeId: scope.id }, orderBy: { id: "asc" } });
    const inbox = await getAuditChangeInbox(scope.id);
    const display = inbox.proposals.find(p => p.id === old.id)!;
    assert.equal(display.status, "information_only"); assert.equal(display.category, "information");
    assert.deepEqual(display.evidence, old.evidence);
    assert.equal(inbox.proposals.find(p => p.id === accepted.id)?.status, "accepted");
    assert.equal(inbox.proposals.find(p => p.id === rejected.id)?.status, "rejected");
    assert(!inbox.readiness.blockers.some(b => b.code === "scope_unreconciled"));
    assert.deepEqual(await prisma.auditChangeProposal.findMany({ where: { scopeId: scope.id }, orderBy: { id: "asc" } }), before, "GET never rewrites history");
    await assert.rejects(acceptAuditChange(old.id, { idempotencyKey: `${key}-accept` }), /no longer active/);
    await dispositionAuditChange(old.id, { action: "reopen", idempotencyKey: `${key}-reopen` });
    await assert.rejects(acceptAuditChange(old.id, { idempotencyKey: `${key}-retry` }), /no longer active/);
    assert.equal(await prisma.capability.count({ where: { scopeId: scope.id } }), 0);
    await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshot.id, auditRunId: audit.id, pkg });
    const fresh = await prisma.auditChangeProposal.findFirstOrThrow({ where: { scopeId: scope.id, changeType: "opportunity_context" } });
    assert.equal(fresh.status, "information_only"); assert.equal(fresh.category, "information");
    assert(Array.isArray(fresh.evidence) && fresh.evidence.length > 0, "Fresh context retains its exact source passages");
    assert.equal((await prisma.auditChangeProposal.findUniqueOrThrow({ where: { id: accepted.id } })).status, "accepted");
    // A real product capability still creates an actionable review, so this
    // rule cannot simply hide every Scope proposal to turn readiness green.
    pkg.intelligenceHeads = [{ ...head, intelligenceId: "actual-feature", status: "open", fields: { capability: "Harbor Relay search" } }];
    pkg.proposals = [{ ...original, candidateKey: "hermes:capability:actual-feature", intelligenceRefs: ["actual-feature"], title: "Harbor Relay search" }];
    await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshot.id, auditRunId: audit.id, pkg });
    const final = await getAuditChangeInbox(scope.id);
    assert(final.readiness.blockers.some(b => b.code === "scope_unreconciled"));
    assert(final.proposals.some(p => p.category === "scope" && p.status === "pending" && p.title === "Harbor Relay search"));
    console.log("PASS DB admission: fresh and legacy context, no false Scope blocker, quote/history preservation, direct and reopened acceptance refused, real features still require review");
  } finally {
    await prisma.auditRun.deleteMany({ where: { contextSnapshot: { scopeId: scope.id } } });
    await prisma.contextSnapshot.deleteMany({ where: { scopeId: scope.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}
main().finally(() => prisma.$disconnect());
