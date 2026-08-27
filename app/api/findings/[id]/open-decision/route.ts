// THE ONE REALITY WRITE AUDIT ADDS, AND IT REFUSES TO GUESS.
//
// A `decision` Finding is the audit NOTICING that a choice is unresolved. A
// Decision row is the project SAYING SO. Those are different claims, and
// only a human crossing this boundary turns one into the other — which is
// why this route exists at all instead of Audit calling POST /api/decisions
// and losing the link back to the evidence.
//
// It follows the shape scripts/migrate-decisions.ts already established for
// exactly this promotion, so the two cannot drift:
//
//   - upsert on Decision.sourceFindingId (unique), so a double-click or a
//     retried request updates rather than duplicating
//   - carry the Finding's own quote across as DecisionEvidence(kind:
//     "finding"), with its snapshot and evidence pointers intact, so the new
//     Decision starts life cited rather than bare
//   - create the Decision OPEN and UNGATED
//
// THAT LAST POINT IS THE PRODUCT LAW, and this route will not be talked out
// of it. A DecisionGate is the claim "delivery is physically waiting on this
// choice", and it requires someone to say what waits, why the wait is
// serial, and on what evidence. Audit knows none of those things. Creating
// a gate here would let an observation silently move a delivery date, which
// is the precise failure the Decision/DecisionGate split was built to end.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const finding = await prisma.finding.findUnique({
    where: { id },
    include: {
      source: { select: { scopeId: true } },
      contextSnapshot: { select: { scopeId: true } },
    },
  });
  if (!finding) return NextResponse.json({ error: "Unknown finding" }, { status: 404 });

  if (finding.type !== "decision") {
    return NextResponse.json(
      {
        error: `Only a "decision" finding can be opened as a Decision. This one is "${finding.type}".`,
      },
      { status: 400 }
    );
  }

  // A Finding reaches a Scope through either provenance path. Without one it
  // has no project to belong to, and inventing a Scope would be worse than
  // refusing.
  const scopeId = finding.source?.scopeId ?? finding.contextSnapshot?.scopeId ?? null;
  if (!scopeId) {
    return NextResponse.json(
      { error: "This finding has no Scope behind it, so there is no project to open the decision in." },
      { status: 400 }
    );
  }

  let body: { owner?: string | null } = {};
  try {
    body = (await req.json()) as { owner?: string | null };
  } catch {
    /* no body is fine — owner is optional */
  }

  const decision = await prisma.decision.upsert({
    where: { sourceFindingId: finding.id },
    update: {},
    create: {
      scopeId,
      title: finding.title,
      status: "open",
      // The audit's read of who owns the call, carried across as a starting
      // point. Never fabricated when the column is null.
      owner: body.owner?.trim() || finding.owner,
      rationale: finding.rationale,
      relatedIssues: finding.matchedIssues,
      sourceFindingId: finding.id,
    },
  });

  const existingEvidence = await prisma.decisionEvidence.count({ where: { decisionId: decision.id } });
  if (existingEvidence === 0 && finding.quote.trim()) {
    await prisma.decisionEvidence.create({
      data: {
        decisionId: decision.id,
        kind: "finding",
        excerpt: finding.quote,
        contextSnapshotId: finding.contextSnapshotId,
        evidenceItemId: finding.evidenceRefs[0] ?? null,
        sourceLabel: "Opened from an audit finding",
      },
    });
  }

  // The Finding has now been ACTED ON: the choice it noticed has a home in
  // the model. Recording that as a resolution keeps the audit trail honest
  // and stops the same gap being raised again on the next run (runAudit
  // reads handled findings back to the model as prior context).
  const updated = await prisma.finding.update({
    where: { id: finding.id },
    data: {
      status: "resolved",
      resolution: `Opened as a decision on ${decision.scopeId}.`,
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json({
    decision,
    finding: updated,
    // Stated back to the caller so the console can show the consequence
    // without assuming it.
    gated: false,
    note: "Created open and ungated. An open decision has no forecast effect until a gate is declared on /decisions.",
  });
}
