import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  await req.json().catch(() => null);
  return NextResponse.json({
    error: "Direct evidence intake is disabled. Add new external evidence through the approved KE/Wiki Update workflow, then refresh Audit after Hermes ingestion completes.",
    code: "UPSTREAM_KNOWLEDGE_INTAKE_REQUIRED",
  }, { status: 409 });
}
