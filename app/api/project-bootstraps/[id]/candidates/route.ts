import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bootstrapHash, stableId } from "@/lib/bootstrap/hash";
import type { CandidateKind } from "@/lib/bootstrap/contracts";

const KINDS = new Set<CandidateKind>(["source", "person", "capability", "decision", "dependency", "milestone", "risk", "unknown", "missing_information"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const kind = typeof body.kind === "string" ? body.kind as CandidateKind : "capability";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!KINDS.has(kind) || !title) return NextResponse.json({ error: "A supported kind and title are required" }, { status: 400 });
  const exists = await prisma.projectBootstrap.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown> : { title };
  const fingerprint = bootstrapHash({ kind, payload, operatorAssertion: true });
  const candidate = await prisma.$transaction(async (tx) => {
    const row = await tx.bootstrapCandidate.create({ data: {
      bootstrapId: id, packageId: null, candidateKey: stableId(`manual-${kind}`, { title, fingerprint, at: Date.now() }),
      kind, title, summary: typeof body.summary === "string" ? body.summary.trim() : title,
      whyProposed: "Operator assertion · no evidence yet", matchBasis: "operator assertion",
      currentness: "unknown", relevance: "medium", sourceFingerprint: fingerprint,
      originalProposal: { kind, title, payload, operatorAssertion: true } as Prisma.InputJsonValue,
      operatorAssertion: true,
    } });
    await tx.bootstrapReviewEvent.create({ data: {
      bootstrapId: id, candidateId: row.id, action: "manual_create", fromStatus: null, toStatus: "pending",
      detail: { note: "Operator assertion · no evidence yet" },
    } });
    await tx.projectBootstrap.update({ where: { id }, data: { reviewRevision: { increment: 1 } } });
    return row;
  });
  return NextResponse.json({ candidate }, { status: 201 });
}

