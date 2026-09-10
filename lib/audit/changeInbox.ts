import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BootstrapProposal, ProjectBootstrapPackageV1 } from "@/lib/bootstrap/contracts";
import { createCompanionScan, COMPANION_ONLINE_MS } from "@/lib/bootstrap/jobs";
import {
  auditChangeFingerprint,
  defaultTargetHref,
  type AuditChangeCategory,
  type AuditChangeDraft,
  type ChangeEvidence,
  type ProposedOwnerMutation,
} from "./changeContract";
import { ensureReconciliationBaseline } from "./baseline";
import { classifyProjectRelevance } from "./projectRelevance";
import { deriveKnowledgeFreshness, type KnowledgeFreshnessCode } from "./freshness";

const TERMINAL_JOBS = new Set(["complete", "partial", "failed", "stale"]);
export const AUDIT_FRESHNESS_TTL_MS = 15 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function proposalEvidence(pkg: ProjectBootstrapPackageV1, proposal: BootstrapProposal): ChangeEvidence[] {
  const wanted = new Set(proposal.evidenceRefs);
  return pkg.evidence
    .filter((item) => wanted.has(item.evidenceId))
    .map((item) => ({
      id: item.evidenceId,
      excerpt: item.exactQuote,
      sourceRef: pkg.artifacts.find((artifact) => artifact.artifactId === item.artifactId)?.canonicalRef ?? null,
      observedAt: item.occurredAt ?? null,
      kind: "evidence" as const,
    }));
}

function ownerShape(proposal: BootstrapProposal): {
  category: AuditChangeCategory;
  owner: string;
  changeType: string;
  proposedState: ProposedOwnerMutation;
  recommendedAction: string;
  completionRequirements: string[];
} {
  if (proposal.kind === "capability") return {
    category: "scope", owner: "scope", changeType: "capability_changed",
    proposedState: { action: "upsert_capability", name: proposal.title, description: proposal.statement, status: "accepted", ...proposal.payload },
    recommendedAction: "review", completionRequirements: [],
  };
  if (proposal.kind === "decision") return {
    category: "decision", owner: "decisions", changeType: "create_open_decision",
    proposedState: { action: "create_open_decision", title: proposal.title, rationale: proposal.statement, ...proposal.payload },
    recommendedAction: "review", completionRequirements: [],
  };
  if (proposal.kind === "dependency") {
    const upstreamScopeId = typeof proposal.payload.upstreamScopeId === "string" ? proposal.payload.upstreamScopeId : null;
    const downstreamScopeId = typeof proposal.payload.downstreamScopeId === "string" ? proposal.payload.downstreamScopeId : null;
    return {
      category: "dependency", owner: "dependencies", changeType: "dependency_candidate",
      proposedState: { action: "create_dependency", ...proposal.payload }, recommendedAction: upstreamScopeId && downstreamScopeId ? "review" : "confirm",
      completionRequirements: upstreamScopeId && downstreamScopeId ? [] : ["Choose valid upstream and downstream project endpoints."],
    };
  }
  if (proposal.kind === "milestone") {
    const date = typeof proposal.payload.date === "string" ? proposal.payload.date : null;
    return {
      category: "milestone", owner: "timeline", changeType: "milestone_candidate",
      proposedState: { action: "create_milestone", title: proposal.title, kind: "milestone", ...proposal.payload },
      recommendedAction: date ? "review" : "confirm", completionRequirements: date ? [] : ["Supply the explicit milestone date."],
    };
  }
  if (proposal.kind === "person") return {
    category: "capacity", owner: "capacity", changeType: "person_mention",
    proposedState: { action: "open_capacity", ...proposal.payload }, recommendedAction: "information_only",
    completionRequirements: ["Confirm an actual person and allocation in Capacity; a mention is not staffing."],
  };
  if (proposal.kind === "missing_information") return {
    category: "source_health", owner: "source_configuration", changeType: "source_gap",
    proposedState: { action: "open_source_settings", ...proposal.payload }, recommendedAction: "review", completionRequirements: [],
  };
  if (proposal.kind === "risk") return {
    category: "finding", owner: "findings", changeType: "audit_observation",
    proposedState: { action: "information_only" }, recommendedAction: "information_only", completionRequirements: [],
  };
  return {
    category: "information", owner: "audit", changeType: "knowledge_observed",
    proposedState: { action: "information_only" }, recommendedAction: "information_only", completionRequirements: [],
  };
}

