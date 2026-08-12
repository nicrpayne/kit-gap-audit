import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAudit, VALID_AUDIT_KINDS, type AuditRunResult } from "@/lib/audit/run";
import { runEstimationForScope } from "@/lib/estimate/runForScope";
import { computeForecast } from "@/lib/forecast/compute";
import { generateReport } from "@/lib/reports/generate";
import {
  persistContextSnapshot,
  PackageIdentityConflictError,
  PackageScopeMismatchError,
  SourcePolicyViolationError,
} from "@/lib/context/snapshot";
import { PackageValidationError } from "@/lib/context/validate";

interface RefreshContextDoc {
  label: string;
  content: string;
}

interface RefreshTranscript {
  kind: string;
  title?: string;
  content: string;
}

interface RefreshBody {
  scopeId?: string;
  transcript?: RefreshTranscript;
  contextDocs?: RefreshContextDoc[];
  generateReport?: boolean;
  // Optional ProjectContextPackage v1 (see lib/context/package.ts). ADDITIVE:
  // a caller that omits this field gets exactly today's behavior. When
  // present, it's validated strictly, persisted as ONE ContextSnapshot at
  // this request boundary, and that same snapshot id is threaded through
  // to every consumer this refresh runs (audit, report) -- nothing
  // downstream persists a second snapshot for it.
  contextPackage?: unknown;
}

// Shapes runAudit()'s result for the API response -- additive fields only
// (findingCount/rejectedFindings existed before; suppressedFindings/
// downgradedBlocking/signals/clarifications are new in the calibration
// pass, see docs/AUDIT-CALIBRATION.md). Every existing caller that only
// reads sourceId/findingCount/rejectedFindings is unaffected.
function buildAuditResponse(result: AuditRunResult) {
  return {
    sourceId: result.source?.id ?? null,
    findingCount: result.findings.length,
    rejectedFindings: result.rejectedFindings,
    suppressedFindings: result.suppressedFindings,
    downgradedBlocking: result.downgradedBlocking,
    signals: result.signals,
    clarifications: result.clarifications,
  };
}

