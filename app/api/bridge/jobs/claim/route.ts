import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimNextJob, safeCompanionId } from "@/lib/bootstrap/jobs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 4_096) return NextResponse.json({ error: "Claim body too large" }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
  const companionId = safeCompanionId(body?.companionId);
  const versions = Array.isArray(body?.supportedPackageVersions) ? body.supportedPackageVersions : [];
  if (!companionId || !versions.includes("1.1")) return NextResponse.json({ error: "Companion must support package version 1.1" }, { status: 400 });
  const companion = await prisma.bootstrapCompanion.findUnique({ where: { id: companionId } });
  if (!companion || companion.state === "paused") return NextResponse.json({ error: "Companion heartbeat required" }, { status: 409 });
  const job = await claimNextJob(companionId);
  if (!job) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ job });
}
