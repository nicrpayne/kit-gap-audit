import { NextResponse } from "next/server";
import { buildTimeline } from "@/lib/timeline/entries";

// THE PROJECTION, served whole.
//
// One request returns every lane, every entry, every stored forecast
// snapshot and every pending candidate. Playback then runs entirely in the
// client against that array — which is the point: scrubbing through
// history must never issue a request, and must never re-run a simulation.
// What we believed on a past date is already in the Report rows.
export const dynamic = "force-dynamic";

export async function GET() {
  const projection = await buildTimeline();
  return NextResponse.json(projection);
}
