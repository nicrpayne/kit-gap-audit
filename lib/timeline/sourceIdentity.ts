import type { Prisma } from "@prisma/client";

type SnapshotReader = Pick<Prisma.TransactionClient, "contextSnapshot">;

/** Audit and Event Intake are two review surfaces for the same transported
 * claim, not permission to create two accepted landmarks. Match only the
 * explicit producer candidate identity; never merge events by similar titles.
 */
export async function timelineKeyForAuditProposal(
  proposal: { contextSnapshotId: string | null; sourceKind: string; sourceKey: string | null; fingerprint: string },
  db: SnapshotReader,
): Promise<string> {
  if (proposal.sourceKind !== "refresh" || !proposal.contextSnapshotId) return proposal.fingerprint;
  const snapshot = await db.contextSnapshot.findUnique({ where: { id: proposal.contextSnapshotId } });
  const body = snapshot?.package as { derivedClaims?: Array<{ id: string; extra?: { candidateKey?: string } }> } | undefined;
  const claim = body?.derivedClaims?.find((row) => row.extra?.candidateKey && `refresh:${row.extra.candidateKey}` === proposal.sourceKey);
  return claim ? `timeline:${proposal.contextSnapshotId}:${claim.id}` : proposal.fingerprint;
}
