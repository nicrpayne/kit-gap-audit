import { NextRequest, NextResponse } from "next/server";
import { editAuditChange } from "@/lib/audit/acceptChange";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { proposedState?: Record<string, unknown>; note?: string; idempotencyKey?: string } | null;
  if (!body?.proposedState || !body.idempotencyKey) return NextResponse.json({ error: "proposedState and idempotencyKey are required" }, { status: 400 });
  try {
    return NextResponse.json({ proposal: await editAuditChange(id, { proposedState: body.proposedState, note: body.note, idempotencyKey: body.idempotencyKey }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit failed" }, { status: 409 });
  }
}
