import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { readJsonObject, RequestValidationError, validationResponse } from "@/lib/http/json";
import { parsePersonInput, validateExternalCommitment } from "@/lib/people/input";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body;
  try {
    body = parsePersonInput(await readJsonObject(req));
  } catch (error) {
    return validationResponse(error);
  }
  try {
    const current = await prisma.person.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    const resultingFte = body.fte ?? current.fte;
    const resultingExternal = body.externalCommitmentFte ?? current.externalCommitmentFte;
    validateExternalCommitment(resultingFte, resultingExternal);
    const person = await prisma.person.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.fte !== undefined ? { fte: body.fte } : {}),
        ...(body.externalCommitmentFte !== undefined
          ? { externalCommitmentFte: body.externalCommitmentFte }
          : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    return NextResponse.json({ person });
  } catch (error) {
    if (error instanceof RequestValidationError) return validationResponse(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    throw error;
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
