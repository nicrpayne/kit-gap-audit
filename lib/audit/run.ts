import type { Scope, Finding, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { completeJson, AUDIT_MODEL } from "@/lib/model";
import { buildAuditPrompt, type PromptEvidenceItem } from "@/lib/audit/prompts/audit-v1";
import { normalizeFindings } from "@/lib/audit/normalize";
import type { EvidenceItem } from "@/lib/context/package";

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

// Package evidence attached to this audit run, when the caller (today:
// POST /api/refresh) has an accepted ProjectContextPackage. Findings this
// run produces that the model actually grounds in one of these items get
// contextSnapshotId + evidenceRefs set; findings grounded only in a
// pasted transcript do not, even in the same run -- see
// docs/CONTEXT-MODEL.md's "Source-backed vs ContextSnapshot-backed
// Finding provenance."
export interface PackageAuditContext {
  contextSnapshotId: string;
  evidence: EvidenceItem[];
}

export interface AuditRunOptions {
  packageContext?: PackageAuditContext;
  // Injectable, defaults to lib/model's completeJson -- same dependency-
  // injection pattern already used by lib/notion.ts/lib/figma.ts's
  // `fetcher` parameter, for deterministic testing without a live LLM call.
  complete?: typeof completeJson;
}

// A proposed Finding the model produced but this run refused to persist,
// because it would have had NO valid provenance at all: no pasted
// transcript behind it (source === null for this run) AND none of its
// cited evidenceRefs survived the safety-net intersection against real
// package evidence. Never fabricate a citation, never save an uncited
// package-only Finding -- surface it here instead so the caller can show
// a clear diagnostic rather than silently losing it.
export interface RejectedFinding {
  title: string;
  type: string;
  reason: string;
}

export interface AuditRunResult {
  // No Source row is created for a package-only audit run (nothing was
  // pasted) -- fabricating one just to satisfy an old required field would
  // misrepresent where the resulting Findings actually came from.
  source: Source | null;
  findings: Finding[];
  rejectedFindings: RejectedFinding[];
}

function defaultSourceTitle(kind: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${KIND_LABELS[kind] ?? "Context"} — ${date}`;
}

// Runs one audit pass: pasted transcript/notes/spreadsheet text and/or
// accepted ProjectContextPackage evidence -> findings, checked against
// this Scope's Linear issues and prior handled findings (both
// Source-backed and ContextSnapshot-backed) so the same gap isn't
// re-raised. At least one of `input` / `options.packageContext` is
// required. Used by POST /api/audit (transcript only, unchanged
// behavior) and POST /api/refresh (transcript and/or package). Throws on
// Linear or model failure -- callers convert to a 502.
export async function runAudit(
  scope: Scope,
  input: AuditInput | undefined,
  options: AuditRunOptions = {}
): Promise<AuditRunResult> {
  if (!input && !options.packageContext) {
    throw new Error("runAudit requires a transcript, package context, or both");
  }

  let issues;
  try {
    issues = await getScopedIssues(scope);
  } catch (error) {
    throw new Error(`Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const priorFindings = await prisma.finding.findMany({
    where: {
      status: { in: HANDLED_STATUSES },
      OR: [{ source: { scopeId: scope.id } }, { contextSnapshot: { scopeId: scope.id } }],
    },
    select: { title: true, status: true, resolution: true },
  });

  const promptEvidence: PromptEvidenceItem[] = (options.packageContext?.evidence ?? []).map((e) => ({
    id: e.id,
    excerpt: e.excerpt,
    data: e.data,
  }));

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
    contextKind: input?.kind ?? null,
    contextText: input?.content ?? null,
    packageEvidence: promptEvidence,
  });

  const complete = options.complete ?? completeJson;

  let rawFindings: unknown;
  try {
    // Dense inputs (a full spreadsheet dump, a long transcript, a large
    // package) can produce many findings -- 16000 gives real headroom;
    // completeJson still surfaces a clear error if even that isn't enough.
    rawFindings = await complete({ prompt, maxTokens: 16000 });
  } catch (error) {
    throw new Error(`Audit model call failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let findings;
  try {
    findings = normalizeFindings(rawFindings);
  } catch (error) {
    throw new Error(`Couldn't parse audit findings: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let source: Source | null = null;
  if (input) {
    source = await prisma.source.create({
      data: {
        kind: input.kind,
        title: input.title?.trim() || defaultSourceTitle(input.kind),
        content: input.content,
        scopeId: scope.id,
      },
    });
  }

  // Safety net: the model can only truthfully cite evidence ids it was
  // actually shown -- never trust a returned evidenceRefs entry blindly,
  // since a hallucinated id would be exactly the kind of broken
  // provenance pointer this system exists to prevent.
  const validEvidenceIds = new Set(options.packageContext?.evidence.map((e) => e.id) ?? []);

  const createdFindings: Finding[] = [];
  const rejectedFindings: RejectedFinding[] = [];

  for (const f of findings) {
    const citedRefs = f.evidenceRefs.filter((ref) => validEvidenceIds.has(ref));

    // Citation invariant: a Finding produced by a run with NO transcript
    // (source === null) MUST end up with at least one valid evidenceRef,
    // or it would persist with NO provenance at all -- neither a Source
    // nor a ContextSnapshot behind it. Never fabricate a citation to make
    // this pass; reject the proposed Finding instead and surface why. A
    // finding from a MIXED run (a transcript was also pasted) always has
    // sourceId set regardless, so this only ever bites a pure
    // package-only run.
    if (!source && citedRefs.length === 0) {
      rejectedFindings.push({
        title: f.title,
        type: f.type,
        reason:
          "no valid evidenceRefs and no pasted transcript for this audit run -- would have had no provenance at all",
      });
      continue;
    }

    // contextSnapshotId is set only when THIS finding actually cites
    // package evidence -- a finding grounded purely in the pasted
    // transcript stays sourceId-only even in a mixed run, so
    // "PACKAGE-DERIVED" (contextSnapshotId set, evidenceRefs non-empty)
    // stays a precise, checkable claim rather than "this run happened to
    // have a package attached."
    const contextSnapshotId = citedRefs.length > 0 ? options.packageContext?.contextSnapshotId ?? null : null;

    const created = await prisma.finding.create({
      data: {
        sourceId: source?.id ?? null,
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
        contextSnapshotId,
        evidenceRefs: citedRefs,
      },
    });
    createdFindings.push(created);
  }

  await prisma.auditRun.create({
    data: {
      sourceId: source?.id ?? null,
      contextSnapshotId: options.packageContext?.contextSnapshotId ?? null,
      issueCount: issues.length,
      findingCount: createdFindings.length,
      model: AUDIT_MODEL,
    },
  });

  return { source, findings: createdFindings, rejectedFindings };
}
