import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { readJsonObject } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";
import { serializableWrite } from "@/lib/db/serializable";
import { lockBootstrap } from "@/lib/bootstrap/identity";

const STATUSES = new Set(["pending", "accepted", "deferred", "rejected", "information-only"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id, candidateId } = await params;
  try {
    const body = await readJsonObject(req);
    if (
      body.reason !== undefined &&
      (typeof body.reason !== "string" || body.reason.length > 500)
    ) {
      return NextResponse.json(
        { error: "Review reason must be text of at most 500 characters." },
        { status: 400 },
      );
    }
    if (
      !["status", "reviewedProposal", "evidenceId", "linkState"].some(
        (key) => body[key] !== undefined,
      )
    ) {
      return NextResponse.json({ error: "Choose a review action before saving." }, { status: 400 });
    }
    return await serializableWrite(async (tx) => {
      await lockBootstrap(tx, id);
      const existing = await tx.bootstrapCandidate.findFirst({
        where: { id: candidateId, bootstrapId: id, active: true },
        include: { evidenceLinks: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Active bootstrap candidate not found" },
          { status: 404 },
        );
      const data: Prisma.BootstrapCandidateUpdateInput = {};
      let evidenceChange: {
        evidenceId: string;
        linkState: "attached" | "detached";
        reason: string | null;
      } | null = null;
      let action = "edit";
      let nextStatus = existing.status;
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
          return NextResponse.json({ error: "Unsupported candidate disposition" }, { status: 400 });
        }
        nextStatus = body.status;
        data.status = body.status;
        data.dispositionReason =
          typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim().slice(0, 500)
            : null;
        action = "disposition";
      }
      if (body.reviewedProposal !== undefined) {
        if (
          !body.reviewedProposal ||
          typeof body.reviewedProposal !== "object" ||
          Array.isArray(body.reviewedProposal)
        ) {
          return NextResponse.json(
            { error: "reviewedProposal must be an object" },
            { status: 400 },
          );
        }
        data.reviewedProposal = body.reviewedProposal as Prisma.InputJsonValue;
        action = body.status !== undefined ? "edit_and_dispose" : "edit";
      }
      if (body.evidenceId !== undefined || body.linkState !== undefined) {
        if (
          typeof body.evidenceId !== "string" ||
          (body.linkState !== "attached" && body.linkState !== "detached")
        ) {
          return NextResponse.json(
            { error: "evidenceId and linkState attached|detached are required" },
            { status: 400 },
          );
        }
        const pkg = existing.packageId
          ? await tx.bootstrapPackage.findUnique({
              where: { id: existing.packageId },
              select: { package: true },
            })
          : null;
        const evidence = pkg
          ? (((pkg.package as Record<string, unknown>).evidence as
              { evidenceId?: string }[] | undefined) ?? [])
          : [];
        if (!evidence.some((item) => item.evidenceId === body.evidenceId)) {
          return NextResponse.json(
            { error: "Evidence is not part of this candidate package" },
            { status: 400 },
          );
        }
        evidenceChange = {
          evidenceId: body.evidenceId,
          linkState: body.linkState,
          reason: typeof body.reason === "string" ? body.reason : null,
        };
        action = "evidence_link";
      }
      if (evidenceChange)
        await tx.bootstrapEvidenceLink.upsert({
          where: { candidateId_evidenceId: { candidateId, evidenceId: evidenceChange.evidenceId } },
          create: {
            candidateId,
            evidenceId: evidenceChange.evidenceId,
            linkState: evidenceChange.linkState,
            attachedBy: "operator",
            reason: evidenceChange.reason,
          },
          update: {
            linkState: evidenceChange.linkState,
            attachedBy: "operator",
            reason: evidenceChange.reason,
          },
        });
      const row = Object.keys(data).length
        ? await tx.bootstrapCandidate.update({ where: { id: candidateId }, data })
        : existing;
      await tx.bootstrapReviewEvent.create({
        data: {
          bootstrapId: id,
          candidateId,
          action,
          fromStatus: existing.status,
          toStatus: nextStatus,
          detail: {
            reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
            evidenceId: typeof body.evidenceId === "string" ? body.evidenceId : null,
            linkState: typeof body.linkState === "string" ? body.linkState : null,
          },
        },
      });
      await tx.projectBootstrap.update({
        where: { id },
        data: { reviewRevision: { increment: 1 } },
      });
      return NextResponse.json({ candidate: row });
    });
  } catch (error) {
    return writeErrorResponse(
      error,
      "Could not save the review. Your accepted project is unchanged; reload before retrying.",
    );
  }
}