async function currentOwnerState(scopeId: string, proposed: ProposedOwnerMutation): Promise<Record<string, unknown>> {
  if (proposed.action === "upsert_capability" && typeof proposed.name === "string") {
    const capability = await prisma.capability.findFirst({ where: { scopeId, name: { equals: proposed.name, mode: "insensitive" } } });
    return capability ? { id: capability.id, name: capability.name, status: capability.status, description: capability.description } : { capability: "not represented" };
  }
  if (["create_open_decision", "create_decided_decision"].includes(proposed.action) && typeof proposed.title === "string") {
    const decision = await prisma.decision.findFirst({ where: { scopeId, title: { equals: proposed.title, mode: "insensitive" } }, include: { gate: true } });
    return decision ? { id: decision.id, title: decision.title, status: decision.status, resolution: decision.resolution, gated: Boolean(decision.gate) } : { decision: "not represented" };
  }
  if (proposed.action === "create_milestone" && typeof proposed.title === "string") {
    const milestone = await prisma.timelineEvent.findFirst({ where: { scopeId, title: { equals: proposed.title, mode: "insensitive" } } });
    return milestone ? { id: milestone.id, title: milestone.title, date: milestone.date.toISOString().slice(0, 10), temporalState: milestone.temporalState, semanticState: milestone.semanticState } : { milestone: "not represented" };
  }
  if (proposed.action === "create_dependency" && typeof proposed.upstreamScopeId === "string") {
    const dependency = await prisma.scopeDependency.findFirst({ where: { upstreamScopeId: proposed.upstreamScopeId, downstreamScopeId: typeof proposed.downstreamScopeId === "string" ? proposed.downstreamScopeId : scopeId } });
    return dependency ? { id: dependency.id, state: dependency.state, basis: dependency.basis } : { dependency: "not represented" };
  }
  if (proposed.action === "resolve_finding" && typeof proposed.findingId === "string") {
    const finding = await prisma.finding.findUnique({ where: { id: proposed.findingId } });
    return finding ? { id: finding.id, status: finding.status, blocking: finding.blocking, title: finding.title } : { finding: "not found" };
  }
  if (proposed.action === "update_target_date") {
    const scope = await prisma.scope.findUnique({ where: { id: scopeId }, select: { targetDate: true } });
    return { targetDate: scope?.targetDate?.toISOString().slice(0, 10) ?? "not set" };
  }
  return { reality: "unchanged" };
}

