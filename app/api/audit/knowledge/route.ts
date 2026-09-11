import { NextRequest, NextResponse } from "next/server";
import { readKnowledgeStatus, requestAuditRefresh } from "@/lib/audit/changeInbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  return NextResponse.json({ knowledge: await readKnowledgeStatus(scopeId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { scopeId?: string } | null;
  if (!body?.scopeId) return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  const result = await requestAuditRefresh(body.scopeId);
  return NextResponse.json(result, { status: result.status === "queued" ? 202 : result.status === "blocked" ? 409 : 200 });
}
