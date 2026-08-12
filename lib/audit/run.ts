import type { Scope, Finding, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { completeJson, AUDIT_MODEL } from "@/lib/model";
import {
  buildAuditPrompt,
  type PromptEvidenceItem,
  type PromptExistingFinding,
} from "@/lib/audit/prompts/audit-v1";
import {
  normalizeAuditOutput,
  type NormalizedFinding,
  type NormalizedSignal,
  type NormalizedClarification,
  type ReasoningOrigin,
} from "@/lib/audit/normalize";
import type { EvidenceItem, PackageSourceManifestEntry } from "@/lib/context/package";

const KIND_LABELS: Record<string, string> = {
  transcript: "Transcript",
  notes: "Notes",
  estimates: "Estimates",
  spreadsheet: "Spreadsheet",
};
export const VALID_AUDIT_KINDS = Object.keys(KIND_LABELS);

// Durably records HOW a surviving Finding was produced (see
// docs/AUDIT-CALIBRATION.md) without a schema migration: prefixed onto
// the persisted rationale, one bracket tag, parseable but still readable
// as plain prose in FindingCard/the Decision Queue. "inferred from domain
// knowledge" must stay honestly distinguishable from "explicitly required
// by project evidence" even after this run's in-memory result is gone.
const ORIGIN_LABELS: Record<ReasoningOrigin, string> = {
  explicit: "explicit",
  cross_source: "cross-source",
  coverage: "coverage-gap",
  domain_inferred: "domain-inferred",
  predictive: "predictive",
};

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
// Finding provenance." `sources` (the package's source manifest) is
// optional and used only to surface each evidence item's observedAt to
// the model for freshness judgment -- never persisted, never required.
export interface PackageAuditContext {
  contextSnapshotId: string;
  evidence: EvidenceItem[];
  sources?: PackageSourceManifestEntry[];
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

// A proposed Finding that DID have valid provenance but was suppressed by
// a deterministic content guardrail before being persisted -- contradicted
// by a structured qualifier in its own cited evidence, or judged (by the
// model's own reconciliation field, or this run's within-batch check) to
// represent an obligation that already exists. Distinct from
// RejectedFinding (provenance failure) so the two reasons are never
// conflated in a diagnostic.
export interface SuppressedFinding {
  title: string;
  type: string;
  reason: string;
}

// A Finding that WAS persisted, but whose model-requested blocking=true
// did not survive the blocking-bar guardrail (missing/incomplete gate
// metadata, or a disqualifying qualifier) and was normalized to false.
export interface DowngradedBlocking {
  title: string;
  reason: string;
}

export interface AuditRunResult {
  // No Source row is created for a package-only audit run (nothing was
  // pasted) -- fabricating one just to satisfy an old required field would
  // misrepresent where the resulting Findings actually came from.
  source: Source | null;
  findings: Finding[];
  rejectedFindings: RejectedFinding[];
  suppressedFindings: SuppressedFinding[];
  downgradedBlocking: DowngradedBlocking[];
  // Non-persisted candidates -- see docs/AUDIT-CALIBRATION.md's promotion
  // ladder. Deliberately never touch prisma.finding: a "signal" is useful
  // intelligence that must not become forecast input, and a
  // "clarification" is uncertainty that must not be silently converted
  // into forecast reality just because the model wants more information.
  signals: NormalizedSignal[];
  clarifications: NormalizedClarification[];
}

function defaultSourceTitle(kind: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${KIND_LABELS[kind] ?? "Context"} — ${date}`;
}

// True when a candidate's own cited-evidence qualifiers directly
// contradict its core claim. Two distinct cases, both a hard suppression
// (the candidate never becomes a Finding at all -- never a softened
// version of itself):
// - A "missing_work" candidate whose cited evidence explicitly says
//   tracking already exists (explicitlyTicketed) -- direct contradiction
//   of "no ticket exists for this."
// - ANY candidate whose cited evidence explicitly disclaims relevance to
//   the PROJECT/SCOPE ITSELF being audited (explicitlyOutOfProjectScope,
//   e.g. "not needed for JSA" while auditing the JSA scope) -- this
//   candidate doesn't belong in this Scope's Findings at all, regardless
//   of type. Deliberately narrower than a release-boundary disclaimer
//   (explicitlyDeferred / explicitlyNotReleaseBlocker, e.g. "outside
//   Beta" while still being JSA-relevant work) -- see resolveBlocking,
//   which only downgrades blocking for those, since the underlying work
//   is still real and worth tracking non-blocking.
export function qualifierContradiction(f: NormalizedFinding): string | null {
  if (f.type === "missing_work" && f.qualifiers.explicitlyTicketed) {
    return "cited evidence explicitly states tracking/tickets already exist for this -- contradicts a missing-work claim";
  }
  if (f.qualifiers.explicitlyOutOfProjectScope) {
    return "cited evidence explicitly states this is not needed for / out of scope for the project being audited";
  }
  return null;
}

// The blocking bar: the model's own blockingRequested is never trusted
// directly. blocking=true survives only with fully-populated gate
// metadata (what can't complete, what release boundary, what evidence)
// AND no cited-evidence qualifier that disqualifies blocking specifically
// (explicitly deferred / explicitly not a release boundary). Everything
// else defaults to non-blocking -- serious, risky, and historically-
// blocking-sounding are not enough on their own.
export function resolveBlocking(f: NormalizedFinding): { blocking: boolean; downgradeReason: string | null } {
  if (!f.blockingRequested) return { blocking: false, downgradeReason: null };

  if (f.qualifiers.explicitlyDeferred) {
    return { blocking: false, downgradeReason: "cited evidence explicitly states this is deferred" };
  }
  if (f.qualifiers.explicitlyNotReleaseBlocker) {
    return { blocking: false, downgradeReason: "cited evidence explicitly states this is not a release blocker" };
  }
  if (!f.gate) {
    return {
      blocking: false,
      downgradeReason: "no complete gate (release boundary / dependency / evidence) was established",
    };
  }
  return { blocking: true, downgradeReason: null };
}

// Deterministic backstop against two candidates IN THE SAME BATCH
// representing the same underlying obligation, on top of the model's own
// per-candidate reconciliation.newObligation judgment. Deliberately
// narrow (exact type + exact non-empty matchedIssues set) to avoid
// suppressing genuinely distinct findings that happen to touch the same
// ticket.
export function withinBatchDuplicateKey(f: NormalizedFinding): string | null {
  if (f.matchedIssues.length === 0) return null;
  const normalized = [...new Set(f.matchedIssues.map((s) => s.trim().toUpperCase()))].sort();
  return `${f.type}::${normalized.join(",")}`;
}

// Runs one audit pass: pasted transcript/notes/spreadsheet text and/or
// accepted ProjectContextPackage evidence -> candidates -> findings,
// checked against this Scope's Linear issues and EVERY existing Finding
// (open and handled) so the same underlying obligation is never
// duplicated. Candidates that are useful but not (yet) actionable are
// returned as non-persisted signals/clarifications instead of being
// forced into Finding shape. At least one of `input` /
// `options.packageContext` is required. Used by POST /api/audit
// (transcript only) and POST /api/refresh (transcript and/or package).
// Throws on Linear or model failure -- callers convert to a 502.
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

  // Every existing Finding for this Scope, open AND handled -- v1 only
  // ever showed handled ones, which made duplicate detection against an
  // open Finding structurally impossible. See PromptExistingFinding.
  const existingFindingRows = await prisma.finding.findMany({
    where: { OR: [{ source: { scopeId: scope.id } }, { contextSnapshot: { scopeId: scope.id } }] },
    select: { title: true, type: true, status: true, blocking: true, matchedIssues: true, resolution: true },
  });
  const existingFindings: PromptExistingFinding[] = existingFindingRows;

  const sourceObservedAt = new Map(
    (options.packageContext?.sources ?? []).map((s) => [s.sourceRef, s.observedAt] as const)
  );
  const promptEvidence: PromptEvidenceItem[] = (options.packageContext?.evidence ?? []).map((e) => ({
    id: e.id,
    excerpt: e.excerpt,
    data: e.data,
    sourceRef: e.sourceRef,
    observedAt: sourceObservedAt.get(e.sourceRef) ?? null,
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
    existingFindings,
    contextKind: input?.kind ?? null,
    contextText: input?.content ?? null,
    packageEvidence: promptEvidence,
  });

  const complete = options.complete ?? completeJson;

  let rawOutput: unknown;
  try {
    // Dense inputs (a full spreadsheet dump, a long transcript, a large
    // package) can produce many candidates -- 16000 gives real headroom;
    // completeJson still surfaces a clear error if even that isn't enough.
    rawOutput = await complete({ prompt, maxTokens: 16000 });
  } catch (error) {
    throw new Error(`Audit model call failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let candidates;
  try {
    candidates = normalizeAuditOutput(rawOutput);
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
  const suppressedFindings: SuppressedFinding[] = [];
  const downgradedBlocking: DowngradedBlocking[] = [];
  const seenBatchKeys = new Set<string>();

  for (const f of candidates.findings) {
    const citedRefs = f.evidenceRefs.filter((ref) => validEvidenceIds.has(ref));

    // 1) Provenance: a Finding produced by a run with NO transcript
    // (source === null) MUST end up with at least one valid evidenceRef,
    // or it would persist with NO provenance at all. Never fabricate a
    // citation -- reject instead. A finding from a MIXED run always has
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

    // 2) Structured-qualifier contradiction: cited evidence directly
    // contradicts the candidate's core claim (e.g. "Tickets Created: y"
    // vs a missing-work claim, or "not needed for this scope" vs
    // promoting it into required delivery work). Full suppression, not a
    // softened Finding.
    const qualifierReason = qualifierContradiction(f);
    if (qualifierReason) {
      suppressedFindings.push({ title: f.title, type: f.type, reason: qualifierReason });
      continue;
    }

    // 3) Reconciliation: the model's own judgment that this is NOT a new
    // underlying obligation (already represented by an existing Linear
    // ticket or Finding). Defaults to "not new" if the model omitted the
    // judgment entirely (see normalize.ts) -- a missing judgment must
    // never default into "safe to persist."
    if (!f.reconciliation.newObligation) {
      const target = f.reconciliation.matchedExistingId ? ` (matches: ${f.reconciliation.matchedExistingId})` : "";
      suppressedFindings.push({
        title: f.title,
        type: f.type,
        reason: `not a new underlying obligation${target}${f.reconciliation.reason ? ` -- ${f.reconciliation.reason}` : ""}`,
      });
      continue;
    }

    // 4) Within-batch duplicate backstop, on top of the model's own
    // per-candidate reconciliation.
    const batchKey = withinBatchDuplicateKey(f);
    if (batchKey && seenBatchKeys.has(batchKey)) {
      suppressedFindings.push({
        title: f.title,
        type: f.type,
        reason: `duplicates another candidate in this same audit run (same type + matched issues: ${f.matchedIssues.join(", ")})`,
      });
      continue;
    }
    if (batchKey) seenBatchKeys.add(batchKey);

    // 5) Blocking bar: the model's requested blocking=true is honored
    // only with complete gate metadata and no disqualifying qualifier.
    const { blocking, downgradeReason } = resolveBlocking(f);
    if (f.blockingRequested && !blocking) {
      downgradedBlocking.push({ title: f.title, reason: downgradeReason ?? "blocking bar not met" });
    }

    // contextSnapshotId is set only when THIS finding actually cites
    // package evidence -- a finding grounded purely in the pasted
    // transcript stays sourceId-only even in a mixed run.
    const contextSnapshotId = citedRefs.length > 0 ? options.packageContext?.contextSnapshotId ?? null : null;

    const rationale = `[${ORIGIN_LABELS[f.reasoningOrigin]}] ${f.rationale}`;

    const created = await prisma.finding.create({
      data: {
        sourceId: source?.id ?? null,
        type: f.type,
        title: f.title,
        quote: f.quote,
        rationale,
        severity: f.severity,
        estimateHint: f.estimateHint,
        owner: f.owner,
        blocks: f.blocks,
        blocking,
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

  return {
    source,
    findings: createdFindings,
    rejectedFindings,
    suppressedFindings,
    downgradedBlocking,
    signals: candidates.signals,
    clarifications: candidates.clarifications,
  };
}
