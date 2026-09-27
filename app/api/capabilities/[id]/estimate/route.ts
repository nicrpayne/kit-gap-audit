import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProjectContextPackage } from "@/lib/context/package";
import {
  capabilityKnowledgeEstimates,
  reviewCapabilityKnowledgeEstimate,
  type EstimateReviewInput,
} from "@/lib/scope/knowledgeEstimates";
import { replayCanonicalCapabilityEstimate, ScopeRealityInputError, setCanonicalCapabilityEstimate } from "@/lib/scope/reality";
import { scopeRealityError } from "@/lib/scope/http";
import { getScopedIssues } from "@/lib/linear";
import { deliveryRelevantIssueIds } from "@/lib/forecast/coverage";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      expectedRevision: number;
      estimateId: string;
      contextSnapshotId: string;
      idempotencyKey: string;
      review: EstimateReviewInput;
    };
    const replay = await replayCanonicalCapabilityEstimate(id, body.idempotencyKey, "accept_estimate_v2", {
      expectedRevision: body.expectedRevision,
      estimateId: body.estimateId,
      contextSnapshotId: body.contextSnapshotId,
      review: body.review,
    });
    if (replay) return NextResponse.json(replay);
    const capability = await prisma.capability.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        scopeId: true,
        workLinks: { where: { state: { in: ["active", "configured"] } }, select: { externalId: true } },
        scope: { select: { teamKey: true, projectNames: true, labelFilter: true, executionState: true, includeTriage: true } },
      },
    });
    const snapshot = await prisma.contextSnapshot.findFirst({
      where: { scopeId: capability.scopeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, package: true },
    });
    if (!snapshot || snapshot.id !== body.contextSnapshotId) {
      return NextResponse.json(
        { error: "Knowledge changed after this estimate was opened. Refresh Scope and review the current evidence before accepting it." },
        { status: 409 },
      );
    }
    const estimate = capabilityKnowledgeEstimates(
      snapshot.package as unknown as ProjectContextPackage,
      snapshot.id,
      [{ id: capability.id, name: capability.name }],
    ).find((candidate) => candidate.id === body.estimateId);
    if (!estimate) {
      return NextResponse.json({ error: "That estimate is not present in the current knowledge snapshot." }, { status: 409 });
    }
    const issues = await getScopedIssues(capability.scope);
    const remainingIds = new Set(deliveryRelevantIssueIds(issues, capability.scope.includeTriage));
    const currentOpenItemIds = capability.workLinks
      .map((link) => link.externalId)
      .filter((externalId) => remainingIds.has(externalId));
    let reviewed;
    try {
      reviewed = reviewCapabilityKnowledgeEstimate(estimate, body.review, {
        capabilityRevisionAtReview: body.expectedRevision,
        currentOpenItemIds,
      });
    } catch (error) {
      throw new ScopeRealityInputError(error instanceof Error ? error.message : "The estimate review is invalid.");
    }
    return NextResponse.json(await setCanonicalCapabilityEstimate(id, {
      expectedRevision: body.expectedRevision,
      estimate: reviewed,
      reviewedOpenItemIds: currentOpenItemIds,
      expectedContextSnapshotId: snapshot.id,
      idempotencyKey: body.idempotencyKey,
    }));
  } catch (error) {
    return scopeRealityError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as { expectedRevision: number; idempotencyKey: string };
    return NextResponse.json(await setCanonicalCapabilityEstimate(id, {
      expectedRevision: body.expectedRevision,
      estimate: null,
      idempotencyKey: body.idempotencyKey,
    }));
  } catch (error) {
    return scopeRealityError(error);
  }
}
