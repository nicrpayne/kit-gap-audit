import { NextRequest, NextResponse } from "next/server";
import { listTeamProjects } from "@/lib/linear";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ teamKey: string }> }) {
  const { teamKey } = await params;
  try {
    const projects = await listTeamProjects(teamKey);
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list Linear projects" },
      { status: 502 }
    );
  }
}
