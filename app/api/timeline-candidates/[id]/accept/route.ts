import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SEAT A CANDIDATE INTO TIMELINE REALITY.
//
// Two guarantees, the same pair DecisionCandidate acceptance makes:
//
//  1. EXACTLY ONCE. TimelineEvent.sourceClaimKey is UNIQUE, so a retry or
//     a double-click is answered by the database with the event already
//     created, not with a second landmark on the same day.
//
//  2. A DATE IS REQUIRED, AND MUST COME FROM A HUMAN OR FROM STRUCTURED
//     EVIDENCE. A dateless candidate cannot be accepted by pressing
//     accept — the request is refused until someone supplies the date.
//     Timeline will not guess when something happened from prose that
//     says it happened. That refusal is the product, not a validation
//     nicety: a landmark placed on an invented date is worse than no
//     landmark at all, because it looks exactly like a real one.
//
// The accepted event carries the candidate's evidence and source label
// verbatim, so a landmark that began as a machine reading stays visibly
// attested rather than becoming indistinguishable from something typed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const supplied = (body as Record<string, unknown>)?.date;
  const temporalStateIn = (body as Record<string, unknown>)?.temporalState;

  const candidate = await prisma.timelineEventCandidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (candidate.status === "dismissed") {
    return NextResponse.json({ error: "That candidate was dismissed. Reopen it first." }, { status: 409 });
  }

  const already = await prisma.timelineEvent.findUnique({ where: { sourceClaimKey: candidate.claimKey } });
  if (already) {
    if (candidate.status !== "accepted" || candidate.acceptedEventId !== already.id) {
      await prisma.timelineEventCandidate.update({
        where: { id },
        data: { status: "accepted", acceptedEventId: already.id },
      });
    }
    return NextResponse.json({ event: already, created: false });
  }

  let date: Date | null = candidate.date;
  if (typeof supplied === "string" && supplied) {
    const d = new Date(supplied);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "A real date is required" }, { status: 400 });
    date = d;
  }
  if (!date) {
    return NextResponse.json(
      {
        error:
          "This candidate has no date. Nothing in its evidence says when it happened, and Timeline will not infer a date from the statement. Supply the date to accept it.",
        needsDate: true,
      },
      { status: 422 }
    );
  }

  // Stated by the accepting human, defaulting to occurred: a candidate is
  // a machine's reading of something that already happened.
  const temporalState = temporalStateIn === "planned" ? "planned" : "occurred";

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.timelineEvent.create({
      data: {
        scopeId: candidate.scopeId,
        title: candidate.title,
        date,
        temporalState,
        kind: candidate.kind,
        source: "candidate",
        sourceLabel: candidate.sourceLabel,
        contextSnapshotId: candidate.contextSnapshotId,
        evidenceRefs: candidate.evidenceRefs,
        sourceClaimKey: candidate.claimKey,
      },
    });
    await tx.timelineEventCandidate.update({
      where: { id },
      data: { status: "accepted", acceptedEventId: created.id },
    });
    return created;
  });

  return NextResponse.json({ event, created: true }, { status: 201 });
}
