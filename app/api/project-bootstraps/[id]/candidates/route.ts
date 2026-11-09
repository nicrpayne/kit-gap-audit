import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { readJsonObject, isRecord, requiredString } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";
import { serializableWrite } from "@/lib/db/serializable";
import { lockBootstrap } from "@/lib/bootstrap/identity";
import { bootstrapHash, stableId } from "@/lib/bootstrap/hash";
import type { CandidateKind } from "@/lib/bootstrap/contracts";

const KINDS = new Set<CandidateKind>([
  "source",
  "person",
  "capability",
  "decision",
  "dependency",
  "milestone",
  "risk",
  "unknown",
  "missing_information",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await readJsonObject(req);
    const kind = (body.kind ?? "capability") as CandidateKind;
    const title = requiredString(body.title, "Title", 1000);
    if (!KINDS.has(kind) || !title)
      return NextResponse.json(
        { error: "A supported kind and title are required" },
        { status: 400 },
      );
    if (body.payload !== undefined && !isRecord(body.payload))
      return NextResponse.json({ error: "Proposal payload must be an object." }, { status: 400 });
    const summary =
      body.summary === undefined ? title : requiredString(body.summary, "Summary", 10_000);
    const payload = (body.payload ?? { title }) as Record<string, unknown>;
    const fingerprint = bootstrapHash({ kind, payload, operatorAssertion: true });
    return await serializableWrite(async (tx) => {
      await lockBootstrap(tx, id);
      const exists = await tx.projectBootstrap.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!exists)
        return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
      if (exists.status === "archived")
        return NextResponse.json(
          { error: "Archived project setups cannot be reviewed." },
          { status: 409 },
        );
      const row = await tx.bootstrapCandidate.create({
        data: {
          bootstrapId: id,
          packageId: null,
          candidateKey: stableId(`manual-${kind}`, { title, fingerprint, at: Date.now() }),
          kind,
          title,
          summary,
          whyProposed: "Operator assertion · no evidence yet",
          matchBasis: "operator assertion",
          currentness: "unknown",
          relevance: "medium",
          sourceFingerprint: fingerprint,
          originalProposal: {
            kind,
            title,
            payload,
            operatorAssertion: true,
          } as Prisma.InputJsonValue,
          operatorAssertion: true,
        },
      });
      await tx.bootstrapReviewEvent.create({
        data: {
          bootstrapId: id,
          candidateId: row.id,
          action: "manual_create",
          fromStatus: null,
          toStatus: "pending",
          detail: { note: "Operator assertion · no evidence yet" },
        },
      });
      await tx.projectBootstrap.update({
        where: { id },
        data: { reviewRevision: { increment: 1 } },
      });
      return NextResponse.json({ candidate: row }, { status: 201 });
    });
  } catch (error) {
    return writeErrorResponse(error, "Could not add this proposal. Please retry.");
  }
}
