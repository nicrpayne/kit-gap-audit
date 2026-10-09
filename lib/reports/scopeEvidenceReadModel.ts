import "server-only";
import { prisma } from "@/lib/prisma";
import { freezeScopeEvidence } from "./scopeEvidence";
import { loadCapabilityAuditEvidenceOrigins } from "@/lib/scope/capabilityEvidenceReadModel";

export async function loadReportScopeEvidence(scopeId: string, capturedAt: string) {
  const scope = await prisma.scope.findUniqueOrThrow({
    where: { id: scopeId },
    select: {
      capabilities: { where: { status: "accepted" }, select: { id: true, scopeId: true, name: true, revision: true, status: true, provenance: true } },
      activation: { select: { contextSnapshot: { select: { id: true, scopeId: true, createdAt: true, package: true } } } },
    },
  });
  const snapshot = scope.activation?.contextSnapshot;
  return freezeScopeEvidence({
    scopeId, capturedAt, capabilities: scope.capabilities,
    auditOrigins: await loadCapabilityAuditEvidenceOrigins(scopeId, scope.capabilities),
    activationSnapshot: snapshot ? { ...snapshot, createdAt: snapshot.createdAt.toISOString() } : null,
  });
}
