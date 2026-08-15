import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// THE DECISION CIRCUIT'S READ, and manual creation.
//
// Read returns everything the instrument draws: decisions with their gate
// (or null), evidence counts, and the candidate tray. Deliberately dynamic
// -- Decisions are Reality, and a stale circuit would be the freshness bug
// this suite already fixed once.
export const dynamic = "force-dynamic";

export async function GET() {
  const [decisions, candidates, scopes] = await Promise.all([
    prisma.decision.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        gate: true,
        evidence: { select: { id: true, kind: true, sourceLabel: true, excerpt: true, externalRef: true, contextSnapshotId: true } },
        scope: { select: { id: true, name: true, targetDate: true } },
      },
    }),
    prisma.decisionCandidate.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { scope: { select: { id: true, name: true } } },
    }),
    prisma.scope.findMany({ select: { id: true, name: true, targetDate: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return NextResponse.json({ decisions, candidates, scopes });
}

// MANUAL CREATION. The point is speed: a question and a project, and it
// exists. It is created OPEN and UNGATED -- typing a decision down must
// never move a date, which is the whole product law.
export async function POST(req: NextRequest) {
  let body: { scopeId?: string; title?: string; rationale?: string | null; owner?: string | null; neededBy?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "What needs to be decided?" }, { status: 400 });
  if (!body.scopeId) return NextResponse.json({ error: "A decision belongs to a project." }, { status: 400 });

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId }, select: { id: true } });
  if (!scope) return NextResponse.json({ error: "Unknown project" }, { status: 400 });

  // DUPLICATE SURFACING, not blocking. A near-identical open question in
  // the same project usually means the same choice arrived twice -- but
  // the human decides, and gets told rather than silently merged into.
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const siblings = await prisma.decision.findMany({
    where: { scopeId: body.scopeId, status: { in: ["open", "decided"] } },
    select: { id: true, title: true, status: true },
  });
  const similar = siblings.find(
    (d) => d.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalized
  );

  const decision = await prisma.decision.create({
    data: {
      scopeId: body.scopeId,
      title,
      rationale: body.rationale?.trim() || null,
      owner: body.owner?.trim() || null,
      neededBy: body.neededBy ? new Date(body.neededBy) : null,
      status: "open",
    },
  });
  if (body.rationale?.trim()) {
    await prisma.decisionEvidence.create({
      data: { decisionId: decision.id, kind: "manual", excerpt: body.rationale.trim(), sourceLabel: "Manual" },
    });
  }
  return NextResponse.json({ decision, possibleDuplicate: similar ?? null });
}
