import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Pasted/uploaded context (spreadsheet exports, notes) with no live API to
// sync from -- same role as a Notion doc in the estimator context. GET
// lists a Scope's docs; POST adds one (or replaces an existing one by id,
// so re-pasting an updated sheet is a single call from the UI).
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }
  const docs = await prisma.contextDoc.findMany({
    where: { scopeId },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, content: true, createdAt: true },
  });
  return NextResponse.json({
    docs: docs.map((d) => ({ ...d, chars: d.content.length })),
  });
}

export async function POST(req: NextRequest) {
  let body: { scopeId?: string; label?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { scopeId, label, content } = body;
  if (!scopeId || !label?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "scopeId, label, and content are required" }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const doc = await prisma.contextDoc.create({
    data: { scopeId, label: label.trim(), content },
  });
  return NextResponse.json({ doc: { ...doc, chars: doc.content.length } });
}
