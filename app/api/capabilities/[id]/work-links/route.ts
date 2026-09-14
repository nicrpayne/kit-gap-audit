import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkCanonicalWork } from "@/lib/scope/reality";
import { currentOwnerWork, scopeRealityError } from "@/lib/scope/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as { expectedRevision: number; workItemIds: string[]; idempotencyKey: string };
    const capability = await prisma.capability.findUniqueOrThrow({ where: { id }, select: { scopeId: true } });
    const work = await currentOwnerWork(capability.scopeId, body.workItemIds ?? []);
    return NextResponse.json(await linkCanonicalWork(id, { ...body, work }));
  } catch (error) {
    return scopeRealityError(error);
  }
}
