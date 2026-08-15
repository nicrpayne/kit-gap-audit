import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DISMISS A CANDIDATE. The row survives, marked dismissed, so a re-import
// of the same package does not push the same rejected suggestion back into
// the tray — the human's "no" is remembered.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.decisionCandidate.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (candidate.status === "accepted") {
    return NextResponse.json(
      { error: "That candidate is already a decision. Dismiss the decision instead." },
      { status: 409 }
    );
  }
  const updated = await prisma.decisionCandidate.update({ where: { id }, data: { status: "dismissed" } });
  return NextResponse.json({ candidate: updated });
}
