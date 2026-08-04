import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.contextDoc.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Context doc not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
