import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAudit, VALID_AUDIT_KINDS } from "@/lib/audit/run";

export async function POST(req: NextRequest) {
  let body: { content?: string; kind?: string; title?: string; scopeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, kind, title, scopeId } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!kind || !VALID_AUDIT_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${VALID_AUDIT_KINDS.join(", ")}` }, { status: 400 });
  }
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  try {
    const { source, findings } = await runAudit(scope, { kind, title, content });
    return NextResponse.json({ source, findings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit failed" },
      { status: 502 }
    );
  }
}