// One call to do everything a Hermes/Cowork-triggered refresh needs:
// push fresh scoped context, optionally accept a structured context
// package, optionally audit a new transcript and/or that package's
// evidence, re-run AI estimation, re-run the forecast, and optionally
// generate a leadership report -- the single "here's the context, work
// your magic" entrypoint, versus making an external caller sequence
// several API calls itself. Reuses the exact same pipeline every other
// route uses (runAudit, runEstimationForScope, computeForecast,
// generateReport), so a refresh triggered by Hermes always agrees with
// what a human sees on the pages.
//
// Context docs are ingested FIRST, before anything that touches Linear --
// so if Linear is unreachable, freshly pushed context still lands rather
// than being lost alongside the failed refresh. The context PACKAGE is
// accepted next, before audit, for the same reason: a rejected/conflicting
// package should be reported before spending an LLM call on an audit that
// wouldn't have the right evidence anyway.
export async function POST(req: NextRequest) {
  let body: RefreshBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  if (body.transcript !== undefined) {
    if (!body.transcript.content?.trim()) {
      return NextResponse.json({ error: "transcript.content is required" }, { status: 400 });
    }
    if (!VALID_AUDIT_KINDS.includes(body.transcript.kind)) {
      return NextResponse.json(
        { error: `transcript.kind must be one of: ${VALID_AUDIT_KINDS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (body.contextDocs !== undefined) {
    for (const doc of body.contextDocs) {
      if (!doc.label?.trim() || !doc.content?.trim()) {
        return NextResponse.json(
          { error: "each contextDocs entry needs a non-empty label and content" },
          { status: 400 }
        );
      }
    }
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const contextDocsUpdated: string[] = [];
  if (body.contextDocs) {
    for (const doc of body.contextDocs) {
      const label = doc.label.trim();
      const existing = await prisma.contextDoc.findFirst({
        where: { scopeId: scope.id, label },
        select: { id: true },
      });
      if (existing) {
        await prisma.contextDoc.update({ where: { id: existing.id }, data: { content: doc.content } });
      } else {
        await prisma.contextDoc.create({ data: { scopeId: scope.id, label, content: doc.content } });
      }
      contextDocsUpdated.push(label);
    }
  }

  // ONE ACCEPTED PACKAGE INSTANCE -> ONE CONTEXT SNAPSHOT. This is the
  // only place in this request that calls persistContextSnapshot() --
  // runAudit() and generateReport() below only ever receive the resulting
  // id, they never persist a snapshot themselves.
  let contextSnapshotId: string | null = null;
  let packageEvidence: Awaited<ReturnType<typeof persistContextSnapshot>>["package"]["evidence"] = [];
  let packageSources: Awaited<ReturnType<typeof persistContextSnapshot>>["package"]["sources"] = [];
  if (body.contextPackage !== undefined) {
    try {
      const snapshot = await persistContextSnapshot(body.contextPackage, { expectedScopeId: scope.id });
      contextSnapshotId = snapshot.id;
      packageEvidence = snapshot.package.evidence;
      packageSources = snapshot.package.sources;
    } catch (error) {
      if (
        error instanceof PackageScopeMismatchError ||
        error instanceof PackageValidationError ||
        error instanceof SourcePolicyViolationError
      ) {
        return NextResponse.json({ error: error.message, contextDocsUpdated }, { status: 400 });
      }
      if (error instanceof PackageIdentityConflictError) {
        return NextResponse.json({ error: error.message, contextDocsUpdated }, { status: 409 });
      }
      throw error;
    }
  }

  let audit: Awaited<ReturnType<typeof buildAuditResponse>> | undefined;
  if (body.transcript || contextSnapshotId) {
    try {
      const result = await runAudit(
        scope,
        body.transcript,
        contextSnapshotId
          ? { packageContext: { contextSnapshotId, evidence: packageEvidence, sources: packageSources } }
          : undefined
      );
      // rejectedFindings / suppressedFindings: proposed candidates the
      // model produced that this run refused to persist -- rejected for
      // missing provenance, suppressed by a content guardrail (qualifier
      // contradiction, reconciliation, within-batch duplicate). Surfaced
      // explicitly rather than silently dropped. signals/clarifications:
      // non-persisted intelligence that should never become forecast
      // input -- see docs/AUDIT-CALIBRATION.md.
      audit = buildAuditResponse(result);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Audit failed",
          contextDocsUpdated,
          contextSnapshotId,
        },
        { status: 502 }
      );
    }
  }

  let estimateSummary;
  try {
    estimateSummary = (await runEstimationForScope(scope)).summary;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Estimation failed",
        contextDocsUpdated,
        contextSnapshotId,
        audit,
      },
      { status: 502 }
    );
  }

  let forecastResult;
  try {
    forecastResult = await computeForecast(scope);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}`,
        contextDocsUpdated,
        contextSnapshotId,
        audit,
        estimate: estimateSummary,
      },
      { status: 502 }
    );
  }

  let report: { id: string; summaryMarkdown: string } | undefined;
  if (body.generateReport) {
    try {
      const generated = await generateReport(scope, contextSnapshotId);
      report = { id: generated.report.id, summaryMarkdown: generated.report.summaryMarkdown };
    } catch (error) {
      return NextResponse.json(
        {
          error: `Report generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
          contextDocsUpdated,
          contextSnapshotId,
          audit,
          estimate: estimateSummary,
          forecast: {
            likelyDate: forecastResult.likelyDate,
            confidenceAtTarget: forecastResult.confidenceAtTarget,
          },
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scopeId: scope.id,
    scopeName: scope.name,
    contextDocsUpdated,
    // Non-null only when body.contextPackage was accepted this request --
    // the same id is what audit-created Findings (contextSnapshotId) and
    // the generated Report (contextSnapshotId), if any, both point back to.
    contextSnapshotId,
    audit,
    estimate: estimateSummary,
    forecast: {
      likelyDate: forecastResult.likelyDate,
      earliestDate: forecastResult.earliestDate,
      latestDate: forecastResult.latestDate,
      confidenceAtTarget: forecastResult.confidenceAtTarget,
      breakdown: forecastResult.breakdown,
    },
    // False if a configured Notion/Figma source failed to load this run --
    // check this before trusting the numbers above from an unattended call.
    contextComplete: forecastResult.contextComplete,
    contextIssues: forecastResult.contextIssues,
    report,
  });
}
