import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseNotionPageId } from "@/lib/notion";
import { parseFigmaUrl, figmaRefKey } from "@/lib/figma";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";
import { LinearBoundaryValidationError, validateLinearBoundary } from "@/lib/linear";
import { readJsonObject, RequestValidationError } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";
import { parseScopePatchInput } from "@/lib/scopes/input";
import { assertScopeIdentityAvailable } from "@/lib/scopes/identity";
import { assertScopeDependenciesValid } from "@/lib/scopes/dependencies";
import { serializableWrite } from "@/lib/db/serializable";

class ScopeRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("Reality changed while this edit was being saved. Reload before retrying.");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return await patchScope(req, id);
  } catch (error) {
    if (error instanceof ScopeRevisionConflictError) {
      return NextResponse.json(
        { error: error.message, currentRealityRevision: error.currentRevision },
        { status: 409 },
      );
    }
    return writeErrorResponse(
      error,
      "Could not save project settings. Reload to check the current settings before retrying.",
    );
  }
}

async function patchScope(req: NextRequest, id: string) {
  const body = parseScopePatchInput(await readJsonObject(req));

  const current = await prisma.scope.findUnique({ where: { id }, include: { derivedState: true } });
  if (!current) return NextResponse.json({ error: "Scope not found" }, { status: 404 });

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
        { status: 400 },
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
        { status: 400 },
      );
    }
  }

  const requestedTeamKey = body.teamKey?.trim() ?? current.teamKey;
  const requestedProjectNames =
    body.projectNames !== undefined
      ? [...new Set(body.projectNames.map((name) => name.trim()).filter(Boolean))]
      : current.projectNames;
  const requestedLabelFilter =
    body.labelFilter !== undefined ? body.labelFilter?.trim() || null : current.labelFilter;
  const boundaryChanged =
    requestedTeamKey !== current.teamKey ||
    requestedLabelFilter !== current.labelFilter ||
    requestedProjectNames.length !== current.projectNames.length ||
    requestedProjectNames.some((name, index) => name !== current.projectNames[index]) ||
    current.executionState !== "configured";

  const sameStrings = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  const requestedTargetTime =
    body.targetDate === undefined
      ? undefined
      : body.targetDate
        ? new Date(body.targetDate).getTime()
        : null;
  const currentTargetTime = current.targetDate?.getTime() ?? null;
  const requestedEstimationContext =
    body.estimationContext === undefined ? undefined : body.estimationContext?.trim() || null;
  const noRequestedChange =
    (body.name === undefined || body.name === current.name) &&
    (body.teamKey === undefined || requestedTeamKey === current.teamKey) &&
    (body.projectNames === undefined || sameStrings(requestedProjectNames, current.projectNames)) &&
    (body.labelFilter === undefined || requestedLabelFilter === current.labelFilter) &&
    (body.targetDate === undefined || requestedTargetTime === currentTargetTime) &&
    (body.teamCapacity === undefined ||
      (body.teamCapacity && body.teamCapacity > 0 ? body.teamCapacity : null) ===
        current.teamCapacity) &&
    (body.includeTriage === undefined || body.includeTriage === current.includeTriage) &&
    (body.estimationContext === undefined ||
      requestedEstimationContext === current.estimationContext) &&
    (body.dependsOnScopeIds === undefined ||
      sameStrings(body.dependsOnScopeIds, current.dependsOnScopeIds)) &&
    notionPageIds === undefined &&
    figmaRefs === undefined;
  if (noRequestedChange && current.executionState === "configured") {
    const { derivedState, ...scope } = current;
    return NextResponse.json({ scope, derived: derivedState, reused: true });
  }

  let validatedBoundary: Awaited<ReturnType<typeof validateLinearBoundary>> | null = null;
  if (
    boundaryChanged &&
    (body.teamKey !== undefined ||
      body.projectNames !== undefined ||
      body.labelFilter !== undefined)
  ) {
    const currentRevision = current.derivedState?.realityRevision ?? 0;
    if (!Number.isInteger(body.expectedRealityRevision)) {
      return NextResponse.json(
        {
          error: "expectedRealityRevision is required when changing the Linear owner boundary",
          currentRealityRevision: currentRevision,
        },
        { status: 428 },
      );
    }
    if (body.expectedRealityRevision !== currentRevision) {
      return NextResponse.json(
        {
          error: `Reality changed: expected revision ${body.expectedRealityRevision}, current ${currentRevision}. Reload before retrying.`,
          currentRealityRevision: currentRevision,
        },
        { status: 409 },
      );
    }
    try {
      validatedBoundary = await validateLinearBoundary(requestedTeamKey, requestedProjectNames);
    } catch (error) {
      if (error instanceof LinearBoundaryValidationError) {
        return NextResponse.json(
          {
            error: error.message,
            recovery: "Refresh Linear teams/projects and choose exactly one current project.",
          },
          { status: error.status },
        );
      }
      throw error;
    }
  }

  const scope = await serializableWrite(async (tx) => {
    const latestScope = await tx.scope.findUnique({ where: { id } });
    if (!latestScope)
      throw new RequestValidationError("Project no longer exists. Reload before retrying.", 404);
    // Leave pre-existing names alone on unrelated settings saves. Never repair
    // a historical collision by silently renaming or merging accepted projects.
    if (body.name !== undefined && body.name !== latestScope.name) {
      await assertScopeIdentityAvailable(tx, [body.name], id);
    }
    if (body.dependsOnScopeIds !== undefined)
      await assertScopeDependenciesValid(tx, id, body.dependsOnScopeIds);
    if (validatedBoundary) {
      const latest = await tx.projectDerivedState.findUnique({
        where: { scopeId: id },
        select: { realityRevision: true },
      });
      const latestRevision = latest?.realityRevision ?? 0;
      if (latestRevision !== body.expectedRealityRevision) {
        throw new ScopeRevisionConflictError(latestRevision);
      }
    }
    const updated = await tx.scope.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.teamKey !== undefined
          ? { teamKey: validatedBoundary?.teamKey ?? body.teamKey.trim() }
          : {}),
        ...(body.projectNames !== undefined
          ? { projectNames: validatedBoundary?.projectNames ?? requestedProjectNames }
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
        ...(body.dependsOnScopeIds !== undefined
          ? { dependsOnScopeIds: body.dependsOnScopeIds }
          : {}),
        ...(validatedBoundary
          ? { executionState: "configured", executionDetail: validatedBoundary.detail }
          : {}),
      },
    });
    await invalidateDerivedReads(tx, id, "Scope owner configuration changed");
    return updated;
  });
  const derived = await recomputeDerivedReads(id);

  return NextResponse.json({ scope, derived });
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

  const [reportCount, sourceCount, estimateCount, contextDocCount, allocationCount, dependents] =
    await Promise.all([
      prisma.report.count({ where: { scopeId: id } }),
      prisma.source.count({ where: { scopeId: id } }),
      prisma.workEstimate.count({ where: { scopeId: id } }),
      prisma.contextDoc.count({ where: { scopeId: id } }),
      prisma.allocation.count({ where: { scopeId: id } }),
      prisma.scope.findMany({
        where: { dependsOnScopeIds: { has: id } },
        select: { id: true, name: true, dependsOnScopeIds: true },
      }),
    ]);

  const blockers: string[] = [];
  if (reportCount > 0) blockers.push(`${reportCount} report${reportCount === 1 ? "" : "s"}`);
  if (sourceCount > 0) blockers.push(`${sourceCount} audit source${sourceCount === 1 ? "" : "s"}`);
  if (estimateCount > 0)
    blockers.push(`${estimateCount} AI estimate${estimateCount === 1 ? "" : "s"}`);
  if (contextDocCount > 0)
    blockers.push(`${contextDocCount} context doc${contextDocCount === 1 ? "" : "s"}`);

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error:
          `Can't delete this Scope -- it still has ${blockers.join(", ")} attached, and none of that is ` +
          `ever auto-deleted. Use PATCH to edit this Scope in place instead (rename it, change its project ` +
          `filter, or set dependsOnScopeIds) if you're trying to fix its setup rather than remove it entirely.`,
      },
      { status: 409 },
    );
  }

  // A DELETED PROJECT USED TO LEAVE A LANDMINE. Refusing the delete pushed
  // the work onto whoever hit the wall, and any reference that did get
  // orphaned another way stopped the forecast dead for everyone. The
  // reference is now cleared as part of the same transaction: the dependency
  // on THIS scope goes, and every other dependency those projects declare is
  // preserved exactly as it was.
  try {
    await prisma.$transaction([
      ...dependents.map((d) =>
        prisma.scope.update({
          where: { id: d.id },
          data: { dependsOnScopeIds: d.dependsOnScopeIds.filter((x) => x !== id) },
        }),
      ),
      prisma.scope.delete({ where: { id } }),
    ]);
  } catch (error) {
    return writeErrorResponse(
      error,
      "Could not delete the project. It may still have related history. Reload before retrying.",
    );
  }

  return NextResponse.json({ ok: true, allocationsRemoved: allocationCount });
}
