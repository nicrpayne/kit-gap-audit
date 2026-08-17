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
//
// PLACEMENT IS THE ACCEPTING HUMAN'S, AND ONLY THE EVENT'S.
//
// `scopeId`, `endDate` and `temporalState` may all be supplied, because
// dropping a candidate onto the score is a statement about WHERE and WHEN
// it belongs, and that statement is the whole act of acceptance. What it is
// NOT is a correction to the source: the candidate's own `scopeId` and
// `date` are what Hermes or a registered source proposed, they are that
// system's record, and they are left exactly as they were. Timeline owns the
// placement; the source keeps its suggestion. Anyone can later see both, and
// that they differed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const supplied = (body as Record<string, unknown>)?.date;
  const suppliedEnd = (body as Record<string, unknown>)?.endDate;
  const suppliedScope = (body as Record<string, unknown>)?.scopeId;
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

  // WHERE THE ACCEPTING HUMAN PUT IT. Defaults to the suggestion, and is
  // validated against a real Scope so a placement can never point at
  // nothing.
  let scopeId = candidate.scopeId;
  if (typeof suppliedScope === "string" && suppliedScope && suppliedScope !== scopeId) {
    const target = await prisma.scope.findUnique({ where: { id: suppliedScope }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Scope not found" }, { status: 404 });
    scopeId = suppliedScope;
  }

  // HOW LONG, IF THE PLACEMENT SAYS SO. Same rule as everywhere else in
  // Timeline: an end that precedes its start is refused rather than
  // silently swapped.
  let endDate: Date | null = candidate.endDate;
  if (suppliedEnd !== undefined) {
    if (suppliedEnd === null) endDate = null;
    else if (typeof suppliedEnd !== "string" || Number.isNaN(new Date(suppliedEnd).getTime())) {
      return NextResponse.json({ error: "endDate must be a real date" }, { status: 400 });
    } else endDate = new Date(suppliedEnd);
  }
  if (endDate && endDate.getTime() <= date.getTime()) {
    return NextResponse.json({ error: "endDate cannot precede date" }, { status: 400 });
  }

  // Stated by the accepting human, defaulting to occurred: a candidate is
  // a machine's reading of something that already happened.
  const temporalState = temporalStateIn === "planned" ? "planned" : "occurred";

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.timelineEvent.create({
      data: {
        scopeId,
        title: candidate.title,
        date,
        endDate,
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
