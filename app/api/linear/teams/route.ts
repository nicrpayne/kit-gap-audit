import { NextResponse } from "next/server";
import { listTeams } from "@/lib/linear";

export async function GET() {
  try {
    const teams = await listTeams();
    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list Linear teams" },
      { status: 502 }
    );
  }
}
