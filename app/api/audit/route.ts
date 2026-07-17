import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { completeJson, AUDIT_MODEL } from "@/lib/model";
import { buildAuditPrompt } from "@/lib/audit/prompts/audit-v1";
import { normalizeFindings } from "@/lib/audit/normalize";

const HANDLED_STATUSES = ["dismissed", "ticketed", "resolved"];
const VALID_KINDS = ["transcript", "notes", "estimates"];

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
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be transcript, notes, or estimates" }, { status: 400 });
  }
  if (!scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const priorFindings = await prisma.finding.findMany({
    where: { status: { in: HANDLED_STATUSES }, source: { scopeId: scope.id } },
    select: { title: true, status: true, resolution: true },
  });

  const prompt = buildAuditPrompt({
    issues: issues.map((issue) => ({
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      state: issue.state,
      estimate: issue.estimate,
      assignee: issue.assignee,
      labels: issue.labels,
    })),
    priorFindings,
    contextKind: kind,
    contextText: content,
  });

  let rawFindings: unknown;
  try {
    rawFindings = await completeJson({ prompt, maxTokens: 8000 });
  } catch (error) {
    return NextResponse.json(
      { error: `Audit model call failed: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  let findings;
  try {
    findings = normalizeFindings(rawFindings);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't parse audit findings: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const source = await prisma.source.create({
    data: {
      kind,
      title: title?.trim() || defaultSourceTitle(kind),
      content,
      scopeId: scope.id,
    },
  });

  const createdFindings = await Promise.all(
    findings.map((f) =>
      prisma.finding.create({
        data: {
          sourceId: source.id,
          type: f.type,
          title: f.title,
          quote: f.quote,
          rationale: f.rationale,
          severity: f.severity,
          estimateHint: f.estimateHint,
          owner: f.owner,
          blocks: f.blocks,
          blocking: f.blocking,
          matchedIssues: f.matchedIssues,
        },
      })
    )
  );

  await prisma.auditRun.create({
    data: {
      sourceId: source.id,
      issueCount: issues.length,
      findingCount: createdFindings.length,
      model: AUDIT_MODEL,
    },
  });

  return NextResponse.json({ source, findings: createdFindings });
}

function defaultSourceTitle(kind: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const label = kind === "transcript" ? "Transcript" : kind === "notes" ? "Notes" : "Estimates";
  return `${label} — ${date}`;
}
