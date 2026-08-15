import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// CONNECT TO DELIVERY — the only door between a decision and a date.
//
// This is the product law made mechanical. Nothing about a Decision makes
// it a gate: not its type, not its severity, not its owner, not a boolean
// someone ticked. A Decision affects the forecast if and only if a human
// answered four questions here, and the answers are stored where anyone
// can read them back:
//
//   WHAT WAITS ON THIS?        targetScopeId
//   WHY CAN'T IT PROCEED?      dependency
//   WHAT EVIDENCE SUPPORTS IT? evidenceForGate
//   HOW LONG TO RESOLVE?       low / likely / high
//
// A gate is therefore always an auditable claim. Refusing to answer is a
// perfectly good outcome: the decision stays open, real and important, and
// the forecast is untouched.

const MIN_PROSE = 8;

interface GateBody {
  targetScopeId?: string;
  dependency?: string;
  evidenceForGate?: string;
  low?: number;
  likely?: number;
  high?: number;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: GateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const decision = await prisma.decision.findUnique({
    where: { id },
    select: { id: true, status: true, scopeId: true, gate: { select: { id: true, provenance: true } } },
  });
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  // A decided decision is no longer waiting on anything, so there is
  // nothing for delivery to wait on. Reopen it first if that is wrong.
  if (decision.status !== "open") {
    return NextResponse.json(
      { error: "Only an open decision can gate delivery. Reopen it first." },
      { status: 409 }
    );
  }

  // ── THE FOUR ANSWERS, each required, none inferred ────────────────────
  const missing: Record<string, string> = {};

  const targetScopeId = body.targetScopeId?.trim();
  if (!targetScopeId) {
    missing.targetScopeId = "What waits on this?";
  } else {
    const target = await prisma.scope.findUnique({ where: { id: targetScopeId }, select: { id: true } });
    if (!target) missing.targetScopeId = "That project does not exist.";
  }

  const dependency = body.dependency?.trim() ?? "";
  if (dependency.length < MIN_PROSE) {
    missing.dependency = "Why can't it proceed until this is decided?";
  }

  const evidenceForGate = body.evidenceForGate?.trim() ?? "";
  if (evidenceForGate.length < MIN_PROSE) {
    missing.evidenceForGate = "What evidence supports that it is serial?";
  }

  // The estimate is sampled by the same engine as every other three-point
  // estimate, so it has to satisfy the same shape: ordered, finite, and
  // not zero — a gate that costs nothing is not a gate, it is a note.
  const { low, likely, high } = body;
  const nums = [low, likely, high];
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    missing.estimate = "How long could resolving this take? Low, likely and high, in days.";
  } else if (!(low! > 0)) {
    missing.estimate = "Low must be greater than zero — a gate that costs nothing is a note, not a gate.";
  } else if (!(low! <= likely! && likely! <= high!)) {
    missing.estimate = "The estimate must read low ≤ likely ≤ high.";
  }

  if (Object.keys(missing).length > 0) {
    return NextResponse.json(
      { error: "A decision only reaches the forecast once these are answered.", missing },
      { status: 400 }
    );
  }

  // Answering the questions replaces a migrated gate's reconstructed text
  // and its inherited 1/4/10 with what the human actually said, which is
  // exactly how a weak migrated claim is meant to be repaired.
  const gate = await prisma.decisionGate.upsert({
    where: { decisionId: id },
    update: {
      targetScopeId: targetScopeId!,
      dependency,
      evidenceForGate,
      low: low!,
      likely: likely!,
      high: high!,
      serial: true,
      provenance: "manual",
    },
    create: {
      decisionId: id,
      targetScopeId: targetScopeId!,
      dependency,
      evidenceForGate,
      low: low!,
      likely: likely!,
      high: high!,
      serial: true,
      provenance: "manual",
    },
  });

  return NextResponse.json({ gate, wasMigrated: decision.gate?.provenance === "migrated" });
}

// DISCONNECT. The decision survives, open and unanswered; only the claim
// that delivery waits on it is withdrawn. The forecast moves, visibly,
// because a claim was retracted — not because a record was tidied away.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await prisma.decisionGate.findUnique({ where: { decisionId: id }, select: { id: true } });
  if (!gate) return NextResponse.json({ ok: true, removed: false });
  await prisma.decisionGate.delete({ where: { decisionId: id } });
  return NextResponse.json({ ok: true, removed: true });
}
