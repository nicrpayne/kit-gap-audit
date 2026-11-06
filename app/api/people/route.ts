import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject, requiredString, validationResponse } from "@/lib/http/json";
import { parsePersonInput, validateExternalCommitment } from "@/lib/people/input";

export async function GET() {
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ people });
}

export async function POST(req: NextRequest) {
  let body;
  try {
    const input = parsePersonInput(await readJsonObject(req));
    body = { ...input, name: requiredString(input.name, "name") };
    validateExternalCommitment(body.fte ?? 1, body.externalCommitmentFte ?? 0);
  } catch (error) {
    return validationResponse(error);
  }

  const person = await prisma.person.create({
    data: {
      name: body.name.trim(),
      fte: body.fte ?? 1.0,
      externalCommitmentFte: body.externalCommitmentFte ?? 0,
      active: body.active ?? true,
    },
  });

  return NextResponse.json({ person }, { status: 201 });
}
