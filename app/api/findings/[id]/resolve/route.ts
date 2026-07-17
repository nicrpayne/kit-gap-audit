import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { resolution?: string };

  if (!body.resolution || !body.resolution.trim()) {
    return NextResponse.json({ error: "resolution is required" }, { status: 400 });
  }

  const finding = await prisma.finding.update({
    where: { id },
    data: { status: "resolved", resolution: body.resolution.trim() },
  });

  return NextResponse.json({ finding });
}