export async function syncRefreshChangeProposals(input: {
  scopeId: string;
  snapshotId: string;
  auditRunId: string;
  pkg: ProjectBootstrapPackageV1;
}): Promise<{ created: number; suppressed: number }> {
  const [scope, allScopes] = await Promise.all([
    prisma.scope.findUnique({ where: { id: input.scopeId }, include: { aliases: true } }),
    prisma.scope.findMany({ include: { aliases: true } }),
  ]);
  if (!scope) return { created: 0, suppressed: 0 };
  const identities = allScopes.map((item) => ({ id: item.id, name: item.name, aliases: item.aliases.map((alias) => alias.alias) }));
  const project = identities.find((item) => item.id === scope.id)!;
  let created = 0;
  let suppressed = 0;
  let actionable = 0;
  const packageSemantics = new Set<string>();

  for (const proposal of input.pkg.proposals) {
    // Source matches are provenance inventory, not 50 separate daily deltas.
    // A single information card below represents a package with no governed
    // semantic changes.
    if (proposal.kind === "source") continue;
    const semanticKey = [
      proposal.title.trim().toLowerCase().replace(/\s+/g, " "),
      [...proposal.evidenceRefs].sort().join("|"),
    ].join("::");
    if (packageSemantics.has(semanticKey)) {
      suppressed += 1;
      continue;
    }
    packageSemantics.add(semanticKey);
    const shape = ownerShape(proposal);
    const relevance = classifyProjectRelevance(proposal, project, identities);
    const currentState = await currentOwnerState(input.scopeId, shape.proposedState);
    const draft: AuditChangeDraft = {
      key: `refresh:${proposal.candidateKey}`,
      scopeId: input.scopeId, auditRunId: input.auditRunId, contextSnapshotId: input.snapshotId,
      category: shape.category, owner: shape.owner, changeType: shape.changeType,
      title: proposal.title, summary: proposal.statement, whyProposed: proposal.whyProposed,
      currentState,
      proposedState: shape.proposedState, evidence: proposalEvidence(input.pkg, proposal),
      currentness: proposal.currentness, retrievalBasis: proposal.matchBasis,
      retrievalConfidence: proposal.retrieval?.scoreBand ?? proposal.basis ?? "unknown",
      forecastEffect: null, relevanceClass: relevance.classification, relevanceReason: relevance.reason,
      sourceKind: "refresh", recommendedAction: shape.recommendedAction,
      targetHref: defaultTargetHref(shape.owner, input.scopeId), completionRequirements: shape.completionRequirements,
      initialStatus: ["irrelevant_bleed", "neighboring_project_context"].includes(relevance.classification) || shape.recommendedAction === "information_only" ? "information_only" : "pending",
    };
    const fingerprint = auditChangeFingerprint(draft);
    const exists = await prisma.auditChangeProposal.findUnique({ where: { fingerprint }, select: { id: true } });
    if (exists) continue;
    const prior = await prisma.auditChangeProposal.findFirst({
      where: { scopeId: draft.scopeId, sourceKind: "refresh", sourceKey: draft.key },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    await prisma.auditChangeProposal.create({ data: {
      scopeId: draft.scopeId, auditRunId: draft.auditRunId, contextSnapshotId: draft.contextSnapshotId,
      fingerprint, sourceKey: draft.key, supersedesProposalId: prior?.id ?? null,
      category: draft.category, owner: draft.owner, changeType: draft.changeType,
      title: draft.title, summary: draft.summary, whyProposed: draft.whyProposed,
      currentState: json(draft.currentState), proposedState: json(draft.proposedState), evidence: json(draft.evidence),
      currentness: draft.currentness, retrievalBasis: draft.retrievalBasis, retrievalConfidence: draft.retrievalConfidence,
      relevanceClass: draft.relevanceClass, relevanceReason: draft.relevanceReason, sourceKind: draft.sourceKind,
      recommendedAction: draft.recommendedAction, targetHref: draft.targetHref,
      completionRequirements: json(draft.completionRequirements ?? []), status: draft.initialStatus ?? "pending",
    } });
    if (prior && prior.status !== "accepted") {
      await prisma.auditChangeProposal.update({ where: { id: prior.id }, data: {
        status: "information_only",
        dispositionReason: "Superseded by a changed proposal from a newer completed Audit refresh.",
      } });
    }
    created += 1;
    if (relevance.classification === "irrelevant_bleed") suppressed += 1;
    else if (draft.initialStatus !== "information_only") actionable += 1;
  }

  if (actionable === 0) {
    const draft: AuditChangeDraft = {
      key: `refresh:${input.pkg.packageId}:information-only`, scopeId: input.scopeId,
      auditRunId: input.auditRunId, contextSnapshotId: input.snapshotId, category: "information", owner: "audit",
      changeType: "knowledge_refresh_no_reality_delta", title: "New knowledge, no accepted Reality change",
      summary: "Signal refreshed the external package and found no new owner change requiring governance.",
      whyProposed: "Knowledge currentness changed while the governed project model did not.", currentState: { reality: "unchanged" },
      proposedState: { action: "information_only" }, evidence: [], currentness: "current",
      retrievalBasis: "Completed external package comparison", retrievalConfidence: "not_applicable",
      relevanceClass: "project_local", relevanceReason: "This is the selected project's refresh receipt.",
      sourceKind: "refresh", recommendedAction: "information_only", targetHref: defaultTargetHref("audit", input.scopeId), initialStatus: "information_only",
    };
    const fingerprint = auditChangeFingerprint(draft);
    if (!await prisma.auditChangeProposal.findUnique({ where: { fingerprint }, select: { id: true } })) {
      await prisma.auditChangeProposal.create({ data: {
        scopeId: draft.scopeId, auditRunId: draft.auditRunId, contextSnapshotId: draft.contextSnapshotId,
        fingerprint, sourceKey: draft.key, category: draft.category, owner: draft.owner, changeType: draft.changeType,
        title: draft.title, summary: draft.summary, whyProposed: draft.whyProposed,
        currentState: json(draft.currentState), proposedState: json(draft.proposedState), evidence: json(draft.evidence),
        currentness: draft.currentness, retrievalBasis: draft.retrievalBasis, retrievalConfidence: draft.retrievalConfidence,
        relevanceClass: draft.relevanceClass, relevanceReason: draft.relevanceReason, sourceKind: draft.sourceKind,
        recommendedAction: draft.recommendedAction, targetHref: draft.targetHref, completionRequirements: [], status: "information_only",
      } });
      created += 1;
    }
  }
  return { created, suppressed };
}

export interface KnowledgeStatus {
  code: KnowledgeFreshnessCode;
  label: string;
  detail: string;
  checkedAt: string;
  canRefresh: boolean;
  companion: { state: string; version: string; online: boolean; lastSeenAt: string } | null;
  lastPackageAt: string | null;
  lastAuditAt: string | null;
  activeJob: { id: string; status: string; stage: string; progress: unknown } | null;
}

export async function readKnowledgeStatus(scopeId: string): Promise<KnowledgeStatus> {
  const now = new Date();
  const scope = await prisma.scope.findUnique({
    where: { id: scopeId },
    include: { activation: { include: { bootstrap: { include: {
      scans: { orderBy: { createdAt: "desc" }, take: 1, include: { job: true } },
      packages: { orderBy: { createdAt: "desc" }, take: 1 },
    } } } } },
  });
  const [companion, latestSnapshot, latestAudit] = await Promise.all([
    prisma.bootstrapCompanion.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    prisma.contextSnapshot.findFirst({ where: { scopeId }, orderBy: { createdAt: "desc" } }),
    prisma.auditRun.findFirst({ where: { contextSnapshot: { scopeId } }, orderBy: { createdAt: "desc" } }),
  ]);
  const online = Boolean(companion && now.getTime() - companion.lastSeenAt.getTime() <= COMPANION_ONLINE_MS);
  const knowledge = record(companion?.knowledgeState);
  const completed = record(knowledge.completed);
  const ingestionState = typeof knowledge.state === "string" ? knowledge.state : null;
  const watermark = iso(completed.at) ?? iso(knowledge.watermark);
  const completedManifestId = typeof completed.manifestId === "string" ? completed.manifestId : null;
  const bootstrap = scope?.activation?.bootstrap;
  const latestScan = bootstrap?.scans[0] ?? null;
  const job = latestScan?.job ?? null;
  const pkg = bootstrap?.packages[0] ?? null;
  const packageBody = record(pkg?.package);
  const packageIntelligenceMeta = record(packageBody.intelligenceMeta);
  const snapshotBody = record(latestSnapshot?.package);
  const snapshotIntelligenceMeta = record(snapshotBody.intelligenceMeta);
  const packageManifests = Array.isArray(packageIntelligenceMeta.manifestsIncluded)
    ? packageIntelligenceMeta.manifestsIncluded.filter((value): value is string => typeof value === "string")
    : [];
  const snapshotManifests = Array.isArray(snapshotIntelligenceMeta.manifestsIncluded)
    ? snapshotIntelligenceMeta.manifestsIncluded.filter((value): value is string => typeof value === "string")
    : [];
  const packagedManifests = packageManifests.length ? packageManifests : snapshotManifests;
  const completedIdentityAlreadyPackaged = Boolean(completedManifestId && packagedManifests.includes(completedManifestId));
  // Production JSA/iTrack already had accepted external ContextSnapshots
  // before ProjectActivation existed. Until their first companion refresh,
  // that accepted snapshot is the comparison baseline; treating the absence
  // of a BootstrapPackage as automatically newer would request a redundant
  // scan immediately after the forward-only operational binding migration.
  const acceptedKnowledgeAt = pkg?.generatedAt
    ?? (iso(snapshotBody.generatedAt) ? new Date(iso(snapshotBody.generatedAt)!) : latestSnapshot?.createdAt)
    ?? null;
  const decision = deriveKnowledgeFreshness({
    activationAvailable: Boolean(scope?.activation), companionOnline: online, ingestionState,
    jobRunning: Boolean(job && !TERMINAL_JOBS.has(job.status)),
    packageAheadOfSnapshot: Boolean(pkg && (!latestSnapshot || !String(latestSnapshot.packageId).includes(pkg.packageId))),
    watermarkAheadOfPackage: Boolean(
      watermark && !completedIdentityAlreadyPackaged && (!acceptedKnowledgeAt || new Date(watermark).getTime() > acceptedKnowledgeAt.getTime()),
    ),
  });
  return {
    code: decision.code, label: decision.label, detail: decision.detail, checkedAt: now.toISOString(), canRefresh: decision.canRefresh,
    companion: companion ? { state: companion.state, version: companion.version, online, lastSeenAt: companion.lastSeenAt.toISOString() } : null,
    // The 15-minute operational guard is measured from Signal's receipt,
    // not from the upstream compiler timestamp. A perfectly current KE state
    // can be hours old when it is packaged; using generatedAt would enqueue a
    // duplicate scan immediately after a successful refresh.
    lastPackageAt: pkg?.createdAt.toISOString() ?? latestSnapshot?.createdAt.toISOString() ?? null,
    lastAuditAt: latestAudit?.createdAt.toISOString() ?? null,
    activeJob: job && !TERMINAL_JOBS.has(job.status) ? { id: job.id, status: job.status, stage: job.stage, progress: job.progress } : null,
  };
}

export async function requestAuditRefresh(scopeId: string): Promise<
  { status: "queued"; scanId: string; jobId: string } |
  { status: "already_running"; scanId: string; jobId: string } |
  { status: "current"; reason: string } |
  { status: "blocked"; reason: string }
> {
  const knowledge = await readKnowledgeStatus(scopeId);
  if (knowledge.code === "ingesting" || knowledge.code === "offline" || knowledge.code === "unavailable") {
    return { status: "blocked", reason: knowledge.detail };
  }
  if (knowledge.activeJob) {
    const scan = await prisma.bootstrapScanJob.findUnique({ where: { id: knowledge.activeJob.id }, select: { scanRunId: true } });
    return { status: "already_running", scanId: scan?.scanRunId ?? "", jobId: knowledge.activeJob.id };
  }
  if (knowledge.code === "current" && knowledge.lastPackageAt && Date.now() - new Date(knowledge.lastPackageAt).getTime() < AUDIT_FRESHNESS_TTL_MS) {
    return { status: "current", reason: "The completed package is within the freshness window; no expensive rescan was started." };
  }
  const activation = await prisma.projectActivation.findUnique({ where: { scopeId }, select: { bootstrapId: true } });
  if (!activation) return { status: "blocked", reason: "This project has no active companion identity." };
  const created = await createCompanionScan(activation.bootstrapId);
  if (!created) return { status: "blocked", reason: "The refresh request could not be created." };
  return { status: "queued", scanId: created.scan.id, jobId: created.job.id };
}

async function reportReadiness(scopeId: string) {
  const [scope, openGateTests, pendingScope, sourceHealth, reconciliation, namedAllocations, derived] = await Promise.all([
    prisma.scope.findUnique({ where: { id: scopeId } }),
    prisma.decision.count({ where: { scopeId, status: "open", gate: { isNot: null }, OR: [
      { title: { contains: "test", mode: "insensitive" } }, { title: { contains: "address", mode: "insensitive" } },
    ] } }),
    prisma.auditChangeProposal.count({ where: { scopeId, category: "scope", status: { in: ["pending", "needs_completion"] }, relevanceClass: { not: "irrelevant_bleed" } } }),
    prisma.auditChangeProposal.count({ where: { scopeId, category: "source_health", status: { in: ["pending", "needs_completion"] } } }),
    prisma.capacityReconciliation.findUnique({ where: { scopeId } }),
    prisma.allocation.count({ where: { scopeId, person: { active: true, synthetic: false } } }),
    prisma.projectDerivedState.findUnique({ where: { scopeId } }),
  ]);
  const blockers: { code: string; label: string; targetHref: string }[] = [];
  if (!scope || scope.executionState !== "configured") blockers.push({ code: "execution_truth", label: "Execution truth unavailable", targetHref: `/scope?project=${scopeId}` });
  if (openGateTests) blockers.push({ code: "test_gate", label: "Synthetic/test Decision gate present", targetHref: `/decisions?project=${scopeId}` });
  if (pendingScope) blockers.push({ code: "scope_unreconciled", label: `${pendingScope} Scope proposal${pendingScope === 1 ? "" : "s"} unreconciled`, targetHref: `/audit?project=${scopeId}` });
  if (!namedAllocations || reconciliation?.status !== "named_exact" || !reconciliation.completenessConfirmed) blockers.push({ code: "capacity_unreconciled", label: "Named capacity unreconciled", targetHref: `/portfolio?project=${scopeId}` });
  if (sourceHealth) blockers.push({ code: "source_health", label: `${sourceHealth} source-health issue${sourceHealth === 1 ? "" : "s"}`, targetHref: `/audit?project=${scopeId}` });
  if (!derived || derived.status !== "current" || derived.computedRevision < derived.realityRevision) blockers.push({ code: "forecast_stale", label: "Forecast consequences unavailable or stale", targetHref: `/forecast?project=${scopeId}` });
  return { ready: blockers.length === 0, label: blockers.length ? `REPORT NOT READY · ${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : "REPORT READY", blockers };
}

export async function getAuditChangeInbox(scopeId: string) {
  const baseline = await ensureReconciliationBaseline(scopeId);
  const [knowledge, proposals, scope, readiness] = await Promise.all([
    readKnowledgeStatus(scopeId),
    prisma.auditChangeProposal.findMany({
      where: { scopeId, relevanceClass: { not: "irrelevant_bleed" } },
      orderBy: [{ status: "asc" }, { category: "asc" }, { createdAt: "asc" }],
      include: { events: { orderBy: { createdAt: "desc" }, take: 10 } },
    }),
    prisma.scope.findUnique({ where: { id: scopeId } }),
    reportReadiness(scopeId),
  ]);
  const active = proposals.filter((item) => ["pending", "needs_completion", "deferred"].includes(item.status));
  const counts = active.reduce<Record<string, number>>((out, item) => {
    out[item.category] = (out[item.category] ?? 0) + 1;
    return out;
  }, {});
  const sourceHealth = {
    hermes: knowledge.code === "current" ? "current" : knowledge.code,
    linear: scope?.executionState ?? "unavailable",
    linearDetail: scope?.executionDetail ?? (scope?.projectNames.length ? `${scope.projectNames.length} mapped project${scope.projectNames.length === 1 ? "" : "s"}` : "No project mapping"),
    notion: scope?.notionPageIds.length ? "configured" : "unconfigured",
    figma: scope?.figmaRefs.length ? "configured" : "unconfigured",
    companion: knowledge.companion?.online ? knowledge.companion.state : "offline",
    lastPackageAt: knowledge.lastPackageAt,
    lastAuditAt: knowledge.lastAuditAt,
  };
  return { scope: scope ? { id: scope.id, name: scope.name } : null, knowledge, counts, total: active.length, proposals, sourceHealth, readiness, baseline };
}
