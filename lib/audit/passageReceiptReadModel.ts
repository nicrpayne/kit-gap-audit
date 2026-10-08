import "server-only";
import { prisma } from "@/lib/prisma";
import { passageIdentity, projectPassageReceipt } from "./passageReceipt";

export async function loadAuditPassageReceipt(scopeId?: string, nodeId?: string) {
  const identity = passageIdentity(nodeId);
  if (!identity || !nodeId) return null;
  const snapshot = scopeId ? await prisma.contextSnapshot.findFirst({
    where: { id: identity.snapshotId, scopeId },
    select: { id: true, scopeId: true, createdAt: true, package: true },
  }) : null;
  return projectPassageReceipt(scopeId ?? "", nodeId, snapshot ? { ...snapshot, createdAt: snapshot.createdAt.toISOString() } : null);
}
