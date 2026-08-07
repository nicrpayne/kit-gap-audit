import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ scopes });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    teamKey?: string;
    projectNames?: string[];
    labelFilter?: string | null;
  };

  if (!body.name || !body.teamKey) {
    return NextResponse.json({ error: "name and teamKey are required" }, { status: 400 });
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
      { status: 400 }
    );
  }

  const scope = await prisma.scope.create({
    data: {
      name: body.name,
      teamKey: body.teamKey,
      projectNames: body.projectNames?.filter((p) => p.trim()) ?? [],
      labelFilter: body.labelFilter || null,
    },
  });

  return NextResponse.json({ scope }, { status: 201 });
}
