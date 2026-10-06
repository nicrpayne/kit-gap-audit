import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { READINESS_ROLES } from "@/lib/decisions/sourceDisposition";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";

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
    readinessRole?: string; expectedUpdatedAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status && !["open", "decided", "dismissed"].includes(body.status)) {
    return NextResponse.json({ error: `status must be open, decided or dismissed` }, { status: 400 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({ error: "A decision needs a title." }, { status: 400 });
  }
  if (body.readinessRole !== undefined && !READINESS_ROLES.includes(body.readinessRole as typeof READINESS_ROLES[number])) {
    return NextResponse.json({ error: "Choose release scope, reference, or needs review." }, { status: 400 });
  }
  if (body.neededBy && Number.isNaN(new Date(body.neededBy).getTime())) {
    return NextResponse.json({ error: "Needed by must be a valid date." }, { status: 400 });
  }
  const decision = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const existing = await tx.decision.findUnique({ where: { id } });
    if (!existing) return null;
    if (body.expectedUpdatedAt && existing.updatedAt.toISOString() !== body.expectedUpdatedAt) return "stale" as const;

    const decidedNow = body.status === "decided" && existing.status !== "decided";
    const updated = await tx.decision.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.readinessRole !== undefined ? { readinessRole: body.readinessRole } : {}),
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
    const changes = (["title", "rationale", "owner", "neededBy", "status", "resolution", "readinessRole"] as const)
      .filter((key) => JSON.stringify(existing[key]) !== JSON.stringify(updated[key]))
      .map((key) => `${key}: ${JSON.stringify(existing[key])} → ${JSON.stringify(updated[key])}`);
    if (changes.length) await tx.decisionEvidence.create({ data: {
      decisionId: id, kind: "manual", sourceLabel: "Decision details history",
      excerpt: `${new Date().toISOString()} · ${changes.join("\n")}`,
    } });
    if (changes.length) for (const scopeId of new Set([updated.scopeId, ...(updated.gate ? [updated.gate.targetScopeId] : [])])) {
      await invalidateDerivedReads(tx, scopeId, `Decision ${id} changed; evidence retained.`);
    }
    return updated;
  }, { maxWait: 5_000, timeout: 20_000 });
  if (decision === "stale") return NextResponse.json({ error: "This decision changed. Review the refreshed record before saving again." }, { status: 409 });
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  for (const scopeId of new Set([decision.scopeId, ...(decision.gate ? [decision.gate.targetScopeId] : [])])) await recomputeDerivedReads(scopeId);
  return NextResponse.json({ decision });
}
