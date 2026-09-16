import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { compileScopeProposal, type CompiledScopeProposal } from "@/lib/scope/proposal";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function refreshScopeProposal(scopeId: string) {
  const scope = await prisma.scope.findUnique({
    where: { id: scopeId },
    include: {
      capabilities: { include: { workLinks: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      contextSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!scope) return null;

  const issues = await getScopedIssues(scope);
  const latestSnapshot = scope.contextSnapshots[0] ?? null;
  const compiled = compileScopeProposal({
    includeTriage: scope.includeTriage,
    issues,
    capabilities: scope.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      status: capability.status,
      revision: capability.revision,
      workLinks: capability.workLinks.map((link) => ({ externalId: link.externalId, state: link.state })),
    })),
    activeReleaseNames: scope.projectNames,
    snapshot: latestSnapshot,
  });

  const include = { items: { orderBy: [{ confidenceScore: "desc" as const }, { title: "asc" as const }] } };
  let proposal: Awaited<ReturnType<typeof prisma.scopeProposal.findUnique>> & { items: Awaited<ReturnType<typeof prisma.scopeProposalItem.findMany>> } | null = null;
  for (let attempt = 0; attempt < 3 && !proposal; attempt += 1) {
    try {
      proposal = await prisma.$transaction(async (tx) => {
        const existing = await tx.scopeProposal.findUnique({
          where: { scopeId_fingerprint: { scopeId, fingerprint: compiled.fingerprint } },
          include,
        });
        if (existing && existing.status === "active") return existing;

        await tx.scopeProposal.updateMany({
          where: { scopeId, status: "active", fingerprint: { not: compiled.fingerprint } },
          data: { status: "superseded", supersededAt: new Date() },
        });
        if (existing) {
          return tx.scopeProposal.update({
            where: { id: existing.id },
            data: { status: "active", supersededAt: null },
            include,
          });
        }

        return tx.scopeProposal.create({
          data: {
            scopeId,
            contextSnapshotId: latestSnapshot?.id ?? null,
            contractVersion: compiled.contractVersion,
            compilerVersion: compiled.compilerVersion,
            fingerprint: compiled.fingerprint,
            sourceWatermark: json(compiled.sourceWatermark),
            summary: json(compiled.summary),
            items: {
              create: compiled.items.map((item) => ({
                candidateKey: item.candidateKey,
                title: item.title,
                description: item.description,
                origins: item.origins,
                reconciliationState: item.reconciliationState,
                conflicts: json(item.conflicts),
                releaseSignal: item.releaseSignal,
                confidence: item.confidence,
                confidenceScore: item.confidenceScore,
                matchState: item.matchState,
                action: item.action,
                targetCapabilityId: item.targetCapabilityId,
                targetRevision: item.targetRevision,
                workItemIds: item.workItemIds,
                alreadyLinkedItemIds: item.alreadyLinkedItemIds,
                rationale: json(item.rationale),
                provenance: json(item.provenance),
              })),
            },
          },
          include,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        proposal = await prisma.scopeProposal.findUnique({ where: { scopeId_fingerprint: { scopeId, fingerprint: compiled.fingerprint } }, include });
        if (proposal?.status === "active") break;
        proposal = null;
        continue;
      }
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2)) throw error;
    }
  }
  if (!proposal) throw new Error("Scope proposal could not be persisted after concurrent updates.");

  return { proposal, issues, compiled };
}

export function proposalResponse(
  value: NonNullable<Awaited<ReturnType<typeof refreshScopeProposal>>>,
) {
  const { proposal } = value;
  return {
    id: proposal.id,
    scopeId: proposal.scopeId,
    contextSnapshotId: proposal.contextSnapshotId,
    contractVersion: proposal.contractVersion,
    compilerVersion: proposal.compilerVersion,
    fingerprint: proposal.fingerprint,
    sourceWatermark: proposal.sourceWatermark as unknown as CompiledScopeProposal["sourceWatermark"],
    summary: proposal.summary as unknown as CompiledScopeProposal["summary"],
    status: proposal.status,
    generatedAt: proposal.generatedAt,
    stale: proposal.fingerprint !== value.compiled.fingerprint,
    items: proposal.items,
  };
}
