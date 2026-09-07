import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readBootstrap } from "@/lib/bootstrap/read";
import { normalizeSearchText } from "@/lib/audit/searchText";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readBootstrap(id);
  if (!result) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const data: Prisma.ProjectBootstrapUpdateInput = {};
  if (body.canonicalName !== undefined) {
    if (typeof body.canonicalName !== "string" || !body.canonicalName.trim()) {
      return NextResponse.json({ error: "Canonical project name cannot be empty" }, { status: 400 });
    }
    data.canonicalName = body.canonicalName.trim().slice(0, 160);
    data.normalizedName = normalizeSearchText(body.canonicalName);
  }
  if (body.aliases !== undefined) {
    if (!Array.isArray(body.aliases)) return NextResponse.json({ error: "aliases must be an array" }, { status: 400 });
    data.aliases = [...new Set(body.aliases.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, 20);
  }
  if (body.ownerHint !== undefined) data.ownerHint = typeof body.ownerHint === "string" && body.ownerHint.trim() ? body.ownerHint.trim().slice(0, 200) : null;
  if (body.sourceHints !== undefined) {
    if (!Array.isArray(body.sourceHints)) return NextResponse.json({ error: "sourceHints must be an array" }, { status: 400 });
    data.sourceHints = body.sourceHints.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 20) as Prisma.InputJsonValue;
  }
  const bootstrap = await prisma.projectBootstrap.update({ where: { id }, data }).catch(() => null);
  if (!bootstrap) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  return NextResponse.json({ bootstrap });
}
