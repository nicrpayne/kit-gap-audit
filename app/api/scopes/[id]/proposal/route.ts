import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proposalResponse, refreshScopeProposal } from "@/lib/scope/proposal-store";

export const dynamic = "force-dynamic";

async function cached(scopeId: string) {
  return prisma.scopeProposal.findFirst({
    where: { scopeId, status: "active" },
    orderBy: { generatedAt: "desc" },
    include: { items: { orderBy: [{ confidenceScore: "desc" }, { title: "asc" }] } },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await cached(id);
  return NextResponse.json({ proposal, stale: Boolean(proposal), refreshRequired: true }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

/**
 * Opening Scope asks the deterministic compiler for a fresh persisted
 * proposal. This writes candidate state only; it cannot create a Capability,
 * a work link, or a Forecast input.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const refreshed = await refreshScopeProposal(id);
    if (!refreshed) return NextResponse.json({ error: "Scope not found" }, { status: 404 });
    return NextResponse.json({ proposal: proposalResponse(refreshed), stale: false }, {
      headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
    });
  } catch (error) {
    const proposal = await cached(id);
    if (proposal) {
      return NextResponse.json({
        proposal,
        stale: true,
        warning: `Fresh reconciliation failed; showing the last persisted proposal. ${error instanceof Error ? error.message : "Unknown error"}`,
      }, { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } });
    }
    return NextResponse.json({
      proposal: null,
      stale: true,
      error: error instanceof Error ? error.message : "Scope proposal could not be compiled.",
    }, { status: 502 });
  }
}
