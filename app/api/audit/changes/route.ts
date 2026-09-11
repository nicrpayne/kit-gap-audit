import { NextRequest, NextResponse } from "next/server";
import { getAuditChangeInbox } from "@/lib/audit/changeInbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  try {
    return NextResponse.json(await getAuditChangeInbox(scopeId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Change Inbox could not be read" }, { status: 500 });
  }
}
