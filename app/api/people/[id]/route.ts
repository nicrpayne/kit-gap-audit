import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { name?: string; fte?: number; externalCommitmentFte?: number; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  if (body.fte !== undefined && (typeof body.fte !== "number" || body.fte <= 0 || body.fte > 1)) {
    return NextResponse.json({ error: "fte must be a number between 0 (exclusive) and 1" }, { status: 400 });
  }
  try {
    const current = await prisma.person.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    const resultingFte = body.fte ?? current.fte;
    const resultingExternal = body.externalCommitmentFte ?? current.externalCommitmentFte;
    if (typeof resultingExternal !== "number" || resultingExternal < 0 || resultingExternal > resultingFte) {
      return NextResponse.json({ error: "externalCommitmentFte must be between 0 and the person's available FTE" }, { status: 400 });
    }
    const person = await prisma.person.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.fte !== undefined ? { fte: body.fte } : {}),
        ...(body.externalCommitmentFte !== undefined ? { externalCommitmentFte: body.externalCommitmentFte } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    return NextResponse.json({ person });
  } catch {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
}

// Deletes the person and, via cascade, every Allocation pointing at them.
// Prefer PATCH { active: false } to remove someone from capacity planning
// without losing their allocation history -- this is for genuine mistakes.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.person.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
