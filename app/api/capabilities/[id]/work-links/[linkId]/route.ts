import { NextRequest, NextResponse } from "next/server";
import { unlinkCanonicalWork } from "@/lib/scope/reality";
import { scopeRealityError } from "@/lib/scope/http";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await params;
    const body = await req.json() as { expectedRevision: number; idempotencyKey: string };
    return NextResponse.json(await unlinkCanonicalWork(id, linkId, body));
  } catch (error) {
    return scopeRealityError(error);
  }
}
