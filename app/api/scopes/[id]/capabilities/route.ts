import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCanonicalCapability, type CapabilityStatus } from "@/lib/scope/reality";
import { currentOwnerWork, scopeRealityError } from "@/lib/scope/http";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const capabilities = await prisma.capability.findMany({
    where: { scopeId: id },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { workLinks: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  return NextResponse.json({ capabilities }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      name: string;
      description?: string | null;
      status?: CapabilityStatus;
      note?: string | null;
      evidence?: unknown[];
      workItemIds?: string[];
      idempotencyKey: string;
    };
    const work = await currentOwnerWork(id, body.workItemIds ?? []);
    const result = await createCanonicalCapability(id, { ...body, work });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return scopeRealityError(error);
  }
}
