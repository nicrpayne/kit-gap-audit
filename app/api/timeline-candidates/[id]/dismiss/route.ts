import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Dismissal sticks: claimKey is stable across re-imports of the same
// package, so a rescan will not resurrect something already refused.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.timelineEventCandidate.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (candidate.status === "accepted") {
    return NextResponse.json({ error: "Already seated into Timeline. Delete the event instead." }, { status: 409 });
  }
  const updated = await prisma.timelineEventCandidate.update({ where: { id }, data: { status: "dismissed" } });
  return NextResponse.json({ candidate: updated });
}
