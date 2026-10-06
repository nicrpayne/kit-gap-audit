import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";
import { candidateDisposition } from "@/lib/decisions/candidates";
import type { ProjectContextPackage } from "@/lib/context/package";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";

// PROMOTE A CANDIDATE — the moment a machine suggestion becomes a real,
// human-owned Decision.
//
// Two guarantees:
//
//  1. EXACTLY ONCE. Decision.sourceClaimKey is UNIQUE, so idempotency is
//     enforced by the database rather than by a check-then-write that a
//     double-click can slip between. A retry returns the same Decision.
//
//  2. STILL NOT A GATE. Accepting preserves a reviewed historical lifecycle,
//     otherwise creates an OPEN, UNGATED Decision. The
//     producer's claim that something matters is not a claim that delivery
//     waits on it — that requires someone to answer the questions in
//     /api/decisions/[id]/gate.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.decisionCandidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (candidate.status === "dismissed") {
    return NextResponse.json({ error: "That candidate was dismissed. Reopen it first." }, { status: 409 });
  }

  // A prior accept — whether this call's own retry or a concurrent one —
  // is answered with the Decision it produced, not a duplicate.
  const already = await prisma.decision.findUnique({
    where: { sourceClaimKey: candidate.claimKey },
    include: { gate: true, evidence: true },
  });
  if (already) {
    if (candidate.status !== "accepted" || candidate.acceptedDecisionId !== already.id) {
      await prisma.decisionCandidate.update({
        where: { id },
        data: { status: "accepted", acceptedDecisionId: already.id },
      });
    }
    return NextResponse.json({ decision: already, created: false });
  }

  try {
  const decision = await prisma.$transaction(async (tx) => {
    const manual = candidate.contextSnapshotId === null && candidate.claimKey.startsWith("paste:");
    let pkg: ProjectContextPackage | undefined;
    if (!manual) {
      const current = await currentContextSnapshot(candidate.scopeId, tx);
      if (!candidate.contextSnapshotId || current?.id !== candidate.contextSnapshotId) {
        throw new Error("Knowledge changed. Review a candidate from the current source before accepting.");
      }
      pkg = current.package as unknown as ProjectContextPackage;
    }
    const prior = await tx.decision.findFirst({ where: { scopeId: candidate.scopeId, title: { equals: candidate.title, mode: "insensitive" } } });
    const disposition = candidateDisposition(candidate, pkg);
    const created = prior ?? await tx.decision.create({
      data: {
        scopeId: candidate.scopeId,
        title: candidate.title,
        ...disposition,
        decidedAt: disposition.status === "decided" ? new Date() : null,
        rationale: candidate.question,
        sourceClaimKey: candidate.claimKey,
      },
    });
    // The citations the producer supplied travel with it. Promotion must
    // not lose the reason the suggestion existed.
    for (let i = 0; i < candidate.excerpts.length; i++) {
      if (prior && await tx.decisionEvidence.findFirst({ where: { decisionId: prior.id, excerpt: candidate.excerpts[i] } })) continue;
      const cited = pkg?.evidence?.find(item => item.id === candidate.evidenceRefs[i]);
      await tx.decisionEvidence.create({
        data: {
          decisionId: created.id,
          kind: manual ? "manual" : "context_package",
          excerpt: candidate.excerpts[i],
          contextSnapshotId: candidate.contextSnapshotId,
          evidenceItemId: candidate.evidenceRefs[i] ?? null,
          sourceLabel: candidate.sourceLabel,
          externalRef: cited?.sourceRef ?? null,
        },
      });
    }
    await tx.decisionCandidate.update({
      where: { id },
      data: { status: "accepted", acceptedDecisionId: created.id },
    });
    if (!prior) await invalidateDerivedReads(tx, candidate.scopeId, "Accepted a reviewed Decision source.");
    return { id: created.id, created: !prior };
  }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 });

  await recomputeDerivedReads(candidate.scopeId);

  const full = await prisma.decision.findUnique({
    where: { id: decision.id },
    include: { gate: true, evidence: true },
  });
  return NextResponse.json({ decision: full, created: decision.created });
  } catch (error) {
    const existing = await prisma.decision.findUnique({ where: { sourceClaimKey: candidate.claimKey }, include: { gate: true, evidence: true } });
    if (existing) return NextResponse.json({ decision: existing, created: false });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate acceptance failed; retry." }, { status: 409 });
  }
}
