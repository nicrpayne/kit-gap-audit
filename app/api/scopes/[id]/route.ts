import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    teamKey?: string;
    projectName?: string | null;
    labelFilter?: string | null;
    targetDate?: string | null;
    teamCapacity?: number | null;
  };

  const scope = await prisma.scope.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.teamKey !== undefined ? { teamKey: body.teamKey } : {}),
      ...(body.projectName !== undefined ? { projectName: body.projectName || null } : {}),
      ...(body.labelFilter !== undefined ? { labelFilter: body.labelFilter || null } : {}),
      ...(body.targetDate !== undefined
        ? { targetDate: body.targetDate ? new Date(body.targetDate) : null }
        : {}),
      ...(body.teamCapacity !== undefined
        ? { teamCapacity: body.teamCapacity && body.teamCapacity > 0 ? body.teamCapacity : null }
        : {}),
    },
  });

  return NextResponse.json({ scope });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.scope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
