import { NextRequest, NextResponse } from "next/server";
import { acceptAuditChange, ChangeCompletionRequiredError } from "@/lib/audit/acceptChange";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { idempotencyKey?: string; completion?: Record<string, unknown> } | null;
  if (!body?.idempotencyKey) return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  try {
    return NextResponse.json(await acceptAuditChange(id, { idempotencyKey: body.idempotencyKey, completion: body.completion }));
  } catch (error) {
    if (error instanceof ChangeCompletionRequiredError) {
      return NextResponse.json({ error: error.message, needsCompletion: true, fields: error.fields }, { status: 422 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Acceptance failed" }, { status: 409 });
  }
}
