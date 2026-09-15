import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import {
  commitScopeProposal,
  ScopeRealityConflictError,
  ScopeRealityInputError,
  type ScopeProposalCommitSelection,
} from "@/lib/scope/reality";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json() as {
      proposalId?: unknown;
      idempotencyKey?: unknown;
      selections?: unknown;
    };
    if (typeof body.proposalId !== "string" || typeof body.idempotencyKey !== "string" || !Array.isArray(body.selections)) {
      throw new ScopeRealityInputError("proposalId, selections, and idempotencyKey are required.");
    }
    const selections: ScopeProposalCommitSelection[] = body.selections.map((raw) => {
      if (!raw || typeof raw !== "object") throw new ScopeRealityInputError("Each selection must be an object.");
      const value = raw as Record<string, unknown>;
      if (typeof value.itemId !== "string") throw new ScopeRealityInputError("Each selection needs an itemId.");
      if (value.releaseStatus !== "accepted" && value.releaseStatus !== "outside") {
        throw new ScopeRealityInputError("Each selection must choose accepted or outside release state.");
      }
      return {
        itemId: value.itemId,
        targetCapabilityId: value.targetCapabilityId === null || typeof value.targetCapabilityId === "string" ? value.targetCapabilityId : undefined,
        expectedRevision: value.expectedRevision === null || typeof value.expectedRevision === "number" ? value.expectedRevision : undefined,
        releaseStatus: value.releaseStatus,
      };
    });
    const scope = await prisma.scope.findUnique({ where: { id } });
    if (!scope) return NextResponse.json({ error: "Scope not found" }, { status: 404 });
    const issues = await getScopedIssues(scope);
    const result = await commitScopeProposal(
      id,
      body.proposalId,
      selections,
      issues.map((issue) => ({
        externalId: issue.identifier,
        externalUrl: issue.url ?? null,
        title: issue.title,
        state: issue.state,
        updatedAt: issue.updatedAt ?? null,
      })),
      body.idempotencyKey,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScopeRealityConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ScopeRealityInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scope proposal could not be committed." }, { status: 500 });
  }
}
