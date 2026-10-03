import { NextRequest, NextResponse } from "next/server";
import { harvestTimelineCandidates, currentTimelineCandidates } from "@/lib/timeline/candidates";

export async function GET() {
  const candidates = await currentTimelineCandidates();
  return NextResponse.json({ candidates });
}

// Rescan snapshots already held. The same harvester runs automatically
// where context actually arrives; this is the manual re-run.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scopeId = (body as Record<string, unknown>)?.scopeId;
  const result = await harvestTimelineCandidates(typeof scopeId === "string" ? { scopeId } : {});
  return NextResponse.json(result);
}
