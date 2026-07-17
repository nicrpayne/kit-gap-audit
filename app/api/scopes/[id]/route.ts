import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    teamKey?: string;
    projectName?: string | null;
    labelFilter?: string | null;
  };

  const scope = await prisma.scope.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.teamKey !== undefined ? { teamKey: body.teamKey } : {}),
      ...(body.projectName !== undefined ? { projectName: body.projectName || null } : {}),
      ...(body.labelFilter !== undefined ? { labelFilter: body.labelFilter || null } : {}),
    },
  });

  return NextResponse.json({ scope });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.scope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
