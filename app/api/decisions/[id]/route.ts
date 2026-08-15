import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Update a Decision, including deciding and dismissing it.
//
// Deciding is a REALITY change: it records what was chosen and when, and
// -- because compute.ts only reads gates whose Decision is still open --
// it removes the gate from the forecast without deleting the gate row, so
// the record of what was once waiting survives.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    title?: string; status?: string; owner?: string | null; rationale?: string | null;
    neededBy?: string | null; options?: { id: string; label: string; note?: string }[];
    chosenOption?: string | null; resolution?: string | null; dismissReason?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status && !["open", "decided", "dismissed"].includes(body.status)) {
    return NextResponse.json({ error: `status must be open, decided or dismissed` }, { status: 400 });
  }
  const existing = await prisma.decision.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  const decidedNow = body.status === "decided" && existing.status !== "decided";
  const decision = await prisma.decision.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
      ...(body.neededBy !== undefined ? { neededBy: body.neededBy ? new Date(body.neededBy) : null } : {}),
      ...(body.options !== undefined ? { options: body.options } : {}),
      ...(body.chosenOption !== undefined ? { chosenOption: body.chosenOption } : {}),
      ...(body.resolution !== undefined ? { resolution: body.resolution } : {}),
      ...(body.dismissReason !== undefined ? { dismissReason: body.dismissReason } : {}),
      ...(decidedNow ? { decidedAt: new Date() } : {}),
      // Reopening clears the decided stamp rather than leaving a date that
      // contradicts the status.
      ...(body.status === "open" && existing.status === "decided" ? { decidedAt: null } : {}),
    },
    include: { gate: true },
  });
  return NextResponse.json({ decision });
}
