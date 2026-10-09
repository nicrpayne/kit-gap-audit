import { prisma } from "@/lib/prisma";
import type { CapabilityAuditEvidenceOrigin } from "./capabilityEvidence";

/** Only exact accepted Audit proposals referenced by these current owners.
 * No title matching, current-knowledge fallback, or implicit history repair. */
export async function loadCapabilityAuditEvidenceOrigins(scopeId: string, capabilities: {id:string;provenance:unknown}[]): Promise<CapabilityAuditEvidenceOrigin[]> {
  const ids = capabilities.flatMap(capability => {
    const value = capability.provenance;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const id = (value as Record<string,unknown>).auditChangeProposalId;
    return typeof id === "string" ? [id] : [];
  });
  if (!ids.length) return [];
  const proposals = await prisma.auditChangeProposal.findMany({
    where: {id:{in:ids},scopeId,status:"accepted",canonicalObjectType:"Capability",canonicalObjectId:{in:capabilities.map(capability=>capability.id)}},
    select: {id:true,scopeId:true,status:true,canonicalObjectId:true,auditRunId:true,acceptedAt:true,evidence:true,
      contextSnapshot:{select:{id:true,scopeId:true,createdAt:true,package:true}}},
  });
  return proposals.flatMap(proposal => !proposal.contextSnapshot || !proposal.acceptedAt || !proposal.canonicalObjectId ? [] : [{
    proposalId:proposal.id,scopeId:proposal.scopeId,capabilityId:proposal.canonicalObjectId,auditRunId:proposal.auditRunId,
    status:proposal.status,acceptedAt:proposal.acceptedAt.toISOString(),evidence:proposal.evidence,
    snapshot:{...proposal.contextSnapshot,createdAt:proposal.contextSnapshot.createdAt.toISOString()},
  }]);
}
