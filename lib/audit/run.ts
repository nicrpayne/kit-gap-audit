import type { Scope, Finding, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { completeJson, AUDIT_MODEL } from "@/lib/model";
import { buildAuditPrompt } from "@/lib/audit/prompts/audit-v1";
import { normalizeFindings } from "@/lib/audit/normalize";

const HANDLED_STATUSES = ["dismissed", "ticketed", "resolved"];

// Purely descriptive -- shown to the model as "(C) NEW CONTEXT (<kind>):"
// so it knows what shape of text follows, stored on Source.kind for
// display, and used for the auto-generated title if none is given.
// Nothing branches on the value beyond that.
const KIND_LABELS: Record<string, string> = {
  transcript: "Transcript",
  notes: "Notes",
  estimates: "Estimates",
  spreadsheet: "Spreadsheet",
};
export const VALID_AUDIT_KINDS = Object.keys(KIND_LABELS);

export interface AuditInput {
  kind: string;
  title?: string | null;
  content: string;
}

export interface AuditRunResult {
  source: Source;
  findings: Finding[];
}

function defaultSourceTitle(kind: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${KIND_LABELS[kind] ?? "Context"} — ${date}`;
}

// Runs one audit pass: transcript/notes text -> findings, checked against
// this Scope's Linear issues and prior handled findings so the same gap
// isn't re-raised. Used by POST /api/audit and POST /api/refresh. Throws
// on Linear or model failure -- callers convert to a 502.
export async function runAudit(scope: Scope, input: AuditInput): Promise<AuditRunResult> {
  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    throw new Error(`Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}`);
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
    contextKind: input.kind,
    contextText: input.content,
  });

  let rawFindings: unknown;
  try {
    // Dense inputs (a full spreadsheet dump, a long transcript) can produce
    // many findings -- 8000 was tight enough to truncate mid-response on a
    // ~40-row spreadsheet paste. 16000 gives real headroom; completeJson
    // still surfaces a clear error if even that isn't enough.
    rawFindings = await completeJson({ prompt, maxTokens: 16000 });
  } catch (error) {
    throw new Error(`Audit model call failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let findings;
  try {
    findings = normalizeFindings(rawFindings);
  } catch (error) {
    throw new Error(`Couldn't parse audit findings: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const source = await prisma.source.create({
    data: {
      kind: input.kind,
      title: input.title?.trim() || defaultSourceTitle(input.kind),
      content: input.content,
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

  return { source, findings: createdFindings };
}
