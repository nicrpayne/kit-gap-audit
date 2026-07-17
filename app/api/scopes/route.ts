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
    projectName?: string | null;
    labelFilter?: string | null;
  };

  if (!body.name || !body.teamKey) {
    return NextResponse.json({ error: "name and teamKey are required" }, { status: 400 });
  }

  const scope = await prisma.scope.create({
    data: {
      name: body.name,
      teamKey: body.teamKey,
      projectName: body.projectName || null,
      labelFilter: body.labelFilter || null,
    },
  });

  return NextResponse.json({ scope }, { status: 201 });
}
