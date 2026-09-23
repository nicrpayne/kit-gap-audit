import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCanonicalCapability, type CapabilityStatus } from "@/lib/scope/reality";
import { currentOwnerWork, scopeRealityError } from "@/lib/scope/http";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const capability = await prisma.capability.findUnique({
    where: { id },
    include: { workLinks: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  return capability
    ? NextResponse.json({ capability }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: "Capability not found." }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      expectedRevision: number;
      name?: string;
      description?: string | null;
      status?: CapabilityStatus;
      note?: string | null;
      evidence?: unknown[];
      workItemIds?: string[];
      idempotencyKey: string;
    };
    const capability = await prisma.capability.findUniqueOrThrow({ where: { id }, select: { scopeId: true } });
    const work = body.workItemIds?.length
      ? await currentOwnerWork(capability.scopeId, body.workItemIds)
      : undefined;
    return NextResponse.json(await updateCanonicalCapability(id, { ...body, work }));
  } catch (error) {
    return scopeRealityError(error);
  }
}
