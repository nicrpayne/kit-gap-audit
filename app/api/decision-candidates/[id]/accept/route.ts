import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PROMOTE A CANDIDATE — the moment a machine suggestion becomes a real,
// human-owned Decision.
//
// Two guarantees:
//
//  1. EXACTLY ONCE. Decision.sourceClaimKey is UNIQUE, so idempotency is
//     enforced by the database rather than by a check-then-write that a
//     double-click can slip between. A retry returns the same Decision.
//
//  2. STILL NOT A GATE. Accepting creates an OPEN, UNGATED Decision. The
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

  const decision = await prisma.$transaction(async (tx) => {
    const created = await tx.decision.create({
      data: {
        scopeId: candidate.scopeId,
        title: candidate.title,
        status: "open",
        rationale: candidate.question,
        sourceClaimKey: candidate.claimKey,
      },
    });
    // The citations the producer supplied travel with it. Promotion must
    // not lose the reason the suggestion existed.
    for (let i = 0; i < candidate.excerpts.length; i++) {
      await tx.decisionEvidence.create({
        data: {
          decisionId: created.id,
          kind: "context_package",
          excerpt: candidate.excerpts[i],
          contextSnapshotId: candidate.contextSnapshotId,
          evidenceItemId: candidate.evidenceRefs[i] ?? null,
          sourceLabel: candidate.sourceLabel,
        },
      });
    }
    await tx.decisionCandidate.update({
      where: { id },
      data: { status: "accepted", acceptedDecisionId: created.id },
    });
    return created;
  });

  const full = await prisma.decision.findUnique({
    where: { id: decision.id },
    include: { gate: true, evidence: true },
  });
  return NextResponse.json({ decision: full, created: true });
}
