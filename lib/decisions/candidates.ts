// DERIVED CLAIMS -> DECISION CANDIDATES.
//
// docs/CONTEXT-MODEL.md is explicit that a DerivedClaim is inert: "never
// itself a Finding, forecast input, Linear ticket, or Reality." This module
// is the one place that reads them, and it preserves that boundary exactly
// -- it writes DecisionCandidate rows and nothing else. No Decision, no
// Finding, no gate, no date movement. A human accepting a candidate is what
// creates Reality.
//
// It runs where context actually arrives (POST /api/refresh, immediately
// after a package is persisted), so a refinement call becomes a tray of
// suggestions without anyone pressing an import button. The same function
// backs a rescan of snapshots already held.

import { prisma } from "@/lib/prisma";
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";
import type { ProjectContextPackage } from "@/lib/context/package";

// The claim `kind` vocabulary is deliberately open (lib/context/package.ts),
// so this matches the kinds that actually name a choice and ignores
// everything else, rather than sweeping in whatever a producer emitted.
const DECISION_KINDS = new Set(["decision", "open_question", "question", "choice"]);
const isDecisionKind = (kind: string) => DECISION_KINDS.has(kind.toLowerCase().replace(/[\s-]+/g, "_"));

export interface HarvestResult {
  scannedSnapshots: number;
  imported: number;
  alreadyKnown: number;
  skippedKind: number;
}

/** Stable across a re-import of the same package: a snapshot is immutable
    and claim ids are unique within it, so one claim can never produce two
    candidates. Also what makes a dismissal stick. */
export function claimKeyFor(snapshotId: string, claimId: string): string {
  return `${snapshotId}:${claimId}`;
}

export async function currentDecisionCandidates(scopeIds?: string[]) {
  const scopes = scopeIds ?? (await prisma.scope.findMany({ select: { id: true } })).map((scope) => scope.id);
  const currentIds = (await Promise.all(scopes.map((id) => currentContextSnapshot(id).catch(() => null)))).flatMap((snapshot) => snapshot ? [snapshot.id] : []);
  return prisma.decisionCandidate.findMany({
    where: { status: "pending", contextSnapshotId: { in: currentIds } }, orderBy: { createdAt: "asc" },
    include: { scope: { select: { id: true, name: true } } },
  });
}

export async function harvestCandidates(where: { id?: string; scopeId?: string } = {}): Promise<HarvestResult> {
  const scopeIds = where.scopeId ? [where.scopeId]
    : where.id ? (await prisma.contextSnapshot.findMany({ where: { id: where.id }, select: { scopeId: true } })).map((row) => row.scopeId)
    : (await prisma.scope.findMany({ select: { id: true } })).map((scope) => scope.id);
  const snapshots = (await Promise.all(scopeIds.map((id) => currentContextSnapshot(id))))
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => !!snapshot && (!where.id || snapshot.id === where.id));

  const result: HarvestResult = {
    scannedSnapshots: snapshots.length,
    imported: 0,
    alreadyKnown: 0,
    skippedKind: 0,
  };

  for (const snap of snapshots) {
    const pkg = snap.package as unknown as ProjectContextPackage;
    const evidenceById = new Map((pkg.evidence ?? []).map((e) => [e.id, e]));
    const firstSource = pkg.sources?.[0];
    // Named the way the producer named it, not a generic "imported".
    const sourceLabel = firstSource ? `${snap.producer} · ${firstSource.sourceRef}` : snap.producer;

    for (const claim of pkg.derivedClaims ?? []) {
      if (!isDecisionKind(claim.kind)) {
        result.skippedKind++;
        continue;
      }
      const claimKey = claimKeyFor(snap.id, claim.id);
      if (await prisma.decisionCandidate.findUnique({ where: { claimKey }, select: { id: true } })) {
        result.alreadyKnown++;
        continue;
      }
      // Citations are copied verbatim from the package's own evidence.
      // Where a claim cites nothing it carries nothing -- an empty list is
      // the honest record, not a manufactured one.
      const cited = claim.evidenceRefs.map((r) => evidenceById.get(r)).filter((e) => e !== undefined);
      await prisma.decisionCandidate.create({
        data: {
          claimKey,
          scopeId: snap.scopeId,
          title: claim.statement,
          sourceLabel,
          contextSnapshotId: snap.id,
          evidenceRefs: claim.evidenceRefs,
          excerpts: cited.map((e) => e.excerpt),
          status: "pending",
        },
      });
      result.imported++;
    }
  }

  return result;
}
