import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseNotionPageId } from "@/lib/notion";
import { parseFigmaUrl, figmaRefKey } from "@/lib/figma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    teamKey?: string;
    projectNames?: string[];
    labelFilter?: string | null;
    targetDate?: string | null;
    teamCapacity?: number | null;
    includeTriage?: boolean;
    estimationContext?: string | null;
    notionPageUrls?: string[]; // page URLs or raw IDs; normalized server-side
    figmaUrls?: string[]; // design URLs with a node-id selected; normalized server-side
    dependsOnScopeIds?: string[]; // other Scope ids this Scope's forecast can't finish ahead of
  };

  let notionPageIds: string[] | undefined;
  if (body.notionPageUrls !== undefined) {
    notionPageIds = [];
    const bad: string[] = [];
    for (const raw of body.notionPageUrls) {
      if (!raw.trim()) continue;
      const parsed = parseNotionPageId(raw);
      if (parsed) notionPageIds.push(parsed);
      else bad.push(raw.trim());
    }
    if (bad.length > 0) {
      return NextResponse.json(
        { error: `These don't look like Notion page URLs or IDs: ${bad.join(", ")}` },
        { status: 400 }
      );
    }
  }

  let figmaRefs: string[] | undefined;
  if (body.figmaUrls !== undefined) {
    figmaRefs = [];
    const bad: string[] = [];
    for (const raw of body.figmaUrls) {
      if (!raw.trim()) continue;
      const parsed = parseFigmaUrl(raw);
      if (parsed) figmaRefs.push(figmaRefKey(parsed));
      else bad.push(raw.trim());
    }
    if (bad.length > 0) {
      return NextResponse.json(
        {
          error: `These don't look like Figma design URLs with a node selected (need a node-id in the URL -- click a specific frame/page in Figma and copy its link): ${bad.join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    const existing = await prisma.scope.findMany({ where: { id: { not: id } }, select: { name: true } });
    if (existing.some((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return NextResponse.json(
        { error: `A Scope named "${trimmed}" already exists -- pick a distinct name.` },
        { status: 400 }
      );
    }
    body.name = trimmed;
  }

  // Basic sanity, not full cycle detection -- a self-reference is a
  // trivial always-a-cycle case cheap to catch here; a longer cycle
  // (A -> B -> A) is caught at simulate time by
  // lib/forecast/portfolio.ts's topological sort, which names the exact
  // cycle in its error.
  if (body.dependsOnScopeIds !== undefined) {
    const deduped = [...new Set(body.dependsOnScopeIds.filter((s) => s.trim()))];
    if (deduped.includes(id)) {
      return NextResponse.json({ error: "A Scope can't depend on itself" }, { status: 400 });
    }
    if (deduped.length > 0) {
      const found = await prisma.scope.count({ where: { id: { in: deduped } } });
      if (found !== deduped.length) {
        return NextResponse.json({ error: "One or more dependsOnScopeIds values don't exist" }, { status: 400 });
      }
    }
    body.dependsOnScopeIds = deduped;
  }

  const scope = await prisma.scope.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.teamKey !== undefined ? { teamKey: body.teamKey } : {}),
      ...(body.projectNames !== undefined
        ? { projectNames: body.projectNames.filter((p) => p.trim()) }
        : {}),
      ...(body.labelFilter !== undefined ? { labelFilter: body.labelFilter || null } : {}),
      ...(body.targetDate !== undefined
        ? { targetDate: body.targetDate ? new Date(body.targetDate) : null }
        : {}),
      ...(body.teamCapacity !== undefined
        ? { teamCapacity: body.teamCapacity && body.teamCapacity > 0 ? body.teamCapacity : null }
        : {}),
      ...(body.includeTriage !== undefined ? { includeTriage: body.includeTriage } : {}),
      ...(body.estimationContext !== undefined
        ? { estimationContext: body.estimationContext?.trim() || null }
        : {}),
      ...(notionPageIds !== undefined ? { notionPageIds } : {}),
      ...(figmaRefs !== undefined ? { figmaRefs } : {}),
      ...(body.dependsOnScopeIds !== undefined ? { dependsOnScopeIds: body.dependsOnScopeIds } : {}),
    },
  });

  return NextResponse.json({ scope });
}

// Report, Source, WorkEstimate, and ContextDoc all reference Scope
// WITHOUT onDelete: Cascade (unlike Allocation, which cascades on
// purpose -- allocations are live current-state, not history) --
// deleting a Scope that has any of that attached would previously throw
// an uncaught Prisma foreign-key error (a bare 500). Checked up front so
// the caller gets a clear, actionable reason instead of a crash, and
// consistent with "nothing here is ever auto-deleted" for real history.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [reportCount, sourceCount, estimateCount, contextDocCount, allocationCount, dependents] = await Promise.all([
    prisma.report.count({ where: { scopeId: id } }),
    prisma.source.count({ where: { scopeId: id } }),
    prisma.workEstimate.count({ where: { scopeId: id } }),
    prisma.contextDoc.count({ where: { scopeId: id } }),
    prisma.allocation.count({ where: { scopeId: id } }),
    prisma.scope.findMany({ where: { dependsOnScopeIds: { has: id } }, select: { name: true } }),
  ]);

  const blockers: string[] = [];
  if (reportCount > 0) blockers.push(`${reportCount} report${reportCount === 1 ? "" : "s"}`);
  if (sourceCount > 0) blockers.push(`${sourceCount} audit source${sourceCount === 1 ? "" : "s"}`);
  if (estimateCount > 0) blockers.push(`${estimateCount} AI estimate${estimateCount === 1 ? "" : "s"}`);
  if (contextDocCount > 0) blockers.push(`${contextDocCount} context doc${contextDocCount === 1 ? "" : "s"}`);

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error:
          `Can't delete this Scope -- it still has ${blockers.join(", ")} attached, and none of that is ` +
          `ever auto-deleted. Use PATCH to edit this Scope in place instead (rename it, change its project ` +
          `filter, or set dependsOnScopeIds) if you're trying to fix its setup rather than remove it entirely.`,
      },
      { status: 409 }
    );
  }

  if (dependents.length > 0) {
    return NextResponse.json(
      {
        error: `Can't delete this Scope -- ${dependents.map((d) => d.name).join(", ")} still list it in dependsOnScopeIds. Remove that dependency first.`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.scope.delete({ where: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't delete that Scope: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, allocationsRemoved: allocationCount });
}
