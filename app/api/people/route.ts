import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ people });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; fte?: number; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (body.fte !== undefined && (typeof body.fte !== "number" || body.fte <= 0 || body.fte > 1)) {
    return NextResponse.json({ error: "fte must be a number between 0 (exclusive) and 1" }, { status: 400 });
  }

  const person = await prisma.person.create({
    data: {
      name: body.name.trim(),
      fte: body.fte ?? 1.0,
      active: body.active ?? true,
    },
  });

  return NextResponse.json({ person }, { status: 201 });
}
