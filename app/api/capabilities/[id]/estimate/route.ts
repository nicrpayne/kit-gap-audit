import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentContextSnapshot } from "@/lib/context/currentSnapshot";
import type { ProjectContextPackage } from "@/lib/context/package";
import {
  capabilityKnowledgeEstimates,
  knowledgeEstimateCapabilityRefs,
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
    const snapshot = await currentContextSnapshot(capability.scopeId);
    if (!snapshot || snapshot.id !== body.contextSnapshotId) {
      return NextResponse.json(
        { error: "Knowledge changed after this estimate was opened. Refresh Scope and review the current evidence before accepting it." },
        { status: 409 },
      );
    }
    // The acceptance path must see the same complete scope as the read path.
    // A singleton would hide an all-channel source shared with an out/later card.
    const [issues, scopeCapabilities] = await Promise.all([
      getScopedIssues(capability.scope),
      prisma.capability.findMany({ where: { scopeId: capability.scopeId },
        select: { id: true, name: true, revision: true, workLinks: { select: { externalId: true, state: true } } } }),
    ]);
    const estimate = capabilityKnowledgeEstimates(
      snapshot.package as unknown as ProjectContextPackage,
      snapshot.id,
      knowledgeEstimateCapabilityRefs(scopeCapabilities, issues),
    ).find((candidate) => candidate.id === body.estimateId && candidate.capabilityId === capability.id);
    if (!estimate) {
      return NextResponse.json({ error: "That estimate is not present in the current knowledge snapshot." }, { status: 409 });
    }
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
      expectedScopeCapabilities: scopeCapabilities.map(({ id, revision }) => ({ id, revision })),
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
