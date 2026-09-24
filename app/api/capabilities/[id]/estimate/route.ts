import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProjectContextPackage } from "@/lib/context/package";
import {
  acceptCapabilityKnowledgeEstimate,
  capabilityKnowledgeEstimates,
} from "@/lib/scope/knowledgeEstimates";
import { setCanonicalCapabilityEstimate } from "@/lib/scope/reality";
import { scopeRealityError } from "@/lib/scope/http";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      expectedRevision: number;
      estimateId: string;
      contextSnapshotId: string;
      idempotencyKey: string;
    };
    const capability = await prisma.capability.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, scopeId: true },
    });
    const snapshot = await prisma.contextSnapshot.findFirst({
      where: { scopeId: capability.scopeId },
      orderBy: { createdAt: "desc" },
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
    if (!estimate.range || estimate.unit !== "developer_days") {
      return NextResponse.json({ error: "Only an explicit developer-day range can become the current forecast basis." }, { status: 422 });
    }
    return NextResponse.json(await setCanonicalCapabilityEstimate(id, {
      expectedRevision: body.expectedRevision,
      estimate: acceptCapabilityKnowledgeEstimate(estimate),
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
