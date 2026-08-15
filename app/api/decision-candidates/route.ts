import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { harvestCandidates } from "@/lib/decisions/candidates";

// THE CANDIDATE TRAY'S READ, and a rescan of context already held.
//
// Harvesting normally happens where context arrives (POST /api/refresh,
// right after a package is persisted) -- a refinement call becomes a tray
// of suggestions without anyone pressing a button. This POST exists for
// snapshots accepted before this instrument existed, and it is the same
// function, so the two paths cannot drift.
//
// Neither path can create a Decision, a Finding or a gate. The response
// says so in numbers rather than in prose.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const candidates = await prisma.decisionCandidate.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "asc" },
    include: { scope: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ candidates });
}

export async function POST(req: NextRequest) {
  let body: { scopeId?: string } = {};
  try {
    body = (await req.json()) as { scopeId?: string };
  } catch {
    // A bodyless rescan means "every snapshot we hold".
  }
  const result = await harvestCandidates(body.scopeId ? { scopeId: body.scopeId } : {});
  return NextResponse.json({ ...result, decisionsCreated: 0, gatesCreated: 0 });
}
