import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";

// ATTACH EVIDENCE TO AN EXISTING DECISION.
//
// The same choice really is discussed in a call, a Linear comment and a
// spreadsheet. §32's answer is one Decision that accumulates citations,
// rather than four canonical Decisions or an LLM trying to merge them —
// so this is the path "attach to existing" takes when a duplicate is
// surfaced.
const KINDS = ["context_package", "linear", "manual", "finding"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    kind?: string;
    excerpt?: string;
    contextSnapshotId?: string | null;
    evidenceItemId?: string | null;
    externalRef?: string | null;
    sourceLabel?: string | null;
    /** When set, the candidate whose citations are being folded in; it is
        marked accepted against this Decision rather than left in the tray. */
    fromCandidateId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const decision = await prisma.decision.findUnique({ where: { id }, select: { id: true } });
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  // Folding a candidate in: its cited excerpts move across verbatim, and
  // the candidate is consumed. No second canonical Decision is born.
  if (body.fromCandidateId) {
    try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.decision.findUniqueOrThrow({ where: { id }, select: { scopeId: true } });
      const candidate = await tx.decisionCandidate.findUnique({ where: { id: body.fromCandidateId } });
      if (!candidate) throw new CandidateEvidenceConflict("Candidate not found.");
      if (candidate.scopeId !== target.scopeId) throw new CandidateEvidenceConflict("Choose a Decision in the candidate's own project.");
      if (candidate.status === "accepted") {
        if (candidate.acceptedDecisionId === id) return { evidence: [], attachedFromCandidate: candidate.id, alreadyAttached: true };
        throw new CandidateEvidenceConflict("That candidate has already been accepted against another Decision.");
      }
      if (candidate.status !== "pending") throw new CandidateEvidenceConflict("That candidate was dismissed. Review a pending candidate instead.");
      const manual = candidate.contextSnapshotId === null && candidate.claimKey.startsWith("paste:");
      if (!manual) {
        const current = await currentContextSnapshot(candidate.scopeId, tx);
        if (!candidate.contextSnapshotId || current?.id !== candidate.contextSnapshotId) {
          throw new CandidateEvidenceConflict("Knowledge changed. Review a candidate from the current source before attaching evidence.");
        }
      }
      const made = [];
      for (let i = 0; i < candidate.excerpts.length; i++) {
        made.push(
          await tx.decisionEvidence.create({
            data: {
              decisionId: id,
              kind: manual ? "manual" : "context_package",
              excerpt: candidate.excerpts[i],
              contextSnapshotId: candidate.contextSnapshotId,
              evidenceItemId: candidate.evidenceRefs[i] ?? null,
              sourceLabel: candidate.sourceLabel,
            },
          })
        );
      }
      await tx.decisionCandidate.update({
        where: { id: candidate.id },
        data: { status: "accepted", acceptedDecisionId: id },
      });
      return { evidence: made, attachedFromCandidate: candidate.id, alreadyAttached: false };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof CandidateEvidenceConflict ? error.message : "Evidence inputs changed or could not be read. Refresh and retry; the attachment was not saved." }, { status: 409 });
    }
  }

  const excerpt = body.excerpt?.trim();
  if (!excerpt) return NextResponse.json({ error: "Evidence needs an excerpt." }, { status: 400 });
  const kind = body.kind ?? "manual";
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  }

  const evidence = await prisma.decisionEvidence.create({
    data: {
      decisionId: id,
      kind,
      excerpt,
      contextSnapshotId: body.contextSnapshotId ?? null,
      evidenceItemId: body.evidenceItemId ?? null,
      externalRef: body.externalRef ?? null,
      sourceLabel: body.sourceLabel ?? null,
    },
  });
  return NextResponse.json({ evidence: [evidence] });
}

class CandidateEvidenceConflict extends Error {}
