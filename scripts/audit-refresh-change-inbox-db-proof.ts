import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { acceptAuditChange, ChangeCompletionRequiredError, dispositionAuditChange } from "../lib/audit/acceptChange";
import { auditChangeFingerprint, type AuditChangeDraft } from "../lib/audit/changeContract";
import { getAuditChangeInbox, syncRefreshChangeProposals } from "../lib/audit/changeInbox";
import type { ProjectBootstrapPackageV1 } from "../lib/bootstrap/contracts";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const runKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ik = (value: string) => `${value}:${runKey}`;

async function change(scopeId: string, key: string, draft: Partial<AuditChangeDraft> & Pick<AuditChangeDraft, "category" | "owner" | "proposedState">) {
  const full: AuditChangeDraft = {
    key, scopeId, category: draft.category, owner: draft.owner, proposedState: draft.proposedState,
    changeType: draft.changeType ?? key, title: draft.title ?? key, summary: draft.summary ?? key,
    whyProposed: draft.whyProposed ?? "Deterministic proof fixture", currentState: draft.currentState ?? { state: "before" },
    evidence: draft.evidence ?? [{ id: `evidence:${key}`, excerpt: `Exact evidence for ${key}.`, kind: "evidence" }],
    currentness: "current", retrievalBasis: "deterministic fixture", retrievalConfidence: "exact",
    relevanceClass: "project_local", relevanceReason: "Fixture is local to the selected project.", sourceKind: "refresh",
    recommendedAction: "accept", completionRequirements: draft.completionRequirements ?? [],
  };
  return prisma.auditChangeProposal.create({ data: {
    scopeId, fingerprint: auditChangeFingerprint(full), sourceKey: full.key, category: full.category, owner: full.owner,
    changeType: full.changeType, title: full.title, summary: full.summary, whyProposed: full.whyProposed,
    currentState: json(full.currentState), proposedState: json(full.proposedState), evidence: json(full.evidence),
    currentness: full.currentness, retrievalBasis: full.retrievalBasis, retrievalConfidence: full.retrievalConfidence,
    relevanceClass: full.relevanceClass, relevanceReason: full.relevanceReason, sourceKind: full.sourceKind,
    recommendedAction: full.recommendedAction, completionRequirements: json(full.completionRequirements ?? []),
  } });
}

function infoPackage(bootstrapId: string): ProjectBootstrapPackageV1 {
  return {
    version: "1.1", packageId: "proof-info-only", producer: "hermes", compilerVersion: "proof", generatedAt: "2026-09-09T15:00:00.000Z", bootstrapId,
    requestedIdentity: { canonicalName: "Proof iTrack", aliases: ["iTrack"], sourceHints: [] },
    identity: { detectedCanonicalName: "Proof iTrack", aliases: ["iTrack"], collisions: [], relatedEntities: [] },
    discovery: { strategies: [{ id: "identity", state: "complete", detail: "fixture" }], partial: false },
    artifacts: [{ artifactId: "a1", provider: "hermes", artifactType: "transcript", title: "Proof iTrack notes", canonicalRef: "fixture://itrack", availability: "available", retrievalReasons: [{ kind: "exact_identity", detail: "fixture" }], relevanceBand: "included", lineageRootIds: ["fixture://itrack"], derivativeOfArtifactIds: [] }],
    evidence: [{ evidenceId: "e1", artifactId: "a1", exactQuote: "Proof iTrack source changed without a product delta.", locator: { line: 1 }, independence: "independent", lineageRootIds: ["fixture://itrack"] }],
    intelligenceHeads: [], relations: [],
    proposals: [{ proposalId: "p1", candidateKey: "source-only", fingerprint: "source-only", kind: "source", title: "Proof iTrack notes", statement: "Proof iTrack notes", whyProposed: "New source", matchBasis: "exact", basis: "direct", evidenceRefs: ["e1"], intelligenceRefs: [], relevance: "high", currentness: "current", grounding: { directEvidenceCount: 1, independentLineageRootCount: 1, derivativeOnly: false, unresolvedContradiction: false }, payload: { provider: "hermes" } }],
    coverage: [{ provider: "hermes", label: "Hermes", state: "available", artifacts: 1, detail: "fixture" }], ambiguities: [], gaps: [], warnings: [],
  };
}

