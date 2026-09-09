import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyToUtcDate, toDateOnly } from "@/lib/time/dateContract";
import { invalidateDerivedReads, recomputeDerivedReads } from "./derivedRefresh";

export class ChangeCompletionRequiredError extends Error {
  constructor(message: string, readonly fields: string[]) { super(message); }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function plain(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ChangeCompletionRequiredError(`${field} is required.`, [field]);
  return value.trim();
}

async function applyOwnerMutation(
  tx: Prisma.TransactionClient,
  proposal: Awaited<ReturnType<typeof prisma.auditChangeProposal.findUniqueOrThrow>>,
  completion: Record<string, unknown>,
) {
  const state = record(proposal.proposedState);
  const action = text(state.action, "action");
  if (action === "upsert_capability") {
    const name = text(state.name, "name");
    const current = await tx.capability.findFirst({ where: { scopeId: proposal.scopeId, name: { equals: name, mode: "insensitive" } } });
    const data = {
      name, description: typeof state.description === "string" ? state.description : null,
      status: typeof state.status === "string" ? state.status : "accepted",
      provenance: json({ auditChangeProposalId: proposal.id, auditRunId: proposal.auditRunId, contextSnapshotId: proposal.contextSnapshotId, evidence: proposal.evidence }),
    };
    const canonical = current
      ? await tx.capability.update({ where: { id: current.id }, data })
      : await tx.capability.create({ data: { scopeId: proposal.scopeId, ...data, sourceCandidateId: proposal.id } });
    return { type: "Capability", object: canonical, before: current };
  }
  if (action === "update_target_date") {
    const targetDate = text(completion.targetDate ?? state.targetDate, "targetDate");
    const date = dateOnlyToUtcDate(toDateOnly(targetDate));
    const before = await tx.scope.findUniqueOrThrow({ where: { id: proposal.scopeId } });
    const canonical = await tx.scope.update({ where: { id: proposal.scopeId }, data: { targetDate: date } });
    return { type: "Scope", object: canonical, before };
  }
  if (action === "create_open_decision" || action === "create_decided_decision") {
    const existing = await tx.decision.findUnique({ where: { sourceClaimKey: proposal.fingerprint } });
    if (existing) return { type: "Decision", object: existing, before: existing };
    const title = text(state.title ?? proposal.title, "title");
    const decided = action === "create_decided_decision";
    const options = Array.isArray(state.options) ? state.options : [];
    const created = await tx.decision.create({ data: {
      scopeId: proposal.scopeId, title, status: decided ? "decided" : "open",
      rationale: typeof state.rationale === "string" ? state.rationale : proposal.summary,
      options: json(options), chosenOption: decided && typeof state.chosenOption === "string" ? state.chosenOption : null,
      resolution: decided ? text(state.resolution, "resolution") : null, decidedAt: decided ? new Date() : null,
      sourceClaimKey: proposal.fingerprint,
    } });
    const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.map(record) : [];
    for (const item of evidence) {
      if (typeof item.excerpt !== "string" || !item.excerpt) continue;
      await tx.decisionEvidence.create({ data: {
        decisionId: created.id, kind: "context_package", excerpt: item.excerpt,
        contextSnapshotId: proposal.contextSnapshotId, evidenceItemId: typeof item.id === "string" ? item.id : null,
        externalRef: typeof item.sourceRef === "string" ? item.sourceRef : null, sourceLabel: "Audit Change Inbox",
      } });
    }
    return { type: "Decision", object: created, before: null };
  }
  if (action === "dismiss_decision_by_title") {
    const pattern = text(state.titlePattern, "titlePattern");
    const current = await tx.decision.findFirst({ where: { scopeId: proposal.scopeId, title: { contains: pattern, mode: "insensitive" } }, include: { gate: true } });
    if (!current) throw new ChangeCompletionRequiredError(`No Decision matching “${pattern}” exists in this project.`, ["Open Decisions and choose the synthetic row to retire."]);
    const canonical = await tx.decision.update({ where: { id: current.id }, data: {
      status: "dismissed", dismissReason: typeof state.dismissReason === "string" ? state.dismissReason : "Retired through Audit Change Inbox.",
    }, include: { gate: true } });
    return { type: "Decision", object: canonical, before: current };
  }
  if (action === "create_milestone") {
    const existing = await tx.timelineEvent.findUnique({ where: { sourceClaimKey: proposal.fingerprint } });
    if (existing) return { type: "TimelineEvent", object: existing, before: existing };
    const dateValue = text(completion.date ?? state.date, "date");
    const date = dateOnlyToUtcDate(toDateOnly(dateValue));
    const temporalState = state.temporalState === "planned" ? "planned" : "occurred";
    const canonical = await tx.timelineEvent.create({ data: {
      scopeId: proposal.scopeId, title: text(state.title ?? proposal.title, "title"), date,
      temporalState, semanticState: typeof state.semanticState === "string" ? state.semanticState : temporalState,
      kind: typeof state.kind === "string" ? state.kind : "milestone", source: "candidate",
      sourceLabel: "Audit Change Inbox", contextSnapshotId: proposal.contextSnapshotId,
      evidenceRefs: Array.isArray(proposal.evidence) ? proposal.evidence.map(record).map((item) => String(item.id ?? "")).filter(Boolean) : [],
      sourceClaimKey: proposal.fingerprint,
    } });
    return { type: "TimelineEvent", object: canonical, before: null };
  }
  if (action === "create_dependency") {
    const upstreamScopeId = text(completion.upstreamScopeId ?? state.upstreamScopeId, "upstreamScopeId");
    const downstreamScopeId = text(completion.downstreamScopeId ?? state.downstreamScopeId ?? proposal.scopeId, "downstreamScopeId");
    const basis = text(completion.basis ?? state.basis ?? proposal.whyProposed, "basis");
    const evidence = Array.isArray(proposal.evidence) ? proposal.evidence : [];
    if (!evidence.length) throw new ChangeCompletionRequiredError("A dependency needs current causal or prerequisite evidence.", ["evidence"]);
    const endpoints = await tx.scope.count({ where: { id: { in: [...new Set([upstreamScopeId, downstreamScopeId])] } } });
    if (endpoints !== new Set([upstreamScopeId, downstreamScopeId]).size) throw new ChangeCompletionRequiredError("Choose valid dependency endpoints.", ["upstreamScopeId", "downstreamScopeId"]);
    const current = await tx.scopeDependency.findUnique({ where: { upstreamScopeId_downstreamScopeId: { upstreamScopeId, downstreamScopeId } } });
    const canonical = current
      ? await tx.scopeDependency.update({ where: { id: current.id }, data: { basis, evidence: json(evidence), state: "active", sourceCandidateId: proposal.id } })
      : await tx.scopeDependency.create({ data: { upstreamScopeId, downstreamScopeId, basis, evidence: json(evidence), sourceCandidateId: proposal.id } });
    const downstream = await tx.scope.findUniqueOrThrow({ where: { id: downstreamScopeId }, select: { dependsOnScopeIds: true } });
    if (!downstream.dependsOnScopeIds.includes(upstreamScopeId)) {
      await tx.scope.update({ where: { id: downstreamScopeId }, data: { dependsOnScopeIds: [...downstream.dependsOnScopeIds, upstreamScopeId] } });
    }
    return { type: "ScopeDependency", object: canonical, before: current };
  }
  if (action === "resolve_finding") {
    const findingId = text(state.findingId, "findingId");
    const current = await tx.finding.findUnique({ where: { id: findingId } });
    if (!current) throw new ChangeCompletionRequiredError("The Finding no longer exists.", ["findingId"]);
    const canonical = await tx.finding.update({ where: { id: findingId }, data: {
      status: state.status === "stale" ? "resolved" : "resolved", resolution: typeof state.resolution === "string" ? state.resolution : "Resolved or made stale by newer accepted evidence.", resolvedAt: new Date(),
    } });
    return { type: "Finding", object: canonical, before: current };
  }
  throw new ChangeCompletionRequiredError("This card routes to its owning setup workflow and cannot be accepted as product Reality.", [proposal.targetHref ?? "Open the owning instrument."]);
}

export async function acceptAuditChange(proposalId: string, input: { idempotencyKey: string; completion?: Record<string, unknown> }) {
  if (!input.idempotencyKey?.trim()) throw new Error("idempotencyKey is required");
  const completion = input.completion ?? {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const accepted = await prisma.$transaction(async (tx) => {
        const priorEvent = await tx.auditChangeEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (priorEvent) {
          const proposal = await tx.auditChangeProposal.findUniqueOrThrow({ where: { id: priorEvent.proposalId } });
          return { proposal, created: false };
        }
        const proposal = await tx.auditChangeProposal.findUniqueOrThrow({ where: { id: proposalId } });
        if (proposal.status === "accepted") return { proposal, created: false };
        if (["rejected", "information_only"].includes(proposal.status)) throw new Error("That proposal is closed. Reopen it before accepting.");
        const requirements = Array.isArray(proposal.completionRequirements) ? proposal.completionRequirements : [];
        if (requirements.length && completion.confirmed !== true) {
          throw new ChangeCompletionRequiredError("This owner needs a small completion step before accepting.", requirements.map(String));
        }
        const mutation = await applyOwnerMutation(tx, proposal, completion);
        const now = new Date();
        const updated = await tx.auditChangeProposal.update({ where: { id: proposal.id }, data: {
          status: "accepted", canonicalObjectType: mutation.type, canonicalObjectId: String((mutation.object as { id?: string }).id ?? proposal.scopeId),
          beforeState: mutation.before ? json(plain(mutation.before)) : Prisma.JsonNull,
          afterState: json(plain(mutation.object)), acceptedAt: now, dispositionReason: typeof completion.note === "string" ? completion.note : null,
        } });
        await tx.auditChangeEvent.create({ data: {
          proposalId: proposal.id, idempotencyKey: input.idempotencyKey, action: "accept",
          fromStatus: proposal.status, toStatus: "accepted",
          detail: json({ targetOwner: proposal.owner, canonicalObjectType: mutation.type, canonicalObjectId: (mutation.object as { id?: string }).id ?? proposal.scopeId, evidence: proposal.evidence }),
        } });
        await invalidateDerivedReads(tx, proposal.scopeId, `Accepted Audit proposal ${proposal.id} into ${proposal.owner}.`);
        return { proposal: updated, created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const derived = accepted.created ? await recomputeDerivedReads(accepted.proposal.scopeId) : await prisma.projectDerivedState.findUnique({ where: { scopeId: accepted.proposal.scopeId } });
      return { ...accepted, derived };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Acceptance transaction could not be serialized.");
}

export async function dispositionAuditChange(
  proposalId: string,
  input: { action: "defer" | "reject" | "information_only" | "reopen"; reason?: string; idempotencyKey: string },
) {
  const target = input.action === "reopen" ? "pending" : input.action === "information_only" ? "information_only" : input.action === "defer" ? "deferred" : "rejected";
  return prisma.$transaction(async (tx) => {
    const existing = await tx.auditChangeEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return tx.auditChangeProposal.findUniqueOrThrow({ where: { id: existing.proposalId } });
    const proposal = await tx.auditChangeProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (proposal.status === "accepted") throw new Error("Accepted Reality cannot be undone from Audit; open the owning instrument.");
    const updated = await tx.auditChangeProposal.update({ where: { id: proposal.id }, data: { status: target, dispositionReason: input.reason?.trim() || null } });
    await tx.auditChangeEvent.create({ data: {
      proposalId, idempotencyKey: input.idempotencyKey, action: input.action,
      fromStatus: proposal.status, toStatus: target, detail: json({ reason: input.reason?.trim() || null }),
    } });
    return updated;
  });
}

export async function editAuditChange(proposalId: string, input: { proposedState: Record<string, unknown>; note?: string; idempotencyKey: string }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.auditChangeEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return tx.auditChangeProposal.findUniqueOrThrow({ where: { id: existing.proposalId } });
    const proposal = await tx.auditChangeProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (proposal.status === "accepted") throw new Error("Accepted Reality must be edited in the owning instrument.");
    const updated = await tx.auditChangeProposal.update({ where: { id: proposalId }, data: {
      proposedState: json(input.proposedState), status: "pending", dispositionReason: input.note?.trim() || null,
    } });
    await tx.auditChangeEvent.create({ data: {
      proposalId, idempotencyKey: input.idempotencyKey, action: "edit", fromStatus: proposal.status, toStatus: "pending",
      detail: json({ before: proposal.proposedState, after: input.proposedState, note: input.note?.trim() || null }),
    } });
    return updated;
  });
}
