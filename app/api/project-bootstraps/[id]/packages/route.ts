import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bootstrapHash } from "@/lib/bootstrap/hash";
import { BootstrapPackageValidationError, validateBootstrapPackage } from "@/lib/bootstrap/contracts";
import { persistCompiledPackage } from "@/lib/bootstrap/scan";

const SENSITIVE = /^(access_?token|refresh_?token|api_?key|password|client_?secret|authorization)$/i;

function rejectSecrets(value: unknown, path = "package") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.test(key)) throw new BootstrapPackageValidationError(`${path}.${key} may not contain connector credentials`);
    rejectSecrets(child, `${path}.${key}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.text();
  if (raw.length > 5_000_000) return NextResponse.json({ error: "Bootstrap package exceeds 5 MB" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  let pkg;
  try {
    rejectSecrets(body);
    pkg = validateBootstrapPackage(body, id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid bootstrap package" }, { status: 400 });
  }
  const bootstrap = await prisma.projectBootstrap.findUnique({ where: { id }, select: { id: true } });
  if (!bootstrap) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  const hash = bootstrapHash(pkg);
  const existing = await prisma.bootstrapPackage.findUnique({ where: { producer_packageId: { producer: pkg.producer, packageId: pkg.packageId } } });
  if (existing && existing.packageHash !== hash) {
    return NextResponse.json({ error: "The producer reused packageId for different content" }, { status: 409 });
  }
  const last = await prisma.bootstrapScanRun.findFirst({ where: { bootstrapId: id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const scan = await prisma.bootstrapScanRun.create({ data: {
    bootstrapId: id, sequence: (last?.sequence ?? 0) + 1, status: "running", stage: "package_validation", startedAt: new Date(),
    providerCoverage: pkg.coverage as unknown as Prisma.InputJsonValue,
    metrics: {} as Prisma.InputJsonValue, warnings: pkg.warnings as unknown as Prisma.InputJsonValue,
  } });
  await persistCompiledPackage(scan.id, pkg);
  return NextResponse.json({ ok: true, scanId: scan.id, packageId: pkg.packageId, reused: Boolean(existing) }, { status: existing ? 200 : 201 });
}

