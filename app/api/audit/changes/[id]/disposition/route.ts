import { NextRequest, NextResponse } from "next/server";
import { dispositionAuditChange } from "@/lib/audit/acceptChange";

const ACTIONS = new Set(["defer", "reject", "information_only", "reopen"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { action?: string; reason?: string; idempotencyKey?: string } | null;
  if (!body?.idempotencyKey || !body.action || !ACTIONS.has(body.action)) return NextResponse.json({ error: "Valid action and idempotencyKey are required" }, { status: 400 });
  try {
    const proposal = await dispositionAuditChange(id, {
      action: body.action as "defer" | "reject" | "information_only" | "reopen",
      reason: body.reason, idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ proposal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Disposition failed" }, { status: 409 });
  }
}