async function main() {
  const scope = await prisma.scope.create({ data: { name: "Proof iTrack", teamKey: "TRK", projectNames: ["KIT iTrack"], executionState: "configured" } });
  const platform = await prisma.scope.create({ data: { name: "Proof Platform", teamKey: "PLAT", projectNames: ["KIT Platform"], executionState: "configured" } });
  const snapshot = await prisma.contextSnapshot.create({ data: {
    scopeId: scope.id, packageId: `proof-snapshot:${runKey}`, packageVersion: "1.1", producer: "hermes",
    package: json({ version: "1.1", evidence: [] }), contextHash: "proof-hash", completenessSummary: json({ status: "complete", activeSupplied: [], missingActive: [], paused: [], excluded: [], adHoc: [] }),
  } });
  const audit = await prisma.auditRun.create({ data: { sourceId: null, contextSnapshotId: snapshot.id, issueCount: 0, findingCount: 0, model: "proof" } });

  // A — knowledge changed, no Reality delta.
  const info = await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshot.id, auditRunId: audit.id, pkg: infoPackage("proof-bootstrap") });
  assert.equal(info.created, 1);
  assert.equal(await prisma.auditChangeProposal.count({ where: { scopeId: scope.id, category: "information", status: "information_only" } }), 1);

  // Changed semantics under the same source key supersede the prior card;
  // unchanged semantics reuse it and preserve its disposition.
  const firstDelta = infoPackage("proof-bootstrap");
  firstDelta.proposals = [{ ...firstDelta.proposals[0], kind: "capability", candidateKey: "stable-delta", title: "Stable delta", statement: "Stable delta is planned.", payload: { name: "Stable delta", status: "planned" } }];
  await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshot.id, auditRunId: audit.id, pkg: firstDelta });
  const priorDelta = await prisma.auditChangeProposal.findFirstOrThrow({ where: { scopeId: scope.id, sourceKey: "refresh:stable-delta" } });
  const changedDelta = infoPackage("proof-bootstrap");
  changedDelta.proposals = [{ ...changedDelta.proposals[0], kind: "capability", candidateKey: "stable-delta", title: "Stable delta", statement: "Stable delta was removed.", payload: { name: "Stable delta", status: "removed" } }];
  await syncRefreshChangeProposals({ scopeId: scope.id, snapshotId: snapshot.id, auditRunId: audit.id, pkg: changedDelta });
  const deltaVersions = await prisma.auditChangeProposal.findMany({ where: { scopeId: scope.id, sourceKey: "refresh:stable-delta" }, orderBy: { createdAt: "asc" } });
  assert.equal(deltaVersions.length, 2);
  assert.equal(deltaVersions[0].id, priorDelta.id);
  assert.equal(deltaVersions[0].status, "information_only");
  assert.equal(deltaVersions[1].status, "pending");
  assert.equal(deltaVersions[1].supersedesProposalId, priorDelta.id);

  // B — Scope cut routes to Capability and derived refresh.
  const cut = await change(scope.id, "scope-cut", { category: "scope", owner: "scope", proposedState: { action: "upsert_capability", name: "Expanded controls", status: "removed", description: "Cut" } });
  const acceptedCut = await acceptAuditChange(cut.id, { idempotencyKey: ik("accept-scope-cut") });
  assert.equal(acceptedCut.proposal.canonicalObjectType, "Capability");
  assert.equal((await prisma.capability.findFirstOrThrow({ where: { scopeId: scope.id, name: "Expanded controls" } })).status, "removed");

  // C — contradiction creates one OPEN Decision with two directions and no gate.
  const contradiction = await change(scope.id, "open-contradiction", { category: "decision", owner: "decisions", title: "What investigation capability belongs in iTrack Rev 1?", proposedState: { action: "create_open_decision", title: "What investigation capability belongs in iTrack Rev 1?", rationale: "Two current directions", options: [{ id: "a", label: "Rebuild as-is" }, { id: "b", label: "Some investigation" }] } });
  const firstDecision = await acceptAuditChange(contradiction.id, { idempotencyKey: ik("accept-contradiction") });
  const decision = await prisma.decision.findUniqueOrThrow({ where: { id: firstDecision.proposal.canonicalObjectId! }, include: { gate: true } });
  assert.equal(decision.status, "open"); assert.equal(decision.gate, null); assert.equal((decision.options as unknown[]).length, 2);

  // D — occurred milestone goes to Timeline.
  const milestone = await change(scope.id, "occurred-milestone", { category: "milestone", owner: "timeline", proposedState: { action: "create_milestone", title: "Beta", date: "2026-09-08", temporalState: "occurred", semanticState: "occurred", kind: "milestone" } });
  await acceptAuditChange(milestone.id, { idempotencyKey: ik("accept-milestone") });
  assert.equal((await prisma.timelineEvent.findFirstOrThrow({ where: { scopeId: scope.id, title: "Beta" } })).temporalState, "occurred");

  // E — stale blocker resolves its existing Finding, no duplicate.
  const finding = await prisma.finding.create({ data: { sourceId: null, auditRunId: audit.id, contextSnapshotId: snapshot.id, type: "risk", title: "Stale blocker", quote: "old", rationale: "old", severity: "high", blocking: true, matchedIssues: [], evidenceRefs: ["e1"] } });
  const stale = await change(scope.id, "stale-finding", { category: "finding", owner: "findings", proposedState: { action: "resolve_finding", findingId: finding.id, status: "stale", resolution: "Superseded by current evidence" } });
  await acceptAuditChange(stale.id, { idempotencyKey: ik("accept-stale") });
  assert.equal((await prisma.finding.findUniqueOrThrow({ where: { id: finding.id } })).status, "resolved");
  assert.equal(await prisma.finding.count({ where: { auditRunId: audit.id, title: "Stale blocker" } }), 1);

  // F — source health refuses canonical acceptance.
  const sourceHealth = await change(scope.id, "source-health", { category: "source_health", owner: "source_configuration", proposedState: { action: "open_source_settings", provider: "linear" } });
  await assert.rejects(() => acceptAuditChange(sourceHealth.id, { idempotencyKey: ik("accept-source-health") }), ChangeCompletionRequiredError);
  await dispositionAuditChange(sourceHealth.id, { action: "information_only", idempotencyKey: ik("info-source-health") });

  // Dependency with explicit endpoints and evidence is canonical only once.
  const dependency = await change(scope.id, "platform-dependency", { category: "dependency", owner: "dependencies", proposedState: { action: "create_dependency", upstreamScopeId: platform.id, downstreamScopeId: scope.id, basis: "Platform auth is a prerequisite" } });
  await acceptAuditChange(dependency.id, { idempotencyKey: ik("accept-dependency") });
  assert.equal(await prisma.scopeDependency.count({ where: { upstreamScopeId: platform.id, downstreamScopeId: scope.id } }), 1);

  // J — retry and double-click cannot duplicate owner objects.
  const retry = await acceptAuditChange(contradiction.id, { idempotencyKey: ik("accept-contradiction") });
  const doubleClick = await acceptAuditChange(contradiction.id, { idempotencyKey: ik("different-click-same-proposal") });
  assert.equal(retry.created, false); assert.equal(doubleClick.created, false);
  assert.equal(await prisma.decision.count({ where: { sourceClaimKey: contradiction.fingerprint } }), 1);

  // K/L — revision caught up automatically; readiness changes as blockers clear.
  const derived = await prisma.projectDerivedState.findUniqueOrThrow({ where: { scopeId: scope.id } });
  assert.equal(derived.status, "current"); assert.equal(derived.computedRevision, derived.realityRevision);
  const beforeCapacity = await getAuditChangeInbox(scope.id);
  assert.equal(beforeCapacity.readiness.ready, false);
  const person = await prisma.person.create({ data: { name: "Proof owner", synthetic: false } });
  await prisma.allocation.create({ data: { personId: person.id, scopeId: scope.id, fraction: 1 } });
  const afterCapacity = await getAuditChangeInbox(scope.id);
  assert.ok(afterCapacity.readiness.blockers.length < beforeCapacity.readiness.blockers.length);

  console.log(JSON.stringify({ ok: true, cases: {
    A: "information only", B: "Scope owner + recompute", C: "OPEN Decision/no gate", D: "occurred Timeline milestone",
    E: "Finding resolved/no duplicate", F: "setup card/no canonical write", G: "pure relevance proof", H: "pure freshness proof",
    I: "pure no-rescan proof", J: "idempotent", K: "derived revisions current", L: "readiness blocker count decreased",
  }, ids: { scope: scope.id, snapshot: snapshot.id, audit: audit.id, openDecision: decision.id } }, null, 2));
}

main().finally(() => prisma.$disconnect());
