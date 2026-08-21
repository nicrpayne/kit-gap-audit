// THE NON-DESTRUCTIVE HALF OF FILING A TICKET.
//
// GET, not POST, and that is the whole point: this route is idempotent,
// creates nothing, and reaches no external system. It answers "what would
// be filed, and where" so a person can decide before anything leaves
// Signal. The write lives next door and refuses to run without explicit
// confirmation.
import { NextRequest, NextResponse } from "next/server";
import { composeTicketPayload } from "@/lib/findings/ticketPayload";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await composeTicketPayload(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ preview: result.payload, created: false });
}
