import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLinearIssue } from "@/lib/linear";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const finding = await prisma.finding.findUnique({
    where: { id },
    include: { source: { include: { scope: true } } },
  });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
  if (!finding.source.scope) {
    return NextResponse.json(
      { error: "This finding's source has no Scope, so there's no Linear team to file it against." },
      { status: 400 }
    );
  }

  const description = [
    finding.rationale,
    "",
    `> "${finding.quote}"`,
    "",
    finding.owner ? `Owner: ${finding.owner}` : null,
    finding.blocks ? `Blocks: ${finding.blocks}` : null,
    finding.estimateHint ? `Estimate hint: ${finding.estimateHint}` : null,
    "",
    `Surfaced by KIT Gap Audit from source "${finding.source.title}".`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const issue = await createLinearIssue({
      title: finding.title,
      description,
      teamKey: finding.source.scope.teamKey,
    });

    const updated = await prisma.finding.update({
      where: { id },
      data: { status: "ticketed", linearIssueId: issue.identifier },
    });

    return NextResponse.json({ finding: updated, linearIssue: issue });
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't create Linear issue: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
