import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await prisma.bootstrapScanRun.findFirst({ where: { bootstrapId: id }, orderBy: { sequence: "desc" } });
  if (!scan) return NextResponse.json({ error: "No scan exists for this bootstrap" }, { status: 404 });
  return NextResponse.json({ scan });
}

