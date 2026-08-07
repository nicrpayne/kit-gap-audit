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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.scope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
