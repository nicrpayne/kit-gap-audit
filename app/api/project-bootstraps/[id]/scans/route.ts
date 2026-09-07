import { after, NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { executeBootstrapScan } from "@/lib/bootstrap/scan";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bootstrap = await prisma.projectBootstrap.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!bootstrap) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  const last = await prisma.bootstrapScanRun.findFirst({ where: { bootstrapId: id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const scan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: id, sequence: (last?.sequence ?? 0) + 1, status: "queued", stage: "queued",
    providerCoverage: [] as Prisma.InputJsonValue, metrics: {} as Prisma.InputJsonValue, warnings: [] as Prisma.InputJsonValue,
  } });
  if (bootstrap.status !== "activated") await prisma.projectBootstrap.update({ where: { id }, data: { status: "scanning" } });
  after(async () => executeBootstrapScan(scan.id));
  return NextResponse.json({ scan }, { status: 202 });
}
