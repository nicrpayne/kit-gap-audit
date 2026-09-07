import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/audit/searchText";

function cleanList(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, maximum);
}

export async function GET() {
  const bootstraps = await prisma.projectBootstrap.findMany({
    where: { status: { not: "archived" } }, orderBy: { updatedAt: "desc" },
    select: { id: true, canonicalName: true, aliases: true, status: true, updatedAt: true, reviewRevision: true },
  });
  return NextResponse.json({ bootstraps });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const canonicalName = typeof body.canonicalName === "string" ? body.canonicalName.trim() : "";
  if (!canonicalName) return NextResponse.json({ error: "Canonical project name is required" }, { status: 400 });
  if (canonicalName.length > 160) return NextResponse.json({ error: "Project name is too long" }, { status: 400 });
  const normalizedName = normalizeSearchText(canonicalName);
  const aliases = cleanList(body.aliases, 20).filter((a) => normalizeSearchText(a) !== normalizedName);
  const sourceHints = cleanList(body.sourceHints, 20);
  const ownerHint = typeof body.ownerHint === "string" && body.ownerHint.trim() ? body.ownerHint.trim().slice(0, 200) : null;
  const searchExistingKnowledge = body.searchExistingKnowledge !== false;
  const existing = await prisma.projectBootstrap.findFirst({
    where: { normalizedName, status: { not: "archived" } }, select: { id: true, canonicalName: true },
  });
  if (existing) {
    return NextResponse.json({ error: `A bootstrap identity named “${existing.canonicalName}” already exists.`, bootstrapId: existing.id }, { status: 409 });
  }
  const bootstrap = await prisma.projectBootstrap.create({ data: {
    canonicalName, normalizedName, aliases, ownerHint, sourceHints: sourceHints as Prisma.InputJsonValue,
    searchExistingKnowledge, status: "draft",
  } });
  return NextResponse.json({ bootstrap }, { status: 201 });
}
