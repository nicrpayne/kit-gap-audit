import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";

// ONE READ FOR THE WHOLE INSTRUMENT SUITE.
//
// Every surface (Overview, Forecast, Scope, Timeline, Intelligence,
// Decisions, Reports) operates the SAME delivery model, so they share one
// snapshot rather than each inventing its own fetch. This is deliberately
// read-only and deliberately additive: it reuses buildPortfolioInputs
// verbatim -- the same call /api/portfolio/inputs makes, with the same
// Linear/findings/context pipeline behind it -- and joins on the Findings,
// Sources and Reports the intelligence and reporting surfaces need.
//
// It computes no forecast of its own. Simulation stays where it already
// lives: the browser re-runs runPortfolioSimulation over this payload, the
// same way /portfolio has since Phase 2.
export async function GET() {
  let portfolio;
  try {
    portfolio = await buildPortfolioInputs();
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const [sources, findings, reports] = await Promise.all([
    prisma.source.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, title: true, scopeId: true, createdAt: true },
    }),
    prisma.finding.findMany({
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        sourceId: true,
        type: true,
        title: true,
        quote: true,
        rationale: true,
        severity: true,
        estimateHint: true,
        owner: true,
        blocks: true,
        blocking: true,
        matchedIssues: true,
        status: true,
        resolution: true,
        resolvedAt: true,
        createdAt: true,
      },
    }),
    prisma.report.findMany({
      orderBy: { generatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        scopeId: true,
        generatedAt: true,
        likelyDate: true,
        confidenceAtTarget: true,
        likelyDateDeltaDays: true,
        shippedCount: true,
        blockingCount: true,
        resolvedSinceLastCount: true,
        summaryMarkdown: true,
      },
    }),
  ]);

  return NextResponse.json({ ...portfolio, sources, findings, reports });
}
