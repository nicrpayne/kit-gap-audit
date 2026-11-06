import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LinearBoundaryValidationError, validateLinearBoundary } from "@/lib/linear";
import { readJsonObject, validationResponse } from "@/lib/http/json";
import { parseScopeInput } from "@/lib/scopes/input";

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
    throw error;
  }

  // Nothing else stopped two Scopes from sharing a name -- the portfolio
  // view renders Scopes keyed by id but LABELED by name, so a duplicate
  // silently produces two indistinguishable rows and nonsensical
  // insights ("X finishes N days before X"). Case-insensitive since
  // "JSA" and "jsa" would be exactly as confusing.
  const existing = await prisma.scope.findMany({ select: { name: true } });
  if (existing.some((s) => s.name.trim().toLowerCase() === body.name!.trim().toLowerCase())) {
    return NextResponse.json(
      { error: `A Scope named "${body.name}" already exists -- pick a distinct name.` },
      { status: 400 },
    );
  }

  const scope = await prisma.scope.create({
    data: {
      name: body.name,
      teamKey: boundary.teamKey,
      projectNames: boundary.projectNames,
      labelFilter: body.labelFilter || null,
      executionState: "configured",
      executionDetail: boundary.detail,
    },
  });

  return NextResponse.json({ scope }, { status: 201 });
}
