import { NextResponse } from "next/server";
import { getTeamIssues } from "@/lib/linear";

export async function GET() {
  try {
    const issues = await getTeamIssues();
    return NextResponse.json({
      ok: true,
      teamKey: process.env.LINEAR_TEAM_KEY,
      issueCount: issues.length,
      sample: issues.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
