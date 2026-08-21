// WHAT WOULD BE FILED, COMPOSED EXACTLY ONCE.
//
// The preview a person approves and the payload actually sent to Linear are
// built here, by one function, deliberately. If preview and create composed
// their own text, they could drift — and the failure mode of that drift is
// the worst one available: a person reviews and approves one thing while a
// different thing is created in a system outside Signal's control.
//
// So: preview calls this, create calls this, and neither is allowed to
// assemble a payload of its own.

import { prisma } from "@/lib/prisma";

export interface TicketPayload {
  title: string;
  description: string;
  teamKey: string;
  /** The scope this finding belongs to, for the reviewer's context. */
  scopeName: string;
  /** Which Linear projects that scope tracks. Shown so a reviewer can see
      where the issue will land, not just which team. */
  projectNames: string[];
  /** How the Scope was reached — a Finding may resolve it through its
      Source or through its ContextSnapshot, and a reviewer is entitled to
      know which. */
  provenance: "source" | "context-package";
}

export type PayloadResult =
  | { ok: true; payload: TicketPayload }
  | { ok: false; status: number; error: string };

/** Builds the exact issue that would be created, or explains why it cannot
    be built. Performs NO external writes and NO Linear reads. */
export async function composeTicketPayload(findingId: string): Promise<PayloadResult> {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: { source: { include: { scope: true } }, contextSnapshot: { include: { scope: true } } },
  });
  if (!finding) return { ok: false, status: 404, error: "Finding not found" };

  // A legacy/direct audit Finding resolves its Scope via its Source; a
  // package-derived Finding (no Source, per Phase 1b) resolves it via its
  // ContextSnapshot instead -- both are real, non-fabricated Scope
  // references, just via different provenance.
  const scope = finding.source?.scope ?? finding.contextSnapshot?.scope ?? null;
  if (!scope) {
    return {
      ok: false,
      status: 400,
      error:
        "This finding has no Scope on its source or context snapshot, so there's no Linear team to file it against.",
    };
  }

  const provenanceLine = finding.source
    ? `Surfaced by KIT Gap Audit from source "${finding.source.title}".`
    : `Surfaced by KIT Gap Audit from a tracked project context package (snapshot ${finding.contextSnapshotId}).`;

  const description = [
    finding.rationale,
    "",
    `> "${finding.quote}"`,
    "",
    finding.owner ? `Owner: ${finding.owner}` : null,
    finding.blocks ? `Blocks: ${finding.blocks}` : null,
    finding.estimateHint ? `Estimate hint: ${finding.estimateHint}` : null,
    "",
    provenanceLine,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    ok: true,
    payload: {
      title: finding.title,
      description,
      teamKey: scope.teamKey,
      scopeName: scope.name,
      projectNames: scope.projectNames ?? [],
      provenance: finding.source ? "source" : "context-package",
    },
  };
}
