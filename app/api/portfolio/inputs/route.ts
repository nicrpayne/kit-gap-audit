import { NextResponse } from "next/server";
import { buildPortfolioInputs } from "@/lib/forecast/compute";

// The "expensive, once" snapshot the portfolio dashboard fetches on page
// load: every Scope's simulation inputs (items/gates/resolved capacity/
// dependsOnScopeIds) plus every Person, Allocation, and the portfolio
// switch-cost setting. Everything after this is client-side -- see
// PortfolioPageClient, which re-runs resolveCapacity + runPortfolioSimulation
// (the same pure functions this API's own math uses) on every slider drag
// with zero further network calls.
export async function GET() {
  let data;
  try {
    data = await buildPortfolioInputs();
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
