import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { COMPANION_ONLINE_MS } from "@/lib/bootstrap/jobs";

/** Optimistic guard around slow report assembly. No provider I/O in the final
 * transaction. Include the whole portfolio: upstream work and donor staffing
 * can affect a selected project's result. Raw values are hashed in memory,
 * never logged or returned to the browser. */
export async function reportOwnerFingerprint(db: Prisma.TransactionClient): Promise<string> {
  const rows = await Promise.all([
    db.scope.findMany({ orderBy: { id: "asc" } }),
    db.projectDerivedState.findMany({ orderBy: { scopeId: "asc" } }),
    db.person.findMany({ orderBy: { id: "asc" } }),
    db.allocation.findMany({ orderBy: { id: "asc" } }),
    db.portfolioSettings.findMany({ orderBy: { id: "asc" } }),
    db.capacityReconciliation.findMany({ orderBy: { scopeId: "asc" } }),
    db.capability.findMany({ orderBy: { id: "asc" } }),
    db.capabilityWorkLink.findMany({ orderBy: { id: "asc" } }),
    db.decision.findMany({ orderBy: { id: "asc" } }),
    db.decisionGate.findMany({ orderBy: { id: "asc" } }),
    db.decisionEvidence.findMany({ orderBy: { id: "asc" } }),
    db.workEstimate.findMany({ orderBy: { id: "asc" } }),
    db.timelineEvent.findMany({ orderBy: { id: "asc" } }),
    db.contextSnapshot.findMany({ orderBy: { id: "asc" } }),
    db.contextDoc.findMany({ orderBy: { id: "asc" } }),
    db.finding.findMany({ orderBy: { id: "asc" } }),
    db.auditRun.findMany({ orderBy: { id: "asc" } }),
    db.source.findMany({ orderBy: { id: "asc" } }),
    db.scopeProposal.findMany({ orderBy: { id: "asc" } }),
    db.bootstrapCompanion.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { id: true, knowledgeState: true, lastSeenAt: true } })
      .then((row) => row ? { id: row.id, knowledgeState: row.knowledgeState, online: Date.now() - row.lastSeenAt.getTime() <= COMPANION_ONLINE_MS } : null),
    db.projectActivation.findMany({ orderBy: { id: "asc" } }),
    db.projectBootstrap.findMany({ orderBy: { id: "asc" } }),
    db.bootstrapScanRun.findMany({ orderBy: { id: "asc" } }),
    db.bootstrapScanJob.findMany({ orderBy: { id: "asc" } }),
    db.bootstrapPackage.findMany({ orderBy: { id: "asc" } }),
    db.report.findMany({ orderBy: { id: "asc" }, select: { id: true, scopeId: true, generatedAt: true } }),
  ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
