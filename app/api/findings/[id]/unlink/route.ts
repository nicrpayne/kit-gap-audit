// THE WAY BACK OUT OF A STRANDED FINDING.
//
// QA found a finding still showing "Ticketed · SOF-807/SOF-808" after those
// issues were deleted in Linear. There was no way to act on it: the Draft
// button was gone, the status was inert, and nothing offered to correct the
// record. The finding was permanently asserting something untrue.
//
// This does NOT check Linear. It cannot: the audit render path has no Linear
// coupling, and adding a per-identifier lookup there is the expensive
// read-path solution we deliberately are not building (see the reconciliation
// proposal). What it does is give a person who KNOWS the ticket is gone a way
// to say so.
//
// PROVENANCE IS PRESERVED, NOT ERASED. `linearIssueId` is deliberately left
// intact and only `status` returns to "open", so the record still says which
// issue this was once filed as. Nulling it would make the finding actionable
// by destroying the evidence of what happened to it — trading one lie for a
// gap. The surface reads the pair (open + linearIssueId) as "was filed as
// SOF-807, no longer tracked".
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const finding = await prisma.finding.findUnique({ where: { id } });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
  if (finding.status !== "ticketed") {
    return NextResponse.json(
      { error: `Only a ticketed finding can be unlinked; this one is "${finding.status}".` },
      { status: 400 }
    );
  }

  const updated = await prisma.finding.update({
    where: { id },
    data: { status: "open" },
  });

  return NextResponse.json({ finding: updated, unlinkedFrom: finding.linearIssueId });
}
