import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LinearBoundaryValidationError, validateLinearBoundary } from "@/lib/linear";
import { readJsonObject, validationResponse } from "@/lib/http/json";
import { parseScopeInput } from "@/lib/scopes/input";
import { assertScopeIdentityAvailable } from "@/lib/scopes/identity";
import { assertScopeDependenciesValid } from "@/lib/scopes/dependencies";
import { serializableWrite } from "@/lib/db/serializable";
import { writeErrorResponse } from "@/lib/http/writeErrors";

export async function GET() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ scopes });
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = parseScopeInput(await readJsonObject(req));
  } catch (error) {
    return validationResponse(error);
  }

  let boundary;
  try {
    boundary = await validateLinearBoundary(body.teamKey, body.projectNames);
  } catch (error) {
    if (error instanceof LinearBoundaryValidationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return writeErrorResponse(error, "Could not validate the project connection. Please retry.");
  }

  try {
    const scope = await serializableWrite(async (tx) => {
      await assertScopeIdentityAvailable(tx, [body.name]);
      if (body.dependsOnScopeIds?.length)
        await assertScopeDependenciesValid(tx, "", body.dependsOnScopeIds);
      return tx.scope.create({
        data: {
          name: body.name,
          teamKey: boundary.teamKey,
          projectNames: boundary.projectNames,
          labelFilter: body.labelFilter || null,
          executionState: "configured",
          executionDetail: boundary.detail,
          dependsOnScopeIds: body.dependsOnScopeIds ?? [],
        },
      });
    });
    return NextResponse.json({ scope }, { status: 201 });
  } catch (error) {
    return writeErrorResponse(error, "Could not create the project. Please retry.");
  }
}
