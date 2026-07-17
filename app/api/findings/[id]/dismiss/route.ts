import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const finding = await prisma.finding.update({
    where: { id },
    data: { status: "dismissed", dismissReason: body.reason.trim() },
  });

  return NextResponse.json({ finding });
}
