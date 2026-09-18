import { NextRequest, NextResponse } from "next/server";
import { previewActivationManifest, type ExecutionState } from "@/lib/bootstrap/activation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawState = req.nextUrl.searchParams.get("executionState");
  const state: ExecutionState = rawState === "configured" || rawState === "unavailable" || rawState === "stale" ? rawState : "not_configured";
  const teamKey = req.nextUrl.searchParams.get("teamKey")?.trim() || undefined;
  const projectNames = req.nextUrl.searchParams.getAll("projectName").map((name) => name.trim()).filter(Boolean);
  const manifest = await previewActivationManifest(id, {
    expectedRevision: Number(req.nextUrl.searchParams.get("revision") ?? 0),
    acknowledgeProviderGaps: req.nextUrl.searchParams.get("acknowledgeProviderGaps") === "true",
    acknowledgedBlockerIds: req.nextUrl.searchParams.getAll("acknowledgedBlockerId"),
    execution: { state, teamKey, projectNames },
  });
  if (!manifest) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  return NextResponse.json({ manifest });
}
